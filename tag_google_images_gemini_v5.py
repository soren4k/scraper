#!/usr/bin/env python3
"""
tag_google_images_gemini.py (v5 - loads full taxonomy)

1. Reads a manifest CSV (e.g., architect_google_metadata.csv) which MUST
   contain a 'local_path' column with the full path to each image file.
2. **Loads the full tag taxonomy from tag_taxonomy.json.**
3. If TEST_RUN is True, processes only the first TEST_RUN_LIMIT images.
4. In parallel, sends each selected image specified by 'local_path' to the
   specified Google Gemini vision model.
5. **The prompt now includes the full list of allowed tags from the taxonomy file.**
6. Saves a new CSV <manifest_basename>_with_tags_gemini.csv (or _TEST if test run)
   in the same directory as the input manifest, adding a 'tags' column.

Requires: pip install google-generativeai pandas tqdm Pillow tenacity google-api-core
Set API Key: export GOOGLE_API_KEY='YOUR_API_KEY'

python3 tag_wikimedia_final.py \
    --manifest "/Volumes/SOREN256/wikimedia_database/images_manifest_cleaned.csv" \
    --taxonomy "/Volumes/SOREN256/wikimedia_database/tag_taxonomy.json" \
    --workers 12
"""

import os
import json
import argparse
import mimetypes # For determining image MIME type
import time # For retry delay
import sys # For exiting on error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold, GenerateContentResponse
# Import exceptions from google-api-core for retry logic
from google.api_core import exceptions as google_exceptions
from PIL import Image, UnidentifiedImageError # For image loading and format detection
from tqdm import tqdm
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# --- Configuration ---

# <<< --- TEST RUN FLAG --- >>>
TEST_RUN = False # Set to True for a small test run first
TEST_RUN_LIMIT = 10
# <<< --------------------- >>>

# Define base path for Google database (used for default paths)
GOOGLE_DB_BASE_PATH = "/Volumes/SOREN256/google_database"
TAG_TAXONOMY_FILENAME = "tag_taxonomy.json" # Assumed filename

# Generation config for Gemini Tagging
TAGGING_GENERATION_CONFIG = {
    "temperature": 0.1,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 2048,
    "response_mime_type": "application/json", # Request JSON output directly
}

# Safety settings
DEFAULT_SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
}

# Define exceptions from google.api_core that trigger retries
RETRYABLE_EXCEPTIONS = (
    google_exceptions.InternalServerError,  # For 500 errors
    google_exceptions.ResourceExhausted,    # For 429 rate limit errors
    google_exceptions.ServiceUnavailable,   # For 503 errors
    google_exceptions.DeadlineExceeded,     # For timeout errors
)

# --- Core Functions ---

def load_and_extract_tags(taxonomy_path: Path) -> list[str]:
    """Loads the JSON taxonomy and extracts a flat list of all tag strings."""
    if not taxonomy_path.is_file():
        print(f"Error: Tag taxonomy file not found at {taxonomy_path}")
        sys.exit(1) # Exit if taxonomy is missing

    all_tags = set() # Use a set to avoid duplicates initially
    try:
        with open(taxonomy_path, 'r', encoding='utf-8') as f:
            taxonomy_data = json.load(f)

        # Recursively extract tags from nested dictionary/list structure
        def extract_recursive(data):
            if isinstance(data, dict):
                for key, value in data.items():
                    extract_recursive(value)
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        all_tags.add(item)
                    else: # Handle potential nested structures within lists
                         extract_recursive(item)

        extract_recursive(taxonomy_data)
        print(f"Successfully loaded {len(all_tags)} unique tags from {taxonomy_path.name}")
        return sorted(list(all_tags)) # Return sorted list

    except json.JSONDecodeError as e:
        print(f"Error: Could not decode JSON from {taxonomy_path.name}: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading or processing taxonomy file {taxonomy_path.name}: {e}")
        sys.exit(1)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
    reraise=True
)
def call_gemini_api_with_retries(model_name: str, prompt_parts: list) -> GenerateContentResponse:
    """Calls the Gemini API with retry logic for transient errors."""
    try:
        model = genai.GenerativeModel(
            model_name=model_name,
            generation_config=TAGGING_GENERATION_CONFIG, # Use tagging config
            safety_settings=DEFAULT_SAFETY_SETTINGS
        )
        response = model.generate_content(prompt_parts)
        return response
    except Exception as e:
        # print(f"API Call Attempt Error during retry: {type(e).__name__} - {e}") # Can be noisy
        raise

def extract_json_array(text: str) -> list | None:
    """Attempts to extract a JSON array (list) from a string."""
    try:
        start_index = text.find('[')
        end_index = text.rfind(']')
        if start_index != -1 and end_index != -1 and end_index >= start_index:
            json_str = text[start_index : end_index + 1]
            parsed_json = json.loads(json_str)
            if isinstance(parsed_json, list):
                return parsed_json
        else: # Fallback
            cleaned_text = text.strip().strip('`').strip()
            if cleaned_text.startswith("json"): cleaned_text = cleaned_text[4:].strip()
            if cleaned_text.startswith('[') and cleaned_text.endswith(']'):
                 parsed_json = json.loads(cleaned_text)
                 if isinstance(parsed_json, list): return parsed_json
        return None
    except json.JSONDecodeError: return None
    except Exception as e:
        print(f"Warning: Unexpected error during JSON extraction: {type(e).__name__} from text: {text[:100]}...")
        return None

def worker(idx: int, image_local_path: str | None, prompt_text: str, model_name: str) -> dict:
    """Worker function executed by each thread for tagging."""
    out = {"idx": idx, "tags": []} # Default empty tags

    # Check if the provided path is valid before proceeding
    path_is_valid = isinstance(image_local_path, str) and image_local_path.strip() != '' and not pd.isna(image_local_path)
    if not path_is_valid:
        # Path from input CSV was invalid/empty
        # print(f"\nWarning index {idx}: Invalid or empty local_path received: '{image_local_path}'. Skipping.") # Can be noisy
        return out

    img_path = Path(image_local_path)
    if not img_path.is_file():
        # File specified in manifest doesn't exist
        # print(f"\nWarning index {idx}: File not found at path: {img_path}. Assigning empty tags.") # Can be noisy
        return out

    try:
        # --- Image Loading & API Call ---
        img = Image.open(img_path); img.load()
        mime_type = Image.MIME.get(img.format) or mimetypes.guess_type(img_path)[0]
        if not mime_type or not mime_type.startswith('image/'):
             print(f"\nWarning index {idx}: Invalid MIME type for {img_path}. Assigning empty tags.")
             return out
        img_bytes = img_path.read_bytes()
        prompt_parts = [prompt_text, {"mime_type": mime_type, "data": img_bytes}]
        response = call_gemini_api_with_retries(model_name, prompt_parts)

        # --- Process Response ---
        tags = []
        if response.candidates:
            cand = response.candidates[0]
            try:
                # Try structured JSON first
                if cand.content and cand.content.parts and hasattr(cand.content.parts[0], 'json') and isinstance(cand.content.parts[0].json, list):
                    tags = cand.content.parts[0].json
                # Fallback to parsing text
                elif cand.content and cand.content.parts and hasattr(cand.content.parts[0], 'text'):
                    tags = extract_json_array(cand.content.parts[0].text) or []
                elif hasattr(response, 'text'):
                     tags = extract_json_array(response.text) or []
            except Exception as e:
                 print(f"\nError index {idx}: Processing content failed: {type(e).__name__}. Assigning empty tags.")
        else:
             reason = response.prompt_feedback.block_reason if response.prompt_feedback else "Unknown"
             print(f"\nAPI Error index {idx}: No candidates. Reason: {reason}. Assigning empty tags.")
        out["tags"] = tags
    except (FileNotFoundError, UnidentifiedImageError, PermissionError, google_exceptions.GoogleAPICallError, Exception) as e:
        print(f"\nWorker Error index {idx} (Path: {img_path}): {type(e).__name__} - {e}. Assigning empty tags.")
        out["tags"] = []
    if 'tags' not in out: out['tags'] = []
    return out

# --- Main Execution ---
def main():
    """Main function."""
    p = argparse.ArgumentParser(
        description="Tag Google architectural images using Gemini API and full taxonomy.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    # Default manifest path for Google DB
    p.add_argument("--manifest", default=f"{GOOGLE_DB_BASE_PATH}/architect_google_metadata.csv",
                   help="Full path to the input manifest CSV file")
    # Add taxonomy argument
    p.add_argument("--taxonomy", default=f"{GOOGLE_DB_BASE_PATH}/{TAG_TAXONOMY_FILENAME}",
                   help="Path to the tag_taxonomy.json file")
    p.add_argument("--model", default="gemini-1.5-flash-latest", help="Gemini model name")
    p.add_argument("--workers", type=int, default=12, help="Parallel threads") # Defaulting to 12
    args = p.parse_args()

    # --- Configure API ---
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key: p.error("Error: GOOGLE_API_KEY environment variable not set.")
    try: genai.configure(api_key=api_key); print("Google AI SDK configured successfully.")
    except Exception as e: p.error(f"Error configuring Google AI SDK: {e}")

    # --- Prepare Paths ---
    manifest_path = Path(args.manifest)
    taxonomy_path = Path(args.taxonomy) # Use path from argument
    if not manifest_path.is_file(): p.error(f"Manifest file not found: {manifest_path}")
    db_root = manifest_path.parent # Output goes in the same directory
    print(f"Using database root directory: {db_root}")

    # --- Load Taxonomy ---
    allowed_tags_list = load_and_extract_tags(taxonomy_path)
    if not allowed_tags_list:
         print("Error: No tags extracted from taxonomy. Exiting.")
         sys.exit(1)
    allowed_tags_json_string = json.dumps(allowed_tags_list)

    # --- Load Data ---
    print(f"Loading manifest from: {manifest_path}")
    try:
        df_full = pd.read_csv(manifest_path)
        if "local_path" not in df_full.columns: p.error("Manifest CSV must contain 'local_path'.")
        # Ensure path column is read as string, replacing NaN
        df_full['local_path'] = df_full['local_path'].fillna('').astype(str)
    except Exception as e: p.error(f"Error reading manifest CSV: {type(e).__name__} - {e}")

    # --- Apply Test Run Limit ---
    if TEST_RUN: print(f"\n--- TEST RUN ENABLED: Processing first {TEST_RUN_LIMIT} images ---"); df = df_full.head(TEST_RUN_LIMIT).copy()
    else: df = df_full.copy()
    df["tags"] = [[] for _ in range(len(df))] # Initialize 'tags' column
    print(f"Loaded {len(df_full)} rows from manifest. Processing {len(df)} rows.")
    if len(df) == 0: print("No rows to process. Exiting."); return

    # --- Build Prompt with Full Taxonomy ---
    prompt_text = f"""Analyze the provided architectural image. Your task is to identify all relevant visual features and assign tags **ONLY** from the official list provided below.

**Official Allowed Tags List (JSON Array Format):**
{allowed_tags_json_string}

**Instructions:**
1.  Examine the image carefully.
2.  Identify all architectural features, styles, materials, contexts, etc., that are clearly visible.
3.  Select the corresponding tags **EXACTLY** as they appear in the Official Allowed Tags List above.
4.  Respond with **ONLY** a valid JSON array (a Python list) containing the strings of the selected tags from the official list. Example: `["Concrete", "Window", "Modernist", "Urban", "Daytime"]`

**Strict Output Requirements:**
- Only use tags present in the provided Official Allowed Tags List. Do not invent new tags, use synonyms, or change capitalization/punctuation.
- The output **must** be **ONLY** the JSON array.
- Do **NOT** include any explanations, commentary, confidence scores, or markdown formatting (like ```json ... ```).
- If no tags from the official list apply to the image, return an empty JSON array: `[]`.

Adherence to these rules and the provided tag list is critical.
"""

    # --- Parallel Tagging ---
    print(f"Starting image tagging for {len(df)} images with {args.workers} workers using model {args.model}...")
    results_map = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor, tqdm(total=len(df), desc="Tagging Images", unit="image") as pbar:
        futures_map = {
            executor.submit(
                worker, idx, row["local_path"], prompt_text, args.model
            ): idx for idx, row in df.iterrows()
        }
        for future in as_completed(futures_map):
            original_idx = futures_map[future]
            try:
                result = future.result()
                if result and 'idx' in result: results_map[original_idx] = result.get("tags", [])
                else: pbar.write(f"Warning: Invalid result idx {original_idx}. Assigning empty tags."); results_map[original_idx] = []
            except Exception as e: pbar.write(f"Error processing idx {original_idx}: {type(e).__name__}. Assigning empty tags."); results_map[original_idx] = []
            finally: pbar.update(1)

    # --- Update DataFrame ---
    print("\nUpdating DataFrame with tags...")
    processed_indices = list(results_map.keys())
    tags_series = pd.Series(results_map, name='tags')
    df['tags'] = tags_series
    df['tags'] = df['tags'].apply(lambda x: x if isinstance(x, list) else [])
    print(f"Processed results for {len(processed_indices)}/{len(df)} rows.")

    # --- Write Output ---
    base_name = manifest_path.stem # e.g., "architect_google_metadata"
    suffix = "_TEST" if TEST_RUN else ""
    # Keep original output filename convention for Google script
    out_filename = f"{base_name}_with_tags_gemini{suffix}.csv"
    out_path = db_root / out_filename
    print(f"\nWriting tagged data to: {out_path}")
    try:
        # Select columns to save - keep original plus new tags
        cols_to_save = list(df_full.columns)
        if 'tags' not in cols_to_save: cols_to_save.append('tags')
        final_cols = [col for col in cols_to_save if col != 'tags'] + ['tags']
        final_cols = [col for col in final_cols if col in df.columns] # Ensure columns exist in df slice
        df_out = df[final_cols].copy();

        df_out['tags'] = df_out['tags'].apply(lambda x: json.dumps(x) if isinstance(x, list) else json.dumps([]))
        if 'local_path' in df_out.columns: # Ensure path column saved correctly
             df_out['local_path'] = df_out['local_path'].fillna('').astype(str)

        df_out.to_csv(out_path, index=False, encoding='utf-8')
        print(f"✅ Successfully wrote {len(df_out)} rows to {out_path}")
    except Exception as e: print(f"\nError writing CSV: {type(e).__name__} - {e}")

if __name__ == "__main__":
    main()

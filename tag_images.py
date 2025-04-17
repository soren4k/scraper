#!/usr/bin/env python3
"""
tag_images.py

Walks through wikimedia_database/images_manifest.csv, finds each image
under wikimedia_database/<Architect_Folder>/, sends it to OpenAI Vision
with your taxonomy, and writes back images_manifest_with_tags.csv with
a new `tags` column.

Usage:
  export OPENAI_API_KEY="sk-…"
  python tag_images.py \
    --drive /Volumes/SOREN256 \
    --db    wikimedia_database \
    --manifest images_manifest.csv \
    --taxonomy tag_taxonomy.json
"""

import os
import json
import base64
import argparse

import pandas as pd
import openai
from tqdm import tqdm

def load_taxonomy(path):
    with open(path, 'r') as f:
        return json.load(f)

def get_tags_for_image(image_path: str, system_prompt: str, model: str):
    with open(image_path, "rb") as img_file:
        img_b64 = base64.b64encode(img_file.read()).decode()

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": "Assign all applicable tags from the taxonomy above.",
            "image": {"data": img_b64, "mime": "image/png"}
        }
    ]
    resp = openai.ChatCompletion.create(
        model=model,
        messages=messages,
        temperature=0.0
    )
    return json.loads(resp.choices[0].message["content"])

def find_image_file(db_root, architect, file_title):
    # Folder is architect with spaces → underscores
    folder = architect.replace(" ", "_")
    arch_path = os.path.join(db_root, folder)

    # Two filename candidates: raw, and stripped of "File:" prefix
    candidates = [file_title]
    if file_title.startswith("File:"):
        candidates.append(file_title.split(":", 1)[1])

    for name in candidates:
        path = os.path.join(arch_path, name)
        if os.path.isfile(path):
            return path
    return None

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--drive",    required=True,
                   help="Root path of your USB (e.g. /Volumes/SOREN256 or E:\\)")
    p.add_argument("--db",       required=True,
                   help="Project folder under the drive, e.g. wikimedia_database")
    p.add_argument("--manifest", required=True,
                   help="CSV filename in the db folder, e.g. images_manifest.csv")
    p.add_argument("--taxonomy", required=True,
                   help="JSON taxonomy filename in the db folder, e.g. tag_taxonomy.json")
    p.add_argument("--model",    default="gpt-4o-mini",
                   help="Vision-enabled model to use")
    args = p.parse_args()

    # 1. Init
    openai.api_key = os.getenv("OPENAI_API_KEY")
    if not openai.api_key:
        p.error("Please set OPENAI_API_KEY in your environment")

    db_root     = os.path.join(args.drive, args.db)
    manifest_fp = os.path.join(db_root, args.manifest)
    taxonomy_fp = os.path.join(db_root, args.taxonomy)
    output_fp   = manifest_fp.replace(".csv", "_with_tags.csv")

    df       = pd.read_csv(manifest_fp)
    taxonomy = load_taxonomy(taxonomy_fp)

    # Ensure a tags column exists
    if "tags" not in df.columns:
        df["tags"] = [[] for _ in range(len(df))]

    # Bake the system prompt
    system_prompt = (
        "You are an architectural‑image tagging assistant.\n"
        "Here is the complete hierarchical taxonomy of allowed tags:\n"
        f"{json.dumps(taxonomy)}\n\n"
        "When I send you an image, reply with a JSON array of the exact tags that apply."
    )

    # 2. Loop & tag
    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Tagging images"):
        if isinstance(row["tags"], list) and row["tags"]:
            continue  # skip if already done

        arch       = row["architect"]
        file_title = row["file_title"]

        img_path = find_image_file(db_root, arch, file_title)
        if not img_path:
            print(f"⚠️  Missing file for {arch} / {file_title}")
            df.at[idx, "tags"] = []
            continue

        try:
            tags = get_tags_for_image(img_path, system_prompt, args.model)
        except Exception as e:
            print(f"❌ Error on {arch}/{file_title}: {e}")
            tags = []

        df.at[idx, "tags"] = tags

    # 3. Write back
    df.to_csv(output_fp, index=False)
    print(f"\n✅ All done! Tagged CSV written to:\n   {output_fp}")

if __name__ == "__main__":
    main()

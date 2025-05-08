import google.generativeai as genai
from PIL import Image

# Load your Gemini API key
genai.configure(api_key="your-api-key")

image_path = "/Users/keshav/Documents/GitHub/scraper/bing_database/Richard_Rogers/2be47867f0031d6397a19de7a3aeda70.jpg"

# Load image
image = Image.open(image_path)

# Create model
model = genai.GenerativeModel("gemini-1.5-flash")

prompt = """
You are an architectural AI assistant. Please look at the building in this image and return the following information in a comma-separated format:

Building Name, Architect Name, Basic Description, Building Name Confidence Score, Architect Name Confidence Score


The Architect Name should be the name of the architect (e.g., "Zaha Hadid", "Mies van der Rohe", "Frank Lloyd Wright", etc.)
The basic description should be short (<=2 words), describing the type of scene (e.g., "hallway", "skyscraper", "dome", "corridor", etc.)
The confidence scores should indicate your confidence in your classification of the building name and the architect's name, on a scale of 0 to 1 (e.g., "0.95", "0.85", etc.)
The scores should be rounded to 2 decimal places.
If you are completely unsure about the building name or architect name, please return "unsure" for that field.

Only return a single line in this exact format. Do not include explanations or extra text.
"""

# Run a prompt
response = model.generate_content(
    [image, prompt]
)

print(response.text.strip() + ' , ' + image_path)
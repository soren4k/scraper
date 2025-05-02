#!/usr/bin/env python3
import os
import time
import csv
import hashlib
import requests
from urllib.parse import urlparse, unquote

# ————————————————
# QUICK TEST MODE
# ————————————————
TEST_RUN = False  # one query per architect when True

# ————————————————
# OPTIONAL: 24 h HTTP response cache
# ————————————————
try:
    import requests_cache
    requests_cache.install_cache('google_cache', expire_after=86400)
    print("✅ HTTP response caching enabled (24 h)")
except ImportError:
    print("⚠️ requests_cache not installed; responses won’t be cached")

# ————————————————
# CONFIGURATION
# ————————————————
BASE_DIR         = "/Volumes/SOREN256/google_database"
API_URL          = "https://customsearch.googleapis.com/customsearch/v1"
API_KEY          = os.getenv("GOOGLE_API_KEY")
SEARCH_ENGINE_ID = os.getenv("GOOGLE_CX")
METADATA_CSV     = "/Volumes/SOREN256/architect_google_metadata.csv"

if not API_KEY or not SEARCH_ENGINE_ID:
    raise RuntimeError("🚨 Please set GOOGLE_API_KEY and GOOGLE_CX in your environment.")

# Now only two keywords: building and interior
OR_TERMS = "building,interior"

ARCHITECTS_LIST = [
    "Frank Lloyd Wright","Le Corbusier","Ludwig Mies van der Rohe",
    "Walter Gropius","Zaha Hadid","Renzo Piano","I.M. Pei",
    "Frank Gehry","Norman Foster","Rem Koolhaas","Oscar Niemeyer",
    "Tadao Ando","Herzog & de Meuron","Santiago Calatrava",
    "Bjarke Ingels","Shigeru Ban","Daniel Libeskind","Arata Isozaki",
    "Toyo Ito","David Chipperfield","Philip Johnson","Louis Kahn",
    "Eero Saarinen","Richard Rogers","Charles Correa","Moshe Safdie",
    "Cesar Pelli","Mario Botta","Kazuyo Sejima","Kengo Kuma",
    "Alejandro Aravena","Steven Holl","Fumihiko Maki","Enric Miralles",
    "Álvaro Siza Vieira","Odile Decq","Bernard Tschumi","Jeanne Gang",
    "Glenn Murcutt","Richard Meier","Jean Nouvel","Ken Yeang",
    "Michael Graves","Thom Mayne","David Adjaye","Sou Fujimoto",
    "Peter Zumthor","Rafael Viñoly","Luis Barragán","Paul Rudolph",
    "Marcel Breuer","Kenzo Tange"
]

VALID_EXTENSIONS = ('.jpg', '.jpeg', '.png')


# ————————————————
# UTILITIES
# ————————————————
def robust_get(url, params=None, max_retries=3):
    for attempt in range(1, max_retries+1):
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 400:
            print(f"❌ 400 Bad Request: {resp.url}")
            return None
        if resp.status_code == 429:
            reset = int(resp.headers.get("X-RateLimit-Reset", 60)) + 1
            print(f"⚠️ Rate limit; sleeping {reset}s")
            time.sleep(reset)
            continue
        try:
            resp.raise_for_status()
            return resp
        except Exception as e:
            print(f"[{attempt}/{max_retries}] API error: {e}; retrying in 5s")
            time.sleep(5)
    return None


def search_google_images(architect, start_index=1):
    params = {
        "key":        API_KEY,
        "cx":         SEARCH_ENGINE_ID,
        "searchType": "image",
        "q":           architect,
        "exactTerms":  architect,
        "orTerms":     OR_TERMS,
        "fileType":    "jpg",
        "imgSize":     "xxlarge",
        "imgType":     "photo",
        "rights":      "cc_publicdomain,cc_attribute,cc_sharealike",
        "safe":        "active",
        "num":         10,
        "start":       start_index
    }
    resp = robust_get(API_URL, params=params)
    if not resp:
        return [], None
    data = resp.json()
    items = data.get("items", [])
    next_pages = data.get("queries", {}).get("nextPage", [])
    next_start = next_pages[0]["startIndex"] if next_pages else None
    return items, next_start


def download_image_once(url, dest_folder):
    try:
        resp = requests.get(url, timeout=20)
        if resp.status_code != 200:
            print(f"⚠️ Skipping {url}: HTTP {resp.status_code}")
            return None
    except requests.RequestException as e:
        print(f"⚠️ Failed to fetch {url}: {e}")
        return None

    raw = unquote(os.path.basename(urlparse(url).path))
    name, ext = os.path.splitext(raw)
    if ext.lower() not in VALID_EXTENSIONS:
        return None

    # Truncate long names + add MD5 suffix
    if len(name) > 50:
        h = hashlib.md5(raw.encode()).hexdigest()[:8]
        name = name[:50] + "_" + h
    filename = name + ext

    path = os.path.join(dest_folder, filename)
    try:
        with open(path, "wb") as f:
            f.write(resp.content)
        return path
    except OSError as e:
        print(f"⚠️ OSError writing {path}: {e}")
        return None


def create_arch_folder(architect):
    folder = os.path.join(BASE_DIR, architect.replace(" ", "_"))
    os.makedirs(folder, exist_ok=True)
    return folder


# ————————————————
# MAIN
# ————————————————
def main():
    os.makedirs(BASE_DIR, exist_ok=True)

    with open(METADATA_CSV, "w", newline="", encoding="utf-8") as csvf:
        writer = csv.DictWriter(csvf, fieldnames=[
            "architect", "image_url", "width", "height", "local_path"
        ])
        writer.writeheader()

        for architect in ARCHITECTS_LIST:
            print(f"\n=== Architect: {architect} ===")
            arch_folder = create_arch_folder(architect)
            start = 1

            while start:
                items, next_start = search_google_images(architect, start)
                if not items:
                    break

                for item in items:
                    url   = item.get("link")
                    img   = item.get("image", {})
                    w, h  = img.get("width"), img.get("height")
                    local = download_image_once(url, arch_folder)
                    if local:
                        writer.writerow({
                            "architect":  architect,
                            "image_url":  url,
                            "width":      w or "",
                            "height":     h or "",
                            "local_path": local
                        })
                        print(f"✔️  saved {os.path.basename(local)} ({w}×{h})")
                    else:
                        print(f"✖️  skipped {url}")

                    time.sleep(1)

                if TEST_RUN:
                    break

                start = next_start
                time.sleep(2)

    print(f"\n🎉 Done! Metadata: {METADATA_CSV}, Images: {BASE_DIR}/")


if __name__ == "__main__":
    main()

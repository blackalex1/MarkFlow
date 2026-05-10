import os
import requests
from core.config import BASE_DIR

import hashlib
import base64

VENDOR_DIR = os.path.join(BASE_DIR, "static", "vendor")

# (URL, Local relative path from static/vendor, Expected Hash)
# We use SHA-384 hashes for consistency with SRI
LIBRARIES = [
    ("https://unpkg.com/lucide@0.475.0/dist/umd/lucide.min.js", "js/lucide.min.js", "sha384-prOTt12iGU6/k2uoXJ3az4BWS2qoxykgxJb6pjfmRK7MYOMnMe7bWWBMPZqxwVks"),
    ("https://unpkg.com/lucide@0.475.0/dist/umd/lucide.min.js.map", "js/lucide.min.js.map", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js", "js/highlight.min.js", "sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp"),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css", "css/github-dark.min.css", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css", "css/github.min.css", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/scala.min.js", "js/languages/scala.min.js", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js", "js/languages/sql.min.js", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/java.min.js", "js/languages/java.min.js", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/r.min.js", "js/languages/r.min.js", None),
    ("https://cdn.jsdelivr.net/npm/marked/marked.min.js", "js/marked.min.js", "sha384-948ahk4ZmxYVYOc+rxN1H2gM1EJ2Duhp7uHtZ4WSLkV4Vtx5MUqnV+l7u9B+jFv+"),
    ("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.5/purify.min.js", "js/purify.min.js", "sha384-rneZSW/1QE+3/U5/u+/7eRNi/tRc+SzS+yXy36fltr1tDN9EHaVo1Bwz2Z8o8DA4"),
    ("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.5/purify.min.js.map", "js/purify.min.js.map", None),
    ("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js", "js/mermaid.min.js", "sha384-enVdc7lTHDGtpROV85t9+VqPC2EyyB0hsRD0MrvQnHUsHmTHIz2D8SPP4EnBkstH"),

    ("https://unpkg.com/easymde/dist/easymde.min.js", "js/easymde.min.js", None),
    ("https://unpkg.com/easymde/dist/easymde.min.css", "css/easymde.min.css", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js", "js/katex.min.js", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css", "css/katex.min.css", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js", "js/auto-render.min.js", None),
    
    # KaTeX Fonts
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Regular.woff2", "css/fonts/KaTeX_Main-Regular.woff2", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Bold.woff2", "css/fonts/KaTeX_Main-Bold.woff2", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-Italic.woff2", "css/fonts/KaTeX_Math-Italic.woff2", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size1-Regular.woff2", "css/fonts/KaTeX_Size1-Regular.woff2", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size2-Regular.woff2", "css/fonts/KaTeX_Size2-Regular.woff2", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size3-Regular.woff2", "css/fonts/KaTeX_Size3-Regular.woff2", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size4-Regular.woff2", "css/fonts/KaTeX_Size4-Regular.woff2", None),
    
    # Missing fonts reported by user
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-BoldItalic.woff2", "css/fonts/KaTeX_Math-BoldItalic.woff2", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-BoldItalic.woff", "css/fonts/KaTeX_Math-BoldItalic.woff", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-BoldItalic.ttf", "css/fonts/KaTeX_Math-BoldItalic.ttf", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Regular.woff2", "css/fonts/KaTeX_Caligraphic-Regular.woff2", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Regular.woff", "css/fonts/KaTeX_Caligraphic-Regular.woff", None),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Regular.ttf", "css/fonts/KaTeX_Caligraphic-Regular.ttf", None),
    
    # FontAwesome 4.7.0 (for EasyMDE)
    ("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css", "css/font-awesome.min.css", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff2", "fonts/fontawesome-webfont.woff2", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff", "fonts/fontawesome-webfont.woff", None),
    ("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.ttf", "fonts/fontawesome-webfont.ttf", None),
]

def check_and_download_vendor_libs():
    """Checks if vendor libraries exist, downloads them if missing with integrity verification."""
    print("Checking vendor libraries...")
    
    for url, rel_path, expected_hash in LIBRARIES:
        target_path = os.path.join(VENDOR_DIR, rel_path)
        
        if not os.path.exists(target_path):
            print(f"Downloading {rel_path}...")
            try:
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                response = requests.get(url, timeout=30, allow_redirects=True, verify=True)
                response.raise_for_status()
                
                content = response.content
                if len(content) < 100:
                    raise Exception("Downloaded file is too small, possible corruption")

                # Verify Hash if provided
                if expected_hash:
                    algo, hash_val = expected_hash.split("-")
                    digest = hashlib.new(algo, content).digest()
                    actual_hash = base64.b64encode(digest).decode()
                    if actual_hash != hash_val:
                        raise Exception(f"Integrity check failed for {rel_path}. Expected {hash_val}, got {actual_hash}")
                    print(f" Integrity verified for {rel_path}")

                with open(target_path, "wb") as f:
                    f.write(content)
            except Exception as e:
                print(f"Failed to download {rel_path}: {e}")

    print("Vendor libraries check complete.")

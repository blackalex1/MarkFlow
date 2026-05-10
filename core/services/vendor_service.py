import os
import requests
from core.config import BASE_DIR

VENDOR_DIR = os.path.join(BASE_DIR, "static", "vendor")

# (URL, Local relative path from static/vendor)
LIBRARIES = [
    ("https://unpkg.com/lucide@0.475.0/dist/umd/lucide.min.js", "js/lucide.min.js"),
    ("https://unpkg.com/lucide@0.475.0/dist/umd/lucide.min.js.map", "js/lucide.min.js.map"),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js", "js/highlight.min.js"),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css", "css/github-dark.min.css"),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css", "css/github.min.css"),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/scala.min.js", "js/languages/scala.min.js"),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js", "js/languages/sql.min.js"),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/java.min.js", "js/languages/java.min.js"),
    ("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/r.min.js", "js/languages/r.min.js"),
    ("https://cdn.jsdelivr.net/npm/marked/marked.min.js", "js/marked.min.js"),
    ("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.5/purify.min.js", "js/purify.min.js"),
    ("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.5/purify.min.js.map", "js/purify.min.js.map"),
    ("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js", "js/mermaid.min.js"),

    ("https://unpkg.com/easymde/dist/easymde.min.js", "js/easymde.min.js"),
    ("https://unpkg.com/easymde/dist/easymde.min.css", "css/easymde.min.css"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js", "js/katex.min.js"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css", "css/katex.min.css"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js", "js/auto-render.min.js"),
    
    # KaTeX Fonts
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Regular.woff2", "css/fonts/KaTeX_Main-Regular.woff2"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Main-Bold.woff2", "css/fonts/KaTeX_Main-Bold.woff2"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-Italic.woff2", "css/fonts/KaTeX_Math-Italic.woff2"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size1-Regular.woff2", "css/fonts/KaTeX_Size1-Regular.woff2"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size2-Regular.woff2", "css/fonts/KaTeX_Size2-Regular.woff2"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size3-Regular.woff2", "css/fonts/KaTeX_Size3-Regular.woff2"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Size4-Regular.woff2", "css/fonts/KaTeX_Size4-Regular.woff2"),
    
    # Missing fonts reported by user
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-BoldItalic.woff2", "css/fonts/KaTeX_Math-BoldItalic.woff2"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-BoldItalic.woff", "css/fonts/KaTeX_Math-BoldItalic.woff"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Math-BoldItalic.ttf", "css/fonts/KaTeX_Math-BoldItalic.ttf"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Regular.woff2", "css/fonts/KaTeX_Caligraphic-Regular.woff2"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Regular.woff", "css/fonts/KaTeX_Caligraphic-Regular.woff"),
    ("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/KaTeX_Caligraphic-Regular.ttf", "css/fonts/KaTeX_Caligraphic-Regular.ttf"),
    
    # FontAwesome 4.7.0 (for EasyMDE)
    ("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css", "css/font-awesome.min.css"),
    ("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff2", "fonts/fontawesome-webfont.woff2"),
    ("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff", "fonts/fontawesome-webfont.woff"),
    ("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.ttf", "fonts/fontawesome-webfont.ttf"),
]

def check_and_download_vendor_libs():
    """Checks if vendor libraries exist, downloads them if missing."""
    print("Checking vendor libraries...")
    
    for url, rel_path in LIBRARIES:
        target_path = os.path.join(VENDOR_DIR, rel_path)
        
        if not os.path.exists(target_path):
            print(f"Downloading {rel_path}...")
            try:
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                response = requests.get(url, timeout=30, allow_redirects=True, verify=True)
                response.raise_for_status()
                # Basic integrity: check if file is not suspiciously small
                if len(response.content) < 100:
                    raise Exception("Downloaded file is too small, possible corruption")
                with open(target_path, "wb") as f:
                    f.write(response.content)
            except Exception as e:
                print(f"Failed to download {rel_path}: {e}")

    print("Vendor libraries check complete.")

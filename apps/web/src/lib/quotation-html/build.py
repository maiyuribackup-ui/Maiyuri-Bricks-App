"""
Build the self-contained quotation HTML.

template.html holds DATA / CONTENT / DESIGN and references assets by name.
This step inlines the artwork and the display face as data URIs so the result
is one file that opens and prints correctly anywhere — no asset folder to lose,
no webfont request at print time.

    python build.py           -> dist/quotation.html

Regenerate after changing the template or the artwork.
"""

import base64
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(HERE, "..", "pdf")
ART = os.path.join(PDF_DIR, "art")
FONTS = os.path.join(PDF_DIR, "fonts")
DIST = os.path.join(HERE, "dist")


def data_uri(path: str, mime: str) -> str:
    with open(path, "rb") as fh:
        return f"data:{mime};base64," + base64.b64encode(fh.read()).decode()


def build_mark() -> str:
    """The monogram, sized for the header rather than the 550KB master."""
    from PIL import Image

    src = os.path.join(HERE, "..", "..", "..", "public", "brand", "maiyuri-mark.png")
    im = Image.open(src).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    w, h = im.size
    im = im.resize((260, round(260 * h / w)), Image.LANCZOS)
    q = im.quantize(colors=200, method=Image.FASTOCTREE)
    buf = io.BytesIO()
    q.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> None:
    with open(os.path.join(HERE, "template.html"), encoding="utf-8") as fh:
        html = fh.read()

    assets = {name: os.path.join(ART, f"{name}.png") for name in
              ("corner", "temple", "skyline", "feather", "divider-leaf",
               "divider-knot", "house", "page-frame", "lockup", "lockup-wide",
               "truck", "mascot-welcome", "mascot-brick", "advance-banner")}

    used = []
    for name, path in assets.items():
        token = "{{ASSET:%s}}" % name
        if token in html:
            html = html.replace(token, data_uri(path, "image/png"))
            used.append((name, os.path.getsize(path) / 1024))

    if "{{ASSET:mark}}" in html:
        html = html.replace("{{ASSET:mark}}", build_mark())
        used.append(("mark", 0))

    # Embed the display face. The sans falls back to the reader's system UI
    # font, which is deliberate: it keeps the file about 700KB lighter and the
    # sans only ever sets small supporting text.
    faces = [
        ("Playfair Display", 400, "normal", "PlayfairDisplay-Regular.ttf"),
        ("Playfair Display", 700, "normal", "PlayfairDisplay-Bold.ttf"),
        ("Playfair Display", 400, "italic", "PlayfairDisplay-Italic.ttf"),
        # Tamil has no glyphs in Playfair; the cover line needs its own face.
        ("Noto Serif Tamil", 400, "normal", "NotoSerifTamil-Regular.ttf"),
    ]
    css = []
    for family, weight, style, fname in faces:
        uri = data_uri(os.path.join(FONTS, fname), "font/ttf")
        css.append(
            f"@font-face{{font-family:'{family}';font-weight:{weight};"
            f"font-style:{style};font-display:block;src:url({uri}) format('truetype');}}"
        )
    html = html.replace("<style>", "<style>\n" + "\n".join(css), 1)

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "quotation.html")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)

    print("assets inlined:")
    for name, kb in used:
        print(f"  {name:14} {kb:7.1f} KB" if kb else f"  {name:14}   (resized)")
    print(f"\nwrote {out}  ({os.path.getsize(out)/1024:.0f} KB)")


if __name__ == "__main__":
    main()

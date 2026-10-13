from __future__ import annotations

from pathlib import Path
from textwrap import wrap

from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
PACKS = ROOT / "art" / "packs"
SOURCE = PACKS / "preview.html"
OUTPUT = PACKS / "showcase-30-packs.pdf"
SIZE = (1200, 2000)  # 6 × 10 in at 200 dpi
BG = (16, 19, 22)
CARD = (23, 29, 33)
LINE = (53, 67, 73)
TEXT = (237, 244, 242)
MUTED = (158, 173, 174)
ACCENT = (142, 231, 194)
FONT_DIR = Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size=size)


def clean_text(value: str) -> str:
    if "Ã" in value or "â€" in value:
        try:
            return value.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return value


def draw_wrapped(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], fnt, color, width: int, spacing: int = 9) -> int:
    x, y = xy
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=fnt)[2] > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=color)
        y += fnt.size + spacing
    return y


def make_cover() -> Image.Image:
    page = Image.new("RGB", SIZE, BG)
    draw = ImageDraw.Draw(page)
    draw.rounded_rectangle((64, 64, 1136, 1936), radius=42, fill=(20, 27, 30), outline=LINE, width=2)
    draw.text((104, 500), "TRIBOS · SOBREVIVÊNCIA PÓS-LABAREDA", font=font("arialbd.ttf", 28), fill=ACCENT)
    draw.text((100, 590), "30 packs", font=font("arialbd.ttf", 88), fill=TEXT)
    draw.text((104, 695), "visuais", font=font("arialbd.ttf", 88), fill=TEXT)
    intro = "Exploração de linguagem visual para personagens, criaturas e mundo de um planeta transformado pela tempestade solar."
    draw_wrapped(draw, intro, (104, 860), font("arial.ttf", 34), MUTED, 920, 16)
    draw.line((104, 1110, 1096, 1110), fill=LINE, width=3)
    draw.text((104, 1170), "30 direções gráficas", font=font("arialbd.ttf", 36), fill=ACCENT)
    draw.text((104, 1230), "120 assets · árvore · arma", font=font("arial.ttf", 31), fill=TEXT)
    draw.text((104, 1280), "protagonista · inimigo", font=font("arial.ttf", 31), fill=TEXT)
    draw.text((104, 1860), "Pranchas de conceito · 2026", font=font("arial.ttf", 24), fill=MUTED)
    return page


def make_pack(index: int, section) -> Image.Image:
    page = Image.new("RGB", SIZE, BG)
    draw = ImageDraw.Draw(page)
    draw.rounded_rectangle((36, 36, 1164, 1964), radius=30, fill=CARD, outline=LINE, width=2)

    title = clean_text(section.select_one("h2").get_text(" ", strip=True))
    description = clean_text(section.select_one(".pack-head p").get_text(" ", strip=True))
    draw.rounded_rectangle((72, 72, 164, 164), radius=20, fill=ACCENT)
    draw.text((88, 91), f"{index:02}", font=font("arialbd.ttf", 39), fill=(16, 32, 27))
    draw.text((190, 78), title, font=font("arialbd.ttf", 43), fill=TEXT)
    draw_wrapped(draw, description, (192, 136), font("arial.ttf", 22), MUTED, 900, 5)

    figures = section.select("figure")
    slots = [(72, 330), (612, 330), (72, 1120), (612, 1120)]
    for figure, (x, y) in zip(figures, slots):
        image_tag = figure.select_one("img")
        asset_path = (PACKS / image_tag["src"]).resolve()
        caption = clean_text(figure.select_one("figcaption").get_text(" ", strip=True))
        draw.rounded_rectangle((x, y, x + 516, y + 708), radius=18, fill=(17, 22, 25), outline=LINE, width=2)
        with Image.open(asset_path) as source:
            asset = source.convert("RGBA")
            asset.thumbnail((484, 638), Image.Resampling.LANCZOS)
            px = x + (516 - asset.width) // 2
            py = y + (638 - asset.height) // 2 + 8
            page.paste(asset, (px, py), asset)
        draw.text((x + 18, y + 654), caption, font=font("arialbd.ttf", 25), fill=TEXT)

    draw.text((72, 1880), "TRIBOS · pack conceitual", font=font("arial.ttf", 21), fill=MUTED)
    draw.text((1000, 1880), f"{index:02} / 30", font=font("arialbd.ttf", 21), fill=ACCENT)
    return page


def main() -> None:
    soup = BeautifulSoup(SOURCE.read_text(encoding="utf-8"), "html.parser")
    sections = soup.select("section.pack")
    if len(sections) != 30:
        raise SystemExit(f"Esperados 30 packs no HTML; encontrados {len(sections)}")
    pages = [make_cover()]
    expected_images = 0
    for index, section in enumerate(sections, start=1):
        figures = section.select("figure")
        if len(figures) != 4:
            raise SystemExit(f"Pack {index:02} tem {len(figures)} assets; esperados 4")
        for figure in figures:
            asset = (PACKS / figure.select_one("img")["src"]).resolve()
            if not asset.is_file():
                raise SystemExit(f"Asset ausente: {asset}")
            expected_images += 1
        pages.append(make_pack(index, section))
    pages[0].save(
        OUTPUT,
        "PDF",
        save_all=True,
        append_images=pages[1:],
        resolution=200,
        quality=96,
        title="TRIBOS — 30 packs visuais",
        author="TRIBOS",
    )
    print(f"PDF={OUTPUT}\nPAGES={len(pages)}\nPACKS={len(sections)}\nASSETS={expected_images}")


if __name__ == "__main__":
    main()

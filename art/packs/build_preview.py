from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).parent
data = json.loads((ROOT / "packs.json").read_text(encoding="utf-8"))
labels = {"tree": "Árvore", "weapon": "Arma", "hero": "Personagem principal", "enemy": "Inimigo"}

for pack in data["packs"]:
    folder = ROOT / pack["id"]
    sheet_path = folder / "sheet.png"
    if not sheet_path.exists():
        raise FileNotFoundError(sheet_path)
    image = Image.open(sheet_path).convert("RGBA")
    w, h = image.size
    boxes = {
        "tree": (0, 0, w // 2, h // 2),
        "weapon": (w // 2, 0, w, h // 2),
        "hero": (0, h // 2, w // 2, h),
        "enemy": (w // 2, h // 2, w, h),
    }
    for name, box in boxes.items():
        image.crop(box).save(folder / f"{name}.png")

cards = []
for pack in data["packs"]:
    folder = pack["id"]
    assets = "".join(
        f'<figure><div class="asset"><img src="{folder}/{name}.png" alt="{labels[name]} — {pack["name"]}" loading="lazy"></div><figcaption>{labels[name]}</figcaption></figure>'
        for name in ("tree", "weapon", "hero", "enemy")
    )
    cards.append(f'''<section class="pack" id="{folder}">
      <div class="pack-head"><span class="index">{pack["id"].split("-", 1)[0]}</span><div><h2>{pack["name"]}</h2><p>{pack["style"]}</p></div></div>
      <div class="assets">{assets}</div>
    </section>''')

html = f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TRIBOS — 10 visual packs</title>
<style>
:root{{color-scheme:dark;--bg:#101316;--card:#181d21;--line:#303a40;--text:#edf4f2;--muted:#9eadae;--accent:#8ee7c2}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 50% -10%,#26363a,var(--bg) 42%);color:var(--text);font:15px/1.45 system-ui,sans-serif}}main{{max-width:1500px;margin:auto;padding:48px 24px 80px}}header{{max-width:900px;margin-bottom:34px}}h1{{font-size:clamp(32px,5vw,64px);line-height:1;margin:0 0 14px;letter-spacing:-.05em}}h2{{margin:0;font-size:25px}}p{{color:var(--muted);margin:7px 0 0}}.intro{{font-size:17px;max-width:780px}}.pack{{background:linear-gradient(145deg,#1b2327,#14191c);border:1px solid var(--line);border-radius:20px;margin:20px 0;padding:22px;box-shadow:0 16px 44px #0003}}.pack-head{{display:flex;gap:15px;align-items:flex-start;margin-bottom:18px}}.index{{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:var(--accent);color:#10201b;font-weight:800;font-size:18px;flex:none}}.assets{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}}figure{{margin:0}}.asset{{aspect-ratio:1;background:radial-gradient(circle,#2b3638,#111619 72%);border:1px solid #354349;border-radius:14px;display:grid;place-items:center;overflow:hidden}}img{{width:100%;height:100%;object-fit:contain}}figcaption{{color:var(--muted);font-size:13px;margin:8px 2px 0}}.footer{{margin-top:35px;color:var(--muted);font-size:13px}}@media(max-width:760px){{main{{padding:28px 14px}}.assets{{grid-template-columns:repeat(2,1fr)}}.pack{{padding:15px}}}}
</style></head><body><main><header><h1>TRIBOS / visual packs</h1><p class="intro">10 direções gráficas para escolher linguagem visual do mundo pós-labareda solar. Cada pack mantém coerência interna e contém quatro assets isolados: árvore, arma, personagem principal e inimigo.</p></header>{''.join(cards)}<div class="footer">Assets gerados como pranchas 2×2 e recortados em PNG RGBA. Fonte: art/packs/&lt;pack&gt;/sheet.png.</div></main></body></html>'''
(ROOT / "preview.html").write_text(html, encoding="utf-8")
print(f"built {len(data['packs'])} packs, {len(data['packs']) * 4} cropped assets")

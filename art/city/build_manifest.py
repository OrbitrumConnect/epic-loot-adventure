#!/usr/bin/env python
"""Gera art/city/manifest.json a partir de buildings.json.

Cada construção tem 20 níveis. Os níveis são gerados em sprite sheets 2x2
(4 níveis por imagem, uma sheet por era), então são 5 sheets por construção.
O manifesto lista o prompt exato de cada sheet e o arquivo final de cada nível.

Uso: python art/city/build_manifest.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"]
LEVELS_PER_SHEET = 4


def sheet_prompt(data, building, era, levels):
    parts = ", ".join(
        f"{POSITIONS[i]} level {lvl} ({building['levels'][lvl - 1]})"
        for i, lvl in enumerate(levels)
    )
    ref = (
        ""
        if levels[0] == 1
        else " The attached image shows the previous four levels of this same building:"
        " keep the same art style, palette, camera angle and scale, and make these four"
        " levels a clear continuation, each visibly bigger and richer than the last attached one."
    )
    return (
        "Game asset sprite sheet, 1024x1024, a 2x2 grid of four isometric buildings, each"
        " centered in its own equal quadrant with clear empty margin, no overlap between quadrants."
        f" Subject: {building['subject']}, for a primal tribal survival strategy game, shown at"
        f" four consecutive upgrade levels in reading order: {parts}."
        f" Main materials of this era: {era['materials']}."
        " Every level must be visibly larger and more elaborate than the previous one."
        f"{ref} {data['style']} {data['background']} Generate exactly ONE image."
    )


def main():
    with open(os.path.join(HERE, "buildings.json"), encoding="utf-8") as f:
        data = json.load(f)

    sheets = []
    for b in data["buildings"]:
        assert len(b["levels"]) == 20, b["id"]
        for era_idx, era in enumerate(data["eras"]):
            first = era["levels"][0]
            levels = list(range(first, first + LEVELS_PER_SHEET))
            sheet_id = f"{b['id']}_s{era_idx + 1}"
            sheets.append({
                "id": sheet_id,
                "building": b["id"],
                "era": era["id"],
                "levels": levels,
                "sheet": f"art/city/sheets/{sheet_id}.png",
                "ref": None if era_idx == 0 else f"art/city/sheets/{b['id']}_s{era_idx}.png",
                "sprites": [
                    f"public/assets/city/buildings/{b['id']}/lvl-{lvl:02d}.webp" for lvl in levels
                ],
                "prompt": sheet_prompt(data, b, era, levels),
            })

    manifest = {
        "model": "gpt-5.6-luna",
        "effort": "medium",
        "size": "1024x1024",
        "total_sheets": len(sheets),
        "total_sprites": sum(len(s["sprites"]) for s in sheets),
        "sheets": sheets,
    }
    out = os.path.join(HERE, "manifest.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{out}: {manifest['total_sheets']} sheets, {manifest['total_sprites']} sprites")


if __name__ == "__main__":
    main()

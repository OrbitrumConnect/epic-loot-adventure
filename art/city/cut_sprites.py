#!/usr/bin/env python
"""Corta as sprite sheets 2x2 em um sprite por nível, com fundo transparente.

Para cada sheet do manifesto que existir em art/city/sheets/:
  1. remove o fundo magenta (chroma key por distância de cor + despill);
     sheets que o Codex já devolveu com alpha têm o alpha normalizado
  2. separa os 4 quadrantes pelas faixas vazias mais próximas do centro
  3. recorta no conteúdo, centraliza num quadrado e reduz para SIZE px
  4. salva em public/assets/city/buildings/<id>/lvl-NN.webp

Uso: python art/city/cut_sprites.py [--size 384] [--force]
Dependências: Pillow + numpy.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
KEY = np.array([255.0, 0.0, 255.0])


def to_rgba_cutout(im):
    """Devolve array float RGBA (0-255) com fundo removido."""
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    if (alpha < 8).mean() > 0.2:
        # fundo já removido pelo gerador: alpha do sujeito vem abaixo de 255, normaliza
        top = np.percentile(alpha[alpha > 8], 60)
        alpha = np.clip((alpha - 24) / max(top - 24, 1), 0, 1) * 255
    else:
        dist = np.sqrt(((rgb - KEY) ** 2).sum(-1))
        alpha = np.clip((dist - 70) / 70, 0, 1) * 255
    # despill: magenta = R e B altos com G baixo; limita R/B pelo G nas bordas
    spill = (alpha < 250) | ((rgb[..., 0] > rgb[..., 1] * 1.6) & (rgb[..., 2] > rgb[..., 1] * 1.6))
    lim = rgb[..., 1] * 1.25 + 20
    rgb[..., 2] = np.where(spill, np.minimum(rgb[..., 2], lim), rgb[..., 2])
    rgb[..., 0] = np.where(spill & (rgb[..., 2] >= lim - 1), np.minimum(rgb[..., 0], lim + 60), rgb[..., 0])
    out = np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    # come 1px de borda para tirar o halo restante
    a_ch = img.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    img.putalpha(a_ch)
    return img


def split_point(occupied):
    """Índice de corte: centro da faixa vazia mais próxima do meio; senão o meio."""
    n = len(occupied)
    mid = n // 2
    empty = np.where(~occupied)[0]
    empty = empty[(empty > n * 0.3) & (empty < n * 0.7)]
    if len(empty) == 0:
        # sem faixa vazia: corta na linha menos ocupada da região central
        return None
    runs, start, prev = [], empty[0], empty[0]
    for v in empty[1:]:
        if v != prev + 1:
            runs.append((start, prev))
            start = v
        prev = v
    runs.append((start, prev))
    best = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - mid))
    return (best[0] + best[1]) // 2


def quadrants(img):
    alpha = np.asarray(img.getchannel("A"))
    solid = alpha > 40
    h, w = solid.shape
    cy = split_point(solid.sum(1) > 0)
    if cy is None:
        band = solid.sum(1)[int(h * 0.3):int(h * 0.7)]
        cy = int(h * 0.3) + int(band.argmin())
    cuts = []
    for y0, y1 in ((0, cy), (cy, h)):
        row = solid[y0:y1]
        cx = split_point(row.sum(0) > 0)
        if cx is None:
            band = row.sum(0)[int(w * 0.3):int(w * 0.7)]
            cx = int(w * 0.3) + int(band.argmin())
        cuts += [(0, y0, cx, y1), (cx, y0, w, y1)]
    return [img.crop(c) for c in cuts]


def fit_square(img, size, pad=0.04):
    alpha = np.asarray(img.getchannel("A"))
    ys, xs = np.where(alpha > 40)
    if len(xs) == 0:
        return None
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(img.size) * (1 + pad * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    # ancora na base: o chão do sprite fica sempre na mesma linha do tile
    canvas.paste(img, ((side - img.width) // 2, side - img.height - int(side * pad)))
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=384)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    with open(os.path.join(HERE, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)

    done = missing = bad = 0
    for sheet in manifest["sheets"]:
        src = os.path.join(ROOT, sheet["sheet"])
        if not os.path.exists(src):
            missing += 1
            continue
        outs = [os.path.join(ROOT, p) for p in sheet["sprites"]]
        if not args.force and all(os.path.exists(o) for o in outs):
            done += len(outs)
            continue
        parts = quadrants(to_rgba_cutout(Image.open(src)))
        for part, out in zip(parts, outs):
            sprite = fit_square(part, args.size)
            if sprite is None:
                print(f"VAZIO: {sheet['id']} -> {out}")
                bad += 1
                continue
            os.makedirs(os.path.dirname(out), exist_ok=True)
            sprite.save(out, "WEBP", quality=90, method=6)
            done += 1
    print(f"sprites prontos: {done} · sheets faltando: {missing} · quadrantes vazios: {bad}")


if __name__ == "__main__":
    main()

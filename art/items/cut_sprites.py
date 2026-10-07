#!/usr/bin/env python
"""Recorta as sheets 2x2 de itens em um sprite por item, com fundo transparente.

Cada sheet vira 4 PNGs quadrados em `public/assets/items/<id>.webp`.
Reaproveita a mesma técnica de `art/city/cut_sprites.py`: chroma key por
distância de cor, despill, corte pelas faixas vazias, recorte no conteúdo.

Uso: python art/items/cut_sprites.py [--size 256] [--force]
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT_DIR = os.path.join(ROOT, 'public', 'assets', 'items')
KEY = np.array([255.0, 0.0, 255.0])


def to_rgba_cutout(im):
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    if (alpha < 8).mean() > 0.2:
        top = np.percentile(alpha[alpha > 8], 60)
        alpha = np.clip((alpha - 24) / max(top - 24, 1), 0, 1) * 255
    else:
        dist = np.sqrt(((rgb - KEY) ** 2).sum(-1))
        alpha = np.clip((dist - 70) / 70, 0, 1) * 255
    spill = (alpha < 250) | ((rgb[..., 0] > rgb[..., 1] * 1.6) & (rgb[..., 2] > rgb[..., 1] * 1.6))
    lim = rgb[..., 1] * 1.25 + 20
    rgb[..., 2] = np.where(spill, np.minimum(rgb[..., 2], lim), rgb[..., 2])
    rgb[..., 0] = np.where(spill & (rgb[..., 2] >= lim - 1), np.minimum(rgb[..., 0], lim + 60), rgb[..., 0])
    img = Image.fromarray(np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8), 'RGBA')
    ch = img.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    img.putalpha(ch)
    return img


def split_point(occupied):
    n = len(occupied)
    empty = np.where(~occupied)[0]
    empty = empty[(empty > n * 0.3) & (empty < n * 0.7)]
    if len(empty) == 0:
        return None
    runs, start, prev = [], empty[0], empty[0]
    for v in empty[1:]:
        if v != prev + 1:
            runs.append((start, prev))
            start = v
        prev = v
    runs.append((start, prev))
    best = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - n // 2))
    return (best[0] + best[1]) // 2


def quadrants(img):
    solid = np.asarray(img.getchannel('A')) > 40
    h, w = solid.shape
    cy = split_point(solid.sum(1) > 0)
    if cy is None:
        band = solid.sum(1)[int(h * .3):int(h * .7)]
        cy = int(h * .3) + int(band.argmin())
    out = []
    for y0, y1 in ((0, cy), (cy, h)):
        row = solid[y0:y1]
        cx = split_point(row.sum(0) > 0)
        if cx is None:
            band = row.sum(0)[int(w * .3):int(w * .7)]
            cx = int(w * .3) + int(band.argmin())
        out += [img.crop((0, y0, cx, y1)), img.crop((cx, y0, w, y1))]
    return out


def fit_square(img, size, pad=0.07):
    alpha = np.asarray(img.getchannel('A'))
    ys, xs = np.where(alpha > 40)
    if len(xs) == 0:
        return None
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(img.size) * (1 + pad * 2))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=256)
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    with open(os.path.join(HERE, 'items.json'), encoding='utf-8') as f:
        data = json.load(f)

    done = missing = bad = 0
    os.makedirs(OUT_DIR, exist_ok=True)
    for sheet in data['sheets']:
        src = os.path.join(HERE, 'sheets', f'{sheet["id"]}.png')
        if not os.path.exists(src):
            missing += 1
            continue
        outs = [os.path.join(OUT_DIR, f'{it["id"]}.webp') for it in sheet['items']]
        if not args.force and all(os.path.exists(o) for o in outs):
            done += len(outs)
            continue
        for part, out in zip(quadrants(to_rgba_cutout(Image.open(src))), outs):
            sprite = fit_square(part, args.size)
            if sprite is None:
                print(f'VAZIO: {out}')
                bad += 1
                continue
            sprite.save(out, 'WEBP', quality=92, method=6)
            done += 1
    print(f'sprites: {done} · sheets faltando: {missing} · quadrantes vazios: {bad}')


if __name__ == '__main__':
    main()

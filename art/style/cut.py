#!/usr/bin/env python
"""Recorta as sheets de estilo nos assets finais do jogo.

Props e personagem: remove o fundo magenta e salva WebP com alfa.
Solos: além de recortar, gera a versão ESPELHADA 2x2 — a imagem crua não
casa borda com borda, e espelhar garante costura invisível ao repetir no
chão, que é o que o terreno precisa.

Uso: python art/style/cut.py [--force]
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
KEY = np.array([255.0, 0.0, 255.0])


def cutout(im):
    """Tira o fundo magenta e limpa a franja."""
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


def quadrants(img):
    w, h = img.size
    cx, cy = w // 2, h // 2
    return [img.crop((0, 0, cx, cy)), img.crop((cx, 0, w, cy)),
            img.crop((0, cy, cx, h)), img.crop((cx, cy, w, h))]


def trim_to_content(img, pad=0.03):
    """Recorta no conteúdo e devolve quadrado, com o objeto apoiado na base."""
    alpha = np.asarray(img.getchannel('A'))
    ys, xs = np.where(alpha > 40)
    if len(xs) == 0:
        return None
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(img.size) * (1 + pad * 2))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, side - img.height - int(side * pad)))
    return canvas


def mirror_tile(img, size):
    """2x2 espelhado: a borda direita casa com a esquerda por construção."""
    q = img.convert('RGB').resize((size // 2, size // 2), Image.LANCZOS)
    out = Image.new('RGB', (size, size))
    out.paste(q, (0, 0))
    out.paste(q.transpose(Image.FLIP_LEFT_RIGHT), (size // 2, 0))
    out.paste(q.transpose(Image.FLIP_TOP_BOTTOM), (0, size // 2))
    out.paste(q.transpose(Image.ROTATE_180), (size // 2, size // 2))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    with open(os.path.join(HERE, 'assets.json'), encoding='utf-8') as f:
        data = json.load(f)

    feitos = faltando = 0
    for sheet in data['sheets']:
        src = os.path.join(HERE, 'sheets', f'{sheet["id"]}.png')
        if not os.path.exists(src):
            faltando += 1
            print(f'sheet faltando: {sheet["id"]}')
            continue
        out_dir = os.path.join(ROOT, sheet['out'])
        os.makedirs(out_dir, exist_ok=True)
        raw = Image.open(src)
        chao = sheet['id'] == 'ground-tiles'
        parts = quadrants(raw) if chao else quadrants(cutout(raw))
        for part, item in zip(parts, sheet['items']):
            dest = os.path.join(out_dir, f'{item["id"]}.webp')
            if os.path.exists(dest) and not args.force:
                feitos += 1
                continue
            if chao:
                mirror_tile(part, 512).save(dest, 'WEBP', quality=90, method=6)
            else:
                sprite = trim_to_content(part)
                if sprite is None:
                    print(f'VAZIO: {dest}')
                    continue
                sprite.resize((512, 512), Image.LANCZOS).save(dest, 'WEBP', quality=92, method=6)
            feitos += 1
            print(f'  {os.path.relpath(dest, ROOT)}')
    print(f'assets: {feitos} · sheets faltando: {faltando}')


if __name__ == '__main__':
    main()

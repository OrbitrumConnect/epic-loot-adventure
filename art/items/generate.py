#!/usr/bin/env python
"""Gera os sprites de item: uma sheet 2x2 por grupo, via Codex + GPT Image.

Mesmo pipeline do `art/city`: o Codex é dirigido pelo modelo `gpt-5.6-luna`
com esforço `medium` e chama a ferramenta de imagem; cada sheet traz 4 itens,
um por quadrante, e é recortada depois por `cut_sprites.py`.

Uso: python art/items/generate.py [--workers 4] [--only tools,weapons]
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GEN_DIR = os.path.join(os.path.expanduser('~'), '.codex', 'generated_images')
LOG_DIR = os.path.join(HERE, 'sheets', '_logs')
CODEX = shutil.which('codex') or 'codex'
MODEL = 'gpt-5.6-luna'
EFFORT = 'medium'
POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']


def sheet_prompt(data, sheet):
    parts = ', '.join(
        f'{POSITIONS[i]}: {item["prompt"]}' for i, item in enumerate(sheet['items'])
    )
    return (
        'Game item icon sheet, 1024x1024, a 2x2 grid of four separate objects, each centered in its'
        ' own equal quadrant with clear empty margin, no overlap between quadrants, every object at'
        ' a similar visual weight so they read as one set.'
        f' The four objects are — {parts}.'
        f' {data["style"]} {data["background"]} Generate exactly ONE image.'
    )


def run_sheet(data, sheet, timeout=600):
    out = os.path.join(HERE, 'sheets', f'{sheet["id"]}.png')
    if os.path.exists(out):
        return 'skip'
    cmd = [CODEX, 'exec', '--skip-git-repo-check', '-s', 'read-only', '-m', MODEL,
           '-c', f'model_reasoning_effort="{EFFORT}"', '-']
    started = time.time()
    try:
        proc = subprocess.run(cmd, input='$imagegen ' + sheet_prompt(data, sheet),
                              capture_output=True, text=True, encoding='utf-8',
                              errors='replace', timeout=timeout, cwd=HERE)
        log = (proc.stdout or '') + (proc.stderr or '')
    except subprocess.TimeoutExpired as e:
        log = f'TIMEOUT {timeout}s\n{e.stdout or ""}'
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(os.path.join(LOG_DIR, sheet['id'] + '.log'), 'w', encoding='utf-8') as f:
        f.write(log)
    m = re.search(r'session id:\s*([0-9a-f-]{36})', log)
    if not m:
        return 'no-session'
    pngs = sorted(glob.glob(os.path.join(GEN_DIR, m.group(1), '*.png')), key=os.path.getmtime)
    if not pngs:
        return 'no-image'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    shutil.copyfile(pngs[-1], out)
    return f'ok {time.time() - started:.0f}s'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--only', default='')
    args = ap.parse_args()

    with open(os.path.join(HERE, 'items.json'), encoding='utf-8') as f:
        data = json.load(f)
    only = {x for x in args.only.split(',') if x}
    sheets = [s for s in data['sheets'] if not only or s['id'] in only]

    def one(sheet):
        status = run_sheet(data, sheet)
        print(f'[{time.strftime("%H:%M:%S")}] {sheet["id"]}: {status}', flush=True)
        return status == 'skip' or status.startswith('ok')

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(one, sheets))
    bad = [s['id'] for s, ok in zip(sheets, results) if not ok]
    print('DONE' + (f' — falharam: {", ".join(bad)}' if bad else ''))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()

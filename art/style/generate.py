#!/usr/bin/env python
"""Gera os assets no estilo travado (cel-shaded) via Codex + GPT Image.

Mesma mecânica de `art/items`: uma sheet 2x2 por grupo, quatro peças por
chamada, modelo `gpt-5.6-luna` em esforço `medium`. O recorte sai em
`cut.py`.

Uso: python art/style/generate.py [--workers 4] [--only hero,flora]
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
GEN_DIR = os.path.join(os.path.expanduser('~'), '.codex', 'generated_images')
OUT_DIR = os.path.join(HERE, 'sheets')
LOG_DIR = os.path.join(OUT_DIR, '_logs')
CODEX = shutil.which('codex') or 'codex'
MODEL = 'gpt-5.6-luna'
EFFORT = 'medium'
QUAD = ['TOP-LEFT', 'TOP-RIGHT', 'BOTTOM-LEFT', 'BOTTOM-RIGHT']


def prompt_for(data, sheet):
    parts = '  '.join(f'{QUAD[i]}: {it["prompt"]}.' for i, it in enumerate(sheet['items']))
    return (
        'A single 1024x1024 image laid out as a 2x2 grid of four separate subjects, each centered '
        'in its own equal quadrant with clear empty margin and no overlap between quadrants. '
        f'{sheet["shared"]} '
        f'The four are — {parts} '
        f'{data["style"]} {data["background"]} Generate exactly ONE image.'
    )


def run_sheet(data, sheet, timeout=900):
    out = os.path.join(OUT_DIR, f'{sheet["id"]}.png')
    if os.path.exists(out):
        return 'skip'
    os.makedirs(LOG_DIR, exist_ok=True)
    cmd = [CODEX, 'exec', '--skip-git-repo-check', '-s', 'read-only', '-m', MODEL,
           '-c', f'model_reasoning_effort="{EFFORT}"', '-']
    t0 = time.time()
    try:
        p = subprocess.run(cmd, input='$imagegen ' + prompt_for(data, sheet),
                           capture_output=True, text=True, encoding='utf-8',
                           errors='replace', timeout=timeout, cwd=HERE)
        log = (p.stdout or '') + (p.stderr or '')
    except subprocess.TimeoutExpired as e:
        log = f'TIMEOUT {timeout}s\n{e.stdout or ""}'
    with open(os.path.join(LOG_DIR, sheet['id'] + '.log'), 'w', encoding='utf-8') as f:
        f.write(log)
    m = re.search(r'session id:\s*([0-9a-f-]{36})', log)
    if not m:
        return 'no-session'
    pngs = sorted(glob.glob(os.path.join(GEN_DIR, m.group(1), '*.png')), key=os.path.getmtime)
    if not pngs:
        return 'no-image'
    os.makedirs(OUT_DIR, exist_ok=True)
    shutil.copyfile(pngs[-1], out)
    return f'ok {time.time() - t0:.0f}s'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    with open(os.path.join(HERE, 'assets.json'), encoding='utf-8') as f:
        data = json.load(f)
    only = {x for x in a.only.split(',') if x}
    sheets = [s for s in data['sheets'] if not only or s['id'] in only]

    def one(s):
        st = run_sheet(data, s)
        print(f'[{time.strftime("%H:%M:%S")}] {s["id"]}: {st}', flush=True)
        return st == 'skip' or st.startswith('ok')

    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        res = list(pool.map(one, sheets))
    bad = [s['id'] for s, ok in zip(sheets, res) if not ok]
    print('DONE' + (f' — falharam: {", ".join(bad)}' if bad else ''))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()

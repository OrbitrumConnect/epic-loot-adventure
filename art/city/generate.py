#!/usr/bin/env python
"""Gera as sprite sheets do manifesto via Codex (`codex exec` + skill $imagegen).

- Uma cadeia por construção (sheet N usa a sheet N-1 como referência visual),
  várias construções em paralelo.
- Retomável: pula sheets que já existem em art/city/sheets/.
- A imagem é localizada pelo `session id` do log do Codex, então rodar em
  paralelo não mistura arquivos.

Uso: python art/city/generate.py [--workers 4] [--only tribe_hall,forge] [--max-sheet 5]
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
GEN_DIR = os.path.join(os.path.expanduser("~"), ".codex", "generated_images")
LOG_DIR = os.path.join(HERE, "sheets", "_logs")
CODEX = shutil.which("codex") or "codex"


def run_sheet(sheet, model, effort, timeout):
    out = os.path.join(ROOT, sheet["sheet"])
    if os.path.exists(out):
        return "skip"
    cmd = [CODEX, "exec", "--skip-git-repo-check", "-s", "read-only", "-m", model,
           "-c", f'model_reasoning_effort="{effort}"']
    if sheet["ref"]:
        ref = os.path.join(ROOT, sheet["ref"])
        if not os.path.exists(ref):
            return "no-ref"
        cmd += ["-i", ref]
    # prompt via stdin: evita quoting de shell e a ambiguidade de `-i <FILE>...`
    started = time.time()
    try:
        proc = subprocess.run(cmd + ["-"], input="$imagegen " + sheet["prompt"],
                              capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=timeout, cwd=HERE)
        log = (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired as e:
        log = f"TIMEOUT after {timeout}s\n{e.stdout or ''}"
    with open(os.path.join(LOG_DIR, sheet["id"] + ".log"), "w", encoding="utf-8") as f:
        f.write(log)
    m = re.search(r"session id:\s*([0-9a-f-]{36})", log)
    if not m:
        return "no-session"
    pngs = sorted(glob.glob(os.path.join(GEN_DIR, m.group(1), "*.png")), key=os.path.getmtime)
    if not pngs:
        return "no-image"
    shutil.copyfile(pngs[-1], out)
    return f"ok {time.time() - started:.0f}s"


def run_chain(sheets, args):
    for sheet in sheets:
        status = run_sheet(sheet, args.model, args.effort, args.timeout)
        print(f"[{time.strftime('%H:%M:%S')}] {sheet['id']}: {status}", flush=True)
        if not (status == "skip" or status.startswith("ok")):
            # sem a sheet anterior não há referência: interrompe a cadeia
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--only", default="")
    ap.add_argument("--max-sheet", type=int, default=5)
    ap.add_argument("--timeout", type=int, default=600)
    args = ap.parse_args()

    with open(os.path.join(HERE, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    args.model, args.effort = manifest["model"], manifest["effort"]
    os.makedirs(LOG_DIR, exist_ok=True)

    only = {x for x in args.only.split(",") if x}
    chains = {}
    for s in manifest["sheets"]:
        if only and s["building"] not in only:
            continue
        if int(s["id"].rsplit("_s", 1)[1]) > args.max_sheet:
            continue
        chains.setdefault(s["building"], []).append(s)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda c: run_chain(c, args), chains.values()))
    failed = [b for b, ok in zip(chains, results) if not ok]
    print("DONE" + (f" — cadeias interrompidas: {', '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

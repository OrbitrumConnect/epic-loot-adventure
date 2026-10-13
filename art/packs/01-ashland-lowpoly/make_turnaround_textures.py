"""Crop and background-cut reference views for directional 3D texture projection."""
from pathlib import Path
import argparse
import json
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
import rembg
from tsr.utils import remove_background

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output_dir", type=Path)
args = parser.parse_args()
args.output_dir.mkdir(parents=True, exist_ok=True)
image = Image.open(args.source).convert("RGB")
if image.size != (1536, 1024):
    raise ValueError(f"Expected 3x2 turnaround sheet 1536x1024; got {image.size}")
session = rembg.new_session()
views = {"front": (0, 0), "left": (0, 1), "back": (2, 0), "right": (1, 0)}
bounds = {}
for name, (col, row) in views.items():
    crop = image.crop((col * 512, row * 512, (col + 1) * 512, (row + 1) * 512))
    output = remove_background(crop, session)
    path = args.output_dir / f"{name}.png"
    output.save(path)
    rgba = np.asarray(output, dtype=np.uint8).copy()
    mask = rgba[:, :, 3] > 96
    bounds[name] = Image.fromarray((mask * 255).astype(np.uint8)).getbbox()
    nearest = distance_transform_edt(~mask, return_distances=False, return_indices=True)
    rgba[~mask, :3] = rgba[nearest[0][~mask], nearest[1][~mask], :3]
    rgba[:, :, 3] = 255
    Image.fromarray(rgba, "RGBA").save(args.output_dir / f"{name}-filled.png")
    print("TURNAROUND_TEXTURE", name, path, output.mode, output.size)
(args.output_dir / "foreground-bounds.json").write_text(json.dumps(bounds, indent=2), encoding="utf-8")

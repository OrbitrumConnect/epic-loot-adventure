"""Build a real volumetric visual hull from four cleaned turnaround silhouettes."""
from pathlib import Path
import argparse
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation
from skimage.measure import marching_cubes

parser = argparse.ArgumentParser()
parser.add_argument("textures_dir", type=Path)
parser.add_argument("output_npz", type=Path)
parser.add_argument("--resolution", type=int, default=160)
parser.add_argument("--silhouette-dilation", type=int, default=2)
args = parser.parse_args()

bounds = json.loads((args.textures_dir / "foreground-bounds.json").read_text(encoding="utf-8"))
resolution = args.resolution

def silhouette(name, size):
    image = Image.open(args.textures_dir / f"{name}.png").convert("RGBA")
    box = tuple(bounds[name])
    alpha = image.getchannel("A").crop(box).resize(size, Image.Resampling.NEAREST)
    mask = np.asarray(alpha, dtype=np.uint8) > 96
    if args.silhouette_dilation:
        for _ in range(args.silhouette_dilation):
            mask = binary_dilation(mask)
    return mask

# XY-facing refs map image width to X and image vertical to Z.
front = np.flipud(silhouette("front", (resolution, resolution)))
back = np.flipud(np.fliplr(silhouette("back", (resolution, resolution))))

# Side refs map image width to depth Y; profile faces point opposite directions.
left_box = bounds["left"]
right_box = bounds["right"]
depth_ratio = 0.5 * (
    (left_box[2] - left_box[0]) / (left_box[3] - left_box[1])
    + (right_box[2] - right_box[0]) / (right_box[3] - right_box[1])
)
depth_resolution = max(32, round(resolution * depth_ratio))
left = np.flipud(np.fliplr(silhouette("left", (depth_resolution, resolution))))
right = np.flipud(silhouette("right", (depth_resolution, resolution)))

# Intersection of four silhouettes = closed visual hull, not a flat card.
volume = front[:, None, :] & back[:, None, :] & left[:, :, None] & right[:, :, None]
if not volume.any():
    raise RuntimeError("Turnaround silhouettes have empty intersection")

height = 1.0
width = height * 0.5 * (
    (bounds["front"][2] - bounds["front"][0]) / (bounds["front"][3] - bounds["front"][1])
    + (bounds["back"][2] - bounds["back"][0]) / (bounds["back"][3] - bounds["back"][1])
)
depth = height * depth_ratio
vertices_zyx, faces, _, _ = marching_cubes(
    volume.astype(np.float32), level=0.5,
    spacing=(height / (resolution - 1), depth / (depth_resolution - 1), width / (resolution - 1)),
)
vertices = vertices_zyx[:, [2, 1, 0]]
vertices[:, 0] -= width * 0.5
vertices[:, 1] -= depth * 0.5
args.output_npz.parent.mkdir(parents=True, exist_ok=True)
np.savez_compressed(args.output_npz, vertices=vertices.astype(np.float32), faces=faces.astype(np.int32))
print("VISUAL_HULL", args.output_npz, "grid", (resolution, depth_resolution, resolution), "dims", (round(width, 3), round(depth, 3), height), "verts", len(vertices), "faces", len(faces))

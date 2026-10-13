"""Repair TripoSR's baked-texture export (OBJ data mislabeled as .glb)."""
from pathlib import Path
import argparse
from PIL import Image
import trimesh
from trimesh.visual.material import PBRMaterial

parser = argparse.ArgumentParser()
parser.add_argument("source_dir", type=Path)
parser.add_argument("output_glb", type=Path)
args = parser.parse_args()
obj_path = args.source_dir / "mesh.glb"  # TripoSR writes OBJ text here in bake mode.
texture_path = args.source_dir / "texture.png"
mesh = trimesh.load(obj_path, file_type="obj", force="mesh", process=False)
texture = Image.open(texture_path).convert("RGBA")
material = PBRMaterial(
    name="TripoSR baked albedo",
    baseColorTexture=texture,
    metallicFactor=0.0,
    roughnessFactor=0.82,
    doubleSided=True,
)
mesh.visual = trimesh.visual.TextureVisuals(uv=mesh.visual.uv, material=material)
args.output_glb.parent.mkdir(parents=True, exist_ok=True)
mesh.export(args.output_glb, file_type="glb")
print("TRIPOSR_GLTF_REPAIRED", args.output_glb, "vertices", len(mesh.vertices), "faces", len(mesh.faces), "uv", mesh.visual.uv.shape)

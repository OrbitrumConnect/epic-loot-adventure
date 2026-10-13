"""Re-import and sanity-check all Ashland runtime GLBs in Blender 5.x."""
from pathlib import Path
import argparse
import sys
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--models-dir", type=Path, default=Path(__file__).resolve().parent / "models")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
ROOT = args.models_dir.resolve()
FILES = ["ashroot-tree.glb", "ash-cleaver.glb", "ashland-survivor.glb", "ashland-stalker.glb"]
report = []
for filename in FILES:
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / filename))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    rigs = [obj for obj in imported if obj.type == "ARMATURE"]
    assert meshes, f"{filename}: no mesh imported"
    assert all(len(obj.data.vertices) and len(obj.data.polygons) for obj in meshes), f"{filename}: empty mesh"
    bpy.context.view_layer.update()
    coords = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    lo = [min(v[i] for v in coords) for i in range(3)]
    hi = [max(v[i] for v in coords) for i in range(3)]
    assert all(hi[i] - lo[i] > 0.01 for i in range(3)), f"{filename}: degenerate bounds"
    report.append({
        "file": filename,
        "mesh_count": len(meshes),
        "vertex_count": sum(len(obj.data.vertices) for obj in meshes),
        "triangle_count": sum(sum(max(0, len(poly.vertices)-2) for poly in obj.data.polygons) for obj in meshes),
        "rig_count": len(rigs),
        "actions": sorted(action.name for action in set(bpy.data.actions) - actions_before),
        "bounds": [[round(v, 3) for v in lo], [round(v, 3) for v in hi]],
    })
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in set(bpy.data.actions) - actions_before:
        if action.users == 0:
            bpy.data.actions.remove(action)
for row in report:
    print("GLB_VALID", row)
assert len(report) == 4

"""Project the faithful front turnaround texture onto a volumetric TripoSR mesh."""
import argparse
import json
import math
import sys
import bmesh
from pathlib import Path
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("mesh", type=Path)
parser.add_argument("textures_dir", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--depth-scale", type=float, default=1.0)
parser.add_argument("--voxel-size", type=float, default=0.0)
parser.add_argument("--x-up", action="store_true", help="Convert TripoSR X-up mesh to Blender Z-up")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.view_layer.update()
if args.mesh.suffix.lower() == ".npz":
    import numpy as np
    data = np.load(args.mesh)
    mesh_data = bpy.data.meshes.new("Ashland visual hull")
    mesh_data.from_pydata(data["vertices"].tolist(), [], data["faces"].tolist())
    mesh_data.update()
    obj = bpy.data.objects.new("ASHLAND | Survivor visual hull", mesh_data)
    bpy.context.scene.collection.objects.link(obj)
    meshes = [obj]
else:
    bpy.ops.import_scene.gltf(filepath=str(args.mesh.resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError("No mesh imported")

for obj in meshes:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

# TripoSR's extracted mesh is X-up. Convert to Blender Z-up, then apply transform.
for obj in meshes:
    if args.x_up or args.depth_scale != 1.0:
        obj.rotation_mode = "XYZ"
        if args.x_up:
            obj.rotation_euler[1] = math.radians(-90)
        obj.scale.y *= args.depth_scale
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.select_set(False)
    if args.voxel_size > 0:
        modifier = obj.modifiers.new("Close reconstruction gaps", "REMESH")
        modifier.mode = "VOXEL"
        modifier.voxel_size = args.voxel_size
        modifier.use_smooth_shade = True
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
bpy.context.view_layer.update()

points = [obj.matrix_world @ Vector(c) for obj in meshes for c in obj.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
width = high.x - low.x
height = high.z - low.z
if width <= 0 or height <= 0:
    raise RuntimeError(f"Degenerate bounds after axis correction: {low}, {high}")

materials = []
foreground_bounds = json.loads((args.textures_dir / "foreground-bounds.json").read_text(encoding="utf-8"))
for view in ("front", "back", "left", "right"):
    image_file = f"{view}.png" if view == "front" else f"{view}-filled.png"
    image = bpy.data.images.load(str((args.textures_dir / image_file).resolve()), check_existing=False)
    image.pack()
    material = bpy.data.materials.new(f"Ashland hero | {view} turnaround projection")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if view == "front":
        links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.84
    material.surface_render_method = "DITHERED"
    materials.append(material)

for obj in meshes:
    uv = obj.data.uv_layers.new(name="TurnaroundProjection")
    obj.data.materials.clear()
    for material in materials:
        obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
        normal = poly.normal
        if normal.y < -0.3:
            view = 0
        elif normal.y > 0.3:
            view = 1
        else:
            view = 2 if normal.x < 0 else 3
        poly.material_index = view
        for loop_index in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            bx0, by0, bx1, by1 = foreground_bounds[("front", "back", "left", "right")[view]]
            tex_width = 512.0
            tex_height = 512.0
            if view == 0:
                u = (bx0 + ((co.x - low.x) / width) * (bx1 - bx0)) / tex_width
            elif view == 1:
                u = (bx0 + ((high.x - co.x) / width) * (bx1 - bx0)) / tex_width
            elif view == 2:
                u = (bx0 + ((co.y - low.y) / max(high.y - low.y, 1e-6)) * (bx1 - bx0)) / tex_width
            else:
                u = (bx0 + ((high.y - co.y) / max(high.y - low.y, 1e-6)) * (bx1 - bx0)) / tex_width
            v = (by0 + ((co.z - low.z) / height) * (by1 - by0)) / tex_height
            uv.data[loop_index].uv = (max(0.0, min(1.0, u)), max(0.0, min(1.0, v)))

args.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.export_scene.gltf(
    filepath=str(args.output.resolve()),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
)
print("TRIPOSR_PROJECTED", args.output, "views", ["front", "back", "left", "right"], "bounds", list(low), list(high), "height", round(height, 3))

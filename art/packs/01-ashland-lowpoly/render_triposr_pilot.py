"""Render a TripoSR GLB in a clean Blender process for fidelity review."""
from pathlib import Path
import argparse
import sys
import math
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("glb", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--angles", nargs="*", type=float, default=[0, 90, 180, 270])
parser.add_argument("--x-up", action="store_true", help="Rotate TripoSR X-up output to Blender Z-up")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
print("REVIEW_ARGS", args)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(args.glb.resolve()))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if args.x_up:
    for obj in meshes:
        obj.rotation_mode = "XYZ"
        obj.rotation_euler[1] -= math.radians(90)
bpy.context.view_layer.update()
corners = [obj.matrix_world @ Vector(c) for obj in meshes for c in obj.bound_box]
lo = Vector(tuple(min(p[i] for p in corners) for i in range(3)))
hi = Vector(tuple(max(p[i] for p in corners) for i in range(3)))
center = (lo + hi) * 0.5
size = hi - lo
print("TRIPOSR_BOUNDS", list(lo), list(hi), "MESHES", len(meshes), "VERTS", sum(len(o.data.vertices) for o in meshes))

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world.use_nodes = True
scene.world.node_tree.nodes.get("Background").inputs[0].default_value = (0.025, 0.03, 0.04, 1)
scene.world.node_tree.nodes.get("Background").inputs[1].default_value = 0.5

for obj in meshes:
    attrs = list(obj.data.color_attributes)
    has_texture = any(
        material and material.node_tree and any(node.type == "TEX_IMAGE" for node in material.node_tree.nodes)
        for material in obj.data.materials
    )
    if not attrs or has_texture:
        continue
    mat = bpy.data.materials.new("TripoSR vertex color review")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    color = nodes.new("ShaderNodeVertexColor")
    color.layer_name = attrs[0].name
    mat.node_tree.links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)

for name, loc, energy, size_light in [
    ("Key", (-3.5, -4.0, 5.0), 900, 4.0),
    ("Fill", (4.0, -2.0, 2.0), 500, 3.0),
    ("Rim", (1.5, 3.0, 4.0), 800, 3.0),
]:
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size_light
    light_obj = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(light_obj)
    light_obj.location = loc
    light_obj.rotation_euler = (Vector((0, 0, 0)) - light_obj.location).to_track_quat("-Z", "Y").to_euler()

cam_data = bpy.data.cameras.new("Review Camera")
cam = bpy.data.objects.new("Review Camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.type = "ORTHO"
cam_data.ortho_scale = max(size.x, size.z) * 1.25
distance = max(4.0, size.length * 2.0)
cam_data.ortho_scale = max(size.x, size.z) * 1.08
for angle in args.angles:
    radians = math.radians(angle)
    direction = Vector((math.sin(radians), -math.cos(radians), 0.0))
    cam.location = center + direction * distance
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    suffix = f"-{int(angle):03d}" if len(args.angles) > 1 else ""
    scene.render.filepath = str(args.output.with_name(f"{args.output.stem}{suffix}{args.output.suffix}").resolve())
    bpy.ops.render.render(write_still=True)

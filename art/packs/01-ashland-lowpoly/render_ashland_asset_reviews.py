"""Render isolated Ashland source assets from clean Blender checkpoints.

No GLB round-trip and no save to source/live scene. Outputs four new review PNGs.
"""
from pathlib import Path
import json
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models" / "r6"
SCENE = bpy.context.scene

assets = [
    ("tree", "ASHLAND | Ashroot tree", (0.0, 0.0, 0.0)),
    ("weapon", "ASHLAND | Weapon", (0.0, -0.0, 0.0)),
    ("hero", "ASHLAND | Survivor", (-4.0, 0.0, 0.0)),
    ("enemy", "ASHLAND | Radioactive Stalker", (-3.2, 5.0, 0.0)),
]
loaded = {}
for key, collection_name, camera_offset in assets:
    coll = bpy.data.collections.get(collection_name)
    if coll is None:
        raise RuntimeError(f"Missing {collection_name} in {bpy.data.filepath}")
    loaded[key] = (coll, camera_offset)

# Minimal studio lighting; authored material/vertex-color data stays untouched.
world = bpy.data.worlds.new("Ashland isolated review world")
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.035, 0.045, 0.055, 1)
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.8
SCENE.world = world

for name, loc, energy, size in [
    ("Key", (-4, -7, 8), 1800, 6),
    ("Fill", (5, -5, 4), 900, 5),
    ("Rim", (1, 4, 7), 1500, 4),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    SCENE.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0, 1.2)) - obj.location).to_track_quat("-Z", "Y").to_euler()

camera_data = bpy.data.cameras.new("Ashland isolated review camera")
camera = bpy.data.objects.new("Ashland isolated review camera", camera_data)
SCENE.collection.objects.link(camera)
SCENE.camera = camera
camera_data.type = "ORTHO"

SCENE.render.engine = "BLENDER_WORKBENCH"
SCENE.display.shading.light = "STUDIO"
SCENE.display.shading.color_type = "MATERIAL"
SCENE.display.shading.show_shadows = True
SCENE.display.shading.show_cavity = True
SCENE.display.shading.cavity_type = "BOTH"
SCENE.render.resolution_x = 1000
SCENE.render.resolution_y = 1000
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = "PNG"
SCENE.render.film_transparent = False
SCENE.render.filepath = str(MODELS / "unused-review.png")

all_meshes = [obj for coll, _ in loaded.values() for obj in coll.all_objects if obj.type == "MESH"]
for key, (coll, camera_offset) in loaded.items():
    visible = set(coll.all_objects)
    for obj in all_meshes:
        obj.hide_render = obj not in visible
    points = [obj.matrix_world @ Vector(corner) for obj in coll.all_objects if obj.type == "MESH" for corner in obj.bound_box]
    if not points:
        raise RuntimeError(f"No mesh bounds for {key}")
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (low + high) * 0.5
    width, height, depth = (high - low)

    # Translate top-level roots to origin; do not mutate source files.
    for obj in coll.objects:
        if obj.parent is None and obj.type not in {"CAMERA", "LIGHT"}:
            obj.location.x -= center.x
            obj.location.y -= center.y
    center.x = 0.0
    center.y = 0.0
    center.z = (high.z - low.z) * 0.5

    offset = Vector(camera_offset)
    camera.location = center + Vector((offset.x, -max(7.0, depth * 4.0 + 4.0) + offset.y, offset.z + 1.5))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.ortho_scale = max(width, height) * 1.3
    SCENE.render.filepath = str(MODELS / f"ashland-{key}-review-r6.png")
    SCENE.frame_set(1)
    bpy.ops.render.render(write_still=True)
    print("ASHLAND_ASSET_REVIEW", json.dumps({"asset": key, "image": SCENE.render.filepath, "bounds": [list(low), list(high)]}))

print(
    "ASHLAND_ASSET_REVIEWS_READY",
    json.dumps({"blender": bpy.app.version_string, "assets": list(loaded), "outputs": 4}),
)

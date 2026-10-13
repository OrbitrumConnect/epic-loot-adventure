"""Refresh the original material-correct review scene from the latest asset sources."""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "models"
scene = bpy.context.scene

def replace_collection(name, blend_name, shift, yaw=0.0):
    old = bpy.data.collections.get(name)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    source_file = OUT / blend_name
    with bpy.data.libraries.load(str(source_file), link=False) as (src, dst):
        if name not in src.collections:
            raise RuntimeError(f"Collection {name} absent in {blend_name}")
        dst.collections = [name]
    coll = dst.collections[0]
    scene.collection.children.link(coll)
    for obj in coll.objects:
        if obj.parent is None:
            obj.location.x += shift
            if yaw and obj.type == "ARMATURE":
                obj.rotation_euler.z = yaw
    return coll

replace_collection("ASHLAND | Weapon", "ash-cleaver.blend", -1.4)
replace_collection("ASHLAND | Survivor", "ashland-survivor.blend", 1.35)
replace_collection("ASHLAND | Radioactive Stalker", "ashland-stalker.blend", 4.7, math.radians(38))

scene.render.filepath = str(OUT / "ashland-pack-preview.png")
scene.render.resolution_x, scene.render.resolution_y = 1440, 900
scene.render.resolution_percentage = 100
camera = scene.camera
camera.location = (-6.0,-14.0,5.2)
target = Vector((0,0,1.0))
camera.rotation_euler = (target-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 12.5
scene.frame_set(1)
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "ashland-pack.blend"))
print("ASHLAND_PREVIEW_READY", scene.render.filepath)

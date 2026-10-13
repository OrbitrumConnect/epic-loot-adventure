"""Render the authored Blender source scene without a GLB round-trip.

Run against an explicit .blend checkpoint. This process writes only a new PNG;
it never saves over the source .blend or touches the live Blender session.
"""
from pathlib import Path
import json
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "models" / "ashland-reference-render-r5.png"
SCENE = bpy.context.scene

if SCENE.camera is None:
    raise RuntimeError("Source checkpoint has no camera")

camera = SCENE.camera
camera.location = (4.0, -18.0, 6.2)
target = Vector((4.0, 0.0, 1.55))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 13.0

SCENE.render.resolution_x = 1600
SCENE.render.resolution_y = 1000
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = "PNG"
SCENE.render.film_transparent = False
SCENE.render.filepath = str(OUT)
SCENE.frame_set(1)

bpy.ops.render.render(write_still=True)

print(
    "ASHLAND_SOURCE_REVIEW_READY",
    json.dumps(
        {
            "blender": bpy.app.version_string,
            "source": bpy.data.filepath,
            "image": str(OUT),
            "objects": len(bpy.data.objects),
            "meshes": sum(obj.type == "MESH" for obj in bpy.data.objects),
            "mesh_color_attributes": sum(
                len(obj.data.color_attributes)
                for obj in bpy.data.objects
                if obj.type == "MESH"
            ),
            "camera": camera.name,
        }
    ),
)

"""R15: semantic volumetric Ashland hero, textured from four turnaround views.

Run with Blender 5.2:
  blender --background --factory-startup --python-exit-code 1 \
    --python build_semantic_turnaround.py
The six-view concept is used only as texture/reference; no image plane is exported.
"""
from pathlib import Path
import math
import json
import sys
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
STAGE = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 1 else "r15"
TEX = ROOT / "models" / "r15-semantic-turnaround" / "textures"
OUT = ROOT / "models" / f"{STAGE}-semantic-turnaround"
OUT.mkdir(parents=True, exist_ok=True)
HEIGHT = 2.08
WIDTH = 1.72
DEPTH = 0.72
FOREGROUND = json.loads((TEX / "foreground-bounds.json").read_text(encoding="utf-8"))

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in list(bpy.data.collections):
    bpy.data.collections.remove(coll)
scene = bpy.context.scene
parts_coll = bpy.data.collections.new("ASHLAND R15 | semantic volumetric parts")
scene.collection.children.link(parts_coll)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 12
scene.cycles.use_denoising = False
scene.render.resolution_x = 960
scene.render.resolution_y = 960
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.fps = 24
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"

# Direction-indexed projections; UVs are in the coordinate system of the full body.
views = ("front", "back", "left", "right")
materials = {}
for view in views:
    image = bpy.data.images.load(str(TEX / f"{view}-filled.png"), check_existing=False)
    image.pack()
    mat = bpy.data.materials.new(f"Ashland R15 | {view} turnaround projection")
    mat.use_nodes = True
    mat.surface_render_method = "DITHERED"
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.82
    materials[view] = mat


def uv_for(view, co):
    x, y, z = co
    bx0, by0, bx1, by1 = FOREGROUND[view]
    pixel_x = bx0 + (x / WIDTH + 0.5) * (bx1 - bx0)
    if view == "back":
        pixel_x = bx0 + (0.5 - x / WIDTH) * (bx1 - bx0)
    pixel_y = by0 + (1.0 - z / HEIGHT) * (by1 - by0)
    u = pixel_x / 512.0
    v = 1.0 - pixel_y / 512.0
    if view == "front":
        return (u, v)
    if view == "back":
        return (u, v)
    if view == "left":
        u = bx0 / 512.0 + max(0.0, min(1.0, 0.5 - y / DEPTH)) * ((bx1 - bx0) / 512.0)
    elif view == "right":
        u = bx0 / 512.0 + max(0.0, min(1.0, 0.5 + y / DEPTH)) * ((bx1 - bx0) / 512.0)
    return (u, v)


def ellipsoid(name, center, radii, segments=32, rings=20, rotation=None):
    center = Vector(center)
    rotation = rotation or Vector((0, 0, 0))
    from mathutils import Euler
    rot = Euler(rotation, "XYZ").to_matrix()
    verts, faces = [], []
    for j in range(rings + 1):
        phi = math.pi * j / rings
        for i in range(segments):
            theta = 2 * math.pi * i / segments
            local = Vector((radii[0] * math.sin(phi) * math.cos(theta),
                            radii[1] * math.sin(phi) * math.sin(theta),
                            radii[2] * math.cos(phi)))
            verts.append(tuple(center + rot @ local))
    for j in range(rings):
        for i in range(segments):
            a = j * segments + i
            b = j * segments + (i + 1) % segments
            # Parameterization has d(theta) x d(phi) inward; reverse winding for outward normals.
            faces.append((a, a + segments, b + segments, b))
    mesh = bpy.data.meshes.new(name + " | mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    parts_coll.objects.link(obj)
    for view in views:
        mesh.materials.append(materials[view])
    uv = mesh.uv_layers.new(name="Turnaround projection UV")
    for poly in mesh.polygons:
        poly.use_smooth = True
        normal = poly.normal
        # Select the projection with the dominant horizontal normal component;
        # fixed thresholds caused side-map slivers across the front-facing shells.
        if abs(normal.y) >= abs(normal.x):
            view_idx = 0 if normal.y < 0 else 1
        else:
            view_idx = 2 if normal.x < 0 else 3
        poly.material_index = view_idx
        view = views[view_idx]
        for li in poly.loop_indices:
            vertex = mesh.vertices[mesh.loops[li].vertex_index]
            uv.data[li].uv = uv_for(view, vertex.co)
    obj["ashland_stage"] = STAGE + "-semantic-turnaround-prototype"
    obj["rig_ready"] = False
    return obj


def between(name, a, b, radius_x, radius_y, segs=24):
    a, b = Vector(a), Vector(b)
    axis = b - a
    rot = axis.to_track_quat("Z", "Y").to_matrix()
    rings = (0.0, 0.07, 0.18, 0.34, 0.50, 0.66, 0.82, 0.93, 1.0)
    profile = (0.34, 0.70, 0.91, 1.0, 1.0, 1.0, 0.91, 0.70, 0.34)
    verts, faces = [], []
    for t, taper in zip(rings, profile):
        center = a.lerp(b, t)
        for j in range(segs):
            angle = 2.0 * math.pi * j / segs
            local = Vector((radius_x * taper * math.cos(angle),
                            radius_y * taper * math.sin(angle), 0.0))
            verts.append(tuple(center + rot @ local))
    for ring in range(len(rings) - 1):
        for j in range(segs):
            cur = ring * segs + j
            nxt = ring * segs + (j + 1) % segs
            faces.append((cur, nxt, nxt + segs, cur + segs))
    faces.append(tuple(range(segs - 1, -1, -1)))
    last = (len(rings) - 1) * segs
    faces.append(tuple(last + j for j in range(segs)))
    mesh = bpy.data.meshes.new(name + " | loft mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    parts_coll.objects.link(obj)
    for view in views:
        mesh.materials.append(materials[view])
    uv = mesh.uv_layers.new(name="Turnaround projection UV")
    for poly in mesh.polygons:
        poly.use_smooth = True
        normal = poly.normal
        if abs(normal.y) >= abs(normal.x):
            view_idx = 0 if normal.y < 0 else 1
        else:
            view_idx = 2 if normal.x < 0 else 3
        poly.material_index = view_idx
        view = views[view_idx]
        for li in poly.loop_indices:
            vertex = mesh.vertices[mesh.loops[li].vertex_index]
            uv.data[li].uv = uv_for(view, vertex.co)
    obj["ashland_stage"] = STAGE + "-semantic-turnaround-prototype"
    obj["rig_ready"] = False
    return obj


def projected_mesh(name, verts, faces):
    mesh = bpy.data.meshes.new(name + " | mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    parts_coll.objects.link(obj)
    for view in views:
        mesh.materials.append(materials[view])
    uv = mesh.uv_layers.new(name="Turnaround projection UV")
    for poly in mesh.polygons:
        normal = poly.normal
        if abs(normal.y) >= abs(normal.x):
            view_idx = 0 if normal.y < 0 else 1
        else:
            view_idx = 2 if normal.x < 0 else 3
        poly.material_index = view_idx
        for li in poly.loop_indices:
            vertex = mesh.vertices[mesh.loops[li].vertex_index]
            uv.data[li].uv = uv_for(views[view_idx], vertex.co)
    obj["ashland_stage"] = STAGE + "-semantic-turnaround-prototype"
    obj["rig_ready"] = False
    return obj


def extruded_plate(name, side, outline, front_y=-0.245, back_y=0.045):
    points = [(side * abs(x), z) for x, z in outline]
    count = len(points)
    verts = [(x, front_y, z) for x, z in points]
    verts.extend((x, back_y, z) for x, z in points)
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count)
                 for i in range(count))
    return projected_mesh(name, verts, faces)


def chamfered_boot(name, side):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co.x *= 0.275
        vert.co.y *= 0.425
        vert.co.z *= 0.155
        angle = side * math.radians(8.0)
        x, y = vert.co.x, vert.co.y
        vert.co.x = x * math.cos(angle) - y * math.sin(angle) + side * 0.22
        vert.co.y = x * math.sin(angle) + y * math.cos(angle) - 0.085
        vert.co.z += 0.105
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.028, segments=2, profile=0.5,
                    affect="EDGES", clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name + " | chamfered mesh")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return projected_mesh_from_mesh(name, mesh)


def projected_mesh_from_mesh(name, mesh):
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    parts_coll.objects.link(obj)
    for view in views:
        mesh.materials.append(materials[view])
    uv = mesh.uv_layers.new(name="Turnaround projection UV")
    for poly in mesh.polygons:
        poly.use_smooth = False
        if abs(poly.normal.y) >= abs(poly.normal.x):
            view_idx = 0 if poly.normal.y < 0 else 1
        else:
            view_idx = 2 if poly.normal.x < 0 else 3
        poly.material_index = view_idx
        for li in poly.loop_indices:
            vertex = mesh.vertices[mesh.loops[li].vertex_index]
            uv.data[li].uv = uv_for(views[view_idx], vertex.co)
    obj["ashland_stage"] = STAGE + "-semantic-turnaround-prototype"
    obj["rig_ready"] = False
    return obj


# Forms follow the concept's actual proportions: wide shoulders, narrow waist,
# long torn coat, armored shins/boots, hood, twin-cylinder pack, dropped arms.
ellipsoid("Hero | hood and gas mask mass", (0, -0.012, 1.78), (0.255, 0.245, 0.30))
ellipsoid("Hero | scarf and collar mass", (0, -0.018, 1.53), (0.39, 0.29, 0.17))
ellipsoid("Hero | armored torso", (0, 0.005, 1.265), (0.345, 0.205, 0.36))
ellipsoid("Hero | rear pack volume", (0, 0.205, 1.37), (0.30, 0.105, 0.39))
ellipsoid("Hero | torn coat volume", (0, 0.015, 0.82), (0.415, 0.245, 0.52), segments=40, rings=24)
for side in (-1, 1):
    s = "L" if side < 0 else "R"
    ellipsoid(f"Hero | shallow pauldron {s}", (side * 0.405, -0.018, 1.46),
              (0.17, 0.115, 0.145), rotation=(0, side * 0.10, side * 0.08))
    between(f"Hero | upper sleeve {s}", (side * 0.39, 0, 1.43), (side * 0.61, -0.015, 1.22), 0.105, 0.11)
    between(f"Hero | armored forearm {s}", (side * 0.61, -0.015, 1.22), (side * 0.785, -0.025, 1.015), 0.078, 0.088)
    ellipsoid(f"Hero | glove {s}", (side * 0.80, -0.035, 0.985), (0.073, 0.078, 0.085))
    ellipsoid(f"Hero | thigh {s}", (side * 0.19, 0.018, 0.56), (0.17, 0.20, 0.31), rotation=(0, side * 0.04, 0))
    ellipsoid(f"Hero | knee plate {s}", (side * 0.20, -0.105, 0.405), (0.125, 0.065, 0.105))
    between(f"Hero | wrapped shin {s}", (side * 0.205, 0.018, 0.39), (side * 0.215, 0.018, 0.105), 0.115, 0.14)
    ellipsoid(f"Hero | scavenger boot {s}", (side * 0.30, -0.095, 0.105), (0.16, 0.235, 0.095))
    # Rear-facing cylinders are real 3D canisters, not painted image planes.
    ellipsoid(f"Hero | reactor tank {s}", (side * 0.205, 0.295, 1.42), (0.083, 0.09, 0.30), segments=24)
    ellipsoid(f"Hero | cyan reactor core {s}", (side * 0.205, 0.207, 1.42), (0.052, 0.035, 0.205), segments=20)

# Render rig: orthographic four views, CPU-safe EEVEE; GLB contains only hero meshes.
render_coll = bpy.data.collections.new("R15 | render setup")
scene.collection.children.link(render_coll)
world = bpy.data.worlds.new("R15 neutral") if not bpy.data.worlds else bpy.data.worlds[0]
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.028, 0.034, 0.042, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35

def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

cam_data = bpy.data.cameras.new("R15 review camera")
cam = bpy.data.objects.new("R15 review camera", cam_data)
render_coll.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2.35
cam.location = (0, -5, 1.04)
look_at(cam, (0, 0, 1.04))
scene.camera = cam
for name, loc, power, size in (("Key", (-3,-4,4), 520, 3), ("Fill", (3,-2,2.7), 280, 2), ("Rim", (0,3,3), 460, 2)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size = power, "DISK", size
    ob = bpy.data.objects.new(name, data)
    render_coll.objects.link(ob)
    ob.location = loc
    look_at(ob, (0, 0, 1.0))

for label, loc in (("front", (0,-5,1.04)), ("side", (5,0,1.04)),
                    ("back", (0,5,1.04)), ("threequarter", (3,-4,1.04))):
    cam.location = loc
    look_at(cam, (0,0,1.04))
    scene.render.filepath = str(OUT / f"{STAGE}-{label}.png")
    bpy.ops.render.render(write_still=True)

# Export selected semantic parts; render cameras/lights remain in .blend only.
bpy.ops.object.select_all(action="DESELECT")
for ob in parts_coll.objects:
    ob.select_set(True)
bpy.context.view_layer.objects.active = parts_coll.objects[0]
bpy.ops.export_scene.gltf(filepath=str(OUT / f"ashland-survivor-{STAGE}.glb"),
                           export_format="GLB", use_selection=True,
                           export_materials="EXPORT", export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"ashland-survivor-{STAGE}.blend"))
print("R15_RESULT", {"stage": STAGE, "parts": len(parts_coll.objects), "verts": sum(len(o.data.vertices) for o in parts_coll.objects),
                     "faces": sum(len(o.data.polygons) for o in parts_coll.objects),
                     "glb": str(OUT / f"ashland-survivor-{STAGE}.glb")})

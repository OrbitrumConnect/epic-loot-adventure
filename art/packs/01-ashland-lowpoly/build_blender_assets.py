"""Build Ashland pilot as editable Blender geometry plus animated glTF assets.

Run with Blender 5.x:
  blender --background --factory-startup --python build_blender_assets.py

The generated meshes use authored geometry/materials; concept PNGs are references only.
"""
from pathlib import Path
import math
import bpy
import bmesh
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "models" / "r6"
OUT.mkdir(parents=True, exist_ok=True)
SCENE = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0
# Deterministic CLI build: remove startup Cube/Camera/Light so none leak into review scenes.
for startup_object in list(bpy.data.objects):
    bpy.data.objects.remove(startup_object, do_unlink=True)
SCENE.render.engine = "BLENDER_EEVEE"
SCENE.render.resolution_x = 1440
SCENE.render.resolution_y = 900
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = "PNG"
SCENE.render.fps = 24

COLORS = {
    "bark": (0.095, 0.067, 0.048, 1),
    "bark_light": (0.23, 0.14, 0.075, 1),
    "metal": (0.18, 0.19, 0.18, 1),
    "rust": (0.42, 0.12, 0.055, 1),
    "cloth": (0.075, 0.068, 0.057, 1),
    "scarf": (0.48, 0.105, 0.045, 1),
    "bone": (0.62, 0.52, 0.36, 1),
    "hide": (0.28, 0.23, 0.17, 1),
    "cyan": (0.015, 0.72, 0.72, 1),
    "dark": (0.035, 0.032, 0.027, 1),
    "ground": (0.055, 0.075, 0.072, 1),
}
MATS = {}
for name, color in COLORS.items():
    material = bpy.data.materials.new("Ashland | " + name.replace("_", " ").title())
    material.diffuse_color = color
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.78 if name not in ("metal", "cyan") else 0.32
    if name == "metal":
        bsdf.inputs["Metallic"].default_value = 0.72
    if name == "cyan":
        bsdf.inputs["Metallic"].default_value = 0.08
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = 2.4
    else:
        # GLB-safe per-vertex pigment: procedural shader textures do not survive glTF export.
        bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
        vertex_color = nodes.new("ShaderNodeVertexColor")
        vertex_color.layer_name = "AshlandWeather"
        links.new(vertex_color.outputs["Color"], bsdf.inputs["Base Color"])
    MATS[name] = material


def deselect_all():
    bpy.ops.object.select_all(action="DESELECT")


def collection(name):
    coll = bpy.data.collections.new(name)
    SCENE.collection.children.link(coll)
    return coll


def move_to_collection(obj, coll):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def materialize(obj, mat):
    material = MATS[mat] if isinstance(mat, str) else mat
    obj.data.materials.append(material)
    if obj.type == "MESH" and isinstance(mat, str) and mat != "cyan":
        attr = obj.data.color_attributes.get("AshlandWeather") or obj.data.color_attributes.new(
            name="AshlandWeather", type="FLOAT_COLOR", domain="POINT"
        )
        base = COLORS[mat]
        for index, vertex in enumerate(obj.data.vertices):
            x, y, z = vertex.co
            grain = (math.sin(x * 19.0 + y * 11.0) * math.sin(z * 23.0 - x * 7.0) + 1.0) * 0.5
            fleck = ((index * 37 + len(obj.data.vertices) * 13) % 29) / 28.0
            value = max(0.48, min(1.42, 0.65 + grain * 0.58 + fleck * 0.18))
            attr.data[index].color = (
                min(1.0, base[0] * value),
                min(1.0, base[1] * value),
                min(1.0, base[2] * value),
                1.0,
            )
    return obj


def ico(name, loc, scale, mat, coll, bone=None, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    obj = move_to_collection(bpy.context.object, coll)
    obj.name = name
    obj.scale = scale
    roughness = {"bark": 0.10, "bark_light": 0.075, "hide": 0.045, "cloth": 0.035, "scarf": 0.04, "bone": 0.035}.get(mat, 0.0)
    if roughness:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=False)
        for vertex in bm.verts:
            p = vertex.co
            normal = p.normalized()
            broad = math.sin(p.x*17.0 + p.y*11.0 + p.z*23.0) * math.cos(p.y*19.0 - p.z*13.0)
            fine = math.sin(p.x*61.0 + p.y*43.0 - p.z*37.0) * math.sin(p.z*47.0 + p.x*29.0)
            vertex.co += normal * (roughness*broad + roughness*0.24*fine)
        bm.normal_update()
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    materialize(obj, mat)
    if bone:
        obj["attach_socket"] = bone
    return obj


def cube(name, loc, scale, mat, coll, bevel=0.06, bone=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = move_to_collection(bpy.context.object, coll)
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    materialize(obj, mat)
    if bevel:
        mod = obj.modifiers.new("Worn edge bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.profile = 0.5
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    if bone:
        obj["attach_socket"] = bone
    return obj


def rod(name, start, end, radius, mat, coll, bone=None, radius_end=None, vertices=8):
    a, b = Vector(start), Vector(end)
    direction = b - a
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius,
        radius2=radius if radius_end is None else radius_end,
        depth=direction.length,
        location=(a + b) * 0.5,
    )
    obj = move_to_collection(bpy.context.object, coll)
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    materialize(obj, mat)
    if bone:
        obj["attach_socket"] = bone
    return obj


def organic_tube(name, points, radii, mat, coll, sides=10, phase=0.0):
    """Swept organic mass with Catmull-Rom centerline/radius interpolation."""
    anchors = [Vector(p) for p in points]
    centers, smooth_radii = [], []
    steps = 6
    for i in range(len(anchors) - 1):
        p0 = anchors[max(0, i - 1)]
        p1, p2 = anchors[i], anchors[i + 1]
        p3 = anchors[min(len(anchors) - 1, i + 2)]
        r0, r1, r2, r3 = (radii[max(0, i - 1)], radii[i], radii[i + 1], radii[min(len(radii) - 1, i + 2)])
        for step in range(steps):
            t = step / steps
            t2, t3 = t*t, t*t*t
            centers.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3))
            smooth_radii.append(0.5*((2*r1)+(-r0+r2)*t+(2*r0-5*r1+4*r2-r3)*t2+(-r0+3*r1-3*r2+r3)*t3))
    centers.append(anchors[-1])
    smooth_radii.append(radii[-1])
    verts, faces = [], []
    for i, center in enumerate(centers):
        tangent = (centers[min(i + 1, len(centers)-1)] - centers[max(0, i - 1)]).normalized()
        axis_a = tangent.cross(Vector((0, 1, 0)))
        if axis_a.length < 1e-5:
            axis_a = tangent.cross(Vector((1, 0, 0)))
        axis_a.normalize()
        axis_b = tangent.cross(axis_a).normalized()
        twist = phase + i * 0.29
        for j in range(sides):
            angle = 2 * math.pi * j / sides + twist
            uneven = 1.0 + 0.10 * math.sin(j * 5.3 + i * 2.1)
            point = center + (axis_a * math.cos(angle) + axis_b * math.sin(angle)) * smooth_radii[i] * uneven
            verts.append(tuple(point))
    for i in range(len(centers)-1):
        for j in range(sides):
            a, b = i*sides+j, i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(range(sides-1,-1,-1)), tuple((len(centers)-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(name+" | mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj=bpy.data.objects.new(name,mesh)
    coll.objects.link(obj)
    materialize(obj,mat)
    return obj


def poly_prism(name, outline, depth, y, mat, coll, bevel=0.025):
    """Extrude a hand-shaped X/Z silhouette along Y; useful for torn cloth and forged blades."""
    count = len(outline)
    verts = [(x, y - depth * 0.5, z) for x, z in outline]
    verts += [(x, y + depth * 0.5, z) for x, z in outline]
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new(name + " | mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    materialize(obj, mat)
    if bevel:
        mod = obj.modifiers.new("Forged silhouette bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
        obj.modifiers.new("Face-weighted normals", "WEIGHTED_NORMAL")
    return obj


def torus(name, loc, major, minor, mat, coll, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=8, location=loc, rotation=rotation)
    obj = move_to_collection(bpy.context.object, coll)
    obj.name = name
    materialize(obj, mat)
    return obj


def create_rig(name, coll, bones):
    arm_data = bpy.data.armatures.new(name + " | Skeleton")
    arm = bpy.data.objects.new(name + " | Rig", arm_data)
    coll.objects.link(arm)
    deselect_all()
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, head, tail, parent in bones:
        bone = arm_data.edit_bones.new(bone_name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = arm_data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.show_in_front = True
    return arm


def bind(objects, arm, bone):
    for obj in objects:
        if obj.type != "MESH":
            continue
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        mod = obj.modifiers.new("Ashland armature", "ARMATURE")
        mod.object = arm
        obj.parent = arm


def socket_empty(name, coll, parent, loc):
    obj = bpy.data.objects.new(name, None)
    coll.objects.link(obj)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.12
    obj.location = loc
    if parent:
        obj.parent = parent
    obj["socket"] = True
    return obj


def export_glb(filepath, action_prefix=None):
    """Export selected objects while excluding clips belonging to other rigs."""
    import io_scene_gltf2
    if not hasattr(SCENE, "gltf_action_filter"):
        class FilterSettings:
            export_action_filter = True
        io_scene_gltf2.on_export_action_filter_changed(FilterSettings(), None)
    filters = SCENE.gltf_action_filter
    for action in bpy.data.actions:
        if not any(item.action == action for item in filters):
            item = filters.add()
            item.action = action
    for item in filters:
        item.keep = bool(action_prefix and item.action and item.action.name.startswith(action_prefix))
    bpy.ops.export_scene.gltf(
        filepath=str(filepath), export_format="GLB", use_selection=True,
        export_animations=True, export_skins=True, export_materials="EXPORT",
        export_action_filter=True, export_animation_mode="ACTIONS",
    )


def animate_rig(arm, actions):
    arm.animation_data_create()
    for action_name, poses, end_frame in actions:
        action = bpy.data.actions.new(action_name)
        arm.animation_data.action = action
        for frame, bone_values in poses:
            SCENE.frame_set(frame)
            for bone_name, xyz in bone_values.items():
                pb = arm.pose.bones.get(bone_name)
                if pb:
                    pb.rotation_mode = "XYZ"
                    pb.rotation_euler = xyz
                    pb.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)
        for fcurve in getattr(action, "fcurves", []):
            for key in fcurve.keyframe_points:
                key.interpolation = "BEZIER"
        action["loop"] = True
        action["clip_end"] = end_frame
    arm.animation_data.action = None
    SCENE.frame_set(1)


def make_weapon():
    coll = collection("ASHLAND | Weapon")
    parts = []
    parts.append(rod("Cleaver | wrapped handle", (0, 0, 0), (0, 0, 0.68), 0.095, "bark_light", coll, vertices=8))
    parts.append(cube("Cleaver | pommel", (0, 0, -0.04), (0.23, 0.19, 0.11), "rust", coll, bevel=0.035))
    parts.append(cube("Cleaver | cross guard", (0, 0, 0.62), (0.66, 0.14, 0.12), "metal", coll, bevel=0.045))
    parts.append(rod("Cleaver | socket collar", (0, 0, 0.66), (0, 0, 0.88), 0.16, "rust", coll, radius_end=0.13))
    # Broad asymmetric salvaged plate. Three controlled bites read as damage,
    # not a regular saw edge; the cut-hole sits near the outer blade corner.
    blade_outline = [
        (-0.24, 0.76), (-0.19, 1.02), (-0.30, 1.23), (-0.07, 1.39),
        (0.16, 1.68), (0.51, 1.84), (1.02, 1.88), (1.23, 1.72),
        (1.17, 1.44), (1.10, 1.22), (1.04, 1.16), (0.98, 1.25),
        (0.91, 1.17), (0.84, 1.24), (0.76, 1.13), (0.61, 1.10),
        (0.43, 1.02), (0.23, 0.92), (0.04, 0.84),
    ]
    blade = poly_prism("Cleaver | forged silhouette", blade_outline, 0.16, 0, "metal", coll, bevel=0.035)
    # A real through-hole, not a dark decal: bake the boolean into the blade mesh.
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.105, depth=0.5, location=(0.99,0,1.67), rotation=(math.pi/2,0,0))
    cutter=bpy.context.object
    boolean=blade.modifiers.new("Punched lanyard hole", "BOOLEAN")
    boolean.operation="DIFFERENCE"
    boolean.solver="EXACT"
    boolean.object=cutter
    bpy.context.view_layer.objects.active=blade
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    parts.append(blade)
    parts.append(poly_prism("Cleaver | pale cutting bevel", [(0.02,0.84),(0.25,0.91),(0.44,1.01),(0.61,1.08),(0.76,1.12),(0.84,1.22),(0.91,1.15),(0.98,1.23),(1.04,1.14),(1.10,1.22),(1.16,1.42),(1.12,1.18),(1.04,1.02),(0.88,0.98),(0.67,0.93),(0.44,0.86),(0.22,0.78)], 0.025, -0.095, "bone", coll, bevel=0.008))
    # Reactor is a diagonal capsule embedded at blade/haft junction, like PNG.
    capsule_a, capsule_b = (-0.24,-0.19,0.99), (0.24,-0.19,1.31)
    parts.append(rod("Cleaver | reactor cage upper", capsule_a, capsule_b, 0.145, "rust", coll, radius_end=0.13, vertices=10))
    parts.append(rod("Cleaver | cyan reactor", (-0.23,-0.275,1.00), (0.23,-0.275,1.30), 0.085, "cyan", coll, radius_end=0.075, vertices=12))
    axis = (Vector(capsule_b) - Vector(capsule_a)).to_track_quat("Z", "Y").to_euler()
    for t in (0.08, 0.92):
        point = Vector(capsule_a).lerp(Vector(capsule_b), t)
        parts.append(torus("Cleaver | reactor clamp", (point.x, -0.275, point.z), 0.105, 0.02, "metal", coll, rotation=axis))
    # Hammered rivets and a raised rim frame the actual punched aperture.
    parts.append(torus("Cleaver | punched rim", (0.99,-0.085,1.67), 0.108, 0.018, "rust", coll))
    for x, z in ((0.2,1.57),(0.46,1.69),(1.14,1.52),(0.74,1.36),(0.17,1.28)):
        parts.append(ico("Cleaver | hammered rivet", (x,-0.095,z), (0.024,0.016,0.024), "bone", coll, subdivisions=1))
    parts.append(rod("Cleaver | reactor power cable", (0.08,-0.24,0.94), (0.34,-0.19,1.11), 0.026, "dark", coll, vertices=6))
    # Wrapped grip bands create readable scale and material break-up.
    for z in (0.13,0.22,0.31,0.40,0.49):
        parts.append(torus("Cleaver | grip binding", (0,-0.005,z), 0.092, 0.018, "rust", coll, rotation=(0,0,0)))
    socket_empty("socket_weapon_grip", coll, None, (0, 0, 0))
    # Tilt actual geometry to match the diagonal carry in the reference.
    from mathutils import Matrix
    carry_angle = Matrix.Rotation(math.radians(31), 4, "Y")
    for obj in coll.objects:
        obj.location = carry_angle @ obj.location
        obj.rotation_euler = (carry_angle.to_3x3() @ obj.rotation_euler.to_matrix()).to_euler()
    deselect_all()
    for obj in coll.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if not globals().get("RENDER_ONLY", False):
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "ash-cleaver.blend"))
    export_glb(OUT / "ash-cleaver.glb")


def make_tree():
    coll = collection("ASHLAND | Ashroot tree")
    parts = []
    parts.append(organic_tube("Ashroot | twisted trunk", [(0,0,0.04),(-0.18,0,0.30),(-0.10,0,0.58),(0.12,0,0.84),(-0.04,0,1.10),(-0.20,0,1.38),(0.02,0,1.64),(0.25,0,1.92),(0.14,0,2.18),(-0.10,0,2.45),(-0.24,0,2.72)], [0.72,0.66,0.59,0.53,0.48,0.43,0.38,0.33,0.28,0.22,0.12], "bark", coll, sides=15, phase=0.2))
    for i, (sx, sy, h, ex, ey) in enumerate([
        (-0.18, 0, 0.92, -1.62, -0.10), (0.06, 0, 1.12, 1.50, -0.12),
        (-0.10, 0.05, 1.68, -0.82, 0.05), (0.18, 0.05, 1.88, 0.72, 0.08),
        (-0.02, 0.02, 2.28, -0.12, 0.02),
    ]):
        end_z = h + (0.62 if i < 2 else 0.66)
        midx=(sx+ex)*0.5 + (0.20 if i%2 else -0.22)
        midz=h+0.22
        parts.append(organic_tube(f"Ashroot | twisted branch {i+1}", [(sx,sy,h),(midx,sy+0.06,midz),(ex*0.58,ey,end_z-0.20),(ex*0.86,ey,end_z-0.02),(ex,ey,end_z)], [0.34 if i<2 else 0.24,0.28 if i<2 else 0.19,0.18 if i<2 else 0.12,0.10,0.028], "bark_light", coll, sides=11, phase=i*0.61))
        parts.append(organic_tube(f"Ashroot | fork {i+1}", [(ex*0.60,ey,end_z-0.18),(ex*0.74,ey,end_z+0.04),(ex*0.90,ey,end_z+0.25),(ex*1.08,ey,end_z+0.43)], [0.14,0.10,0.055,0.012], "bark", coll, sides=8, phase=i*0.37))
    for i, (x, y, angle) in enumerate([(-0.72,0,-0.9),(0.72,0.05,0.8),(-0.42,0.42,-0.45),(0.42,-0.48,0.5),(-0.12,-0.68,-0.2),(0.15,0.68,0.25)]):
        parts.append(organic_tube(f"Ashroot | exposed root {i+1}", [(x*1.8,y,0.035),(x*1.28,y*0.83,0.10),(x*0.72,y*0.52,0.23),(x*0.30,y*0.25,0.49),(0,0,0.84)], [0.07,0.16,0.25,0.28,0.21], "bark", coll, sides=9, phase=angle))
    # Knotted bark plates break the cone silhouette into twisted, scarred wood.
    for i, (x, z, sx, sz, mat) in enumerate([
        (-0.2,0.63,0.19,0.37,"bark_light"),(0.18,0.88,0.15,0.31,"bark"),
        (-0.09,1.08,0.12,0.32,"bark_light"),(0.11,1.42,0.13,0.38,"bark"),
        (-0.08,1.72,0.11,0.32,"bark_light"),(0.07,2.03,0.1,0.29,"bark"),
        (0.02,2.34,0.085,0.23,"bark_light"),(-0.31,0.33,0.2,0.18,"bark_light"),
        (0.35,0.37,0.18,0.16,"bark"),
    ]):
        plate=ico(f"Ashroot | bark scar {i+1}",(x,-0.31,z),(sx,0.075,sz),mat,coll,subdivisions=1)
        parts.append(plate)
    # Hollow wound and branching radioactive fissures on the camera-facing trunk.
    parts.append(ico("Ashroot | hollow heart",(0,-0.395,1.42),(0.25,0.055,0.36),"dark",coll,subdivisions=2))
    for i, (a,b,radius) in enumerate([
        ((0.02,-0.43,1.1),(-0.03,-0.43,1.34),0.025),
        ((-0.03,-0.43,1.34),(0.07,-0.43,1.52),0.022),
        ((0.07,-0.43,1.52),(0.02,-0.43,1.78),0.018),
        ((-0.02,-0.43,1.31),(-0.2,-0.41,1.48),0.018),
        ((0.04,-0.43,1.47),(0.23,-0.4,1.61),0.018),
        ((0.01,-0.42,1.75),(-0.12,-0.39,1.92),0.014),
        ((0.15,-0.4,1.6),(0.29,-0.38,1.82),0.014),
    ]):
        parts.append(rod(f"Ashroot | cyan fissure {i+1}",a,b,radius,"cyan",coll,radius_end=radius*0.45,vertices=6))
    for loc, scale in [((0, -0.445, 1.16), (0.045, 0.022, 0.30)), ((0.02, -0.445, 1.64), (0.04, 0.02, 0.20)), ((0.40, -0.34, 1.82), (0.035, 0.018, 0.16)), ((-0.40, -0.34, 1.72), (0.035, 0.018, 0.16))]:
        parts.append(ico("Ashroot | luminous sap", loc, scale, "cyan", coll, subdivisions=2))
    for i, (loc, scale) in enumerate([((-0.25, -0.18, 0.55), (0.09, 0.05, 0.27)), ((0.28, -0.18, 0.72), (0.06, 0.04, 0.19)), ((-0.13, -0.2, 2.25), (0.055, 0.035, 0.16))]):
        parts.append(ico(f"Ashroot | fracture glow {i+1}", loc, scale, "cyan", coll, subdivisions=1))
    for i, (x, y, z, length) in enumerate([(-1.14,-0.12,2.02,0.42),(0.92,-0.11,2.03,0.5),(0.04,-0.11,2.65,0.44),(-0.48,-0.12,2.43,0.26)]):
        parts.append(rod(f"Ashroot | hanging sap {i+1}",(x,y,z),(x+0.025,y,z-length),0.035,"cyan",coll,radius_end=0.006,vertices=7))
        parts.append(ico(f"Ashroot | sap bead {i+1}",(x+0.025,y,z-length),(0.025,0.025,0.04),"cyan",coll,subdivisions=1))
    root = bpy.data.objects.new("Ashroot | sway pivot", None)
    coll.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.location = (0, 0, 0)
    for obj in parts:
        obj.parent = root
    root.animation_data_create()
    action = bpy.data.actions.new("Ashroot | wind sway")
    root.animation_data.action = action
    for frame, angle in [(1, -0.018), (9, 0.018), (17, -0.018)]:
        SCENE.frame_set(frame)
        root.rotation_euler[1] = angle
        root.keyframe_insert(data_path="rotation_euler", frame=frame, group="Wind sway")
    root["animation"] = "wind sway, cyclic target 1-17"
    deselect_all()
    for obj in coll.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    export_glb(OUT / "ashroot-tree.glb", "Ashroot | ")


def human_bones():
    return [
        ("root", (0, 0, 0), (0, 0, 0.88), None),
        ("pelvis", (0, 0, 0.82), (0, 0, 1.08), "root"),
        ("spine", (0, 0, 1.03), (0, 0, 1.58), "pelvis"),
        ("chest", (0, 0, 1.4), (0, 0, 1.72), "spine"),
        ("head", (0, 0, 1.67), (0, 0, 2.07), "chest"),
        ("upper_arm.L", (-0.36, -0.08, 1.54), (-0.58, -0.27, 1.57), "chest"),
        ("forearm.L", (-0.58, -0.27, 1.57), (-0.76, -0.42, 1.60), "upper_arm.L"),
        ("hand.L", (-0.76, -0.42, 1.60), (-0.82, -0.48, 1.55), "forearm.L"),
        ("upper_arm.R", (0.36, -0.08, 1.54), (0.55, -0.27, 1.18), "chest"),
        ("forearm.R", (0.55, -0.27, 1.18), (0.72, -0.42, 1.04), "upper_arm.R"),
        ("hand.R", (0.72, -0.42, 1.04), (0.79, -0.48, 0.98), "forearm.R"),
        ("thigh.L", (-0.19, 0, 0.92), (-0.23, 0, 0.51), "pelvis"),
        ("shin.L", (-0.23, 0, 0.51), (-0.23, -0.02, 0.14), "thigh.L"),
        ("foot.L", (-0.23, -0.02, 0.14), (-0.23, -0.2, 0.08), "shin.L"),
        ("thigh.R", (0.19, 0, 0.92), (0.23, 0, 0.51), "pelvis"),
        ("shin.R", (0.23, 0, 0.51), (0.23, -0.02, 0.14), "thigh.R"),
        ("foot.R", (0.23, -0.02, 0.14), (0.23, -0.2, 0.08), "shin.R"),
    ]


def make_hero():
    coll = collection("ASHLAND | Survivor")
    arm = create_rig("Ashland survivor", coll, human_bones())
    parts = {name: [] for name, *_ in human_bones()}
    def add(bone, obj): parts[bone].append(obj)

    add("spine", ico("Survivor | torso", (0, 0, 1.31), (0.39, 0.27, 0.48), "cloth", coll, subdivisions=2))
    add("pelvis", cube("Survivor | utility belt", (0, -0.01, 0.98), (0.64, 0.34, 0.16), "rust", coll, bevel=0.055))
    add("chest", cube("Survivor | scrap cuirass", (0, -0.2, 1.38), (0.57, 0.17, 0.38), "metal", coll, bevel=0.085))
    add("spine", ico("Survivor | scarf mantle", (0, -0.11, 1.63), (0.43, 0.31, 0.17), "scarf", coll, subdivisions=2))
    add("spine", cube("Survivor | torn tabard", (0, -0.19, 0.77), (0.52, 0.09, 0.53), "bone", coll, bevel=0.025))
    add("head", ico("Survivor | hood", (0, 0.02, 1.88), (0.35, 0.31, 0.36), "bone", coll, subdivisions=2))
    add("head", ico("Survivor | hood shadow", (0, -0.19, 1.88), (0.28, 0.19, 0.28), "dark", coll, subdivisions=2))
    add("head", ico("Survivor | respirator", (0, -0.24, 1.82), (0.22, 0.12, 0.23), "metal", coll, subdivisions=2))
    add("head", cube("Survivor | respirator grille", (0, -0.35, 1.77), (0.2, 0.035, 0.08), "dark", coll, bevel=0.016))
    for side in (-1, 1):
        add("head", torus("Survivor | goggle housing", (side*0.12, -0.31, 1.97), 0.092, 0.019, "dark", coll))
        add("head", ico("Survivor | cyan lens", (side*0.12, -0.315, 1.97), (0.073, 0.04, 0.073), "cyan", coll, subdivisions=2))
        add("chest", ico("Survivor | shoulder pauldron", (side*0.42, -0.02, 1.55), (0.23, 0.25, 0.19), "metal", coll, subdivisions=1))
        add("chest", ico("Survivor | shoulder rust plate", (side*0.43, -0.2, 1.58), (0.17, 0.065, 0.12), "rust", coll, subdivisions=1))
        add("chest", ico("Survivor | reactor vial", (side*0.21, -0.3, 1.48), (0.055, 0.04, 0.16), "cyan", coll, subdivisions=2))
        # Rivet rows and segmented scrap plates make the shoulders read as assembled armor.
        for j in range(3):
            add("chest", ico("Survivor | pauldron rivet", (side*(0.34+j*0.075),-0.255,1.58-j*0.015),(0.022,0.015,0.022),"bone",coll,subdivisions=1))
        add("pelvis", cube("Survivor | field pouch", (side*0.31, -0.17, 0.96), (0.16, 0.15, 0.19), "bark_light", coll, bevel=0.025))
        add("pelvis", ico("Survivor | pouch clasp", (side*0.31, -0.25, 0.98), (0.025, 0.02, 0.025), "bone", coll, subdivisions=1))
        thigh = "thigh.L" if side < 0 else "thigh.R"
        shin = "shin.L" if side < 0 else "shin.R"
        foot = "foot.L" if side < 0 else "foot.R"
        add(thigh, ico("Survivor | padded thigh", (side*0.21, 0, 0.68), (0.19, 0.22, 0.31), "cloth", coll, subdivisions=2))
        add(thigh, cube("Survivor | knee guard", (side*0.22, -0.17, 0.48), (0.24, 0.12, 0.14), "rust", coll, bevel=0.035))
        add(shin, ico("Survivor | wrapped shin", (side*0.22, 0, 0.3), (0.14, 0.17, 0.24), "bark_light", coll, subdivisions=1))
        for band_z in (0.22, 0.36):
            add(shin, rod("Survivor | shin wrap", (side*0.22,-0.155,band_z), (side*0.22,0.155,band_z), 0.035, "rust", coll, vertices=6))
        add(foot, cube("Survivor | scavenger boot", (side*0.22, -0.11, 0.1), (0.26, 0.39, 0.17), "dark", coll, bevel=0.055))
        add(foot, cube("Survivor | boot toe plate", (side*0.22, -0.29, 0.12), (0.22, 0.07, 0.08), "metal", coll, bevel=0.025))
    for side, arm_name, forearm, hand in [(-1,"upper_arm.L","forearm.L","hand.L"),(1,"upper_arm.R","forearm.R","hand.R")]:
        if side < 0:
            shoulder, elbow, wrist, glove = (-0.38,-0.10,1.51),(-0.59,-0.30,1.56),(-0.76,-0.43,1.60),(-0.80,-0.47,1.56)
        else:
            shoulder, elbow, wrist, glove = (0.38,-0.10,1.51),(0.56,-0.30,1.18),(0.73,-0.43,1.04),(0.78,-0.47,1.00)
        add(arm_name, rod("Survivor | upper sleeve", shoulder, elbow, 0.14, "cloth", coll, radius_end=0.11))
        add(forearm, rod("Survivor | forearm guard", elbow, wrist, 0.12, "bark_light", coll, radius_end=0.09))
        add(forearm, cube("Survivor | forearm plate", ((elbow[0]+wrist[0])/2,-0.52,(elbow[2]+wrist[2])/2), (0.2,0.09,0.22), "metal", coll, bevel=0.025))
        add(hand, ico("Survivor | glove", glove, (0.11,0.12,0.11), "dark", coll, subdivisions=2))
    # Twin reactor tanks on the back, strapped to chest/spine.
    for x in (-0.39, 0.39):
        # Expose the twin canisters outside the torso for the isometric camera.
        add("spine", rod("Survivor | reactor tank", (x,0.04,1.20), (x,0.04,1.83), 0.105, "metal", coll, radius_end=0.105))
        add("spine", ico("Survivor | tank core", (x,-0.005,1.50), (0.078,0.075,0.27), "cyan", coll, subdivisions=2))
        add("spine", rod("Survivor | tank cap", (x,0.04,1.80), (x,0.04,1.91), 0.11, "rust", coll, radius_end=0.085))
        for z in (1.20,1.60):
            add("spine",torus("Survivor | tank clamp",(x,0.04,z),0.105,0.022,"rust",coll,rotation=(0,0,0)))
    for z in (1.23,1.58):
        add("spine",rod("Survivor | tank harness",(-0.24,0.26,z),(0.24,0.26,z),0.035,"rust",coll,vertices=6))
    # Layered, torn tabard panels; polygon edges intentionally irregular like the PNG reference.
    for i, (mat, outline) in enumerate([
        ("bone",[(-0.28,0.96),(-0.1,0.98),(-0.07,0.48),(-0.18,0.25),(-0.23,0.42),(-0.34,0.16),(-0.31,0.58)]),
        ("scarf",[(-0.06,0.93),(0.11,0.9),(0.16,0.42),(0.08,0.08),(0.01,0.34),(-0.04,0.2)]),
        ("bone",[(0.13,0.94),(0.29,0.91),(0.35,0.54),(0.29,0.28),(0.21,0.44),(0.17,0.21)]),
        ("scarf",[(-0.42,1.12),(-0.27,1.25),(-0.14,1.02),(-0.2,0.88),(-0.32,0.98)]),
        ("scarf",[(0.25,1.23),(0.42,1.13),(0.32,0.95),(0.21,1.02)]),
    ]):
        add("spine",poly_prism(f"Survivor | shredded cloth layer {i+1}",outline,0.055,-0.26,"bone" if mat=="bone" else "scarf",coll,bevel=0.012))
    # Cross-body straps, mask hoses and field hardware.
    add("chest",rod("Survivor | diagonal harness",(-0.29,-0.3,1.68),(0.31,-0.3,1.14),0.038,"rust",coll,vertices=7))
    add("chest",rod("Survivor | mask hose upper",(-0.14,-0.29,1.76),(-0.22,-0.38,1.52),0.026,"dark",coll,vertices=7))
    add("chest",rod("Survivor | mask hose lower",(-0.22,-0.38,1.52),(-0.16,-0.29,1.32),0.026,"dark",coll,vertices=7))
    # The character reference carries a two-ended field staff across the body.
    # Keep it as authored 3D pieces parented to the torso, not a flat image card.
    staff_a, staff_b = (-1.22,-0.42,1.92), (1.24,-0.42,0.48)
    add("spine",rod("Survivor | field staff haft",staff_a,staff_b,0.045,"bark_light",coll,vertices=10))
    add("spine",rod("Survivor | staff upper reactor",(-1.39,-0.42,2.02),(-1.13,-0.42,1.87),0.11,"cyan",coll,radius_end=0.085,vertices=10))
    add("spine",rod("Survivor | staff lower reactor",(1.13,-0.42,0.55),(1.39,-0.42,0.40),0.11,"cyan",coll,radius_end=0.085,vertices=10))
    for i in range(5):
        t=0.18+i*0.14
        x=staff_a[0]+(staff_b[0]-staff_a[0])*t
        z=staff_a[2]+(staff_b[2]-staff_a[2])*t
        add("spine",rod("Survivor | staff binding",(x-0.035,-0.42,z+0.02),(x+0.035,-0.42,z-0.02),0.018,"rust",coll,vertices=6))
    # Projected respirator beak and lower filter make the face read like the PNG.
    add("head",rod("Survivor | respirator beak",(0,-0.34,1.88),(0,-0.55,1.78),0.105,"metal",coll,radius_end=0.055,vertices=7))
    add("head",rod("Survivor | filter canister",(0,-0.48,1.76),(0,-0.48,1.67),0.075,"dark",coll,radius_end=0.06,vertices=8))
    for x in (-0.28,0.28):
        add("pelvis",cube("Survivor | belt canister",(x,-0.22,0.91),(0.1,0.12,0.22),"metal",coll,bevel=0.025))
        add("pelvis",ico("Survivor | belt clasp",(x,-0.295,0.92),(0.025,0.015,0.025),"bone",coll,subdivisions=1))
    for bone_name, objects in parts.items():
        bind(objects, arm, bone_name)
    # Hand socket points forward; game can attach weapon to this named marker.
    socket = socket_empty("socket_hand_R", coll, arm, (0.82, -0.1, 0.86))
    socket["parent_bone"] = "hand.R"
    socket.parent_type = "BONE"
    socket.parent_bone = "hand.R"
    socket.location = (0, -0.09, 0)
    for name, bone, loc in [("socket_head","head",(0,0,2.12)),("socket_back","spine",(0,0.28,1.4)),("socket_hand_L","hand.L",(-0.82,-0.1,0.86))]:
        marker = socket_empty(name, coll, arm, loc)
        marker.parent_type = "BONE"
        marker.parent_bone = bone
        marker.location = (0,0,0.12 if name == "socket_head" else 0)
    animate_rig(arm, [
        ("Ashland Survivor | Idle", [(1,{}),(9,{"spine":(0.02,0,0),"chest":(-0.015,0,0)}),(17,{}),(25,{"spine":(-0.01,0,0)}),(33,{})], 33),
        ("Ashland Survivor | Walk", [(1,{"upper_arm.L":(0.38,0,0),"upper_arm.R":(-0.38,0,0),"thigh.L":(-0.42,0,0),"thigh.R":(0.42,0,0)}),(9,{"upper_arm.L":(-0.38,0,0),"upper_arm.R":(0.38,0,0),"thigh.L":(0.42,0,0),"thigh.R":(-0.42,0,0)}),(17,{"upper_arm.L":(0.38,0,0),"upper_arm.R":(-0.38,0,0),"thigh.L":(-0.42,0,0),"thigh.R":(0.42,0,0)})],17),
    ])
    deselect_all()
    for obj in coll.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    if not globals().get("RENDER_ONLY", False):
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "ashland-survivor.blend"))
    export_glb(OUT / "ashland-survivor.glb", "Ashland Survivor | ")


def beast_bones():
    return [
        ("root", (0,0,0), (0,0,0.55), None), ("body", (0,0,0.55), (0,0,1.0), "root"),
        ("head", (0,-0.35,0.83), (0,-0.78,0.85), "body"), ("tail", (0,0.55,0.8), (0,1.0,0.92), "body"),
        ("leg.FL", (-0.29,-0.38,0.55), (-0.36,-0.42,0.1), "body"), ("leg.FR", (0.29,-0.38,0.55), (0.36,-0.42,0.1), "body"),
        ("leg.BL", (-0.29,0.36,0.55), (-0.36,0.42,0.1), "body"), ("leg.BR", (0.29,0.36,0.55), (0.36,0.42,0.1), "body"),
    ]


def make_stalker():
    coll = collection("ASHLAND | Radioactive Stalker")
    arm = create_rig("Ashland stalker", coll, beast_bones())
    parts = {name: [] for name, *_ in beast_bones()}
    def add(bone, obj): parts[bone].append(obj)
    add("body", ico("Stalker | massive ribcage", (0,0.10,0.78), (0.62,1.12,0.50), "hide", coll, subdivisions=3))
    add("body", ico("Stalker | shoulder hump", (0,-0.32,0.90), (0.66,0.57,0.48), "bark", coll, subdivisions=2))
    add("body", ico("Stalker | armored haunches", (0,0.67,0.73), (0.64,0.59,0.43), "hide", coll, subdivisions=2))
    add("body", ico("Stalker | plated spine", (0,0.12,1.12), (0.46,0.86,0.30), "bark", coll, subdivisions=2))
    add("head", ico("Stalker | tapered skull", (0,-0.72,0.94), (0.33,0.43,0.29), "hide", coll, subdivisions=3))
    # Tapered swept muzzle gives the head a canine profile instead of a bear mask.
    add("head", organic_tube("Stalker | long muzzle", [(0,-0.83,0.84),(0,-1.08,0.82),(0,-1.36,0.77),(0,-1.57,0.72)], [0.27,0.235,0.155,0.095], "dark", coll, sides=10, phase=0.18))
    add("head", ico("Stalker | open mouth cavity", (0,-1.17,0.635), (0.205,0.075,0.105), "dark", coll, subdivisions=2))
    add("head", organic_tube("Stalker | lower jaw", [(0,-0.66,0.57),(0,-0.98,0.53),(0,-1.29,0.54),(0,-1.47,0.60)], [0.19,0.16,0.10,0.025], "hide", coll, sides=11, phase=0.4))
    for side in (-1,1):
        add("head", rod("Stalker | tusk", (side*0.14,-1.0,0.72), (side*0.13,-1.06,0.52), 0.055, "bone", coll, radius_end=0.008, vertices=6))
        # Torn ear/crest silhouettes and paired mouth fangs.
        add("head",rod("Stalker | ear spike",(side*0.22,-0.5,1.03),(side*0.43,-0.52,1.38),0.14,"hide",coll,radius_end=0.012,vertices=5))
        add("head",ico("Stalker | eye socket",(side*0.205,-0.91,1.035),(0.12,0.075,0.105),"dark",coll,subdivisions=2))
        add("head",ico("Stalker | cyan eye lens",(side*0.215,-0.975,1.04),(0.078,0.045,0.068),"cyan",coll,subdivisions=2))
        add("head",ico("Stalker | nose pad",(side*0.065,-1.555,0.77),(0.075,0.06,0.055),"dark",coll,subdivisions=1))
    for i, (x,y,z) in enumerate([(-0.18,-0.91,0.70),(-0.10,-1.05,0.69),(0,-1.14,0.68),(0.10,-1.05,0.69),(0.18,-0.91,0.70),(-0.15,-1.02,0.55),(-0.05,-1.15,0.54),(0.05,-1.15,0.54),(0.15,-1.02,0.55)]):
        add("head",rod(f"Stalker | exposed tooth {i+1}",(x,y,z+0.07),(x*0.96,y-0.03,z-0.08),0.032,"bone",coll,radius_end=0.004,vertices=5))
    for side in (-1,1):
        add("head",rod("Stalker | long upper fang",(side*0.15,-1.04,0.78),(side*0.13,-1.12,0.48),0.065,"bone",coll,radius_end=0.006,vertices=7))
    for i, (x,y,z,h) in enumerate([(-0.38,0.48,1.25,0.42),(0,0.55,1.32,0.55),(0.38,0.48,1.25,0.42),(-0.32,0.12,1.34,0.39),(0.32,0.12,1.34,0.39),(-0.25,-0.2,1.29,0.33),(0.25,-0.2,1.29,0.33)]):
        add("body", ico(f"Stalker | fractured crystal plate {i+1}",(x,y,z),(0.25,0.30,0.24),"bark_light" if i%2 else "rust",coll,subdivisions=1))
        shard_mat = "cyan" if i in (1,3,5) else ("rust" if i%2 else "bark_light")
        add("body", rod(f"Stalker | dorsal shard {i+1}", (x,y,z-0.12), (x*1.22,y+0.1,z+h), 0.17, shard_mat, coll, radius_end=0.006, vertices=5))
    # Layered spines rise in a broken ridge from skull to tail, matching the reference silhouette.
    for i, (x,y,z,h) in enumerate([(-0.31,0.15,1.06,0.28),(0.31,0.15,1.06,0.28),(-0.3,-0.18,1.04,0.24),(0.3,-0.18,1.04,0.24),(-0.2,0.68,0.98,0.34),(0.2,0.68,0.98,0.32),(0,0.88,0.94,0.3)]):
        add("body",rod(f"Stalker | broken dorsal crest {i+1}",(x,y,z),(x*1.15,y+0.08,z+h),0.11,"rust" if i%3 else "bark_light",coll,radius_end=0.004,vertices=5))
    # Glowing fissures travel from shoulder through ribs; emissive geometry stays readable in-game.
    for i, points in enumerate([
        [(-0.38,-0.38,0.9),(-0.28,-0.48,0.83),(-0.2,-0.49,0.68)],
        [(0.38,-0.38,0.9),(0.28,-0.48,0.83),(0.2,-0.49,0.68)],
        [(-0.25,-0.49,0.68),(-0.08,-0.5,0.62),(0.1,-0.49,0.69)],
        [(0.02,-0.5,0.68),(0.08,-0.48,0.82),(0.16,-0.44,0.91)],
    ]):
        for j,(a,b) in enumerate(zip(points,points[1:])):
            add("body",rod(f"Stalker | radioactive crack {i+1}.{j+1}",a,b,0.027,"cyan",coll,radius_end=0.012,vertices=6))
    for i,(x,y,z) in enumerate([(-0.35,-0.44,0.84),(0.35,-0.44,0.84),(-0.14,-0.5,0.71),(0.12,-0.5,0.72)]):
        add("body",ico(f"Stalker | crystal nodule {i+1}",(x,y,z),(0.07,0.035,0.08),"cyan",coll,subdivisions=1))
    for bone, x, y in [("leg.FL",-0.31,-0.4),("leg.FR",0.31,-0.4),("leg.BL",-0.31,0.38),("leg.BR",0.31,0.38)]:
        shoulder_y = y - 0.14 if y < 0 else y + 0.12
        add(bone, ico("Stalker | powerful shoulder",(x,shoulder_y,0.68),(0.29,0.34,0.38),"hide",coll,subdivisions=2))
        add(bone, rod("Stalker | articulated leg", (x,y,0.69), (x*1.35,y-0.06,0.18), 0.22, "hide", coll, radius_end=0.12, vertices=8))
        add(bone, ico("Stalker | claw paw", (x*1.35,y-0.17,0.13), (0.21,0.28,0.12), "dark", coll, subdivisions=2))
        for claw in (-1,1):
            add(bone, rod("Stalker | talon", (x*1.35+claw*0.09,y-0.32,0.14), (x*1.35+claw*0.10,y-0.46,0.035), 0.05, "bone", coll, radius_end=0.005, vertices=5))
    add("tail", rod("Stalker | segmented tail", (0,0.48,0.78), (0,1.22,0.98), 0.16, "hide", coll, radius_end=0.025, vertices=7))
    add("tail", ico("Stalker | tail barb", (0,1.28,0.99), (0.12,0.16,0.09), "rust", coll, subdivisions=1))
    add("body", ico("Stalker | irradiated core", (0,-0.16,0.83), (0.19,0.11,0.19), "cyan", coll, subdivisions=2))
    for bone_name, objects in parts.items(): bind(objects, arm, bone_name)
    socket_empty("socket_core", coll, arm, (0,-0.16,0.83))["parent_bone"] = "body"
    animate_rig(arm, [
        ("Ashland Stalker | Idle", [(1,{}),(7,{"head":(0.025,0,0),"tail":(-0.04,0,0)}),(13,{}),(19,{"head":(-0.018,0,0),"tail":(0.04,0,0)}),(25,{})],25),
        ("Ashland Stalker | Walk", [(1,{"leg.FL":(0.42,0,0),"leg.FR":(-0.42,0,0),"leg.BL":(-0.42,0,0),"leg.BR":(0.42,0,0)}),(7,{"leg.FL":(-0.42,0,0),"leg.FR":(0.42,0,0),"leg.BL":(0.42,0,0),"leg.BR":(-0.42,0,0)}),(13,{"leg.FL":(0.42,0,0),"leg.FR":(-0.42,0,0),"leg.BL":(-0.42,0,0),"leg.BR":(0.42,0,0)})],13),
    ])
    deselect_all()
    for obj in coll.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    if not globals().get("RENDER_ONLY", False):
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "ashland-stalker.blend"))
    export_glb(OUT / "ashland-stalker.glb", "Ashland Stalker | ")


def make_preview():
    preview = collection("PREVIEW | all four assets")
    shifts = {"ASHLAND | Ashroot tree": -4.2, "ASHLAND | Weapon": -1.4, "ASHLAND | Survivor": 1.35, "ASHLAND | Radioactive Stalker": 4.7}
    for coll_name, shift in shifts.items():
        coll = bpy.data.collections[coll_name]
        for obj in coll.objects:
            if obj.parent is None:
                obj.location.x += shift
                if coll_name == "ASHLAND | Radioactive Stalker" and obj.type == "ARMATURE":
                    obj.rotation_euler.z = math.radians(38)
    bpy.ops.mesh.primitive_plane_add(size=16, location=(0,0,-0.02))
    floor = move_to_collection(bpy.context.object, preview)
    floor.name = "Preview floor"
    materialize(floor, "ground")
    bpy.ops.object.camera_add(location=(-6.0,-14.0,5.2))
    camera = move_to_collection(bpy.context.object, preview)
    camera.name = "Preview camera"
    target = Vector((0,0,1.0))
    camera.rotation_euler = (target- camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 12.5
    SCENE.camera = camera
    for name, loc, power, size in [("Key",(-4,-6,9),1700,7),("Fill",(5,-1,6),1000,5),("Rim",(1,5,6),2100,5)]:
        bpy.ops.object.light_add(type="AREA", location=loc)
        light = move_to_collection(bpy.context.object, preview)
        light.name = name
        light.data.energy = power
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (Vector((0,0,1))-light.location).to_track_quat("-Z","Y").to_euler()
    SCENE.world.color = (0.12,0.12,0.12)
    # Workbench keeps review renders deterministic and avoids EEVEE driver crashes on some PCs.
    SCENE.render.engine = "BLENDER_WORKBENCH"
    SCENE.display.shading.color_type = "MATERIAL"
    SCENE.display.shading.light = "STUDIO"
    SCENE.display.shading.show_shadows = True
    SCENE.display.shading.show_cavity = True
    SCENE.display.shading.cavity_type = "BOTH"
    SCENE.display.shading.background_type = "WORLD"
    SCENE.render.image_settings.file_format = "PNG"
    SCENE.render.filepath = str(OUT / "ashland-pack-preview.png")
    SCENE.render.resolution_percentage = 100
    SCENE.frame_set(1)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "ashland-pack.blend"))


def main():
    # Keep Blender's default startup objects out of exports.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        if coll.name != "Collection":
            bpy.data.collections.remove(coll)
    make_tree()
    make_weapon()
    make_hero()
    make_stalker()
    make_preview()
    print("ASHLAND_ASSETS_READY", *(str(path) for path in sorted(OUT.glob("*"))))


if __name__ == "__main__":
    main()

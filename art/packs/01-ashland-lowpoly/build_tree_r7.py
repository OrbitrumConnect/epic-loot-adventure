"""R7 Ashroot tree: branch anatomy follows the concept silhouette, with a real 3D volume.

Run in Blender 5.2 from the repository root:
  blender --background --factory-startup --python-exit-code 1 \
    --python art/packs/01-ashland-lowpoly/build_tree_r7.py
"""
from pathlib import Path
import sys
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
STAGE = next((arg for arg in sys.argv[sys.argv.index("--") + 1:] if arg.startswith("r") and arg[1:].isdigit()), "r7") if "--" in sys.argv else "r7"
OUT = ROOT / "models" / f"{STAGE}-tree-turnaround"
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT))
import build_blender_assets as base

base.OUT = OUT
scene = base.SCENE
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 960
scene.render.resolution_y = 960
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"

coll = base.collection("ASHLAND R7 | Ashroot")
parts = []


def branch(name, points, radii, mat="bark", sides=14, phase=0.0):
    anchors=[Vector(p) for p in points]; centers=[]; widths=[]; steps=6
    for i in range(len(anchors)-1):
        p0,p1,p2,p3=anchors[max(0,i-1)],anchors[i],anchors[i+1],anchors[min(len(anchors)-1,i+2)]
        r0,r1,r2,r3=radii[max(0,i-1)],radii[i],radii[i+1],radii[min(len(radii)-1,i+2)]
        for step in range(steps):
            t=step/steps; t2=t*t; t3=t2*t
            centers.append(0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3))
            widths.append(0.5*((2*r1)+(-r0+r2)*t+(2*r0-5*r1+4*r2-r3)*t2+(-r0+3*r1-3*r2+r3)*t3))
    centers.append(anchors[-1]); widths.append(radii[-1]); verts=[]; faces=[]
    for i,c in enumerate(centers):
        tangent=(centers[min(i+1,len(centers)-1)]-centers[max(0,i-1)]).normalized()
        axis_a=tangent.cross(Vector((0,1,0)))
        if axis_a.length<1e-5: axis_a=tangent.cross(Vector((1,0,0)))
        axis_a.normalize(); axis_b=tangent.cross(axis_a).normalized()
        for j in range(sides):
            a=2*math.pi*j/sides+phase; uneven=1+0.035*math.sin(j*5.3+i*0.19)
            verts.append(tuple(c+(axis_a*math.cos(a)+axis_b*math.sin(a))*widths[i]*uneven))
    for i in range(len(centers)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides; faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(centers)-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(name+" | untwisted mesh"); mesh.from_pydata(verts,[],faces); mesh.update()
    for poly in mesh.polygons: poly.use_smooth=True
    obj=bpy.data.objects.new(name,mesh); coll.objects.link(obj); base.materialize(obj,mat)
    obj["ashroot_projected_bark"] = True
    parts.append(obj)
    return obj


# Main trunk: irregular growth, strong root flare, several breaks and a left-bending crown.
branch("Ashroot R7 | fused twisting trunk",
       [(0.02,0,0.04),(-0.10,0.02,0.35),(-0.05,0.0,0.72),(0.16,0.02,1.08),
        (0.18,0.0,1.43),(0.04,0.03,1.78),(-0.02,0,2.12),(0.08,0.02,2.46),
        (-0.12,0.03,2.82),(-0.22,0.0,3.17),(-0.20,0.02,3.52),(-0.16,0.0,3.83),
        (-0.11,0.0,4.08),(-0.08,0.01,4.28),(-0.20,0,4.43)],
       [0.73,0.68,0.60,0.52,0.47,0.41,0.38,0.34,0.29,0.25,0.22,0.19,0.15,0.10,0.025],
       sides=18, phase=0.31)

# Wide left arm with a broken, rising fork; asymmetry mirrors the silhouette PNG.
branch("Ashroot R7 | long left bough",
       [(-0.10,0.02,2.55),(-0.40,0.0,2.90),(-0.78,-0.02,3.12),(-1.18,0.0,3.18),
        (-1.58,0.02,3.10),(-1.92,0.0,3.12),(-2.18,-0.01,3.18),(-2.31,0,3.28),
        (-2.48,0.02,3.38)],
       [0.34,0.31,0.27,0.23,0.19,0.15,0.12,0.075,0.018],
       mat="bark", sides=14, phase=0.2)
branch("Ashroot R7 | left fork",
       [(-1.50,0.0,3.10),(-1.58,0.07,3.34),(-1.72,0.10,3.55),(-1.90,0.12,3.66)],
       [0.18,0.12,0.07,0.016], sides=11, phase=0.61)

# Right arm reaches high and outward; a second tine rises from its outer third.
branch("Ashroot R7 | sweeping right bough",
       [(0.02,0.0,2.36),(0.34,0.02,2.62),(0.76,0.0,2.82),(1.16,-0.02,2.98),
        (1.56,0.0,3.12),(1.93,0.02,3.16),(2.24,0,3.24),(2.48,0.02,3.40),
        (2.62,0.0,3.58)],
       [0.34,0.30,0.26,0.22,0.18,0.145,0.115,0.07,0.016],
       sides=15, phase=0.42)
branch("Ashroot R7 | right fork",
       [(1.42,0.02,3.07),(1.55,0.02,3.30),(1.72,0.01,3.52),(1.73,0,3.68)],
       [0.17,0.12,0.07,0.015], sides=11, phase=0.8)

# Short snapped limbs and rear limbs give the tree volume beyond the front silhouette.
for i, (a,b,c,d) in enumerate([
    ((-0.04,0.0,1.68),(-0.52,0.22,2.08),(-0.77,0.27,2.42),(-0.95,0.32,2.55)),
    ((0.04,0.02,1.22),(0.42,0.25,1.59),(0.59,0.29,1.93),(0.70,0.30,2.08)),
    ((0.13,0.02,2.15),(0.53,0.25,2.32),(0.82,0.30,2.45),(1.04,0.34,2.72)),
    ((-0.21,0.01,2.75),(-0.52,0.24,3.02),(-0.72,0.29,3.26),(-0.82,0.32,3.48)),
]):
    branch(f"Ashroot R7 | rear broken limb {i+1}",[a,b,c,d],[0.22,0.17,0.10,0.018],
           mat="bark", sides=10, phase=i*0.57)

# Roots fan over ground, with taper and a raised shoulder into the trunk.
for i, (x,y) in enumerate([(-1.72,-0.12),(-1.40,0.56),(-0.72,-0.62),(0.78,-0.58),(1.55,0.42),(1.82,-0.05)]):
    branch(f"Ashroot R7 | exposed root {i+1}",
           [(x,y,0.035),(x*0.76,y*0.70,0.12),(x*0.50,y*0.44,0.25),(x*0.23,y*0.20,0.49),(0.02,0.0,0.92)],
           [0.035,0.105,0.19,0.24,0.17], mat="bark", sides=11, phase=i*0.41)

# Hollow heart and branching radioactive seams on the forward side.
parts.append(base.ico("Ashroot R7 | black heart hollow", (0.10,-0.375,2.30), (0.34,0.075,0.44), "dark", coll, subdivisions=2))
for i, (a,b,r) in enumerate([
    ((0.02,-0.455,1.87),(0.10,-0.455,2.15),0.032),
    ((0.10,-0.455,2.15),(0.04,-0.455,2.38),0.026),
    ((0.04,-0.455,2.38),(0.18,-0.455,2.64),0.023),
    ((0.08,-0.455,2.17),(-0.22,-0.435,2.31),0.022),
    ((0.12,-0.455,2.44),(0.41,-0.425,2.60),0.021),
    ((0.16,-0.45,2.62),(0.06,-0.425,2.91),0.018),
    ((0.39,-0.425,2.58),(0.57,-0.405,2.81),0.014),
    ((-0.2,-0.43,2.30),(-0.38,-0.40,2.50),0.014),
]):
    parts.append(base.rod(f"Ashroot R7 | cyan fracture {i+1}",a,b,r,"cyan",coll,
                          radius_end=r*0.42,vertices=7))

# Cyan sap leaks from branch undersides as tapered hanging cords and droplets.
for i, (x,y,top,bottom) in enumerate([
    (-1.28,-0.10,3.17,2.30),(-0.57,-0.13,3.18,2.60),(0.58,-0.13,2.78,2.10),
    (1.33,-0.12,3.05,2.68),(2.17,-0.08,3.28,2.42),(-0.05,-0.16,4.12,3.57),
]):
    parts.append(base.rod(f"Ashroot R7 | hanging cyan sap {i+1}",(x,y,top),(x,y,bottom),
                          0.048,"cyan",coll,radius_end=0.007,vertices=8))
    parts.append(base.ico(f"Ashroot R7 | sap drop {i+1}",(x,y,bottom-0.055),
                          (0.055,0.045,0.09),"cyan",coll,subdivisions=1))

# Front image contributes exact bark/color detail only to front-facing real mesh surfaces.
image = bpy.data.images.load(str((ROOT / "tree.png").resolve()), check_existing=False)
image.pack()
texture = bpy.data.materials.new("Ashroot R7 | front reference projection")
texture.use_nodes = True
texture.surface_render_method = "DITHERED"
tex_nodes = texture.node_tree.nodes
links = texture.node_tree.links
bsdf = next(n for n in tex_nodes if n.type == "BSDF_PRINCIPLED")
tex = tex_nodes.new("ShaderNodeTexImage")
tex.image = image
tex.interpolation = "Linear"
mix = tex_nodes.new("ShaderNodeMixRGB")
mix.blend_type = "MIX"
mix.inputs[1].default_value = (0.075, 0.045, 0.028, 1)
links.new(tex.outputs["Alpha"], mix.inputs[0])
links.new(tex.outputs["Color"], mix.inputs[2])
links.new(mix.outputs[0], bsdf.inputs["Base Color"])
# Reference alpha selects pigment only; it must never punch holes in the volume.
bsdf.inputs["Roughness"].default_value = 0.88

X_MIN, X_MAX = -2.48, 2.62
Z_MIN, Z_MAX = 0.0, 4.45
for ob in parts:
    if ob.type != "MESH":
        continue
    ob.data.materials.append(texture)
    uv = ob.data.uv_layers.new(name="Ashroot front-projection UV")
    for poly in ob.data.polygons:
        if ob.get("ashroot_projected_bark") or poly.normal.y < -0.18:
            poly.material_index = len(ob.data.materials) - 1
        else:
            poly.material_index = 0
        for li in poly.loop_indices:
            co = ob.matrix_world @ ob.data.vertices[ob.data.loops[li].vertex_index].co
            u = (co.x-X_MIN)/(X_MAX-X_MIN)
            v = (co.z-Z_MIN)/(Z_MAX-Z_MIN)
            uv.data[li].uv = (u,v)

# Four orthographic reviews, independent of the user's live Blender scene.
setup = bpy.data.collections.new(f"{STAGE.upper()} | render setup")
scene.collection.children.link(setup)
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (0.018,0.022,0.028,1)
bg.inputs["Strength"].default_value = 0.32
cam_data = bpy.data.cameras.new("Ashroot R7 review camera")
cam = bpy.data.objects.new("Ashroot R7 review camera",cam_data)
setup.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 5.4
scene.camera = cam

def look_at(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()

for name, loc, power, size in (("Key",(-3,-5,7),320,5),("Fill",(4,-2,5),120,4),("Rim",(0,4,6),260,4)):
    ld=bpy.data.lights.new(name,"AREA")
    ld.energy,ld.shape,ld.size=power,"DISK",size
    light=bpy.data.objects.new(name,ld)
    setup.objects.link(light)
    light.location=loc
    look_at(light,(0,0,2.2))

for name, loc in (("front",(0,-9,2.2)),("side",(9,0,2.2)),("back",(0,9,2.2)),("threequarter",(6,-8,2.2))):
    cam.location=loc
    look_at(cam,(0,0,2.2))
    scene.render.filepath=str(OUT/f"ashroot-{STAGE}-{name}.png")
    bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action="DESELECT")
for ob in parts:
    ob.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/f"ashroot-tree-{STAGE}.glb"),export_format="GLB",
                           use_selection=True,export_materials="EXPORT",export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f"ashroot-tree-{STAGE}.blend"))
print(f"ASHROOT_{STAGE.upper()}_RESULT",{"objects":len(parts),"verts":sum(len(o.data.vertices) for o in parts if o.type=="MESH"),
      "faces":sum(len(o.data.polygons) for o in parts if o.type=="MESH"),"glb":str(OUT/f"ashroot-tree-{STAGE}.glb")})

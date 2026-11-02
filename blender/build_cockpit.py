"""
Builds the player cockpit in a dedicated "Cockpit" scene and exports it as GLB.

Conventions (Blender space, metres):
  * geometry is laid out around a reference point at the origin; the pilot's eye
    sits at EYE (exported as an empty named "Eye", which the game puts the camera on)
  * forward = -Y, up = +Z, pilot's right = -X   (glTF export maps -Y -> +Z, Z -> +Y,
    which matches the game's ship-local axes: +Z forward, +Y up)
  * dashboard displays are meshes named Screen_<id> with a full 0..1 UV quad
    and custom props  screen=<id>, aspect=<w/h>  (exported as glTF extras)
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector

# Pilot eye position relative to the layout origin. +Y = back, +Z = up (metres).
# This is the only thing to change to move the in-game cockpit camera.
EYE = Vector((0.0, 0.20, 0.12))

EXPORT_GLB = r"C:\Users\Eric\source\repos\neptune-century-studios\solar-system-simulator\src\assets\models\cockpit\cockpit.glb"

# ── fresh scene (leaves the user's other scenes alone) ───────────────────────
old = bpy.data.scenes.get("Cockpit")
if old:
    for o in list(old.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(old)
scn = bpy.data.scenes.new("Cockpit")
WIN = bpy.context.window or bpy.context.window_manager.windows[0]
WIN.scene = scn
scn.unit_settings.system = 'METRIC'
col = scn.collection

# ── materials ───────────────────────────────────────────────────────────────
def mat(name, color, metal=0.0, rough=0.5, emit=None, strength=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m

M_HULL   = mat("Cockpit_Hull",   (0.075, 0.08, 0.09), 0.35, 0.55)
M_PANEL  = mat("Cockpit_Panel",  (0.035, 0.04, 0.045), 0.2, 0.7)
M_FRAME  = mat("Cockpit_Frame",  (0.12, 0.125, 0.135), 0.6, 0.35)
M_TRIM   = mat("Cockpit_Trim",   (0.85, 0.32, 0.04), 0.1, 0.5)
M_CYAN   = mat("Cockpit_LightCyan",  (0, 0.2, 0.18), 0, 0.4, (0.0, 1.0, 0.8), 4.0)
M_AMBER  = mat("Cockpit_LightAmber", (0.2, 0.1, 0), 0, 0.4, (1.0, 0.55, 0.05), 4.0)
M_RED    = mat("Cockpit_LightRed",   (0.2, 0, 0), 0, 0.4, (1.0, 0.08, 0.05), 4.0)
M_SCREEN = mat("Cockpit_Screen", (0.0, 0.0, 0.0), 0, 0.2, (0.0, 0.05, 0.05), 1.0)
M_GRIP   = mat("Cockpit_Grip",   (0.02, 0.02, 0.02), 0.0, 0.85)

# ── helpers ─────────────────────────────────────────────────────────────────
def link(name, me, material=None, bevel=0.0):
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if material:
        me.materials.append(material)
    if bevel > 0:
        mod = ob.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        ob.modifiers.new("WN", 'WEIGHTED_NORMAL')
    return ob

def box(name, center, size, material, bevel=0.006, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(name, me, material, bevel)
    ob.location = center
    ob.rotation_euler.z = rot_z
    return ob

def cyl(name, p0, p1, radius, material, verts=16):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius,
                          radius2=radius, depth=d.length)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = link(name, me, material)
    ob.location = (p0 + p1) / 2
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return ob

def sphere(name, c, r, material):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = link(name, me, material)
    ob.location = c
    return ob

def tube(name, pts, radius, material):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.resolution_u = 12
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cu)
    col.objects.link(ob)
    cu.materials.append(material)
    return ob

def quad(name, a, b, c, d, material, uv=True):
    """a=bottom-left, b=bottom-right, c=top-right, d=top-left (as seen by the pilot)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([a, b, c, d], [], [(0, 1, 2, 3)])
    me.update()
    if uv:
        uvl = me.uv_layers.new(name="UVMap")
        for loop, co in zip(me.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            uvl.data[loop.index].uv = co
    return link(name, me, material)

# ── dashboard: a profile swept along a 4-point path (two angled wings) ──────
# Side-view profile (y, z). Index 2 -> 3 is the sloped screen face.
PROFILE = [
    (-1.15, -0.06),   # 0 front, under canopy glass
    (-0.73, -0.055),  # 1 glareshield back edge (hood over the screens)
    (-0.755, -0.10),  # 2 screen face top    (~7.5 deg below eye line)
    (-0.645, -0.32),  # 3 screen face bottom (~26 deg, inside the 30 deg half-FOV)
    (-0.60, -0.35),   # 4 lower lip
    (-0.60, -0.80),   # 5 knee panel bottom
    (-1.15, -0.80),   # 6 front bottom
]
# Path from the pilot's left to right, with a swept-back offset for the wing facets:
# (lateral, y_offset). Lateral is "+ = pilot's right", which is Blender -X.
PATH = [(-0.86, 0.27), (-0.34, 0.0), (0.34, 0.0), (0.86, 0.27)]

def P(i_path, i_prof):
    lat, yo = PATH[i_path]
    y, z = PROFILE[i_prof]
    return Vector((-lat, y + yo, z))

bm = bmesh.new()
grid = [[bm.verts.new(P(i, j)) for j in range(len(PROFILE))] for i in range(len(PATH))]
n = len(PROFILE)
for i in range(len(PATH) - 1):
    for j in range(n):
        k = (j + 1) % n
        bm.faces.new((grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]))
bm.faces.new([grid[0][j] for j in range(n)])
bm.faces.new([grid[-1][j] for j in reversed(range(n))])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("Dashboard")
bm.to_mesh(me)
bm.free()
dash = link("Dashboard", me, M_HULL, bevel=0.008)

def facet_point(i_path, u, v, lift=0.004):
    """Point on the screen face of facet i_path..i_path+1. u: 0..1 left->right, v: 0 bottom..1 top."""
    a0, a1 = P(i_path, 3), P(i_path + 1, 3)          # bottom edge
    b0, b1 = P(i_path, 2), P(i_path + 1, 2)          # top edge
    bot = a0.lerp(a1, u)
    top = b0.lerp(b1, u)
    p = bot.lerp(top, v)
    nrm = (a1 - a0).cross(b0 - a0).normalized()
    if nrm.y < 0:          # face the pilot (+Y side)
        nrm = -nrm
    return p + nrm * lift

def facet_size(i_path):
    w = (P(i_path + 1, 3) - P(i_path, 3)).length
    h = (P(i_path, 2) - P(i_path, 3)).length
    return w, h

def screen(name, ident, i_path, u0, u1, v0, v1):
    a = facet_point(i_path, u0, v0)
    b = facet_point(i_path, u1, v0)
    c = facet_point(i_path, u1, v1)
    d = facet_point(i_path, u0, v1)
    ob = quad(name, a, b, c, d, M_SCREEN)
    w, h = facet_size(i_path)
    ob["screen"] = ident
    ob["aspect"] = round(((u1 - u0) * w) / ((v1 - v0) * h), 4)
    # bezel just behind the glass
    ba = facet_point(i_path, u0 - 0.015, v0 - 0.06, 0.002)
    bb = facet_point(i_path, u1 + 0.015, v0 - 0.06, 0.002)
    bc = facet_point(i_path, u1 + 0.015, v1 + 0.06, 0.002)
    bd = facet_point(i_path, u0 - 0.015, v1 + 0.06, 0.002)
    quad(name + "_Bezel", ba, bb, bc, bd, M_PANEL, uv=False)
    return ob

# centre facet: big flight display + small target display
screen("Screen_Speed", "speed", 1, 0.30, 0.78, 0.10, 0.90)
screen("Screen_Target", "target", 1, 0.03, 0.27, 0.12, 0.88)
# wing facets
screen("Screen_Nav", "nav", 0, 0.06, 0.94, 0.10, 0.90)
screen("Screen_Status", "status", 2, 0.06, 0.94, 0.10, 0.90)

# button cluster to the right of the flight display
for r in range(3):
    for c in range(2):
        u = 0.83 + c * 0.075
        v = 0.25 + r * 0.25
        p = facet_point(1, u, v, 0.008)
        m = [M_CYAN, M_AMBER, M_RED][(r + c) % 3] if (r, c) != (1, 1) else M_PANEL
        b = box(f"Button_{r}_{c}", p, (0.035, 0.012, 0.028), m, bevel=0.002)
        b.rotation_euler.x = math.atan2(0.11, 0.22)

# light strip along the lower lip of the dash
for i in range(len(PATH) - 1):
    a = P(i, 4) + Vector((0, 0.004, 0.006))
    b = P(i + 1, 4) + Vector((0, 0.004, 0.006))
    cyl(f"LightStrip_{i}", a, b, 0.004, M_CYAN, verts=8)
# orange trim along the glareshield edge
for i in range(len(PATH) - 1):
    cyl(f"Trim_{i}", P(i, 1) + Vector((0, 0.005, 0.004)),
        P(i + 1, 1) + Vector((0, 0.005, 0.004)), 0.007, M_TRIM, verts=10)

# ── side consoles ───────────────────────────────────────────────────────────
for side in (-1, 1):
    s = "L" if side < 0 else "R"
    box(f"Console_{s}", (side * 0.72, -0.12, -0.56), (0.30, 0.80, 0.32), M_HULL, bevel=0.012)
    box(f"ConsoleTop_{s}", (side * 0.72, -0.12, -0.395), (0.26, 0.74, 0.012), M_PANEL, bevel=0.003)
    for k in range(4):
        box(f"ConsoleLight_{s}_{k}", (side * 0.66, -0.38 + k * 0.09, -0.385),
            (0.04, 0.025, 0.008), [M_CYAN, M_AMBER, M_CYAN, M_RED][k], bevel=0.002)
    box(f"Sill_{s}", (side * 0.86, -0.10, -0.15), (0.06, 1.30, 0.10), M_HULL, bevel=0.01)
    box(f"SillTrim_{s}", (side * 0.83, -0.10, -0.098), (0.012, 1.30, 0.008), M_TRIM, bevel=0.002)

# throttle (left) and stick (centre)
cyl("ThrottleRail", (0.62, -0.30, -0.39), (0.62, 0.05, -0.39), 0.012, M_FRAME)
cyl("ThrottleArm", (0.62, -0.10, -0.39), (0.60, -0.12, -0.27), 0.015, M_FRAME)
box("ThrottleGrip", (0.60, -0.12, -0.25), (0.05, 0.08, 0.06), M_GRIP, bevel=0.012)
box("ThrottleButton", (0.60, -0.155, -0.235), (0.02, 0.012, 0.015), M_RED, bevel=0.003)
cyl("StickBoot", (0, -0.20, -0.80), (0, -0.20, -0.70), 0.06, M_GRIP)
cyl("StickShaft", (0, -0.20, -0.72), (0, -0.23, -0.50), 0.014, M_FRAME)
cyl("StickGrip", (0, -0.23, -0.50), (0, -0.25, -0.40), 0.026, M_GRIP)
sphere("StickTrigger", (0, -0.275, -0.43), 0.012, M_RED)

# ── canopy frame ────────────────────────────────────────────────────────────
for side in (-1, 1):
    s = "L" if side < 0 else "R"
    tube(f"Pillar_{s}", [(side * 0.80, -0.88, -0.06), (side * 0.68, -0.68, 0.28),
                         (side * 0.44, -0.20, 0.56), (side * 0.12, 0.30, 0.68)], 0.028, M_FRAME)
tube("RearHoop", [(-0.86, 0.32, -0.10), (-0.66, 0.32, 0.42), (0.0, 0.32, 0.72),
                  (0.66, 0.32, 0.42), (0.86, 0.32, -0.10)], 0.04, M_FRAME)

# ── rear bulkhead, headrest, floor ──────────────────────────────────────────
box("Bulkhead", (0, 0.62, -0.20), (1.70, 0.08, 1.30), M_HULL, bevel=0.02)
box("Headrest", (0, 0.30, 0.02), (0.36, 0.14, 0.36), M_GRIP, bevel=0.03)
box("SeatBack", (0, 0.36, -0.42), (0.52, 0.16, 0.70), M_GRIP, bevel=0.03)
box("Floor", (0, -0.20, -0.86), (1.70, 1.80, 0.06), M_PANEL, bevel=0.01)

# ── convert curves to meshes (no operators: safe from any context) ───────────
with bpy.context.temp_override(window=WIN, scene=scn, view_layer=scn.view_layers[0]):
    deps = bpy.context.evaluated_depsgraph_get()
for ob in list(col.objects):
    if ob.type != 'CURVE':
        continue
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps))
    for p in me.polygons:
        p.use_smooth = True
    mesh_ob = bpy.data.objects.new(ob.name, me)
    mesh_ob.matrix_world = ob.matrix_world
    name = ob.name
    curve = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.curves.remove(curve)
    mesh_ob.name = name
    col.objects.link(mesh_ob)

# preview camera at the pilot's eye
cam_data = bpy.data.cameras.new("EyeCam")
cam_data.angle_y = math.radians(60)
cam_data.sensor_fit = 'VERTICAL'
cam_data.clip_start = 0.01
cam = bpy.data.objects.new("EyeCam", cam_data)
col.objects.link(cam)
cam.rotation_euler = (math.radians(90), 0, math.radians(180))   # look down -Y
cam.location = EYE
eye = bpy.data.objects.new("Eye", None)
eye.empty_display_type = 'ARROWS'
eye.empty_display_size = 0.1
eye.location = EYE
col.objects.link(eye)
scn.camera = cam
scn.render.resolution_x, scn.render.resolution_y = 1600, 900
sun = bpy.data.objects.new("PreviewSun", bpy.data.lights.new("PreviewSun", 'SUN'))
sun.data.energy = 3
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
col.objects.link(sun)

os.makedirs(os.path.dirname(EXPORT_GLB), exist_ok=True)
with bpy.context.temp_override(window=WIN, scene=scn, view_layer=scn.view_layers[0]):
    bpy.ops.export_scene.gltf(
        filepath=EXPORT_GLB,
        export_format='GLB',
        use_active_scene=True,
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )

result = {
    "size": os.path.getsize(EXPORT_GLB),
    "objects": len([o for o in col.objects if o.type == 'MESH']),
    "screens": {o.name: dict(o.items()) for o in col.objects if o.name.startswith("Screen_") and "_Bezel" not in o.name},
    "glb": EXPORT_GLB,
}

print(result)

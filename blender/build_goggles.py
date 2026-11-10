# VR goggles for Echo (Datenflug look, like the game coin): two round lens cups joined at the
# nose bridge, glass lenses the eyes shine through, hinge knobs at the sides and a soft strap
# around the back of the head (above the wing roots, below the ears). Original design.
# Built in Echo's own Blender space (see build_echo.py: unit E = body width, front is -Y, Z up),
# so the app can drop the goggles straight into the Echo model.
# Materials (recolored from the design tokens in the app): GoggleFrame, GoggleStrap,
# GoggleLens (glass), GoggleGlow (cyan light seam on the frame).
# Usage: blender -b -P build_goggles.py -- <out.glb> [<echo.blend> <preview_dir>]
#   With echo.blend and a preview dir it also renders Echo wearing the goggles (front, side, back).
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB = argv[0]
PREVIEW = argv[1:3] if len(argv) >= 3 else None

if PREVIEW:
    bpy.ops.wm.open_mainfile(filepath=PREVIEW[0])
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- Echo's body surface (same formulas as build_echo.py) ----------
DEPTH = 0.84


def shape_k(z):
    return 1 + 0.1 * max(0.0, -z / 0.5) - 0.04 * max(0.0, z / 0.5)


def surface_y(x, z):
    r2 = 0.25 - x * x - z * z
    if r2 <= 0:
        return 0.0
    return -math.sqrt(r2) * shape_k(z) * DEPTH


def surface_normal(x, z):
    y = surface_y(x, z)
    return Vector((x, y / (DEPTH * DEPTH), z)).normalized()


def material(name, color, metal=0.0, rough=0.4, alpha=1.0, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.blend_method = 'BLEND'
        except (AttributeError, TypeError):
            pass
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    return m


FRAME = material('GoggleFrame', (0.32, 0.36, 0.78), metal=0.35, rough=0.28)
STRAP = material('GoggleStrap', (0.06, 0.05, 0.2), rough=0.6)
LENS = material('GoggleLens', (0.35, 0.85, 1.0), rough=0.05, alpha=0.3)
GLOW = material('GoggleGlow', (0, 0, 0), emit=(0.3, 0.9, 1.0))


def new_obj(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def oriented(n):
    """Rotation that turns +Z onto the direction n."""
    return Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()


def torus(name, center, n, R, r, mat, depth_scale=1.0, maj=64, mino=14):
    bm = bmesh.new()
    for i in range(maj):
        a = 2 * math.pi * i / maj
        for j in range(mino):
            b = 2 * math.pi * j / mino
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b) * depth_scale
            bm.verts.new((x, y, z))
    bm.verts.ensure_lookup_table()
    for i in range(maj):
        for j in range(mino):
            a = i * mino + j
            b = ((i + 1) % maj) * mino + j
            c = ((i + 1) % maj) * mino + (j + 1) % mino
            d = i * mino + (j + 1) % mino
            bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[c], bm.verts[d]))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ oriented(n), verts=bm.verts)
    return new_obj(name, bm, mat)


def ellipsoid(name, center, radii, mat, rot=None, seg=40, rings=20):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    m = Matrix.Translation(center) @ (rot if rot is not None else Matrix.Identity(4))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return new_obj(name, bm, mat)


def band(name, pts, height, thick, mat, sides=16):
    """A soft strap along pts: an elliptic cross-section (height along Z, thickness outwards)."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1))
        side = t.cross(up).normalized()
        up = side.cross(t).normalized()
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            ring.append(bm.verts.new(p + side * math.cos(a) * thick + up * math.sin(a) * height))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][(k + 1) % sides], rings[i][(k + 1) % sides]))
    for ring in (rings[0], rings[-1]):
        bm.faces.new(ring if ring is rings[-1] else list(reversed(ring)))
    return new_obj(name, bm, mat)


parts = []
lenses = []
EZ = 0.085  # eye height (build_echo: 0.08) - the cups sit a hair higher, like a visor
for s in (-1, 1):
    ex = s * 0.19
    n = surface_normal(ex, EZ)
    c = Vector((ex, surface_y(ex, EZ), EZ))
    # Lens cup: a deep, rounded ring around the eye (its back sinks into the face).
    parts.append(torus('cup', c + n * 0.036, n, 0.19, 0.026, FRAME, depth_scale=1.75))
    # Light seam on the front edge of the cup.
    parts.append(torus('seam', c + n * 0.079, n, 0.19, 0.006, GLOW, mino=8))
    # Glass lens, slightly domed, in front of the eye.
    lenses.append(ellipsoid('lens', c + n * 0.07, (0.178, 0.178, 0.026), LENS, rot=oriented(n)))
    # Hinge knob at the outer side, where the strap starts.
    hx = s * 0.39
    hn = surface_normal(hx, 0.1)
    hc = Vector((hx, surface_y(hx, 0.1), 0.1)) + hn * 0.03
    parts.append(ellipsoid('hinge', hc, (0.05, 0.05, 0.034), FRAME, rot=oriented(hn)))
    parts.append(ellipsoid('hingeLed', hc + hn * 0.032, (0.016, 0.016, 0.006), GLOW, rot=oriented(hn)))

# Strap: from one hinge, up over the wing roots, around the back of the head to the other hinge.
pts = []
N = 48
for i in range(N + 1):
    u = i / N  # 0: left hinge, 0.5: middle of the back, 1: right hinge
    # angle around the body (0 = front, pi = back), from the left hinge round the back.
    a0 = math.radians(55)
    ang = -a0 - (2 * math.pi - 2 * a0) * u  # left side -> back -> right side
    z = 0.1 + 0.14 * math.sin(math.pi * u) ** 0.6  # rises to 0.24 at the back
    r = math.sqrt(max(0.0, 0.25 - z * z)) * shape_k(z)
    x = math.sin(ang) * r * 1.03
    y = -math.cos(ang) * r * DEPTH * 1.04
    pts.append(Vector((x, y, z)))
parts.append(band('strap', pts, 0.034, 0.012, STRAP))


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


goggles = join(parts, 'Goggles')
lens = join(lenses, 'GoggleLenses')
lens.parent = goggles
print('goggles faces', len(goggles.data.polygons) + len(lens.data.polygons))

if PREVIEW:
    # Echo wearing the goggles, rendered from a few sides (Cycles on the CPU, no GPU needed).
    out = PREVIEW[1]
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 12
    scene.render.resolution_x = 420
    scene.render.resolution_y = 420
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.82, 0.9, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.2
    scene.world = world
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 60
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for tag, pos in (('front', (0.35, -2.6, 0.35)), ('side', (2.6, -0.4, 0.4)), ('back', (-1.2, 2.4, 0.9)), ('top', (0.6, -1.6, 2.0))):
        cam.location = pos
        d = Vector((0, 0, 0.12)) - Vector(pos)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{out}/goggles-{tag}.png'
        bpy.ops.render.render(write_still=True)
    # Keep only the goggles for the export.
    for o in list(scene.objects):
        if o not in (goggles, lens):
            bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT')
goggles.select_set(True)
lens.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True,
    export_yup=True, export_animations=False, export_normals=True,
)
print('DONE')

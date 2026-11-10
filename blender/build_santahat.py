# A Santa hat for Echo (Christmas decoration, original design): a red velvet cone that sits on
# the back of the head between the ears, flops backwards and to the side (so the echo rings and
# the ears stay free), a fluffy white fur brim and a pompom at the tip.
# Built in Echo's own Blender space (see build_echo.py: unit E = body width, front is -Y, Z up),
# so the app can drop it straight into the Echo model (like the VR goggles).
# Materials (tinted from the design tokens in the app): HatRed, HatFur.
# Usage: blender -b -P build_santahat.py -- <out.glb> [<echo.blend> <preview_dir>]
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB = argv[0]
PREVIEW = argv[1:3] if len(argv) >= 3 else None

if PREVIEW:
    bpy.ops.wm.open_mainfile(filepath=PREVIEW[0])
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
rnd = random.Random(12)


def material(name, color, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    return m


RED = material('HatRed', (0.78, 0.05, 0.08), 0.55)
FUR = material('HatFur', (0.97, 0.97, 0.97), 0.9)


def new_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


# The hat's spine: from the brim on the back of the head, up and back, then flopping sideways and
# down to the tip. Radius shrinks along it.
BASE = Vector((0.0, 0.08, 0.46))
TILT = Matrix.Rotation(-0.42, 3, 'X')  # leans back (+Y is the back of the head)


def spine(u):
    up = Vector((0.0, 0.0, 0.46 * min(1.0, u * 1.25)))
    back = Vector((0.0, 0.12 * u, 0.0))
    flop = Vector((0.3 * max(0.0, u - 0.45) ** 1.4, 0.07 * max(0.0, u - 0.5), -0.32 * max(0.0, u - 0.55) ** 1.6))
    return BASE + TILT @ (up + back) + flop


def radius(u):
    return 0.19 * (1 - u) ** 0.85 + 0.024


bm = bmesh.new()
N, S = 40, 28
rings = []
for i in range(N + 1):
    u = i / N
    c = spine(u)
    t = (spine(min(1, u + 0.02)) - spine(max(0, u - 0.02))).normalized()
    a = t.orthogonal().normalized()
    b = t.cross(a).normalized()
    r = radius(u)
    rings.append([bm.verts.new(c + (a * math.cos(2 * math.pi * k / S) + b * math.sin(2 * math.pi * k / S)) * r * (1 + 0.03 * math.sin(k * 3 + i * 0.7))) for k in range(S)])
for i in range(N):
    for k in range(S):
        bm.faces.new((rings[i][k], rings[i][(k + 1) % S], rings[i + 1][(k + 1) % S], rings[i + 1][k]))
bm.faces.new(list(reversed(rings[0])))
bm.faces.new(rings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
cone = new_obj('hatCone', bm, RED)

# Fur brim: a fat torus around the base, made lumpy so it reads as fluffy.
bm = bmesh.new()
MAJ, MIN = 48, 16
R0, R1 = radius(0.0) + 0.012, 0.062
n0 = (TILT @ Vector((0, 0, 1))).normalized()
a0 = n0.orthogonal().normalized()
b0 = n0.cross(a0).normalized()
grid = []
for i in range(MAJ):
    th = 2 * math.pi * i / MAJ
    radial = a0 * math.cos(th) + b0 * math.sin(th)
    row = []
    for j in range(MIN):
        ph = 2 * math.pi * j / MIN
        lump = 1 + 0.12 * math.sin(i * 5 + j * 3) * math.cos(i * 2.3 - j)
        p = BASE + radial * (R0 + R1 * lump * math.cos(ph)) + n0 * (R1 * 0.8 * lump * math.sin(ph))
        row.append(bm.verts.new(p))
    grid.append(row)
for i in range(MAJ):
    for j in range(MIN):
        bm.faces.new((grid[i][j], grid[(i + 1) % MAJ][j], grid[(i + 1) % MAJ][(j + 1) % MIN], grid[i][(j + 1) % MIN]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
brim = new_obj('hatBrim', bm, FUR)

# Pompom at the tip: a lumpy ball.
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.075)
tip = spine(1.0)
for v in bm.verts:
    n = v.co.normalized()
    v.co = n * 0.075 * (1 + 0.1 * math.sin(n.x * 9) * math.cos(n.y * 7 + n.z * 5)) + tip
pompom = new_obj('hatPompom', bm, FUR)


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


hat = join([cone, brim, pompom], 'SantaHat')
print('hat faces', len(hat.data.polygons))

if PREVIEW:
    out = PREVIEW[1]
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 12
    scene.render.resolution_x = 360
    scene.render.resolution_y = 360
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.82, 0.9, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.2
    scene.world = world
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 55
    scene.collection.objects.link(cam)
    scene.camera = cam
    for tag, pos in (('front', (0.2, -2.8, 0.6)), ('side', (2.8, 0.2, 0.6)), ('back', (-1.2, 2.5, 1.0)), ('three', (1.6, -2.0, 1.2))):
        cam.location = pos
        cam.rotation_euler = (Vector((0, 0, 0.3)) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{out}/hat-{tag}.png'
        bpy.ops.render.render(write_still=True)
    for o in list(scene.objects):
        if o is not hat:
            bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT')
hat.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_animations=False, export_normals=True)
print('DONE')

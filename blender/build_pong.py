# Builds detailed AI Pong assets in Blender (original designs):
#  pong-arena.glb: hard-surface frame around the tunnel (beams, gates, data nodes, server
#                  pillars). Coordinates match the tunnel in scenes/pong.js.
#  pong-balls.glb: four ball types (energy, damper, ice, bouncy), unit radius, one object each.
# Emissive parts use materials named Neon* so the app can tint them (player/AI/rail colors).
# Usage: blender -b -P build_pong.py -- <out_dir>
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index('--') + 1]
HW, HH, LEN = 0.3, 0.21, 1.5
random.seed(7)


def P(x, y, z):
    """three.js coordinates (Y up, Z towards the player) -> Blender (Z up)."""
    return Vector((x, -z, y))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metal=0.0, rough=0.5, emit=None, strength=1.0, alpha=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
    return m


def obj_from_bm(name, bm, mat, smooth=False, bevel=0.0, segs=2, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = 'ANGLE'
    if parent:
        ob.parent = parent
    return ob


def box(name, center, size, mat, bevel=0.0, rot=None, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return obj_from_bm(name, bm, mat, bevel=bevel, parent=parent)


def merge(objs, name):
    """Joins objects into one (fewer draw calls) and applies their modifiers."""
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    mats = []
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.transform(ob.matrix_world)
        remap = []
        for m in ob.data.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        tmp = bmesh.new()
        tmp.from_mesh(me)
        for f in tmp.faces:
            f.material_index = remap[f.material_index] if remap else 0
        tmp_me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(tmp_me)
        tmp.free()
        bm.from_mesh(tmp_me)
        bpy.data.meshes.remove(tmp_me)
        ev.to_mesh_clear()
    for ob in objs:
        bpy.data.objects.remove(ob, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    out = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(out)
    for m in mats:
        out.data.materials.append(m)
    return out


def export(path, objs=None):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_animations=False, export_materials='EXPORT', use_selection=False)


# =====================================================================================
# Arena frame
# =====================================================================================
reset()
METAL = material('Metal', (0.035, 0.04, 0.06), metal=0.9, rough=0.28)
METAL2 = material('MetalLight', (0.18, 0.2, 0.25), metal=0.95, rough=0.22)
NEON = material('NeonRail', (0.0, 0.0, 0.0), emit=(1, 1, 1), strength=1.0)
NEON_P = material('NeonPlayer', (0.0, 0.0, 0.0), emit=(1, 1, 1), strength=1.0)
NEON_A = material('NeonAI', (0.0, 0.0, 0.0), emit=(1, 1, 1), strength=1.0)
PLATE = material('Plate', (0.012, 0.014, 0.022), metal=0.6, rough=0.45)

parts = []
B = 0.022  # beam thickness
# Corner beams with inset light strips
for sx in (-1, 1):
    for sy in (-1, 1):
        c = P(sx * (HW + B / 2), sy * (HH + B / 2), 0)
        parts.append(box('beam', c, (B, LEN + 0.02, B), METAL, bevel=0.004))
        # light strip on the inner-facing diagonal edge
        parts.append(box('strip', P(sx * (HW + 0.002), sy * (HH + 0.002), 0), (0.004, LEN, 0.004), NEON))
        # groove detail: small blocks along the beam
        for i in range(12):
            z = -LEN / 2 + (i + 0.5) * LEN / 12
            parts.append(box('rivet', P(sx * (HW + B + 0.002), sy * (HH + B / 2), z), (0.004, 0.012, 0.01), METAL2, bevel=0.0015))

# Heavy gates at both ends with neon lips (player and AI color). The three green middle frames
# were removed (Nov 2026): the arena was too colorful.
RIBS = 5
for i in (0, RIBS - 1):
    z = -LEN / 2 + i * LEN / (RIBS - 1)
    end = True
    t = 0.03 if end else 0.016  # frame thickness
    d = 0.045 if end else 0.024  # depth along the tunnel
    ow, oh = HW + B + t, HH + B + t
    for sy in (-1, 1):
        parts.append(box('rib', P(0, sy * (oh - t / 2), z), (2 * ow, d, t), METAL, bevel=0.005 if end else 0.003))
    for sx in (-1, 1):
        parts.append(box('rib', P(sx * (ow - t / 2), 0, z), (t, d, 2 * oh), METAL, bevel=0.005 if end else 0.003))
    lip = NEON_P if i == RIBS - 1 else NEON_A
    li = 0.004
    for sy in (-1, 1):
        parts.append(box('lip', P(0, sy * (HH + B + 0.001), z), (2 * (HW + B), d * 1.02, li), lip))
    for sx in (-1, 1):
        parts.append(box('lip', P(sx * (HW + B + 0.001), 0, z), (li, d * 1.02, 2 * (HH + B)), lip))
    # Corner data nodes: beveled cubes with a glowing core
    for sx in (-1, 1):
        for sy in (-1, 1):
            cn = P(sx * ow, sy * oh, z)
            s = 0.034 if end else 0.022
            parts.append(box('node', cn, (s, s, s), METAL2, bevel=0.006, rot=Matrix.Rotation(math.pi / 4, 3, 'Y')))
            parts.append(box('nodeglow', cn, (s * 0.45, s * 1.04, s * 0.45), lip, rot=Matrix.Rotation(math.pi / 4, 3, 'Y')))
    if end:
        # Gate chevrons on top of the end frames
        for k in range(5):
            x = (k - 2) * 0.05
            parts.append(box('chev', P(x, oh + 0.012, z), (0.03, 0.012, 0.006), lip, rot=Matrix.Rotation(math.pi / 4, 3, 'Y')))

# No base plate (removed Nov 2026): Echo holds your paddle and hangs below it, it must not sink
# into a plate. The level is kept for the server pillars, which stand on it.
py = -HH - B - 0.03

# Server pillars behind the AI gate (stacked glowing slots)
for sx in (-1, 1):
    x = sx * (HW + 0.13)
    z = -LEN / 2 - 0.02
    h = 0.62
    base_y = py
    parts.append(box('pillar', P(x, base_y + h / 2, z), (0.07, 0.07, h), METAL, bevel=0.006))
    for k in range(9):
        y = base_y + 0.07 + k * (h - 0.12) / 8
        parts.append(box('slot', P(x, y, z + 0.036), (0.05, 0.002, 0.008), NEON_A if k % 3 == 0 else NEON))
    parts.append(box('cap', P(x, base_y + h + 0.01, z), (0.08, 0.08, 0.02), METAL2, bevel=0.005))
    parts.append(box('capglow', P(x, base_y + h + 0.021, z), (0.05, 0.05, 0.002), NEON_A))

arena = merge(parts, 'PongArena')
print('arena faces', len(arena.data.polygons))
export(f'{OUT}/pong-arena.glb')
bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup copies
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/../../../blender/pong-arena.blend', check_existing=False)

# =====================================================================================
# Balls (unit radius, centered)
# =====================================================================================
reset()
CORE = material('NeonBall', (0, 0, 0), emit=(1, 1, 1), strength=1.0)
FRAME = material('BallMetal', (0.75, 0.78, 0.85), metal=1.0, rough=0.18)
DARKM = material('BallDark', (0.03, 0.035, 0.05), metal=0.85, rough=0.3)
ICE = material('BallIce', (0.75, 0.92, 1.0), metal=0.0, rough=0.06)
RUBBER = material('BallRubber', (0.9, 0.62, 0.08), metal=0.0, rough=0.75)


def icosphere(r, sub):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return bm


def uvsphere(r, u=48, v=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    return bm


def torus(R, r, maj=64, mino=12, rot=None):
    bm = bmesh.new()
    verts = []
    for i in range(maj):
        a = 2 * math.pi * i / maj
        ring = []
        for j in range(mino):
            b = 2 * math.pi * j / mino
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            ring.append(bm.verts.new(p))
        verts.append(ring)
    for i in range(maj):
        for j in range(mino):
            a, b2 = verts[i][j], verts[(i + 1) % maj][j]
            c, d = verts[(i + 1) % maj][(j + 1) % mino], verts[i][(j + 1) % mino]
            bm.faces.new((a, b2, c, d))
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    return bm


def tube_along(points, r, closed=True, sides=10):
    bm = bmesh.new()
    rings = []
    n = len(points)
    for i, p in enumerate(points):
        t = (points[(i + 1) % n] - points[i - 1]).normalized()
        a = t.orthogonal().normalized()
        b = t.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)])
    for i in range(n if closed else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            bm.faces.new((r0[k], r1[k], r1[(k + 1) % sides], r0[(k + 1) % sides]))
    return bm


balls = {}
# Energy ball: glowing core, chrome geodesic cage, spinning equator ring
core = obj_from_bm('core', icosphere(0.7, 3), CORE, smooth=True)
cage = obj_from_bm('cage', icosphere(0.97, 2), FRAME)
w = cage.modifiers.new('Wire', 'WIREFRAME')
w.thickness = 0.05
w.use_even_offset = True
# Gyroscope: two thin glowing rings crossing at an angle
rings = [obj_from_bm('ring', torus(1.06, 0.03, 72, 10, rot=Matrix.Rotation(a, 3, ax)), CORE, smooth=True)
         for a, ax in ((math.pi / 2, 'X'), (math.pi / 3, 'Y'))]
balls['ball_energy'] = merge([core, cage, *rings], 'ball_energy')

# Damper ball: dark armored sphere, three heavy bands, glowing bolts
shell = obj_from_bm('shell', uvsphere(0.9), DARKM, smooth=True)
bands = [obj_from_bm('band', torus(0.92, 0.09, 64, 14, rot=Matrix.Rotation(a, 3, ax)), FRAME, smooth=True)
         for a, ax in ((0, 'X'), (math.pi / 2, 'X'), (math.pi / 2, 'Y'))]
bolts = []
for d in ((1, 1, 1), (-1, 1, -1), (1, -1, -1), (-1, -1, 1), (-1, -1, -1), (1, -1, 1), (-1, 1, 1), (1, 1, -1)):
    q = Vector(d).normalized()
    bm = icosphere(0.09, 1)
    bmesh.ops.translate(bm, vec=q * 0.88, verts=bm.verts)
    bolts.append(obj_from_bm('bolt', bm, CORE, smooth=True))
balls['ball_damper'] = merge([shell, *bands, *bolts], 'ball_damper')

# Ice ball: faceted crystal with an inner glowing seed
bm = icosphere(0.9, 2)
for vtx in bm.verts:
    vtx.co *= 0.9 + random.random() * 0.16
crystal = obj_from_bm('crystal', bm, ICE)
seed = obj_from_bm('seed', icosphere(0.34, 2), CORE)
# Hexagonal crystal shards grow out of the twelve icosahedron corners
shards = []
ico = icosphere(1.0, 1)
dirs = [v.co.normalized() for v in ico.verts]
ico.free()
for i, d in enumerate(dirs):
    bm = bmesh.new()
    length = 0.34 + 0.12 * random.random()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.13, radius2=0.13, depth=length * 0.6)
    tip = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.13, radius2=0.0, depth=length * 0.4)
    bmesh.ops.translate(bm, vec=Vector((0, 0, length * 0.5)), verts=tip['verts'])
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Vector((0, 0, 1)).rotation_difference(d).to_matrix())
    bmesh.ops.translate(bm, vec=d * 0.78, verts=bm.verts)
    shards.append(obj_from_bm('shard', bm, ICE))
balls['ball_ice'] = merge([crystal, seed, *shards], 'ball_ice')

# Bouncy ball: rubber sphere with a glowing seam (tennis-ball style curve)
rub = obj_from_bm('rubber', uvsphere(0.95, 48, 32), RUBBER, smooth=True)
# Grip nubs on a Fibonacci sphere (tactile rubber look)
nubs = []
N = 70
for i in range(N):
    yv = 1 - 2 * (i + 0.5) / N
    rad = math.sqrt(1 - yv * yv)
    th = math.pi * (3 - math.sqrt(5)) * i
    d = Vector((math.cos(th) * rad, yv, math.sin(th) * rad))
    bm = icosphere(0.075, 1)
    bmesh.ops.translate(bm, vec=d * 0.93, verts=bm.verts)
    nubs.append(obj_from_bm('nub', bm, RUBBER, smooth=True))
pts = []
for i in range(160):
    t = 2 * math.pi * i / 160
    x = math.cos(t) + 0.45 * math.cos(3 * t)
    y = math.sin(t) - 0.45 * math.sin(3 * t)
    z = 0.95 * math.sin(2 * t)
    pts.append(Vector((x, y, z)).normalized() * 0.99)
seam = obj_from_bm('seam', tube_along(pts, 0.06), CORE, smooth=True)
groove = obj_from_bm('groove', tube_along([q * 0.94 for q in pts], 0.085), DARKM, smooth=True)
balls['ball_bouncy'] = merge([rub, *nubs, groove, seam], 'ball_bouncy')

for name, ob in balls.items():
    print(name, 'faces', len(ob.data.polygons))
export(f'{OUT}/pong-balls.glb')
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/../../../blender/pong-balls.blend')
print('DONE')

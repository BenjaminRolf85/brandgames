# Builds the Echo Parkour assets in Blender (original designs, hard-surface sci-fi):
#   TileCap    top block of a column (beveled slab, segmented top plates, bolts, front light lip,
#              vent slot); TileBody: column body, 1 unit tall, only vertical detail (stretched in y)
#   FloatUnder underside of a floating platform (tapered pod with a light ring)
#   Lift       3-unit hover platform with rails and two thruster rings
#   Coin       coin with raised rims, reeded edge and two logo faces (material CoinFace, UVs)
#   Crystal    a glitch crystal cluster on a broken base (1 unit)
#   Bug        a robot beetle drone: body, legs, antennae, glowing eyes (+ BugWingL/BugWingR)
#   Gate       checkpoint gate; Finish: goal portal with a light ring (LogoSpot empty)
#   StageMid   pedestal segment (1 unit, stretched in x); StageEnd: tower at the stage edge
#   Tower1-3   server towers for the skyline behind the track
# Units: 1 = one block of the course; the track is DEPTH deep. Coordinates in the helpers are
# three.js style (Y up, Z towards the player). Light parts use materials named *Glow so the app
# can tint them (zone colors); ambient occlusion is baked into the vertex colors ("Col").
# Usage: blender -b -P build_parkour.py -- <out.glb> <out.blend>
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
DEPTH = 1.8
random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def P(x, y, z):
    """three.js coordinates (Y up, Z towards the player) -> Blender (Z up)."""
    return Vector((x, -z, y))


def material(name, color, metal=0.0, rough=0.5, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    return m


METAL = material('PkMetal', (0.03, 0.035, 0.05), 0.75, 0.32)
LIGHT = material('PkMetalLight', (0.25, 0.27, 0.32), 0.95, 0.22)
PANEL = material('PkPanel', (0.06, 0.065, 0.09), 0.5, 0.45)
DARK = material('PkDark', (0.01, 0.01, 0.015), 0.3, 0.7)
GLOW = material('PkGlow', (0, 0, 0), emit=(1, 1, 1))
GOLD = material('CoinGold', (1.0, 0.7, 0.2), 1.0, 0.22)
FACE = material('CoinFace', (0.9, 0.9, 0.9), 0.3, 0.4)
CRYSTAL = material('CrystalGlow', (1.0, 0.3, 0.4), 0.1, 0.15, emit=(1.0, 0.3, 0.4))
ROCK = material('CrystalBase', (0.02, 0.02, 0.03), 0.5, 0.5)
SHELL = material('BugShell', (0.02, 0.02, 0.03), 0.9, 0.2)
BUGLOW = material('BugGlow', (0, 0, 0), emit=(1.0, 0.3, 0.4))
WING = material('BugWing', (0.4, 0.8, 1.0), 0.0, 0.1)


def link(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def bevel(ob, width, segs=2, angle=40):
    mod = ob.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segs
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    return ob


def tbox(name, c, s, mat, bev=0.0, segs=2, rot=None):
    """Box at three.js center c with three.js size s (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((s[0], s[2], s[1])), verts=bm.verts)
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, mat)
    return bevel(ob, bev, segs) if bev else ob


def tcyl(name, c, r, h, mat, axis='y', segs=24, r2=None, bev=0.0, rot=None):
    """Cylinder (or cone with r2) along a three.js axis, centered at c."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    if axis == 'z':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    elif axis == 'x':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return bevel(ob, bev) if bev else ob


def ttorus(name, c, R, r, mat, axis='z', segs=48, tsegs=10, arc=2 * math.pi):
    """Torus around a three.js axis (default: facing the player)."""
    bm = bmesh.new()
    rings = []
    closed = arc >= 2 * math.pi - 1e-6
    n = segs if closed else segs + 1
    for i in range(n):
        a = arc * i / segs
        ring = []
        for j in range(tsegs):
            b = 2 * math.pi * j / tsegs
            d = R + r * math.cos(b)
            ring.append(bm.verts.new((d * math.cos(a), d * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(segs if closed else segs):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for j in range(tsegs):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % tsegs], r0[(j + 1) % tsegs]))
    # local torus lies in the XY plane of Blender (normal +Z = three +Y)
    if axis == 'z':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    elif axis == 'x':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def shard(name, base, radius, height, mat, sides=6, tilt=(0, 0)):
    """A crystal shard: a short prism with a pointed tip and a small foot."""
    bm = bmesh.new()
    foot = bm.verts.new((0, 0, -0.05))
    ring = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        ring.append(bm.verts.new((radius * math.cos(a), radius * math.sin(a), height * 0.18)))
    ring2 = [bm.verts.new((v.co.x * 0.92, v.co.y * 0.92, height * 0.72)) for v in ring]
    tip = bm.verts.new((0, 0, height))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((foot, ring[j], ring[i]))
        bm.faces.new((ring[i], ring[j], ring2[j], ring2[i]))
        bm.faces.new((ring2[i], ring2[j], tip))
    rot = Matrix.Rotation(tilt[0], 3, 'X') @ Matrix.Rotation(tilt[1], 3, 'Y')
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=P(*base), verts=bm.verts)
    return link(name, bm, mat)


def merge(objs, name):
    """Joins objects into one (applies modifiers), keeping materials and UVs."""
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
    scene.collection.objects.link(out)
    for m in mats:
        out.data.materials.append(m)
    return out


def densify(ob, max_len=0.14, rounds=4):
    """Splits long edges so the baked vertex AO has enough resolution."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for _ in range(rounds):
        edges = [e for e in bm.edges if e.calc_length() > max_len]
        if not edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(ob.data)
    bm.free()


ASSETS = []  # (object, max edge length for AO)


def asset(name, parts, dens=0.14):
    ob = merge(parts, name)
    ASSETS.append((ob, dens))
    return ob


D2 = DEPTH / 2

# ---------------------------------------------------------------- TileCap (origin: top center)
p = []
p.append(tbox('slab', (0, -0.225, 0), (0.96, 0.45, DEPTH - 0.04), METAL, bev=0.05, segs=3))
for k in range(4):  # top plates with grooves between them
    z0 = -D2 + 0.12 + k * (DEPTH - 0.24) / 4
    z1 = z0 + (DEPTH - 0.24) / 4 - 0.05
    p.append(tbox('plate', (0, 0.008, (z0 + z1) / 2), (0.8, 0.03, z1 - z0), PANEL, bev=0.012))
for sx in (-1, 1):
    for sz in (-1, 1):
        p.append(tcyl('bolt', (sx * 0.42, 0.012, sz * (D2 - 0.07)), 0.032, 0.03, LIGHT, segs=6))
p.append(tbox('lip', (0, -0.075, D2 - 0.005), (0.88, 0.045, 0.03), GLOW))
p.append(tbox('vent', (0, -0.29, D2 - 0.015), (0.62, 0.1, 0.02), DARK, bev=0.01))
for i in range(5):
    p.append(tbox('fin', (-0.24 + i * 0.12, -0.29, D2 - 0.005), (0.025, 0.08, 0.02), LIGHT))
p.append(tbox('sidelight', (0.0, -0.18, -D2 + 0.005), (0.6, 0.03, 0.02), GLOW))
asset('TileCap', p, dens=0.2)

# ---------------------------------------------------------------- TileBody (1 unit, y in [-1, 0])
p = []
p.append(tbox('core', (0, -0.5, 0), (0.94, 1.0, DEPTH - 0.08), METAL, bev=0.04, segs=2))
for x in (-0.3, 0.0, 0.3):  # vertical ribs on front and back
    for sz in (-1, 1):
        p.append(tbox('rib', (x, -0.5, sz * (D2 - 0.03)), (0.07, 0.999, 0.03), LIGHT if x == 0 else PANEL, bev=0.01))
for sx in (-1, 1):  # recessed side channel
    p.append(tbox('chan', (sx * 0.468, -0.5, 0), (0.02, 0.999, 0.9), DARK))
asset('TileBody', p, dens=0.4)

# ---------------------------------------------------------------- FloatUnder (below a cap)
p = []
p.append(tcyl('pod', (0, -0.6, 0), 0.32, 0.3, METAL, segs=20, r2=0.18, bev=0.02))
p.append(tbox('keel', (0, -0.5, 0), (0.7, 0.1, DEPTH - 0.4), PANEL, bev=0.02))
p.append(ttorus('ring', (0, -0.72, 0), 0.2, 0.025, GLOW, axis='y', segs=24, tsegs=6))
p.append(tcyl('core', (0, -0.76, 0), 0.12, 0.05, GLOW, segs=16))
asset('FloatUnder', p)

# ---------------------------------------------------------------- Lift (3 units, origin top center)
p = []
p.append(tbox('deck', (0, -0.17, 0), (2.94, 0.34, DEPTH - 0.04), METAL, bev=0.05, segs=3))
for k in range(3):
    p.append(tbox('plate', (-1.0 + k * 1.0, 0.008, 0), (0.86, 0.03, DEPTH - 0.3), PANEL, bev=0.012))
for sz in (-1, 1):
    p.append(tbox('rail', (0, 0.06, sz * (D2 - 0.06)), (2.8, 0.05, 0.05), LIGHT, bev=0.01))
    p.append(tbox('lip', (0, -0.08, sz * (D2 - 0.005)), (2.8, 0.04, 0.03), GLOW))
for sx in (-1, 1):
    p.append(tcyl('thruster', (sx * 0.9, -0.48, 0), 0.3, 0.3, METAL, segs=20, r2=0.22, bev=0.02))
    p.append(ttorus('tring', (sx * 0.9, -0.64, 0), 0.22, 0.03, GLOW, axis='y', segs=24, tsegs=6))
    p.append(tcyl('tcore', (sx * 0.9, -0.66, 0), 0.15, 0.04, GLOW, segs=16))
asset('Lift', p)

# ---------------------------------------------------------------- Coin (origin center, faces +-z)
R = 0.42
p = []
p.append(tcyl('body', (0, 0, 0), R, 0.09, GOLD, axis='z', segs=64))
for sz in (-1, 1):
    p.append(ttorus('rim', (0, 0, sz * 0.045), R - 0.035, 0.03, GOLD, axis='z', segs=64, tsegs=8))
for i in range(60):  # reeded edge
    a = 2 * math.pi * i / 60
    # Blender Y is three's -Z: rotating by -(a + 90 deg) turns the thin side along the edge.
    p.append(tbox('reed', (math.cos(a) * (R + 0.006), math.sin(a) * (R + 0.006), 0), (0.016, 0.03, 0.085), GOLD, rot=Matrix.Rotation(-(a + math.pi / 2), 3, 'Y')))
coin = asset('Coin', p, dens=0.08)
# Logo faces: discs with UVs (front and back, back mirrored so the logo reads correctly).
bm = bmesh.new()
uv = bm.loops.layers.uv.new('UVMap')
for sz in (1, -1):
    center = bm.verts.new(P(0, 0, sz * 0.047))
    ring = [bm.verts.new(P(math.cos(2 * math.pi * i / 48) * (R - 0.07), math.sin(2 * math.pi * i / 48) * (R - 0.07), sz * 0.047)) for i in range(48)]
    for i in range(48):
        tri = (center, ring[i], ring[(i + 1) % 48]) if sz > 0 else (center, ring[(i + 1) % 48], ring[i])
        f = bm.faces.new(tri)
        for loop in f.loops:
            x, y = loop.vert.co.x, loop.vert.co.z
            loop[uv].uv = (0.5 + sz * x / (2 * (R - 0.07)), 0.5 + y / (2 * (R - 0.07)))
face = link('CoinFace', bm, FACE)
face.parent = coin

# ---------------------------------------------------------------- Crystal cluster (origin bottom center)
p = []
p.append(tcyl('rock', (0, 0.05, 0), 0.42, 0.12, ROCK, segs=7, r2=0.34))
for i, (x, z, r, h, tx, tz) in enumerate([(0, 0, 0.11, 0.62, 0.0, 0.0), (-0.2, 0.15, 0.08, 0.42, 0.35, -0.2), (0.2, -0.1, 0.09, 0.5, -0.3, 0.25),
                                          (0.12, 0.25, 0.06, 0.3, 0.4, 0.3), (-0.15, -0.22, 0.07, 0.36, -0.35, -0.3), (0.28, 0.2, 0.05, 0.24, 0.2, 0.5)]):
    p.append(shard('shard', (x, 0.08, z), r, h, CRYSTAL, tilt=(tx, tz)))
asset('Crystal', p, dens=0.1)

# ---------------------------------------------------------------- Bug drone (origin center, looks to -x)
p = []
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1.0)
bmesh.ops.scale(bm, vec=Vector((0.4, 0.3, 0.26)), verts=bm.verts)
bmesh.ops.translate(bm, vec=P(0.08, 0.02, 0), verts=bm.verts)
abdomen = link('abdomen', bm, SHELL)
for pl in abdomen.data.polygons:
    pl.use_smooth = True
p.append(abdomen)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=10, radius=0.17)
bmesh.ops.translate(bm, vec=P(-0.36, 0.04, 0), verts=bm.verts)
head = link('head', bm, SHELL)
for pl in head.data.polygons:
    pl.use_smooth = True
p.append(head)
for sz in (-1, 1):
    p.append(tcyl('eye', (-0.49, 0.08, sz * 0.08), 0.045, 0.04, BUGLOW, axis='x', segs=12))
    # wing cover (elytra): a flattened half ellipsoid, slightly open
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.05], context='VERTS')
    bmesh.ops.scale(bm, vec=Vector((0.36, 0.15, 0.14)), verts=bm.verts)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(sz * 0.25, 3, 'X'))
    bmesh.ops.translate(bm, vec=P(0.1, 0.2, sz * 0.1), verts=bm.verts)
    el = link('elytron', bm, SHELL)
    for pl in el.data.polygons:
        pl.use_smooth = True
    p.append(el)
    p.append(tbox('stripe', (0.1, 0.33, sz * 0.1), (0.42, 0.015, 0.025), BUGLOW, rot=Matrix.Rotation(sz * 0.25, 3, 'X')))
    for i, x in enumerate((-0.15, 0.05, 0.25)):  # legs: two segments each
        hip = Vector((x, -0.08, sz * 0.2))
        knee = Vector((x + (i - 1) * 0.08, 0.02, sz * 0.38))
        foot = Vector((x + (i - 1) * 0.14, -0.28, sz * 0.46))
        for a, b in ((hip, knee), (knee, foot)):
            mid = (a + b) / 2
            d = b - a
            L = d.length
            # cylinder along three Y, rotated to the segment direction
            up = Vector((0, 1, 0))
            axis = up.cross(d.normalized())
            ang = math.acos(max(-1, min(1, up.dot(d.normalized()))))
            rotm = Matrix.Rotation(ang, 3, Vector((axis.x, -axis.z, axis.y))) if axis.length > 1e-6 else None
            p.append(tcyl('leg', (mid.x, mid.y, mid.z), 0.022, L, SHELL, segs=6, rot=rotm))
    # antenna with a glowing tip
    p.append(tcyl('ant', (-0.5, 0.25, sz * 0.07), 0.012, 0.3, SHELL, segs=5, rot=Matrix.Rotation(sz * 0.4, 3, 'X') @ Matrix.Rotation(0.6, 3, 'Y')))
    p.append(tcyl('antTip', (-0.6, 0.39, sz * 0.13), 0.03, 0.05, BUGLOW, segs=8))
bug = asset('Bug', p, dens=0.08)
for sz, name in ((1, 'BugWingR'), (-1, 'BugWingL')):
    bm = bmesh.new()
    center = bm.verts.new((0, 0, 0))
    ring = []
    for i in range(20):
        a = 2 * math.pi * i / 20
        ring.append(bm.verts.new((0.3 * math.cos(a) + 0.28, 0.12 * math.sin(a), 0)))
    for i in range(20):
        bm.faces.new((center, ring[i], ring[(i + 1) % 20]))
    # Blender XY plane -> wing lies flat, pointing back (+x) and sideways; tilt it up a little
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(sz * -0.5, 3, 'Z') @ Matrix.Rotation(sz * 0.3, 3, 'X'))
    w = link(name, bm, WING)
    w.location = P(0.0, 0.3, sz * 0.08)
    w.parent = bug

# ---------------------------------------------------------------- Gate (checkpoint, origin bottom center)
# A beacon mast at the back of the track with a holo banner that faces the player.
H = 2.7
ZB = -D2 + 0.12
p = []
p.append(tbox('base', (0, 0.06, ZB), (0.42, 0.12, 0.42), PANEL, bev=0.03))
p.append(tcyl('mast', (0, H / 2, ZB), 0.06, H, METAL, segs=12, bev=0.01))
for k in range(4):
    p.append(tcyl('ring', (0, 0.5 + k * 0.5, ZB), 0.085, 0.05, LIGHT, segs=12))
p.append(tbox('arm', (0.3, H - 0.08, ZB), (0.6, 0.06, 0.06), METAL, bev=0.01))
p.append(tbox('banner', (0.36, H - 0.42, ZB + 0.02), (0.56, 0.6, 0.02), GLOW))
p.append(tbox('bannerFrame', (0.36, H - 0.42, ZB - 0.005), (0.62, 0.66, 0.03), METAL, bev=0.01))
p.append(tcyl('top', (0, H + 0.08, ZB), 0.09, 0.14, GLOW, segs=12))
p.append(ttorus('halo', (0, 0.14, ZB), 0.32, 0.02, GLOW, axis='y', segs=32, tsegs=6))
asset('Gate', p)

# ---------------------------------------------------------------- Finish portal (origin bottom center)
# An arch behind the track facing the player (Echo runs through in front of it), with a light
# ring above for the Echomotion logo.
H = 4.0
ZB = -D2 + 0.05
p = []
for sx in (-1, 1):
    x = sx * 1.45
    p.append(tbox('pillar', (x, H / 2, ZB), (0.4, H, 0.4), METAL, bev=0.04))
    p.append(tbox('base', (x, 0.12, ZB), (0.62, 0.24, 0.62), PANEL, bev=0.04))
    for k in range(5):
        p.append(tbox('band', (x, 0.7 + k * 0.7, ZB), (0.46, 0.06, 0.46), LIGHT, bev=0.01))
    p.append(tbox('strip', (x - sx * 0.12, H / 2, ZB + 0.205), (0.06, H - 0.5, 0.01), GLOW))
p.append(tbox('beam', (0, H + 0.15, ZB), (3.4, 0.3, 0.42), METAL, bev=0.04))
p.append(tbox('beamlight', (0, H - 0.02, ZB + 0.12), (2.6, 0.04, 0.04), GLOW))
p.append(ttorus('ring', (0, H + 1.45, ZB), 1.0, 0.07, GLOW, axis='z', segs=64, tsegs=8))
p.append(ttorus('ring2', (0, H + 1.45, ZB - 0.02), 1.14, 0.045, LIGHT, axis='z', segs=64, tsegs=6))
for i in range(12):  # light segments around the ring
    a = 2 * math.pi * i / 12
    p.append(tbox('seg', (math.cos(a) * 1.25, H + 1.45 + math.sin(a) * 1.25, ZB), (0.08, 0.2, 0.08), GLOW, rot=Matrix.Rotation(-a, 3, 'Y')))
p.append(tbox('mast', (0, H + 0.38, ZB), (0.14, 0.2, 0.14), METAL))
finish = asset('Finish', p)
spot = bpy.data.objects.new('LogoSpot', None)
scene.collection.objects.link(spot)
spot.location = P(0, H + 1.45, ZB + 0.03)
spot.parent = finish

# ---------------------------------------------------------------- Stage pedestal (y top = 0)
p = []
p.append(tbox('slab', (0, -0.4, 0), (1.0, 0.8, DEPTH + 2.4), METAL))
p.append(tbox('top', (0, 0.01, -0.2), (1.0, 0.03, DEPTH + 1.8), METAL))
for z in (D2 + 0.9, -D2 - 1.0):  # light lines along the stage
    p.append(tbox('line', (0, 0.03, z), (1.0, 0.012, 0.03), GLOW))
p.append(tbox('lipglow', (0, -0.1, D2 + 1.205), (1.0, 0.035, 0.02), GLOW))
for y in (-0.32, -0.52):  # horizontal grooves on the front
    p.append(tbox('groove', (0, y, D2 + 1.2), (1.0, 0.04, 0.02), DARK))
p.append(tbox('kick', (0, -0.75, D2 + 1.1), (1.0, 0.1, 0.3), LIGHT))
asset('StageMid', p, dens=0.25)

H = 9.6
p = []
p.append(tbox('tower', (0, H / 2 - 0.8, -0.2), (0.6, H, 1.2), METAL, bev=0.05))
p.append(tbox('face', (0, H / 2 - 0.8, 0.41), (0.42, H - 0.6, 0.02), PANEL, bev=0.01))
p.append(tbox('strip', (-0.2, H / 2 - 0.8, 0.43), (0.05, H - 1.0, 0.02), GLOW))
for k in range(9):
    p.append(tbox('notch', (0.05, 0.2 + k * 0.95, 0.43), (0.22, 0.05, 0.02), LIGHT))
p.append(tbox('cap', (0, H - 0.75, -0.2), (0.75, 0.15, 1.35), LIGHT, bev=0.03))
p.append(tcyl('emitter', (0, H - 0.55, -0.2), 0.12, 0.2, GLOW, segs=12))
asset('StageEnd', p, dens=0.3)

# ---------------------------------------------------------------- Skyline towers (origin bottom center)
for t, (w, h, d) in enumerate([(1.2, 4.0, 1.0), (0.9, 5.6, 0.9), (1.5, 3.2, 1.3)], start=1):
    p = []
    p.append(tbox('body', (0, h / 2, 0), (w, h, d), METAL, bev=0.04))
    p.append(tbox('crown', (0, h + 0.1, 0), (w * 0.7, 0.2, d * 0.7), PANEL, bev=0.03))
    rows = int(h / 0.32)
    for r in range(rows):
        if random.random() < 0.25:
            continue
        y = 0.3 + r * 0.3
        if y > h - 0.2:
            break
        wid = w * random.choice((0.3, 0.5, 0.7))
        p.append(tbox('win', (random.uniform(-0.1, 0.1) * w, y, d / 2 + 0.005), (wid, 0.07, 0.02), GLOW))
    if t == 2:
        p.append(tcyl('antenna', (0, h + 0.6, 0), 0.03, 1.0, LIGHT, segs=6))
        p.append(tcyl('blink', (0, h + 1.12, 0), 0.06, 0.06, GLOW, segs=8))
    asset(f'Tower{t}', p, dens=0.35)

# ---------------------------------------------------------------- AO bake into vertex colors
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 96
scene.world = bpy.data.worlds.new('World')
scene.world.light_settings.distance = 0.35
glow_names = {'PkGlow', 'BugGlow', 'CrystalGlow'}
others = [o for o in scene.objects if o.type == 'MESH' and all(o is not a for a, _ in ASSETS)]
for o in others:
    o.hide_render = True
for ob, dens in ASSETS:
    densify(ob, dens)
for ob, _ in ASSETS:
    # bake each asset alone (the others hidden), so assets do not shade each other
    for o2, _ in ASSETS:
        o2.hide_render = o2 is not ob
    me = ob.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    # light parts stay full bright; soften the AO a little elsewhere
    glow_idx = {i for i, m in enumerate(me.materials) if m.name in glow_names}
    bright = set()
    for poly in me.polygons:
        if poly.material_index in glow_idx:
            bright.update(poly.vertices)
    col = me.color_attributes['Col'].data
    for i, d in enumerate(col):
        if i in bright:
            d.color = (1, 1, 1, 1)
        else:
            v = 0.25 + 0.75 * d.color[0]
            d.color = (v, v, v, 1)
for ob, _ in ASSETS:
    ob.hide_render = False
for o in others:
    o.hide_render = False
    me = o.data
    if 'Col' not in me.color_attributes:
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        for d in ca.data:
            d.color = (1, 1, 1, 1)

# ---------------------------------------------------------------- layout for the .blend, export
for i, (ob, _) in enumerate(ASSETS):
    ob.location.x += (i % 6) * 4.0
    ob.location.y += (i // 6) * 6.0
print('assets', [(ob.name, len(ob.data.polygons)) for ob, _ in ASSETS])
print('faces total', sum(len(o.data.polygons) for o in scene.objects if o.type == 'MESH'))
# 'ACTIVE' exports the baked AO ('Col') even though the materials do not read it (the app does).
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=False, export_apply=True,
                          export_yup=True, export_animations=False, export_normals=True,
                          export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True)
bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup copies
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
print('DONE')

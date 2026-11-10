# "Stein auf Stein" / "Brick by Brick" (game key 'bricks'): the 3D parts of a small building site
# on a garden plot (original design, cozy diorama style). Meters, three.js coordinates.
#   Brick, BrickHalf   a clay brick and a half bat (the corner posts use the half too)
#   BrickGold          a golden interest brick (tapered like an ingot, with a coin emblem)
#   Plot               the plot: an earth slab with a grass top, the concrete foundation with the
#                      door step, a stepping-stone path, a picket fence, mailbox, garden lamp, a
#                      little fir tree, evergreen shrubs with berries, a sand pile with a shovel,
#                      a round tree and a gravel delivery zone. Origin: middle of the grass top.
#   Window, DoorFrame  frames that sit in the wall openings (origin: opening center on the wall
#                      line, facing +z = outside), Door (origin at the hinge), a canopy and lamp
#   Roof               roof tiles in rows, ridge cap, clad gables with a round attic window, barge
#                      boards, gutters and a chimney (origin: middle of the wall tops)
#   CraneMast, CraneJib, CraneTrolley, CraneHook   a little tower crane in parts
#   Pallet, Conveyor, Machine, Coin, Bag           delivery: the savings machine with a coin slot
#                      and a hatch, the belt, the pallet; the shopping bag for spending
# Material names are mapped to the --xr-bricks-* tokens at runtime (public/js/bricks-visuals.js);
# the colors here only matter for the coin art. Ambient occlusion is baked into vertex colors.
# The house measures must match public/js/bricks-plan.js (L, H, D, COURSES, openings).
# Usage: blender -b -P build_bricks.py -- <out.glb> <out.blend> [--card <out.png>]
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, merge, bake_ao, export, blob, prism

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
CARD = ARGS[ARGS.index('--card') + 1] if '--card' in ARGS else None
init()
rnd = random.Random(11)

# ---------- measures (keep in sync with public/js/bricks-plan.js) ----------
L, H, D, GAP = 0.072, 0.03, 0.036, 0.003
COURSES = 7
TOP = COURSES * H            # wall top above the foundation
XH, ZH = 3 * L + D / 2, 2 * L + D / 2   # wall center lines
OX, OZ = 3 * L + D, 2 * L + D           # outer faces
FOUND = 0.014                # foundation slab height
HZ = -0.03                   # house center on the plot (z)
RIDGE = 0.15                 # ridge above the wall tops
EAVE = 0.035                 # roof overhang at the eaves
FIR = (-0.40, 0.10)          # the little fir tree (public/js/bricks-visuals.js lights it)


def srgb(h):
    """Hex color (sRGB) -> linear RGB tuple for Blender."""
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


# Colors mirror public/css/game-bricks.css (only for the coin art; the game recolors from tokens).
CLAY = material('BrickClay', srgb('#c2643f'), 0.0, 0.85)
GOLD = material('BrickGold', srgb('#f0b43c'), 1.0, 0.24)
CONC = material('Concrete', srgb('#b9b3a8'), 0.0, 0.9)
GRASS = material('Grass', srgb('#6fae5a'), 0.0, 0.95)
GRASS_D = material('GrassDark', srgb('#4b8a46'), 0.0, 0.95)
SOIL = material('Soil', srgb('#7d5338'), 0.0, 0.95)
SOIL_D = material('SoilDark', srgb('#5b3a27'), 0.0, 0.95)
STONE = material('Stone', srgb('#cfc5b5'), 0.0, 0.8)
GRAVEL = material('Gravel', srgb('#a59d90'), 0.0, 0.95)
SAND = material('Sand', srgb('#e2c48a'), 0.0, 0.95)
LEAF = material('Leaf', srgb('#4f9a55'), 0.0, 0.85)
LEAF_D = material('LeafDark', srgb('#2e6b40'), 0.0, 0.85)
BARK = material('Bark', srgb('#6c4a32'), 0.0, 0.9)
BERRY = material('Berry', srgb('#e2384c'), 0.0, 0.4)
FENCE = material('Fence', srgb('#f1ece2'), 0.0, 0.7)
WOOD = material('Wood', srgb('#b8844f'), 0.0, 0.75)
WOOD_D = material('WoodDark', srgb('#8a5e38'), 0.0, 0.8)
METAL = material('Metal', srgb('#8e97a4'), 0.8, 0.35)
DARK = material('Dark', srgb('#2b2f38'), 0.2, 0.6)
ROOF = material('Roof', srgb('#3f4757'), 0.0, 0.7)
ROOF_D = material('RoofDark', srgb('#2c323e'), 0.0, 0.7)
GABLE = material('Gable', srgb('#efe5d2'), 0.0, 0.8)
FRAME = material('Frame', srgb('#f6f3ec'), 0.0, 0.5)
GLASS = material('Glass', srgb('#2a3b56'), 0.0, 0.08)
DOOR = material('Door', srgb('#2f6e69'), 0.0, 0.45)
LAMP = material('LampGlow', (0, 0, 0), emit=srgb('#ffc96b'))
MAIL = material('Mailbox', srgb('#d94c3f'), 0.2, 0.4)
CRANE = material('Crane', srgb('#f2b632'), 0.3, 0.45)
CRANE_D = material('CraneDark', srgb('#3a3f4b'), 0.5, 0.45)
CGLASS = material('CraneGlass', srgb('#9fd3ea'), 0.0, 0.1)
BELT = material('Belt', srgb('#25282e'), 0.0, 0.8)
MACH = material('Machine', srgb('#6c5cf0'), 0.2, 0.4)
MACH_T = material('MachineTrim', srgb('#ece8ff'), 0.3, 0.35)
BAG = material('Bag', srgb('#d8b98a'), 0.0, 0.85)
BAG_H = material('BagHandle', srgb('#7a5233'), 0.0, 0.7)

ASSETS = []  # (object, AO density)


# ---------- helpers ----------

def rod(name, a, b, r, mat, segs=6):
    """A thin cylinder from a to b (three.js points)."""
    pa, pb = P(*a), P(*b)
    d = pb - pa
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=d.length)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=(pa + pb) / 2, verts=bm.verts)
    ob = link(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def outline(x0, x1, z0, z1, r, n=6, jitter=0.0):
    """Rounded rectangle outline [(x, z)] in the ground plane (counterclockwise from above)."""
    pts = []
    for cx, cz, a0 in ((x1 - r, z1 - r, 0), (x1 - r, z0 + r, 270), (x0 + r, z0 + r, 180), (x0 + r, z1 - r, 90)):
        for i in range(n + 1):
            a = math.radians(a0 - 90 * i / n)
            j = 1 + (rnd.uniform(-jitter, jitter) if jitter else 0)
            pts.append((cx + r * j * math.cos(a), cz + r * j * math.sin(a)))
    return pts


def slab(name, pts, y0, y1, top, side=None, bottom=None):
    """Extrudes a ground outline from y0 to y1 (top face material `top`, sides `side`)."""
    bm = bmesh.new()
    lo = [bm.verts.new(P(x, y0, z)) for x, z in pts]
    hi = [bm.verts.new(P(x, y1, z)) for x, z in pts]
    n = len(pts)
    f_top = bm.faces.new(hi)
    f_bot = bm.faces.new(list(reversed(lo)))
    sides = [bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i])) for i in range(n)]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mats = [top] + ([side] if side else []) + ([bottom] if bottom else [])
    f_top.material_index = 0
    for f in sides:
        f.material_index = 1 if side else 0
    f_bot.material_index = (2 if bottom else (1 if side else 0))
    ob = link(name, bm, mats[0])
    for m in mats[1:]:
        ob.data.materials.append(m)
    return ob


def moved(objs, x=0, y=0, z=0, ry=0):
    """Turns parts about the three.js y axis and moves them."""
    m = Matrix.Translation(P(x, y, z)) @ Matrix.Rotation(ry, 4, 'Z')
    for ob in objs:
        ob.matrix_world = m @ ob.matrix_world
    return objs


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ---------- bricks ----------

tbox('Brick', (0, 0, 0), (L - GAP, H - GAP, D - GAP), CLAY, bev=0.0028, segs=2)
tbox('BrickHalf', (0, 0, 0), (L / 2 - GAP, H - GAP, D - GAP), CLAY, bev=0.0028, segs=2)


def gold_brick():
    bm = bmesh.new()
    w0, d0, w1, d1, h = L - GAP, D - GAP, L - GAP - 0.012, D - GAP - 0.008, H - GAP
    vs = [bm.verts.new(P(sx * w / 2, y, sz * d / 2)) for (w, d, y) in ((w0, d0, -h / 2), (w1, d1, h / 2)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for f in ((0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = link('goldbody', bm, GOLD)
    mod = body.modifiers.new('Bevel', 'BEVEL')
    mod.width = 0.003
    mod.segments = 3
    parts = [body]
    parts.append(tcyl('emblem', (0, h / 2 + 0.0008, 0), 0.0085, 0.0024, GOLD, segs=24))
    parts.append(ttorus('emblemring', (0, h / 2 + 0.002, 0), 0.0085, 0.0011, GOLD, axis='y', segs=24, tsegs=6))
    ob = merge(parts, 'BrickGold')
    return smooth(ob)


gold_brick()

# ---------- the plot ----------

p = []
PX0, PX1, PZ0, PZ1 = -0.5, 0.62, -0.4, 0.4
# Earth body with a darker band and a few pebbles, a grass top with a soft, slightly ragged edge.
p.append(slab('earth', outline(PX0 + 0.004, PX1 - 0.004, PZ0 + 0.004, PZ1 - 0.004, 0.07, 6), -0.07, -0.008, SOIL, SOIL))
p.append(slab('band', outline(PX0 + 0.001, PX1 - 0.001, PZ0 + 0.001, PZ1 - 0.001, 0.072, 6), -0.05, -0.042, SOIL_D, SOIL_D))
p.append(slab('grass', outline(PX0, PX1, PZ0, PZ1, 0.075, 8, jitter=0.05), -0.012, 0.0, GRASS, GRASS_D))
for i in range(26):
    a = rnd.uniform(0, 2 * math.pi)
    side = rnd.choice(((PX0, None), (PX1, None), (None, PZ0), (None, PZ1)))
    x = side[0] if side[0] is not None else rnd.uniform(PX0 + 0.1, PX1 - 0.1)
    z = side[1] if side[1] is not None else rnd.uniform(PZ0 + 0.1, PZ1 - 0.1)
    p.append(blob('pebble', (x, rnd.uniform(-0.06, -0.02), z), rnd.uniform(0.006, 0.011), STONE, s=(1.3, 0.8, 1.1), segs=8, rings=5))

# Foundation slab and the door step.
p.append(tbox('found', (0, FOUND / 2, HZ), (2 * OX + 0.024, FOUND, 2 * OZ + 0.024), CONC, bev=0.002))
p.append(tbox('step', (0, 0.006, HZ + OZ + 0.034), (0.11, 0.012, 0.045), CONC, bev=0.002))

# Stepping-stone path from the step to the gate.
z = HZ + OZ + 0.085
k = 0
while z < PZ1 - 0.03:
    x = 0.012 * math.sin(k * 1.7)
    p.append(tcyl('path', (x, 0.002, z), 0.021 + rnd.uniform(-0.002, 0.003), 0.006, STONE, segs=10, bev=0.0015))
    z += 0.046
    k += 1

# Picket fence along the front edge with a gap for the gate (path).
FZ = PZ1 - 0.035
for (x0, x1) in ((-0.47, -0.05), (0.05, 0.3)):
    n = int((x1 - x0) / 0.026)
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        h = 0.05 if i % 4 else 0.058
        p.append(tbox('picket', (x, h / 2, FZ), (0.009, h, 0.005), FENCE, bev=0.0012))
        tip = bmesh.new()
        # pointed tip
        a = [tip.verts.new(P(x + sx * 0.0045, h, FZ + sz * 0.0025)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        c = tip.verts.new(P(x, h + 0.007, FZ))
        for i2 in range(4):
            tip.faces.new((a[i2], a[(i2 + 1) % 4], c))
        bmesh.ops.recalc_face_normals(tip, faces=tip.faces)
        p.append(link('pickettip', tip, FENCE))
    for y in (0.016, 0.036):
        p.append(tbox('rail', ((x0 + x1) / 2, y, FZ - 0.0045), (x1 - x0 + 0.01, 0.006, 0.004), FENCE))

# Mailbox and garden lamp at the gate.
p.append(tbox('mailpost', (0.075, 0.024, FZ - 0.025), (0.008, 0.048, 0.008), WOOD_D))
p.append(tbox('mailbox', (0.075, 0.056, FZ - 0.025), (0.026, 0.02, 0.034), MAIL, bev=0.004))
p.append(tbox('mailflag', (0.09, 0.064, FZ - 0.03), (0.002, 0.016, 0.004), FENCE))
p.append(tcyl('lamppost', (-0.075, 0.035, FZ - 0.025), 0.0032, 0.07, DARK, segs=8))
p.append(tbox('lampbox', (-0.075, 0.077, FZ - 0.025), (0.016, 0.018, 0.016), LAMP))
p.append(tbox('lamproof', (-0.075, 0.089, FZ - 0.025), (0.022, 0.005, 0.022), DARK, bev=0.001))

# The little fir tree (the game strings fairy lights around it).
fx, fz = FIR
p.append(tcyl('firtrunk', (fx, 0.02, fz), 0.009, 0.04, BARK, segs=10))
for (y0, h, r) in ((0.025, 0.1, 0.078), (0.085, 0.09, 0.06), (0.14, 0.09, 0.042), (0.19, 0.065, 0.026)):
    p.append(tcyl('firtier', (fx, y0 + h / 2, fz), r, h, LEAF_D, segs=18, r2=0.003))
p.append(blob('firstar', (fx, 0.262, fz), 0.008, LAMP, segs=8, rings=6))

# Evergreen shrubs with red berries along the house and the fence.
for (x, z, r) in ((-0.31, 0.02, 0.032), (-0.3, -0.12, 0.028), (-0.29, 0.14, 0.03), (0.17, 0.27, 0.026), (-0.17, 0.27, 0.028), (-0.24, 0.3, 0.022), (0.3, 0.33, 0.024)):
    p.append(blob('shrub', (x, r * 0.75, z), r, LEAF, s=(1.15, 0.95, 1.0), segs=12, rings=8))
    p.append(blob('shrub2', (x + r * 0.5, r * 0.6, z + r * 0.3), r * 0.7, LEAF_D, segs=10, rings=7))
    for i in range(4):
        a = rnd.uniform(0, 2 * math.pi)
        p.append(blob('berry', (x + math.cos(a) * r * 0.8, r * (0.9 + rnd.uniform(0, 0.5)), z + math.sin(a) * r * 0.8), 0.0045, BERRY, segs=6, rings=4))

# A round tree at the back right.
p.append(tcyl('treetrunk', (0.27, 0.05, -0.33), 0.009, 0.1, BARK, segs=10))
p.append(blob('treecrown', (0.27, 0.13, -0.33), 0.055, LEAF, s=(1, 1.1, 1), segs=14, rings=10))
p.append(blob('treecrown2', (0.24, 0.115, -0.31), 0.038, LEAF_D, segs=12, rings=8))

# Sand pile with a shovel at the back left.
p.append(blob('sand', (-0.37, 0.0, -0.3), 0.06, SAND, s=(1.2, 0.55, 1.0), segs=16, rings=10))
p.append(rod('shovel', (-0.34, 0.03, -0.29), (-0.29, 0.1, -0.27), 0.0025, WOOD))
p.append(tbox('shovelblade', (-0.35, 0.022, -0.292), (0.018, 0.024, 0.004), METAL, bev=0.001))

# Gravel delivery zone under the belt and the pallet.
p.append(slab('gravel', outline(0.37, 0.59, -0.37, 0.3, 0.04, 5, jitter=0.1), 0.0, 0.002, GRAVEL))

plot = merge(p, 'Plot')
ASSETS.append((plot, 0.04))

# ---------- window, door, canopy ----------

FR = 0.006  # frame profile


def window():
    w, h = L, 3 * H
    q = []
    for (cx, cy, sx, sy) in ((0, h / 2 - FR / 2, w, FR), (0, -h / 2 + FR / 2, w, FR), (-w / 2 + FR / 2, 0, FR, h), (w / 2 - FR / 2, 0, FR, h)):
        q.append(tbox('wf', (cx, cy, 0.006), (sx, sy, 0.02), FRAME, bev=0.0008))
    q.append(tbox('wm1', (0, 0, 0.008), (w - 2 * FR, 0.004, 0.006), FRAME))
    q.append(tbox('wm2', (0, 0, 0.008), (0.004, h - 2 * FR, 0.006), FRAME))
    q.append(tbox('glass', (0, 0, 0.004), (w - 2 * FR, h - 2 * FR, 0.002), GLASS))
    q.append(tbox('sill', (0, -h / 2 - 0.003, 0.016), (w + 0.012, 0.006, 0.024), CONC, bev=0.001))
    q.append(tbox('lintel', (0, h / 2 + 0.002, 0.017), (w + 0.008, 0.004, 0.003), CONC))
    return merge(q, 'Window')


window()


def door_frame():
    w, h = L, 5 * H
    q = []
    for (cx, cy, sx, sy) in ((0, h / 2 - FR / 2, w, FR), (-w / 2 + FR / 2, 0, FR, h), (w / 2 - FR / 2, 0, FR, h)):
        q.append(tbox('df', (cx, cy, 0.006), (sx, sy, 0.02), FRAME, bev=0.0008))
    # canopy over the door and a wall lamp beside it
    q.append(tbox('canopy', (0, h / 2 + 0.012, 0.03), (w + 0.03, 0.005, 0.042), ROOF_D, bev=0.001))
    for sx in (-1, 1):
        q.append(rod('bracket', (sx * (w / 2 + 0.008), h / 2 - 0.005, 0.019), (sx * (w / 2 + 0.008), h / 2 + 0.01, 0.048), 0.0015, DARK))
    q.append(tbox('lamp', (-w / 2 - 0.022, h / 2 - 0.03, 0.024), (0.012, 0.018, 0.01), LAMP))
    q.append(tbox('lampcap', (-w / 2 - 0.022, h / 2 - 0.019, 0.024), (0.016, 0.004, 0.014), DARK))
    q.append(tbox('mat', (0, -h / 2 + 0.001, 0.03), (w - 0.01, 0.002, 0.024), WOOD_D))
    return merge(q, 'DoorFrame')


door_frame()


def door():
    w, h = L - 2 * FR - 0.001, 5 * H - FR - 0.001
    q = [tbox('leaf', (w / 2, 0, 0), (w, h, 0.006), DOOR, bev=0.0008)]
    for (cy, ph) in ((-h * 0.22, h * 0.4), (h * 0.2, h * 0.26)):
        q.append(tbox('panel', (w / 2, cy, 0.0035), (w * 0.62, ph, 0.002), DOOR, bev=0.0006))
    q.append(tbox('dglass', (w / 2, h * 0.39, 0.0035), (w * 0.5, h * 0.08, 0.002), GLASS))
    q.append(blob('knob', (w - 0.008, -0.004, 0.006), 0.0032, GOLD, segs=8, rings=6))
    ob = merge(q, 'Door')
    return ob


door()

# ---------- roof ----------

r = []
slope = RIDGE / OZ
EZ, EY = OZ + EAVE, -EAVE * slope   # eave edge (z, y) on the roof plane
RX = OX + 0.03                       # gable overhang
ROWS = 7
L_SLOPE = math.hypot(EZ, RIDGE - EY)
for side in (-1, 1):
    u = Vector((-EZ * side, RIDGE - EY)).normalized()   # along the slope towards the ridge (z, y)
    n = Vector((-u.y, u.x))                              # outwards and up
    if n.y < 0:
        n = -n
    E = Vector((EZ * side, EY))
    seg = L_SLOPE / ROWS
    for k in range(ROWS):
        a = E + u * (k * seg)
        b = E + u * min(L_SLOPE + 0.004, (k + 1) * seg + 0.006)
        t0, t1 = 0.012, 0.006
        prof = [tuple(a), tuple(b), tuple(b + n * t1), tuple(a + n * t0)]
        if side < 0:
            prof = list(reversed(prof))
        r.append(prism('tiles', prof, -RX, RX, ROOF_D if k == 0 else ROOF, smooth=False))
# ridge cap
r.append(tcyl('ridge', (0, RIDGE + 0.008, 0), 0.011, 2 * RX + 0.006, ROOF_D, axis='x', segs=12))
# gables with horizontal cladding and a round attic window
for sx in (-1, 1):
    r.append(prism('gable', [(-OZ, 0.0), (OZ, 0.0), (0.0, RIDGE)], sx * XH - D / 2, sx * XH + D / 2, GABLE, smooth=False))
    yb = 0.012
    while yb < RIDGE - 0.02:
        half = OZ * (1 - (yb + 0.004) / RIDGE) - 0.004
        r.append(tbox('board', (sx * (OX + 0.0012), yb, 0), (0.003, 0.004, 2 * half), GABLE))
        yb += 0.018
    r.append(ttorus('attic', (sx * (OX + 0.003), RIDGE * 0.42, 0), 0.016, 0.003, FRAME, axis='x', segs=24, tsegs=6))
    r.append(tcyl('atticglass', (sx * (OX + 0.0015), RIDGE * 0.42, 0), 0.0145, 0.003, GLASS, axis='x', segs=20))
    # barge boards along both slopes
    for side in (-1, 1):
        a = Vector((EZ * side, EY))
        b = Vector((0.0, RIDGE))
        m = (a + b) / 2
        ln = (b - a).length
        ang = math.atan2(b.y - a.y, b.x - a.x)
        bb = tbox('barge', (0, 0, 0), (0.006, 0.016, ln), FRAME)
        bb.matrix_world = Matrix.Translation(P(sx * (RX - 0.003), m.y + 0.004, m.x)) @ Matrix.Rotation(-ang, 4, 'X') @ bb.matrix_world
        r.append(bb)
# gutters along the eaves
for side in (-1, 1):
    r.append(tcyl('gutter', (0, EY - 0.008, side * (EZ + 0.004)), 0.007, 2 * RX - 0.01, METAL, axis='x', segs=10))
    r.append(tcyl('downpipe', (-(RX - 0.02), EY - 0.07, side * (EZ + 0.004)), 0.004, 0.12, METAL, segs=8))
# chimney
r.append(tbox('chimney', (0.12, RIDGE * 0.62, -0.07), (0.046, RIDGE * 1.05, 0.046), CLAY, bev=0.002))
r.append(tbox('chimcap', (0.12, RIDGE * 1.15, -0.07), (0.058, 0.008, 0.058), CONC, bev=0.0015))
roof = merge(r, 'Roof')
ASSETS.append((roof, 0.035))

# ---------- crane ----------

c = []
MW = 0.05      # mast width
MH = 0.6       # mast height (top of the slewing ring at MH + 0.015)
c.append(tbox('ballast1', (0, 0.012, 0), (0.1, 0.024, 0.1), CONC, bev=0.002))
c.append(tbox('ballast2', (0, 0.03, 0), (0.07, 0.012, 0.07), CONC, bev=0.002))
corners = [(sx * MW / 2, sz * MW / 2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
for (x, z) in corners:
    c.append(rod('chord', (x, 0.036, z), (x, MH, z), 0.0032, CRANE, segs=6))
step = 0.05
y = 0.036
k = 0
while y + step <= MH + 1e-6:
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        if k % 2 == 0:
            c.append(rod('diag', (a[0], y, a[1]), (b[0], y + step, b[1]), 0.0018, CRANE, segs=4))
        else:
            c.append(rod('diag', (b[0], y, b[1]), (a[0], y + step, a[1]), 0.0018, CRANE, segs=4))
    y += step
    k += 1
c.append(tcyl('ring', (0, MH + 0.0075, 0), 0.035, 0.015, CRANE_D, segs=20))
mast = merge(c, 'CraneMast')

j = []
JL, CJ = 0.56, 0.2  # jib and counter-jib lengths
JY = 0.03           # jib bottom chord height above the ring
# cab beside the mast top
j.append(tbox('cab', (0.0, 0.03, 0.042), (0.04, 0.04, 0.032), CRANE, bev=0.003))
j.append(tbox('cabglass', (0.0, 0.034, 0.059), (0.032, 0.022, 0.002), CGLASS))
j.append(tbox('turntable', (0, 0.008, 0), (0.06, 0.016, 0.06), CRANE_D, bev=0.002))
# jib: a triangular lattice along +x
tri = [(-0.012, JY, -0.012), (-0.012, JY, 0.012), (0.012, JY + 0.026, 0.0)]
for (_, yy, zz) in tri:
    j.append(rod('jchord', (0.02, yy, zz), (JL, yy, zz), 0.0022, CRANE, segs=5))
xs = 0.02
k = 0
while xs + 0.04 <= JL + 1e-6:
    for a, b in ((tri[0], tri[2]), (tri[1], tri[2]), (tri[0], tri[1])):
        xa, xb = (xs, xs + 0.04) if k % 2 == 0 else (xs + 0.04, xs)
        j.append(rod('jdiag', (xa, a[1], a[2]), (xb, b[1], b[2]), 0.0013, CRANE, segs=4))
    xs += 0.04
    k += 1
j.append(tbox('jtip', (JL, JY + 0.012, 0), (0.008, 0.03, 0.028), CRANE))
# counter-jib with counterweights
for zz in (-0.012, 0.012):
    j.append(rod('cjib', (0.0, JY, zz), (-CJ, JY, zz), 0.0028, CRANE, segs=5))
for xx in (-0.05, -0.1):
    j.append(tbox('walk', (xx, JY - 0.002, 0), (0.05, 0.003, 0.028), CRANE_D))
for i, xx in enumerate((-0.16, -0.185)):
    j.append(tbox('weight', (xx, JY - 0.018, 0), (0.022, 0.04, 0.032), CONC, bev=0.0015))
# tower head and the ties
j.append(rod('apexA', (-0.012, JY, -0.012), (0, 0.14, 0), 0.0025, CRANE, segs=5))
j.append(rod('apexB', (-0.012, JY, 0.012), (0, 0.14, 0), 0.0025, CRANE, segs=5))
j.append(rod('apexC', (0.012, JY + 0.026, 0), (0, 0.14, 0), 0.0025, CRANE, segs=5))
j.append(rod('tie1', (0, 0.14, 0), (JL * 0.62, JY + 0.026, 0), 0.0012, CRANE_D, segs=4))
j.append(rod('tie2', (0, 0.14, 0), (-CJ, JY, 0), 0.0012, CRANE_D, segs=4))
j.append(tbox('lampjib', (JL, JY + 0.03, 0), (0.008, 0.008, 0.008), LAMP))
jib = merge(j, 'CraneJib')

t = []
t.append(tbox('trolley', (0, -0.006, 0), (0.024, 0.01, 0.03), CRANE_D, bev=0.0015))
for sz in (-1, 1):
    t.append(tcyl('wheel', (0, 0.0, sz * 0.012), 0.004, 0.004, DARK, axis='z', segs=8))
merge(t, 'CraneTrolley')

h = []
h.append(tbox('block', (0, -0.012, 0), (0.018, 0.024, 0.01), CRANE, bev=0.002))
h.append(tcyl('sheave', (0, -0.006, 0), 0.006, 0.012, DARK, axis='z', segs=12))
h.append(tcyl('shank', (0, -0.029, 0), 0.0022, 0.012, METAL, segs=8))
h.append(ttorus('hook', (0.004, -0.04, 0), 0.007, 0.0018, METAL, axis='z', segs=16, tsegs=6, arc=math.pi * 1.4))
merge(h, 'CraneHook')

# ---------- delivery: pallet, belt, machine, coin, bag ----------

q = []
PW, PD = 0.17, 0.15
for zz in (-PD / 2 + 0.012, 0.0, PD / 2 - 0.012):
    for xx in (-PW / 2 + 0.012, 0.0, PW / 2 - 0.012):
        q.append(tbox('pblock', (xx, 0.008, zz), (0.022, 0.012, 0.022), WOOD_D, bev=0.0012))
for zz in (-PD / 2 + 0.012, 0.0, PD / 2 - 0.012):
    q.append(tbox('pboard', (0, 0.016, zz), (PW, 0.004, 0.024), WOOD, bev=0.0008))
for i in range(5):
    xx = -PW / 2 + 0.017 + i * (PW - 0.034) / 4
    q.append(tbox('ptop', (xx, 0.0215, 0), (0.03, 0.007, PD), WOOD, bev=0.001))
pallet = merge(q, 'Pallet')
ASSETS.append((pallet, 0.03))

q = []
BL, BW, BY = 0.25, 0.064, 0.045   # belt length (+z), width, top height
for sx in (-1, 1):
    q.append(tbox('rail', (sx * (BW / 2 + 0.005), BY - 0.004, BL / 2), (0.006, 0.016, BL + 0.02), CRANE_D, bev=0.001))
    for zz in (0.02, BL - 0.02):
        q.append(tbox('leg', (sx * (BW / 2 + 0.005), (BY - 0.012) / 2, zz), (0.006, BY - 0.012, 0.008), METAL))
q.append(tbox('belt', (0, BY - 0.003, BL / 2), (BW, 0.006, BL), BELT, bev=0.0015))
for zz in (0.0, BL):
    q.append(tcyl('roller', (0, BY - 0.003, zz), 0.0055, BW + 0.004, METAL, axis='x', segs=12))
merge(q, 'Conveyor')

q = []
MW2, MH2, MD2 = 0.13, 0.13, 0.1
q.append(tbox('mbody', (0, 0.012 + MH2 / 2, 0), (MW2, MH2, MD2), MACH, bev=0.014, segs=4))
q.append(tbox('mtrim', (0, 0.012 + MH2 * 0.18, 0), (MW2 + 0.004, 0.008, MD2 + 0.004), MACH_T, bev=0.002))
for sx in (-1, 1):
    for sz in (-1, 1):
        q.append(tcyl('mfoot', (sx * 0.045, 0.006, sz * 0.032), 0.008, 0.012, DARK, segs=10))
# coin slot on the top, the hatch and the chute towards the belt, the lamp, the display recess
q.append(tbox('slotplate', (0, 0.012 + MH2 + 0.002, -0.01), (0.05, 0.004, 0.026), MACH_T, bev=0.0015))
q.append(tbox('slot', (0, 0.012 + MH2 + 0.0045, -0.01), (0.032, 0.002, 0.005), DARK))
q.append(tbox('hatch', (0, 0.012 + 0.032, MD2 / 2 + 0.001), (0.08, 0.04, 0.004), DARK, bev=0.002))
q.append(tbox('chute', (0, 0.012 + 0.016, MD2 / 2 + 0.02), (0.07, 0.004, 0.04), MACH_T))
q.append(tbox('display', (0, 0.012 + MH2 * 0.68, MD2 / 2 + 0.001), (0.1, 0.05, 0.003), DARK, bev=0.002))
q.append(tcyl('lampbase', (0.045, 0.012 + MH2 + 0.004, 0.025), 0.009, 0.008, DARK, segs=12))
q.append(blob('lampdome', (0.045, 0.012 + MH2 + 0.01, 0.025), 0.009, LAMP, segs=12, rings=8))
machine = merge(q, 'Machine')
ASSETS.append((machine, 0.03))

q = [tcyl('coin', (0, 0, 0), 0.012, 0.003, GOLD, axis='z', segs=24, bev=0.0006)]
q.append(ttorus('coinrim', (0, 0, 0.0016), 0.0095, 0.0008, GOLD, axis='z', segs=24, tsegs=5))
smooth(merge(q, 'Coin'))

q = [tbox('bag', (0, 0.03, 0), (0.05, 0.06, 0.026), BAG, bev=0.0015)]
q.append(tbox('bagfold', (0, 0.058, 0), (0.051, 0.006, 0.027), BAG))
for sz in (-1, 1):
    q.append(ttorus('handle', (0, 0.06, sz * 0.008), 0.012, 0.0015, BAG_H, axis='z', segs=16, tsegs=5, arc=math.pi))
merge(q, 'Bag')

bake_ao(ASSETS, {'LampGlow'}, distance=0.04, samples=48)
for ob in bpy.context.scene.objects:
    if ob.type == 'MESH':
        print('part', ob.name, len(ob.data.vertices))

if not CARD:
    export(OUT_GLB, OUT_BLEND)
    print('DONE')
    sys.exit(0)

# ---------- coin art: the finished house in winter with a golden brick ----------

sc = bpy.context.scene


def place(name, x=0, y=0, z=0, ry=0, s=1.0):
    src = bpy.data.objects[name]
    ob = src.copy()
    ob.data = src.data
    sc.collection.objects.link(ob)
    ob.matrix_world = Matrix.Translation(P(x, y, z)) @ Matrix.Rotation(ry, 4, 'Z') @ Matrix.Scale(s, 4)
    return ob


# Walls in running bond (like the game's plan, without the half-bat logic for openings).
OPEN = {'front': [(2.5, 3.5, 0, 4), (0.5, 1.5, 2, 4), (4.5, 5.5, 2, 4)], 'back': [(1, 2, 2, 4), (4, 5, 2, 4)],
        'left': [(1.5, 2.5, 2, 4)], 'right': [(1.5, 2.5, 2, 4)]}
WALLS = {'front': (6, (lambda u: (-3 * L + u, ZH)), 0), 'back': (6, (lambda u: (-3 * L + u, -ZH)), 0),
         'left': (4, (lambda u: (-XH, 2 * L - u)), math.pi / 2), 'right': (4, (lambda u: (XH, 2 * L - u)), math.pi / 2)}
y0 = FOUND
for wname, (n, at, ry) in WALLS.items():
    for course in range(COURSES):
        off = (0.5 if course % 2 else 0.0) if wname in ('front', 'back') else (0.0 if course % 2 else 0.5)
        cuts = [0.0, float(n)]
        segs = [(0.0, float(n))]
        for (a, b, c0, c1) in OPEN[wname]:
            if c0 <= course <= c1:
                new = []
                for (s0, s1) in segs:
                    if b <= s0 or a >= s1:
                        new.append((s0, s1))
                        continue
                    if a > s0:
                        new.append((s0, a))
                    if b < s1:
                        new.append((b, s1))
                segs = new
        for (s0, s1) in segs:
            k = math.floor(s0 - off)
            while k + off < s1 - 1e-6:
                a = max(s0, k + off)
                b = min(s1, k + 1 + off)
                if b - a > 1e-6:
                    u = (a + b) / 2 * L
                    x, zz = at(u)
                    name = 'Brick' if b - a > 0.75 else 'BrickHalf'
                    place(name, x, y0 + course * H + H / 2, HZ + zz, ry)
                k += 1
    # corner posts
for sx in (-1, 1):
    for sz in (-1, 1):
        for course in range(COURSES):
            place('BrickHalf', sx * XH, y0 + course * H + H / 2, HZ + sz * ZH)
# windows and the door
for (x, zz, ry) in ((-0.144, ZH, 0), (0.144, ZH, 0), (-0.108, -ZH, math.pi), (0.108, -ZH, math.pi), (-XH, 0, -math.pi / 2), (XH, 0, math.pi / 2)):
    place('Window', x, y0 + 3.5 * H, HZ + zz, ry)
place('DoorFrame', 0, y0 + 2.5 * H, HZ + ZH)
place('Door', -L / 2 + FR + 0.0005, y0 + 2.5 * H - FR / 2, HZ + ZH + 0.004, 0.5)
place('Roof', 0, y0 + TOP, HZ)
# Snow: soft white layers on both roof planes and caps on the fir tiers.
SNOW = material('Snow', srgb('#f4f8ff'), 0.0, 0.6)
for side in (-1, 1):
    u = Vector((-EZ * side, RIDGE - EY)).normalized()
    nrm = Vector((-u.y, u.x))
    if nrm.y < 0:
        nrm = -nrm
    E = Vector((EZ * side, EY)) + nrm * 0.012
    R = Vector((0, RIDGE)) + nrm * 0.006
    a, b = R + (E - R) * 0.62, R
    prof = [tuple(a), tuple(b), tuple(b + nrm * 0.012), tuple(a + nrm * 0.009)]
    if side < 0:
        prof = list(reversed(prof))
    sn = prism('snowroof', prof, -RX + 0.01, RX - 0.01, SNOW)
    bev = sn.modifiers.new('Bevel', 'BEVEL')
    bev.width = 0.004
    bev.segments = 3
    sn.matrix_world = Matrix.Translation(P(0, y0 + TOP, HZ)) @ sn.matrix_world
for (yy, rr) in ((0.075, 0.07), (0.13, 0.054), (0.18, 0.038)):
    smooth(tcyl('firsnow', (FIR[0], yy, FIR[1]), rr * 0.75, 0.012, SNOW, segs=18, r2=rr * 0.35))
# fairy lights along the front eave
LIGHTS = [material(f'Bulb{i}', (0, 0, 0), emit=srgb(h)) for i, h in enumerate(('#ff5a5a', '#ffd36b', '#9be86b', '#5fe1ff', '#ff8ad8'))]
for m in LIGHTS:
    m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 6.0
for i in range(22):
    u = (i + 0.5) / 22
    s = (u * 3) % 1
    x = -RX + 2 * RX * u
    blob('bulb', (x, y0 + TOP + EY - 0.016 - 0.03 * 4 * s * (1 - s), HZ + EZ + 0.01), 0.0065, LIGHTS[i % 5], segs=8, rings=6)
for i in range(16):
    u = (i + 0.5) / 16
    yy = 0.04 + u * 0.19
    a = u * math.pi * 2 * 2.6
    rr = 0.08 * (0.26 - yy) / 0.23 + 0.01
    blob('firbulb', (FIR[0] + math.cos(a) * rr, yy, FIR[1] + math.sin(a) * rr), 0.0055, LIGHTS[i % 5], segs=8, rings=6)
# warm light behind the windows
LAMP.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 3.0
GLASS.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (*srgb('#ffbf5e'), 1)
GLASS.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.2
inner = bpy.data.lights.new('inner', 'POINT')
inner.energy = 2.5
inner.color = srgb('#ffc070')
inner.shadow_soft_size = 0.05
ob = bpy.data.objects.new('inner', inner)
ob.location = P(0, y0 + 0.12, HZ)
sc.collection.objects.link(ob)
# the golden brick, floating in front with a glow
GB = (0.17, 0.085, 0.3)
gb = place('BrickGold', *GB, 0.0, 2.3)
gb.rotation_euler = (0.55, -0.35, 0.35)
glow = bpy.data.lights.new('goldglow', 'POINT')
glow.energy = 1.6
glow.color = srgb('#ffd36b')
ob = bpy.data.objects.new('goldglow', glow)
ob.location = P(GB[0] + 0.03, GB[1] + 0.06, GB[2] + 0.08)
sc.collection.objects.link(ob)
SPARK = material('Spark', (0, 0, 0), emit=srgb('#fff1b8'))
SPARK.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 8.0
for (dx, dy, dz, rr) in ((-0.07, 0.07, 0.0, 0.006), (0.08, 0.05, -0.02, 0.005), (0.05, -0.05, 0.04, 0.004), (-0.08, -0.03, 0.03, 0.0035), (0.1, 0.11, -0.05, 0.004)):
    blob('spark', (GB[0] + dx, GB[1] + dy, GB[2] + dz), rr, SPARK, segs=8, rings=6)
# snowflakes in the air and a few stars far behind
FLAKE = material('Flake', (0, 0, 0), emit=srgb('#f4f8ff'))
FLAKE.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.6
fr = random.Random(5)
for i in range(70):
    blob('flake', (fr.uniform(-0.75, 0.75), fr.uniform(0.05, 0.75), fr.uniform(-0.5, 0.55)), fr.uniform(0.0025, 0.0045), FLAKE, segs=6, rings=4)
STAR = material('StarDot', (0, 0, 0), emit=srgb('#fff4d6'))
STAR.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 4.0
for i in range(40):
    blob('stardot', (fr.uniform(-2.6, 2.6), fr.uniform(0.9, 2.4), fr.uniform(-3.5, -2.2)), fr.uniform(0.006, 0.012), STAR, segs=6, rings=4)

# Hide the loose parts (they stay in the file for the game).
for name in ('Brick', 'BrickHalf', 'BrickGold', 'Window', 'DoorFrame', 'Door', 'Roof', 'CraneMast', 'CraneJib', 'CraneTrolley', 'CraneHook', 'Pallet', 'Conveyor', 'Machine', 'Coin', 'Bag'):
    bpy.data.objects[name].hide_render = True

# World: a deep winter night gradient from the tokens (violet at the horizon, ink above).
sc.world.use_nodes = True
nt = sc.world.node_tree
for nd in list(nt.nodes):
    if nd.type != 'OUTPUT_WORLD':
        nt.nodes.remove(nd)
tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
ramp = nt.nodes.new('ShaderNodeValToRGB')
bg = nt.nodes.new('ShaderNodeBackground')
nt.links.new(tc.outputs['Window'], sep.inputs[0])
nt.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].color = (*srgb('#5a3fc0'), 1)
ramp.color_ramp.elements[1].color = (*srgb('#0f1630'), 1)
ramp.color_ramp.elements[0].position = 0.15
ramp.color_ramp.elements[1].position = 0.95
nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0
nt.links.new(bg.outputs['Background'], nt.nodes['World Output'].inputs['Surface'])
# Keep the bright background out of the lighting: a light path switch.
lp = nt.nodes.new('ShaderNodeLightPath')
mix = nt.nodes.new('ShaderNodeMixShader')
amb = nt.nodes.new('ShaderNodeBackground')
amb.inputs['Color'].default_value = (*srgb('#7c86c8'), 1)
amb.inputs['Strength'].default_value = 0.35
nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
nt.links.new(amb.outputs['Background'], mix.inputs[1])
nt.links.new(bg.outputs['Background'], mix.inputs[2])
nt.links.new(mix.outputs['Shader'], nt.nodes['World Output'].inputs['Surface'])

key = bpy.data.lights.new('key', 'AREA')
key.energy = 22
key.size = 1.2
key.color = srgb('#fff0dc')
ob = bpy.data.objects.new('key', key)
ob.location = P(-0.9, 1.3, 1.2)
ob.rotation_euler = (ob.location - P(0, 0.1, 0)).to_track_quat('Z', 'Y').to_euler()
sc.collection.objects.link(ob)
rim = bpy.data.lights.new('rim', 'AREA')
rim.energy = 14
rim.size = 1.0
rim.color = srgb('#9db4ff')
ob = bpy.data.objects.new('rim', rim)
ob.location = P(1.0, 0.8, -1.2)
ob.rotation_euler = (ob.location - P(0, 0.1, 0)).to_track_quat('Z', 'Y').to_euler()
sc.collection.objects.link(ob)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.lens = 50
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = P(-0.24, 0.44, 1.18)
cam.rotation_euler = (cam.location - P(0.0, 0.135, 0.03)).to_track_quat('Z', 'Y').to_euler()
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 64
sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = 512
sc.render.film_transparent = False
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.filepath = CARD
bpy.ops.render.render(write_still=True)
print('DONE')

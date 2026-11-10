# "Gipfelgespräch" / "Summit Talk": the climbing wall that is a sales conversation (original
# design). Builds two GLBs and the .blend:
#   summit.glb
#     SummitWall       the rock face (three.js units, wall-local: x across, y up, front = +z):
#                      a buttress of rock from y = -1.4 (hidden in the sea of clouds) up to the
#                      summit plateau at y = 1.2 (5 sections of STEP = 0.24, one per stage of the
#                      conversation, alternating rock strata), thin ledges between the sections,
#                      a start ledge at y = 0, bolts for the quickdraws, snow on ledges and plateau
#     SummitPeak       the rocky summit cap behind the plateau
#     SummitHold0..3   climbing holds (jug, crimp, sloper, pinch), back at z = 0, front = +z
#     SummitQuickdraw  hanger, two carabiners and a sling (origin at the bolt, hangs down -y)
#     SummitFlag       pole (origin at its foot) with the cloth SummitFlagCloth (UVs 0..1)
#     SummitCross      wooden summit cross with a sunburst and a summit-book box (Christmas)
#     SummitPeakA..C   snowy mountains for the backdrop (height 1, origin at the foot)
#     SummitHarness    Echo's climbing harness, built in Echo's own model space like the goggles
#                      (unit E = body width, see build_echo.py), with an empty HarnessTieIn
#   summit-customer.glb
#     SummitCustomer   the customer, a toy-like figure (height 1, origin between the feet, front
#                      +z): CustBody, CustHead (pivot at the neck, with face parts and the hair
#                      variants CustHairBun/Short/Curly/Long, CustBeard, CustGlasses), CustArmL/R
#                      (pivot at the shoulder), CustTie, CustScarf, CustApron (toggled by the app)
# Materials are named for the design tokens the app tints them with (SummitRock, SummitRockAlt,
# SummitSnow, SummitMetal, SummitHold, SummitHoldBolt, SummitSling, SummitPole, SummitGold,
# SummitFlagCloth, SummitWood, SummitPeakRock, SummitPeakSnow, SummitHarnessWeb, SummitHarnessMetal,
# SummitHarnessBag, Cust*). Ambient occlusion is baked into the vertex colors.
# Usage: blender -b -P build_summit.py -- <summit.glb> <summit.blend> [<preview dir>]
#        (summit-customer.glb is written next to summit.glb)
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix, noise
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, merge, bake_ao, blob, densify

ARGS = sys.argv[sys.argv.index('--') + 1:]
# Coin picture for the menu: blender -b -P build_summit.py -- --coin <out.png> [<size> <samples>]
COIN = ARGS[1] if ARGS and ARGS[0] == '--coin' else None
if not COIN:
    OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
    OUT_CUST = os.path.join(os.path.dirname(OUT_GLB), 'summit-customer.glb')
    PREVIEW = ARGS[2] if len(ARGS) > 2 else None
init()
random.seed(7)

STEP = 0.24
SECTIONS = 5
TOP = STEP * SECTIONS  # 1.2, the summit plateau
BOTTOM = -1.4

ROCK = material('SummitRock', (0.42, 0.42, 0.5), 0.0, 0.88)
ROCK2 = material('SummitRockAlt', (0.34, 0.33, 0.42), 0.0, 0.9)
SNOW = material('SummitSnow', (0.93, 0.95, 1.0), 0.0, 0.75)
METAL = material('SummitMetal', (0.75, 0.78, 0.85), 0.9, 0.3)
HOLD = material('SummitHold', (0.9, 0.5, 0.2), 0.0, 0.55)
HBOLT = material('SummitHoldBolt', (0.1, 0.1, 0.12), 0.8, 0.35)
SLING = material('SummitSling', (0.2, 0.7, 0.9), 0.0, 0.6)
POLE = material('SummitPole', (0.7, 0.72, 0.78), 0.8, 0.3)
GOLD = material('SummitGold', (1.0, 0.75, 0.3), 1.0, 0.25)
CLOTH = material('SummitFlagCloth', (1, 1, 1), 0.0, 0.7)
WOOD = material('SummitWood', (0.45, 0.28, 0.16), 0.0, 0.7)
PROCK = material('SummitPeakRock', (0.3, 0.32, 0.42), 0.0, 0.9)
PSNOW = material('SummitPeakSnow', (0.92, 0.95, 1.0), 0.0, 0.7)


def smooth(ob, on=True):
    for p in ob.data.polygons:
        p.use_smooth = on
    return ob


def fbm(x, y, z, oct=4):
    return noise.fractal(Vector((x, y, z)), 1.0, 2.0, oct, noise_basis='PERLIN_ORIGINAL')


# ---------- the rock face ----------

def half_width(y):
    """Silhouette: a wide base, narrowing towards the summit, with a rocky edge."""
    if y < 0:
        w = 0.6 - 0.04 * (y / BOTTOM)
    else:
        w = 0.6 - 0.12 * (y / TOP)
    return w + 0.035 * fbm(3.1, y * 4.0, 0.5, 3)


def face_z(x, y, hw):
    """Depth of the front surface: rocky relief, sides curving back, ledges between sections."""
    u = x / hw
    z = -0.32 * abs(u) ** 3.2  # the buttress bends back at the sides
    z += 0.028 * fbm(x * 5.0, y * 5.0, 1.7, 4) + 0.012 * fbm(x * 17.0, y * 17.0, 3.3, 2)
    # Vertical cracks and strata.
    z -= 0.012 * max(0.0, math.sin(x * 23.0 + 2.0 * math.sin(y * 3.0))) ** 6
    # A small ledge just above every section boundary (snow catches on it).
    for k in range(1, SECTIONS):
        d = y - k * STEP
        if -0.018 < d < 0.012:
            z += 0.016 * (1 - abs(d + 0.003) / 0.016) * (1 - abs(u) ** 2)
    return z


def build_face():
    bm = bmesh.new()
    rows = []
    NX = 44
    ys = []
    y = BOTTOM
    while y < TOP + 0.03:
        ys.append(y)
        y += 0.026 if y > -0.3 else 0.07
    ys.append(TOP + 0.03)
    BACK = -0.5
    for y in ys:
        hw = half_width(y)
        loop = []
        for i in range(NX + 1):
            u = -1 + 2 * i / NX
            x = u * hw
            loop.append(bm.verts.new(P(x, y, face_z(x, y, hw))))
        loop.append(bm.verts.new(P(hw * 0.9, y, BACK)))
        loop.append(bm.verts.new(P(-hw * 0.9, y, BACK)))
        rows.append((y, loop))
    n = NX + 3
    for r in range(len(rows) - 1):
        a = rows[r][1]
        b = rows[r + 1][1]
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            # Alternating strata: one rock tone per section of the conversation.
            yc = (rows[r][0] + rows[r + 1][0]) / 2
            f.material_index = 1 if (yc > 0 and int(yc / STEP) % 2 == 1) else 0
    bm.faces.new(list(reversed(rows[0][1])))
    bm.faces.new(rows[-1][1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link('face', bm, ROCK)
    ob.data.materials.append(ROCK2)
    return smooth(ob)


def slab(name, y_top, thick, x0, x1, z_back, z_front, mat, rough=0.012, seed=0.0, n=28):
    """A rounded, irregular ledge slab (top at y_top) that sticks out of the face."""
    bm = bmesh.new()
    pts = []
    cx, cz = (x0 + x1) / 2, (z_back + z_front) / 2
    rx, rz = (x1 - x0) / 2, (z_front - z_back) / 2
    for i in range(n):
        a = 2 * math.pi * i / n
        k = 1 + 0.08 * fbm(math.cos(a) * 2 + seed, math.sin(a) * 2, seed, 2)
        x = cx + math.cos(a) * rx * k
        z = cz + math.sin(a) * rz * k
        z = max(z, z_back)
        pts.append((x, z))
    top = [bm.verts.new(P(x, y_top + rough * fbm(x * 9, z * 9, seed, 2), z)) for x, z in pts]
    bot = [bm.verts.new(P(x * 0.92 + cx * 0.08, y_top - thick, z * 0.85 + z_back * 0.15)) for x, z in pts]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_length() > 0.05], cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return smooth(link(name, bm, mat))


def snow_cap(name, y, x0, x1, z0, z1, h=0.022, seed=1.0, n=26):
    """A soft pillow of snow lying on a ledge."""
    bm = bmesh.new()
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    rx, rz = (x1 - x0) / 2, (z1 - z0) / 2
    rings = []
    for r_i, (s, hh) in enumerate(((1.0, 0.0), (0.92, 0.55), (0.7, 0.9), (0.35, 1.0))):
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            k = 1 + 0.07 * fbm(math.cos(a) * 3 + seed, math.sin(a) * 3, seed, 2)
            ring.append(bm.verts.new(P(cx + math.cos(a) * rx * k * s, y + h * hh * (1 + 0.25 * fbm(math.cos(a) * 5, seed, s * 4, 2)), cz + math.sin(a) * rz * k * s)))
        rings.append(ring)
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i]))
    bm.faces.new(rings[-1])
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, SNOW))


def lathe_rock(name, rings_def, mat, segs=22, seed=0.0):
    """A rocky cone from [(y, rx, rz, cz)] rings with noise on the radius."""
    bm = bmesh.new()
    rings = []
    for y, rx, rz, cz in rings_def:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            k = 1 + 0.16 * fbm(math.cos(a) * 1.7 + seed, y * 3.0, math.sin(a) * 1.7, 3)
            ring.append(bm.verts.new(P(math.cos(a) * rx * k, y, cz + math.sin(a) * rz * k)))
        rings.append(ring)
    for r in range(len(rings) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, mat))


wall_parts = [build_face()]
# Start ledge (the climber starts standing here) and the summit plateau.
wall_parts.append(slab('start', 0.0, 0.07, -0.3, 0.3, -0.06, 0.13, ROCK, seed=2.0))
wall_parts.append(snow_cap('startSnow', 0.004, -0.27, 0.26, -0.03, 0.115, h=0.018, seed=4.0))
wall_parts.append(slab('plateau', TOP + 0.02, 0.1, -0.47, 0.47, -0.42, 0.13, ROCK, seed=5.0, n=36))
wall_parts.append(snow_cap('plateauSnow', TOP + 0.024, -0.45, 0.45, -0.4, 0.12, h=0.026, seed=6.0, n=34))
# Small snow cushions on some ledges between the sections.
for k in range(1, SECTIONS):
    for s in (-1, 1):
        x = s * (0.2 + 0.08 * random.random())
        hw = half_width(k * STEP)
        z = face_z(x, k * STEP, hw)
        wall_parts.append(snow_cap('ledgeSnow', k * STEP + 0.006, x - 0.07, x + 0.07, z - 0.01, z + 0.03, h=0.01, seed=k * 3.0 + s, n=14))
# Bolts with hangers: one per section, alternating left and right (the app clips the rope here).
for k in range(SECTIONS):
    x = 0.14 if k % 2 == 0 else -0.14
    y = k * STEP + 0.13
    z = face_z(x, y, half_width(y))
    wall_parts.append(tcyl('bolt', (x, y, z + 0.004), 0.009, 0.012, METAL, axis='z', segs=12))
    wall_parts.append(ttorus('hanger', (x, y - 0.012, z + 0.012), 0.012, 0.0035, METAL, axis='z', segs=16, tsegs=6))
wall = merge(wall_parts, 'SummitWall')

peak = lathe_rock('SummitPeak', [(TOP - 0.05, 0.5, 0.32, -0.3), (TOP + 0.12, 0.42, 0.26, -0.32), (TOP + 0.3, 0.27, 0.18, -0.33),
                                 (TOP + 0.46, 0.13, 0.1, -0.33), (TOP + 0.56, 0.02, 0.02, -0.33)], ROCK2, seed=3.0)
peak_snow = lathe_rock('peakSnow', [(TOP + 0.35, 0.245, 0.17, -0.33), (TOP + 0.47, 0.145, 0.115, -0.33), (TOP + 0.58, 0.015, 0.015, -0.33)], SNOW, seed=3.0)
peak = merge([peak, peak_snow], 'SummitPeak')

# ---------- climbing holds ----------

holds = []
# 0 jug: a chunky handle with a lip to grab behind.
h = [blob('jug', (0, 0, 0.018), 0.036, HOLD, s=(1.15, 0.85, 0.62), segs=20, rings=12),
     ttorus('lip', (0, 0.012, 0.032), 0.026, 0.011, HOLD, axis='y', segs=20, tsegs=8, arc=math.pi)]
holds.append(h)
# 1 crimp: a flat edge.
holds.append([tbox('crimp', (0, 0, 0.014), (0.075, 0.03, 0.028), HOLD, bev=0.009, segs=3)])
# 2 sloper: a smooth dome.
holds.append([blob('sloper', (0, 0, 0.0), 0.04, HOLD, s=(1.1, 0.95, 0.62), segs=22, rings=12)])
# 3 pinch: an upright rib.
holds.append([blob('pinch', (0, 0, 0.012), 0.034, HOLD, s=(0.6, 1.5, 0.75), segs=18, rings=12)])
hold_obs = []
for i, parts in enumerate(holds):
    parts.append(tcyl('screw', (0, 0, 0.042 if i != 1 else 0.03), 0.008, 0.006, HBOLT, axis='z', segs=12))
    hold_obs.append(merge(parts, f'SummitHold{i}'))

# ---------- quickdraw ----------

def carabiner(name, c, h, w, r, mat):
    """An oval carabiner standing in the wall plane (three.js), centered at c."""
    bm = bmesh.new()
    rings = []
    N, T = 28, 8
    for i in range(N):
        a = 2 * math.pi * i / N
        cx = math.sin(a) * w / 2
        cy = math.cos(a) * h / 2
        tang = Vector((math.cos(a) * w / 2, -math.sin(a) * h / 2, 0)).normalized()
        nrm = Vector((cx, cy, 0)).normalized()
        ring = []
        for j in range(T):
            b = 2 * math.pi * j / T
            off = nrm * math.cos(b) * r + Vector((0, 0, 1)) * math.sin(b) * r
            ring.append(bm.verts.new(P(c[0] + cx + off.x, c[1] + cy + off.y, c[2] + off.z)))
        rings.append(ring)
    for i in range(N):
        for j in range(T):
            bm.faces.new((rings[i][j], rings[(i + 1) % N][j], rings[(i + 1) % N][(j + 1) % T], rings[i][(j + 1) % T]))
    return smooth(link(name, bm, mat))


qd = [carabiner('top', (0, -0.012, 0.006), 0.026, 0.016, 0.0022, METAL),
      tbox('sling', (0, -0.038, 0.006), (0.011, 0.03, 0.004), SLING, bev=0.0015),
      carabiner('low', (0, -0.064, 0.006), 0.028, 0.017, 0.0024, METAL)]
quickdraw = merge(qd, 'SummitQuickdraw')

# ---------- flag and cross ----------

flag_parts = [tcyl('pole', (0, 0.2, 0), 0.0055, 0.4, POLE, segs=12), blob('ball', (0, 0.405, 0), 0.011, GOLD, segs=12, rings=8),
              tcyl('foot', (0, 0.008, 0), 0.02, 0.016, POLE, segs=14)]
flag = merge(flag_parts, 'SummitFlag')
bm = bmesh.new()
res = bmesh.ops.create_grid(bm, x_segments=14, y_segments=8, size=0.5, calc_uvs=True)
# Grid in Blender XY (-0.5..0.5); turn it into a cloth hanging from the pole top (three.js x, y).
for v in bm.verts:
    x, y = v.co.x + 0.5, v.co.y + 0.5
    v.co = P(0.006 + x * 0.17, 0.39 - (1 - y) * 0.11, 0)
cloth = link('SummitFlagCloth', bm, CLOTH)
cloth.parent = flag
for p in cloth.data.polygons:
    p.use_smooth = True

cross_parts = [tbox('beamV', (0, 0.2, 0), (0.026, 0.4, 0.022), WOOD, bev=0.003),
               tbox('beamH', (0, 0.29, 0.0), (0.21, 0.024, 0.022), WOOD, bev=0.003),
               tbox('roof', (0, 0.405, 0), (0.06, 0.008, 0.04), WOOD, bev=0.002),
               tbox('book', (0, 0.13, 0.017), (0.05, 0.06, 0.016), METAL, bev=0.003),
               tcyl('base', (0, 0.01, 0), 0.03, 0.02, METAL, segs=16)]
# Sunburst of golden rays where the beams cross.
for i in range(16):
    a = 2 * math.pi * i / 16
    L = 0.05 if i % 2 == 0 else 0.034
    cx, cy = math.cos(a) * L / 2, 0.29 + math.sin(a) * L / 2
    ray = tbox('ray', (cx, cy, 0.013), (L, 0.004, 0.003), GOLD)
    # Turn the ray about its own center in the picture plane so it points outwards.
    c = P(cx, cy, 0.013)
    ray.data.transform(Matrix.Translation(c) @ Matrix.Rotation(-a, 4, 'Y') @ Matrix.Translation(-c))
    cross_parts.append(ray)
cross_parts.append(ttorus('ring', (0, 0.29, 0.014), 0.022, 0.004, GOLD, axis='z', segs=24, tsegs=6))
cross = merge(cross_parts, 'SummitCross')

# ---------- backdrop peaks ----------

def peak_mesh(name, seed, sides=11, rings=7):
    bm = bmesh.new()
    rnd = random.Random(seed)
    lev = []
    for r in range(rings):
        t = r / (rings - 1)
        y = t
        rad = 0.55 * (1 - t) ** 1.15 + 0.004
        ring = []
        for i in range(sides):
            a = 2 * math.pi * i / sides + (0.25 if r % 2 else 0)
            k = 1 + 0.35 * fbm(math.cos(a) * 1.3 + seed, t * 2.5, math.sin(a) * 1.3, 2) + (0.12 * rnd.random())
            off = 0.08 * (1 - t) * math.sin(a * 2 + seed)
            ring.append(bm.verts.new(P(math.cos(a) * rad * k + off, y, math.sin(a) * rad * k * 0.8)))
        lev.append(ring)
    tip = bm.verts.new(P(0.02 * math.sin(seed), 1.0, 0))
    for r in range(rings - 1):
        for i in range(sides):
            j = (i + 1) % sides
            f = bm.faces.new((lev[r][i], lev[r][j], lev[r + 1][j], lev[r + 1][i]))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((lev[-1][i], lev[-1][j], tip))
    bm.faces.new(list(reversed(lev[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    ob = link(name, bm, PROCK)
    ob.data.materials.append(PSNOW)
    # Snow above a wavy line and on the faces that look up.
    for p in ob.data.polygons:
        c = p.center
        up = p.normal.z
        line = 0.5 + 0.08 * math.sin(c.x * 9 + seed) + 0.05 * math.sin(c.y * 13)
        if c.z > line or (c.z > line - 0.22 and up > 0.55):
            p.material_index = 1
        p.use_smooth = False
    return ob


peaks = [peak_mesh(f'SummitPeak{c}', s) for c, s in (('A', 1.3), ('B', 4.1), ('C', 7.7))]

# ---------- Echo's harness (Echo's own Blender space: unit E, front -Y, Z up) ----------

HWEB = material('SummitHarnessWeb', (0.95, 0.45, 0.1), 0.0, 0.6)
HMET = material('SummitHarnessMetal', (0.8, 0.82, 0.9), 0.9, 0.25)
HBAG = material('SummitHarnessBag', (0.2, 0.5, 0.9), 0.0, 0.7)
DEPTH = 0.84


def shape_k(z):
    return 1 + 0.1 * max(0.0, -z / 0.5) - 0.04 * max(0.0, z / 0.5)


def body_r(z_actual):
    zn = z_actual / 0.95 if z_actual < 0 else z_actual
    return math.sqrt(max(0.0, 0.25 - zn * zn)) * shape_k(zn)


def band(name, pts, width, thick, mat, closed=True):
    """A flat strap through points (Blender space), its width along +Z-ish, facing outwards."""
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        nxt = pts[(i + 1) % n] if closed else pts[min(i + 1, n - 1)]
        prv = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        t = (nxt - prv).normalized()
        out = Vector((p.x, p.y / (DEPTH * DEPTH), 0)).normalized()
        up = t.cross(out).normalized()
        if up.z < 0:
            up = -up
        out = up.cross(t).normalized()
        if out.dot(Vector((p.x, p.y, 0))) < 0:
            out = -out
        rings.append([bm.verts.new(p + up * w + out * d) for w, d in ((-width / 2, 0), (width / 2, 0), (width / 2, thick), (-width / 2, thick))])
    m = n if closed else n - 1
    for i in range(m):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, mat))


hp = []
ZB = -0.2
rb = body_r(ZB) + 0.008
belt = [Vector((math.sin(a) * rb * 1.0, -math.cos(a) * rb * DEPTH, ZB)) for a in [2 * math.pi * i / 48 for i in range(48)]]
hp.append(band('belt', belt, 0.085, 0.022, HWEB))
# Front buckle.
y_front = -rb * DEPTH - 0.02
bk = bmesh.new()
bmesh.ops.create_cube(bk, size=1.0)
bmesh.ops.scale(bk, vec=Vector((0.1, 0.02, 0.07)), verts=bk.verts)
bmesh.ops.translate(bk, vec=Vector((0, y_front, ZB)), verts=bk.verts)
hp.append(link('buckle', bk, HMET))
# Belay loop down the front and two leg straps to between the feet.
zs = [ZB - 0.03 - 0.03 * i for i in range(7)]
loop_pts = [Vector((0, -(body_r(z) + 0.012) * DEPTH, z)) for z in zs]
hp.append(band('belay', loop_pts, 0.05, 0.018, HWEB, closed=False))
for s in (-1, 1):
    pts = []
    for i in range(9):
        t = i / 8
        z = ZB - 0.02 - t * 0.24
        x = s * (0.12 + 0.12 * t)
        r = body_r(z) + 0.01
        x = max(-r * 0.95, min(r * 0.95, x))
        y = -math.sqrt(max(0.0, r * r - x * x)) * DEPTH
        pts.append(Vector((x, y, z)))
    hp.append(band('leg', pts, 0.045, 0.016, HWEB, closed=False))
# Locking carabiner on the belay loop (the rope's tie-in point).
TIE = Vector((0, -(body_r(-0.33) + 0.05) * DEPTH, -0.36))
bm = bmesh.new()
N, T = 26, 8
rings = []
for i in range(N):
    a = 2 * math.pi * i / N
    cx = math.sin(a) * 0.045
    cz = math.cos(a) * 0.07
    nrm = Vector((cx, 0, cz)).normalized()
    ring = [bm.verts.new(TIE + Vector((cx, 0, cz)) + nrm * math.cos(2 * math.pi * j / T) * 0.011 + Vector((0, 1, 0)) * math.sin(2 * math.pi * j / T) * 0.011) for j in range(T)]
    rings.append(ring)
for i in range(N):
    for j in range(T):
        bm.faces.new((rings[i][j], rings[(i + 1) % N][j], rings[(i + 1) % N][(j + 1) % T], rings[i][(j + 1) % T]))
hp.append(smooth(link('biner', bm, HMET)))
gate = bmesh.new()
bmesh.ops.create_cone(gate, cap_ends=True, segments=12, radius1=0.02, radius2=0.02, depth=0.04)
bmesh.ops.translate(gate, vec=TIE + Vector((0.045, 0, 0.0)), verts=gate.verts)
hp.append(smooth(link('gate', gate, HMET)))
# Chalk bag at the back with a soft rim.
cb = bmesh.new()
bmesh.ops.create_cone(cb, cap_ends=True, segments=20, radius1=0.075, radius2=0.085, depth=0.13)
bmesh.ops.translate(cb, vec=Vector((0, (body_r(-0.2) + 0.06) * DEPTH, -0.2)), verts=cb.verts)
hp.append(smooth(link('bag', cb, HBAG)))
rim = bmesh.new()
bmesh.ops.create_cone(rim, cap_ends=False, segments=20, radius1=0.092, radius2=0.092, depth=0.025)
bmesh.ops.translate(rim, vec=Vector((0, (body_r(-0.2) + 0.06) * DEPTH, -0.13)), verts=rim.verts)
hp.append(smooth(link('rim', rim, HWEB)))
# Gear loops on the hips with a tiny quickdraw each.
for s in (-1, 1):
    gx = s * (rb + 0.01)
    gl = bmesh.new()
    bmesh.ops.create_cone(gl, cap_ends=True, segments=10, radius1=0.012, radius2=0.012, depth=0.09)
    bmesh.ops.rotate(gl, verts=gl.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(gl, vec=Vector((gx, -0.05, ZB - 0.07)), verts=gl.verts)
    hp.append(smooth(link('gear', gl, HMET)))
harness = merge(hp, 'SummitHarness')
tie = bpy.data.objects.new('HarnessTieIn', None)
tie.location = TIE + Vector((0, -0.01, -0.07))
bpy.context.scene.collection.objects.link(tie)
tie.parent = harness

# ---------- the customer (summit-customer.glb) ----------

# The customers: six stylized characters (toy-like proportions, about 3 heads tall, height 1, feet
# at y = 0, facing +z). Every one is a root empty Cust_<key> with the nodes <key>_Body,
# <key>_Head (pivot at the neck) with <key>_LidL/R (eyelids, scaled by the app to blink),
# <key>_BrowL/R and the mouths <key>_MouthNeutral/Smile/Open/Skeptic/Talk (one shown at a time),
# <key>_ArmL/R (pivot at the shoulder; R is the figure's right hand, at -x) with <key>_ForeL/R
# (pivot at the elbow, forearm and hand with fingers). Materials Cust* are recolored per customer.
SUIT = material('CustSuit', (0.12, 0.18, 0.35), 0.0, 0.6)
TRIM = material('CustTrim', (0.08, 0.12, 0.25), 0.0, 0.6)
SHIRT = material('CustShirt', (0.95, 0.95, 0.97), 0.0, 0.55)
SKIN = material('CustSkin', (0.95, 0.75, 0.62), 0.0, 0.5)
HAIR = material('CustHair', (0.25, 0.15, 0.08), 0.0, 0.55)
PANTS = material('CustPants', (0.1, 0.1, 0.14), 0.0, 0.65)
SHOE = material('CustShoe', (0.05, 0.04, 0.04), 0.1, 0.3)
EYE = material('CustEye', (0.03, 0.03, 0.05), 0.0, 0.1)
IRIS = material('CustIris', (0.3, 0.2, 0.1), 0.0, 0.2)
WHITE = material('CustWhite', (0.97, 0.97, 0.98), 0.0, 0.3)
SHINE = material('CustShine', (1, 1, 1), 0.0, 0.2)
MOUTH = material('CustMouth', (0.35, 0.08, 0.1), 0.0, 0.5)
LIPS = material('CustLips', (0.75, 0.3, 0.35), 0.0, 0.45)
TONGUE = material('CustTongue', (0.9, 0.45, 0.45), 0.0, 0.5)
CHEEK = material('CustCheek', (0.95, 0.5, 0.5), 0.0, 0.6)
LINE = material('CustLine', (0.7, 0.45, 0.35), 0.0, 0.6)
ACC = material('CustAccent', (0.3, 0.7, 0.6), 0.0, 0.6)
GLASS = material('CustGlass', (0.08, 0.08, 0.1), 0.6, 0.3)
GOLD = material('CustGold', (1.0, 0.75, 0.3), 1.0, 0.25)


def pivot(ob, p):
    """Moves the object's origin to the three.js point p (keeps the mesh in place)."""
    v = P(*p)
    ob.data.transform(Matrix.Translation(-v))
    ob.location = v
    return ob


def tube(name, pts, r, mat, sides=14):
    bm = bmesh.new()
    pts = [Vector(P(*p)) for p in pts]
    radii = r if isinstance(r, (list, tuple)) else [r] * len(pts)
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.orthogonal().normalized()
        b = t.cross(a).normalized()
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * radii[i]) for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, mat))


def lathe(name, prof, mat, segs=32, sz=1.0):
    """Surface of revolution around three.js y from [(radius, y)], squashed in depth by sz."""
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        rings.append([bm.verts.new(P(math.sin(2 * math.pi * i / segs) * r, y, math.cos(2 * math.pi * i / segs) * r * sz)) for i in range(segs)])
    for k in range(len(rings) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, mat))


def cut_shell(name, c, r, s, keep, mat, segs=32, rings=20, thick=0.012):
    """An ellipsoid shell (hair) keeping the faces where keep(x, y, z) is true (three.js, relative)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=Vector((s[0], s[2], s[1])), verts=bm.verts)
    kill = []
    for f in bm.faces:
        m = f.calc_center_median()
        x, y, z = m.x, m.z, -m.y
        if not keep(x, y, z):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thick)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    return smooth(link(name, bm, mat))


#@@CUSTOMERS@@

# ---------- coin picture (no export) ----------

def lin(hexs):
    """sRGB hex -> linear RGB (the coin uses the token colors of css/game-summit.css)."""
    h = hexs.lstrip('#')
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


def set_color(mat, hexs, rough=None, emit=0.0, metal=None):
    b = mat.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(hexs), 1)
    if rough is not None:
        b.inputs['Roughness'].default_value = rough
    if metal is not None:
        b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*lin(hexs), 1)
        b.inputs['Emission Strength'].default_value = emit


def new_mat(name, hexs, rough=0.5, emit=0.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    set_color(m, hexs, rough, emit, metal)
    return m


def surface_at(x, y):
    """Front of the wall at three.js (x, y): Blender ray cast on the wall object."""
    hit, loc, nrm, idx = wall.ray_cast(P(x, y, 1.0), P(0, 0, -1) - P(0, 0, 0))
    return -loc.y if hit else 0.0


def render_coin(out, size, samples):
    """The coin picture: Echo climbing the wall below the festive summit, where the customer waits."""
    sc = bpy.context.scene
    # Token colors (css/game-summit.css and tokens.css).
    set_color(ROCK, '#8d8aa8', 0.9)
    set_color(ROCK2, '#73709a', 0.9)
    set_color(SNOW, '#f4f8ff', 0.7)
    set_color(METAL, '#c9d2e3', 0.3, metal=0.9)
    set_color(SLING, '#5ad8ff', 0.6)
    set_color(POLE, '#c9d2e3', 0.3)
    set_color(GOLD, '#ffc65c', 0.25, emit=0.6)
    set_color(WOOD, '#8a5a3b', 0.7)
    set_color(PROCK, '#5d5f8e', 0.95)
    set_color(PSNOW, '#eef2ff', 0.75)
    set_color(HWEB, '#ff9a4a', 0.6)
    set_color(HBAG, '#7c5cff', 0.7)
    set_color(SUIT, '#26386a', 0.65)
    set_color(SHIRT, '#f4f5f8', 0.6)
    set_color(SKIN, '#f2c7a8', 0.5)
    set_color(HAIR, '#6b4027', 0.55)
    set_color(PANTS, '#1f2436', 0.7)
    set_color(ACC, '#2fa59a', 0.6)
    # Flag: violet with a cyan corner.
    cm = CLOTH.node_tree
    bsdf = cm.nodes['Principled BSDF']
    uvn = cm.nodes.new('ShaderNodeTexCoord')
    sep = cm.nodes.new('ShaderNodeSeparateXYZ')
    add = cm.nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    gt = cm.nodes.new('ShaderNodeMath')
    gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 1.15
    mix = cm.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = (*lin('#7c5cff'), 1)
    mix.inputs[7].default_value = (*lin('#5ad8ff'), 1)
    cm.links.new(uvn.outputs['UV'], sep.inputs[0])
    cm.links.new(sep.outputs[0], add.inputs[0])
    cm.links.new(sep.outputs[1], add.inputs[1])
    cm.links.new(add.outputs[0], gt.inputs[0])
    cm.links.new(gt.outputs[0], mix.inputs[0])
    cm.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    # The customer on the summit (bun and glasses), waving.
    for o in (hair_short, hair_curly, hair_long, beard, tie_ob, scarf, apron):
        o.hide_render = True
    customer.location = P(0.17, PLATEAU_TOP, 0.04)
    customer.scale = (0.36, 0.36, 0.36)
    customer.rotation_euler = (0, 0, 0.35)
    arms[1].rotation_euler = (0, -2.4, 0)
    # Summit cross with fairy lights, the flag raised.
    cross.location = P(-0.22, PLATEAU_TOP - 0.01, -0.04)
    cross.scale = (0.9, 0.9, 0.9)
    flag.location = P(0.38, PLATEAU_TOP - 0.01, -0.08)
    bulbs = ['#ff2d3f', '#ffd27a', '#8fe36f', '#5ad8ff', '#e57ad9']
    bmats = [new_mat(f'bulb{i}', c, 0.3, emit=6.0) for i, c in enumerate(bulbs)]
    pts = [(0.017 if i % 2 else -0.017, 0.03 + (i / 11) * 0.36, 0.016) for i in range(12)] + [(-0.1 + (i / 7) * 0.2, 0.29 + (0.016 if i % 2 else -0.016), 0.016) for i in range(8)]
    for i, (x, y, z) in enumerate(pts):
        blob('bulb', (-0.22 + 0.9 * x, PLATEAU_TOP - 0.01 + 0.9 * y, -0.04 + 0.9 * z), 0.007, bmats[i % 5], segs=8, rings=6)
    # Colored holds along the route and the quickdraws.
    hold_cols = ['#5ad8ff', '#e57ad9', '#ffc65c', '#2fcf8a', '#7f8fd6', '#c07fbf', '#6fb3a6', '#d8a46a']
    rnd = random.Random(11)
    spots = [(-0.3, 0.12), (0.22, 0.2), (-0.05, 0.33), (0.3, 0.42), (-0.25, 0.5), (0.08, 0.6), (-0.33, 0.72), (0.27, 0.78), (-0.12, 0.86), (0.2, 0.98), (-0.3, 1.0), (0.36, 0.62), (-0.42, 0.3), (0.42, 0.25), (0.0, 0.07)]
    for i, (x, y) in enumerate(spots):
        src = hold_obs[i % 4]
        h = src.copy()
        h.data = src.data.copy()
        sc.collection.objects.link(h)
        m = new_mat(f'hold{i}', hold_cols[i % len(hold_cols)], 0.5)
        h.data.materials[0] = m
        h.location = P(x, y, surface_at(x, y) - 0.004)
        h.rotation_euler = (0, rnd.uniform(-1, 1), 0)
        s_ = rnd.uniform(1.0, 1.4)
        h.scale = (s_, s_, s_)
    for k, b in enumerate(BOLTS_C):
        q = quickdraw.copy()
        sc.collection.objects.link(q)
        q.location = P(b[0], b[1] - 0.012, surface_at(b[0], b[1]) + 0.012)
    # Echo (the app's mascot model) with its Santa hat and the harness, hanging below the summit.
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'models')
    rig = bpy.data.objects.new('EchoRig', None)
    sc.collection.objects.link(rig)
    for f in ('echo.glb', 'santa-hat.glb'):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(root, f))
        for o in set(bpy.data.objects) - before:
            if o.parent is None:
                o.parent = rig
    echo_cols = {'EchoDeep': '#1e1b4b', 'EchoLight': '#a78bfa', 'EchoLid': '#7c3aed', 'EchoIris': '#3b2f8f', 'EchoWhite': '#ffffff', 'EchoBone': '#8b5cf6', 'HatRed': '#ff2d3f', 'HatFur': '#f5f7fc'}
    for m in bpy.data.materials:
        if m.name in echo_cols and m.use_nodes:
            set_color(m, echo_cols[m.name], 0.35)
        if m.name == 'EchoCyan' and m.use_nodes:
            set_color(m, '#06b6d4', 0.3, emit=3.0)
        if m.name == 'EchoBody' and m.use_nodes:
            nt = m.node_tree
            bs = nt.nodes['Principled BSDF']
            tc = nt.nodes.new('ShaderNodeTexCoord')
            sp = nt.nodes.new('ShaderNodeSeparateXYZ')
            sub = nt.nodes.new('ShaderNodeMath')
            sub.operation = 'SUBTRACT'
            mr = nt.nodes.new('ShaderNodeMapRange')
            mr.inputs['From Min'].default_value = -0.6
            mr.inputs['From Max'].default_value = 0.6
            cr = nt.nodes.new('ShaderNodeValToRGB')
            cr.color_ramp.elements[0].color = (*lin('#7c3aed'), 1)
            cr.color_ramp.elements[1].color = (*lin('#06b6d4'), 1)
            nt.links.new(tc.outputs['Object'], sp.inputs[0])
            nt.links.new(sp.outputs[0], sub.inputs[0])
            nt.links.new(sp.outputs[2], sub.inputs[1])
            nt.links.new(sub.outputs[0], mr.inputs['Value'])
            nt.links.new(mr.outputs['Result'], cr.inputs['Fac'])
            nt.links.new(cr.outputs['Color'], bs.inputs['Base Color'])
            bs.inputs['Roughness'].default_value = 0.4
    for o in rig.children_recursive:
        if o.name.startswith(('Lid', 'MouthOpen', 'Logo')):
            o.hide_render = True
        if o.name in ('WingL', 'WingR'):
            o.rotation_mode = 'XYZ'
            o.rotation_euler.y += 1.05 if o.name == 'WingL' else -1.05
    hz = harness.copy()
    sc.collection.objects.link(hz)
    hz.parent = rig
    E = 0.23
    rig.scale = (E, E, E)
    rig.location = P(0.03, 0.88, surface_at(0.03, 0.88) + 0.13)
    rig.rotation_euler = (0, 0, 0.3)
    # The hold Echo hangs on.
    top = hold_obs[0].copy()
    top.data = hold_obs[0].data.copy()
    top.data.materials[0] = new_mat('holdTop', '#2fcf8a', 0.5)
    sc.collection.objects.link(top)
    top.location = P(0.03, 1.03, surface_at(0.03, 1.03) - 0.004)
    top.scale = (1.4, 1.4, 1.4)
    # The rope from the harness down through the quickdraws.
    cu = bpy.data.curves.new('rope', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0065
    sp_ = cu.splines.new('BEZIER')
    rp = [(0.03, 0.79, surface_at(0.03, 0.79) + 0.2), (BOLTS_C[3][0], BOLTS_C[3][1] - 0.076, surface_at(BOLTS_C[3][0], BOLTS_C[3][1]) + 0.02),
          (BOLTS_C[2][0], BOLTS_C[2][1] - 0.076, surface_at(BOLTS_C[2][0], BOLTS_C[2][1]) + 0.02), (BOLTS_C[1][0], BOLTS_C[1][1] - 0.076, surface_at(BOLTS_C[1][0], BOLTS_C[1][1]) + 0.02),
          (0.05, -0.3, 0.2)]
    sp_.bezier_points.add(len(rp) - 1)
    for bp, pt in zip(sp_.bezier_points, rp):
        bp.co = P(*pt)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    rope = bpy.data.objects.new('rope', cu)
    sc.collection.objects.link(rope)
    rope.data.materials.append(new_mat('ropeMat', '#ff6a3d', 0.6))
    # Backdrop: snowy peaks, a sea of clouds, stars.
    for (pk, x, z, h_, ry) in ((peaks[0], -1.15, -1.3, 1.6, 0.5), (peaks[1], 1.25, -1.7, 1.9, -0.3), (peaks[2], -0.3, -3.0, 2.6, 1.0), (peaks[0], 2.2, -3.3, 2.3, 2.0), (peaks[2], -2.3, -2.8, 2.1, 0.2)):
        c = pk.copy()
        sc.collection.objects.link(c)
        c.location = P(x, -0.45, z)
        c.scale = (h_ * 0.9, h_ * 0.9, h_)
        c.rotation_euler = (0, 0, ry)
    for o in peaks:
        o.hide_render = True
    cloud = new_mat('cloud', '#f1f2ff', 1.0)
    cb = cloud.node_tree.nodes['Principled BSDF']
    cb.inputs['Emission Color'].default_value = (*lin('#c9c6f2'), 1)
    cb.inputs['Emission Strength'].default_value = 0.35
    for i in range(46):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.45, 3.0)
        x, z = math.cos(a) * r, math.sin(a) * r - 0.6
        if z > 0.9:
            continue
        blob('cloud', (x, rnd.uniform(-0.12, 0.05), z), rnd.uniform(0.18, 0.42), cloud, s=(1.6, 0.55, 1.1), segs=18, rings=10)
    star = new_mat('star', '#ffffff', 0.5, emit=8.0)
    for i in range(40):
        x = rnd.uniform(-4.5, 4.5)
        y = rnd.uniform(1.6, 5.0)
        blob('star', (x, y, -6.0), rnd.uniform(0.008, 0.02), star, segs=6, rings=4)
    # Sky: deep blue at the top, a rose glow at the horizon.
    w = bpy.data.worlds.new('sky')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -0.05
    mr.inputs['From Max'].default_value = 0.7
    cr = nt.nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].color = (*lin('#e79a9c'), 1)
    cr.color_ramp.elements[1].color = (*lin('#121640'), 1)
    e = cr.color_ramp.elements.new(0.3)
    e.color = (*lin('#33367e'), 1)
    nt.links.new(tc.outputs['Generated'], sp.inputs[0])
    nt.links.new(sp.outputs[2], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], cr.inputs['Fac'])
    nt.links.new(cr.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.color = lin('#ffb27a')
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(40))
    sc.collection.objects.link(sun)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'AREA'))
    fill.data.energy = 60
    fill.data.size = 3
    fill.data.color = lin('#8fa3ff')
    fill.location = P(-1.8, 1.6, 1.8)
    fill.rotation_euler = (P(0, 1, 0) - fill.location).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(fill)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 44
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = P(0.6, 0.72, 2.4)
    cam.rotation_euler = (P(0.02, 0.99, 0.0) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    # A warm moon behind the summit and the Christmas tree on the plateau.
    blob('moon', (-4.5, 5.0, -8.0), 0.6, new_mat('moon', '#ffd27a', 0.5, emit=4.0), segs=24, rings=14)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(root, 'xmas.glb'))
    for o in set(bpy.data.objects) - before:
        if o.name.startswith('XmasTree') and o.parent is None:
            o.scale = (0.14, 0.14, 0.14)
            o.location = P(-0.4, PLATEAU_TOP - 0.01, -0.07)
        elif o.parent is None:
            o.hide_render = True
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


PLATEAU_TOP = TOP + 0.045
BOLTS_C = [(0.14 if k % 2 == 0 else -0.14, k * STEP + 0.13) for k in range(SECTIONS)]
if COIN:
    render_coin(COIN, int(ARGS[2]) if len(ARGS) > 2 else 512, int(ARGS[3]) if len(ARGS) > 3 else 64)
    sys.exit(0)

# ---------- ambient occlusion, export ----------

ASSETS = [(wall, 0.06), (peak, 0.06), *[(h, 0.02) for h in hold_obs], (quickdraw, 0.02), (flag, 0.05), (cross, 0.04),
          *[(p, 0.2) for p in peaks], (harness, 0.05), *[(m, 0.04) for m in cust_meshes]]
bake_ao(ASSETS, {'SummitGold', 'CustEyeLight'}, distance=0.12, samples=32)
print('wall faces', len(wall.data.polygons))

bpy.context.preferences.filepaths.save_version = 0


def export_sel(path, roots):
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots:
        r.select_set(True)
        for c in r.children_recursive:
            c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_animations=False, export_normals=True,
                              export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True)


export_sel(OUT_GLB, [wall, peak, *hold_obs, quickdraw, flag, cross, *peaks, harness])
export_sel(OUT_CUST, [customer])
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    sc.cycles.samples = 16
    sc.render.resolution_x = sc.render.resolution_y = 480
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.38, 0.55, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    light = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    light.data.energy = 3
    light.rotation_euler = (0.9, 0.2, 0.6)
    sc.collection.objects.link(light)
    # Show the hold shapes and the customer next to the wall.
    for i, h in enumerate(hold_obs):
        h.location = P(-0.3 + i * 0.2, 0.3, 0.05)
    customer.location = P(0.15, TOP + 0.03, 0.0)
    customer.scale = (0.24, 0.24, 0.24)
    flag.location = P(0.33, TOP + 0.03, -0.12)
    cross.location = P(-0.2, TOP + 0.03, -0.1)
    for tag, pos, tgt in (('wall', (0.4, 0.2, 3.6), (0, 0.0, 0)), ('top', (0.5, 1.5, 1.2), (0, TOP + 0.1, 0))):
        cam.location = P(*pos)
        cam.rotation_euler = (P(*tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{PREVIEW}/summit-{tag}.png'
        bpy.ops.render.render(write_still=True)
print('DONE')

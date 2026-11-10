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
#     Cust_albers, Cust_demir, Cust_ferri, Cust_wagner, Cust_petrov, Cust_olsen
#                      the six customers (stylized, height 1, origin between the feet, front +z),
#                      each with a body, a head with eyelids, brows and five mouths, and two-part
#                      arms with hands (see the customer section below)
# Materials are named for the design tokens the app tints them with (SummitRock, SummitRockAlt,
# SummitSnow, SummitMetal, SummitHold, SummitHoldBolt, SummitSling, SummitPole, SummitGold,
# SummitFlagCloth, SummitWood, SummitPeakRock, SummitPeakSnow, SummitHarnessWeb, SummitHarnessMetal,
# SummitHarnessBag, Cust*). Ambient occlusion is baked into the vertex colors.
# Usage: blender -b -P build_summit.py -- <summit.glb> <summit.blend> [<preview dir>]
#        (summit-customer.glb is written next to summit.glb)
#        blender -b -P build_summit.py -- --coin <out.png> [<size> <samples>]   the menu coin picture
#        blender -b -P build_summit.py -- --faces <dir>   close-ups of the six customers (front, 3/4)
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix, noise
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, merge, bake_ao, blob, densify

ARGS = sys.argv[sys.argv.index('--') + 1:]
# Coin picture for the menu: blender -b -P build_summit.py -- --coin <out.png> [<size> <samples>]
COIN = ARGS[1] if ARGS and ARGS[0] == '--coin' else None
FACES = ARGS[1] if ARGS and ARGS[0] == '--faces' else None
if not COIN and not FACES:
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


def interp(prof, y):
    """Radius of a (radius, y) lathe profile at height y."""
    for (r0, y0), (r1, y1) in zip(prof, prof[1:]):
        if y0 <= y <= y1 and y1 > y0:
            return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
    return 0.0


def front_z(prof, sz, x, y):
    r = interp(prof, y)
    return sz * math.sqrt(max(0.0, r * r - x * x))


def plate(name, outline, zf, mat, off=0.004, thick=0.006, center=None):
    """A thin plate on a body surface: outline [(x, y)] (three.js), zf(x, y) the surface depth."""
    bm = bmesh.new()
    n = len(outline)
    cx = center[0] if center else sum(p[0] for p in outline) / n
    cy = center[1] if center else sum(p[1] for p in outline) / n
    fr = [bm.verts.new(P(x, y, zf(x, y) + off)) for x, y in outline]
    bk = [bm.verts.new(P(x, y, zf(x, y) + off - thick)) for x, y in outline]
    cf = bm.verts.new(P(cx, cy, zf(cx, cy) + off))
    cb = bm.verts.new(P(cx, cy, zf(cx, cy) + off - thick))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((cf, fr[i], fr[j]))
        bm.faces.new((cb, bk[j], bk[i]))
        bm.faces.new((fr[i], bk[i], bk[j], fr[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, mat))


def strip(name, inner, widths, normal2d, zf, mat, off=0.006, thick=0.005):
    """A band along a line on the body (lapels): inner [(x, y)], widths per point, outward normal(i)."""
    bm = bmesh.new()
    rows = []
    for i, ((x, y), w) in enumerate(zip(inner, widths)):
        nx, ny = normal2d(i)
        ox, oy = x + nx * w, y + ny * w
        rows.append([bm.verts.new(P(x, y, zf(x, y) + off)), bm.verts.new(P(ox, oy, zf(ox, oy) + off)),
                     bm.verts.new(P(ox, oy, zf(ox, oy) + off - thick)), bm.verts.new(P(x, y, zf(x, y) + off - thick))])
    for a, b in zip(rows, rows[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, mat))


def curve_tube(name, f, n, r, mat, sides=8):
    """A tube along f(u), u in -1..1 (n points); r a number or a function of u."""
    pts = [f(-1 + 2 * i / (n - 1)) for i in range(n)]
    radii = [r(-1 + 2 * i / (n - 1)) if callable(r) else r for i in range(n)]
    return tube(name, pts, radii, mat, sides=sides)


def fan(name, outline, z, mat, thick=0.004, curve=0.0):
    """A flat shape in front of the face (open mouth, teeth, tongue): outline [(x, y)] at depth z."""
    zf = lambda x, y: z - curve * x * x
    return plate(name, outline, zf, mat, off=0.0, thick=thick)


def ellipse(cx, cy, rx, ry, n=20, a0=0.0, a1=2 * math.pi):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / n), cy + ry * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + (0 if a1 - a0 >= 2 * math.pi - 1e-6 else 1))]


def set_parent(ob, parent):
    """Parents ob to parent, keeping the world position (parents sit at their own origin)."""
    bpy.context.view_layer.update()
    ob.parent = parent
    ob.matrix_parent_inverse = parent.matrix_world.inverted()
    return ob


def node(name, parts, origin, parent=None):
    bpy.context.view_layer.update()
    ob = merge(parts, name)
    pivot(ob, origin)
    if parent:
        set_parent(ob, parent)
    return ob


# Shared proportions (three.js units, height about 1).
HC = (0.0, 0.835, -0.005)  # head center
EYE_Z = 0.118              # eye centers (the eyes bulge a little out of the face)
HR = 0.17                  # head radius
NECK = (0.0, 0.668, 0.0)
EYE_Y = 0.842
EYE_X = 0.062
MOUTH_Y = 0.754
F_TORSO = [(0.0, 0.33), (0.118, 0.335), (0.126, 0.37), (0.118, 0.41), (0.1, 0.46), (0.104, 0.5), (0.118, 0.55), (0.12, 0.585),
           (0.112, 0.615), (0.088, 0.64), (0.05, 0.658), (0.0, 0.662)]
M_TORSO = [(0.0, 0.33), (0.122, 0.335), (0.13, 0.38), (0.128, 0.44), (0.13, 0.5), (0.138, 0.56), (0.136, 0.6), (0.112, 0.64),
           (0.055, 0.66), (0.0, 0.665)]
TSZ = 0.74  # torsos are flatter front to back


def build_head(key, spec):
    """Head parts (merged into <key>_Head) and its moving nodes."""
    fem = spec['f']
    x0, y0, z0 = HC
    hp = [head_mesh(fem),
          blob('nose', (0, 0.803, 0.154 if fem else 0.156), 0.021 if fem else 0.024, SKIN, s=(0.95, 0.85, 0.95), segs=12, rings=8)]
    for sx in (-1, 1):
        ex = sx * EYE_X
        hp.append(blob('ear', (sx * 0.167, 0.818, -0.01), 0.036, SKIN, s=(0.5, 1.0, 0.75), segs=12, rings=8))
        hp.append(blob('earIn', (sx * 0.172, 0.818, 0.0), 0.018, LINE, s=(0.4, 0.9, 0.6), segs=8, rings=5))
        # Big eyes: white, colored iris, pupil and two highlights.
        hp.append(blob('sclera', (ex, EYE_Y, EYE_Z), 0.04, WHITE, s=(0.92, 1.06, 1.0), segs=14, rings=10))
        hp.append(blob('iris', (ex - sx * 0.002, EYE_Y - 0.002, EYE_Z + 0.036), 0.0225, IRIS, s=(0.95, 1.05, 0.3), segs=12, rings=6))
        hp.append(blob('pupil', (ex - sx * 0.002, EYE_Y - 0.002, EYE_Z + 0.0398), 0.0125, EYE, s=(0.95, 1.05, 0.28), segs=10, rings=6))
        hp.append(blob('shine', (ex + 0.009, EYE_Y + 0.011, EYE_Z + 0.0405), 0.0062, SHINE, s=(1, 1, 0.4), segs=8, rings=6))
        hp.append(blob('shine2', (ex - 0.007, EYE_Y - 0.01, EYE_Z + 0.04), 0.0036, SHINE, s=(1, 1, 0.4), segs=6, rings=4))
        hp.append(blob('cheek', (sx * 0.1, 0.784, 0.111), 0.032, CHEEK, s=(1.0, 0.62, 0.3), segs=10, rings=6))
        if spec.get('earrings'):
            hp.append(blob('earring', (sx * 0.17, 0.776, 0.006), 0.0105, GOLD, segs=8, rings=6))
    head = node(f'{key}_Head', hp, NECK)
    # Eyelids: a skin shell over the front of each eye with the lash line on its rim, pivot at
    # the eye center. As built they are closed; the app turns them up about x to open them
    # (about -2.45 rad open, -1.7 half closed).
    for sx, tag in ((1, 'L'), (-1, 'R')):
        ex = sx * EYE_X
        lp = [cut_shell('lid', (ex, EYE_Y, EYE_Z), 0.0448, (1.0, 1.0, 1.0), lambda x, y, z: z > 0.0, SKIN, segs=16, rings=10, thick=0.002)]
        rim = lambda u, ex=ex: (ex + 0.0452 * math.cos(math.pi * (1.5 + 0.42 * u)), EYE_Y + 0.0452 * math.sin(math.pi * (1.5 + 0.42 * u)), EYE_Z + 0.001)
        lp.append(curve_tube('lash', rim, 9, lambda u: (0.0036 if fem else 0.0026) * (1 - 0.45 * abs(u)), EYE, sides=6))
        if fem:
            # A little flick at the outer corner.
            a = math.pi * (1.5 + 0.42 * sx)
            c0 = (ex + 0.0452 * math.cos(a), EYE_Y + 0.0452 * math.sin(a), EYE_Z + 0.001)
            lp.append(tube('flick', [c0, (c0[0] + sx * 0.012, c0[1] - 0.004, c0[2] - 0.004)], [0.0034, 0.0012], EYE, sides=6))
        lid = node(f'{key}_Lid{tag}', lp, (ex, EYE_Y, EYE_Z))
        set_parent(lid, head)
        # Brows: a curved stroke above each eye (pivot at its middle).
        bw = 0.0065 if fem else 0.0095
        brow = curve_tube(f'{key}_Brow{tag}', lambda u, ex=ex, sx=sx: (ex + u * 0.034, EYE_Y + 0.064 + 0.009 * (1 - u * u) - sx * u * 0.003, 0.136 - 0.012 * u * u),
                          9, lambda u: bw * (1 - 0.45 * abs(u)) if not fem else bw * (1 - 0.5 * (u * sx + 1) / 2), HAIR, sides=6)
        pivot(brow, (ex, EYE_Y + 0.068, 0.136))
        set_parent(brow, head)
    # Mouths (one is shown at a time), all around the mouth center.
    mz = 0.147
    lipm = LIPS if fem else MOUTH
    mouths = {
        'Neutral': [curve_tube('m', lambda u: (u * 0.027, MOUTH_Y + 0.003 * u * u, mz - 0.0022 * u * u), 9, lambda u: (0.0055 if fem else 0.0042) * (1 - 0.35 * u * u), lipm)],
        'Smile': [curve_tube('m', lambda u: (u * 0.038, MOUTH_Y + 0.016 * u * u - 0.004, mz - 0.0046 * u * u), 11, lambda u: (0.006 if fem else 0.0048) * (1 - 0.4 * u * u), lipm)],
        'Skeptic': [curve_tube('m', lambda u: (u * 0.028, MOUTH_Y - 0.003 + 0.006 * u + 0.003 * u * u, mz - 0.0024 * u * u), 9, lambda u: (0.0052 if fem else 0.0045) * (1 - 0.3 * u * u), lipm)],
        'Talk': [fan('m', ellipse(0, MOUTH_Y - 0.004, 0.016, 0.014), mz + 0.001, MOUTH, curve=3.0),
                 fan('t', ellipse(0, MOUTH_Y - 0.011, 0.01, 0.0055), mz + 0.0025, TONGUE, curve=3.0)],
        'Open': [fan('m', ellipse(0, MOUTH_Y + 0.006, 0.034, 0.029, n=18, a0=math.pi, a1=2 * math.pi), mz + 0.001, MOUTH, curve=3.0),
                 fan('teeth', [(-0.028, MOUTH_Y + 0.006), (-0.024, MOUTH_Y - 0.003), (0.024, MOUTH_Y - 0.003), (0.028, MOUTH_Y + 0.006)], mz + 0.0025, WHITE, curve=3.0),
                 fan('t', ellipse(0, MOUTH_Y - 0.014, 0.017, 0.0085, n=14), mz + 0.0025, TONGUE, curve=3.0)],
    }
    if fem:
        mouths['Open'].append(curve_tube('lip', lambda u: (u * 0.035, MOUTH_Y + 0.007 - 0.002 * u * u, mz + 0.002 - 0.0045 * u * u), 9, 0.0032, LIPS))
    for name, parts in mouths.items():
        m = node(f'{key}_Mouth{name}', parts, (0, MOUTH_Y, mz))
        set_parent(m, head)
    return head


def head_mesh(fem):
    """One smooth head: a sphere with fuller cheeks and a soft, rounded chin (no seams)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=30, v_segments=20, radius=HR)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.z, -v.co.y  # three.js axes, relative to the center
        t = y / HR
        cheek = math.exp(-((t + 0.38) / 0.32) ** 2)  # widest at the cheeks
        x *= 1 + (0.07 if fem else 0.09) * cheek
        if t < 0:
            y *= 1 + 0.06 * (-t)  # a little longer towards the chin
            if z > 0:
                z *= 1 + 0.08 * cheek
        z *= 0.94
        v.co = Vector(P(HC[0] + x, HC[1] + y, HC[2] + z))
    return smooth(link('skull', bm, SKIN))


def front_skull(x, y, fem=False):
    """Depth of the face surface at x, y (the shape of head_mesh)."""
    dy = y - HC[1]
    t = dy / HR
    cheek = math.exp(-((t + 0.38) / 0.32) ** 2)
    xs = x / (1 + (0.07 if fem else 0.09) * cheek)
    ys = dy / (1 + 0.06 * (-t)) if t < 0 else dy
    r2 = HR * HR - xs * xs - ys * ys
    zz = math.sqrt(max(0.0, r2)) * (1 + 0.08 * cheek if t < 0 else 1)
    return HC[2] + 0.94 * zz


def shell_keep_face(hairline=0.075, side=0.0, nape=-0.1, face_w=0.12):
    """Keep-function for a hair cap: top, sides down to `side`, back down to `nape`, no face."""
    def keep(x, y, z):
        if z > 0.07 and y < hairline and abs(x) < face_w + 0.03:
            return False
        if y > side:
            return True
        return z < -0.04 and y > nape
    return keep


def hair_bun():
    """Katrin: hair pulled back to a high bun (visible from the front), a side parting."""
    x0, y0, z0 = HC
    p = [cut_shell('cap', HC, HR * 1.06, (1.0, 1.0, 0.97), shell_keep_face(0.085, -0.02, -0.11), HAIR, segs=24, rings=14, thick=0.014),
         # The parting at the left: a big swoop over the forehead to the right, a small one to the left.
         blob('swoop', (0.035, y0 + 0.118, 0.095), 0.088, HAIR, s=(1.45, 0.42, 0.72), segs=20, rings=12, rot=Matrix.Rotation(0.22, 3, 'Y')),
         blob('swoopL', (-0.09, y0 + 0.108, 0.07), 0.058, HAIR, s=(1.0, 0.5, 0.9), segs=16, rings=10, rot=Matrix.Rotation(-0.35, 3, 'Y')),
         # Pulled back above the ears.
         blob('sideL', (-0.152, y0 + 0.02, -0.035), 0.05, HAIR, s=(0.62, 0.95, 1.5), segs=14, rings=10),
         blob('sideR', (0.152, y0 + 0.02, -0.035), 0.05, HAIR, s=(0.62, 0.95, 1.5), segs=14, rings=10),
         # The bun on top, a little to the back, with coils and a band.
         blob('bun', (0, y0 + 0.205, -0.055), 0.075, HAIR, s=(1.0, 0.92, 1.0), segs=16, rings=10),
         ttorus('coil1', (0, y0 + 0.2, -0.055), 0.066, 0.012, HAIR, axis='y', segs=22, tsegs=6),
         ttorus('coil2', (0, y0 + 0.235, -0.055), 0.046, 0.011, HAIR, axis='y', segs=18, tsegs=6),
         ttorus('band', (0, y0 + 0.155, -0.05), 0.052, 0.009, ACC, axis='y', segs=18, tsegs=6)]
    return p


def hair_bob():
    """Jana: a blond chin-length bob with side-swept bangs."""
    x0, y0, z0 = HC
    keep = lambda x, y, z: (y > -0.13) and not (z > 0.06 and y < 0.07 and abs(x) < 0.13)
    p = [cut_shell('bob', (x0, y0 - 0.005, z0 - 0.008), HR * 1.12, (1.07, 1.02, 1.0), keep, HAIR, segs=24, rings=14, thick=0.024),
         blob('bangs', (0.03, y0 + 0.105, 0.112), 0.09, HAIR, s=(1.55, 0.42, 0.6), segs=22, rings=12, rot=Matrix.Rotation(0.32, 3, 'Y')),
         blob('bangsL', (-0.1, y0 + 0.08, 0.1), 0.055, HAIR, s=(0.9, 0.7, 0.7), segs=14, rings=10)]
    # The ends curl in a little: a soft rim along the bottom, round the back.
    rim = lambda u: (math.sin(u * 2.35) * 0.178, y0 - 0.14 + 0.012 * math.cos(u * 2.35), z0 - 0.008 - math.cos(u * 2.35) * 0.16 * 0.98)
    p.append(curve_tube('rim', rim, 21, 0.022, HAIR, sides=8))
    return p


def hair_long():
    """Ingrid: long silver hair with a middle parting, falling over the shoulders."""
    x0, y0, z0 = HC
    p = [cut_shell('cap', HC, HR * 1.07, (1.03, 1.0, 0.98), shell_keep_face(0.08, -0.05, -0.2, 0.115), HAIR, segs=24, rings=14, thick=0.014)]
    for sx in (-1, 1):
        # Soft waves from the middle parting over the temples.
        p.append(blob('wave', (sx * 0.075, y0 + 0.1, 0.09), 0.064, HAIR, s=(1.45, 0.36, 0.72), segs=16, rings=10, rot=Matrix.Rotation(sx * 0.35, 3, 'Y')))
        # Strands framing the face down to the shoulders.
        strand = [(sx * 0.158, y0 + 0.03, 0.03), (sx * 0.175, y0 - 0.05, 0.01), (sx * 0.17, y0 - 0.14, -0.01), (sx * 0.155, y0 - 0.22, -0.025), (sx * 0.145, y0 - 0.27, -0.035)]
        p.append(tube('strand', strand, [0.028, 0.033, 0.032, 0.027, 0.018], HAIR, sides=10))
    p.append(blob('back', (0, y0 - 0.12, -0.085), 0.16, HAIR, s=(1.05, 1.4, 0.5), segs=16, rings=10))
    # A few strand lines for texture.
    for k in range(5):
        x = -0.08 + k * 0.04
        p.append(tube('streak', [(x, y0 + 0.16, 0.03 - abs(x) * 0.2), (x * 1.4, y0 + 0.06, -0.15), (x * 1.3, y0 - 0.1, -0.165)], 0.006, HAIR, sides=6))
    return p


def hair_short_m():
    """Selim: short dark hair with a little lift at the front."""
    x0, y0, z0 = HC
    return [cut_shell('cap', HC, HR * 1.045, (1.0, 1.0, 0.97), shell_keep_face(0.095, 0.0, -0.09), HAIR, segs=24, rings=14, thick=0.012),
            blob('lift', (0.01, y0 + 0.14, 0.085), 0.08, HAIR, s=(1.4, 0.42, 0.72), segs=18, rings=10, rot=Matrix.Rotation(0.12, 3, 'Y'))] + streaks(0.183, 6)


def hair_curly():
    """Marco: thick black curls."""
    x0, y0, z0 = HC
    p = [cut_shell('cap', HC, HR * 1.04, (1.0, 1.0, 0.97), shell_keep_face(0.1, 0.0, -0.1), HAIR, segs=24, rings=14, thick=0.012)]
    rng = random.Random(3)
    for i in range(38):
        a = rng.uniform(0, 2 * math.pi)
        e = rng.uniform(0.05, 1.4)
        d = Vector((math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e)))
        if d.z > 0.4 and d.y < 0.55:
            continue
        if d.y < 0.12 and d.z > -0.2:
            continue
        p.append(blob('curl', (x0 + d.x * HR * 1.07, y0 + d.y * HR * 1.08, z0 + d.z * HR * 1.03), 0.03 + rng.random() * 0.012, HAIR, segs=8, rings=5))
    return p


def hair_quiff():
    """Sven: short red sides and a swept-up quiff."""
    x0, y0, z0 = HC
    return [cut_shell('cap', HC, HR * 1.04, (1.0, 1.0, 0.97), shell_keep_face(0.095, 0.01, -0.09), HAIR, segs=24, rings=14, thick=0.011),
            blob('quiff', (0.02, y0 + 0.15, 0.08), 0.07, HAIR, s=(1.35, 0.55, 0.8), segs=20, rings=12, rot=Matrix.Rotation(-0.5, 3, 'X') @ Matrix.Rotation(0.2, 3, 'Y')),
            blob('quiff2', (-0.03, y0 + 0.155, 0.03), 0.06, HAIR, s=(1.3, 0.45, 1.0), segs=16, rings=10),
            blob('part', (-0.075, y0 + 0.12, 0.06), 0.045, HAIR, s=(1.0, 0.5, 1.0), segs=14, rings=8)] + streaks(0.182, 6, 0.2)


def streaks(r, n, lean=0.0):
    """Comb lines over a short haircut (front to back over the crown), so it reads as hair."""
    x0, y0, z0 = HC
    p = []
    for k in range(n):
        a = -0.75 + 1.5 * k / (n - 1)
        pts = []
        for j in range(5):
            b = 0.25 + 1.1 * j / 4  # from the front over the top towards the back
            d = Vector((math.sin(a) * 0.8 + lean * (1 - j / 4), math.sin(b + 0.3), math.cos(b + 0.3))).normalized()
            pts.append((x0 + d.x * r, y0 + d.y * r, z0 + d.z * r))
        p.append(tube('streak', pts, 0.0055, HAIR, sides=6))
    return p


def beard_full():
    """Selim: a full, short beard with a moustache (the mouth stays free)."""
    keep = lambda x, y, z: (y < -0.03 and z > -0.06) and not (abs(x) < 0.045 and -0.062 < y < -0.024 and z > 0.08)
    return [cut_shell('beard', (0, 0.792, 0.008), 0.162, (1.1, 1.0, 0.97), keep, HAIR, segs=24, rings=14, thick=0.016),
            blob('stache', (0, MOUTH_Y + 0.016, 0.158), 0.03, HAIR, s=(1.75, 0.48, 0.6), segs=16, rings=10)]


def moustache():
    """Marco: a curled moustache."""
    p = []
    for sx in (-1, 1):
        p.append(blob('stache', (sx * 0.022, MOUTH_Y + 0.017, 0.16), 0.022, HAIR, s=(1.5, 0.55, 0.6), segs=14, rings=8, rot=Matrix.Rotation(sx * 0.35, 3, 'Y')))
        p.append(tube('curl', [(sx * 0.045, MOUTH_Y + 0.012, 0.152), (sx * 0.056, MOUTH_Y + 0.02, 0.145), (sx * 0.052, MOUTH_Y + 0.027, 0.142)], [0.008, 0.006, 0.003], HAIR, sides=6))
    return p


def glasses():
    p = []
    for sx in (-1, 1):
        ring = lambda u, sx=sx: (sx * EYE_X + 0.05 * math.cos(math.pi * u), EYE_Y + 0.041 * math.sin(math.pi * u), 0.172 - 0.004 * math.cos(math.pi * u) * sx)
        p.append(curve_tube('rim', ring, 29, 0.0042, GLASS, sides=5))
        p.append(tube('temple', [(sx * 0.115, EYE_Y + 0.004, 0.155), (sx * 0.162, EYE_Y + 0.006, 0.07), (sx * 0.172, EYE_Y - 0.01, 0.0)], 0.0035, GLASS, sides=6))
    p.append(tube('bridge', [(-0.012, EYE_Y + 0.006, 0.171), (0, EYE_Y + 0.012, 0.174), (0.012, EYE_Y + 0.006, 0.171)], 0.0035, GLASS, sides=6))
    return p


def build_hair(key, spec):
    """Hair and what makes the face this customer's (glasses, beard, freckles, laughter lines):
    <key>_Hair, pivot at the neck like the shared head, so the app puts it on the head."""
    fem = spec['f']
    hp = spec['hair']()
    for extra in spec.get('head_extras', []):
        hp += extra()
    if spec.get('lines'):
        # Laughter lines at the outer eye corners (the older customer).
        for sx in (-1, 1):
            for k in range(2):
                hp.append(tube('crow', [(sx * 0.112, EYE_Y + 0.006 - k * 0.016, 0.124), (sx * 0.13, EYE_Y + 0.012 - k * 0.026, 0.11)], 0.0022, LINE, sides=5))
    if spec.get('freckles'):
        rng = random.Random(5)
        for i in range(14):
            sx = -1 if i % 2 else 1
            x = sx * rng.uniform(0.04, 0.11)
            y = rng.uniform(0.79, 0.81)
            hp.append(blob('freckle', (x, y, front_skull(x, y, fem) - 0.0005), 0.0045, LINE, s=(1, 1, 0.5), segs=6, rings=4))
    return node(f'{key}_Hair', hp, NECK)


def build_body(key, spec):
    """Torso with clothes, legs and shoes (merged into <key>_Body)."""
    fem = spec['f']
    prof = F_TORSO if fem else M_TORSO
    BUST = (0.0, 0.552, 0.055, 0.068 * 1.35, 0.068 * 0.72, 0.068 * 0.62)

    def zf(x, y):
        z = front_z(prof, TSZ, x, y)
        if fem:
            cx, cy, cz, rx, ry, rz = BUST
            k = 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2
            if k > 0:
                z = max(z, cz + rz * math.sqrt(k))
        return z
    top = spec['top']
    torso_mat = SUIT
    bp = [lathe('torso', prof, torso_mat, segs=24, sz=TSZ),
          tcyl('neck', (0, NECK[1] + 0.012, 0), 0.04, 0.05, SKIN, segs=16)]
    sh_x = 0.112 if fem else 0.128
    for sx in (-1, 1):
        bp.append(blob('shoulder', (sx * sh_x, 0.61, -0.004), 0.039 if fem else 0.046, torso_mat, s=(1.0, 0.85, 0.95), segs=12, rings=8))
    if fem:
        bp.append(blob('bust', (0, 0.552, 0.055), 0.068, torso_mat, s=(1.35, 0.72, 0.62), segs=16, rings=10))
    # Front: a V-neck showing the shirt or blouse, lapels, collar, buttons, pockets.
    vtop = 0.656
    vbot = {'blazer': 0.5 if fem else 0.505, 'cardigan': 0.49, 'sweater': 0.6, 'chef': 0.63}[top]
    vw = 0.046 if top != 'sweater' else 0.038
    shirt_v = [(-vw, vtop)] + [(-vw * (1 - t), vtop - (vtop - vbot) * t) for t in [i / 6 for i in range(1, 7)]] + [(vw * t, vbot + (vtop - vbot) * t) for t in [i / 6 for i in range(1, 7)]]
    if top in ('blazer', 'cardigan', 'sweater'):
        bp.append(plate('shirtV', shirt_v, zf, SHIRT, off=0.002, thick=0.004))
    if top == 'blazer':
        for sx in (-1, 1):
            line = [(sx * vw * (1 - t), vtop - (vtop - vbot) * t) for t in [i / 7 for i in range(8)]]
            widths = [0.034, 0.036, 0.03, 0.03, 0.026, 0.02, 0.012, 0.0]
            bp.append(strip('lapel', line, widths, lambda i, sx=sx: (sx * 0.95, 0.28), zf, TRIM, off=0.007, thick=0.006))
            # Shirt or blouse collar points.
            if fem:
                bp.append(plate('collar', ellipse(sx * 0.028, 0.648, 0.026, 0.014, n=12), zf, SHIRT, off=0.009, thick=0.004))
            else:
                bp.append(plate('collar', [(sx * 0.008, 0.664), (sx * 0.044, 0.66), (sx * 0.02, 0.632)], zf, SHIRT, off=0.009, thick=0.004))
            bp.append(plate('pocket', [(sx * 0.05, 0.405), (sx * 0.105, 0.405), (sx * 0.105, 0.393), (sx * 0.05, 0.393)], zf, TRIM, off=0.004, thick=0.005))
        for i, y in enumerate((0.475, 0.432)):
            bp.append(blob('button', (0.012, y, zf(0.012, y) + 0.004), 0.009, EYE if not fem else GOLD, s=(1, 1, 0.5), segs=10, rings=6))
        if spec.get('tie'):
            bp.append(blob('knot', (0, 0.642, zf(0, 0.642) + 0.012), 0.014, ACC, s=(1.1, 0.9, 0.7), segs=12, rings=8))
            bp.append(plate('tie', [(-0.006, 0.632), (0.006, 0.632), (0.016, 0.54), (0, 0.515), (-0.016, 0.54)], zf, ACC, off=0.009, thick=0.005))
    elif top == 'cardigan':
        for i, y in enumerate((0.47, 0.43, 0.39)):
            bp.append(blob('button', (0.0, y, zf(0.0, y) + 0.004), 0.008, GOLD, s=(1, 1, 0.5), segs=10, rings=6))
        for sx in (-1, 1):
            line = [(sx * vw * (1 - t), vtop - (vtop - vbot) * t) for t in [i / 7 for i in range(8)]]
            bp.append(strip('placket', line, [0.012] * 8, lambda i, sx=sx: (sx * 0.95, 0.25), zf, TRIM, off=0.005, thick=0.005))
        bp.append(ttorus('hem', (0, 0.345, 0), 0.119, 0.01, TRIM, axis='y', segs=36, tsegs=6))
        bp[-1].scale = (1.0, TSZ, 1.0)
    elif top == 'sweater':
        bp.append(ttorus('rib', (0, 0.652, 0.0), 0.062, 0.011, TRIM, axis='y', segs=30, tsegs=8))
        bp[-1].scale = (1.0, 0.85, 1.0)
        for sx in (-1, 1):
            bp.append(plate('collar', [(sx * 0.008, 0.664), (sx * 0.048, 0.656), (sx * 0.02, 0.628)], zf, SHIRT, off=0.012, thick=0.004))
            for k in range(3):
                x = sx * (0.035 + k * 0.022)
                bp.append(tube('cable', [(x, 0.36, zf(x, 0.36) + 0.002), (x, 0.47, zf(x, 0.47) + 0.002), (x, 0.58, zf(x, 0.58) + 0.002)], 0.0045, TRIM, sides=6))
        bp.append(ttorus('hem', (0, 0.348, 0), 0.124, 0.012, TRIM, axis='y', segs=36, tsegs=6))
        bp[-1].scale = (1.0, TSZ, 1.0)
    elif top == 'chef':
        # White double-breasted jacket: standing collar, a front flap with two rows of buttons.
        bp.append(ttorus('stand', (0, 0.672, 0.0), 0.046, 0.011, torso_mat, axis='y', segs=30, tsegs=8))
        bp.append(plate('flap', [(-0.02, 0.64), (0.07, 0.62), (0.085, 0.36), (-0.02, 0.36)], zf, torso_mat, off=0.004, thick=0.006))
        for r_ in range(3):
            for sx in (-1, 1):
                x = 0.03 + sx * 0.032
                y = 0.56 - r_ * 0.07
                bp.append(blob('button', (x, y, zf(x, y) + 0.01), 0.009, TRIM, s=(1, 1, 0.5), segs=10, rings=6))
        bp.append(blob('knot', (0.0, 0.646, zf(0.0, 0.646) + 0.012), 0.019, ACC, s=(1.25, 1.0, 0.7), segs=12, rings=8))
        bp.append(plate('kerchief', [(-0.018, 0.64), (0.018, 0.64), (0.008, 0.6), (-0.008, 0.6)], zf, ACC, off=0.008, thick=0.004))
    if spec.get('scarf'):
        bp.append(ttorus('scarf', (0, 0.655, 0.0), 0.072, 0.028, ACC, axis='y', segs=30, tsegs=10))
        bp.append(plate('tail1', [(0.01, 0.64), (0.05, 0.64), (0.058, 0.47), (0.016, 0.47)], zf, ACC, off=0.026, thick=0.012))
        bp.append(plate('tail2', [(0.035, 0.63), (0.075, 0.625), (0.085, 0.49), (0.045, 0.495)], zf, ACC, off=0.016, thick=0.012))
        for k in range(4):
            bp.append(tube('fringe', [(0.02 + k * 0.011, 0.47, zf(0.02, 0.47) + 0.026), (0.022 + k * 0.011, 0.452, zf(0.02, 0.45) + 0.026)], 0.003, ACC, sides=5))
    if spec.get('apron'):
        apr = lambda x, y: front_z([(0.0, 0.1), (0.13, 0.12), (0.13, 0.42), (0.0, 0.43)], 0.9, x, y) + 0.01
        bp.append(plate('apron', [(-0.115, 0.43), (0.115, 0.43), (0.12, 0.13), (-0.12, 0.13)], apr, ACC, off=0.004, thick=0.006))
        bp.append(ttorus('apronBand', (0, 0.43, 0.0), 0.12, 0.009, ACC, axis='y', segs=34, tsegs=6))
        bp[-1].scale = (1.0, 0.9, 1.0)
        bp.append(plate('apronPocket', [(-0.05, 0.33), (0.05, 0.33), (0.05, 0.27), (-0.05, 0.27)], apr, ACC, off=0.011, thick=0.004))
    # Lower body.
    bottom = spec['bottom']
    if bottom == 'trousers':
        bp.append(blob('seat', (0, 0.335, -0.005), 0.11, PANTS, s=(1.15, 0.5, 0.82), segs=16, rings=10))
        for sx in (-1, 1):
            bp.append(tube('leg', [(sx * 0.062, 0.345, 0), (sx * 0.063, 0.27, 0.003), (sx * 0.064, 0.2, 0.009), (sx * 0.065, 0.12, 0.004), (sx * 0.066, 0.065, 0.0), (sx * 0.066, 0.05, 0.0)],
                           [0.058, 0.055, 0.05, 0.047, 0.046, 0.048], PANTS, sides=14))
            bp.append(blob('shoe', (sx * 0.066, 0.03, 0.03), 0.05, SHOE, s=(0.9, 0.55, 1.55), segs=14, rings=8))
            bp.append(tcyl('sole', (sx * 0.066, 0.006, 0.028), 0.046, 0.012, TRIM if spec.get('dark_sole') else SHOE, segs=12))
            bp[-1].scale = (0.9, 1.6, 1.0)
    else:
        long = bottom == 'long'
        prof_s = ([(0.0, 0.35), (0.12, 0.35), (0.134, 0.28), (0.148, 0.16), (0.155, 0.09), (0.0, 0.09)] if long
                  else [(0.0, 0.35), (0.12, 0.35), (0.127, 0.3), (0.12, 0.23), (0.108, 0.175), (0.0, 0.175)])
        bp.append(lathe('skirt', prof_s, PANTS, segs=28, sz=0.8))
        knee = 0.09 if long else 0.19
        for sx in (-1, 1):
            pts = [(sx * 0.047, knee, 0.0), (sx * 0.046, knee - 0.04, -0.004), (sx * 0.045, 0.1, -0.002), (sx * 0.044, 0.065, 0.0), (sx * 0.044, 0.04, 0.003)]
            rad = [0.033, 0.034, 0.026, 0.021, 0.022]
            if long:
                pts, rad = pts[2:], rad[2:]
            bp.append(tube('leg', pts, rad, SKIN, sides=10))
            bp.append(blob('shoe', (sx * 0.046, 0.026, 0.024), 0.038, SHOE, s=(0.85, 0.6, 1.5), segs=12, rings=8))
            bp.append(tbox('heel', (sx * 0.046, 0.012, -0.024), (0.016, 0.024, 0.014), SHOE, bev=0.003))
    for extra in spec.get('body_extras', []):
        bp += extra(zf)
    bpy.context.view_layer.update()
    return merge(bp, f'{key}_Body')


def build_arm(key, spec, sx, tag, root):
    """Upper arm (pivot at the shoulder) and forearm with the hand (pivot at the elbow)."""
    fem = spec['f']
    top = spec['top']
    sleeve = SUIT
    cuff = SHIRT if top in ('blazer', 'sweater') else (TRIM if top == 'cardigan' else SUIT)
    k = 0.92 if fem else 1.0
    S = (sx * (0.112 if fem else 0.128), 0.615, -0.004)
    E = (sx * (0.142 if fem else 0.158), 0.49, 0.0)
    W = (sx * (0.152 if fem else 0.168), 0.378, 0.03)
    upper = [tube('upper', [S, ((S[0] + E[0]) / 2 + sx * 0.004, (S[1] + E[1]) / 2, -0.003), E], [0.043 * k, 0.04 * k, 0.037 * k], sleeve, sides=12)]
    up = node(f'{key}_Arm{tag}', upper, S)
    d = Vector(W) - Vector(E)
    d.normalize()
    cw = Vector(W) - d * 0.012
    fore = [blob('elbow', E, 0.037 * k, sleeve, segs=10, rings=7),
            tube('fore', [E, ((E[0] + W[0]) / 2, (E[1] + W[1]) / 2, (E[2] + W[2]) / 2), tuple(cw)], [0.037 * k, 0.034 * k, 0.031 * k], sleeve, sides=12),
            tube('cuff', [tuple(cw - d * 0.006), tuple(cw + d * 0.012)], [0.033 * k, 0.032 * k], cuff, sides=12)]
    # Hand: palm (facing the leg), four fingers and a thumb pointing forwards.
    H = Vector(W) + Vector((0, -0.036, 0.004))
    hs = 0.92 if fem else 1.0
    fore.append(blob('palm', tuple(H), 0.029 * hs, SKIN, s=(0.62, 1.0, 0.95), segs=12, rings=8))
    for i, dz in enumerate((-0.015, -0.005, 0.005, 0.015)):
        L = (0.032, 0.036, 0.035, 0.029)[i] * hs
        a = Vector((H.x, H.y - 0.018 * hs, H.z + dz * hs))
        b = Vector((H.x - sx * 0.004, H.y - 0.018 * hs - L * 0.6, H.z + dz * hs * 1.1 + 0.002))
        c = Vector((H.x - sx * 0.011, H.y - 0.018 * hs - L, H.z + dz * hs * 1.15 + 0.006))
        fore.append(tube('finger', [tuple(a), tuple(b), tuple(c)], [0.0072 * hs, 0.0068 * hs, 0.006 * hs], SKIN, sides=6))
        fore.append(blob('tip', tuple(c), 0.006 * hs, SKIN, segs=6, rings=4))
    tA = Vector((H.x - sx * 0.006, H.y + 0.006, H.z + 0.018 * hs))
    tB = Vector((H.x - sx * 0.012, H.y - 0.016, H.z + 0.032 * hs))
    fore.append(tube('thumb', [tuple(tA), tuple((tA + tB) / 2), tuple(tB)], [0.0095 * hs, 0.0085 * hs, 0.0075 * hs], SKIN, sides=6))
    fore.append(blob('thumbTip', tuple(tB), 0.0075 * hs, SKIN, segs=6, rings=4))
    fo = node(f'{key}_Fore{tag}', fore, E)
    set_parent(fo, up)
    set_parent(up, root)
    return up


CHARACTERS = {
    'albers': dict(f=True, top='blazer', bottom='skirt', hair=hair_bun, head_extras=[glasses], earrings=True),
    'demir': dict(f=False, top='sweater', bottom='trousers', hair=hair_short_m, head_extras=[beard_full]),
    'ferri': dict(f=False, top='chef', bottom='trousers', hair=hair_curly, head_extras=[moustache], apron=True),
    'wagner': dict(f=True, top='cardigan', bottom='long', hair=hair_long, scarf=True, earrings=True, lines=True),
    'petrov': dict(f=True, top='blazer', bottom='skirt', hair=hair_bob, earrings=True),
    'olsen': dict(f=False, top='blazer', bottom='trousers', hair=hair_quiff, tie=True, freckles=True),
}

# Shared by all women (Base_f) and all men (Base_m): the head with the face, eyelids, brows,
# mouths and the arms. Every customer (Cust_<key>) adds the body with the clothes and the hair.
customers = []
cust_meshes = []
for g, fem in (('f', True), ('m', False)):
    root = bpy.data.objects.new(f'Base_{g}', None)
    bpy.context.scene.collection.objects.link(root)
    spec = dict(f=fem, top='blazer', earrings=fem)
    head = build_head(g, spec)
    set_parent(head, root)
    for sx, tag in ((-1, 'R'), (1, 'L')):
        build_arm(g, spec, sx, tag, root)
    customers.append(root)
for i, (key, spec) in enumerate(CHARACTERS.items()):
    root = bpy.data.objects.new(f'Cust_{key}', None)
    bpy.context.scene.collection.objects.link(root)
    set_parent(build_body(key, spec), root)
    set_parent(build_hair(key, spec), root)
    customers.append(root)
for r in customers:
    cust_meshes += [o for o in r.children_recursive if o.type == 'MESH']

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
    customer = pose_customer('albers', 'Smile')
    customer.location = P(0.17, PLATEAU_TOP, 0.04)
    customer.scale = (0.42, 0.42, 0.42)
    customer.rotation_euler = (0, 0, 0.35)
    bpy.data.objects['f_ArmL'].rotation_euler = (0, -2.3, 0)
    bpy.data.objects['f_ForeL'].rotation_euler = (0, -0.5, 0)
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


# Token colors of the customers (css/game-summit.css) for the coin and the close-ups.
LOOKS = {
    'albers': dict(suit='#26386a', shirt='#f4f5f8', pants='#26386a', hair='#6b4027', skin='#f2c7a8', accent='#2fa59a', iris='#4f8a5b', lips='#c45a6a', shoe='#2a201c'),
    'demir': dict(suit='#d9a23a', shirt='#a9cdf0', pants='#3d5a85', hair='#2c2220', skin='#c98f6b', accent='#2fa59a', iris='#6b4a2b', lips='#8a2f3a', shoe='#5a3a26'),
    'ferri': dict(suit='#f4f5f8', shirt='#f4f5f8', pants='#1f2436', hair='#2c2220', skin='#c98f6b', accent='#9a2747', iris='#6b4a2b', lips='#8a2f3a', shoe='#2a201c'),
    'wagner': dict(suit='#d77a8f', shirt='#f4f5f8', pants='#4b2d52', hair='#d7d9e2', skin='#f2c7a8', accent='#2fa59a', iris='#4a78b5', lips='#c45a6a', shoe='#2a201c'),
    'petrov': dict(suit='#1f2436', shirt='#f4f5f8', pants='#1f2436', hair='#e3c27c', skin='#f2c7a8', accent='#9a2747', iris='#4a78b5', lips='#b8323f', shoe='#9a2747'),
    'olsen': dict(suit='#4a5670', shirt='#a9cdf0', pants='#4a5670', hair='#b4542e', skin='#f6d3bd', accent='#9a2747', iris='#4f8a5b', lips='#8a2f3a', shoe='#5a3a26'),
}


def shade(hexs, k):
    h = hexs.lstrip('#')
    return '#' + ''.join(f'{min(255, int(int(h[i:i + 2], 16) * k)):02x}' for i in (0, 2, 4))


def pose_customer(key, mouth='Smile'):
    """Shows one customer (colors, open eyes, one mouth); hides the others. Returns its root."""
    L = LOOKS[key]
    for m, c in ((SUIT, L['suit']), (TRIM, shade(L['suit'], 0.78)), (SHIRT, L['shirt']), (PANTS, L['pants']), (HAIR, L['hair']), (SKIN, L['skin']),
                 (ACC, L['accent']), (IRIS, L['iris']), (LIPS, L['lips']), (SHOE, L['shoe']), (LINE, shade(L['skin'], 0.78)), (CHEEK, '#f08a8a'),
                 (MOUTH, '#7a2430'), (TONGUE, '#e8858a'), (WHITE, '#fbfbfd'), (EYE, '#14121c'), (GLASS, '#1d2033'), (GOLD, '#ffc65c')):
        set_color(m, c)
    set_color(SHINE, '#ffffff', 0.2, emit=2.0)
    set_color(GOLD, '#ffc65c', 0.25, metal=1.0)
    g = 'f' if CHARACTERS[key]['f'] else 'm'
    roots = [bpy.data.objects[f'Cust_{key}'], bpy.data.objects[f'Base_{g}']]
    for r in customers:
        for o in [r, *r.children_recursive]:
            o.hide_render = r not in roots
    for r in roots:
        for o in r.children_recursive:
            if '_Lid' in o.name:
                o.rotation_euler = (-2.45, 0, 0)
            if '_Mouth' in o.name:
                o.hide_render = not o.name.endswith(mouth)
    show = bpy.data.objects.get(f'Show_{key}')
    if not show:
        show = bpy.data.objects.new(f'Show_{key}', None)
        bpy.context.scene.collection.objects.link(show)
        for r in roots:
            set_parent(r, show)
    return show


def render_faces(out):
    """Close-ups of every customer, front and three quarters, for a critical look."""
    os.makedirs(out, exist_ok=True)
    sc = bpy.context.scene
    for o in list(sc.objects):
        if o.type == 'MESH' and not any(o in r.children_recursive for r in customers):
            o.hide_render = True
    w = bpy.data.worlds.new('studio')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin('#33367e'), 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    key_l = bpy.data.objects.new('key', bpy.data.lights.new('key', 'AREA'))
    key_l.data.energy = 40
    key_l.data.size = 1.5
    key_l.location = P(0.8, 1.6, 1.6)
    key_l.rotation_euler = (P(0, 0.7, 0) - key_l.location).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(key_l)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'AREA'))
    fill.data.energy = 15
    fill.data.size = 2
    fill.location = P(-1.2, 1.0, 1.0)
    fill.rotation_euler = (P(0, 0.7, 0) - fill.location).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(fill)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 50
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 520
    sc.render.resolution_y = 640
    sc.view_settings.view_transform = 'AgX'
    for key in LOOKS:
        pose_customer(key, 'Smile')
        for tag, pos, tgt in (('front', (0.0, 0.62, 2.0), (0, 0.55, 0)), ('three', (1.3, 0.75, 1.5), (0, 0.56, 0)), ('face', (0.35, 0.86, 0.8), (0, 0.83, 0))):
            cam.location = P(*pos)
            cam.rotation_euler = (P(*tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = f'{out}/cust-{key}-{tag}.png'
            bpy.ops.render.render(write_still=True)


PLATEAU_TOP = TOP + 0.045
BOLTS_C = [(0.14 if k % 2 == 0 else -0.14, k * STEP + 0.13) for k in range(SECTIONS)]
if FACES:
    render_faces(FACES)
    sys.exit(0)
if COIN:
    render_coin(COIN, int(ARGS[2]) if len(ARGS) > 2 else 512, int(ARGS[3]) if len(ARGS) > 3 else 64)
    sys.exit(0)

# ---------- ambient occlusion, export ----------

# Ambient occlusion on the big parts; lids, brows and mouths stay unshaded.
CUST_AO = [o for o in cust_meshes if o.name.split('_')[-1] in ('Body', 'Head', 'Hair', 'ArmL', 'ArmR', 'ForeL', 'ForeR')]
ASSETS = [(wall, 0.06), (peak, 0.06), *[(h, 0.02) for h in hold_obs], (quickdraw, 0.02), (flag, 0.05), (cross, 0.04),
          *[(p, 0.2) for p in peaks], (harness, 0.05), *[(m, 0.05) for m in CUST_AO]]
bake_ao(ASSETS, {'SummitGold', 'CustShine', 'CustGold'}, distance=0.12, samples=32)
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
export_sel(OUT_CUST, customers)
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
    for r in customers:
        r.location = P(0.15, TOP + 0.03, 0.0)
        r.scale = (0.42, 0.42, 0.42)
    flag.location = P(0.33, TOP + 0.03, -0.12)
    cross.location = P(-0.2, TOP + 0.03, -0.1)
    for tag, pos, tgt in (('wall', (0.4, 0.2, 3.6), (0, 0.0, 0)), ('top', (0.5, 1.5, 1.2), (0, TOP + 0.1, 0))):
        cam.location = P(*pos)
        cam.rotation_euler = (P(*tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{PREVIEW}/summit-{tag}.png'
        bpy.ops.render.render(write_still=True)
print('DONE')

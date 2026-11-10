# "Grünes Portfolio" (game key 'green'): a region diorama in a premium miniature look, plus the
# projects the player finances. Original design. Meters, three.js coordinates (x right, y up,
# z towards the player = south). The layout mirrors public/js/green-sim.js (hills, coast, river,
# town, fields, plots): keep both in sync.
#
# Diorama (static, one node each):
#   GreenGround  terrain top: hills, cliff, river valley, coast with a bay, town ground, meadows
#   GreenBase    the sides (soil strata) and a dark wooden plinth with a brass trim line
#   GreenWater   water surface (river and sea) and the resin side where the sea meets the edge
#   GreenFields  a patchwork of fields with crop rows (south-west, the sunny side)
#   GreenRoads   country roads, town streets, the market square, the bridge
#   GreenTown    houses, town hall, Christmas market stalls and tree, lighthouse, pier
#   GreenTrees   pine forests on the hills, round trees along the river and in town
#   GreenHit     coarse invisible copy of the terrain (pointer rays hit it, cheap)
#   Plot_<id>    empties at the center of each building plot (top of the leveled pad)
#   XmasTree     empty at the foot of the town's Christmas tree (fairy lights at runtime)
# Projects (clone sources, origin on the ground at the center of a plot):
#   GreenTurbine (tower and nacelle) + GreenRotor (hub and blades, origin at the hub, spins
#   around its z axis; RotorHub empty marks where it sits), GreenSolar, GreenSchool, GreenKita,
#   GreenHomes, GreenCloud, GreenBoat.
# Materials are named Green* so the runtime colors them from the --xr-green-* tokens; ambient
# occlusion is baked into the vertex colors ('Col').
# Usage: blender -b -P build_green.py -- <out.glb> <out.blend> [coin.png] [preview-folder]
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, tbox, tcyl, merge, export, blob, densify

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
COIN = ARGS[2] if len(ARGS) > 2 and ARGS[2] != '-' else None
PREVIEW = ARGS[3] if len(ARGS) > 3 else None
init()
rnd = random.Random(11)

# ---------- materials (preview colors; the app uses the tokens) ----------

def mat(name, c, metal=0.0, rough=0.7, emit=None):
    return material(name, c, metal, rough, emit)

GRASS = mat('GreenGrass', (0.33, 0.6, 0.28))
HILL = mat('GreenHill', (0.25, 0.48, 0.27))
ROCK = mat('GreenRock', (0.46, 0.45, 0.44), rough=0.9)
SAND = mat('GreenSand', (0.9, 0.82, 0.63), rough=0.9)
BANK = mat('GreenBank', (0.5, 0.42, 0.3), rough=0.9)
SEABED = mat('GreenSeabed', (0.5, 0.6, 0.55), rough=0.9)
SOIL = mat('GreenSoil', (0.45, 0.3, 0.18), rough=0.95)
SOIL2 = mat('GreenSoilDark', (0.3, 0.2, 0.13), rough=0.95)
STRATA = mat('GreenStrata', (0.42, 0.4, 0.38), rough=0.95)
PLINTH = mat('GreenPlinth', (0.1, 0.07, 0.05), rough=0.45)
TRIM = mat('GreenTrim', (0.9, 0.7, 0.35), 1.0, 0.3)
WATER = mat('GreenWater', (0.1, 0.42, 0.62), rough=0.1)
WSIDE = mat('GreenWaterSide', (0.08, 0.32, 0.5), rough=0.1)
FIELD1 = mat('GreenField1', (0.86, 0.72, 0.38), rough=0.95)
FIELD2 = mat('GreenField2', (0.42, 0.64, 0.24), rough=0.95)
FIELD3 = mat('GreenField3', (0.5, 0.35, 0.22), rough=0.95)
HEDGE = mat('GreenHedge', (0.2, 0.42, 0.2), rough=0.9)
ROAD = mat('GreenRoad', (0.33, 0.34, 0.37), rough=0.85)
PLAZA = mat('GreenPlaza', (0.78, 0.72, 0.64), rough=0.85)
STONE = mat('GreenStone', (0.68, 0.64, 0.6), rough=0.85)
WALL1 = mat('GreenWall1', (0.96, 0.91, 0.8))
WALL2 = mat('GreenWall2', (0.94, 0.76, 0.55))
WALL3 = mat('GreenWall3', (0.8, 0.86, 0.92))
WALL4 = mat('GreenWall4', (0.93, 0.62, 0.55))
ROOF1 = mat('GreenRoof1', (0.68, 0.22, 0.15))
ROOF2 = mat('GreenRoof2', (0.36, 0.26, 0.22))
ROOF3 = mat('GreenRoof3', (0.3, 0.34, 0.42))
WINDOW = mat('GreenWindow', (0.12, 0.15, 0.22), rough=0.2)
WOOD = mat('GreenWood', (0.55, 0.37, 0.22))
PINE = mat('GreenPine', (0.1, 0.36, 0.22))
LEAF = mat('GreenLeaf', (0.3, 0.56, 0.22))
LEAF2 = mat('GreenLeaf2', (0.56, 0.62, 0.2))
TRUNK = mat('GreenTrunk', (0.35, 0.22, 0.12))
TURB = mat('GreenTurbine', (0.94, 0.95, 0.97), 0.1, 0.35)
MARK = mat('GreenMark', (0.85, 0.15, 0.15), 0.1, 0.4)
CONC = mat('GreenConcrete', (0.66, 0.66, 0.64), rough=0.9)
CELL = mat('GreenSolarCell', (0.07, 0.12, 0.32), 0.3, 0.15)
FRAME = mat('GreenSolarFrame', (0.78, 0.8, 0.84), 0.8, 0.3)
SWALL = mat('GreenSchoolWall', (0.97, 0.93, 0.85))
SACC = mat('GreenSchoolAccent', (0.5, 0.38, 0.88))
COURT = mat('GreenCourt', (0.78, 0.36, 0.28), rough=0.9)
LINE = mat('GreenLine', (0.97, 0.97, 0.97))
KITA1 = mat('GreenKita1', (1.0, 0.55, 0.35))
KITA2 = mat('GreenKita2', (0.35, 0.75, 0.95))
KITA3 = mat('GreenKita3', (1.0, 0.85, 0.3))
HWALL = mat('GreenHomesWall', (0.98, 0.95, 0.9))
CLOUD = mat('GreenCloud', (0.97, 0.98, 1.0), rough=1.0)
LAMP = mat('GreenLampGlow', (0, 0, 0), emit=(1.0, 0.85, 0.5))
STAR = mat('GreenStarGlow', (0, 0, 0), emit=(1.0, 0.8, 0.3))
STALL = mat('GreenStall', (0.86, 0.18, 0.2))
BOAT = mat('GreenBoat', (0.95, 0.95, 0.95))
SAIL = mat('GreenSail', (0.98, 0.96, 0.9), rough=0.9)
LHRED = mat('GreenLighthouse', (0.85, 0.18, 0.18))
GLOWS = {'GreenLampGlow', 'GreenStarGlow'}

# ---------- layout (mirror of public/js/green-sim.js) ----------

OUT_A, OUT_B, OUT_N = 0.52, 0.37, 3.6
HILLS = [(-0.30, -0.19, 0.14, 0.11), (-0.03, -0.265, 0.09, 0.08), (-0.42, 0.02, 0.07, 0.075), (0.19, -0.25, 0.06, 0.065)]
RIVER = [(-0.17, -0.40), (-0.14, -0.31), (-0.155, -0.215), (-0.105, -0.13), (-0.035, -0.096), (0.05, -0.085), (0.12, -0.083), (0.19, -0.07), (0.27, -0.058), (0.36, -0.03)]
TOWN = (-0.07, 0.28, -0.04, 0.33)
FIELDS = (-0.49, -0.1, 0.06, 0.36)
PLOTS = [
    ('L1', 'land', -0.30, -0.19), ('L2', 'land', -0.035, -0.265), ('L3', 'land', -0.415, 0.02),
    ('L4', 'land', 0.19, -0.25), ('L5', 'land', 0.255, -0.155), ('L6', 'land', -0.40, 0.215),
    ('L7', 'land', -0.255, 0.27), ('L8', 'land', -0.235, 0.135), ('L9', 'land', -0.125, -0.025),
    ('T1', 'town', 0.0, 0.165), ('T2', 'town', 0.005, 0.28), ('T3', 'town', 0.005, 0.035),
    ('T4', 'town', 0.13, 0.035), ('T5', 'town', 0.23, 0.04), ('T6', 'town', 0.235, 0.165),
    ('T7', 'town', 0.235, 0.28),
]
PAD = {'land': 0.08, 'town': 0.062}
TOWN_Y = 0.004
WATER_Y = -0.006
BASE_Y = -0.05


def smooth(e0, e1, v):
    if e1 == e0:
        return 1.0 if v >= e0 else 0.0
    k = min(1.0, max(0.0, (v - e0) / (e1 - e0)))
    return k * k * (3 - 2 * k)


def coast_x(z):
    return 0.315 + 0.045 * math.sin(5.5 * z + 1.2) - 0.075 * smooth(0.04, 0.33, -z)


def hill_at(x, z):
    return sum(h * math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (2 * r * r)) for hx, hz, h, r in HILLS)


def river_dist(x, z):
    """Distance to the river and how far along it (0 source .. 1 mouth)."""
    best, at = 1e9, 0.0
    total = sum(math.hypot(RIVER[i + 1][0] - RIVER[i][0], RIVER[i + 1][1] - RIVER[i][1]) for i in range(len(RIVER) - 1))
    run = 0.0
    for i in range(len(RIVER) - 1):
        ax, az = RIVER[i]
        bx, bz = RIVER[i + 1]
        dx, dz = bx - ax, bz - az
        L = math.hypot(dx, dz)
        k = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (L * L)))
        d = math.hypot(x - ax - dx * k, z - az - dz * k)
        if d < best:
            best, at = d, (run + L * k) / total
        run += L
    return best, at


def h2(ix, iz):
    v = math.sin(ix * 127.1 + iz * 311.7) * 43758.5453
    return v - math.floor(v)


def vnoise(x, z):
    ix, iz = math.floor(x), math.floor(z)
    fx, fz = x - ix, z - iz
    fx, fz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a, b, c, d = h2(ix, iz), h2(ix + 1, iz), h2(ix, iz + 1), h2(ix + 1, iz + 1)
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz


def fbm(x, z):
    return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 3.3, z * 2.1 + 1.7) * 0.3 + vnoise(x * 4.3 + 7.1, z * 4.3 + 5.2) * 0.15 - 0.5


def in_box(b, x, z, soft):
    x0, x1, z0, z1 = b
    return smooth(x0 - soft, x0 + soft, x) * smooth(x1 + soft, x1 - soft, x) * smooth(z0 - soft, z0 + soft, z) * smooth(z1 + soft, z1 - soft, z)


def raw_height(x, z):
    hill = hill_at(x, z)
    h = hill + 0.012 * fbm(x * 16, z * 16) * min(1.0, hill / 0.03) + 0.0025 * fbm(x * 45 + 9, z * 45 + 4)
    # Fields: a gentle slope down to the south (the sunny side).
    f = in_box(FIELDS, x, z, 0.05)
    h = h * (1 - f) + f * (0.006 + 0.016 * smooth(0.36, 0.06, z) + hill * 0.6)
    # The town stands on level ground.
    t = in_box(TOWN, x, z, 0.03)
    h = h * (1 - t) + TOWN_Y * t
    return h


PAD_Y = {}
for pid, area, px, pz in PLOTS:
    PAD_Y[pid] = TOWN_Y if area == 'town' else max(0.004, raw_height(px, pz))


def height(x, z):
    h = raw_height(x, z)
    # Leveled pads for the plots.
    for pid, area, px, pz in PLOTS:
        s = PAD[area] / 2 + 0.006
        d = max(abs(x - px), abs(z - pz))
        k = smooth(s + 0.04, s, d)
        if k > 0:
            h = h * (1 - k) + PAD_Y[pid] * k
    # River: a channel that widens towards the mouth.
    d, at = river_dist(x, z)
    w = 0.009 + 0.01 * at
    bed = -0.017
    h = min(h, bed + (h - bed) * smooth(w * 0.6, w + 0.016, d)) if d < w + 0.016 else h
    # Coast: beach and seabed; steep where the hill meets the sea (the cliff).
    cd = coast_x(z) - x
    hill = hill_at(x, z)
    width = 0.03 * (1 - min(1.0, hill / 0.045)) + 0.005
    sea = WATER_Y + 0.002 + 0.032 * max(cd, -0.07) / 0.07
    k = smooth(-0.004, width, cd)
    h = sea * (1 - k) + h * k
    return h


def inside(x, z, m=0.0):
    return (abs(x) / (OUT_A - m)) ** OUT_N + (abs(z) / (OUT_B - m)) ** OUT_N <= 1


def outline_point(t, m=0.0):
    c, s = math.cos(t), math.sin(t)
    a, b = OUT_A - m, OUT_B - m
    x = a * math.copysign(abs(c) ** (2 / OUT_N), c)
    z = b * math.copysign(abs(s) ** (2 / OUT_N), s)
    return x, z


def outline_normal(x, z):
    nx = math.copysign(abs(x) ** (OUT_N - 1), x) / OUT_A ** OUT_N
    nz = math.copysign(abs(z) ** (OUT_N - 1), z) / OUT_B ** OUT_N
    L = math.hypot(nx, nz) or 1
    return nx / L, nz / L


def plot_near(x, z, margin):
    for pid, area, px, pz in PLOTS:
        s = PAD[area] / 2 + margin
        if abs(x - px) < s and abs(z - pz) < s:
            return True
    return False


# ---------- terrain ----------

def cut_outline(bm, planes, m=0.0):
    for i in range(planes):
        t = 2 * math.pi * (i + 0.5) / planes
        x, z = outline_point(t, m)
        nx, nz = outline_normal(x, z)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=P(x, 0, z), plane_no=Vector((nx, -nz, 0)), clear_outer=True)


def terrain_mesh(name, step, planes):
    bm = bmesh.new()
    nx, nz = int(2 * OUT_A / step) + 2, int(2 * OUT_B / step) + 2
    bmesh.ops.create_grid(bm, x_segments=nx, y_segments=nz, size=1.0)
    mx = max(abs(v.co.x) for v in bm.verts)
    my = max(abs(v.co.y) for v in bm.verts)
    bmesh.ops.scale(bm, vec=Vector(((OUT_A + step) / mx, (OUT_B + step) / my, 1)), verts=bm.verts)
    cut_outline(bm, planes)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=step * 0.18)
    for v in bm.verts:
        x, z = v.co.x, -v.co.y
        v.co.z = height(x, z)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


ground = terrain_mesh('GreenGround', 0.0085, 180)
for m in (GRASS, HILL, ROCK, SAND, BANK, SEABED):
    ground.data.materials.append(m)
MI = {m.name: i for i, m in enumerate(ground.data.materials)}
ground.data.update()
for poly in ground.data.polygons:
    poly.use_smooth = True
    c = poly.center
    x, z, y = c.x, -c.y, c.z
    n = poly.normal
    cd = coast_x(z) - x
    rd, _ = river_dist(x, z)
    hill = hill_at(x, z)
    if y < WATER_Y - 0.001 and cd < 0.01:
        mi = 'GreenSeabed'
    elif cd < 0.02 and y < 0.008 and hill < 0.03:
        mi = 'GreenSand'
    elif rd < 0.012 + 0.012 and y < 0.004:
        mi = 'GreenBank'
    elif n.z < 0.62:
        mi = 'GreenRock'
    elif y > 0.045 or (hill > 0.04 and y > 0.03):
        mi = 'GreenHill'
    else:
        mi = 'GreenGrass'
    poly.material_index = MI[mi]

# Coarse copy for pointer rays.
hit = terrain_mesh('GreenHit', 0.03, 64)
hit.data.materials.append(GRASS)

# Boundary loop of the ground (ordered) for the sides.
bm = bmesh.new()
bm.from_mesh(ground.data)
bm.verts.ensure_lookup_table()
bnd = [e for e in bm.edges if e.is_boundary]
nxt = {}
for e in bnd:
    a, b = e.verts
    nxt.setdefault(a.index, []).append(b.index)
    nxt.setdefault(b.index, []).append(a.index)
start = bnd[0].verts[0].index
loop = [start]
prev = None
cur = start
while True:
    cand = [i for i in nxt[cur] if i != prev]
    if not cand:
        break
    prev, cur = cur, cand[0]
    if cur == start:
        break
    loop.append(cur)
coords = [bm.verts[i].co.copy() for i in loop]
bm.free()
# Counterclockwise in three.js top view (x right, z down the screen).
area = sum(coords[i].x * (-coords[(i + 1) % len(coords)].y) - coords[(i + 1) % len(coords)].x * (-coords[i].y) for i in range(len(coords)))
if area < 0:
    coords.reverse()
print('outline verts', len(coords))


def side_wall():
    """Soil strata from the terrain edge down to the plinth, and the wooden plinth."""
    bm = bmesh.new()
    n = len(coords)
    levels = []
    for co in coords:
        top = co.z
        y4 = top
        y3 = min(top - 0.004, top) if top > WATER_Y else top
        y2 = min(-0.022, y3)
        y1 = min(-0.036, y2)
        levels.append([BASE_Y, y1, y2, y3, y4])
    cols = [[bm.verts.new((co.x, co.y, lv[k])) for k in range(5)] for co, lv in zip(coords, levels)]
    mats = [STRATA, SOIL2, SOIL, GRASS]
    for i in range(n):
        j = (i + 1) % n
        for k in range(4):
            a, b, c, d = cols[i][k], cols[j][k], cols[j][k + 1], cols[i][k + 1]
            if (a.co - d.co).length < 1e-6 and (b.co - c.co).length < 1e-6:
                continue
            f = bm.faces.new((a, b, c, d))
            f.material_index = k
    bm.normal_update()
    for f in bm.faces:
        cen = f.calc_center_median()
        if f.normal.x * cen.x + f.normal.y * cen.y < 0:
            f.normal_flip()
    me = bpy.data.meshes.new('wall')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('wall', me)
    bpy.context.scene.collection.objects.link(ob)
    for m in mats:
        ob.data.materials.append(m)
    # Top face of the earth edge is grassy only on land; on the sea it is seabed.
    for poly in ob.data.polygons:
        if poly.material_index == 3 and poly.center.z < WATER_Y:
            poly.material_index = 2
    return ob


def plinth():
    """A dark wooden plinth with a brass line, a little wider than the terrain."""
    bm = bmesh.new()
    n = 160
    ring = []
    rows = [(BASE_Y, 0.004), (BASE_Y - 0.003, 0.008), (BASE_Y - 0.008, 0.008), (BASE_Y - 0.0085, 0.0085), (BASE_Y - 0.011, 0.0085), (BASE_Y - 0.0115, 0.008), (BASE_Y - 0.03, 0.008), (BASE_Y - 0.032, 0.006)]
    for i in range(n):
        t = 2 * math.pi * i / n
        col = []
        for y, m in rows:
            x, z = outline_point(t, -m)
            col.append(bm.verts.new(P(x, y, z)))
        ring.append(col)
    for i in range(n):
        j = (i + 1) % n
        for k in range(len(rows) - 1):
            f = bm.faces.new((ring[i][k], ring[i][k + 1], ring[j][k + 1], ring[j][k]))
            f.material_index = 1 if k in (2, 3) else 0
            f.smooth = False
    top = bm.faces.new([ring[i][0] for i in range(n)])
    top.material_index = 0
    bot = bm.faces.new([ring[i][-1] for i in reversed(range(n))])
    bot.material_index = 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link('plinth', bm, PLINTH)
    ob.data.materials.append(TRIM)
    return ob


base = merge([side_wall(), plinth()], 'GreenBase')


def water():
    bm = bmesh.new()
    n = 160
    vs = []
    for i in range(n):
        x, z = outline_point(2 * math.pi * i / n, 0.0015)
        vs.append(bm.verts.new(P(x, WATER_Y, z)))
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f])
    ob = link('water', bm, WATER)
    # The resin side where the sea reaches the edge.
    bm = bmesh.new()
    cols = []
    for co in coords:
        top = WATER_Y
        if co.z < WATER_Y - 0.0005:
            cols.append((bm.verts.new((co.x * 1.0005, co.y * 1.0005, co.z)), bm.verts.new((co.x * 1.0005, co.y * 1.0005, top))))
        else:
            cols.append(None)
    for i in range(len(coords)):
        a, b = cols[i], cols[(i + 1) % len(coords)]
        if a and b:
            bm.faces.new((a[0], b[0], b[1], a[1]))
    side = link('waterside', bm, WSIDE)
    return merge([ob, side], 'GreenWater')


GreenWater = water()

# ---------- roads ----------

def catmull(pts, per=8):
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    out.append(pts[-1])
    return out


def strip(name, pts, w, mat_, lift=0.0016, deck=None):
    """A ribbon draped over the terrain (deck: minimum height, e.g. a bridge over the river)."""
    bm = bmesh.new()
    rows = []
    for i, (x, z) in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, tz) or 1
        nx, nz = -tz / L, tx / L
        row = []
        for s in (-1, 0, 1):
            px, pz = x + nx * w / 2 * s, z + nz * w / 2 * s
            y = height(px, pz)
            if deck is not None:
                y = max(y, deck)
            row.append(bm.verts.new(P(px, y + lift, pz)))
        rows.append(row)
    for i in range(len(rows) - 1):
        for k in range(2):
            bm.faces.new((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    ob = link(name, bm, mat_)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def dense(pts, step=0.008):
    out = [pts[0]]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(1, n + 1):
            out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out


roads = []
ROAD_W = catmull([(-0.065, 0.105), (-0.14, 0.062), (-0.26, 0.035), (-0.345, -0.03), (-0.37, -0.1), (-0.33, -0.15)], 10)
ROAD_N = catmull([(0.075, -0.035), (0.075, -0.13), (0.06, -0.19), (0.02, -0.225)], 10)
ROAD_E = catmull([(0.28, 0.105), (0.3, 0.17), (0.302, 0.25)], 10)
roads.append(strip('roadW', dense(ROAD_W), 0.013, ROAD))
roads.append(strip('roadN', dense(ROAD_N), 0.012, ROAD, deck=TOWN_Y))
roads.append(strip('roadE', dense(ROAD_E), 0.012, ROAD))
STREETS = [
    [(-0.065, 0.105), (0.28, 0.105)], [(-0.06, 0.225), (0.28, 0.225)],
    [(0.075, -0.035), (0.075, 0.345)], [(0.18, -0.035), (0.18, 0.34)],
    [(-0.055, -0.035), (0.27, -0.035)],
]
for s in STREETS:
    roads.append(strip('street', dense(s), 0.011, ROAD, lift=0.0012 if s[0][1] == s[1][1] else 0.0017))
# Market square in the middle block.
roads.append(tbox('plaza', (0.1275, TOWN_Y + 0.0008, 0.165), (0.082, 0.0016, 0.096), PLAZA))
# The bridge: stone side walls and an arch under the deck where the north road crosses the river.
bz = -0.085
for sx in (-1, 1):
    roads.append(tbox('parapet', (0.075 + sx * 0.0068, TOWN_Y + 0.0035, bz), (0.0018, 0.004, 0.044), STONE))
roads.append(tbox('arch', (0.075, TOWN_Y - 0.004, bz), (0.0135, 0.008, 0.04), STONE))
roads = merge(roads, 'GreenRoads')
for p in roads.data.polygons:
    p.use_smooth = False


def near_road(x, z, m):
    for line in (ROAD_W, ROAD_N, ROAD_E) + tuple(STREETS):
        pts = dense(line, 0.01)
        for (ax, az) in pts:
            if abs(ax - x) < m and abs(az - z) < m and math.hypot(ax - x, az - z) < m:
                return True
    return False


# ---------- fields ----------

def field_patch(cx, cz, w, d, rot, mat_, rows, along_u=True):
    bm = bmesh.new()
    cr, sr = math.cos(rot), math.sin(rot)
    nu, nv = (6, rows * 4) if along_u else (rows * 4, 6)
    grid = []
    for i in range(nu + 1):
        row = []
        for j in range(nv + 1):
            u = (i / nu - 0.5) * w
            v = (j / nv - 0.5) * d
            x = cx + u * cr - v * sr
            z = cz + u * sr + v * cr
            ridge = 0.0022 * abs(math.sin((j / nv if along_u else i / nu) * rows * math.pi))
            row.append(bm.verts.new(P(x, height(x, z) + 0.0012 + ridge, z)))
        grid.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    ob = link('field', bm, mat_)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


fields = []
FROT = 0.12
cw, cdp = 0.07, 0.058
cr, sr = math.cos(FROT), math.sin(FROT)
for i in range(-8, 9):
    for j in range(-6, 7):
        cx = -0.29 + i * cw * cr - j * cdp * sr
        cz = 0.21 + i * cw * sr + j * cdp * cr
        if not (FIELDS[0] < cx < FIELDS[1] and FIELDS[2] - 0.02 < cz < FIELDS[3]):
            continue
        ok = all(inside(cx + dx, cz + dz, 0.03) for dx in (-0.04, 0.04) for dz in (-0.035, 0.035))
        if not ok or plot_near(cx, cz, 0.036) or near_road(cx, cz, 0.036) or hill_at(cx, cz) > 0.025 or river_dist(cx, cz)[0] < 0.05:
            continue
        m_ = rnd.choice([FIELD1, FIELD1, FIELD2, FIELD2, FIELD3])
        fields.append(field_patch(cx, cz, cw - 0.007, cdp - 0.007, FROT, m_, rnd.randint(5, 8), rnd.random() < 0.6))
print('fields', len(fields))
fields = merge(fields, 'GreenFields')

# ---------- buildings ----------

def gable(name, cx, y0, cz, w, d, h, rh, wall, roof, rot=0.0, windows=True, chimney=True):
    """A house: walls, a gable roof with overhang (ridge along x before rotation), windows."""
    parts = [tbox(name, (0, y0 + h / 2, 0), (w, h, d), wall)]
    bm = bmesh.new()
    ov = 0.0018
    x0, x1 = -w / 2 - ov, w / 2 + ov
    z0, z1 = -d / 2 - ov, d / 2 + ov
    th = 0.0014
    v = [bm.verts.new(P(x, y, z)) for x, y, z in (
        (x0, y0 + h - 0.0006, z0), (x1, y0 + h - 0.0006, z0), (x1, y0 + h + rh, 0), (x0, y0 + h + rh, 0),
        (x0, y0 + h - 0.0006, z1), (x1, y0 + h - 0.0006, z1))]
    vt = [bm.verts.new(P(x, y + th, z)) for x, y, z in (
        (x0, y0 + h - 0.0006, z0), (x1, y0 + h - 0.0006, z0), (x1, y0 + h + rh, 0), (x0, y0 + h + rh, 0),
        (x0, y0 + h - 0.0006, z1), (x1, y0 + h - 0.0006, z1))]
    for a, b, c, dd in ((0, 1, 2, 3), (3, 2, 5, 4)):
        bm.faces.new((vt[a], vt[b], vt[c], vt[dd]))
        bm.faces.new((v[dd], v[c], v[b], v[a]))
    bm.faces.new((v[0], v[1], vt[1], vt[0]))
    bm.faces.new((v[5], v[4], vt[4], vt[5]))
    bm.faces.new((v[0], vt[0], vt[3], v[3]))
    bm.faces.new((v[3], vt[3], vt[4], v[4]))
    bm.faces.new((v[1], v[2], vt[2], vt[1]))
    bm.faces.new((v[2], v[5], vt[5], vt[2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts.append(link('roof', bm, roof))
    # Gable triangles (wall color).
    bm = bmesh.new()
    for xx in (-w / 2, w / 2):
        a = bm.verts.new(P(xx, y0 + h, -d / 2))
        b = bm.verts.new(P(xx, y0 + h, d / 2))
        c = bm.verts.new(P(xx, y0 + h + rh - 0.0005, 0))
        bm.faces.new((a, b, c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts.append(link('gable', bm, wall))
    if windows:
        floors = max(1, int(h / 0.008))
        nwin = max(1, int(w / 0.0075))
        for fl in range(floors):
            wy = y0 + 0.004 + fl * (h - 0.004) / floors + 0.002
            for k in range(nwin):
                wx = -w / 2 + (k + 0.5) * w / nwin
                for sz in (-1, 1):
                    parts.append(tbox('win', (wx, wy, sz * (d / 2 + 0.0003)), (0.0032, 0.0042, 0.0008), WINDOW))
    if chimney and rnd.random() < 0.6:
        parts.append(tbox('chim', (w * 0.25, y0 + h + rh * 0.75, -d * 0.18), (0.003, 0.008, 0.003), ROOF2))
    m = Matrix.Translation(P(cx, 0, cz)) @ Matrix.Rotation(rot, 4, 'Z')
    for ob in parts:
        ob.matrix_world = m @ ob.matrix_world
    return parts


def flat_block(cx, y0, cz, w, d, h, wall, rot=0.0, roof=ROOF3):
    parts = [tbox('blk', (0, y0 + h / 2, 0), (w, h, d), wall), tbox('par', (0, y0 + h + 0.0008, 0), (w + 0.001, 0.0016, d + 0.001), roof)]
    floors = max(1, int(h / 0.0075))
    nwin = max(1, int(w / 0.0065))
    for fl in range(floors):
        wy = y0 + 0.0035 + fl * (h - 0.003) / floors + 0.0015
        for k in range(nwin):
            wx = -w / 2 + (k + 0.5) * w / nwin
            for sz in (-1, 1):
                parts.append(tbox('win', (wx, wy, sz * (d / 2 + 0.0003)), (0.0034, 0.0038, 0.0008), WINDOW))
    m = Matrix.Translation(P(cx, 0, cz)) @ Matrix.Rotation(rot, 4, 'Z')
    for ob in parts:
        ob.matrix_world = m @ ob.matrix_world
    return parts


def pine(x, z, s=1.0, y=None):
    y0 = height(x, z) if y is None else y
    parts = [tcyl('trunk', (x, y0 + 0.003 * s, z), 0.0016 * s, 0.006 * s, TRUNK, segs=6)]
    for k, (r, hh, yy) in enumerate(((0.0095, 0.016, 0.005), (0.0075, 0.014, 0.012), (0.0052, 0.012, 0.019))):
        parts.append(tcyl('tier', (x, y0 + (yy + hh / 2) * s, z), r * s, hh * s, PINE, segs=9, r2=0.0004))
    return parts


def round_tree(x, z, s=1.0, y=None, leaf=None):
    y0 = height(x, z) if y is None else y
    parts = [tcyl('trunk', (x, y0 + 0.004 * s, z), 0.0014 * s, 0.008 * s, TRUNK, segs=6)]
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.0085 * s)
    for v in bm.verts:
        v.co *= 1 + 0.12 * (rnd.random() - 0.5)
        v.co.z *= 0.92
    bmesh.ops.translate(bm, vec=P(x, y0 + 0.0135 * s, z), verts=bm.verts)
    ob = link('crown', bm, leaf or rnd.choice([LEAF, LEAF, LEAF2]))
    for p in ob.data.polygons:
        p.use_smooth = True
    parts.append(ob)
    return parts


town = []
WALLS = [WALL1, WALL2, WALL3, WALL4]
ROOFS = [ROOF1, ROOF1, ROOF2, ROOF3]
houses = []  # (x0, x1, z0, z1) footprints taken


def free_rect(x, z, w, d, margin=0.0025):
    for (a0, a1, b0, b1) in houses:
        if x - w / 2 - margin < a1 and x + w / 2 + margin > a0 and z - d / 2 - margin < b1 and z + d / 2 + margin > b0:
            return False
    for pid, area, px, pz in PLOTS:
        s = PAD[area] / 2 + 0.004
        if abs(x - px) < s + w / 2 and abs(z - pz) < s + d / 2:
            return False
    return True


def street_clear(x, z, w, d):
    for (ax, az), (bx, bz) in [(s[0], s[1]) for s in STREETS]:
        if ax == bx:  # north-south street
            if abs(x - ax) < w / 2 + 0.0075 and min(az, bz) - 0.01 < z < max(az, bz) + 0.01:
                return False
        else:
            if abs(z - az) < d / 2 + 0.0075 and min(ax, bx) - 0.01 < x < max(ax, bx) + 0.01:
                return False
    return True


# Blocks of the town (between the streets) and which side faces a street.
BLOCKS = [(-0.06, 0.068, -0.028, 0.098, 'river'), (0.082, 0.173, -0.028, 0.098, 'river'), (0.187, 0.28, -0.028, 0.098, 'new'),
          (-0.06, 0.068, 0.112, 0.218, 'old'), (0.187, 0.28, 0.112, 0.218, 'new'),
          (-0.06, 0.068, 0.232, 0.34, 'old'), (0.082, 0.173, 0.232, 0.34, 'old'), (0.187, 0.28, 0.232, 0.33, 'new')]
for (x0, x1, z0, z1, kind) in BLOCKS:
    tries = 0
    for gx in [x0 + 0.012 + k * 0.023 for k in range(7)]:
        for gz in [z0 + 0.013 + k * 0.025 for k in range(6)]:
            w = rnd.uniform(0.016, 0.021)
            d = rnd.uniform(0.017, 0.022)
            x = gx + rnd.uniform(-0.002, 0.002)
            z = gz + rnd.uniform(-0.002, 0.002)
            if not (x0 + w / 2 - 0.002 < x < x1 - w / 2 + 0.002 and z0 + d / 2 - 0.002 < z < z1 - d / 2 + 0.002):
                continue
            if not inside(x, z, 0.03) or coast_x(z) - x < 0.02 or not free_rect(x, z, w, d) or not street_clear(x, z, w, d):
                continue
            houses.append((x - w / 2, x + w / 2, z - d / 2, z + d / 2))
            if kind == 'new' and rnd.random() < 0.6:
                town += flat_block(x, TOWN_Y, z, w, d, rnd.uniform(0.016, 0.024), rnd.choice([WALL1, WALL3]), rot=0)
            else:
                rot = 0 if rnd.random() < 0.7 else math.pi / 2
                ww, dd = (w, d) if rot == 0 else (d, w)
                town += gable('house', x, TOWN_Y, z, ww, dd, rnd.uniform(0.012, 0.019), rnd.uniform(0.008, 0.012), rnd.choice(WALLS), rnd.choice(ROOFS), rot=rot)
print('houses', len(houses))

# Town hall with a clock tower on the north side of the market square, the market around the tree.
MX, MZ = 0.1275, 0.165
town += gable('hall', MX, TOWN_Y, MZ - 0.032, 0.05, 0.024, 0.022, 0.012, WALL2, ROOF1, windows=True, chimney=False)
town.append(tbox('tower', (MX, TOWN_Y + 0.025, MZ - 0.032), (0.012, 0.05, 0.012), WALL1))
town.append(tcyl('spire', (MX, TOWN_Y + 0.058, MZ - 0.032), 0.0095, 0.018, ROOF3, segs=4, r2=0.0005, rot=Matrix.Rotation(math.pi / 4, 3, 'Z')))
for sz in (-1, 1):
    town.append(tcyl('clock', (MX, TOWN_Y + 0.041, MZ - 0.032 + sz * 0.0062), 0.0035, 0.0008, LAMP, axis='z', segs=16))
XMAS = (MX, MZ + 0.012)
town += pine(XMAS[0], XMAS[1], 1.25, y=TOWN_Y + 0.0016)
town.append(tcyl('star', (XMAS[0], TOWN_Y + 0.0016 + 0.0385, XMAS[1]), 0.0028, 0.002, STAR, axis='z', segs=5))
for k, (sx, sz) in enumerate(((-0.03, 0.035), (0.0, 0.04), (0.03, 0.035), (-0.03, -0.005), (0.03, -0.005))):
    x, z = MX + sx, MZ + sz
    town.append(tbox('stall', (x, TOWN_Y + 0.0045, z), (0.014, 0.008, 0.009), WOOD))
    town.append(tcyl('stallroof', (x, TOWN_Y + 0.0105, z), 0.0095, 0.006, STALL if k % 2 == 0 else LINE, segs=4, r2=0.001, rot=Matrix.Rotation(math.pi / 4, 3, 'Z')))
    houses.append((x - 0.009, x + 0.009, z - 0.007, z + 0.007))

# Lighthouse on the beach (front right) and a little pier.
LX, LZ = 0.305, 0.3
ly = height(LX, LZ)
for k in range(5):
    town.append(tcyl('lh', (LX, ly + 0.006 + k * 0.009, LZ), 0.0085 - k * 0.0009, 0.009, LHRED if k % 2 == 0 else LINE, segs=16, r2=0.0085 - (k + 1) * 0.0009))
town.append(tcyl('lamp', (LX, ly + 0.0505, LZ), 0.0045, 0.006, LAMP, segs=12))
town.append(tcyl('lhroof', (LX, ly + 0.0575, LZ), 0.006, 0.008, LHRED, segs=12, r2=0.0005))
town.append(tcyl('lhbase', (LX, ly + 0.0015, LZ), 0.012, 0.003, STONE, segs=16))
for k in range(9):
    town.append(tbox('pier', (0.335 + k * 0.0075, WATER_Y + 0.004, 0.245), (0.0072, 0.0016, 0.012), WOOD))
    town.append(tcyl('post', (0.335 + k * 0.0075, WATER_Y - 0.004, 0.2385), 0.0008, 0.014, WOOD, segs=5))
    town.append(tcyl('post', (0.335 + k * 0.0075, WATER_Y - 0.004, 0.2515), 0.0008, 0.014, WOOD, segs=5))
# Farms by the fields and a barn.
for (x, z, rot) in ((-0.13, 0.215, 0.12), (-0.455, 0.105, 0.3)):
    if inside(x, z, 0.03) and not plot_near(x, z, 0.02):
        town += gable('farm', x, height(x, z), z, 0.026, 0.018, 0.012, 0.01, WALL1, ROOF1, rot=rot)
        town += gable('barn', x + 0.024, height(x + 0.024, z + 0.012), z + 0.012, 0.016, 0.022, 0.012, 0.009, WOOD, ROOF2, rot=rot, windows=False, chimney=False)
town = merge(town, 'GreenTown')
for p in town.data.polygons:
    p.use_smooth = False

# ---------- trees ----------

trees = []
spots = []


def can_plant(x, z, gap):
    if not inside(x, z, 0.02) or plot_near(x, z, 0.01) or coast_x(z) - x < 0.015:
        return False
    if near_road(x, z, 0.012):
        return False
    if river_dist(x, z)[0] < 0.024:
        return False
    if FIELDS[0] < x < FIELDS[1] and FIELDS[2] < z < FIELDS[3] and hill_at(x, z) < 0.03:
        return False
    for (a0, a1, b0, b1) in houses:
        if a0 - 0.006 < x < a1 + 0.006 and b0 - 0.006 < z < b1 + 0.006:
            return False
    for (sx, sz) in spots:
        if (sx - x) ** 2 + (sz - z) ** 2 < gap * gap:
            return False
    return True


for _ in range(5000):
    x, z = rnd.uniform(-0.5, 0.35), rnd.uniform(-0.37, 0.37)
    hill = hill_at(x, z)
    if hill > 0.022 and rnd.random() < 0.85 and can_plant(x, z, 0.019):
        spots.append((x, z))
        trees += pine(x, z, rnd.uniform(0.8, 1.15))
    if len(spots) > 95:
        break
river_trees = 0
for _ in range(3000):
    x, z = rnd.uniform(-0.3, 0.3), rnd.uniform(-0.37, 0.05)
    d, _a = river_dist(x, z)
    if 0.026 < d < 0.045 and in_box(TOWN, x, z, 0) < 0.5 and can_plant(x, z, 0.022):
        spots.append((x, z))
        trees += round_tree(x, z, rnd.uniform(0.85, 1.15))
        river_trees += 1
    if river_trees > 22:
        break
# Hedgerow trees along the country road and around the fields; a few trees in town.
for (x, z) in [(-0.47, 0.06), (-0.33, 0.33), (-0.17, 0.33), (-0.12, 0.27), (-0.08, 0.15), (-0.08, 0.03), (-0.2, -0.0),
               (-0.29, -0.03), (0.03, 0.105), (0.05, 0.31), (0.16, 0.31), (0.21, 0.12), (0.265, 0.02), (0.14, 0.12), (0.14, 0.215),
               (-0.04, 0.33), (0.29, 0.06), (-0.05, -0.15), (0.12, -0.15), (0.2, -0.13), (0.3, -0.08)]:
    if can_plant(x, z, 0.016):
        spots.append((x, z))
        trees += round_tree(x, z, rnd.uniform(0.8, 1.05))
print('trees', len(spots))
trees = merge(trees, 'GreenTrees')

# ---------- plot markers and other anchors ----------

for pid, area, px, pz in PLOTS:
    e = bpy.data.objects.new(f'Plot_{pid}', None)
    e.location = P(px, PAD_Y[pid] + 0.0005, pz)
    bpy.context.scene.collection.objects.link(e)
e = bpy.data.objects.new('XmasTree', None)
e.location = P(XMAS[0], TOWN_Y + 0.0016, XMAS[1])
bpy.context.scene.collection.objects.link(e)
e = bpy.data.objects.new('LighthouseLamp', None)
e.location = P(LX, ly + 0.0505, LZ)
bpy.context.scene.collection.objects.link(e)

# ---------- projects (clone sources at the origin) ----------

HUB_Y = 0.104
HUB_Z = 0.0105


def turbine():
    p = [tcyl('found', (0, 0.0015, 0), 0.011, 0.003, CONC, segs=20)]
    p.append(tcyl('tower', (0, 0.003 + (HUB_Y - 0.003) / 2, 0), 0.0042, HUB_Y - 0.003, TURB, segs=16, r2=0.0024))
    p.append(tcyl('door', (0, 0.0065, 0.0038), 0.0012, 0.004, WINDOW, axis='z', segs=8))
    bm = bmesh.new()
    nac = blob('nac', (0, HUB_Y + 0.0006, -0.002), 0.0062, TURB, s=(0.75, 0.68, 1.85), segs=16, rings=10)
    p.append(nac)
    p.append(tbox('stripe', (0, HUB_Y + 0.0006, -0.002), (0.0094, 0.0012, 0.018), MARK))
    return merge(p, 'GreenTurbine')


def rotor():
    p = [blob('spinner', (0, 0, 0.002), 0.0042, TURB, s=(1, 1, 1.5), segs=16, rings=10)]
    for k in range(3):
        a = k * 2 * math.pi / 3
        bm = bmesh.new()
        # A tapered, slightly twisted blade along +y, then turned.
        L = 0.046
        sec = []
        for i in range(9):
            t = i / 8
            r = 0.003 + t * L
            chord = 0.0055 * (1 - t) ** 0.7 + 0.0012 if t > 0.12 else 0.0045 + t * 0.008
            tw = 0.35 * (1 - t)
            th = 0.0012 * (1 - t) + 0.0004
            pts = [(-chord * 0.3, -th), (chord * 0.7, 0), (-chord * 0.3, th)]
            ring = []
            for (cx, cz) in pts:
                x = cx * math.cos(tw) - cz * math.sin(tw)
                z = cx * math.sin(tw) + cz * math.cos(tw)
                ring.append(bm.verts.new(P(x, r, z)))
            sec.append(ring)
        for i in range(8):
            for j in range(3):
                bm.faces.new((sec[i][j], sec[i][(j + 1) % 3], sec[i + 1][(j + 1) % 3], sec[i + 1][j]))
        bm.faces.new(list(reversed(sec[0])))
        bm.faces.new(sec[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bl = link('blade', bm, TURB)
        # Red tip marks (aviation).
        tip = tbox('tip', (0, 0.003 + L * 0.93, 0), (0.0026, L * 0.12, 0.0022), MARK)
        for ob in (bl, tip):
            ob.matrix_world = Matrix.Rotation(-a, 4, 'Y') @ ob.matrix_world
        p += [bl, tip]
    ob = merge(p, 'GreenRotor')
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def solar():
    p = [tbox('gravel', (0, 0.0006, 0), (0.074, 0.0012, 0.074), CONC)]
    for r in range(4):
        z = -0.027 + r * 0.018
        tilt = math.radians(28)  # facing south (+z) and up
        p.append(tbox('panel', (0, 0.0062, z), (0.064, 0.0012, 0.0135), CELL, rot=Matrix.Rotation(tilt, 3, 'X')))
        p.append(tbox('frame', (0, 0.0055, z), (0.0655, 0.0008, 0.0145), FRAME, rot=Matrix.Rotation(tilt, 3, 'X')))
        for k in range(5):
            x = -0.026 + k * 0.013
            p.append(tbox('post', (x, 0.0028, z - 0.003), (0.0012, 0.0045, 0.0012), FRAME))
            p.append(tbox('post', (x, 0.0042, z + 0.003), (0.0012, 0.0072, 0.0012), FRAME))
        # Cell lines across the panel.
        for k in range(1, 8):
            x = -0.032 + k * 0.008
            p.append(tbox('cl', (x, 0.0069, z), (0.0005, 0.0003, 0.013), FRAME, rot=Matrix.Rotation(tilt, 3, 'X')))
    p.append(tbox('inv', (0.03, 0.004, 0.033), (0.008, 0.008, 0.006), CONC))
    return merge(p, 'GreenSolar')


def school():
    p = []
    p += flat_block(-0.008, 0.0, -0.014, 0.05, 0.022, 0.022, SWALL)
    p += flat_block(0.024, 0.0, 0.006, 0.016, 0.03, 0.016, SWALL)
    p.append(tbox('band', (-0.008, 0.0215, -0.014), (0.0505, 0.003, 0.0225), SACC))
    p.append(tbox('band2', (0.024, 0.0155, 0.006), (0.0165, 0.003, 0.0305), SACC))
    p.append(tbox('entry', (-0.008, 0.006, -0.0015), (0.012, 0.0012, 0.006), SACC))
    p.append(tbox('door', (-0.008, 0.0028, -0.0028), (0.006, 0.0056, 0.0008), WINDOW))
    # Solar panels on the roof (a green school).
    for k in range(4):
        p.append(tbox('rpv', (-0.026 + k * 0.012, 0.0245, -0.014), (0.01, 0.001, 0.014), CELL, rot=Matrix.Rotation(0.35, 3, 'X')))
    # Schoolyard with a sports court and two goals.
    p.append(tbox('court', (-0.01, 0.0006, 0.017), (0.036, 0.0012, 0.022), COURT))
    for (cx, cz, w, d) in ((-0.01, 0.017, 0.032, 0.0006), (-0.01, 0.0065, 0.032, 0.0006), (-0.01, 0.0275, 0.032, 0.0006)):
        p.append(tbox('ln', (cx, 0.0013, cz), (w, 0.0004, d), LINE))
    for sx in (-1, 1):
        p.append(tbox('ln', (-0.01 + sx * 0.016, 0.0013, 0.017), (0.0006, 0.0004, 0.021), LINE))
        p.append(tbox('goal', (-0.01 + sx * 0.0172, 0.003, 0.017), (0.0008, 0.0045, 0.008), LINE))
    p.append(tcyl('flagpole', (0.028, 0.012, -0.024), 0.0005, 0.024, FRAME, segs=6))
    p += round_tree(0.026, 0.027, 0.8, y=0.0)
    return merge(p, 'GreenSchool')


def kita():
    p = gable('kita', -0.006, 0.0, -0.01, 0.038, 0.022, 0.012, 0.011, KITA3, KITA1, chimney=False)
    p.append(tbox('panel1', (-0.018, 0.006, 0.0012), (0.008, 0.009, 0.0008), KITA2))
    p.append(tbox('panel2', (0.008, 0.006, 0.0012), (0.008, 0.009, 0.0008), KITA1))
    p.append(tbox('door', (-0.005, 0.0035, 0.0012), (0.006, 0.007, 0.001), WOOD))
    # Playground: sandbox, slide, swing, a little fence.
    p.append(tbox('sandbox', (-0.018, 0.0012, 0.018), (0.014, 0.0024, 0.012), WOOD))
    p.append(tbox('sand', (-0.018, 0.0022, 0.018), (0.012, 0.0008, 0.010), SAND))
    p.append(tbox('slidetop', (0.008, 0.008, 0.016), (0.008, 0.0015, 0.008), KITA2))
    for sx in (-1, 1):
        for sz in (-1, 1):
            p.append(tbox('leg', (0.008 + sx * 0.0035, 0.004, 0.016 + sz * 0.0035), (0.0009, 0.008, 0.0009), KITA3))
    p.append(tbox('slide', (0.008, 0.0045, 0.0255), (0.005, 0.0012, 0.013), KITA1, rot=Matrix.Rotation(0.6, 3, 'X')))
    for sx in (-1, 1):
        p.append(tbox('swingleg', (0.021 + sx * 0.006, 0.0055, 0.008), (0.001, 0.011, 0.001), WOOD))
    p.append(tbox('swingbar', (0.021, 0.0108, 0.008), (0.014, 0.001, 0.001), WOOD))
    p.append(tbox('seat', (0.021, 0.0035, 0.008), (0.004, 0.0008, 0.002), KITA1))
    for k in range(13):
        x = -0.03 + k * 0.005
        p.append(tbox('fence', (x, 0.0022, 0.031), (0.0009, 0.0044, 0.0009), WOOD))
    p.append(tbox('rail', (0.0, 0.0035, 0.031), (0.062, 0.0008, 0.0008), WOOD))
    return merge(p, 'GreenKita')


def homes():
    p = []
    for (x, z, rot) in ((-0.014, -0.004, math.pi / 2), (0.016, -0.004, math.pi / 2)):
        p += gable('apt', x, 0.0, z, 0.048, 0.022, 0.03, 0.011, HWALL, ROOF1, rot=rot, chimney=False)
        for fl in range(1, 3):
            p.append(tbox('balc', (x + 0.0118, fl * 0.0095 + 0.003, z), (0.0035, 0.0012, 0.04), WOOD))
    p.append(tbox('path', (0.001, 0.0006, 0.026), (0.012, 0.0012, 0.012), PLAZA))
    p += round_tree(0.0, -0.028, 0.75, y=0.0)
    p += round_tree(0.025, 0.026, 0.7, y=0.0)
    return merge(p, 'GreenHomes')


def cloud():
    p = []
    for (x, y, z, r) in ((0, 0, 0, 0.026), (0.03, -0.006, 0.004, 0.02), (-0.028, -0.006, -0.003, 0.019), (0.012, 0.012, -0.004, 0.019), (-0.012, 0.009, 0.006, 0.017), (0.046, -0.01, -0.006, 0.013), (-0.044, -0.011, 0.004, 0.012)):
        p.append(blob('puff', (x, y, z), r, CLOUD, s=(1, 0.78, 0.9), segs=14, rings=9))
    ob = merge(p, 'GreenCloud')
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def boat():
    p = [blob('hull', (0, 0.002, 0), 0.006, BOAT, s=(2.2, 0.55, 0.8), segs=14, rings=8)]
    p.append(tcyl('mast', (0.002, 0.012, 0), 0.0005, 0.02, WOOD, segs=5))
    bm = bmesh.new()
    a, b, c = bm.verts.new(P(0.0025, 0.004, 0)), bm.verts.new(P(0.0025, 0.021, 0)), bm.verts.new(P(-0.009, 0.005, 0))
    bm.faces.new((a, b, c))
    p.append(link('sail', bm, SAIL))
    return merge(p, 'GreenBoat')


projects = [turbine(), rotor(), solar(), school(), kita(), homes(), cloud(), boat()]
hub = bpy.data.objects.new('RotorHub', None)
hub.location = P(0, HUB_Y + 0.0006, HUB_Z)
bpy.context.scene.collection.objects.link(hub)

# ---------- ambient occlusion into the vertex colors ----------

def bake(assets, occluders, distance, samples):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    if not sc.world:
        sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = distance
    meshes = [o for o in sc.objects if o.type == 'MESH']
    for ob, dens in assets:
        densify(ob, dens)
    for ob, _ in assets:
        occ = occluders.get(ob.name, [])
        for o in meshes:
            o.hide_render = not (o is ob or o in occ)
        me = ob.data
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        glow_idx = {i for i, m in enumerate(me.materials) if m.name in GLOWS}
        bright = set()
        for poly in me.polygons:
            if poly.material_index in glow_idx:
                bright.update(poly.vertices)
        lo = 0.82 if ob.name == 'GreenRoads' else 0.3
        for i, d in enumerate(me.color_attributes['Col'].data):
            v = 1.0 if i in bright else lo + (1 - lo) * d.color[0]
            d.color = (v, v, v, 1)
    for o in meshes:
        o.hide_render = False


ASSETS = [(ground, 0.03), (base, 0.05), (fields, 0.03), (roads, 0.03), (town, 0.02), (trees, 0.03)] + [(o, 0.02) for o in projects]
OCC = {'GreenGround': [town, trees, fields, roads], 'GreenFields': [trees, town], 'GreenRoads': [town, trees], 'GreenTown': [ground, roads], 'GreenTrees': [ground]}
bake(ASSETS, OCC, 0.025, int(os.environ.get('GREEN_AO', '48')))
# The water and the hit proxy get plain white vertex colors.
for o in (GreenWater, hit):
    ca = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for d in ca.data:
        d.color = (1, 1, 1, 1)
    o.data.color_attributes.active_color = ca
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        print('mesh', o.name, len(o.data.polygons))
export(OUT_GLB, OUT_BLEND)
print('EXPORTED')

# ---------- preview renders and the coin picture ----------

def setup_render(res, samples):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.world.use_nodes = True
    return sc


def place(name, pid, rot=0.0):
    src = bpy.data.objects[name]
    ob = src.copy()
    bpy.context.scene.collection.objects.link(ob)
    x, z = [(px, pz) for (p_, a, px, pz) in PLOTS if p_ == pid][0]
    ob.matrix_world = Matrix.Translation(P(x, PAD_Y[pid], z)) @ Matrix.Rotation(rot, 4, 'Z')
    return ob


def add_light():
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.angle = 0.12
    sun.rotation_euler = (math.radians(50), math.radians(-25), math.radians(35))
    bpy.context.scene.collection.objects.link(sun)
    return sun


def look(cam, pos, target):
    cam.location = P(*pos)
    cam.rotation_euler = (P(*target) - cam.location).to_track_quat('-Z', 'Y').to_euler()


if PREVIEW or COIN:
    for o in (hit,):
        o.hide_render = True
    for o in projects:
        o.hide_render = True
    hub.hide_render = True
    for pid in ('L1', 'L4', 'L2'):
        t = place('GreenTurbine', pid)
        r = place('GreenRotor', pid)
        r.matrix_world = t.matrix_world @ Matrix.Translation(P(0, HUB_Y + 0.0006, HUB_Z)) @ Matrix.Rotation(0.4, 4, 'Y')
    for pid in ('L6', 'L7', 'L8'):
        place('GreenSolar', pid)
    place('GreenSchool', 'T3')
    place('GreenKita', 'T1')
    place('GreenHomes', 'T6')
    for o in bpy.context.scene.objects:
        if o.name.startswith(('GreenTurbine.', 'GreenRotor.', 'GreenSolar.', 'GreenSchool.', 'GreenKita.', 'GreenHomes.')):
            o.hide_render = False
    add_light()
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

if PREVIEW:
    sc = setup_render((720, 480), int(os.environ.get('GREEN_SAMPLES', '12')))
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.36, 0.5, 1)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    cam.data.lens = 40
    for tag, pos, tgt in (('view', (0, 0.62, 0.95), (0, 0.0, 0.02)), ('top', (0, 1.4, 0.05), (0, 0, 0)), ('town', (0.12, 0.22, 0.38), (0.12, 0.0, 0.12)), ('hills', (-0.2, 0.3, 0.2), (-0.25, 0.04, -0.15))):
        look(cam, pos, tgt)
        sc.render.filepath = f'{PREVIEW}/green-{tag}.png'
        bpy.ops.render.render(write_still=True)

if COIN:
    sc = setup_render((512, 512), int(os.environ.get('GREEN_SAMPLES', '64')))
    # Rich background: a gradient sky from the token colors (deep teal to violet).
    nt = sc.world.node_tree
    bg = nt.nodes['Background']
    grad = nt.nodes.new('ShaderNodeTexGradient')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapn = nt.nodes.new('ShaderNodeMapping')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    mapn.inputs['Rotation'].default_value = (0, math.radians(90), 0)
    nt.links.new(coord.outputs['Generated'], mapn.inputs['Vector'])
    nt.links.new(mapn.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    ramp.color_ramp.elements[0].color = (0.05, 0.09, 0.22, 1)
    ramp.color_ramp.elements[1].color = (0.12, 0.42, 0.5, 1)
    bg.inputs['Strength'].default_value = 1.0
    cam.data.lens = 50
    look(cam, (-0.06, 0.42, 0.62), (-0.04, 0.02, -0.02))
    sc.render.filepath = COIN
    bpy.ops.render.render(write_still=True)
print('DONE')

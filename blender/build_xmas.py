# Christmas decoration for the menu (original design, cartoon style like the game coins):
#   XmasTree   a fir in a wooden tub: five scalloped tiers, a gold tinsel spiral, baubles in red,
#              blue and gold with caps, a glowing star on top and three presents under it.
#              Origin on the floor, about 1.65 tall (meters, three.js coordinates).
#   QuizTree   the same fir in its tub, still bare: the AI Quiz decorates it with every correct
#              answer (public/js/xmas-quiz-tree.js adds baubles with the Echomotion logo, candy
#              canes, bells, gingerbread, garland, fairy lights, presents and the star).
# The app adds twinkling fairy lights along a spiral; TIERS and envelope() here and in
# public/js/christmas.js must match.
# Materials: XmasNeedle, XmasNeedleTip, XmasTrunk, XmasTub, XmasGold, XmasRed, XmasBlue,
# XmasGreen, XmasRibbon, XmasStarGlow (light). Ambient occlusion in the vertex colors.
# Usage: blender -b -P build_xmas.py -- <out.glb> <out.blend>
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, merge, bake_ao, export, blob

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
init()
rnd = random.Random(24)

NEEDLE = material('XmasNeedle', (0.08, 0.42, 0.2), 0.0, 0.85)
TIP = material('XmasNeedleTip', (0.22, 0.62, 0.3), 0.0, 0.85)
TRUNK = material('XmasTrunk', (0.4, 0.25, 0.15), 0.0, 0.85)
TUB = material('XmasTub', (0.62, 0.38, 0.22), 0.0, 0.7)
GOLD = material('XmasGold', (1.0, 0.75, 0.25), 1.0, 0.25)
RED = material('XmasRed', (0.86, 0.08, 0.12), 0.3, 0.22)
BLUE = material('XmasBlue', (0.2, 0.45, 0.95), 0.3, 0.22)
GREEN = material('XmasGreen', (0.2, 0.7, 0.4), 0.0, 0.5)
RIBBON = material('XmasRibbon', (0.97, 0.97, 0.97), 0.0, 0.5)
STAR = material('XmasStarGlow', (0, 0, 0), emit=(1.0, 0.85, 0.35))

TIERS = [(0.30, 0.62), (0.52, 0.84), (0.74, 1.06), (0.96, 1.28), (1.16, 1.52)]


def envelope(y):
    return 0.6 * (1.55 - y) / 1.25


def tier_radius(y, yb, yt):
    k = (y - yb) / (yt - yb)
    return 1.06 * envelope(yb) * (1 - k) + 0.5 * envelope(yt) * k


def surface(y):
    r = 0.0
    for yb, yt in TIERS:
        if yb <= y <= yt:
            r = max(r, tier_radius(y, yb, yt))
    return r


ASSETS = []


def base_parts():
    """The fir in its tub without decorations: tub with a gold band, trunk and the five tiers."""
    p = []
    p.append(tcyl('tub', (0, 0.12, 0), 0.2, 0.24, TUB, segs=32, r2=0.16))
    p.append(ttorus('band', (0, 0.2, 0), 0.19, 0.014, GOLD, axis='y', segs=40, tsegs=8))
    p.append(ttorus('rim', (0, 0.24, 0), 0.2, 0.018, TUB, axis='y', segs=40, tsegs=8))
    p.append(tcyl('trunk', (0, 0.3, 0), 0.055, 0.14, TRUNK, segs=16))
    p.extend(tier(yb, yt) for yb, yt in TIERS)
    return p


# Tiers: scalloped skirts, the tips of the scallops a lighter green and drooping a little.
S = 64


def tier(yb, yt):
    bm = bmesh.new()
    rings = []
    for i, k in enumerate((0.0, 0.08, 0.3, 0.6, 1.0)):
        y = yb + (yt - yb) * k
        r = tier_radius(y, yb, yt)
        ring = []
        for j in range(S):
            a = 2 * math.pi * j / S
            sc = 0.08 * (1 - k) * math.sin(a * 11) if i < 3 else 0.0
            droop = -0.025 * max(0.0, math.sin(a * 11)) if i == 0 else 0.0
            ring.append(bm.verts.new(P(math.cos(a) * r * (1 + sc), y + droop, math.sin(a) * r * (1 + sc))))
        rings.append(ring)
    top = bm.verts.new(P(0, yt + 0.02, 0))
    bottom = bm.verts.new(P(0, yb + 0.04, 0))
    for i in range(len(rings) - 1):
        for j in range(S):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % S], rings[i + 1][(j + 1) % S], rings[i + 1][j]))
    for j in range(S):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % S], top))
        bm.faces.new((rings[0][(j + 1) % S], rings[0][j], bottom))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link('tier', bm, NEEDLE)
    ob.data.materials.append(TIP)
    for poly in ob.data.polygons:
        poly.use_smooth = True
        # The lowest band (scallop tips) in the lighter green.
        if poly.center.z < yb + (yt - yb) * 0.05:
            poly.material_index = 1
    return ob

p = base_parts()

# Gold tinsel spiral just outside the needles.
pts = []
for i in range(161):
    u = i / 160
    y = 0.4 + u * 1.0
    a = u * math.pi * 2 * 2.6
    r = surface(y) + 0.025
    pts.append(P(math.cos(a) * r, y, math.sin(a) * r))
bm = bmesh.new()
rings = []
for i, c in enumerate(pts):
    t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
    a1 = t.orthogonal().normalized()
    b1 = t.cross(a1).normalized()
    rings.append([bm.verts.new(c + (a1 * math.cos(2 * math.pi * k / 8) + b1 * math.sin(2 * math.pi * k / 8)) * 0.012) for k in range(8)])
for i in range(len(rings) - 1):
    for k in range(8):
        bm.faces.new((rings[i][k], rings[i][(k + 1) % 8], rings[i + 1][(k + 1) % 8], rings[i + 1][k]))
tinsel = link('tinsel', bm, GOLD)
for poly in tinsel.data.polygons:
    poly.use_smooth = True
p.append(tinsel)

# Baubles hanging just above each tier's rim, with gold caps.
mats = [RED, BLUE, GOLD]
n = 0
for ti, (yb, yt) in enumerate(TIERS):
    count = 7 - ti
    for k in range(count):
        a = 2 * math.pi * (k + 0.5 * (ti % 2)) / count + rnd.uniform(-0.15, 0.15)
        y = yb + 0.05
        rb = 0.045 - ti * 0.004
        r = tier_radius(y, yb, yt) * 0.97 + rb * 0.4
        c = (math.cos(a) * r, y - rb * 0.6, math.sin(a) * r)
        p.append(blob('bauble', c, rb, mats[n % 3], segs=16, rings=10))
        p.append(tcyl('cap', (c[0], c[1] + rb * 0.95, c[2]), rb * 0.32, rb * 0.3, GOLD, segs=10))
        n += 1

# Star on top: a puffy five-pointed star facing the front.
bm = bmesh.new()
front, back = [], []
for i in range(10):
    a = math.pi / 2 + i * math.pi / 5
    r = 0.12 if i % 2 == 0 else 0.05
    x, y = math.cos(a) * r, 1.6 + math.sin(a) * r
    front.append(bm.verts.new(P(x, y, 0.03)))
    back.append(bm.verts.new(P(x, y, -0.03)))
cf = bm.verts.new(P(0, 1.6, 0.05))
cb = bm.verts.new(P(0, 1.6, -0.05))
for i in range(10):
    j = (i + 1) % 10
    bm.faces.new((front[i], front[j], cf))
    bm.faces.new((back[j], back[i], cb))
    bm.faces.new((front[j], front[i], back[i], back[j]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
p.append(link('star', bm, STAR))
p.append(tcyl('starstem', (0, 1.5, 0), 0.015, 0.08, GOLD, segs=8))

# Presents under the tree: boxes with ribbons and a bow.
for (x, z, w, h, d, paper, band, rot) in ((0.33, 0.2, 0.2, 0.18, 0.2, RED, GOLD, 0.3), (-0.34, 0.16, 0.24, 0.14, 0.18, BLUE, RIBBON, -0.4), (0.04, 0.36, 0.16, 0.13, 0.16, GREEN, GOLD, 0.1)):
    rm = Matrix.Rotation(rot, 3, 'Z')  # three.js y axis = Blender Z
    q = [tbox('box', (0, h / 2, 0), (w, h, d), paper, bev=0.008)]
    q.append(tbox('band1', (0, h / 2, 0), (w + 0.006, h + 0.006, 0.03), band))
    q.append(tbox('band2', (0, h / 2, 0), (0.03, h + 0.006, d + 0.006), band))
    for sx in (-1, 1):
        q.append(ttorus('bow', (sx * 0.025, h + 0.02, 0), 0.025, 0.008, band, axis='z', segs=20, tsegs=6))
    for ob in q:
        ob.matrix_world = Matrix.Translation(P(x, 0, z)) @ rm.to_4x4() @ ob.matrix_world
    p.extend(q)

tree = merge(p, 'XmasTree')
for poly in tree.data.polygons:
    poly.use_smooth = True
ASSETS.append((tree, 0.12))

# The bare tree for the AI Quiz (baked on its own, so no baubles leave shadows on it).
quiz = merge(base_parts(), 'QuizTree')
for poly in quiz.data.polygons:
    poly.use_smooth = True
ASSETS.append((quiz, 0.12))
bake_ao(ASSETS, {'XmasStarGlow'}, distance=0.25, samples=64)
print('faces', len(tree.data.polygons))
export(OUT_GLB, OUT_BLEND)
print('DONE')

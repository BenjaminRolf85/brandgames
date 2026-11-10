# Builds the magic forest of Echo Parkour level 1 (original designs, playful cartoon look like the
# game's menu coin): floating grass islands with earth bodies, rocky undersides and glowing
# flowers, a floating island as the lift, a wooden signpost as the checkpoint, a mossy stone arch
# with a wreath as the goal, a stone base for the stage with trees at its edges, and round,
# cone and umbrella trees, bushes and clouds for the backdrop.
#   IslandCapA/B   top of a column (1 unit wide, y in [-0.46, 0], origin top center)
#   IslandBodyA/B  column body, 1 unit tall (y in [-1, 0]); stacked, never stretched much
#   IslandUnderA/B underside of a floating column (below a cap)
#   IslandLift     3-unit floating island (origin top center)
#   ForestGate     checkpoint signpost (origin bottom center; banner like the old Gate)
#   ForestFinish   goal arch with a wreath ring (LogoSpot empty for the Echomotion logo)
#   ForestBase     stage base segment (1 unit, stretched in x; y top = 0)
#   ForestEnd      tree at the stage edge (mirrored on the left by the app)
#   Tree1-3, Bush  backdrop plants (ForLeaf is tinted per instance); Cloud1-2
# Units as in build_parkour.py: 1 = one block, the track is DEPTH deep, three.js coordinates
# (Y up, Z towards the player). ForGlow parts are tinted by the app (zone, checkpoint, goal
# colors); ambient occlusion is baked into the vertex colors.
# Usage: blender -b -P build_forest.py -- <out.glb> <out.blend>
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, shard, merge, bake_ao, export, blob, cone, rrect, prism, rotate_parts

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
DEPTH = 1.8
D2 = DEPTH / 2
init()

GRASS = material('ForGrass', (0.27, 0.76, 0.35), 0.0, 0.7)
GRASSL = material('ForGrassLight', (0.56, 0.89, 0.44), 0.0, 0.7)
GRASSD = material('ForGrassDark', (0.14, 0.53, 0.29), 0.0, 0.75)
EARTH = material('ForEarth', (0.6, 0.39, 0.25), 0.0, 0.85)
EARTHD = material('ForEarthDark', (0.37, 0.23, 0.15), 0.0, 0.9)
ROCK = material('ForRock', (0.56, 0.59, 0.71), 0.0, 0.8)
STONE = material('ForStone', (0.23, 0.23, 0.39), 0.1, 0.7)
WOOD = material('ForWood', (0.37, 0.23, 0.15), 0.0, 0.8)
CLOTH = material('ForCloth', (0.49, 0.36, 1.0), 0.0, 0.8)
LEAF = material('ForLeaf', (0.9, 0.9, 0.9), 0.0, 0.6)
CANOPY = material('ForCanopy', (0.12, 0.71, 0.64), 0.0, 0.6)
CLOUD = material('ForCloud', (0.79, 0.72, 1.0), 0.0, 0.9)
GLOW = material('ForGlow', (0, 0, 0), emit=(1, 1, 1))
BONE = material('ForBone', (0.96, 0.92, 0.85), 0.0, 0.6)
SHROOM = material('ForMushroom', (1.0, 0.33, 0.44), 0.0, 0.5)
WORM = material('ForWorm', (1.0, 0.64, 0.69), 0.0, 0.5)
UFO = material('ForUfo', (0.79, 0.82, 0.89), 0.8, 0.25)
UFOGLOW = material('ForUfoGlow', (0, 0, 0), emit=(0.12, 0.96, 0.89))
ALIEN = material('ForAlien', (0.56, 0.89, 0.44), 0.0, 0.5)
GLASS = material('ForGlass', (0.35, 0.85, 1.0), 0.0, 0.05)
GOLD = material('ForGold', (1.0, 0.78, 0.36), 1.0, 0.25)
GOLDGLOW = material('ForGoldGlow', (0, 0, 0), emit=(1.0, 0.69, 0.18))
EAGLE = material('ForEagle', (0.6, 0.39, 0.25), 0.0, 0.7)
EAGLEDARK = material('ForEagleDark', (0.37, 0.23, 0.15), 0.0, 0.75)
BEAK = material('ForBeak', (1.0, 0.78, 0.36), 0.0, 0.5)
THORN = material('ForThorn', (0.76, 0.16, 0.27), 0.0, 0.5)

ASSETS = []


def asset(name, parts, dens=0.16):
    bpy.context.view_layer.update()
    ob = merge(parts, name)
    ASSETS.append((ob, dens))
    return ob










def blades(p, x, z, rnd, n=3, h=0.16, mat=GRASSL, y=0.0):
    """A tuft of grass blades standing on y."""
    for i in range(n):
        hh = h * rnd.uniform(0.75, 1.15)
        tilt = Matrix.Rotation(rnd.uniform(-0.35, 0.35), 3, 'X') @ Matrix.Rotation(rnd.uniform(-0.4, 0.4), 3, 'Y')
        p.append(tcyl('blade', (x + rnd.uniform(-0.04, 0.04), y + hh / 2 - 0.01, z + rnd.uniform(-0.04, 0.04)), 0.024, hh, mat, segs=5, r2=0.0, rot=tilt))


def flower(p, x, z, h=0.22, size=1.0, y=0.0):
    """A flower with glowing petals facing the player (tinted by the app)."""
    p.append(tcyl('stem', (x, y + h / 2, z), 0.012 * size, h, GRASSD, segs=5))
    hy = y + h + 0.02
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        p.append(blob('petal', (x + math.cos(a) * 0.055 * size, hy + math.sin(a) * 0.055 * size, z), 0.04 * size, GLOW, s=(1, 1, 0.45), segs=8, rings=5))
    p.append(blob('heart', (x, hy, z + 0.015), 0.028 * size, GRASSL, segs=8, rings=5))




def beads(p, pts, r, mat):
    """A chain of small balls along points (cartoon bones and ribs)."""
    for (x, y, z) in pts:
        p.append(blob('bead', (x, y, z), r, mat, segs=8, rings=5))


# =================================================================== island columns
GRASS_PROF = rrect(-D2 - 0.04, D2 + 0.04, -0.2, 0.0, 0.09, 0.03)
EARTH_CAP = rrect(-D2 + 0.02, D2 - 0.02, -0.46, -0.14, 0.0, 0.04)
BODY_PROF = rrect(-D2 + 0.02, D2 - 0.02, -1.0, 0.0, 0.0, 0.0)
FRONT = D2 - 0.02  # earth face of the bodies


def cap(v, seed):
    rnd = random.Random(seed)
    p = [prism('grass', GRASS_PROF, -0.5, 0.5, GRASS), prism('earth', EARTH_CAP, -0.5, 0.5, EARTH)]
    for side in (-1, 1):  # grass tongues hanging over the edges
        for x in (-0.37, -0.12, 0.13, 0.38):
            hy = 0.06 + rnd.uniform(0.02, 0.09)
            p.append(blob('tongue', (x + rnd.uniform(-0.03, 0.03), -0.15 - hy * 0.55, side * (D2 + 0.02)), 0.085, GRASS, s=(1.05, hy / 0.085, 0.7), segs=12, rings=8))
    for x, z in ((rnd.uniform(-0.35, -0.1), D2 - 0.12), (rnd.uniform(0.1, 0.35), -D2 + 0.15), (rnd.uniform(-0.3, 0.3), -D2 + 0.4)):
        blades(p, x, z, rnd)
    if v == 'A':
        flower(p, 0.22, -0.62)
    elif v == 'B':
        flower(p, -0.28, -0.5, h=0.18, size=0.85)
        flower(p, 0.33, -0.76, h=0.26)
    elif v == 'C':  # a toadstool
        p.append(tcyl('stalk', (0.1, 0.1, -0.55), 0.045, 0.2, BONE, segs=10, r2=0.038))
        p.append(blob('hat', (0.1, 0.21, -0.55), 0.14, SHROOM, s=(1, 0.55, 1), segs=14, rings=8))
        for k in range(5):
            a = k * 1.25
            p.append(blob('dot', (0.1 + math.cos(a) * 0.08, 0.255 - 0.02 * (k % 2), -0.55 + math.sin(a) * 0.08 + 0.02), 0.022, BONE, s=(1, 0.5, 1), segs=6, rings=4))
        flower(p, -0.3, -0.75, h=0.16, size=0.8)
    else:  # a mossy stone
        p.append(blob('stone', (-0.15, 0.06, -0.6), 0.15, ROCK, s=(1.3, 0.7, 1.0)))
        p.append(blob('moss', (-0.18, 0.14, -0.6), 0.1, GRASSL, s=(1.3, 0.45, 1.0), segs=10, rings=6))
        flower(p, 0.3, -0.5, h=0.2, size=0.9)
    asset(f'IslandCap{v}', p, dens=0.14)


def body(v, seed):
    rnd = random.Random(seed)
    p = [prism('earth', BODY_PROF, -0.5, 0.5, EARTH, smooth=False)]
    for side in (-1, 1):
        z = side * FRONT
        kind = v if side > 0 else 'ABCDE'[('ABCDE'.index(v) + 2) % 5]  # the back shows another pattern
        if kind == 'A':  # a few stones
            for _ in range(2):
                p.append(blob('stone', (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.8, -0.2), z), rnd.uniform(0.09, 0.14), ROCK, s=(1.25, 0.85, 0.5), segs=10, rings=7))
            p.append(blob('pebble', (rnd.uniform(-0.35, 0.35), rnd.uniform(-0.9, -0.1), z), 0.05, ROCK, s=(1.2, 0.8, 0.5), segs=8, rings=5))
        elif kind == 'B':  # a wavy darker soil layer
            for k in range(7):
                x = -0.48 + k * 0.16
                p.append(blob('layer', (x, -0.5 + math.sin(k * 1.3 + seed) * 0.05, z), 0.1, EARTHD, s=(1.0, 0.45, 0.25), segs=8, rings=5))
            p.append(blob('pebble', (rnd.uniform(-0.3, 0.3), -0.2, z), 0.05, ROCK, s=(1.2, 0.8, 0.5), segs=8, rings=5))
        elif kind == 'C':  # a glowing crystal vein (zone color)
            cx, cy = rnd.uniform(-0.2, 0.2), rnd.uniform(-0.65, -0.35)
            p.append(blob('vein', (cx, cy, z), 0.17, EARTHD, s=(1.3, 0.9, 0.2), segs=10, rings=6))
            for k, (dx, dy, tilt) in enumerate(((0, 0, 0.0), (-0.08, -0.04, 0.5), (0.08, -0.03, -0.5))):
                p.append(shard('crystal', (cx + dx, cy + dy, z + side * 0.02), 0.035, 0.16 - k * 0.03, GLOW, sides=5, tilt=(side * (-math.pi / 2 + 0.3), tilt)))
        elif kind == 'D':  # plain earth with tiny pebbles
            for _ in range(3):
                p.append(blob('pebble', (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.9, -0.1), z), rnd.uniform(0.03, 0.05), ROCK, s=(1.2, 0.8, 0.5), segs=8, rings=5))
        else:  # a root and a little worm looking out of its hole
            p.append(ttorus('root', (0.15, -0.3, z), 0.16, 0.02, EARTHD, axis='z', segs=16, tsegs=5, arc=math.pi * 1.1))
            hx, hy = -0.2, -0.65
            p.append(blob('hole', (hx, hy, z), 0.08, EARTHD, s=(1.2, 0.8, 0.2), segs=10, rings=6))
            for k, (dx, dy) in enumerate(((0, 0.0), (0.05, 0.07), (0.07, 0.15))):
                p.append(blob('worm', (hx + dx, hy + dy, z + side * (0.03 + k * 0.025)), 0.045 - k * 0.003, WORM, segs=10, rings=6))
            for ex in (-0.018, 0.018):
                p.append(blob('eye', (hx + 0.07 + ex, hy + 0.17, z + side * 0.115), 0.013, BONE, segs=6, rings=4))
                p.append(blob('pupil', (hx + 0.07 + ex, hy + 0.17, z + side * 0.125), 0.007, EARTHD, segs=6, rings=4))
    asset(f'IslandBody{v}', p, dens=0.2)


def under(v, seed):
    rnd = random.Random(seed)
    length = 0.75 if v == 'A' else 0.95
    p = [cone('under', (0, -0.44, 0), 0.5, 0.06, length, EARTH, sz=0.75, segs=12)]
    for k in range(5):  # rocks around the cone
        t = rnd.uniform(0.1, 0.65)
        a = rnd.uniform(0, 2 * math.pi)
        rr = 0.5 * (1 - t) + 0.02
        p.append(blob('rock', (math.cos(a) * rr * 0.9, -0.44 - t * length, math.sin(a) * rr * 0.7), rnd.uniform(0.08, 0.13), ROCK, s=(1.2, 0.9, 1.0), segs=10, rings=7))
    p.append(shard('crystal', (0, -0.44 - length + 0.05, 0), 0.06, 0.22, GLOW, sides=6, tilt=(math.pi, 0)))
    p.append(tcyl('root', (0.18, -0.44 - length * 0.45, 0.2), 0.012, length * 0.7, EARTHD, segs=5, rot=Matrix.Rotation(0.3, 3, 'Y')))
    asset(f'IslandUnder{v}', p, dens=0.16)


for v, seed in (('A', 3), ('B', 8), ('C', 13), ('D', 17)):
    cap(v, seed)
for v, seed in (('A', 5), ('B', 9), ('C', 14), ('D', 19), ('E', 23)):
    body(v, seed)
for v, seed in (('A', 4), ('B', 11)):
    under(v, seed)

# =================================================================== surprises in the earth (origin on the earth face, facing +z)
rnd = random.Random(71)
p = [blob('cavity', (0, 0, -0.02), 1.0, EARTHD, s=(1.0, 0.46, 0.04), segs=20, rings=8)]
p.append(blob('skull', (0.7, 0.12, 0.02), 0.2, BONE, s=(1.35, 0.85, 0.45)))
p.append(blob('jaw', (0.8, -0.02, 0.02), 0.14, BONE, s=(1.45, 0.5, 0.4)))
p.append(blob('socket', (0.76, 0.18, 0.1), 0.055, EARTHD, s=(1, 1, 0.35), segs=8, rings=5))
for k in range(3):
    p.append(tcyl('tooth', (0.86 + k * 0.05, 0.03, 0.07), 0.016, 0.05, BONE, segs=5, r2=0.0, rot=Matrix.Rotation(math.pi, 3, 'X')))
spine = [(0.5 - k * 0.15, 0.08 + 0.06 * math.sin(k * 0.6), 0.02) for k in range(9)]
beads(p, spine, 0.05, BONE)
beads(p, [(-0.85 - k * 0.07, 0.05 - k * 0.035, 0.02) for k in range(4)], 0.035, BONE)
for k in range(5):  # ribs hanging under the spine
    x0 = 0.32 - k * 0.15
    pts = [(x0 + 0.04 * math.sin(t * math.pi), 0.04 - 0.3 * t * (1 - 0.15 * k), 0.03) for t in [i / 6 for i in range(7)]]
    beads(p, pts, 0.022, BONE)
for x in (0.25, -0.45):  # legs with knobby joints
    p.append(tcyl('leg', (x, -0.2, 0.02), 0.025, 0.3, BONE, segs=6, rot=Matrix.Rotation(0.4, 3, 'Y')))
    p.append(blob('knee', (x - 0.06, -0.33, 0.02), 0.035, BONE, segs=8, rings=5))
    p.append(tcyl('shin', (x - 0.02, -0.42, 0.02), 0.02, 0.2, BONE, segs=6, rot=Matrix.Rotation(-0.5, 3, 'Y')))
asset('GagSkeleton', p, dens=0.2)

p = []
p.append(blob('saucer', (0, 0, 0.05), 0.62, UFO, s=(1, 0.22, 0.55), segs=24, rings=10))
p.append(blob('belly', (0, -0.08, 0.05), 0.36, UFO, s=(1, 0.3, 0.6), segs=18, rings=8))
p.append(blob('dome', (0, 0.13, 0.05), 0.27, GLASS, s=(1, 0.8, 0.85), segs=18, rings=10))
p.append(blob('alien', (0.0, 0.14, 0.08), 0.1, ALIEN, s=(1, 1.15, 1)))
for ex in (-0.035, 0.035):
    p.append(blob('alienEye', (ex, 0.17, 0.175), 0.022, EARTHD, segs=8, rings=5))
p.append(tcyl('antenna', (0, 0.42, 0.05), 0.01, 0.12, UFO, segs=5))
p.append(blob('tip', (0, 0.49, 0.05), 0.03, UFOGLOW, segs=8, rings=5))
for k in range(10):
    a = 2 * math.pi * k / 10
    p.append(blob('lamp', (math.cos(a) * 0.55, -0.02, 0.05 + math.sin(a) * 0.3), 0.035, UFOGLOW, segs=8, rings=5))
rotate_parts(p, 0.32)  # tilted, as if it crashed
p.insert(0, blob('cavity', (0, -0.05, -0.02), 0.8, EARTHD, s=(1.1, 0.55, 0.04), segs=20, rings=8))
for k in range(4):  # clods of earth thrown up around it
    p.append(blob('clod', (-0.55 + k * 0.38, -0.3 + 0.08 * (k % 2), 0.04), 0.07, EARTH, s=(1.3, 0.8, 0.7), segs=8, rings=5))
asset('GagUfo', p, dens=0.2)

p = [blob('cavity', (0, -0.05, -0.02), 0.55, EARTHD, s=(1.15, 0.72, 0.04), segs=18, rings=8)]
chest = []
chest.append(tbox('box', (0, -0.1, 0.06), (0.56, 0.3, 0.3), WOOD, bev=0.025))
chest.append(tcyl('lid', (0, 0.06, 0.06), 0.15, 0.56, WOOD, axis='x', segs=14))
for x in (-0.2, 0.2):
    chest.append(tbox('band', (x, -0.1, 0.06), (0.05, 0.31, 0.31), GOLD))
    chest.append(tcyl('lidband', (x, 0.06, 0.06), 0.155, 0.05, GOLD, axis='x', segs=14))
chest.append(tbox('lock', (0, -0.02, 0.215), (0.08, 0.1, 0.03), GOLD, bev=0.01))
chest.append(tbox('gleam', (0, 0.045, 0.18), (0.5, 0.025, 0.05), GOLDGLOW))
rotate_parts(chest, -0.12)
p += chest
for k in range(6):  # spilled coins
    x = -0.35 + k * 0.14 + rnd.uniform(-0.03, 0.03)
    p.append(tcyl('coin', (x, -0.27 + rnd.uniform(-0.03, 0.04), 0.1), 0.05, 0.015, GOLD, axis='z', segs=12, rot=Matrix.Rotation(rnd.uniform(-0.6, 0.6), 3, 'X')))
p.append(shard('gem', (0.32, -0.22, 0.12), 0.04, 0.1, GOLDGLOW, sides=5, tilt=(0.4, 0.3)))
asset('GagTreasure', p, dens=0.15)

# =================================================================== lift (3 units)
rnd = random.Random(21)
p = []
p.append(tbox('grass', (0, -0.1, 0), (2.96, 0.2, DEPTH + 0.06), GRASS, bev=0.08, segs=3))
p.append(tbox('earth', (0, -0.3, 0), (2.88, 0.32, DEPTH - 0.04), EARTH, bev=0.05, segs=2))
for side in (-1, 1):
    for i in range(10):
        x = -1.35 + i * 0.3
        hy = 0.06 + rnd.uniform(0.02, 0.09)
        p.append(blob('tongue', (x, -0.15 - hy * 0.55, side * (D2 + 0.02)), 0.085, GRASS, s=(1.05, hy / 0.085, 0.7), segs=12, rings=8))
p.append(cone('under', (0, -0.44, 0), 1.35, 0.1, 1.15, EARTH, sz=0.6, segs=16))
for k in range(8):
    t = rnd.uniform(0.1, 0.7)
    a = rnd.uniform(0, 2 * math.pi)
    rr = 1.35 * (1 - t)
    p.append(blob('rock', (math.cos(a) * rr * 0.92, -0.44 - t * 1.15, math.sin(a) * rr * 0.55), rnd.uniform(0.1, 0.18), ROCK, s=(1.2, 0.9, 1.0), segs=10, rings=7))
p.append(ttorus('rune1', (0, -0.95, 0), 0.62, 0.025, GLOW, axis='y', segs=40, tsegs=6))
p.append(ttorus('rune2', (0, -1.3, 0), 0.34, 0.02, GLOW, axis='y', segs=32, tsegs=6))
p.append(shard('crystal', (0, -1.5, 0), 0.08, 0.3, GLOW, sides=6, tilt=(math.pi, 0)))
for x, z in ((-1.1, D2 - 0.12), (0.4, D2 - 0.1), (1.05, -D2 + 0.15), (-0.5, -D2 + 0.3)):
    blades(p, x, z, rnd)
flower(p, -0.7, -0.6)
flower(p, 0.9, -0.45, h=0.18, size=0.85)
asset('IslandLift', p, dens=0.18)

# =================================================================== checkpoint signpost
H = 2.7
ZB = -D2 + 0.12
rnd = random.Random(31)
p = []
p.append(blob('foot', (0, 0.05, ZB), 0.22, ROCK, s=(1.2, 0.5, 1.0)))
blades(p, 0.18, ZB + 0.12, rnd, n=4)
blades(p, -0.16, ZB + 0.05, rnd, n=3)
p.append(tcyl('post', (0, H / 2, ZB), 0.07, H, WOOD, segs=10, r2=0.055))
p.append(tbox('arm', (0.32, H - 0.08, ZB), (0.68, 0.075, 0.075), WOOD, bev=0.02))
p.append(tbox('banner', (0.36, H - 0.42, ZB), (0.56, 0.6, 0.02), CLOTH, bev=0.005))
p.append(tbox('trimTop', (0.36, H - 0.13, ZB + 0.005), (0.6, 0.05, 0.03), GLOW))
p.append(tbox('trimBottom', (0.36, H - 0.71, ZB + 0.005), (0.56, 0.035, 0.025), GLOW))
for k in range(4):  # rope loops holding the banner
    p.append(ttorus('loop', (0.14 + k * 0.145, H - 0.1, ZB), 0.03, 0.008, EARTHD, axis='x', segs=10, tsegs=4))
p.append(tcyl('cord', (0.66, H - 0.17, ZB), 0.006, 0.12, EARTHD, segs=4))
p.append(tbox('lampCap', (0.66, H - 0.24, ZB), (0.12, 0.03, 0.12), WOOD, bev=0.01))
p.append(blob('lamp', (0.66, H - 0.33, ZB), 0.065, GLOW, s=(1, 1.25, 1)))
p.append(blob('top', (0, H + 0.05, ZB), 0.07, GLOW))
p.append(ttorus('halo', (0, 0.12, ZB), 0.32, 0.02, GLOW, axis='y', segs=32, tsegs=6))
asset('ForestGate', p)

# =================================================================== goal arch
H = 4.0
ZB = -D2 + 0.05
rnd = random.Random(41)
p = []
for sx in (-1, 1):  # pillars of stacked, slightly offset stones with moss
    y = 0.0
    k = 0
    while y < H:
        h = rnd.uniform(0.55, 0.75)
        r = 0.32 - k * 0.012
        p.append(blob('stone', (sx * 1.45 + rnd.uniform(-0.05, 0.05), y + h / 2, ZB), r, ROCK if k % 2 else STONE, s=(1.0, h / (2 * r) * 1.05, 0.95), segs=12, rings=8))
        if k % 2 == 0:
            p.append(blob('moss', (sx * 1.45 - sx * 0.12, y + h * 0.85, ZB + 0.16), 0.13, GRASS, s=(1.4, 0.5, 0.9), segs=10, rings=6))
        y += h * 0.92
        k += 1
    p.append(tcyl('vine', (sx * 1.45 - sx * 0.22, H * 0.5, ZB + 0.25), 0.02, H * 0.85, GRASSD, segs=5, rot=Matrix.Rotation(sx * 0.08, 3, 'Y')))
    for j in range(4):
        p.append(blob('leaf', (sx * 1.45 - sx * 0.22 + rnd.uniform(-0.06, 0.06), 0.7 + j * 0.8, ZB + 0.27), 0.07, GRASSL, s=(1.3, 0.6, 0.5), segs=8, rings=5))
        p.append(blob('bloom', (sx * 1.45 - sx * 0.26, 1.1 + j * 0.8, ZB + 0.3), 0.045, GLOW, segs=8, rings=5))
for i in range(9):  # arch of stones over the top
    t = i / 8
    x = -1.45 + 2.9 * t
    y = H + 0.1 + math.sin(math.pi * t) * 0.45
    p.append(blob('archstone', (x, y, ZB), 0.27, STONE if i % 2 else ROCK, s=(1.05, 0.85, 0.95), segs=12, rings=8))
    if i % 2 == 0:
        p.append(blob('moss', (x, y + 0.2, ZB + 0.05), 0.15, GRASS, s=(1.3, 0.45, 1.0), segs=10, rings=6))
p.append(tbox('stem', (0, H + 0.75, ZB), (0.12, 0.35, 0.12), WOOD, bev=0.02))
p.append(ttorus('ring', (0, H + 1.45, ZB), 1.0, 0.07, GLOW, axis='z', segs=64, tsegs=8))
p.append(ttorus('wreath', (0, H + 1.45, ZB - 0.03), 1.16, 0.075, GRASSD, axis='z', segs=64, tsegs=8))
for i in range(22):  # leaves and glowing berries around the wreath
    a = 2 * math.pi * i / 22
    p.append(blob('leaf', (math.cos(a) * 1.18, H + 1.45 + math.sin(a) * 1.18, ZB + 0.04), 0.11, GRASS if i % 2 else GRASSL, s=(1.4, 0.7, 0.5), segs=8, rings=5, rot=Matrix.Rotation(a, 3, 'Y')))
    if i % 3 == 0:
        p.append(blob('berry', (math.cos(a) * 1.28, H + 1.45 + math.sin(a) * 1.28, ZB + 0.08), 0.05, GLOW, segs=8, rings=5))
finish = asset('ForestFinish', p)
spot = bpy.data.objects.new('LogoSpot', None)
bpy.context.scene.collection.objects.link(spot)
spot.location = P(0, H + 1.45, ZB + 0.03)
spot.parent = finish

# =================================================================== stage base and edge trees
p = []
p.append(tbox('slab', (0, -0.42, 0), (1.0, 0.78, DEPTH + 2.4), STONE))
p.append(tbox('top', (0, -0.02, -0.2), (1.0, 0.04, DEPTH + 1.8), GRASSD))
p.append(tbox('moss', (0, -0.04, D2 + 1.12), (1.0, 0.1, 0.22), GRASS))
p.append(tbox('mossLip', (0, -0.1, D2 + 1.21), (1.0, 0.08, 0.04), GRASSD))
p.append(tbox('rune', (0, -0.3, D2 + 1.205), (1.0, 0.03, 0.02), GLOW))
for y in (-0.5, -0.68):
    p.append(tbox('band', (0, y, D2 + 1.2), (1.0, 0.04, 0.02), ROCK))
asset('ForestBase', p, dens=0.25)

rnd = random.Random(51)
p = []
p.append(tcyl('trunk', (0, 2.8, -0.2), 0.42, 7.2, WOOD, segs=14, r2=0.24))
for k in range(4):  # roots spreading on the base
    a = k * math.pi / 2 + 0.4
    p.append(blob('root', (math.cos(a) * 0.38, -0.65, -0.2 + math.sin(a) * 0.38), 0.24, WOOD, s=(1.5, 0.5, 1.0), rot=Matrix.Rotation(-a, 3, 'Z')))
for (x, y, z, r) in ((0.0, 7.2, -0.3, 1.25), (-0.9, 6.8, 0.1, 0.9), (0.85, 6.9, -0.6, 0.95), (0.2, 8.1, -0.2, 0.95), (-0.4, 7.7, 0.6, 0.7)):
    p.append(blob('canopy', (x, y, z), r, CANOPY, segs=16, rings=10))
for k in range(6):  # glowing flowers on a vine around the trunk
    a = k * 1.1
    y = 0.4 + k * 0.95
    rr = 0.42 - (y / 7.2) * 0.18 + 0.03
    p.append(blob('vineLeaf', (math.cos(a) * rr, y, -0.2 + math.sin(a) * rr), 0.08, GRASS, s=(1.3, 0.6, 0.6), segs=8, rings=5))
    p.append(blob('vineBloom', (math.cos(a + 0.4) * rr, y + 0.25, -0.2 + math.sin(a + 0.4) * rr), 0.06, GLOW, segs=8, rings=5))
asset('ForestEnd', p, dens=0.35)

# =================================================================== backdrop plants and clouds
rnd = random.Random(61)
p = [tcyl('trunk', (0, 1.3, 0), 0.18, 2.6, WOOD, segs=10, r2=0.12)]
for (x, y, z, r) in ((0, 3.1, 0, 1.1), (-0.65, 2.65, 0.2, 0.78), (0.7, 2.8, -0.1, 0.82), (0.1, 3.85, 0, 0.72)):
    p.append(blob('canopy', (x, y, z), r, LEAF, segs=16, rings=10))
for k in range(6):
    a = rnd.uniform(0.3, 2.8)
    p.append(blob('fruit', (math.cos(a) * 1.05, 3.0 + math.sin(a) * 0.95, 0.55), 0.07, GLOW, segs=8, rings=5))
asset('Tree1', p, dens=0.35)

p = [tcyl('trunk', (0, 0.5, 0), 0.14, 1.0, WOOD, segs=8, r2=0.1)]
for (y, r, h) in ((1.4, 1.0, 1.5), (2.3, 0.8, 1.3), (3.1, 0.58, 1.1)):
    p.append(cone('tier', (0, y + h * 0.5, 0), r, 0.06, h, LEAF, segs=14))
p.append(blob('star', (0, 3.8, 0), 0.1, GLOW, segs=8, rings=5))
for k in range(5):
    a = k * 1.3
    p.append(blob('light', (math.cos(a) * 0.7, 1.3 + k * 0.45, math.sin(a) * 0.5 + 0.2), 0.06, GLOW, segs=8, rings=5))
asset('Tree2', p, dens=0.35)

p = []
p.append(tcyl('trunk', (0.05, 1.0, 0), 0.16, 2.0, WOOD, segs=10, r2=0.12, rot=Matrix.Rotation(0.08, 3, 'Y')))
p.append(tcyl('trunk2', (0.15, 2.4, 0), 0.12, 1.0, WOOD, segs=10, r2=0.1, rot=Matrix.Rotation(-0.12, 3, 'Y')))
p.append(blob('dome', (0.2, 3.05, 0), 1.25, LEAF, s=(1.0, 0.5, 1.0), segs=18, rings=10))
p.append(blob('dome2', (0.0, 3.35, 0.1), 0.8, LEAF, s=(1.0, 0.55, 1.0), segs=16, rings=9))
for k in range(8):  # glowing drops under the canopy edge
    a = 2 * math.pi * k / 8
    p.append(blob('drop', (0.2 + math.cos(a) * 1.05, 2.62, math.sin(a) * 1.05), 0.07, GLOW, s=(1, 1.4, 1), segs=8, rings=5))
asset('Tree3', p, dens=0.35)

p = []
for (x, y, z, r) in ((0, 0.35, 0, 0.5), (-0.5, 0.28, 0.1, 0.4), (0.48, 0.3, -0.05, 0.42), (0.1, 0.62, 0.05, 0.36)):
    p.append(blob('leafball', (x, y, z), r, LEAF, segs=14, rings=8))
for (x, y) in ((-0.35, 0.6), (0.3, 0.68), (0.0, 0.85), (0.62, 0.45)):
    p.append(blob('bloom', (x, y, 0.42), 0.06, GLOW, segs=8, rings=5))
asset('Bush', p, dens=0.3)

for name, balls in (('Cloud1', ((0, 0, 0, 0.6), (-0.6, -0.1, 0.05, 0.45), (0.65, -0.08, 0, 0.5), (0.2, 0.3, 0, 0.42), (-0.25, 0.22, 0.1, 0.38))),
                    ('Cloud2', ((0, 0, 0, 0.45), (-0.45, -0.05, 0, 0.35), (0.5, -0.06, 0.05, 0.38), (0.1, 0.22, 0, 0.32)))):
    asset(name, [blob('puff', (x, y, z), r, CLOUD, s=(1.0, 0.75, 0.7), segs=14, rings=8) for (x, y, z, r) in balls], dens=0.4)

# =================================================================== canopy, branches, thorns (flight level)
# CanopyTopA/B: the leaf roof, 1 unit wide, origin at the canopy's underside (the ceiling).
for v, seed in (('A', 81), ('B', 83)):
    rnd = random.Random(seed)
    p = []
    for k in range(4):
        x = -0.5 + k * 0.33 + rnd.uniform(-0.05, 0.05)
        z = rnd.uniform(-0.7, 0.7)
        p.append(blob('leaves', (x, 0.28 + rnd.uniform(-0.05, 0.08), z), rnd.uniform(0.32, 0.42), CANOPY if k % 2 else GRASS, s=(1.0, 0.65, 1.3), segs=12, rings=8))
    for k in range(3):  # leaf tips hanging down at the front
        p.append(blob('tip', (-0.33 + k * 0.33 + rnd.uniform(-0.06, 0.06), -0.02, D2 - 0.1), 0.09, GRASSL, s=(0.8, 1.3, 0.6), segs=8, rings=5))
    asset(f'CanopyTop{v}', p, dens=0.3)

# Branch: the bottom of a hanging branch (1 unit wide, origin at its underside, y in [0, 1]).
rnd = random.Random(87)
p = [tcyl('limb', (0, 0.18, 0.0), 0.13, 1.02, WOOD, axis='x', segs=10)]
for k in range(3):
    p.append(blob('leaves', (-0.33 + k * 0.33, 0.55 + rnd.uniform(-0.05, 0.08), rnd.uniform(-0.4, 0.4)), 0.36, GRASS if k != 1 else CANOPY, s=(1.0, 0.9, 1.4), segs=12, rings=8))
for k in range(3):  # moss strands dangling in front
    h = rnd.uniform(0.18, 0.32)
    p.append(tcyl('moss', (-0.3 + k * 0.3, 0.12 - h / 2, D2 - 0.35), 0.018, h, GRASSD, segs=5))
    p.append(blob('mossTip', (-0.3 + k * 0.3, 0.12 - h, D2 - 0.35), 0.03, GRASSL, segs=6, rings=4))
asset('Branch', p, dens=0.3)

# Foliage: a 1-unit block of leaves stacked from the branch up to the canopy.
rnd = random.Random(89)
p = []
for k in range(4):
    p.append(blob('leaves', (-0.25 + (k % 2) * 0.5, 0.25 + (k // 2) * 0.5, rnd.uniform(-0.5, 0.5)), 0.38, GRASS if k % 3 else CANOPY, s=(1.0, 0.9, 1.6), segs=12, rings=8))
p.append(tcyl('twig', (0.1, 0.5, 0.3), 0.04, 0.9, WOOD, segs=6, rot=Matrix.Rotation(0.4, 3, 'Y')))
asset('Foliage', p, dens=0.35)

# Thorns: a bramble hanging under a branch (1 unit wide, origin at the top, down to -0.55).
rnd = random.Random(91)
p = []
for k in range(4):
    x = -0.38 + k * 0.25
    h = rnd.uniform(0.35, 0.5)
    p.append(tcyl('vine', (x, -h / 2, rnd.uniform(-0.3, 0.3)), 0.025, h, GRASSD, segs=6, rot=Matrix.Rotation(rnd.uniform(-0.3, 0.3), 3, 'Y')))
    for j in range(3):
        tilt = Matrix.Rotation(math.pi / 2 + rnd.uniform(-0.5, 0.5), 3, 'Y' if j % 2 else 'X')
        p.append(tcyl('thorn', (x + rnd.uniform(-0.05, 0.05), -0.1 - j * h / 3, rnd.uniform(-0.25, 0.25)), 0.025, 0.12, THORN, segs=5, r2=0.0, rot=tilt))
    p.append(blob('berry', (x, -h - 0.03, 0.15), 0.045, THORN, segs=8, rings=5))
asset('Thorns', p, dens=0.15)

# =================================================================== eagle (origin center, looks to -x; EagleWingL/R flap)
p = []
p.append(blob('body', (0.05, 0, 0), 0.34, EAGLE, s=(1.45, 0.8, 0.85)))
p.append(blob('chest', (-0.18, -0.05, 0), 0.24, EAGLEDARK, s=(1.0, 0.9, 0.8)))
p.append(blob('head', (-0.48, 0.17, 0), 0.2, BONE, s=(1.1, 1.0, 0.95)))
p.append(blob('beak', (-0.68, 0.13, 0), 0.08, BEAK, s=(1.3, 0.8, 0.8)))
p.append(cone('hook', (-0.76, 0.11, 0), 0.04, 0.0, 0.09, BEAK, segs=6))
for sz in (-1, 1):
    p.append(blob('eye', (-0.58, 0.22, sz * 0.12), 0.045, BONE, segs=8, rings=5))
    p.append(blob('pupil', (-0.62, 0.22, sz * 0.15), 0.022, EARTHD, segs=6, rings=4))
    p.append(tbox('brow', (-0.58, 0.29, sz * 0.13), (0.12, 0.025, 0.03), EARTHD, rot=Matrix.Rotation(0.4, 3, 'Y')))
for k in range(3):  # tail fan
    p.append(blob('tail', (0.5, -0.02, (k - 1) * 0.1), 0.14, BONE if k == 1 else EAGLEDARK, s=(1.6, 0.25, 0.6), segs=8, rings=5))
for sz in (-1, 1):  # talons
    p.append(tcyl('leg', (0.05, -0.3, sz * 0.1), 0.025, 0.14, BEAK, segs=6))
    for k in range(3):
        p.append(cone('claw', (0.0 - k * 0.03, -0.37, sz * 0.1 + (k - 1) * 0.03), 0.012, 0.0, 0.06, EARTHD, segs=5))
eagle = asset('Eagle', p, dens=0.12)
for sz, name in ((1, 'EagleWingR'), (-1, 'EagleWingL')):
    q = [blob('wing', (0, 0, sz * 0.5), 0.3, EAGLE, s=(1.3, 0.22, 1.8), segs=12, rings=7)]
    for k in range(4):  # primary feathers at the tip
        q.append(blob('feather', (0.1 + k * 0.1, -0.02, sz * (0.95 + k * 0.03)), 0.12, EAGLEDARK, s=(0.6, 0.2, 1.6), segs=8, rings=5))
    bpy.context.view_layer.update()
    w = merge(q, name)
    w.location = P(0.0, 0.12, sz * 0.18)
    w.parent = eagle

# =================================================================== bake, layout, export
bake_ao(ASSETS, {'ForGlow', 'ForUfoGlow', 'ForGoldGlow'}, distance=0.35)
for i, (ob, _) in enumerate(ASSETS):
    ob.location.x += (i % 6) * 5.0
    ob.location.y += (i // 6) * 8.0
print('assets', [(ob.name, len(ob.data.polygons)) for ob, _ in ASSETS])
print('faces total', sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH'))
export(OUT_GLB, OUT_BLEND)
print('DONE')

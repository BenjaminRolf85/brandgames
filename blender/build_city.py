# Builds the city of Echo Parkour level 2 (original designs, playful cartoon look like the
# game's menu coins): rooftops at dawn, colorful buildings with lit windows, steel girders on
# crane cables, a window cleaner gondola, a street as the stage base with lamps at its edges,
# a skyline of colorful towers, an airship, clouds, and as gags a cat, pigeons and billboards.
#   RoofA-D      roof of a building column (1 unit wide, y in [-0.46, 0], origin top center)
#   FacadeA-D    facade module, 1 unit tall (y in [-1, 0]); stacked; CityWall is tinted per
#                building, CityWindowGlow per window row (lit warm, cool or dark)
#   GirderCap    top of a floating steel girder; GirderUnderA/B below it (A with a crane cable)
#   Gondola      3-unit window cleaner platform (the lift, origin top center)
#   CityBase     stage base segment: a street (1 unit, stretched in x; y top = 0)
#   CityEnd      street lamp at the stage edge (mirrored on the left by the app)
#   Sky1-4       backdrop towers (origin bottom center); Blimp; CityCloud
#   Cat, Pigeons, Billboard (CityPanel has UVs for Echo's emblem)
#   Vent, Antenna, PowerMast, PigeonSpikes: rooftop obstacles in warning colors (CityHazard*)
#   Helicopter (+HeliRotor, HeliTail) and Raven (+RavenWingL/R): flyers of the upper air
# Units as in build_parkour.py (1 = one block, DEPTH deep track, three.js coordinates). *Glow
# parts are tinted by the app; ambient occlusion is baked into the vertex colors.
# Usage: blender -b -P build_city.py -- <out.glb> <out.blend>
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import (init, P, material, link, tbox, tcyl, ttorus, merge, bake_ao, export,
                      blob, cone, rrect, prism, rotate_parts)

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
DEPTH = 1.8
D2 = DEPTH / 2
FRONT = D2 - 0.02
init()

ROOF = material('CityRoof', (0.66, 0.65, 0.64), 0.0, 0.9)
PARAPET = material('CityParapet', (0.85, 0.84, 0.81), 0.0, 0.8)
WALL = material('CityWall', (0.95, 0.95, 0.95), 0.0, 0.75)
FRAME = material('CityFrame', (1, 1, 1), 0.0, 0.5)
WINDOW = material('CityWindowGlow', (0, 0, 0), emit=(1, 0.82, 0.48))
METAL = material('CityMetal', (0.66, 0.71, 0.82), 0.6, 0.35)
STEEL = material('CitySteel', (1.0, 0.54, 0.24), 0.3, 0.45)
STRIPE = material('CityStripe', (1.0, 0.78, 0.36), 0.0, 0.6)
DARK = material('CityDark', (0.09, 0.13, 0.23), 0.3, 0.6)
ASPHALT = material('CityAsphalt', (0.16, 0.18, 0.24), 0.0, 0.9)
LANE = material('CityLane', (1.0, 0.78, 0.36), 0.0, 0.7)
AWNING = material('CityAwning', (1.0, 0.56, 0.64), 0.0, 0.8)
PLANT = material('CityPlant', (0.27, 0.76, 0.35), 0.0, 0.7)
POT = material('CityPot', (0.6, 0.39, 0.25), 0.0, 0.8)
GLOW = material('CityGlow', (0, 0, 0), emit=(1, 1, 1))
CLOUD = material('CityCloud', (1.0, 0.64, 0.69), 0.0, 0.9)
CAT = material('CityCat', (1.0, 0.6, 0.29), 0.0, 0.7)
PIGEON = material('CityPigeon', (0.66, 0.71, 0.82), 0.0, 0.7)
BLIMP = material('CityBlimp', (0.91, 0.93, 0.96), 0.2, 0.45)
PANEL = material('CityPanel', (1, 1, 1), 0.0, 0.6)
# Obstacles and flyers stand out from the roof clutter: a warning red-orange and a red glow.
HAZARD = material('CityHazard', (1.0, 0.36, 0.2), 0.0, 0.5)
HAZGLOW = material('CityHazardGlow', (0, 0, 0), emit=(1.0, 0.2, 0.2))
HELI = material('CityHeli', (1.0, 0.78, 0.3), 0.2, 0.4)
HELIGLASS = material('CityHeliGlass', (0.42, 0.76, 1.0), 0.1, 0.1)
RAVEN = material('CityRaven', (0.2, 0.18, 0.36), 0.0, 0.55)
BEAK = material('CityBeak', (1.0, 0.6, 0.29), 0.0, 0.6)

ASSETS = []


def asset(name, parts, dens=0.18):
    bpy.context.view_layer.update()
    ob = merge(parts, name)
    ASSETS.append((ob, dens))
    return ob


def window(p, x, y, z, side, w=0.26, h=0.36):
    """A window with frame, glowing glass and sill on the face at z (side +1 front, -1 back)."""
    p.append(tbox('frame', (x, y, z + side * 0.015), (w + 0.07, h + 0.07, 0.04), FRAME, bev=0.01))
    p.append(tbox('glass', (x, y, z + side * 0.036), (w, h, 0.01), WINDOW))
    p.append(tbox('bar', (x, y, z + side * 0.042), (0.02, h, 0.008), FRAME))
    p.append(tbox('sill', (x, y - h / 2 - 0.05, z + side * 0.04), (w + 0.12, 0.035, 0.08), PARAPET))


# =================================================================== roofs
ROOF_PROF = rrect(-D2 + 0.02, D2 - 0.02, -0.46, 0.0, 0.015, 0.0)
for v, seed in (('A', 3), ('B', 7), ('C', 11), ('D', 19)):
    rnd = random.Random(seed)
    p = [prism('roof', ROOF_PROF, -0.5, 0.5, ROOF)]
    for side in (-1, 1):
        p.append(tbox('parapet', (0, 0.05, side * (D2 - 0.06)), (1.0, 0.12, 0.1), PARAPET))
        p.append(tbox('cornice', (0, -0.16, side * (D2 - 0.0)), (1.0, 0.07, 0.05), PARAPET))
        p.append(tbox('band', (0, -0.34, side * (D2 - 0.01)), (1.0, 0.04, 0.03), DARK))
    zb = -D2 + 0.42
    if v == 'A':  # vent pipes
        for x, h in ((-0.2, 0.32), (0.15, 0.22)):
            p.append(tcyl('vent', (x, h / 2, zb), 0.055, h, METAL, segs=12))
            p.append(tcyl('ventCap', (x, h + 0.03, zb), 0.085, 0.05, METAL, segs=12))
    elif v == 'B':  # an AC unit with a fan
        p.append(tbox('ac', (0.05, 0.15, zb), (0.46, 0.3, 0.34), METAL, bev=0.03))
        p.append(tcyl('fan', (0.05, 0.31, zb), 0.12, 0.02, DARK, segs=16))
        for k in range(3):
            p.append(tbox('blade', (0.05, 0.325, zb), (0.22, 0.008, 0.04), METAL, rot=Matrix.Rotation(k * math.pi / 3, 3, 'Z')))
    elif v == 'C':  # a solar panel
        p.append(tbox('panel', (0.0, 0.2, zb), (0.62, 0.03, 0.38), DARK, bev=0.01, rot=Matrix.Rotation(0.45, 3, 'X')))
        p.append(tbox('panelGlow', (0.0, 0.215, zb), (0.56, 0.01, 0.32), WINDOW, rot=Matrix.Rotation(0.45, 3, 'X')))
        for x in (-0.25, 0.25):
            p.append(tcyl('leg', (x, 0.08, zb + 0.05), 0.015, 0.16, METAL, segs=6))
    else:  # an antenna with a blinking light
        p.append(tcyl('mast', (0.2, 0.45, zb), 0.02, 0.9, METAL, segs=8))
        for k in range(3):
            p.append(tbox('rung', (0.2, 0.35 + k * 0.18, zb), (0.24 - k * 0.05, 0.015, 0.015), METAL))
        p.append(blob('blink', (0.2, 0.93, zb), 0.04, GLOW, segs=8, rings=5))
        p.append(tbox('box', (-0.2, 0.08, zb), (0.24, 0.16, 0.2), METAL, bev=0.02))
    asset(f'Roof{v}', p, dens=0.2)

# =================================================================== facades (stacked modules)
BODY = rrect(-D2 + 0.02, D2 - 0.02, -1.0, 0.0, 0.0, 0.0)
for v, seed in (('A', 5), ('B', 9), ('C', 13), ('D', 17)):
    rnd = random.Random(seed)
    p = [prism('wall', BODY, -0.5, 0.5, WALL, smooth=False)]
    for side in (-1, 1):
        z = side * FRONT
        kind = v if side > 0 else 'ABCD'[('ABCD'.index(v) + 2) % 4]
        if kind == 'A':  # two windows
            for x in (-0.24, 0.24):
                window(p, x, -0.48, z, side)
        elif kind == 'B':  # a wide window under a striped awning
            window(p, 0, -0.52, z, side, w=0.62, h=0.34)
            for k in range(6):
                p.append(tbox('awning', (-0.31 + k * 0.124, -0.22, z + side * 0.1), (0.124, 0.03, 0.2), AWNING if k % 2 == 0 else FRAME, rot=Matrix.Rotation(side * 0.35, 3, 'X')))
        elif kind == 'C':  # a balcony with a plant
            window(p, 0.0, -0.42, z, side, w=0.3, h=0.46)
            p.append(tbox('balcony', (0, -0.72, z + side * 0.14), (0.7, 0.05, 0.28), PARAPET))
            for k in range(6):
                p.append(tbox('rail', (-0.32 + k * 0.128, -0.6, z + side * 0.27), (0.02, 0.22, 0.02), FRAME))
            p.append(tbox('railTop', (0, -0.49, z + side * 0.27), (0.68, 0.025, 0.03), FRAME))
            p.append(tcyl('pot', (0.24, -0.64, z + side * 0.16), 0.06, 0.12, POT, segs=10, r2=0.075))
            p.append(blob('plant', (0.24, -0.53, z + side * 0.16), 0.1, PLANT, segs=10, rings=7))
        else:  # two windows, an AC box and a drain pipe
            for x in (-0.22, 0.22):
                window(p, x, -0.45, z, side)
            p.append(tbox('acBox', (0.22, -0.85, z + side * 0.09), (0.26, 0.16, 0.16), METAL, bev=0.015))
            p.append(tcyl('pipe', (-0.46, -0.5, z + side * 0.04), 0.025, 1.0, METAL, segs=8))
    asset(f'Facade{v}', p, dens=0.25)

# =================================================================== steel girders and the gondola
p = [tbox('top', (0, -0.03, 0), (1.0, 0.06, DEPTH - 0.1), STEEL)]
p.append(tbox('web', (0, -0.18, 0), (1.0, 0.24, 0.12), STEEL))
for side in (-1, 1):
    p.append(tbox('flangeEdge', (0, -0.03, side * (D2 - 0.04)), (1.0, 0.07, 0.03), STEEL))
for k in range(4):  # hazard stripes on the front edge
    p.append(tbox('stripe', (-0.375 + k * 0.25, -0.03, D2 - 0.02), (0.12, 0.05, 0.012), STRIPE, rot=Matrix.Rotation(0.6, 3, 'Y')))
for x in (-0.3, 0.3):
    for z in (-0.5, 0.5):
        p.append(tcyl('bolt', (x, 0.005, z), 0.022, 0.02, METAL, segs=6))
asset('GirderCap', p, dens=0.2)
for v in ('A', 'B'):
    p = [tbox('bottom', (0, -0.33, 0), (1.0, 0.06, DEPTH - 0.4), STEEL)]
    for x in (-0.25, 0.25):  # holes in the web
        p.append(tcyl('hole', (x, -0.18, 0.065), 0.06, 0.012, DARK, axis='z', segs=12))
        p.append(tcyl('hole', (x, -0.18, -0.065), 0.06, 0.012, DARK, axis='z', segs=12))
    if v == 'A':  # crane cable and hook block, at the back of the track
        p.append(tcyl('cable', (0, 1.75, -D2 + 0.12), 0.018, 3.5, DARK, segs=6))  # up to the top of the stage
        p.append(tbox('hook', (0, 0.15, -D2 + 0.12), (0.12, 0.18, 0.1), STRIPE, bev=0.02))
    asset(f'GirderUnder{v}', p, dens=0.3)

p = [tbox('floor', (0, -0.06, 0), (2.9, 0.12, DEPTH - 0.2), METAL, bev=0.02)]
for side in (-1, 1):
    zr = side * (D2 - 0.14)
    for k in range(7):
        p.append(tbox('post', (-1.35 + k * 0.45, 0.25, zr), (0.03, 0.5, 0.03), FRAME))
    p.append(tbox('rail', (0, 0.5, zr), (2.8, 0.045, 0.045), STRIPE))
    p.append(tbox('kick', (0, 0.06, zr), (2.8, 0.1, 0.02), STEEL))
for sx in (-1, 1):  # motor boxes and ropes up to the roof
    p.append(tbox('motor', (sx * 1.25, 0.2, -D2 + 0.25), (0.28, 0.3, 0.3), STEEL, bev=0.03))
    p.append(tcyl('rope', (sx * 1.25, 2.0, -D2 + 0.25), 0.015, 3.6, DARK, segs=6))
p.append(tcyl('bucket', (0.6, 0.12, -0.3), 0.12, 0.2, AWNING, segs=14, r2=0.14))
p.append(tbox('squeegee', (0.6, 0.32, -0.3), (0.3, 0.04, 0.05), FRAME, rot=Matrix.Rotation(0.4, 3, 'Y')))
p.append(tbox('under', (0, -0.18, 0), (2.6, 0.12, DEPTH - 0.6), DARK))
asset('Gondola', p, dens=0.3)

# =================================================================== stage: street and lamps
p = []
p.append(tbox('slab', (0, -0.42, 0), (1.0, 0.78, DEPTH + 2.4), DARK))
p.append(tbox('asphalt', (0, -0.02, -0.25), (1.0, 0.04, DEPTH + 1.7), ASPHALT))
p.append(tbox('lane', (0, 0.002, -0.05), (1.0, 0.01, 0.06), LANE))
p.append(tbox('sidewalk', (0, 0.0, D2 + 0.95), (1.0, 0.08, 0.5), PARAPET))
p.append(tbox('curb', (0, -0.02, D2 + 0.68), (1.0, 0.1, 0.06), ROOF))
p.append(tbox('glow', (0, -0.3, D2 + 1.205), (1.0, 0.03, 0.02), GLOW))
for y in (-0.5, -0.68):
    p.append(tbox('band', (0, y, D2 + 1.2), (1.0, 0.04, 0.02), ROOF))
asset('CityBase', p, dens=0.3)

p = []
p.append(tcyl('base', (0, -0.55, -0.2), 0.22, 0.5, DARK, segs=12, r2=0.16))
p.append(tcyl('pole', (0, 3.7, -0.2), 0.1, 8.0, METAL, segs=12, r2=0.07))
arm = []
for k in range(8):  # curved arm towards the stage
    a = k / 7 * math.pi / 2
    arm.append(blob('arm', (0.55 - 0.55 * math.cos(a), 7.7 + 0.55 * math.sin(a), -0.2), 0.06, METAL, segs=8, rings=5))
p += arm
p.append(tbox('head', (0.8, 8.25, -0.2), (0.6, 0.12, 0.34), DARK, bev=0.03))
p.append(tbox('lamp', (0.8, 8.17, -0.2), (0.5, 0.04, 0.26), GLOW))
p.append(tbox('sign', (0.0, 3.2, -0.05), (0.06, 0.5, 0.36), STRIPE, bev=0.01))
p.append(tbox('signGlow', (0.04, 3.2, -0.05), (0.01, 0.4, 0.28), GLOW))
asset('CityEnd', p, dens=0.35)

# =================================================================== skyline, airship and clouds
def window_rows(p, w, h, d, y0, rows, step, inset=0.08):
    for r in range(rows):
        y = y0 + r * step
        if y > h - 0.3:
            break
        p.append(tbox('row', (0, y, d / 2 + 0.005), (w - inset * 2, 0.12, 0.02), WINDOW))


p = [tbox('body', (0, 3.0, 0), (1.4, 6.0, 1.2), WALL, bev=0.05)]
window_rows(p, 1.4, 6.0, 1.2, 0.5, 18, 0.32)
p.append(tbox('crown', (0, 6.1, 0), (1.1, 0.2, 0.9), PARAPET, bev=0.03))
p.append(tcyl('antenna', (0.3, 6.8, 0), 0.03, 1.2, METAL, segs=6))
p.append(blob('blink', (0.3, 7.42, 0), 0.07, GLOW, segs=8, rings=5))
asset('Sky1', p, dens=0.6)

p = [tcyl('tower', (0, 3.5, 0), 0.75, 7.0, WALL, segs=24)]
for k in range(12):
    p.append(ttorus('ring', (0, 0.6 + k * 0.52, 0), 0.75, 0.05, WINDOW, axis='y', segs=32, tsegs=4))
p.append(blob('dome', (0, 7.0, 0), 0.75, PARAPET, s=(1, 0.6, 1), segs=20, rings=8))
p.append(tcyl('spire', (0, 7.8, 0), 0.04, 0.9, METAL, segs=6, r2=0.0))
asset('Sky2', p, dens=0.6)

p = []
for k, (w, h) in enumerate(((1.6, 3.0), (1.2, 2.2), (0.8, 1.6))):
    y0 = sum(hh for _, hh in ((1.6, 3.0), (1.2, 2.2), (0.8, 1.6))[:k])
    p.append(tbox('step', (0, y0 + h / 2, 0), (w, h, w * 0.85), WALL, bev=0.04))
    window_rows(p, w, h, w * 0.85, 0.4, 8, 0.36) if k == 0 else None
    for r in range(int(h / 0.36)):
        p.append(tbox('row', (0, y0 + 0.3 + r * 0.36, w * 0.425 + 0.005), (w - 0.16, 0.12, 0.02), WINDOW))
p.append(tbox('roofbox', (0, 6.95, 0), (0.4, 0.3, 0.4), PARAPET))
asset('Sky3', p, dens=0.6)

p = [tbox('body', (0, 1.6, 0), (2.2, 3.2, 1.2), WALL, bev=0.05)]
window_rows(p, 2.2, 3.2, 1.2, 0.5, 8, 0.34)
for x in (-0.6, 0.6):
    p.append(tcyl('leg', (x, 3.6, 0), 0.04, 0.8, METAL, segs=6))
p.append(tbox('board', (0, 4.45, 0.05), (1.9, 1.0, 0.08), DARK, bev=0.02))
p.append(tbox('boardGlow', (0, 4.45, 0.1), (1.75, 0.85, 0.01), GLOW))
asset('Sky4', p, dens=0.6)

p = [blob('hull', (0, 0, 0), 1.0, BLIMP, s=(1.0, 0.36, 0.36), segs=24, rings=12)]
for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):  # tail fins
    p.append(tbox('fin', (-0.9, math.cos(a) * 0.22, math.sin(a) * 0.22), (0.35, 0.03 if a in (0, math.pi) else 0.3, 0.3 if a in (0, math.pi) else 0.03), AWNING, bev=0.01))
p.append(tbox('gondola', (0.1, -0.42, 0), (0.45, 0.14, 0.18), DARK, bev=0.03))
p.append(tbox('stripe', (0.15, 0.0, 0.36), (1.0, 0.08, 0.01), GLOW))
asset('Blimp', p, dens=0.5)

asset('CityCloud', [blob('puff', (x, y, z), r, CLOUD, s=(1.0, 0.7, 0.6), segs=14, rings=8)
                    for (x, y, z, r) in ((0, 0, 0, 0.55), (-0.55, -0.08, 0.05, 0.42), (0.6, -0.06, 0, 0.45), (0.15, 0.25, 0, 0.38))], dens=0.4)

# =================================================================== gags on the roofs (origin on the roof, at the back)
p = []
p.append(blob('body', (0, 0.17, 0), 0.15, CAT, s=(0.9, 1.15, 0.8)))
p.append(blob('head', (0.02, 0.38, 0.03), 0.11, CAT))
for sx in (-1, 1):
    p.append(cone('ear', (0.02 + sx * 0.06, 0.47, 0.03), 0.04, 0.0, 0.08, CAT, segs=6, down=False))
    p.append(blob('eye', (0.02 + sx * 0.04, 0.4, 0.125), 0.018, FRAME, segs=8, rings=5))
    p.append(blob('pupil', (0.02 + sx * 0.04, 0.4, 0.14), 0.01, DARK, segs=6, rings=4))
p.append(blob('nose', (0.02, 0.37, 0.14), 0.012, AWNING, segs=6, rings=4))
p.append(ttorus('tail', (-0.16, 0.14, -0.02), 0.12, 0.025, CAT, axis='z', segs=16, tsegs=5, arc=math.pi * 1.2))
for sx in (-1, 1):
    p.append(blob('paw', (sx * 0.06, 0.03, 0.1), 0.04, FRAME, s=(1, 0.6, 1.2), segs=8, rings=5))
asset('Cat', p, dens=0.1)

p = []
for k, (x, z, turn) in enumerate(((-0.25, 0.0, 0.3), (0.05, 0.1, -0.2), (0.3, -0.05, 0.6))):
    q = [blob('body', (x, 0.09, z), 0.08, PIGEON, s=(1.3, 0.9, 0.9)),
         blob('head', (x + 0.08, 0.18, z), 0.045, PIGEON),
         cone('beak', (x + 0.12, 0.18, z), 0.012, 0.0, 0.04, STRIPE, segs=5, down=False),
         blob('wing', (x - 0.02, 0.11, z + 0.06), 0.06, DARK, s=(1.3, 0.6, 0.4), segs=8, rings=5)]
    q[2].rotation_euler = (0, math.pi / 2, 0)
    for ob in q:
        ob.matrix_world = Matrix.Translation(P(x, 0, z)) @ Matrix.Rotation(turn, 4, 'Z') @ Matrix.Translation(-P(x, 0, z)) @ ob.matrix_world
    p += q
asset('Pigeons', p, dens=0.1)

p = []
for x in (-0.45, 0.45):
    p.append(tcyl('leg', (x, 0.45, 0), 0.03, 0.9, METAL, segs=8))
p.append(tbox('board', (0, 1.25, 0), (1.25, 0.8, 0.06), DARK, bev=0.02))
bm = bmesh.new()  # the picture panel with UVs (Echo's emblem is put on it by the app)
uv = bm.loops.layers.uv.new('UVMap')
vs = [bm.verts.new(P(dx * 0.56, 1.25 + dy * 0.34, 0.035)) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
f = bm.faces.new(vs)
for loop in f.loops:
    loop[uv].uv = ((loop.vert.co.x / 0.56 + 1) / 2, ((loop.vert.co.z - 1.25) / 0.34 + 1) / 2)
bm.normal_update()
if f.normal.dot(P(0, 0, 1)) < 0:
    f.normal_flip()
p.append(link('panel', bm, PANEL))
p.append(tbox('lampArm', (0, 1.72, 0.12), (0.8, 0.03, 0.2), METAL))
p.append(tbox('lamp', (0, 1.7, 0.22), (0.7, 0.04, 0.04), GLOW))
asset('Billboard', p, dens=0.2)

# =================================================================== rooftop obstacles (origin bottom center on the roof)
# Vent: a ventilation shaft, 1 unit wide and 1 unit tall (scaled to its height by the app).
# Warning colors so it reads as an obstacle: red-orange body, a yellow cap with dark diagonal
# stripes and a glowing red strip along the top.
p = [tbox('shaft', (0, 0.47, 0), (0.9, 0.94, 1.0), HAZARD, bev=0.03)]
for k in range(5):  # louvers on the front and back
    for side in (-1, 1):
        p.append(tbox('louver', (0, 0.18 + k * 0.15, side * 0.505), (0.72, 0.05, 0.03), DARK, rot=Matrix.Rotation(side * 0.5, 3, 'X')))
p.append(tbox('cap', (0, 0.97, 0), (1.0, 0.07, 1.1), STRIPE, bev=0.02))
for k in range(5):
    for side in (-1, 1):
        p.append(tbox('hazstripe', (-0.4 + k * 0.2, 0.97, side * 0.556), (0.07, 0.075, 0.012), DARK, rot=Matrix.Rotation(0.6, 3, 'Y')))
p.append(tbox('glowstrip', (0, 1.015, 0), (0.9, 0.02, 0.9), HAZGLOW))
for x in (-0.38, 0.38):
    for side in (-1, 1):
        p.append(tcyl('bolt', (x, 0.85, side * 0.51), 0.02, 0.02, PARAPET, axis='z', segs=6))
p.append(tbox('stripe', (0, 0.06, 0.505), (0.9, 0.06, 0.012), STRIPE))
asset('Vent', p, dens=0.3)

# Antenna: a mast with cross bars, a small dish and a blinking light (about 1.4 tall). Red and
# white bands like a real radio mast and a big red warning light make it read as an obstacle.
p = [tcyl('foot', (0, 0.05, 0), 0.16, 0.1, DARK, segs=10)]
for k in range(5):
    p.append(tcyl('band', (0, 0.17 + k * 0.25 + 0.125, 0), 0.055, 0.25, HAZARD if k % 2 == 0 else FRAME, segs=10))
for k, w in enumerate((0.6, 0.45, 0.3)):
    p.append(tbox('bar', (0, 0.6 + k * 0.28, 0), (w, 0.03, 0.03), METAL))
    for sx in (-1, 1):
        p.append(tcyl('tip', (sx * w / 2, 0.6 + k * 0.28 - 0.05, 0), 0.012, 0.1, METAL, segs=5))
p.append(blob('dish', (0.12, 0.42, 0.08), 0.14, PARAPET, s=(0.4, 1, 1), segs=12, rings=6))
p.append(blob('blink', (0, 1.45, 0), 0.1, HAZGLOW, segs=10, rings=6))
asset('Antenna', p, dens=0.2)

# PowerMast: a pole with a cross arm and insulators; the wires between masts come from the app.
p = [tcyl('pole', (0, 0.9, 0), 0.06, 1.8, DARK, segs=8, r2=0.045)]
for k in range(4):  # yellow warning bands on the pole
    p.append(tcyl('band', (0, 0.25 + k * 0.38, 0), 0.068, 0.14, STRIPE, segs=8))
p.append(tbox('arm', (0, 1.62, 0), (0.08, 0.06, 1.2), DARK))
for z in (-0.45, 0.45):
    p.append(tcyl('insulator', (0, 1.55, z), 0.04, 0.12, GLOW, segs=8))
p.append(tbox('sign', (0, 0.9, 0.07), (0.22, 0.22, 0.02), STRIPE, rot=Matrix.Rotation(math.pi / 4, 3, 'Y')))
asset('PowerMast', p, dens=0.3)

# PigeonSpikes: a strip of steel needles on the roof (1 unit wide, hazard).
rnd = random.Random(97)
p = [tbox('base', (0, 0.025, 0), (0.96, 0.05, 0.56), STRIPE)]  # warning yellow
for k in range(6):  # dark diagonal stripes on the base
    p.append(tbox('hazstripe', (-0.4 + k * 0.16, 0.052, 0), (0.05, 0.006, 0.56), DARK, rot=Matrix.Rotation(0.6, 3, 'Z')))
p.append(tbox('glowstrip', (0, 0.03, 0.285), (0.96, 0.03, 0.012), HAZGLOW))
for k in range(9):
    for j in range(3):
        tilt = Matrix.Rotation(rnd.uniform(-0.35, 0.35), 3, 'X') @ Matrix.Rotation(rnd.uniform(-0.35, 0.35), 3, 'Y')
        p.append(tcyl('needle', (-0.42 + k * 0.105, 0.2, -0.18 + j * 0.18), 0.02, 0.34, HAZARD, segs=4, r2=0.0, rot=tilt))
asset('PigeonSpikes', p, dens=0.2)

# =================================================================== flyers of the upper air (origin center, look to -x)
# Helicopter: a round yellow cabin with a glass bubble, a tail boom with a fin, skids, a
# searchlight and nav lights; HeliRotor (main rotor) and HeliTail (tail rotor) spin in the app.
p = [blob('cabin', (-0.12, 0, 0), 0.42, HELI, s=(1.3, 0.9, 0.85), segs=24, rings=14)]
p.append(blob('bubble', (-0.42, 0.07, 0), 0.31, HELIGLASS, s=(1.0, 0.85, 0.92), segs=20, rings=12))
p.append(tcyl('boom', (0.75, 0.08, 0), 0.1, 1.0, HELI, axis='x', segs=12, r2=0.05))
p.append(tbox('fin', (1.22, 0.26, 0), (0.2, 0.36, 0.035), HELI, bev=0.015))
p.append(tbox('stab', (1.08, 0.1, 0), (0.14, 0.03, 0.42), HELI, bev=0.01))
p.append(tbox('band', (0.75, 0.08, 0), (0.12, 0.2, 0.2), HAZARD))
for sz in (-1, 1):
    p.append(tcyl('skid', (-0.12, -0.52, sz * 0.27), 0.025, 0.95, DARK, axis='x', segs=8))
    for x in (-0.4, 0.15):
        p.append(tcyl('strut', (x, -0.42, sz * 0.24), 0.02, 0.22, DARK, segs=6))
    p.append(blob('nav', (-0.12, -0.06, sz * 0.36), 0.045, HAZGLOW if sz < 0 else GLOW, segs=8, rings=5))
p.append(tcyl('mast', (-0.12, 0.42, 0), 0.045, 0.14, DARK, segs=8))
p.append(blob('searchlight', (-0.52, -0.3, 0), 0.07, GLOW, segs=10, rings=6))
p.append(blob('taillight', (1.32, 0.12, 0), 0.04, HAZGLOW, segs=8, rings=5))
heli = asset('Helicopter', p, dens=0.15)
q = [tbox('blade', (0, 0, 0), (2.1, 0.03, 0.13), DARK, bev=0.01), tbox('blade', (0, 0, 0), (0.13, 0.03, 2.1), DARK, bev=0.01),
     tcyl('hub', (0, 0, 0), 0.07, 0.07, METAL, segs=10)]
for k in range(4):  # warning tips on the blades
    a = k * math.pi / 2
    q.append(tbox('tip', (math.cos(a) * 0.98, 0.0, math.sin(a) * 0.98), (0.12, 0.035, 0.14), STRIPE, rot=Matrix.Rotation(-a, 3, 'Z')))
bpy.context.view_layer.update()
rotor = merge(q, 'HeliRotor')
rotor.location = P(-0.12, 0.5, 0)
rotor.parent = heli
q = [tbox('tblade', (0, 0, 0), (0.05, 0.44, 0.02), DARK), tbox('tblade', (0, 0, 0), (0.44, 0.05, 0.02), DARK)]
bpy.context.view_layer.update()
tail = merge(q, 'HeliTail')
tail.location = P(1.25, 0.24, 0.05)
tail.parent = heli

# Raven: a dark violet bird with a big beak, glowing eyes and a tuft; RavenWingL/R flap.
p = [blob('body', (0.05, 0, 0), 0.3, RAVEN, s=(1.45, 0.82, 0.85), segs=18, rings=10)]
p.append(blob('head', (-0.4, 0.16, 0), 0.19, RAVEN, s=(1.1, 1.0, 0.95), segs=14, rings=9))
p.append(cone('beak', (-0.58, 0.14, 0), 0.07, 0.0, 0.24, BEAK, segs=8))
for sz in (-1, 1):
    p.append(blob('eye', (-0.5, 0.22, sz * 0.12), 0.05, GLOW, segs=10, rings=6))
    p.append(blob('pupil', (-0.54, 0.22, sz * 0.15), 0.025, DARK, segs=8, rings=5))
    p.append(tbox('brow', (-0.5, 0.29, sz * 0.13), (0.12, 0.025, 0.03), DARK, rot=Matrix.Rotation(0.45, 3, 'Y')))
for k in range(3):  # tuft and tail fan
    p.append(blob('tuft', (-0.36 + k * 0.05, 0.36, 0), 0.06, RAVEN, s=(0.6, 1.6, 0.5), segs=8, rings=5, rot=Matrix.Rotation(0.4 - k * 0.3, 3, 'Y')))
    p.append(blob('tail', (0.45, -0.02, (k - 1) * 0.09), 0.13, RAVEN, s=(1.7, 0.22, 0.55), segs=8, rings=5))
for sz in (-1, 1):
    p.append(tcyl('leg', (0.05, -0.28, sz * 0.09), 0.02, 0.12, BEAK, segs=6))
raven = asset('Raven', p, dens=0.12)
for sz, name in ((1, 'RavenWingR'), (-1, 'RavenWingL')):
    q = [blob('wing', (0, 0, sz * 0.42), 0.26, RAVEN, s=(1.25, 0.2, 1.75), segs=12, rings=7)]
    for k in range(4):  # ragged primaries
        q.append(blob('feather', (0.12 + k * 0.08, -0.02, sz * (0.8 + k * 0.04)), 0.1, RAVEN, s=(0.55, 0.18, 1.7), segs=8, rings=5))
    bpy.context.view_layer.update()
    w = merge(q, name)
    w.location = P(0.0, 0.1, sz * 0.16)
    w.parent = raven

# =================================================================== bake, layout, export
bake_ao(ASSETS, {'CityWindowGlow', 'CityGlow', 'CityHazardGlow'}, distance=0.35)
for i, (ob, _) in enumerate(ASSETS):
    ob.location.x += (i % 6) * 5.0
    ob.location.y += (i // 6) * 10.0
print('assets', [(ob.name, len(ob.data.polygons)) for ob, _ in ASSETS])
print('faces total', sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH'))
export(OUT_GLB, OUT_BLEND)
print('DONE')

# Builds the office for Echo Parkour level 2 (original designs, warm modern office):
#   room:   FloorTile (1 unit, carpet), CeilingPanel (2 units, light panels), wall modules of
#           4 units: WallWindow (big window), WallPlain (felt panels, art), WallBoard
#           (whiteboard and clock), WallLogo (backlit sign, LogoSpot for the Echomotion logo)
#   props:  Desk (+ DeskScreen with UVs for the app's screen texture), Chair, Cabinet, Shelf,
#           DuctBody (1 unit, stretched in y) + DuctCap, LampCord (1 unit, stretched) +
#           LampShade, Plant, Partition, Counter, CoffeeMachine, Fridge, MeetingTable,
#           Whiteboard, Printer, GlassTransom, Cables (hazard)
# Units as in level 1: 1 = one block, Echo is about one block tall, the floor is y = 0, the
# ceiling y = 6.4, the track is 1.8 deep (z), the back wall stands at z = -1.45. Props stand on
# the floor with their origin at the bottom center; ceiling parts hang from their origin.
# Light parts use materials named *Glow (tinted by the app); AO is baked into vertex colors.
# Usage: blender -b -P build_office.py -- <out.glb> <out.blend>
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, merge, bake_ao, export

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
D2 = 0.9
WALL_Z = -1.45
CEIL = 6.4
random.seed(23)
init()

WALL = material('OfWall', (0.95, 0.92, 0.85), 0.0, 0.85)
WALL2 = material('OfWallDark', (0.88, 0.8, 0.68), 0.0, 0.8)
WHITE = material('OfWhite', (0.96, 0.97, 0.99), 0.05, 0.35)
WOOD = material('OfWood', (0.54, 0.35, 0.23), 0.0, 0.45)
METAL = material('OfMetal', (0.56, 0.6, 0.68), 0.9, 0.3)
DARK = material('OfDark', (0.29, 0.32, 0.38), 0.6, 0.4)
FABRIC = material('OfFabric', (0.31, 0.19, 0.8), 0.0, 0.9)
CARPET = material('OfCarpet', (0.14, 0.19, 0.31), 0.0, 0.95)
BASE = material('OfFloorBase', (0.05, 0.07, 0.13), 0.3, 0.6)
GLASS = material('OfGlass', (0.35, 0.85, 1.0), 0.0, 0.05)
PLANT = material('OfPlant', (0.25, 0.62, 0.29), 0.0, 0.6)
PLANT2 = material('OfPlantDark', (0.14, 0.38, 0.17), 0.0, 0.6)
BOOKS = [material(f'OfBook{i}', c, 0.0, 0.6) for i, c in enumerate([(0.49, 0.36, 1.0), (1.0, 0.48, 0.56), (1.0, 0.78, 0.36), (0.13, 0.76, 0.96)], start=1)]
PAPER = material('OfPaper', (0.98, 0.98, 0.98), 0.0, 0.7)
LIGHT = material('OfLightGlow', (0, 0, 0), emit=(1, 0.97, 0.9))
SCREEN = material('OfScreenGlow', (0, 0, 0), emit=(0.4, 0.85, 1.0))
SPARK = material('OfSparkGlow', (0, 0, 0), emit=(1.0, 0.33, 0.44))
SIGN = material('OfSignGlow', (0, 0, 0), emit=(0.6, 0.52, 1.0))
SHIRT = material('OfShirt', (1, 1, 1), 0.0, 0.8)     # tinted per participant by the app
SKIN = material('OfSkin', (0.95, 0.76, 0.62), 0.0, 0.6)
HAIR = material('OfHair', (0.24, 0.16, 0.1), 0.0, 0.7)

ASSETS = []


def asset(name, parts, dens=0.18):
    bpy.context.view_layer.update()  # object transforms (location, rotation) into matrix_world
    ob = merge(parts, name)
    ASSETS.append((ob, dens))
    return ob


def plane_uv(name, c, w, h, mat, facing=1):
    """A flat rectangle facing +z (or -z) with UVs 0..1, for textures set by the app."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(P(c[0] + dx * w / 2, c[1] + dy * h / 2, c[2])) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs if facing > 0 else list(reversed(vs)))
    for loop in f.loops:
        x = (loop.vert.co.x - (c[0] - w / 2)) / w
        y = (loop.vert.co.z - (c[1] - h / 2)) / h
        loop[uv].uv = (x if facing > 0 else 1 - x, y)
    return link(name, bm, mat)


def sphere(name, c, r, mat, sx=1, sy=1, sz=1, segs=12):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=r)
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, mat)
    for pl in ob.data.polygons:
        pl.use_smooth = True
    return ob


def chair(cx, cz, turn=0.0):
    """Office chair: star base with casters, gas lift, seat, backrest and armrests."""
    p = []
    rot = Matrix.Rotation(turn, 3, 'Z')
    def at(x, y, z):
        v = rot @ Vector((x, -z, y))
        return (cx + v.x, v.z, cz - v.y)
    for i in range(5):
        a = 2 * math.pi * i / 5
        ex, ez = math.cos(a) * 0.38, math.sin(a) * 0.38
        p.append(tbox('leg', at(ex / 2, 0.1, ez / 2), (0.38, 0.05, 0.07), DARK, rot=Matrix.Rotation(-a + turn, 3, 'Z')))
        p.append(sphere('caster', at(ex, 0.05, ez), 0.05, DARK, segs=8))
    p.append(tcyl('lift', at(0, 0.4, 0), 0.04, 0.6, METAL, segs=10))
    p.append(tbox('seat', at(0, 0.75, 0), (0.62, 0.1, 0.6), FABRIC, bev=0.04, rot=rot))
    p.append(tbox('back', at(0, 1.2, -0.32), (0.58, 0.72, 0.08), FABRIC, bev=0.04, rot=rot))
    p.append(tbox('spine', at(0, 0.95, -0.3), (0.08, 0.4, 0.05), DARK, rot=rot))
    for s in (-1, 1):
        p.append(tbox('arm', at(s * 0.33, 0.95, 0.02), (0.05, 0.05, 0.42), DARK, bev=0.015, rot=rot))
        p.append(tbox('armpost', at(s * 0.33, 0.85, -0.05), (0.04, 0.2, 0.04), DARK, rot=rot))
    return p


# =================================================================== room
# FloorTile: 1 unit, top at y = 0, carpet on a dark base, trim at the front
p = [tbox('base', (0, -0.16, -0.25), (1.0, 0.3, 2.6), BASE),
     tbox('carpet', (0, -0.005, -0.27), (0.985, 0.02, 2.36), CARPET, bev=0.006),
     tbox('trim', (0, -0.03, 1.03), (1.0, 0.06, 0.04), METAL)]
asset('FloorTile', p, dens=0.3)

# CeilingPanel: 2 units, hangs from y = 0 (its underside), grid bars and two light panels
p = [tbox('slab', (0, 0.15, -0.45), (2.0, 0.3, 2.0), WALL),
     tbox('bar', (0, -0.015, -0.45), (2.0, 0.03, 0.06), METAL),
     tbox('bar', (0, -0.015, 0.45), (2.0, 0.03, 0.06), METAL)]
for x in (-0.5, 0.5):
    p.append(tbox('light', (x, -0.005, -0.45), (0.8, 0.012, 0.75), LIGHT))
asset('CeilingPanel', p, dens=0.3)


def wall_base(p, name):
    """Lower edge, columns at both sides and the ceiling cove of a 4-unit wall module."""
    p.append(tbox('skirt', (0, 0.12, WALL_Z + 0.03), (4.0, 0.24, 0.06), WOOD))
    for s in (-1, 1):
        p.append(tbox('pilaster', (s * 1.92, CEIL / 2, WALL_Z + 0.05), (0.16, CEIL, 0.1), WALL2, bev=0.02))
    p.append(tbox('cove', (0, CEIL - 0.08, WALL_Z + 0.06), (4.0, 0.16, 0.12), WALL2))


# WallWindow: big window with mullions and a sill
p = []
p.append(tbox('below', (0, 0.8, WALL_Z - 0.1), (4.0, 1.6, 0.2), WALL))
p.append(tbox('above', (0, 5.9, WALL_Z - 0.1), (4.0, 1.0, 0.2), WALL))
for s in (-1, 1):
    p.append(tbox('side', (s * 1.775, 3.5, WALL_Z - 0.1), (0.45, 3.8, 0.2), WALL))
p.append(tbox('sill', (0, 1.58, WALL_Z + 0.06), (3.3, 0.06, 0.24), WHITE, bev=0.01))
for x in (-1.55, 1.55):
    p.append(tbox('frameV', (x, 3.5, WALL_Z - 0.05), (0.08, 3.8, 0.1), DARK))
for y in (1.62, 5.38):
    p.append(tbox('frameH', (0, y, WALL_Z - 0.05), (3.18, 0.08, 0.1), DARK))
p.append(tbox('mullion', (0, 3.5, WALL_Z - 0.06), (0.06, 3.7, 0.08), DARK))
p.append(tbox('transom', (0, 4.3, WALL_Z - 0.06), (3.1, 0.05, 0.08), DARK))
p.append(tbox('glass', (0, 3.5, WALL_Z - 0.12), (3.1, 3.7, 0.01), GLASS))
wall_base(p, 'WallWindow')
asset('WallWindow', p, dens=0.4)

# WallPlain: felt panels and an art print
p = [tbox('wall', (0, CEIL / 2, WALL_Z - 0.1), (4.0, CEIL, 0.2), WALL)]
for i, x in enumerate((-1.2, -0.4, 0.4)):
    p.append(tbox('felt', (x, 3.4, WALL_Z + 0.02), (0.7, 2.6, 0.04), FABRIC if i != 1 else WALL2, bev=0.02))
p.append(tbox('artframe', (1.35, 3.6, WALL_Z + 0.02), (0.9, 1.2, 0.04), DARK))
p.append(tbox('art', (1.35, 3.6, WALL_Z + 0.045), (0.78, 1.08, 0.01), PAPER))
for j, (dx, dy, w, h) in enumerate([(-0.15, 0.2, 0.4, 0.4), (0.15, -0.15, 0.3, 0.5), (0.05, 0.3, 0.2, 0.2)]):
    p.append(tbox('shape', (1.35 + dx, 3.6 + dy, WALL_Z + 0.055), (w, h, 0.01), BOOKS[j]))
wall_base(p, 'WallPlain')
asset('WallPlain', p, dens=0.4)

# WallBoard: whiteboard with marker sketches and a wall clock
p = [tbox('wall', (0, CEIL / 2, WALL_Z - 0.1), (4.0, CEIL, 0.2), WALL),
     tbox('board', (-0.4, 3.2, WALL_Z + 0.03), (2.6, 1.7, 0.04), WHITE, bev=0.01),
     tbox('tray', (-0.4, 2.32, WALL_Z + 0.08), (2.0, 0.04, 0.1), METAL)]
for k, (x0, y0, x1, y1) in enumerate([(-1.4, 3.6, -0.6, 3.6), (-1.4, 3.4, -0.9, 3.4), (-0.4, 2.8, 0.6, 3.8), (-0.4, 3.8, 0.6, 2.8)]):
    L = math.hypot(x1 - x0, y1 - y0)
    a = math.atan2(y1 - y0, x1 - x0)
    p.append(tbox('stroke', ((x0 + x1) / 2, (y0 + y1) / 2, WALL_Z + 0.055), (L, 0.035, 0.01), BOOKS[k % 4], rot=Matrix.Rotation(-a, 3, 'Y')))
p.append(tcyl('clock', (1.4, 4.4, WALL_Z + 0.04), 0.38, 0.06, WHITE, axis='z', segs=32))
p.append(ttorus('rim', (1.4, 4.4, WALL_Z + 0.06), 0.38, 0.03, DARK, axis='z', segs=32, tsegs=6))
p.append(tbox('hand1', (1.4, 4.52, WALL_Z + 0.08), (0.03, 0.24, 0.01), DARK))
p.append(tbox('hand2', (1.5, 4.4, WALL_Z + 0.08), (0.2, 0.025, 0.01), DARK))
wall_base(p, 'WallBoard')
asset('WallBoard', p, dens=0.4)

# WallLogo: backlit sign plate (the app puts the Echomotion logo at LogoSpot)
p = [tbox('wall', (0, CEIL / 2, WALL_Z - 0.1), (4.0, CEIL, 0.2), WALL2),
     tbox('plate', (0, 3.6, WALL_Z + 0.05), (2.2, 2.2, 0.08), DARK, bev=0.04),
     tbox('edge', (0, 3.6, WALL_Z + 0.005), (2.4, 2.4, 0.01), SIGN)]
wall_base(p, 'WallLogo')
wl = asset('WallLogo', p, dens=0.4)
spot = bpy.data.objects.new('LogoSpot', None)
bpy.context.scene.collection.objects.link(spot)
spot.location = P(0, 3.6, WALL_Z + 0.1)
spot.parent = wl

# =================================================================== props
# Desk (2.2 long): top, frame, drawer unit, monitor, keyboard, mouse, mug
p = [tbox('top', (0, 1.4, -0.1), (2.2, 0.08, 1.1), WOOD, bev=0.02)]
for sx in (-1, 1):
    p.append(tbox('legL', (sx * 1.0, 0.68, -0.1), (0.06, 1.36, 0.9), METAL, bev=0.01))
p.append(tbox('modesty', (0, 0.95, -0.55), (1.9, 0.7, 0.03), METAL))
p.append(tbox('drawers', (0.7, 0.68, -0.12), (0.55, 1.3, 0.8), WHITE, bev=0.02))
for k in range(3):
    p.append(tbox('handle', (0.7, 0.35 + k * 0.4, 0.29), (0.25, 0.03, 0.03), METAL))
p.append(tbox('mstand', (-0.1, 1.55, -0.45), (0.08, 0.22, 0.06), METAL))
p.append(tbox('mfoot', (-0.1, 1.45, -0.42), (0.36, 0.02, 0.22), METAL))
p.append(tbox('monitor', (-0.1, 2.0, -0.46), (1.1, 0.68, 0.05), DARK, bev=0.015))
p.append(tbox('keyboard', (-0.1, 1.46, 0.08), (0.7, 0.03, 0.22), DARK, bev=0.01))
p.append(tbox('mouse', (0.4, 1.46, 0.1), (0.07, 0.03, 0.11), DARK, bev=0.015))
p.append(tcyl('mug', (0.75, 1.52, 0.15), 0.06, 0.16, WHITE, segs=14))
p.append(ttorus('mughandle', (0.82, 1.52, 0.15), 0.04, 0.012, WHITE, axis='z', segs=12, tsegs=5))
desk = asset('Desk', p, dens=0.18)
scr = plane_uv('DeskScreen', (-0.1, 2.0, -0.43), 1.0, 0.58, SCREEN)
scr.parent = desk

# Chair (facing the viewer, a little turned)
asset('Chair', chair(0, 0, 0.35), dens=0.15)

# Cabinet (1.0 wide, 2.2 high): four drawers with handles and label slots
p = [tbox('body', (0, 1.1, -0.1), (1.0, 2.2, 0.9), WHITE, bev=0.03)]
for k in range(4):
    y = 0.3 + k * 0.52
    p.append(tbox('drawer', (0, y, 0.36), (0.9, 0.46, 0.02), WHITE, bev=0.01))
    p.append(tbox('handle', (0, y + 0.08, 0.38), (0.35, 0.04, 0.04), METAL))
    p.append(tbox('label', (0, y - 0.1, 0.375), (0.22, 0.08, 0.01), PAPER))
asset('Cabinet', p, dens=0.2)

# Shelf (1.4 wide, 2.6 high): wood frame with books
p = []
for sx in (-1, 1):
    p.append(tbox('side', (sx * 0.68, 1.3, -0.3), (0.06, 2.6, 0.7), WOOD))
for y in (0.05, 0.9, 1.75, 2.57):
    p.append(tbox('board', (0, y, -0.3), (1.4, 0.06, 0.7), WOOD))
p.append(tbox('back', (0, 1.3, -0.64), (1.4, 2.6, 0.02), WOOD))
for y in (0.08, 0.93, 1.78):
    x = -0.6
    while x < 0.55:
        w = random.uniform(0.06, 0.12)
        h = random.uniform(0.45, 0.72)
        lean = random.random() < 0.12
        p.append(tbox('book', (x + w / 2, y + h / 2 + 0.03, -0.32), (w, h, random.uniform(0.38, 0.5)), random.choice(BOOKS),
                      rot=Matrix.Rotation(0.18, 3, 'Y') if lean else None))
        x += w + random.uniform(0.0, 0.02)
asset('Shelf', p, dens=0.2)

# Duct from the ceiling: DuctBody (y in [-1, 0], stretched) and DuctCap (grille and light)
p = [tbox('body', (0, -0.5, -0.2), (1.6, 1.0, 1.2), METAL)]
for x in (-0.6, -0.2, 0.2, 0.6):
    p.append(tbox('rib', (x, -0.5, 0.405), (0.06, 0.999, 0.03), DARK))
asset('DuctBody', p, dens=0.3)
p = [tbox('cap', (0, -0.12, -0.2), (1.7, 0.24, 1.3), METAL, bev=0.03)]
for i in range(6):
    p.append(tbox('slot', (-0.6 + i * 0.24, -0.245, -0.2), (0.12, 0.01, 1.0), DARK))
p.append(tbox('lip', (0, -0.15, 0.455), (1.5, 0.04, 0.02), LIGHT))
asset('DuctCap', p, dens=0.2)

# Pendant lamp: LampCord (y in [-1, 0], stretched) and LampShade (hangs from y = 0)
asset('LampCord', [tcyl('cord', (0, -0.5, -0.1), 0.015, 1.0, DARK, segs=6)], dens=0.5)
p = [tcyl('cap', (0, -0.05, -0.1), 0.08, 0.1, METAL, segs=14),
     tcyl('shade', (0, -0.3, -0.1), 0.5, 0.42, DARK, r2=0.12, segs=28),  # wide at the bottom
     tcyl('bulb', (0, -0.5, -0.1), 0.42, 0.02, LIGHT, segs=28)]
asset('LampShade', p, dens=0.15)

# Plant (about 2 high): pot, soil and leaves
p = [tcyl('pot', (0, 0.35, -0.1), 0.3, 0.7, WHITE, r2=0.38, segs=20, bev=0.02),  # wider at the top
     tcyl('soil', (0, 0.69, -0.1), 0.34, 0.02, BASE, segs=20)]
for i in range(14):
    a = 2 * math.pi * i / 14 + random.uniform(-0.2, 0.2)
    tilt = random.uniform(0.35, 0.9)
    L = random.uniform(0.8, 1.3)
    c = Vector((math.cos(a) * math.sin(tilt) * L * 0.5, 0.7 + math.cos(tilt) * L * 0.5, -0.1 + math.sin(a) * math.sin(tilt) * L * 0.5))
    # built at the origin, then placed and tilted around its own center
    leaf = sphere('leaf', (0, 0, 0), 1.0, PLANT if i % 3 else PLANT2, sx=0.12, sy=L * 0.5, sz=0.03, segs=10)
    leaf.location = P(c.x, c.y, c.z)
    leaf.rotation_euler = (math.sin(a) * tilt, -math.cos(a) * tilt, 0)
    p.append(leaf)
asset('Plant', p, dens=0.15)

# Partition (cubicle panel across the track, 3 high)
p = [tbox('frame', (0, 1.5, 0), (0.24, 3.0, 1.7), METAL, bev=0.03),
     tbox('felt', (0, 1.5, 0), (0.26, 2.8, 1.55), FABRIC, bev=0.02),
     tbox('rail', (0, 3.02, 0), (0.28, 0.06, 1.72), WHITE, bev=0.01)]
asset('Partition', p, dens=0.2)

# Kitchen: Counter (3 wide, 1.5 high), CoffeeMachine, Fridge
p = [tbox('body', (0, 0.72, -0.15), (3.0, 1.44, 1.0), WHITE, bev=0.02),
     tbox('top', (0, 1.47, -0.12), (3.06, 0.06, 1.08), WOOD, bev=0.01),
     tbox('sink', (-0.8, 1.46, -0.15), (0.7, 0.04, 0.5), METAL),
     tcyl('tap', (-0.8, 1.7, -0.5), 0.03, 0.45, METAL, segs=8)]
for x in (-1.0, 0.0, 1.0):
    p.append(tbox('door', (x, 0.7, 0.36), (0.94, 1.3, 0.02), WHITE, bev=0.01))
    p.append(tbox('handle', (x + 0.35, 1.1, 0.39), (0.04, 0.3, 0.04), METAL))
asset('Counter', p, dens=0.2)
p = [tbox('body', (0, 0.55, -0.15), (0.8, 1.1, 0.7), DARK, bev=0.04),
     tbox('spout', (0, 0.75, 0.22), (0.3, 0.12, 0.12), METAL),
     tbox('display', (0, 0.95, 0.205), (0.4, 0.14, 0.01), SCREEN),
     tcyl('cup', (0, 0.32, 0.22), 0.07, 0.16, WHITE, segs=14),
     tbox('drip', (0, 0.22, 0.22), (0.4, 0.04, 0.2), METAL)]
asset('CoffeeMachine', p, dens=0.15)
p = [tbox('body', (0, 1.7, -0.15), (1.2, 3.4, 1.0), WHITE, bev=0.04),
     tbox('split', (0, 2.3, 0.355), (1.18, 0.03, 0.02), METAL),
     tbox('h1', (0.45, 2.8, 0.38), (0.05, 0.6, 0.05), METAL),
     tbox('h2', (0.45, 1.8, 0.38), (0.05, 0.6, 0.05), METAL)]
asset('Fridge', p, dens=0.25)

# MeetingTable (6 long, 1.3 high) with two chairs behind it
p = [tbox('top', (0, 1.27, -0.1), (6.0, 0.08, 1.4), WOOD, bev=0.03),
     tbox('pedA', (-2.0, 0.63, -0.1), (0.3, 1.2, 0.8), METAL, bev=0.02),
     tbox('pedB', (2.0, 0.63, -0.1), (0.3, 1.2, 0.8), METAL, bev=0.02),
     tbox('cable', (0, 1.31, -0.1), (0.5, 0.02, 0.2), DARK)]
for x in (-1.2, 1.2):
    p.extend(chair(x, -0.95, math.pi))
asset('MeetingTable', p, dens=0.25)

# Whiteboard on a stand (2.4 wide, 3.2 high)
p = [tbox('board', (0, 2.2, 0), (2.4, 1.6, 0.06), WHITE, bev=0.02),
     tbox('frame', (0, 2.2, -0.02), (2.5, 1.7, 0.04), METAL)]
for sx in (-1, 1):
    p.append(tbox('post', (sx * 1.15, 1.5, -0.05), (0.06, 3.0, 0.06), METAL))
    p.append(tbox('foot', (sx * 1.15, 0.06, -0.05), (0.08, 0.06, 0.8), METAL))
    for sz in (-1, 1):
        p.append(sphere('wheel', (sx * 1.15, 0.05, -0.05 + sz * 0.38), 0.05, DARK, segs=8))
for k, (x0, y0, x1, y1) in enumerate([(-0.9, 2.6, 0.2, 2.6), (-0.9, 2.3, -0.2, 2.3), (0.4, 1.8, 0.9, 2.6), (-0.8, 1.8, 0.0, 1.8)]):
    L = math.hypot(x1 - x0, y1 - y0)
    a = math.atan2(y1 - y0, x1 - x0)
    p.append(tbox('stroke', ((x0 + x1) / 2, (y0 + y1) / 2, 0.035), (L, 0.04, 0.01), BOOKS[k % 4], rot=Matrix.Rotation(-a, 3, 'Y')))
asset('Whiteboard', p, dens=0.2)

# Printer (1.4 wide, 1.3 high) with paper and a status light
p = [tbox('body', (0, 0.55, -0.1), (1.4, 1.1, 0.9), WHITE, bev=0.04),
     tbox('lid', (0, 1.15, -0.1), (1.3, 0.12, 0.8), DARK, bev=0.03),
     tbox('tray', (0, 0.9, 0.42), (0.9, 0.04, 0.3), WHITE),
     tbox('paper', (0, 0.94, 0.42), (0.8, 0.03, 0.26), PAPER),
     tbox('panel', (0.45, 1.05, 0.355), (0.3, 0.12, 0.01), SCREEN),
     tbox('slot', (0, 0.35, 0.355), (1.0, 0.04, 0.01), DARK)]
asset('Printer', p, dens=0.2)

# GlassTransom: glass partition above a door (y from 3.4 to the ceiling) and door posts
p = []
for sz in (-1, 1):
    p.append(tbox('post', (0, CEIL / 2, sz * (D2 + 0.12)), (0.14, CEIL, 0.14), DARK))
p.append(tbox('header', (0, 3.45, 0), (0.18, 0.12, 2.1), DARK))
p.append(tbox('glass', (0, 4.9, 0), (0.02, 2.8, 1.9), GLASS))
p.append(tbox('mullion', (0, 4.9, 0), (0.06, 2.8, 0.05), DARK))
p.append(tbox('top', (0, CEIL - 0.06, 0), (0.18, 0.12, 2.1), DARK))
asset('GlassTransom', p, dens=0.3)

# Cables (hazard): a tangle of loops with sparks
p = []
for i in range(5):
    a = i * 1.1
    c = (math.cos(a) * 0.18, 0.12 + 0.05 * (i % 2), math.sin(a) * 0.4)
    t = ttorus('loop', (0, 0, 0), 0.2 + 0.04 * i, 0.025, DARK, axis='y', segs=20, tsegs=6)
    t.location = P(*c)
    t.rotation_euler = (random.uniform(-0.6, 0.6), 0, random.uniform(-0.5, 0.5))
    p.append(t)
for i in range(6):
    p.append(sphere('spark', (random.uniform(-0.35, 0.35), random.uniform(0.15, 0.45), random.uniform(-0.6, 0.6)), 0.05, SPARK, segs=6))
asset('Cables', p, dens=0.12)

# =================================================================== ceiling fan (hazard) and the AI workshop at the goal
# CeilingFan: hangs from its origin at the ceiling; the blades are a child node 'FanBlades'.
p = [tcyl('rod', (0, -0.28, 0), 0.025, 0.56, DARK, segs=8)]
p.append(tcyl('canopy', (0, -0.03, 0), 0.1, 0.06, WHITE, segs=14))
p.append(tcyl('motor', (0, -0.6, 0), 0.17, 0.16, WHITE, segs=18))
p.append(sphere('bowl', (0, -0.72, 0), 0.12, LIGHT, sy=0.6, segs=14))
fan = asset('CeilingFan', p, dens=0.15)
q = []
for k in range(4):
    a = k * math.pi / 2
    rot = Matrix.Rotation(a, 3, 'Z')
    q.append(tbox('blade', (math.cos(a) * 0.48, 0, -math.sin(a) * 0.48), (0.7, 0.02, 0.17), WOOD, bev=0.008, rot=rot))
    q.append(tbox('holder', (math.cos(a) * 0.15, 0.01, -math.sin(a) * 0.15), (0.2, 0.025, 0.05), METAL, rot=rot))
bpy.context.view_layer.update()
blades = merge(q, 'FanBlades')
blades.location = P(0, -0.62, 0)
blades.parent = fan

# WorkshopScreen: a presentation screen on two legs (origin bottom center), picture plane child.
p = []
for x in (-0.95, 0.95):
    p.append(tcyl('leg', (x, 1.1, 0), 0.04, 2.2, DARK, segs=8))
    p.append(tbox('foot', (x, 0.03, 0), (0.12, 0.06, 0.6), DARK))
p.append(tbox('frame', (0, 2.45, -0.02), (2.3, 1.36, 0.07), DARK, bev=0.02))
p.append(tbox('lightbar', (0, 3.17, 0.03), (2.0, 0.05, 0.05), LIGHT))
screen = asset('WorkshopScreen', p, dens=0.3)
pic = plane_uv('WorkshopPicture', (0, 2.45, 0.02), 2.14, 1.2, SCREEN)
pic.parent = screen

# Flipchart: an easel with paper, marker strokes and a pen tray.
p = []
for x, z in ((-0.35, 0.12), (0.35, 0.12), (0.0, -0.3)):
    p.append(tcyl('leg', (x * 0.9, 0.85, z * 0.6), 0.025, 1.75, WOOD, segs=6, rot=Matrix.Rotation(x * 0.15, 3, 'Y') @ Matrix.Rotation(-z * 0.3, 3, 'X')))
p.append(tbox('board', (0, 1.45, 0.1), (0.78, 1.0, 0.03), WHITE, bev=0.01, rot=Matrix.Rotation(-0.08, 3, 'X')))
p.append(tbox('paper', (0, 1.47, 0.125), (0.7, 0.9, 0.01), PAPER, rot=Matrix.Rotation(-0.08, 3, 'X')))
for k, (w, mat) in enumerate(((0.5, BOOKS[0]), (0.36, BOOKS[1]), (0.44, BOOKS[3]), (0.3, BOOKS[2]))):
    p.append(tbox('stroke', (-0.3 + w / 2, 1.78 - k * 0.17, 0.135), (w, 0.04, 0.008), mat, rot=Matrix.Rotation(-0.08, 3, 'X')))
p.append(tcyl('roll', (0, 1.97, 0.09), 0.04, 0.8, PAPER, axis='x', segs=10))
p.append(tbox('tray', (0, 0.95, 0.18), (0.72, 0.03, 0.08), WOOD))
asset('Flipchart', p, dens=0.2)

# Participant: a person seated on an office chair (facing +z; the app turns them to the screen).
p = chair(0, 0, 0.0)
p.append(tbox('thighs', (0, 0.88, 0.1), (0.42, 0.15, 0.48), DARK, bev=0.05))
for sx in (-1, 1):
    p.append(tbox('shin', (sx * 0.11, 0.55, 0.36), (0.14, 0.52, 0.14), DARK, bev=0.04))
    p.append(tbox('shoe', (sx * 0.11, 0.3, 0.42), (0.14, 0.08, 0.24), DARK, bev=0.03))
p.append(sphere('torso', (0, 1.25, -0.06), 0.25, SHIRT, sy=1.5, sz=0.75, segs=16))
p.append(sphere('head', (0, 1.74, -0.02), 0.18, SKIN, segs=16))
p.append(sphere('hair', (0, 1.8, -0.05), 0.185, HAIR, sy=0.75, segs=16))
for sx in (-1, 1):
    p.append(sphere('eye', (sx * 0.06, 1.76, 0.15), 0.025, DARK, segs=8))
    p.append(tcyl('arm', (sx * 0.28, 1.18, 0.06), 0.06, 0.46, SHIRT, segs=8, rot=Matrix.Rotation(0.5, 3, 'X')))
    p.append(sphere('hand', (sx * 0.27, 1.0, 0.24), 0.06, SKIN, segs=8))
asset('Participant', p, dens=0.15)

# =================================================================== bake, layout, export
bake_ao(ASSETS, {'OfLightGlow', 'OfScreenGlow', 'OfSparkGlow', 'OfSignGlow'}, distance=0.4)
for i, (ob, _) in enumerate(ASSETS):
    ob.location.x += (i % 6) * 8.0
    ob.location.y += (i // 6) * 8.0
print('assets', [(ob.name, len(ob.data.polygons)) for ob, _ in ASSETS])
print('faces total', sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH'))
export(OUT_GLB, OUT_BLEND)
print('DONE')

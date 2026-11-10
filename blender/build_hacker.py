# The hacker of Datenflug (original cartoon design in the style of the game coins): a hooded
# figure that floats like a little ghost (the hoodie tapers into a curled tail), a dark face in
# the hood with two angry glowing eyes and a sly grin, hoodie strings, gloved hands on a floating
# laptop. The laptop lid faces the player and shows a glowing broken padlock; the screen lights
# the face from below.
#   Hacker   the whole figure (origin at the body center, front = +z three.js, height ~1.2)
# Materials (tinted from the design tokens by the app): HackerHoodie, HackerShadow, HackerGlove,
# HackerString, HackerLaptop, HackerGlow (eyes, grin, emblem), HackerScreen. Ambient occlusion
# is baked into the vertex colors.
# Usage: blender -b -P build_hacker.py -- <out.glb> <out.blend>
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, merge, bake_ao, export, blob

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
PREVIEW = ARGS[2] if len(ARGS) > 2 else None  # optional folder for preview renders
init()

HOODIE = material('HackerHoodie', (0.23, 0.23, 0.39), 0.0, 0.75)
SHADOW = material('HackerShadow', (0.01, 0.01, 0.02), 0.0, 0.9)
GLOVE = material('HackerGlove', (0.05, 0.07, 0.13), 0.0, 0.6)
STRING = material('HackerString', (0.79, 0.82, 0.89), 0.0, 0.6)
LAPTOP = material('HackerLaptop', (0.56, 0.6, 0.68), 0.8, 0.3)
GLOW = material('HackerGlow', (0, 0, 0), emit=(1.0, 0.18, 0.25))
SCREEN = material('HackerScreen', (0, 0, 0), emit=(1.0, 0.48, 0.56))

ASSETS = []


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def lathe(name, prof, mat, segs=40, bend=None):
    """Surface of revolution around the three.js y axis from [(radius, y)]; bend(y) -> z offset."""
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            x, z = math.sin(a) * r, math.cos(a) * r
            dz = bend(y) if bend else 0.0
            ring.append(bm.verts.new(P(x, y, z + dz)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, mat))


def tube(name, pts, r, mat, sides=10):
    """A tube through three.js points with radius r (or a list of radii)."""
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
    return smooth(link(name, bm, mat))


p = []
# Body: the hoodie tapers into a ghost tail that curls backwards.
body = [(0.02, -0.62), (0.07, -0.56), (0.13, -0.44), (0.19, -0.3), (0.25, -0.14), (0.3, 0.02), (0.32, 0.12), (0.3, 0.2), (0.22, 0.26), (0.1, 0.29)]
p.append(lathe('body', body, HOODIE, bend=lambda y: -0.55 * max(0.0, -y - 0.05) ** 2))
# Pocket seam on the belly (kangaroo pocket).
p.append(ttorus('pocket', (0, -0.12, 0.255), 0.11, 0.012, HOODIE, axis='z', segs=32, tsegs=6, arc=math.pi))

# Hood: a shell with a front opening, a dark inside, a pointy tip at the back.
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=0.3)
bmesh.ops.scale(bm, vec=Vector((1.0, 1.05, 1.1)), verts=bm.verts)
# Opening: faces looking at the player within an oval.
kill = [f for f in bm.faces if (f.calc_center_median().y < -0.12 and abs(f.calc_center_median().x) < 0.2 and abs(f.calc_center_median().z) < 0.19)]
bmesh.ops.delete(bm, geom=kill, context='FACES')
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.035)
bmesh.ops.translate(bm, vec=P(0, 0.42, 0.0), verts=bm.verts)
p.append(smooth(link('hood', bm, HOODIE)))
p.append(blob('face', (0, 0.42, 0.0), 0.255, SHADOW, s=(1, 1.08, 1.05), segs=28, rings=18))
p.append(tcyl('tip', (0, 0.66, -0.2), 0.09, 0.22, HOODIE, segs=16, r2=0.0, rot=Matrix.Rotation(-0.9, 3, 'X')))
# Rim around the opening.
p.append(ttorus('rim', (0, 0.42, 0.29), 0.2, 0.03, HOODIE, axis='z', segs=40, tsegs=8))
# Angry eyes (slanted) and a sly grin.
for s in (-1, 1):
    p.append(blob('eye', (s * 0.085, 0.45, 0.255), 0.045, GLOW, s=(1.2, 0.8, 0.5), segs=16, rings=10, rot=Matrix.Rotation(-s * 0.42, 3, 'Y')))
    # Angry brows: dark slashes slanting down towards the middle.
    p.append(tbox('brow', (s * 0.085, 0.5, 0.262), (0.1, 0.022, 0.02), SHADOW, rot=Matrix.Rotation(-s * 0.5, 3, 'Y')))
grin = [(math.sin(a) * 0.09, 0.355 - math.cos(a) * 0.035 + 0.03, 0.255) for a in [(-0.9 + 1.8 * i / 10) for i in range(11)]]
p.append(tube('grin', grin, [0.006, 0.01, 0.012, 0.013, 0.013, 0.013, 0.013, 0.013, 0.012, 0.01, 0.006], GLOW, sides=8))
# Hoodie strings with metal tips.
for s in (-1, 1):
    p.append(tube('string', [(s * 0.07, 0.25, 0.31), (s * 0.075, 0.15, 0.335), (s * 0.07, 0.06, 0.33)], 0.009, STRING, sides=8))
    p.append(tcyl('aglet', (s * 0.07, 0.035, 0.33), 0.013, 0.05, STRING, segs=10))

# Arms in sleeves reaching to the keyboard, gloved hands.
for s in (-1, 1):
    p.append(tube('sleeve', [(s * 0.27, 0.12, 0.05), (s * 0.31, 0.0, 0.17), (s * 0.2, -0.07, 0.33)], [0.07, 0.065, 0.06], HOODIE, sides=14))
    p.append(ttorus('cuff', (s * 0.2, -0.07, 0.33), 0.055, 0.016, HOODIE, axis='z', segs=20, tsegs=6))
    p.append(blob('hand', (s * 0.17, -0.1, 0.39), 0.055, GLOVE, s=(1.0, 0.7, 1.15), segs=16, rings=10))

# Floating laptop: base with a keyboard, lid tilted towards the hacker, screen inside.
LY, LZ = -0.15, 0.43
p.append(tbox('base', (0, LY, LZ), (0.46, 0.025, 0.28), LAPTOP, bev=0.008))
for i in range(4):
    p.append(tbox('keys', (0, LY + 0.014, LZ - 0.07 + i * 0.045), (0.38, 0.006, 0.03), GLOVE))
tilt = Matrix.Rotation(-0.32, 3, 'X')  # leans back towards the hacker
hinge = Vector((0, LY + 0.012, LZ + 0.14))
lid_c = Vector((0, 0.16, 0.0))
lid_c.rotate(tilt)
c = hinge + Vector((lid_c.x, lid_c.y, lid_c.z))
p.append(tbox('lid', tuple(c), (0.46, 0.31, 0.022), LAPTOP, bev=0.008, rot=Matrix.Rotation(-0.32, 3, 'X')))
# Screen (faces the hacker, -z side of the lid) and the emblem (faces the player, +z side).
n = Vector((0, 0, 1))
n.rotate(tilt)
screen_c = c - Vector((n.x, n.y, n.z)) * 0.012
p.append(tbox('screen', tuple(screen_c), (0.42, 0.27, 0.004), SCREEN, rot=Matrix.Rotation(-0.32, 3, 'X')))
front = c + Vector((n.x, n.y, n.z)) * 0.017
rot = Matrix.Rotation(-0.32, 3, 'X')
# Broken padlock: body, shackle (open) and a crack.
p.append(tbox('lockBody', tuple(front + Vector((0, -0.03, 0))), (0.13, 0.1, 0.01), GLOW, rot=rot))
sh = ttorus('shackle', (0, 0, 0), 0.045, 0.011, GLOW, axis='z', segs=20, tsegs=6, arc=math.pi)
sh.matrix_world = Matrix.Translation(P(*(front + Vector((0.03, 0.06, 0))))) @ Matrix.Rotation(-0.32, 4, 'X') @ Matrix.Rotation(-0.35, 4, 'Y')
p.append(sh)
for (x0, y0), (x1, y1) in (((-0.02, 0.0), (0.005, -0.03)), ((0.005, -0.03), (-0.015, -0.06))):
    a = front + Vector((x0, y0 - 0.03, 0.004))
    b = front + Vector((x1, y1 - 0.03, 0.004))
    p.append(tube('crack', [tuple(a), tuple(b)], 0.006, SHADOW, sides=6))

hacker = merge(p, 'Hacker')
ASSETS.append((hacker, 0.12))

bake_ao(ASSETS, {'HackerGlow', 'HackerScreen'}, distance=0.3, samples=64)
print('faces', len(hacker.data.polygons))
export(OUT_GLB, OUT_BLEND)
if PREVIEW:
    sc = bpy.context.scene
    sc.cycles.samples = 16
    sc.render.resolution_x = sc.render.resolution_y = 400
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.22, 0.45, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    light = bpy.data.objects.new('key', bpy.data.lights.new('key', 'AREA'))
    light.data.energy = 300
    light.data.size = 3
    light.location = P(1.5, 2.5, 2.5)
    sc.collection.objects.link(light)
    for tag, pos in (('front', (0.0, 0.25, 3.2)), ('three', (1.9, 0.5, 2.5)), ('side', (3.0, 0.3, 0.4)), ('back', (-1.5, 0.9, -2.6))):
        cam.location = P(*pos)
        cam.rotation_euler = (Vector((0, 0, 0.05)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{PREVIEW}/hacker-{tag}.png'
        bpy.ops.render.render(write_still=True)
print('DONE')

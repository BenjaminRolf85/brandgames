# The robot buddy of the AI Quiz (original design, like the "KI Quiz" game coin): a friendly
# white robot that floats on a glowing ring, with headphones, a little antenna, a dark visor (the
# app draws its glowing eyes on it) and a holo tablet in its right hand. It reacts to the answers.
#   QuizBot   body (origin at the body center, front = +z three.js, about 0.85 tall)
#     BotHead   head with visor, headphones and antenna (origin at the neck: it nods and tilts)
#     BotArmL / BotArmR   arms (origin at the shoulder: they wave and cheer); the right one holds
#               the tablet
# Materials (from the design tokens in the app): BotShell (white), BotJoint (chrome), BotDark,
# BotVisor (glossy black), BotGlow (cyan light parts). Ambient occlusion in the vertex colors.
# Usage: blender -b -P build_quizbot.py -- <out.glb> <out.blend>
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix
from bhelpers import init, P, material, tbox, tcyl, ttorus, merge, bake_ao, export, blob, cone

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
init()

SHELL = material('BotShell', (0.93, 0.95, 0.98), 0.1, 0.3)
JOINT = material('BotJoint', (0.55, 0.6, 0.68), 0.8, 0.3)
DARK = material('BotDark', (0.05, 0.07, 0.12), 0.2, 0.5)
VISOR = material('BotVisor', (0.01, 0.015, 0.03), 0.3, 0.08)
GLOW = material('BotGlow', (0, 0, 0), emit=(0.35, 0.85, 1.0))


def smooth(ob):
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def node(name, parts, origin, parent):
    """Merges parts into a child node whose origin sits at `origin` (three.js), under parent."""
    bpy.context.view_layer.update()
    ob = smooth(merge(parts, name))
    # The parts were built around the origin; move the node to its place.
    ob.location = P(*origin)
    ob.parent = parent
    return ob


# Body: a rounded egg with a chest panel, a heart light and a glowing ring it floats on.
p = [blob('body', (0, -0.04, 0), 0.2, SHELL, s=(1.0, 1.12, 0.92), segs=32, rings=20)]
p.append(tbox('chest', (0, 0.0, 0.165), (0.17, 0.11, 0.03), DARK, bev=0.02))
p.append(blob('heart', (0, 0.0, 0.183), 0.022, GLOW, s=(1.3, 1.0, 0.4), segs=12, rings=8))
for k in range(3):
    p.append(tbox('led', (-0.05 + k * 0.05, -0.04, 0.181), (0.022, 0.008, 0.004), GLOW))
p.append(tcyl('neck', (0, 0.205, 0), 0.05, 0.06, JOINT, segs=20))
p.append(cone('skirt', (0, -0.22, 0), 0.12, 0.05, 0.08, SHELL, segs=24))
p.append(ttorus('ring', (0, -0.33, 0), 0.11, 0.014, GLOW, axis='y', segs=40, tsegs=8))
for sx in (-1, 1):
    p.append(blob('shoulder', (sx * 0.19, 0.06, 0), 0.05, JOINT, segs=16, rings=10))
bot = smooth(merge(p, 'QuizBot'))

# Head (built around the neck point, then placed at y 0.235).
h = [tbox('head', (0, 0.15, 0), (0.38, 0.29, 0.31), SHELL, bev=0.08, segs=4)]
h.append(tbox('visor', (0, 0.145, 0.148), (0.3, 0.2, 0.03), VISOR, bev=0.04, segs=3))
for sx in (-1, 1):
    h.append(tcyl('cup', (sx * 0.2, 0.15, 0), 0.08, 0.06, JOINT, axis='x', segs=24))
    h.append(ttorus('cupglow', (sx * 0.233, 0.15, 0), 0.055, 0.009, GLOW, axis='x', segs=28, tsegs=6))
h.append(ttorus('band', (0, 0.15, 0), 0.215, 0.018, JOINT, axis='z', segs=40, tsegs=8, arc=math.pi))
h.append(tcyl('antenna', (0.09, 0.335, -0.02), 0.009, 0.1, JOINT, segs=8))
h.append(blob('tip', (0.09, 0.39, -0.02), 0.024, GLOW, segs=12, rings=8))
head = node('BotHead', h, (0, 0.235, 0), bot)

# Arms (built around the shoulder, hanging down and a little forward).
for sx, name in ((-1, 'BotArmL'), (1, 'BotArmR')):
    a = [tcyl('upper', (0, -0.07, 0.01), 0.032, 0.12, SHELL, segs=16, rot=Matrix.Rotation(sx * 0.15, 3, 'Y'))]
    a.append(blob('elbow', (sx * 0.01, -0.14, 0.02), 0.03, JOINT, segs=12, rings=8))
    a.append(tcyl('lower', (sx * 0.015, -0.2, 0.05), 0.03, 0.11, SHELL, segs=16, rot=Matrix.Rotation(-0.5, 3, 'X')))
    a.append(blob('hand', (sx * 0.02, -0.25, 0.1), 0.042, JOINT, s=(1.0, 0.9, 1.0), segs=14, rings=9))
    if sx > 0:
        # The holo tablet in its right hand.
        a.append(tbox('tablet', (0.02, -0.25, 0.16), (0.17, 0.12, 0.012), DARK, bev=0.008, rot=Matrix.Rotation(-0.9, 3, 'X')))
        a.append(tbox('screen', (0.02, -0.247, 0.166), (0.15, 0.1, 0.004), GLOW, rot=Matrix.Rotation(-0.9, 3, 'X')))
    node(name, a, (sx * 0.2, 0.06, 0), bot)

bake_ao([(bot, 0.06)], {'BotGlow'}, distance=0.12, samples=64)
print('faces', sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH'))
export(OUT_GLB, OUT_BLEND)
print('DONE')

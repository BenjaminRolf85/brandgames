# A cartoon boxing glove for the AI Arena (original design, like the "Robo Boxen" game coin):
# a padded fist with a bulging knuckle pad and a thumb, a white strap and a cuff with a trim
# ring and a small patch. The app puts one on every hand (mirrored for the other side) and tints
# the leather in the fighter's color; the arena's hologram look applies to it like to the rest.
#   Glove   origin at the wrist (top of the cuff), the fist hangs down (-y, three.js), the thumb
#           and the knuckle pad face +z; about 0.13 wide and 0.21 long (rig units, ~meters).
# Materials: GloveLeather (tinted by the app), GloveTrim (white), GloveDark (seams, patch).
# Usage: blender -b -P build_glove.py -- <out.glb> <out.blend>
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix
from bhelpers import init, material, tbox, tcyl, ttorus, merge, bake_ao, export, blob

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
init()

LEATHER = material('GloveLeather', (0.85, 0.1, 0.12), 0.0, 0.35)
TRIM = material('GloveTrim', (0.95, 0.95, 0.97), 0.0, 0.5)
DARK = material('GloveDark', (0.05, 0.06, 0.09), 0.0, 0.6)

p = []
# Cuff: a short padded tube around the wrist, a trim ring at its top, the strap below it.
p.append(tcyl('cuff', (0, -0.04, 0), 0.05, 0.08, LEATHER, segs=32, r2=0.054))
p.append(ttorus('trim', (0, -0.003, 0), 0.05, 0.009, TRIM, axis='y', segs=40, tsegs=8))
p.append(tcyl('strap', (0, -0.062, 0.002), 0.058, 0.032, TRIM, segs=36))
p.append(tbox('patch', (0, -0.035, -0.051), (0.045, 0.028, 0.006), DARK, bev=0.004))
# Fist: a padded ball, wider than deep, with a big knuckle pad at its front and bottom.
p.append(blob('fist', (0, -0.125, 0.006), 0.07, LEATHER, s=(0.98, 1.0, 0.95), segs=28, rings=18))
p.append(blob('knuckles', (0, -0.158, 0.026), 0.062, LEATHER, s=(1.0, 0.82, 0.92), segs=24, rings=14))
# Thumb: a padded sausage on the front side, its tip tucked against the knuckle pad.
p.append(blob('thumb', (0.034, -0.108, 0.058), 0.024, LEATHER, s=(1.0, 2.0, 0.95), segs=16, rings=12,
              rot=Matrix.Rotation(-0.35, 3, 'Y')))
# Seams: a thin dark line around the knuckle pad and along the thumb.
p.append(ttorus('seam', (0, -0.12, 0.004), 0.071, 0.003, DARK, axis='y', segs=40, tsegs=5))
glove = merge(p, 'Glove')
for poly in glove.data.polygons:
    poly.use_smooth = True

bake_ao([(glove, 0.05)], set(), distance=0.08, samples=64)
print('faces', len(glove.data.polygons))
export(OUT_GLB, OUT_BLEND)
print('DONE')

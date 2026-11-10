# Builds the game coin of the main menu (original design): a chunky coin, diameter 1, facing the
# player (+z in three.js). Parts, merged into one object 'Coin' with four materials:
#   MenuCoinRim   lathe-turned metal frame: raised rounded bead in front, reeded outer edge,
#                 flat rounded back (tinted with a token gradient by the app)
#   MenuCoinArt   the picture face, recessed inside the frame, UVs 0..1 across the disc
#                 (the app puts the game's card art or a token placeholder on it)
#   MenuCoinBack  back face, also with UVs
#   MenuCoinGlow  thin light seam where the picture meets the frame (tinted by the app)
# Ambient occlusion is baked into the vertex colors, so the picture sits in the frame's shade.
# Usage: blender -b -P build_coin.py -- <out.glb> <out.blend>
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from bhelpers import init, P, material, link, ttorus, merge, bake_ao, export

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
init()

RIM = material('MenuCoinRim', (0.75, 0.8, 0.95), 0.85, 0.28)
ART = material('MenuCoinArt', (1, 1, 1), 0.0, 0.45)
BACK = material('MenuCoinBack', (0.08, 0.09, 0.14), 0.7, 0.35)
GLOW = material('MenuCoinGlow', (0, 0, 0), emit=(0.35, 0.85, 1.0))

R_OUT = 0.5      # outer edge
R_IN = 0.415     # inner wall of the frame (picture edge)
R_ART = 0.425    # picture disc, slightly under the frame so its edge never shows
Z_ART = 0.035    # picture plane (recessed)
Z_BACK = -0.045  # back face plane
RIDGES = 60      # reeding on the outer edge
SEGS = RIDGES * 4


def arc(cr, cz, rr, rz, a0, a1, n):
    """Points on an (elliptical) arc in the profile plane (r, z), from angle a0 to a1."""
    return [(cr + rr * math.cos(a0 + (a1 - a0) * i / n), cz + rz * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


# Profile of the frame (r, z), a closed loop: inner wall up, bead over the top, reeded outer
# side down, rounded back corner, flat back, rounded inner back corner, inner wall up again.
prof = [(R_IN, 0.0), (R_IN, 0.03)]
prof += arc((R_IN + R_OUT) / 2, 0.05, (R_OUT - R_IN) / 2, 0.032, math.pi, 0, 12)[0:]
prof += [(R_OUT, 0.05 - 0.02 * k) for k in range(1, 5)]           # outer side (reeded)
prof += arc(R_OUT - 0.018, -0.03, 0.018, 0.018, 0, -math.pi / 2, 4)[1:]
prof += [(R_IN + 0.02, -0.048)]
prof += arc(R_IN + 0.02, -0.03, 0.02, 0.018, -math.pi / 2, -math.pi, 4)[1:]
reeded = {i for i, (r, z) in enumerate(prof) if abs(r - R_OUT) < 1e-6 and -0.035 < z < 0.055}

bm = bmesh.new()
rings = []
for s in range(SEGS):
    a = 2 * math.pi * s / SEGS
    ring = []
    for i, (r, z) in enumerate(prof):
        rr = r + (0.0045 * math.cos(RIDGES * a) if i in reeded else 0)
        ring.append(bm.verts.new(P(rr * math.cos(a), rr * math.sin(a), z)))
    rings.append(ring)
n = len(prof)
for s in range(SEGS):
    r0, r1 = rings[s], rings[(s + 1) % SEGS]
    for i in range(n):
        j = (i + 1) % n
        if i == n - 1 and (prof[i][0], prof[i][1]) == (prof[0][0], prof[0][1]):
            continue
        bm.faces.new((r0[i], r1[i], r1[j], r0[j]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # closed surface: normals outwards
rim = link('rim', bm, RIM)
for p in rim.data.polygons:
    p.use_smooth = True


def disc(name, z, mat, facing):
    """A disc of concentric rings (enough vertices for the baked shade) with UVs 0..1."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    radii = [0.0, 0.12, 0.22, 0.3, 0.35, 0.38, 0.4, R_IN - 0.004, R_ART]
    seg = 96
    center = bm.verts.new(P(0, 0, z))
    prev = None
    for k, r in enumerate(radii[1:]):
        ring = [bm.verts.new(P(r * math.cos(2 * math.pi * s / seg), r * math.sin(2 * math.pi * s / seg), z)) for s in range(seg)]
        for s in range(seg):
            t = (s + 1) % seg
            quad = (center, ring[s], ring[t]) if prev is None else (prev[s], ring[s], ring[t], prev[t])
            bm.faces.new(quad if facing > 0 else tuple(reversed(quad)))
        prev = ring
    bm.normal_update()
    want = P(0, 0, facing)
    for f in bm.faces:
        if f.normal.dot(want) < 0:
            f.normal_flip()
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co  # Blender coords: x = three x, z = three y
            u = 0.5 + co.x / (2 * R_ART)
            loop[uv].uv = (u if facing > 0 else 1 - u, 0.5 + co.z / (2 * R_ART))
    ob = link(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


art = disc('art', Z_ART, ART, 1)
back = disc('back', Z_BACK, BACK, -1)
seam = ttorus('seam', (0, 0, Z_ART + 0.002), R_IN - 0.002, 0.005, GLOW, axis='z', segs=120, tsegs=6)

bpy.context.view_layer.update()
coin = merge([rim, art, back, seam], 'Coin')
bake_ao([(coin, 0.05)], {'MenuCoinGlow'}, distance=0.08, samples=128)
print('faces', len(coin.data.polygons), 'verts', len(coin.data.vertices))
export(OUT_GLB, OUT_BLEND)
print('DONE')

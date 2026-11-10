# "Pannenfrei" (game key 'bike'): a tire rally in 3D. Original designs, cartoon-premium style.
# Everything in meters, three.js coordinates (Y up, the bike rides towards -Z).
#
# public/assets/models/bike.glb (the rider's gear):
#   BikeFrame      frame, seat post, saddle, cassette, chain, derailleur, bottle, front light
#                  (materials BkFrame, BkAccent, BkMetal, BkDark, BkSaddle, BkBottle, BkLightGlow)
#   BikeFork       fork, stem, handlebar, grips, levers; origin on the steering axis (head tube
#                  bottom), the app turns it about the head tube axis (HEAD_TOP - HEAD_BOT)
#   BikeWheel      rim, hub, spokes, valve; origin at the axle (axis x), used for both wheels
#   BikeCranks     chainring with teeth, crank arms, pedals; origin at the bottom bracket
#   TireSlick, TireAllround, TireKnobby, TireSpikes
#                  the four tire profiles (origin at the axle, outer radius 0.35): smooth slick,
#                  low chevrons with shoulder knobs, big blocks, studded knobs (BkRubber,
#                  BkTireAccent sidewall stripe tinted per profile, BkStud)
#   TireBand       the puncture protection layer: a glowing band at the bead (BkBandGlow)
#   EchoHelmet     a cycling helmet in Echo's own model units (outside the Christmas season)
#   PumpBody, PumpHandle   floor pump for the repair moment (handle origin at the barrel top)
# public/assets/models/bike-world.glb (the trail):
#   Hz*  hazards: HzGlass, HzNails, HzThorns, HzPothole, HzRoots, HzIce, HzPuddle
#   It*  items: ItStar, ItCartridge, ItShield
#   Pr*  props: PrLamp, PrPost, PrBush, PrSign, PrTree, PrFence, PrRock, PrGrass, PrHay, PrPine,
#        PrStump, PrFern, PrMushroom, PrPineSnow, PrRockSnow, PrLantern, PrSnowman, PrManhole,
#        PrPebbles, PrLeaves, PrDrift, PrFlag
#   Swallow, SwallowWingL, SwallowWingR   the guide bird (wing origins at the shoulders)
#   Drone, DroneRotor     the AI terrain scanner (rotor at the origin, the app places four)
#   Arch                  the finish arch (BkArchBanner face gets the app's text panel)
#   ArchGarland           its Christmas garland with gold bows (the app adds fairy lights)
# Material names start with Bk; the app recolors them from the --xr-bike-* tokens
# (public/js/bike-models.js). Ambient occlusion is baked into the vertex colors.
#
# Usage:
#   blender -b -P build_bike.py -- models <bike.glb> <bike-world.glb> <bike.blend>
#   blender -b -P build_bike.py -- coin <bike.blend> <echo.blend> <out.png>
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, merge, bake_ao, blob

ARGS = sys.argv[sys.argv.index('--') + 1:]
MODE = ARGS[0]
if MODE == 'models':
    init()  # empty file first: the materials below belong to it
rnd = random.Random(7)
TAU = math.pi * 2


# ---------------------------------------------------------------- helpers

def mat(name, color, metal=0.0, rough=0.5, emit=None):
    return material(name, color, metal, rough, emit)


def smooth_all(ob, on=True):
    for p in ob.data.polygons:
        p.use_smooth = on
    return ob


def mesh_obj(name, verts, faces, m, smooth=True, recalc=True):
    bm = bmesh.new()
    vs = [bm.verts.new(P(*v)) for v in verts]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, m)
    return smooth_all(ob, smooth)


def tube(name, a, b, r, m, segs=12, r2=None, cap=True):
    """A cylinder (or cone) between two three.js points."""
    A, B = P(*a), P(*b)
    d = B - A
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=(A + B) / 2, verts=bm.verts)
    return smooth_all(link(name, bm, m))


def sweep(name, pts, r, m, segs=10, caps=True, radii=None, flat=1.0):
    """A tube along a polyline of three.js points (parallel transported frames)."""
    V = [P(*p) for p in pts]
    bm = bmesh.new()
    rings = []
    prev = None
    for i, c in enumerate(V):
        t = (V[min(i + 1, len(V) - 1)] - V[max(i - 1, 0)]).normalized()
        if prev is None:
            n = t.cross(Vector((0, 0, 1)))
            if n.length < 1e-4:
                n = t.orthogonal()
            n.normalize()
        else:
            n = (prev - t * prev.dot(t)).normalized()
        prev = n
        bn = t.cross(n).normalized()
        rr = radii[i] if radii else r
        rings.append([bm.verts.new(c + (n * math.cos(TAU * k / segs) + bn * math.sin(TAU * k / segs) * flat) * rr) for k in range(segs)])
    for i in range(len(rings) - 1):
        for k in range(segs):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth_all(link(name, bm, m))


def box(name, c, s, m, bev=0.0, rot=None):
    """Box at three.js center c with size s; rot: (rx, ry, rz) in three.js axes (radians)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((s[0], s[2], s[1])), verts=bm.verts)
    if rot:
        R = Matrix.Rotation(rot[1], 3, 'Z') @ Matrix.Rotation(-rot[2], 3, 'Y') @ Matrix.Rotation(rot[0], 3, 'X')
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=R)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, m)
    if bev:
        mod = ob.modifiers.new('Bevel', 'BEVEL')
        mod.width = bev
        mod.segments = 2
    return ob


def sphere(name, c, r, m, s=(1, 1, 1), segs=16, rings=10, rot=None):
    return blob(name, c, r, m, s=s, segs=segs, rings=rings, rot=rot)


def lump(name, c, r, m, s=(1, 1, 1), amp=0.18, seed=1, subdiv=2, flat_bottom=True):
    """A lumpy rock-like shape: displaced icosphere."""
    rr = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    for v in bm.verts:
        k = 1 + rr.uniform(-amp, amp)
        v.co *= k
        v.co.x *= s[0]
        v.co.y *= s[2]
        v.co.z *= s[1]
        if flat_bottom and v.co.z < -r * 0.1 * s[1]:
            v.co.z = -r * 0.1 * s[1] + (v.co.z + r * 0.1 * s[1]) * 0.25
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, m)
    return smooth_all(ob)


def ring(name, c, R, rr, rc, m, segs=64, tsegs=12, axis='x', expo=2.0, arc=TAU):
    """Torus-like ring around an axis through c; cross-section a superellipse (rc across, rr radial)."""
    bm = bmesh.new()
    closed = arc >= TAU - 1e-6
    n = segs if closed else segs + 1
    rings = []
    for i in range(n):
        a = arc * i / segs
        cr = []
        for j in range(tsegs):
            b = TAU * j / tsegs
            cb, sb = math.cos(b), math.sin(b)
            lat = rc * math.copysign(abs(cb) ** (2 / expo), cb)
            rad = R + rr * math.copysign(abs(sb) ** (2 / expo), sb)
            if axis == 'x':
                p = (c[0] + lat, c[1] + rad * math.cos(a), c[2] + rad * math.sin(a))
            elif axis == 'y':
                p = (c[0] + rad * math.cos(a), c[1] + lat, c[2] + rad * math.sin(a))
            else:
                p = (c[0] + rad * math.cos(a), c[1] + rad * math.sin(a), c[2] + lat)
            cr.append(bm.verts.new(P(*p)))
        rings.append(cr)
    for i in range(segs):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for j in range(tsegs):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % tsegs], r0[(j + 1) % tsegs]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth_all(link(name, bm, m))


def set_origin(ob, pivot):
    """Moves the object's origin to the three.js point pivot (geometry stays in place)."""
    pv = P(*pivot)
    ob.data.transform(Matrix.Translation(-pv))
    ob.location = pv
    return ob


def lathe(name, prof, m, segs=32, c=(0, 0, 0), axis='y', smooth=True):
    """Revolves a (radius, height) profile around the three.js y axis (or x)."""
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = TAU * i / segs
        rr = []
        for r, h in prof:
            if axis == 'y':
                p = (c[0] + r * math.cos(a), c[1] + h, c[2] + r * math.sin(a))
            else:
                p = (c[0] + h, c[1] + r * math.cos(a), c[2] + r * math.sin(a))
            rr.append(bm.verts.new(P(*p)))
        rings.append(rr)
    n = len(prof)
    for i in range(segs):
        r0, r1 = rings[i], rings[(i + 1) % segs]
        for j in range(n - 1):
            if prof[j][0] < 1e-6 and prof[j + 1][0] < 1e-6:
                continue
            try:
                bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth_all(link(name, bm, m), smooth)


def flat_shape(name, outline, y, thick, m, smooth=False):
    """An extruded flat polygon (x, z outline) at height y with a thickness."""
    n = len(outline)
    verts = [(x, y, z) for x, z in outline] + [(x, y + thick, z) for x, z in outline]
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    return mesh_obj(name, verts, faces, m, smooth)


def blobby_outline(r, n=24, amp=0.18, seed=3, sx=1.0, sz=1.0):
    rr = random.Random(seed)
    k = [rr.uniform(-1, 1) for _ in range(5)]
    pts = []
    for i in range(n):
        a = TAU * i / n
        f = 1 + amp * (0.6 * math.sin(2 * a + k[0] * 3) + 0.4 * math.sin(3 * a + k[1] * 3) + 0.3 * math.sin(5 * a + k[2] * 3))
        pts.append((math.cos(a) * r * f * sx, math.sin(a) * r * f * sz))
    return pts


def disc_mesh(name, outline, y, m, center=(0, 0)):
    """A flat fan polygon (facing up) from an outline."""
    verts = [(center[0], y, center[1])] + [(x, y, z) for x, z in outline]
    n = len(outline)
    faces = [[0, 1 + (i + 1) % n, 1 + i] for i in range(n)]
    return fix_up(mesh_obj(name, verts, faces, m, smooth=False, recalc=False))


def fix_up(ob):
    """Flat ground decals: make every face point up (three.js +y = Blender +z)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def group(name, parts, pivot=None):
    ob = merge(parts, name)
    if pivot is not None:
        set_origin(ob, pivot)
    return ob


# ---------------------------------------------------------------- materials

FRAME = mat('BkFrame', (0.55, 0.08, 0.6), 0.2, 0.25)
ACCENT = mat('BkAccent', (0.1, 0.8, 0.9), 0.1, 0.3)
METAL = mat('BkMetal', (0.7, 0.72, 0.76), 1.0, 0.25)
DARK = mat('BkDark', (0.03, 0.03, 0.035), 0.2, 0.55)
SADDLE = mat('BkSaddle', (0.05, 0.05, 0.06), 0.0, 0.45)
BOTTLE = mat('BkBottle', (0.1, 0.7, 0.85), 0.0, 0.3)
LIGHT = mat('BkLightGlow', (0, 0, 0), emit=(1.0, 0.95, 0.8))
RIM = mat('BkRim', (0.08, 0.08, 0.1), 0.8, 0.3)
RUBBER = mat('BkRubber', (0.04, 0.04, 0.045), 0.0, 0.75)
TACC = mat('BkTireAccent', (0.1, 0.8, 0.9), 0.0, 0.4)
STUD = mat('BkStud', (0.85, 0.88, 0.92), 1.0, 0.18)
BAND = mat('BkBandGlow', (0, 0, 0), emit=(0.2, 1.0, 0.8))
HELMET = mat('BkHelmet', (0.95, 0.75, 0.15), 0.1, 0.3)
HELMET_DARK = mat('BkHelmetDark', (0.05, 0.05, 0.06), 0.0, 0.5)
PUMP = mat('BkPump', (0.85, 0.15, 0.25), 0.2, 0.3)
PUMP_FACE = mat('BkPumpFace', (0.95, 0.95, 0.95), 0.0, 0.4)


# ================================================================ bike

RA = (0.0, 0.35, 0.5)      # rear axle
FA = (0.0, 0.35, -0.52)    # front axle
BB = (0.0, 0.29, 0.06)     # bottom bracket
ST = (0.0, 0.80, 0.22)     # seat tube top
HEAD_BOT = (0.0, 0.66, -0.36)
HEAD_TOP = (0.0, 0.80, -0.317)


def build_frame():
    p = []
    # Main triangle (chunky, toy-like tubes) and the head tube.
    p.append(tube('topTube', (0, 0.765, 0.19), (0, 0.775, -0.33), 0.024, FRAME, 16))
    p.append(tube('downTube', BB, (0, 0.675, -0.345), 0.03, FRAME, 16, r2=0.027))
    p.append(tube('seatTube', BB, ST, 0.024, FRAME, 16))
    p.append(tube('headTube', (0, 0.645, -0.365), (0, 0.815, -0.312), 0.03, FRAME, 18))
    p.append(tube('headRingA', (0, 0.640, -0.366), (0, 0.655, -0.362), 0.034, METAL, 18))
    p.append(tube('headRingB', (0, 0.808, -0.314), (0, 0.823, -0.31), 0.034, METAL, 18))
    # Accent stripes around the tubes (tinted by the app).
    p.append(tube('stripe1', (0, 0.62, -0.30), (0, 0.585, -0.267), 0.0315, ACCENT, 16))
    p.append(tube('stripe2', (0, 0.73, 0.198), (0, 0.745, 0.2025), 0.0255, ACCENT, 16))
    p.append(tube('stripe3', (0, 0.769, -0.25), (0, 0.771, -0.27), 0.0255, ACCENT, 16))
    # Bottom bracket shell.
    p.append(tube('bbShell', (-0.045, 0.29, 0.06), (0.045, 0.29, 0.06), 0.032, FRAME, 16))
    # Chain and seat stays on both sides, meeting at the dropouts.
    for s in (-1, 1):
        p.append(sweep('chainStay', [(s * 0.03, 0.29, 0.08), (s * 0.05, 0.31, 0.25), (s * 0.06, 0.34, 0.47)], 0.014, FRAME, 10, radii=[0.016, 0.014, 0.011]))
        p.append(sweep('seatStay', [(s * 0.018, 0.755, 0.205), (s * 0.045, 0.56, 0.35), (s * 0.06, 0.37, 0.48)], 0.012, FRAME, 10, radii=[0.013, 0.012, 0.01]))
        p.append(box('dropout', (s * 0.062, 0.35, 0.5), (0.012, 0.06, 0.06), FRAME, bev=0.006))
    # Seat post, clamp and saddle.
    p.append(tube('seatPost', ST, (0, 0.885, 0.248), 0.016, METAL, 12))
    p.append(tube('clamp', (0, 0.79, 0.217), (0, 0.815, 0.225), 0.027, DARK, 14))
    p.append(saddle())
    # Cassette (radially symmetric, so it stays with the frame), derailleur, chain.
    for i, r in enumerate((0.058, 0.052, 0.046, 0.04, 0.034, 0.028)):
        p.append(tube('cog', (0.04 + i * 0.006, 0.35, 0.5), (0.044 + i * 0.006, 0.35, 0.5), r, METAL, 24))
    p.append(box('derailleur', (0.06, 0.25, 0.5), (0.016, 0.1, 0.035), DARK, bev=0.006, rot=(0.3, 0, 0)))
    p.append(tube('jockey1', (0.055, 0.29, 0.51), (0.07, 0.29, 0.51), 0.014, METAL, 12))
    p.append(tube('jockey2', (0.055, 0.215, 0.49), (0.07, 0.215, 0.49), 0.014, METAL, 12))
    p.append(chain())
    # Bottle cage with a bottle on the down tube.
    p.append(tube('bottle', (0, 0.43, -0.07), (0, 0.6, -0.21), 0.034, BOTTLE, 16))
    p.append(tube('bottleCap', (0, 0.6, -0.21), (0, 0.625, -0.23), 0.02, DARK, 12))
    # Front light under the stem.
    p.append(tube('lamp', (0, 0.765, -0.36), (0, 0.765, -0.42), 0.022, DARK, 14))
    p.append(tube('lampGlass', (0, 0.765, -0.419), (0, 0.765, -0.426), 0.018, LIGHT, 14))
    # Rear light on the seat post.
    p.append(box('rearLight', (0, 0.84, 0.26), (0.03, 0.04, 0.012), LIGHT, rot=(0, 0, 0)))
    # Disc brake rotors (thin, both wheels) and calipers.
    p.append(tube('rotorR', (-0.05, 0.35, 0.5), (-0.046, 0.35, 0.5), 0.075, METAL, 32))
    p.append(box('caliperR', (-0.058, 0.4, 0.44), (0.018, 0.04, 0.05), DARK, bev=0.005))
    return group('BikeFrame', p)


def saddle():
    """A sculpted saddle: lofted sections from the wide back to the narrow nose."""
    secs = [(0.37, 0.075, 0.0), (0.34, 0.08, 0.004), (0.30, 0.065, 0.006), (0.26, 0.04, 0.004), (0.22, 0.03, 0.0), (0.16, 0.024, -0.004), (0.14, 0.012, -0.006)]
    verts, faces = [], []
    n = 14
    for z, w, dy in secs:
        for k in range(n):
            a = TAU * k / n
            x = math.cos(a) * w
            y = 0.9 + dy + (math.sin(a) * 0.022 if math.sin(a) > 0 else math.sin(a) * 0.012)
            verts.append((x, y, z))
    for i in range(len(secs) - 1):
        for k in range(n):
            faces.append([i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k])
    faces.append(list(range(n - 1, -1, -1)))
    last = (len(secs) - 1) * n
    faces.append([last + k for k in range(n)])
    s = mesh_obj('saddle', verts, faces, SADDLE)
    for p in s.data.polygons:
        p.use_smooth = True
    return s


def chain():
    """Chain loop: chainring (r 0.1 at the bottom bracket) to the cassette (r 0.05 at the axle)."""
    x = 0.055
    pts = []
    # top run, cassette wrap, lower run back to the chainring
    for i in range(13):
        a = math.pi / 2 + math.pi * i / 12   # front half of the chainring: top -> bottom via the front
        pts.append((x, BB[1] + 0.105 * math.sin(a), BB[2] + 0.105 * math.cos(a)))
    pts.append((x, 0.24, 0.28))
    pts.append((x, 0.215, 0.49))
    pts.append((x, 0.29, 0.51))
    for i in range(8):
        a = -math.pi / 2 + math.pi * i / 7    # back of the cassette, bottom -> top
        pts.append((x, RA[1] + 0.052 * math.sin(a) + 0.0, RA[2] + 0.052 * math.cos(a) + 0.0))
    pts.append((x, BB[1] + 0.105, BB[2] + 0.02))
    return sweep('chain', pts, 0.006, METAL, 6, caps=False)


def build_fork():
    p = []
    crown = (0, 0.625, -0.372)
    p.append(box('crown', crown, (0.11, 0.035, 0.05), FRAME, bev=0.012, rot=(0.3, 0, 0)))
    for s in (-1, 1):
        p.append(sweep('blade', [(s * 0.045, 0.62, -0.375), (s * 0.05, 0.5, -0.42), (s * 0.052, 0.38, -0.5), (s * 0.052, 0.35, -0.52)], 0.016, FRAME, 12, radii=[0.018, 0.016, 0.013, 0.011]))
        p.append(box('fdrop', (s * 0.054, 0.35, -0.52), (0.012, 0.05, 0.05), FRAME, bev=0.005))
    # Steerer spacers, stem, handlebar (riser, swept back) with grips and brake levers.
    p.append(tube('spacer', (0, 0.823, -0.31), (0, 0.848, -0.302), 0.026, DARK, 14))
    p.append(sweep('stem', [(0, 0.84, -0.304), (0, 0.85, -0.36), (0, 0.855, -0.395)], 0.02, DARK, 12))
    bar = [(-0.31, 0.9, -0.24), (-0.25, 0.892, -0.3), (-0.16, 0.874, -0.37), (-0.06, 0.858, -0.398), (0.06, 0.858, -0.398), (0.16, 0.874, -0.37), (0.25, 0.892, -0.3), (0.31, 0.9, -0.24)]
    p.append(sweep('bar', bar, 0.012, METAL, 10))
    for s in (-1, 1):
        p.append(sweep('grip', [(s * 0.245, 0.891, -0.305), (s * 0.28, 0.896, -0.27), (s * 0.312, 0.9, -0.236)], 0.019, DARK, 12))
        p.append(tube('gripEnd', (s * 0.312, 0.9, -0.236), (s * 0.317, 0.9, -0.229), 0.021, ACCENT, 12))
        p.append(sweep('lever', [(s * 0.2, 0.882, -0.34), (s * 0.235, 0.876, -0.36), (s * 0.28, 0.872, -0.33)], 0.006, METAL, 6))
        p.append(box('leverBody', (s * 0.19, 0.884, -0.343), (0.035, 0.022, 0.03), DARK, bev=0.006))
    # Front rotor caliper on the fork.
    p.append(tube('rotorF', (-0.058, 0.35, -0.52), (-0.054, 0.35, -0.52), 0.07, METAL, 32))
    p.append(box('caliperF', (-0.066, 0.39, -0.47), (0.018, 0.04, 0.05), DARK, bev=0.005))
    return group('BikeFork', p, pivot=HEAD_BOT)


def build_wheel():
    p = []
    c = (0, 0, 0)
    p.append(ring('rim', c, 0.285, 0.022, 0.013, RIM, segs=72, tsegs=10, expo=3))
    p.append(ring('rimBed', c, 0.302, 0.004, 0.009, METAL, segs=72, tsegs=6))
    p.append(tube('hub', (-0.05, 0, 0), (0.05, 0, 0), 0.02, METAL, 16))
    p.append(tube('hubBody', (-0.03, 0, 0), (0.03, 0, 0), 0.026, DARK, 16))
    for s in (-1, 1):
        p.append(tube('flange', (s * 0.034, 0, 0), (s * 0.04, 0, 0), 0.038, METAL, 20))
    n = 24
    for i in range(n):
        s = -1 if i % 2 else 1
        a0 = TAU * i / n
        a1 = a0 + s * 0.35  # tangential lacing
        hub = (s * 0.037, 0.034 * math.cos(a0), 0.034 * math.sin(a0))
        rim = (s * 0.004, 0.268 * math.cos(a1), 0.268 * math.sin(a1))
        p.append(tube('spoke', hub, rim, 0.0035, METAL, 5, cap=False))
    p.append(tube('valve', (0, 0.262, 0.0), (0, 0.29, 0.0), 0.004, METAL, 6))
    # Center-lock hint: axle caps.
    for s in (-1, 1):
        p.append(tube('axleCap', (s * 0.05, 0, 0), (s * 0.062, 0, 0), 0.012, DARK, 12))
    return group('BikeWheel', p)


def build_cranks():
    p = []
    c = BB
    # Chainring: a disc with teeth and spider arms, on the right (+x).
    x = 0.055
    p.append(ring('chainring', (x, c[1], c[2]), 0.098, 0.009, 0.0035, METAL, segs=64, tsegs=6))
    teeth = 38
    for i in range(teeth):
        a = TAU * i / teeth
        rr = 0.108
        p.append(box('tooth', (x, c[1] + rr * math.cos(a), c[2] + rr * math.sin(a)), (0.004, 0.009, 0.008), METAL, rot=(a, 0, 0)))
    for i in range(4):
        a = TAU * i / 4 + 0.4
        p.append(tube('spider', (x, c[1], c[2]), (x, c[1] + 0.09 * math.cos(a), c[2] + 0.09 * math.sin(a)), 0.009, DARK, 8))
    p.append(tube('axle', (-0.075, c[1], c[2]), (0.075, c[1], c[2]), 0.013, METAL, 12))
    # Crank arms (right points forward-down, left opposite) with pedals.
    L = 0.17
    for s, a in ((1, -0.6), (-1, math.pi - 0.6)):
        end = (s * 0.08, c[1] + L * math.sin(a), c[2] - L * math.cos(a))
        p.append(sweep('arm', [(s * 0.07, c[1], c[2]), (s * 0.075, (c[1] + end[1]) / 2, (c[2] + end[2]) / 2), end], 0.013, DARK, 10))
        p.append(tube('pedalAxle', end, (s * 0.12, end[1], end[2]), 0.006, METAL, 8))
        p.append(box('pedal', (s * 0.135, end[1], end[2]), (0.07, 0.018, 0.08), DARK, bev=0.006))
        p.append(box('pedalPin', (s * 0.135, end[1] + 0.011, end[2]), (0.06, 0.004, 0.07), ACCENT))
    return group('BikeCranks', p, pivot=BB)


# ---------------------------------------------------------------- tires

def knob(bm, a, lat, rad0, wx, wt, h, taper=0.8, phi=0.0):
    """A tread block on the tire at wheel angle a (axis x), lateral position lat, radius rad0."""
    er = Vector((0, math.cos(a), math.sin(a)))
    et = Vector((0, -math.sin(a), math.cos(a)))
    ex = Vector((1, 0, 0))
    ex2 = ex * math.cos(phi) + et * math.sin(phi)
    et2 = -ex * math.sin(phi) + et * math.cos(phi)
    c = ex * lat
    vs = []
    for k, (rr, sc) in enumerate(((rad0 - 0.004, 1.0), (rad0 + h, taper))):
        for sx, st in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            q = c + er * rr + ex2 * (sx * wx / 2 * sc) + et2 * (st * wt / 2 * sc)
            vs.append(bm.verts.new(P(q.x, q.y, q.z)))
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    for ff in f:
        bm.faces.new([vs[i] for i in ff])
    return vs


def stud(bm, a, lat, rad0, h, r):
    er = Vector((0, math.cos(a), math.sin(a)))
    et = Vector((0, -math.sin(a), math.cos(a)))
    ex = Vector((1, 0, 0))
    n = 6
    base = [ex * lat + er * rad0 + (ex * math.cos(TAU * k / n) + et * math.sin(TAU * k / n)) * r for k in range(n)]
    top = [ex * lat + er * (rad0 + h) + (ex * math.cos(TAU * k / n) + et * math.sin(TAU * k / n)) * r * 0.55 for k in range(n)]
    vb = [bm.verts.new(P(v.x, v.y, v.z)) for v in base]
    vt = [bm.verts.new(P(v.x, v.y, v.z)) for v in top]
    tip = ex * lat + er * (rad0 + h + r * 0.5)
    vtip = bm.verts.new(P(tip.x, tip.y, tip.z))
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((vb[k], vb[j], vt[j], vt[k]))
        bm.faces.new((vt[k], vt[j], vtip))


def tire_base(name, R, rr=0.032, rc=0.031, expo=2.2):
    t = ring(name, (0, 0, 0), R, rr, rc, RUBBER, segs=96, tsegs=16, expo=expo)
    return t


def stripe(R, rr):
    """Colored sidewall stripes (both sides) at mid-height of the tire."""
    p = []
    for s in (-1, 1):
        p.append(ring('stripe', (s * 0.0305, 0, 0), R - rr * 0.15, 0.004, 0.0015, TACC, segs=96, tsegs=6))
    return p


def tread_object(name, build):
    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, RUBBER)
    return ob


def build_tires():
    out = []
    # Slick: smooth rounded tread, a fine center seam and file texture on the shoulders.
    R = 0.316
    p = [tire_base('slick', R, 0.034, 0.03, 2.0)] + stripe(R, 0.034)
    p.append(ring('seam', (0, 0, 0), R + 0.0338, 0.0012, 0.0018, TACC, segs=96, tsegs=6))
    out.append(group('TireSlick', p))

    # All-round: low chevrons in the center and small shoulder knobs.
    R = 0.312
    p = [tire_base('allround', R, 0.032, 0.031, 2.2)] + stripe(R, 0.032)

    def ar(bm):
        n = 56
        for i in range(n):
            a = TAU * i / n
            for s in (-1, 1):
                knob(bm, a, s * 0.008, R + 0.031, 0.016, 0.009, 0.006, 0.85, phi=s * 0.55)
            if i % 2 == 0:
                for s in (-1, 1):
                    knob(bm, a + TAU / n / 2, s * 0.024, R + 0.024, 0.009, 0.012, 0.007, 0.8)
    p.append(tread_object('arTread', ar))
    out.append(group('TireAllround', p))

    # Knobby: big square blocks, staggered, plus tall shoulder knobs.
    R = 0.306
    p = [tire_base('knobby', R, 0.032, 0.03, 2.6)] + stripe(R, 0.032)

    def kn(bm):
        n = 30
        for i in range(n):
            a = TAU * i / n
            if i % 2 == 0:
                knob(bm, a, 0.0, R + 0.031, 0.02, 0.02, 0.013, 0.82)
            else:
                for s in (-1, 1):
                    knob(bm, a, s * 0.013, R + 0.03, 0.014, 0.018, 0.012, 0.82)
            for s in (-1, 1):
                knob(bm, a + TAU / n / 2, s * 0.029, R + 0.02, 0.012, 0.02, 0.013, 0.8)
    p.append(tread_object('knTread', kn))
    out.append(group('TireKnobby', p))

    # Spikes: medium knobs, every one with a carbide stud.
    R = 0.304
    p = [tire_base('spikes', R, 0.032, 0.031, 2.4)] + stripe(R, 0.032)
    sp = bmesh.new()

    def sk(bm):
        n = 36
        for i in range(n):
            a = TAU * i / n
            s = -1 if i % 2 else 1
            knob(bm, a, s * 0.012, R + 0.031, 0.015, 0.016, 0.009, 0.85)
            stud(sp, a, s * 0.012, R + 0.031 + 0.008, 0.009, 0.004)
            knob(bm, a + TAU / n / 2, s * -0.026, R + 0.022, 0.011, 0.014, 0.009, 0.8)
            if i % 3 == 0:
                stud(sp, a + TAU / n / 2, s * -0.027, R + 0.022 + 0.008, 0.007, 0.0035)
    p.append(tread_object('spTread', sk))
    bmesh.ops.recalc_face_normals(sp, faces=sp.faces)
    p.append(link('studs', sp, STUD))
    out.append(group('TireSpikes', p))

    # Puncture protection: a glowing band at the bead, visible on both sides of the rim.
    band = []
    for s in (-1, 1):
        band.append(ring('band', (s * 0.022, 0, 0), 0.292, 0.006, 0.0045, BAND, segs=96, tsegs=8))
    band.append(ring('bandIn', (0, 0, 0), 0.298, 0.004, 0.02, BAND, segs=96, tsegs=8))
    out.append(group('TireBand', band))
    return out


# ---------------------------------------------------------------- Echo's helmet and the pump

def build_helmet():
    """A cycling helmet in Echo's model units (body 1 wide, head top about y 0.48, front +z)."""
    p = []
    # Shell: a half ellipsoid, slightly pointed at the back, with vent slots.
    verts, faces = [], []
    nu, nv = 28, 9
    for j in range(nv + 1):
        v = (j / nv) * (math.pi / 2)
        for i in range(nu):
            u = TAU * i / nu
            x = math.cos(u) * math.cos(v) * 0.42
            z = math.sin(u) * math.cos(v) * 0.47
            z -= 0.05 * max(0, -math.sin(u)) * math.cos(v)  # tail at the back
            y = 0.28 + math.sin(v) * 0.24
            verts.append((x, y, z + 0.02))
    for j in range(nv):
        for i in range(nu):
            a = j * nu + i
            b = j * nu + (i + 1) % nu
            faces.append([a, b, b + nu, a + nu])
    shell = mesh_obj('shell', verts, faces, HELMET)
    sol = shell.modifiers.new('Solid', 'SOLIDIFY')
    sol.thickness = 0.03
    p.append(shell)
    for k in (-1, 0, 1):
        p.append(box('vent', (k * 0.12, 0.5, 0.02), (0.045, 0.02, 0.32), HELMET_DARK, bev=0.008))
    p.append(box('visor', (0, 0.33, 0.47), (0.36, 0.025, 0.12), HELMET_DARK, bev=0.01, rot=(0.25, 0, 0)))
    return group('EchoHelmet', p)


def build_pump():
    body = []
    body.append(box('footL', (-0.09, 0.012, 0), (0.12, 0.024, 0.06), DARK, bev=0.008))
    body.append(box('footR', (0.09, 0.012, 0), (0.12, 0.024, 0.06), DARK, bev=0.008))
    body.append(tube('barrel', (0, 0.02, 0), (0, 0.56, 0), 0.032, PUMP, 20))
    body.append(tube('barrelTop', (0, 0.56, 0), (0, 0.585, 0), 0.036, DARK, 20))
    body.append(tube('gauge', (0, 0.1, 0.03), (0, 0.1, 0.06), 0.045, DARK, 24))
    body.append(tube('gaugeFace', (0, 0.1, 0.06), (0, 0.1, 0.063), 0.038, PUMP_FACE, 24))
    body.append(sweep('hose', [(0.03, 0.08, -0.01), (0.12, 0.05, -0.05), (0.2, 0.15, -0.02), (0.25, 0.3, 0.02)], 0.008, DARK, 8))
    handle = []
    handle.append(tube('rod', (0, 0.0, 0), (0, 0.22, 0), 0.008, METAL, 10))
    handle.append(tube('tbar', (-0.13, 0.22, 0), (0.13, 0.22, 0), 0.016, DARK, 12))
    for s in (-1, 1):
        handle.append(tube('handGrip', (s * 0.05, 0.22, 0), (s * 0.13, 0.22, 0), 0.02, PUMP, 12))
    a = group('PumpBody', body)
    h = group('PumpHandle', [o for o in handle])
    h.location = P(0, 0.585, 0)
    h.data.transform(Matrix.Translation(Vector((0, 0, 0))))
    return [a, h]


# ================================================================ world

W = {
    'glass': mat('BkGlass', (0.35, 0.75, 0.45), 0.0, 0.05),
    'glassBrown': mat('BkGlassBrown', (0.55, 0.3, 0.1), 0.0, 0.05),
    'nail': mat('BkNail', (0.75, 0.75, 0.78), 1.0, 0.3),
    'wood': mat('BkWood', (0.5, 0.33, 0.18), 0.0, 0.8),
    'woodDark': mat('BkWoodDark', (0.3, 0.19, 0.1), 0.0, 0.85),
    'thorn': mat('BkThorn', (0.32, 0.22, 0.12), 0.0, 0.7),
    'thornLeaf': mat('BkThornLeaf', (0.2, 0.42, 0.15), 0.0, 0.7),
    'berry': mat('BkBerry', (0.25, 0.05, 0.3), 0.1, 0.3),
    'hole': mat('BkHoleDark', (0.03, 0.03, 0.035), 0.0, 0.9),
    'chunk': mat('BkAsphaltChunk', (0.2, 0.2, 0.22), 0.0, 0.9),
    'water': mat('BkWater', (0.15, 0.25, 0.35), 0.2, 0.05),
    'root': mat('BkRoot', (0.36, 0.24, 0.14), 0.0, 0.8),
    'ice': mat('BkIce', (0.6, 0.85, 1.0), 0.1, 0.05),
    'iceCrack': mat('BkIceCrack', (0.95, 0.98, 1.0), 0.0, 0.3),
    'mudWater': mat('BkMudWater', (0.3, 0.2, 0.1), 0.1, 0.08),
    'gold': mat('BkGold', (1.0, 0.75, 0.2), 1.0, 0.25),
    'cart': mat('BkCartridge', (0.8, 0.82, 0.86), 1.0, 0.2),
    'cartBand': mat('BkCartridgeBand', (0.1, 0.8, 0.9), 0.1, 0.3),
    'shield': mat('BkShieldGlow', (0, 0, 0), emit=(0.2, 1.0, 0.8)),
    'shieldCore': mat('BkShieldCore', (0.05, 0.3, 0.3), 0.6, 0.3),
    'leaf': mat('BkLeaf', (0.3, 0.6, 0.2), 0.0, 0.8),
    'leafDark': mat('BkLeafDark', (0.15, 0.4, 0.15), 0.0, 0.85),
    'needle': mat('BkNeedle', (0.08, 0.35, 0.2), 0.0, 0.85),
    'trunk': mat('BkTrunk', (0.4, 0.26, 0.15), 0.0, 0.85),
    'stone': mat('BkStone', (0.5, 0.5, 0.52), 0.0, 0.85),
    'grass': mat('BkGrass', (0.45, 0.65, 0.2), 0.0, 0.8),
    'hay': mat('BkHay', (0.85, 0.7, 0.3), 0.0, 0.85),
    'snow': mat('BkSnow', (0.95, 0.97, 1.0), 0.0, 0.6),
    'lampGlow': mat('BkLampGlow', (0, 0, 0), emit=(1.0, 0.85, 0.5)),
    'post': mat('BkPost', (0.9, 0.9, 0.9), 0.0, 0.5),
    'postDark': mat('BkPostDark', (0.1, 0.1, 0.1), 0.2, 0.5),
    'reflect': mat('BkReflectGlow', (0, 0, 0), emit=(1.0, 0.5, 0.1)),
    'signRed': mat('BkSignRed', (0.85, 0.1, 0.12), 0.1, 0.4),
    'signWhite': mat('BkSignWhite', (0.95, 0.95, 0.95), 0.0, 0.4),
    'lampPost': mat('BkLampPost', (0.15, 0.17, 0.2), 0.6, 0.4),
    'mushRed': mat('BkMushRed', (0.85, 0.12, 0.1), 0.0, 0.4),
    'mushWhite': mat('BkMushWhite', (0.95, 0.92, 0.85), 0.0, 0.6),
    'fern': mat('BkFern', (0.25, 0.55, 0.2), 0.0, 0.7),
    'carrot': mat('BkCarrot', (1.0, 0.45, 0.1), 0.0, 0.5),
    'coal': mat('BkCoal', (0.03, 0.03, 0.03), 0.0, 0.6),
    'scarf': mat('BkScarf', (0.8, 0.1, 0.15), 0.0, 0.8),
    'manhole': mat('BkManhole', (0.12, 0.12, 0.13), 0.7, 0.5),
    'pebble': mat('BkPebble', (0.62, 0.58, 0.52), 0.0, 0.8),
    'autumn': mat('BkAutumn', (0.85, 0.45, 0.1), 0.0, 0.7),
    'autumn2': mat('BkAutumn2', (0.7, 0.25, 0.08), 0.0, 0.7),
    'flag': mat('BkFlag', (0.1, 0.8, 0.9), 0.0, 0.6),
    'swBack': mat('BkSwallowBack', (0.05, 0.08, 0.25), 0.3, 0.35),
    'swBelly': mat('BkSwallowBelly', (0.95, 0.9, 0.8), 0.0, 0.6),
    'swFace': mat('BkSwallowFace', (0.75, 0.25, 0.1), 0.0, 0.5),
    'swBeak': mat('BkSwallowBeak', (0.05, 0.05, 0.05), 0.2, 0.4),
    'swEye': mat('BkSwallowEye', (0.02, 0.02, 0.03), 0.0, 0.1),
    'swShine': mat('BkSwallowShine', (1, 1, 1), 0.0, 0.2),
    'drone': mat('BkDrone', (0.92, 0.93, 0.96), 0.1, 0.3),
    'droneDark': mat('BkDroneDark', (0.08, 0.09, 0.12), 0.4, 0.4),
    'lens': mat('BkLensGlow', (0, 0, 0), emit=(0.2, 1.0, 0.9)),
    'rotor': mat('BkRotor', (0.15, 0.16, 0.2), 0.2, 0.4),
    'archA': mat('BkArchA', (0.85, 0.12, 0.2), 0.0, 0.45),
    'archB': mat('BkArchB', (0.95, 0.95, 0.95), 0.0, 0.45),
    'archBanner': mat('BkArchBanner', (0.1, 0.1, 0.15), 0.0, 0.5),
    'archPost': mat('BkArchPost', (0.2, 0.2, 0.25), 0.6, 0.4),
    'garland': mat('BkGarland', (0.1, 0.45, 0.25), 0.0, 0.8),
}


# ---------------------------------------------------------------- hazards

def hz_glass():
    p = []
    shards = [(-0.25, 0.05, 0.28, 0.4, 'glass'), (0.12, -0.18, 0.22, -0.7, 'glassBrown'), (0.3, 0.12, 0.2, 1.2, 'glass'),
              (-0.05, 0.28, 0.17, 2.0, 'glassBrown'), (-0.32, -0.22, 0.18, -1.4, 'glass'), (0.05, 0.02, 0.26, 0.9, 'glass'), (0.38, -0.22, 0.15, 2.6, 'glassBrown'),
              (-0.42, 0.25, 0.14, 0.2, 'glass'), (0.2, 0.32, 0.15, -2.2, 'glass')]
    for i, (x, z, sz, rot, m) in enumerate(shards):
        # A flat, curved, pointed shard standing at an angle.
        pts = [(-sz * 0.5, 0), (sz * 0.45, 0), (sz * 0.2, sz * 0.9), (-sz * 0.15, sz * 1.25)]
        verts = []
        tilt = 0.9 + 0.45 * ((i * 37) % 7) / 7
        for k, (u, v) in enumerate(pts):
            for d in (-0.012, 0.012):
                yy = v * math.sin(tilt)
                zz = v * math.cos(tilt) + d
                xx = u
                ca, sa = math.cos(rot), math.sin(rot)
                verts.append((x + xx * ca - zz * sa, yy + 0.005, z + xx * sa + zz * ca))
        faces = [[0, 2, 4, 6], [1, 7, 5, 3], [0, 1, 3, 2], [2, 3, 5, 4], [4, 5, 7, 6], [6, 7, 1, 0]]
        p.append(mesh_obj('shard', verts, faces, W[m], smooth=False))
    # A broken bottle neck lying on its side.
    p.append(tube('neck', (-0.1, 0.035, -0.32), (0.12, 0.035, -0.28), 0.035, W['glass'], 12, r2=0.022))
    p.append(tube('neckRim', (0.12, 0.035, -0.28), (0.14, 0.035, -0.277), 0.026, W['glass'], 12))
    return group('HzGlass', p)


def hz_nails():
    p = [box('board', (0, 0.025, 0), (0.75, 0.05, 0.16), W['wood'], bev=0.012, rot=(0, 0.25, 0))]
    ca, sa = math.cos(0.25), math.sin(0.25)
    for k in range(5):
        u = -0.28 + k * 0.14
        x, z = u * ca, -u * sa
        lean = 0.15 * (k % 2 * 2 - 1)
        p.append(tube('nail', (x, 0.04, z), (x + lean * 0.05, 0.2, z), 0.007, W['nail'], 6, r2=0.002))
        p.append(tube('nailHead', (x, 0.045, z), (x, 0.052, z), 0.016, W['nail'], 8))
    for (x, z, a) in ((-0.3, 0.25, 0.4), (0.25, 0.3, 1.8), (0.4, -0.2, 2.6), (-0.15, -0.3, -0.8)):
        dx, dz = math.cos(a) * 0.08, math.sin(a) * 0.08
        p.append(tube('looseNail', (x - dx, 0.01, z - dz), (x + dx, 0.012, z + dz), 0.006, W['nail'], 6, r2=0.0015))
        p.append(tube('looseHead', (x - dx * 1.05, 0.01, z - dz * 1.05), (x - dx * 0.95, 0.01, z - dz * 0.95), 0.014, W['nail'], 8))
    return group('HzNails', p)


def hz_thorns():
    p = []
    rr = random.Random(11)
    for b in range(3):
        z0 = -0.15 + b * 0.15
        pts = [(-0.6 + i * 0.2, 0.05 + 0.06 * math.sin(i * 1.3 + b), z0 + 0.1 * math.sin(i * 0.9 + b * 2)) for i in range(7)]
        p.append(sweep('vine', pts, 0.018, W['thorn'], 8, radii=[0.022 - i * 0.002 for i in range(7)]))
        for i in range(1, 6):
            for k in range(2):
                a = rr.uniform(0, TAU)
                base = Vector(pts[i]) + Vector((rr.uniform(-0.08, 0.08), 0, 0))
                d = Vector((0.0, math.cos(a), math.sin(a)))
                tip = base + d * 0.07 + Vector((0, 0.02, 0))
                p.append(tube('thorn', tuple(base), tuple(tip), 0.012, W['thorn'], 6, r2=0.001))
        for i in (1, 3, 5):
            c = pts[i]
            p.append(sphere('leaf', (c[0] + 0.04, c[1] + 0.05, c[2] + 0.05), 0.05, W['thornLeaf'], s=(1.4, 0.3, 0.8), segs=10, rings=6, rot=Matrix.Rotation(rr.uniform(0, 3), 3, 'Z')))
        p.append(sphere('berry', (pts[2][0], pts[2][1] + 0.05, pts[2][2] - 0.04), 0.025, W['berry'], segs=8, rings=6))
    return group('HzThorns', p)


def hz_pothole():
    p = []
    out = blobby_outline(0.45, 28, 0.15, seed=5, sx=1.0, sz=0.8)
    p.append(disc_mesh('holeDark', out, 0.003, W['hole']))
    inner = [(x * 0.75, z * 0.75) for x, z in out]
    p.append(disc_mesh('water', inner, 0.006, W['water']))
    rr = random.Random(3)
    for i, (x, z) in enumerate(out):
        if i % 2:
            continue
        p.append(lump('chunk', (x * 1.05, 0.015, z * 1.05), 0.05 + rr.uniform(0, 0.03), W['chunk'], s=(1.2, 0.5, 1.0), amp=0.3, seed=i, subdiv=1))
    ob = group('HzPothole', p)
    return ob


def hz_roots():
    p = []
    rr = random.Random(21)
    for k in range(3):
        z0 = -0.35 + k * 0.32
        pts = []
        for i in range(9):
            x = -0.95 + i * 0.24
            pts.append((x, 0.02 + 0.05 * abs(math.sin(i * 0.8 + k)), z0 + 0.12 * math.sin(i * 0.7 + k * 1.7)))
        radii = [0.075 - 0.005 * abs(i - 4) + rr.uniform(-0.01, 0.01) for i in range(9)]
        p.append(sweep('root', pts, 0.06, W['root'], 10, radii=radii, flat=0.75))
        for i in (1, 4, 6):
            p.append(lump('knot', pts[i], radii[i] * 1.25, W['root'], s=(1.3, 0.8, 1.0), amp=0.2, seed=i + k * 7, subdiv=1))
        # small side roots
        for i in (2, 5, 7):
            a = pts[i]
            b = (a[0] + rr.uniform(-0.1, 0.1), 0.01, a[2] + rr.uniform(0.12, 0.2) * (1 if k % 2 else -1))
            p.append(sweep('rootlet', [a, ((a[0] + b[0]) / 2, 0.03, (a[2] + b[2]) / 2), b], 0.02, W['root'], 6, radii=[0.022, 0.016, 0.008]))
    return group('HzRoots', p)


def hz_ice():
    p = []
    out = blobby_outline(0.7, 30, 0.12, seed=9, sx=1.0, sz=0.75)
    ice = flat_shape('ice', out, 0.0, 0.02, W['ice'])
    p.append(ice)
    rr = random.Random(5)
    for k in range(7):
        a = rr.uniform(0, TAU)
        r0 = rr.uniform(0.0, 0.2)
        r1 = rr.uniform(0.35, 0.6)
        pts = []
        for i in range(4):
            rr_ = r0 + (r1 - r0) * i / 3
            aa = a + rr.uniform(-0.15, 0.15)
            pts.append((math.cos(aa) * rr_, 0.022, math.sin(aa) * rr_ * 0.75))
        p.append(sweep('crack', pts, 0.004, W['iceCrack'], 4, flat=0.3))
    return group('HzIce', p)


def hz_puddle():
    p = []
    out = blobby_outline(0.6, 28, 0.18, seed=13, sx=1.0, sz=0.7)
    p.append(disc_mesh('mud', [(x * 1.08, z * 1.08) for x, z in out], 0.002, W['root']))
    p.append(disc_mesh('mudWater', out, 0.006, W['mudWater']))
    for r in (0.15, 0.3):
        p.append(ring('ripple', (0.1, 0.008, -0.05), r, 0.003, 0.004, W['mudWater'], segs=40, tsegs=4, axis='y'))
    return group('HzPuddle', p)


# ---------------------------------------------------------------- items

def star_mesh(name, c, R, r, depth, m):
    verts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rad = R if i % 2 == 0 else r
        verts.append((c[0] + math.cos(a) * rad, c[1] + math.sin(a) * rad, c[2]))
    verts.append((c[0], c[1], c[2] + depth))
    verts.append((c[0], c[1], c[2] - depth))
    faces = []
    for i in range(10):
        j = (i + 1) % 10
        faces.append([i, j, 10])
        faces.append([j, i, 11])
    ob = mesh_obj(name, verts, faces, m, smooth=False)
    return ob


def it_star():
    s = star_mesh('star', (0, 0, 0), 0.22, 0.1, 0.08, W['gold'])
    bev = s.modifiers.new('Bevel', 'BEVEL')
    bev.width = 0.012
    bev.segments = 2
    return group('ItStar', [s])


def it_cartridge():
    prof = [(0, -0.15), (0.03, -0.148), (0.045, -0.13), (0.05, -0.1), (0.05, 0.08), (0.045, 0.11), (0.03, 0.135), (0.016, 0.15), (0.016, 0.18), (0, 0.18)]
    p = [lathe('cart', prof, W['cart'], 24)]
    p.append(tube('cartBand', (0, -0.04, 0), (0, 0.04, 0), 0.052, W['cartBand'], 24))
    return group('ItCartridge', p)


def it_shield():
    p = [ring('shield', (0, 0, 0), 0.2, 0.035, 0.05, W['shield'], segs=48, tsegs=10, axis='z', expo=3)]
    for i in range(12):
        a = TAU * i / 12
        p.append(box('seg', (math.cos(a) * 0.2, math.sin(a) * 0.2, 0), (0.045, 0.012, 0.11), W['shieldCore'], rot=(0, 0, a)))
    p.append(ring('hub', (0, 0, 0), 0.05, 0.02, 0.02, W['shieldCore'], segs=24, tsegs=6, axis='z'))
    return group('ItShield', p)


# ---------------------------------------------------------------- props

def pr_lamp():
    p = [tube('base', (0, 0, 0), (0, 0.3, 0), 0.08, W['lampPost'], 16, r2=0.06)]
    p.append(tube('post', (0, 0.3, 0), (0, 3.0, 0), 0.05, W['lampPost'], 14, r2=0.035))
    p.append(sweep('arm', [(0, 2.95, 0), (0, 3.2, 0.1), (0, 3.25, 0.45), (0, 3.2, 0.7)], 0.03, W['lampPost'], 10))
    p.append(box('head', (0, 3.15, 0.75), (0.22, 0.08, 0.38), W['lampPost'], bev=0.03))
    p.append(box('glow', (0, 3.105, 0.75), (0.16, 0.02, 0.3), W['lampGlow']))
    return group('PrLamp', p)


def pr_post():
    p = [box('post', (0, 0.5, 0), (0.12, 1.0, 0.1), W['post'], bev=0.02)]
    p.append(box('band', (0, 0.85, 0), (0.125, 0.18, 0.105), W['postDark']))
    p.append(box('refl', (0, 0.85, 0.055), (0.05, 0.1, 0.01), W['reflect']))
    return group('PrPost', p)


def pr_bush():
    p = []
    rr = random.Random(2)
    for i in range(6):
        a = TAU * i / 6
        r = 0.28 + rr.uniform(-0.05, 0.08)
        p.append(sphere('b', (math.cos(a) * 0.25, 0.32 + rr.uniform(-0.05, 0.1), math.sin(a) * 0.22), r, W['leaf'] if i % 2 else W['leafDark'], segs=12, rings=8))
    p.append(sphere('top', (0, 0.55, 0), 0.32, W['leaf'], segs=14, rings=9))
    return group('PrBush', p)


def pr_sign():
    p = [tube('pole', (0, 0, 0), (0, 2.0, 0), 0.035, W['lampPost'], 10)]
    tri = []
    for i in range(3):
        a = math.pi / 2 + TAU * i / 3
        tri.append((math.cos(a) * 0.42, 1.9 + math.sin(a) * 0.42))
    verts = [(x, y, 0.045) for x, y in tri] + [(x, y, 0.065) for x, y in tri]
    faces = [[0, 1, 2], [5, 4, 3], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]]
    p.append(mesh_obj('signRed', verts, faces, W['signRed'], smooth=False))
    inner = [(x * 0.72, 1.9 + (y - 1.9) * 0.72) for x, y in tri]
    verts = [(x, y, 0.066) for x, y in inner] + [(x, y, 0.07) for x, y in inner]
    p.append(mesh_obj('signWhite', verts, faces, W['signWhite'], smooth=False))
    # A pictogram: a bicycle wheel pair (two rings) on the sign.
    for s in (-1, 1):
        p.append(ring('pic', (s * 0.08, 1.82, 0.075), 0.055, 0.008, 0.004, W['postDark'], segs=20, tsegs=4, axis='z'))
    p.append(box('picBar', (0, 1.86, 0.075), (0.14, 0.014, 0.008), W['postDark'], rot=(0, 0, 0.3)))
    return group('PrSign', p)


def pr_tree():
    p = [tube('trunk', (0, 0, 0), (0, 1.6, 0), 0.14, W['trunk'], 12, r2=0.09)]
    p.append(tube('branch', (0, 1.2, 0), (0.35, 1.7, 0.1), 0.05, W['trunk'], 8, r2=0.03))
    rr = random.Random(4)
    for i, (x, y, z, r) in enumerate(((0, 2.3, 0, 0.75), (0.45, 2.0, 0.2, 0.55), (-0.45, 2.05, -0.1, 0.55), (0.1, 2.75, -0.15, 0.55), (-0.2, 2.0, 0.4, 0.5))):
        p.append(lump('crown', (x, y, z), r, W['leaf'] if i % 2 == 0 else W['leafDark'], amp=0.08, seed=i + 3, subdiv=2, flat_bottom=False))
    return group('PrTree', p)


def pr_fence():
    p = []
    for x in (-1.0, 0.0, 1.0):
        p.append(box('post', (x, 0.5, 0), (0.1, 1.0, 0.1), W['woodDark'], bev=0.015))
        p.append(tube('cap', (x, 1.0, 0), (x, 1.06, 0), 0.05, W['woodDark'], 6, r2=0.0))
    for y in (0.4, 0.75):
        p.append(box('rail', (0, y, 0.06), (2.1, 0.09, 0.04), W['wood'], bev=0.01, rot=(0, 0, 0.015 * (1 if y > 0.5 else -1))))
    return group('PrFence', p)


def pr_rock():
    return group('PrRock', [lump('rock', (0, 0.18, 0), 0.32, W['stone'], s=(1.2, 0.75, 1.0), amp=0.22, seed=8, subdiv=2)])


def pr_grass():
    p = []
    rr = random.Random(6)
    for i in range(11):
        a = TAU * i / 11 + rr.uniform(-0.2, 0.2)
        r = rr.uniform(0.02, 0.1)
        base = (math.cos(a) * r, 0, math.sin(a) * r)
        tip = (math.cos(a) * (r + 0.15), rr.uniform(0.3, 0.5), math.sin(a) * (r + 0.15))
        mid = ((base[0] + tip[0]) / 2, tip[1] * 0.6, (base[2] + tip[2]) / 2)
        p.append(sweep('blade', [base, mid, tip], 0.02, W['grass'], 4, radii=[0.025, 0.016, 0.003], flat=0.35))
    return group('PrGrass', p)


def pr_hay():
    p = [tube('bale', (-0.6, 0.55, 0), (0.6, 0.55, 0), 0.55, W['hay'], 28)]
    for x in (-0.3, 0.3):
        p.append(tube('twine', (x - 0.02, 0.55, 0), (x + 0.02, 0.55, 0), 0.56, W['wood'], 28))
    p.append(ring('spiral', (0.605, 0.55, 0), 0.3, 0.01, 0.006, W['wood'], segs=32, tsegs=4))
    return group('PrHay', p)


def pine(name, snow=False):
    p = [tube('trunk', (0, 0, 0), (0, 0.7, 0), 0.12, W['trunk'], 10, r2=0.09)]
    tiers = [(0.5, 1.5, 0.95), (1.1, 2.2, 0.75), (1.7, 2.85, 0.55), (2.3, 3.5, 0.35)]
    for i, (y0, y1, r) in enumerate(tiers):
        cone = lathe('tier', [(0.001, y1), (r * 0.25, y1 - (y1 - y0) * 0.25), (r * 0.62, y1 - (y1 - y0) * 0.62), (r, y0 + 0.05), (r * 0.92, y0), (0.05, y0 + 0.08)], W['needle'], 20)
        # scallops: wobble the outer ring
        for v in cone.data.vertices:
            x, y = v.co.x, v.co.y
            rr_ = math.hypot(x, y)
            if rr_ > r * 0.85:
                a = math.atan2(y, x)
                f = 1 + 0.08 * math.sin(a * 9 + i)
                v.co.x *= f
                v.co.y *= f
                v.co.z -= 0.05 * max(0, math.sin(a * 9 + i))
        p.append(cone)
        if snow:
            hgt = y1 - y0
            cap = lathe('snowcap', [(0.001, y1 + 0.02), (r * 0.2, y1 - hgt * 0.18), (r * 0.42, y1 - hgt * 0.4), (r * 0.5, y1 - hgt * 0.5), (r * 0.36, y1 - hgt * 0.42), (0.001, y1 - hgt * 0.2)], W['snow'], 20)
            for v in cap.data.vertices:
                rr_ = math.hypot(v.co.x, v.co.y)
                if rr_ > r * 0.3:
                    a = math.atan2(v.co.y, v.co.x)
                    f = 1 + 0.18 * math.sin(a * 5 + i * 2)
                    v.co.x *= f
                    v.co.y *= f
            p.append(cap)
    return group(name, p)


def pr_stump():
    p = [tube('stump', (0, 0, 0), (0, 0.42, 0), 0.26, W['trunk'], 16, r2=0.22)]
    p.append(tube('top', (0, 0.42, 0), (0, 0.43, 0), 0.215, W['wood'], 16))
    p.append(ring('treeRing', (0, 0.432, 0), 0.12, 0.004, 0.004, W['woodDark'], segs=24, tsegs=4, axis='y'))
    for i in range(5):
        a = TAU * i / 5 + 0.3
        p.append(sweep('root', [(math.cos(a) * 0.18, 0.15, math.sin(a) * 0.18), (math.cos(a) * 0.32, 0.05, math.sin(a) * 0.32), (math.cos(a) * 0.45, 0.0, math.sin(a) * 0.45)], 0.06, W['trunk'], 8, radii=[0.08, 0.05, 0.02]))
    p.append(sphere('moss', (0.12, 0.3, 0.2), 0.1, W['leafDark'], s=(1.2, 0.6, 0.6), segs=10, rings=6))
    return group('PrStump', p)


def pr_fern():
    p = []
    for i in range(7):
        a = TAU * i / 7
        d = Vector((math.cos(a), 0, math.sin(a)))
        pts = [tuple(d * 0.02 + Vector((0, 0.02, 0))), tuple(d * 0.25 + Vector((0, 0.32, 0))), tuple(d * 0.5 + Vector((0, 0.35, 0))), tuple(d * 0.68 + Vector((0, 0.2, 0)))]
        p.append(sweep('frond', pts, 0.07, W['fern'], 4, radii=[0.02, 0.09, 0.07, 0.01], flat=0.15))
    return group('PrFern', p)


def pr_mushroom():
    p = []
    for (x, z, s) in ((0, 0, 1.0), (0.18, 0.1, 0.65), (-0.12, 0.14, 0.5)):
        p.append(tube('stem', (x, 0, z), (x, 0.2 * s, z), 0.04 * s, W['mushWhite'], 10, r2=0.032 * s))
        cap = lathe('cap', [(0.001, 0.29 * s), (0.08 * s, 0.27 * s), (0.13 * s, 0.22 * s), (0.15 * s, 0.18 * s), (0.04 * s, 0.19 * s)], W['mushRed'], 18, c=(x, 0, z))
        p.append(cap)
        for k in range(5):
            a = TAU * k / 5 + s
            p.append(sphere('dot', (x + math.cos(a) * 0.09 * s, 0.255 * s, z + math.sin(a) * 0.09 * s), 0.022 * s, W['mushWhite'], s=(1, 0.4, 1), segs=8, rings=5))
    return group('PrMushroom', p)


def pr_rock_snow():
    p = [lump('rock', (0, 0.18, 0), 0.32, W['stone'], s=(1.2, 0.75, 1.0), amp=0.22, seed=8, subdiv=2)]
    p.append(lump('cap', (0.02, 0.36, 0), 0.26, W['snow'], s=(1.2, 0.35, 1.0), amp=0.1, seed=2, subdiv=2))
    return group('PrRockSnow', p)


def pr_lantern():
    p = [tube('post', (0, 0, 0), (0, 1.3, 0), 0.04, W['lampPost'], 10)]
    p.append(box('cage', (0, 1.42, 0), (0.2, 0.24, 0.2), W['lampPost'], bev=0.02))
    p.append(box('glow', (0, 1.42, 0), (0.17, 0.2, 0.21), W['lampGlow']))
    p.append(box('glow2', (0, 1.42, 0), (0.21, 0.2, 0.17), W['lampGlow']))
    p.append(tube('roof', (0, 1.54, 0), (0, 1.64, 0), 0.16, W['lampPost'], 4, r2=0.02))
    p.append(lump('snowroof', (0, 1.6, 0), 0.12, W['snow'], s=(1.1, 0.4, 1.1), amp=0.05, seed=3, subdiv=1))
    return group('PrLantern', p)


def pr_snowman():
    p = [sphere('b1', (0, 0.32, 0), 0.36, W['snow'], segs=18, rings=12)]
    p.append(sphere('b2', (0, 0.78, 0), 0.26, W['snow'], segs=16, rings=10))
    p.append(sphere('b3', (0, 1.12, 0), 0.19, W['snow'], segs=16, rings=10))
    p.append(tube('nose', (0, 1.12, 0.17), (0, 1.1, 0.36), 0.035, W['carrot'], 10, r2=0.004))
    for s in (-1, 1):
        p.append(sphere('eye', (s * 0.07, 1.18, 0.16), 0.022, W['coal'], segs=8, rings=6))
        p.append(sweep('arm', [(s * 0.22, 0.85, 0), (s * 0.42, 0.98, 0.02), (s * 0.55, 1.08, 0.0)], 0.018, W['trunk'], 6, radii=[0.02, 0.014, 0.008]))
    for k in range(3):
        p.append(sphere('button', (0, 0.88 - k * 0.11, 0.245 - k * 0.01), 0.022, W['coal'], segs=8, rings=6))
    p.append(ring('scarf', (0, 0.97, 0), 0.18, 0.04, 0.05, W['scarf'], segs=24, tsegs=8, axis='y'))
    p.append(box('scarfEnd', (0.1, 0.84, 0.16), (0.08, 0.22, 0.03), W['scarf'], bev=0.015, rot=(0.2, 0, 0.15)))
    return group('PrSnowman', p)


def pr_manhole():
    p = [tube('cover', (0, 0, 0), (0, 0.012, 0), 0.32, W['manhole'], 28)]
    for r in (0.12, 0.24):
        p.append(ring('groove', (0, 0.013, 0), r, 0.003, 0.005, W['hole'], segs=28, tsegs=4, axis='y'))
    for i in range(8):
        a = TAU * i / 8
        p.append(box('rib', (math.cos(a) * 0.18, 0.014, math.sin(a) * 0.18), (0.11, 0.004, 0.015), W['hole'], rot=(0, -a, 0)))
    return group('PrManhole', p)


def pr_pebbles():
    p = []
    rr = random.Random(12)
    for i in range(9):
        a = rr.uniform(0, TAU)
        r = rr.uniform(0, 0.3)
        p.append(lump('peb', (math.cos(a) * r, 0.02, math.sin(a) * r), rr.uniform(0.03, 0.06), W['pebble'] if i % 3 else W['stone'], s=(1.2, 0.6, 1.0), amp=0.25, seed=i, subdiv=1))
    return group('PrPebbles', p)


def pr_leaves():
    p = []
    rr = random.Random(14)
    for i in range(12):
        a = rr.uniform(0, TAU)
        r = rr.uniform(0, 0.4)
        out = [(math.cos(t) * 0.11, math.sin(t) * 0.055) for t in [TAU * k / 8 for k in range(8)]]
        rot = rr.uniform(0, TAU)
        out = [(x * math.cos(rot) - z * math.sin(rot) + math.cos(a) * r, x * math.sin(rot) + z * math.cos(rot) + math.sin(a) * r) for x, z in out]
        cx = sum(o[0] for o in out) / 8
        cz = sum(o[1] for o in out) / 8
        p.append((disc_mesh('leaf', out, 0.004 + i * 0.0005, W['autumn'] if i % 2 else W['autumn2'], center=(cx, cz))))
    return group('PrLeaves', p)


def pr_drift():
    return group('PrDrift', [lump('drift', (0, 0.05, 0), 0.5, W['snow'], s=(1.6, 0.35, 0.9), amp=0.12, seed=4, subdiv=2)])


def pr_flag():
    p = [tube('pole', (0, 0, 0), (0, 1.5, 0), 0.025, W['lampPost'], 8)]
    p.append(sphere('knob', (0, 1.52, 0), 0.04, W['gold'], segs=10, rings=6))
    verts = [(0.02, 1.45, 0), (0.6, 1.3, 0.02), (0.02, 1.12, 0), (0.02, 1.45, 0.012), (0.6, 1.3, 0.032), (0.02, 1.12, 0.012)]
    faces = [[0, 1, 2], [5, 4, 3], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]]
    p.append(mesh_obj('pennant', verts, faces, W['flag'], smooth=False))
    return group('PrFlag', p)


# ---------------------------------------------------------------- swallow, drone, arch

def swallow():
    """A stylized swallow, 0.55 long, flying towards -z; wings separate (origin at the shoulders)."""
    p = []
    p.append(sphere('body', (0, 0, 0.02), 0.075, W['swBack'], s=(0.95, 0.9, 2.1), segs=18, rings=12))
    p.append(sphere('belly', (0, -0.018, 0.0), 0.068, W['swBelly'], s=(0.9, 0.78, 1.9), segs=16, rings=10))
    p.append(sphere('head', (0, 0.025, -0.15), 0.066, W['swBack'], segs=18, rings=12))
    p.append(sphere('throat', (0, -0.005, -0.18), 0.048, W['swFace'], s=(1.0, 0.9, 0.8), segs=14, rings=8))
    p.append(sphere('forehead', (0, 0.05, -0.2), 0.024, W['swFace'], s=(1.2, 0.6, 0.8), segs=10, rings=6))
    p.append(tube('beak', (0, 0.02, -0.205), (0, 0.016, -0.245), 0.014, W['swBeak'], 8, r2=0.002))
    for s in (-1, 1):
        p.append(sphere('eye', (s * 0.043, 0.04, -0.185), 0.014, W['swEye'], segs=10, rings=8))
        p.append(sphere('shine', (s * 0.051, 0.047, -0.192), 0.0045, W['swShine'], segs=6, rings=4))
    # Forked tail: two long streamers and a fan.
    for s in (-1, 1):
        pts = [(s * 0.012, 0.0, 0.15), (s * 0.04, -0.004, 0.26), (s * 0.075, -0.006, 0.36)]
        p.append(sweep('tail', pts, 0.02, W['swBack'], 6, radii=[0.022, 0.012, 0.003], flat=0.25))
    p.append(sweep('tailFan', [(0, 0, 0.12), (0, -0.002, 0.2)], 0.035, W['swBack'], 8, radii=[0.03, 0.04], flat=0.2))
    body = group('Swallow', p)
    wings = []
    for s, name in ((-1, 'SwallowWingL'), (1, 'SwallowWingR')):
        # Long pointed wing swept back: a thin lofted planform from the shoulder outwards.
        lead = [(0.0, -0.06), (0.1, -0.075), (0.2, -0.06), (0.3, -0.02), (0.38, 0.05)]
        trail = [(0.0, 0.05), (0.1, 0.06), (0.2, 0.06), (0.3, 0.06), (0.38, 0.06)]
        verts = []
        for (x, zl), (_, zt) in zip(lead, trail):
            th = 0.012 * (1 - x / 0.45)
            for zz, yy in ((zl, 0), ((zl + zt) / 2, th), (zt, 0), ((zl + zt) / 2, -th * 0.6)):
                verts.append((s * (0.05 + x), yy + 0.02 - x * 0.03, zz - 0.02))
        n = len(lead)
        faces = []
        for i in range(n - 1):
            for k in range(4):
                a = i * 4 + k
                b = i * 4 + (k + 1) % 4
                faces.append([a, b, b + 4, a + 4])
        faces.append([0, 1, 2, 3][::-1])
        last = (n - 1) * 4
        faces.append([last, last + 1, last + 2, last + 3])
        w = mesh_obj(name, verts, faces, W['swBack'])
        # a light underside stripe
        set_origin(w, (s * 0.05, 0.02, -0.02))
        wings.append(w)
    return [body] + wings


def drone():
    p = []
    p.append(sphere('shell', (0, 0, 0), 0.2, W['drone'], s=(1.0, 0.42, 1.25), segs=24, rings=14))
    p.append(sphere('canopy', (0, 0.05, -0.04), 0.12, W['droneDark'], s=(1.0, 0.55, 1.3), segs=18, rings=10))
    p.append(ring('belt', (0, -0.005, 0), 0.198, 0.006, 0.008, W['lens'], segs=48, tsegs=6, axis='y'))
    for sx in (-1, 1):
        for sz in (-1, 1):
            tip = (sx * 0.3, 0.02, sz * 0.3)
            p.append(sweep('arm', [(sx * 0.1, 0.0, sz * 0.12), (sx * 0.2, 0.015, sz * 0.21), tip], 0.025, W['drone'], 8, flat=0.5))
            p.append(tube('motor', (tip[0], 0.0, tip[2]), (tip[0], 0.06, tip[2]), 0.035, W['droneDark'], 14))
            p.append(ring('guard', (tip[0], 0.05, tip[2]), 0.15, 0.012, 0.008, W['drone'], segs=40, tsegs=6, axis='y'))
            p.append(tube('leg', (tip[0] * 0.8, -0.04, tip[2] * 0.8), (tip[0] * 0.85, -0.12, tip[2] * 0.85), 0.01, W['droneDark'], 6))
    # The scanner head underneath: a gimbal with a glowing lens looking forward and down.
    p.append(sphere('gimbal', (0, -0.09, -0.16), 0.07, W['droneDark'], segs=16, rings=10))
    p.append(tube('lens', (0, -0.1, -0.215), (0, -0.115, -0.235), 0.045, W['lens'], 20))
    p.append(tube('antenna', (0.06, 0.07, 0.15), (0.09, 0.2, 0.2), 0.006, W['droneDark'], 6))
    p.append(sphere('antTip', (0.09, 0.2, 0.2), 0.014, W['lens'], segs=8, rings=6))
    body = group('Drone', p)
    r = []
    for k in range(2):
        a = k * math.pi
        r.append(sweep('blade', [(0, 0.0, 0), (math.cos(a) * 0.07, 0.004, math.sin(a) * 0.07), (math.cos(a) * 0.13, 0.008, math.sin(a) * 0.13)], 0.02, W['rotor'], 4, radii=[0.012, 0.02, 0.008], flat=0.2))
    r.append(tube('hub', (0, -0.01, 0), (0, 0.015, 0), 0.016, W['droneDark'], 10))
    rotor = group('DroneRotor', r)
    return [body, rotor]


def arch():
    p = []
    span = 3.4
    for s in (-1, 1):
        x = s * span
        p.append(box('foot', (x, 0.1, 0), (0.7, 0.2, 0.7), W['archPost'], bev=0.04))
        p.append(tube('pillar', (x, 0.2, 0), (x, 3.2, 0), 0.32, W['archA'], 24))
        for k in range(4):
            p.append(ring('stripe', (x, 0.6 + k * 0.75, 0), 0.32, 0.025, 0.12, W['archB'], segs=24, tsegs=6, axis='y'))
    # The arch: a half torus over the trail, alternating color bands.
    n = 24
    for i in range(n):
        a0 = math.pi * i / n
        a1 = math.pi * (i + 1) / n
        pts = [(math.cos(a0 + (a1 - a0) * k / 3) * span, 3.2 + math.sin(a0 + (a1 - a0) * k / 3) * 1.4, 0) for k in range(4)]
        p.append(sweep('arc', pts, 0.32, W['archA'] if i % 2 == 0 else W['archB'], 16, caps=False))
    # Banner over the trail (the app adds its own text panel in front of it).
    p.append(box('banner', (0, 4.15, 0), (4.4, 0.85, 0.12), W['archBanner'], bev=0.04))
    p.append(box('bannerTrim', (0, 4.15, -0.0), (4.55, 0.95, 0.08), W['archPost'], bev=0.03))
    for s in (-1, 1):
        p.append(tube('rope', (s * 2.2, 4.5, 0), (s * span * 0.9, 4.38, 0), 0.025, W['archPost'], 6))
    # A checkered strip on the ground (start/finish line).
    for i in range(16):
        for j in range(2):
            m = W['archB'] if (i + j) % 2 == 0 else W['archBanner']
            p.append(box('check', (-3.0 + i * 0.4 + 0.2, 0.012, -0.2 + j * 0.4), (0.4, 0.024, 0.4), m))
    main = group('Arch', p)
    # Garland along the arch with gold bows (Christmas only, the app hides it otherwise).
    p = []
    pts = []
    for i in range(41):
        a = math.pi * i / 40
        pts.append((math.cos(a) * span, 3.2 + math.sin(a) * 1.4 + 0.0, 0.36 + 0.05 * math.sin(i * 1.7)))
    p.append(sweep('garland', pts, 0.11, W['garland'], 10, caps=True))
    for a in (0.25, 0.5, 0.75):
        aa = math.pi * a
        c = (math.cos(aa) * span, 3.2 + math.sin(aa) * 1.4, 0.48)
        for s in (-1, 1):
            p.append(ring('bow', (c[0] + s * 0.1, c[1], c[2]), 0.09, 0.025, 0.03, W['gold'], segs=16, tsegs=6, axis='z'))
        p.append(sphere('knot', c, 0.06, W['gold'], segs=10, rings=6))
    return [main, group('ArchGarland', p)]


# ================================================================ build / export

def export_sel(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_animations=False, export_normals=True,
                              export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True)


def build_models(out_bike, out_world, out_blend):
    bike = [build_frame(), build_fork(), build_wheel(), build_cranks()] + build_tires() + [build_helmet()] + build_pump()
    world = [hz_glass(), hz_nails(), hz_thorns(), hz_pothole(), hz_roots(), hz_ice(), hz_puddle(),
             it_star(), it_cartridge(), it_shield(),
             pr_lamp(), pr_post(), pr_bush(), pr_sign(), pr_tree(), pr_fence(), pr_rock(), pr_grass(), pr_hay(),
             pine('PrPine'), pr_stump(), pr_fern(), pr_mushroom(), pine('PrPineSnow', True), pr_rock_snow(), pr_lantern(),
             pr_snowman(), pr_manhole(), pr_pebbles(), pr_leaves(), pr_drift(), pr_flag()] + swallow() + drone() + arch()
    # Ambient occlusion in the vertex colors (glowing parts stay white).
    glow = {'BkLightGlow', 'BkBandGlow', 'BkShieldGlow', 'BkLampGlow', 'BkReflectGlow', 'BkLensGlow'}
    dens = {'BikeFrame': 0.05, 'BikeFork': 0.05, 'BikeWheel': 0.08, 'BikeCranks': 0.05, 'TireSlick': 0.06, 'TireAllround': 0.06,
            'TireKnobby': 0.06, 'TireSpikes': 0.06, 'EchoHelmet': 0.1, 'PumpBody': 0.08, 'PumpHandle': 0.1}
    dens.update({'Arch': 0.4, 'ArchGarland': 0.3, 'PrTree': 0.25, 'PrPine': 0.25, 'PrPineSnow': 0.25, 'PrLamp': 0.3, 'PrHay': 0.2, 'PrFence': 0.25, 'PrSnowman': 0.15, 'PrBush': 0.15})
    if not os.environ.get('NOBAKE'):  # NOBAKE=1: quick previews while modeling
        bake_ao([(o, dens.get(o.name, 0.1)) for o in bike + world], glow, distance=0.2, samples=20)
    for o in bike + world:
        print('faces', o.name, len(o.data.polygons))
    export_sel(bike, out_bike)
    export_sel(world, out_world)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
    print('DONE')


# ---------------------------------------------------------------- coin art

def coin_render(bike_blend, echo_blend, out_png, size=512, samples=64):
    """Renders the game coin picture: Echo on the bike with knobby tires and the glowing band,
    riding towards the viewer, the swallow ahead and a star, on a violet-to-cyan background."""
    bpy.ops.wm.open_mainfile(filepath=bike_blend)
    sc = bpy.context.scene
    keep = {'BikeFrame', 'BikeFork', 'BikeWheel', 'BikeCranks', 'TireKnobby', 'TireBand', 'Swallow', 'SwallowWingL', 'SwallowWingR', 'ItStar', 'EchoHelmet'}
    for o in list(sc.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)

    def dup(name, loc):
        o = bpy.data.objects[name]
        c = o.copy()
        sc.collection.objects.link(c)
        c.location = loc
        return c
    for name in ('BikeWheel', 'TireKnobby', 'TireBand'):
        bpy.data.objects[name].location = P(*RA)
        dup(name, P(*FA))
    # Echo from its own file, on the saddle, facing forward, wings folded to the grips.
    with bpy.data.libraries.load(echo_blend, link=False) as (src, dst):
        dst.objects = list(src.objects)
    echo_root = bpy.data.objects.new('EchoRoot', None)
    sc.collection.objects.link(echo_root)
    for o in dst.objects:
        if o is None:
            continue
        sc.collection.objects.link(o)
        if o.parent is None:
            o.parent = echo_root
        if o.name in ('MouthOpen', 'LidL', 'LidR', 'LidLowL', 'LidLowR'):
            o.hide_render = True
    helmet = bpy.data.objects['EchoHelmet']
    helmet.parent = echo_root
    bpy.data.objects['WingR'].rotation_euler = (0, 0.55, -1.25)
    bpy.data.objects['WingL'].rotation_euler = (0, -0.55, 1.25)
    echo_root.scale = (0.6, 0.6, 0.6)
    echo_root.location = P(0, 1.08, 0.1)
    echo_root.rotation_euler = (-0.12, 0, math.pi)
    # The bike turned three quarters towards the camera.
    rig = bpy.data.objects.new('Rig', None)
    sc.collection.objects.link(rig)
    for o in list(sc.objects):
        if o.parent is None and o is not rig and not o.name.startswith(('Swallow', 'ItStar')):
            o.parent = rig
    rig.rotation_euler = (0, 0.05, math.radians(-38))
    # The swallow up front, wings raised, and a star.
    sw = bpy.data.objects.new('SwRig', None)
    sc.collection.objects.link(sw)
    for n in ('Swallow', 'SwallowWingL', 'SwallowWingR'):
        bpy.data.objects[n].parent = sw
    bpy.data.objects['SwallowWingL'].rotation_euler = (0, 1.0, 0)
    bpy.data.objects['SwallowWingR'].rotation_euler = (0, -1.0, 0)
    sw.location = (-0.26, 0.6, 1.6)
    sw.rotation_euler = (0.15, -0.25, math.radians(-30))
    sw.scale = (1.35, 1.35, 1.35)
    st = bpy.data.objects['ItStar']
    st.location = (0.6, 0.3, 1.5)
    st.rotation_euler = (0.1, 0.25, 0.35)
    st.scale = (0.9, 0.9, 0.9)
    # The token colors of the game (game-bike.css) instead of the preview colors.
    def lin3(h):
        c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)
    for name, h in (('BkFrame', '#7c3aed'), ('BkAccent', '#22d3ee'), ('BkTireAccent', '#ff8a3d'), ('BkHelmet', '#ffb02e'), ('BkBottle', '#22d3ee'), ('BkSwallowBack', '#1f2d70'), ('BkSwallowFace', '#cf5a2c'), ('BkGold', '#ffc43d')):
        m = bpy.data.materials.get(name)
        if m:
            m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lin3(h), 1)
    band = bpy.data.materials.get('BkBandGlow')
    if band:
        bsdf = band.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Emission Color'].default_value = (*lin3('#34f5c5'), 1)
        bsdf.inputs['Emission Strength'].default_value = 4.0
    # Background: a violet-to-cyan gradient (the app's token colors).
    world = bpy.data.worlds.new('CoinWorld')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mapn = nt.nodes.new('ShaderNodeMapping')
    grad = nt.nodes.new('ShaderNodeTexGradient')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    light_path = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    bg2 = nt.nodes.new('ShaderNodeBackground')

    def lin(h):
        c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1,)
    ramp.color_ramp.elements[0].color = lin('#3a1a8a')
    ramp.color_ramp.elements[1].color = lin('#0d8fa8')
    nt.links.new(tc.outputs['Window'], mapn.inputs['Vector'])
    mapn.inputs['Rotation'].default_value = (0, 0, math.radians(-45))
    mapn.inputs['Location'].default_value = (-0.2, 0.5, 0)
    nt.links.new(mapn.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg2.inputs['Color'].default_value = (0.6, 0.62, 0.75, 1)
    bg2.inputs['Strength'].default_value = 0.3
    # The camera sees the gradient, the objects are lit by a soft neutral world.
    nt.links.new(light_path.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(bg2.outputs['Background'], mix.inputs[1])
    nt.links.new(bg.outputs['Background'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], nt.nodes['World Output'].inputs['Surface'])
    # A snowy floor that only catches the shadow.
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=2.5)
    floor = link('Floor', bm, material('CoinFloor', (0.85, 0.9, 1.0), 0.0, 0.7))
    floor.is_shadow_catcher = True

    def light(name, loc, energy, color, size):
        d = bpy.data.lights.new(name, 'AREA')
        d.energy = energy
        d.color = color
        d.size = size
        o = bpy.data.objects.new(name, d)
        sc.collection.objects.link(o)
        o.location = loc
        tr = o.constraints.new('TRACK_TO')
        tr.target = rig
        return o
    light('Key', (2.6, 3.0, 3.6), 420, (1.0, 0.95, 0.9), 2.5)
    light('Rim', (-2.4, -2.6, 2.6), 420, (0.45, 0.9, 1.0), 2.0)
    light('Fill', (-3.0, 2.6, 1.2), 140, (0.85, 0.65, 1.0), 2.5)
    cam_d = bpy.data.cameras.new('Cam')
    cam_d.lens = 78
    cam = bpy.data.objects.new('Cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = (0.35, 5.6, 1.75)
    target = bpy.data.objects.new('Target', None)
    sc.collection.objects.link(target)
    target.location = (0.0, 0.0, 0.98)
    tc2 = cam.constraints.new('TRACK_TO')
    tc2.target = target
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    print('DONE')


if MODE == 'models':
    build_models(ARGS[1], ARGS[2], ARGS[3])
elif MODE == 'coin':
    coin_render(ARGS[1], ARGS[2], ARGS[3], *(int(x) for x in ARGS[4:6]))

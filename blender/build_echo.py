# Builds "Echo", the Echomotion bat mascot, in 3D following the mascot guide
# (Leitfaden Fledermaus): unit E = body width.
#   Body 1 E wide, almost as tall, head and body one round shape.
#   Wings open: span 2.2 E, three round arcs per wing, no spikes.
#   Ears 0.5 E above the body, light inner ear.
#   Eyes 0.3 E each: white with a big pupil and a highlight.
#   Belly patch 0.55 E, light and round, below the smile. Small cheeks.
#   Echo rings: two arcs (0.3 E and 0.4 E) above the head between the ears, at ear-tip height.
# Colors: gradient 135 deg violet #7C3AED -> cyan #06B6D4 (body, ears); wings and inner ears
# #A78BFA; white eyes; pupils and mouth deep violet #1E1B4B (never black); rings cyan.
#
# Quality details: cupped ears with a recessed inner ear, eyes with lid rims, iris ring and
# two highlights, wings with arm and finger bones and soft rounded edges, feet with toes, and
# ambient occlusion baked into the vertex colors (attribute "Col", grey values). The app
# recolors everything from the design tokens and multiplies in this occlusion.
# Objects (for animation in the app): Body (body, feet, nose, eye rims), EarL/EarR (origin at
# the ear base, for twitches), EyeL/EyeR (origin at the eye center, looking along their local
# axis) with the children PupilL/PupilR (iris and pupil, move to look around) and LidL/LidR
# (upper eyelid, origin at the top of the eye: scaled down over the eye to blink) and
# LidLowL/LidLowR (lower eyelid, pushes up for smiling eyes), Mouth
# (smile) and MouthOpen (open mouth for calls), Logo (Echomotion signet on the belly),
# WingL/WingR (origin at the shoulder, for flapping), Ring1 (lower), Ring2 (upper).
# Usage: blender -b -P build_echo.py -- <out.glb> <out.blend>
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def srgb(h):
    """#rrggbb -> linear RGB."""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


VIOLET, CYAN, LIGHT, WHITE, DEEP, BONE, IRIS = (srgb(h) for h in ('#7C3AED', '#06B6D4', '#A78BFA', '#FFFFFF', '#1E1B4B', '#8B5CF6', '#3B2F8F'))


def material(name, color, rough=0.45, emit=None, gradient=False):
    """Preview material: base color (or the body gradient) times the baked occlusion 'Col'."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    if gradient:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        sub = nt.nodes.new('ShaderNodeMath')
        sub.operation = 'SUBTRACT'
        mad = nt.nodes.new('ShaderNodeMath')
        mad.operation = 'MULTIPLY_ADD'
        mad.inputs[1].default_value = 1 / 2.5
        mad.inputs[2].default_value = 1.5 / 2.5
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*VIOLET, 1)
        ramp.color_ramp.elements[1].color = (*CYAN, 1)
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        nt.links.new(sep.outputs['X'], sub.inputs[0])
        nt.links.new(sep.outputs['Z'], sub.inputs[1])
        nt.links.new(sub.outputs[0], mad.inputs[0])
        nt.links.new(mad.outputs[0], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], mix.inputs['A'])
    else:
        mix.inputs['A'].default_value = (*color, 1)
    nt.links.new(vc.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    return m


M_BODY = material('EchoBody', VIOLET, 0.42, gradient=True)
M_LIGHT = material('EchoLight', LIGHT, 0.5)
M_BONE = material('EchoBone', BONE, 0.45)
M_WHITE = material('EchoWhite', WHITE, 0.15)
M_DEEP = material('EchoDeep', DEEP, 0.22)
M_IRIS = material('EchoIris', IRIS, 0.22)
M_CYAN = material('EchoCyan', CYAN, 0.3, emit=CYAN)
M_LOGO = material('EchoLogo', WHITE, 0.35)
M_LID = material('EchoLid', tuple(VIOLET[k] * 0.45 + CYAN[k] * 0.55 for k in range(3)), 0.42)


def obj(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    return o


def ellipsoid(center, radii, mat, seg=32, rings=20, rot=None, name='part'):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return obj(name, bm, mat)


def tube(points, radii, mat, name, caps=True, sides=14):
    """Tube along points; radii is a number or a list (tapering)."""
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(points)
    bm = bmesh.new()
    rings = []
    n = len(points)
    prev_a = None
    for i, p in enumerate(points):
        t = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)]).normalized()
        a = t.orthogonal().normalized() if prev_a is None else (prev_a - t * prev_a.dot(t)).normalized()
        prev_a = a
        b = t.cross(a)
        r = radii[i]
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)])
    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(sides):
            bm.faces.new((r0[k], r1[k], r1[(k + 1) % sides], r0[(k + 1) % sides]))
    if caps:
        for p, r in ((points[0], radii[0]), (points[-1], radii[-1])):
            s = bmesh.new()
            bmesh.ops.create_uvsphere(s, u_segments=sides, v_segments=10, radius=r)
            bmesh.ops.translate(s, vec=p, verts=s.verts)
            me = bpy.data.meshes.new('tmp')
            s.to_mesh(me)
            s.free()
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
    return obj(name, bm, mat)


def torus(center, normal, R, r, mat, name, maj=64, mino=12):
    bm = bmesh.new()
    verts = []
    for i in range(maj):
        a = 2 * math.pi * i / maj
        verts.append([bm.verts.new(((R + r * math.cos(b)) * math.cos(a), r * math.sin(b), (R + r * math.cos(b)) * math.sin(a)))
                      for b in (2 * math.pi * j / mino for j in range(mino))])
    for i in range(maj):
        for j in range(mino):
            bm.faces.new((verts[i][j], verts[(i + 1) % maj][j], verts[(i + 1) % maj][(j + 1) % mino], verts[i][(j + 1) % mino]))
    rot = Vector((0, -1, 0)).rotation_difference(normal).to_matrix()
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return obj(name, bm, mat)


# ---------- body: one round shape, slightly pear-like ----------
DEPTH = 0.84


def shape_k(z):
    return 1 + 0.1 * max(0.0, -z / 0.5) - 0.04 * max(0.0, z / 0.5)


def body_shape(v):
    """Maps a point of the sphere (radius 0.5) to the body surface."""
    x, y, z = v
    k = shape_k(z)
    return Vector((x * k, y * k * DEPTH, z * (0.95 if z < 0 else 1.0)))


bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=112, v_segments=72, radius=0.5)
for v in bm.verts:
    v.co = body_shape(v.co)
body = obj('BodyShell', bm, M_BODY)


def surface_y(x, z):
    """Front surface (y < 0) of the body at (x, z) (z in sphere space, close enough)."""
    r2 = 0.25 - x * x - z * z
    if r2 <= 0:
        return 0.0
    return -math.sqrt(r2) * shape_k(z) * DEPTH


def surface_normal(x, z):
    y = surface_y(x, z)
    return Vector((x, y / (DEPTH * DEPTH), z)).normalized()


parts = [body]

# Feet with three little toes each
for s in (-1, 1):
    parts.append(ellipsoid((s * 0.16, -0.06, -0.465), (0.105, 0.125, 0.07), M_BODY, 32, 18, None, 'foot'))
    for k in (-1, 0, 1):
        parts.append(ellipsoid((s * 0.16 + k * 0.055, -0.17, -0.488), (0.034, 0.04, 0.03), M_BODY, 20, 12, None, 'toe'))


# Ears: cupped leaf shapes (concave front, rounded back), tilted outwards; tips 0.5 E above the
# body top. The light inner ear lies recessed in the cup.
EAR_H, EAR_W = 0.72, 0.205


def ear_width(t):
    return EAR_W * (1 - t) ** 0.8 * (1 + 0.28 * math.sin(math.pi * t)) + 0.006 * (1 - t)


def ear_point(s, t, u, side):
    """t: 0 base .. 1 tip, u: -1 .. 1 across, side: -1 front (cupped) / +1 back (rounded)."""
    w = ear_width(t)
    x = u * w
    z = t * EAR_H
    th = 0.075 * (1 - t) ** 0.6 + 0.008  # thickness
    if side < 0:
        y = -th * 0.55 + 0.05 * (1 - u * u) * (1 - t) ** 0.7  # cup: the middle sits deeper
    else:
        y = th * 0.45 * math.sqrt(max(0.0, 1 - u * u))
    x += s * 0.045 * t * t  # tips curl outwards
    return Vector((x, y, z))


def place_ear(v, s):
    v = Matrix.Rotation(s * 0.34, 3, 'Y') @ v
    return v + Vector((s * 0.24, 0.0, 0.33))


def ear(s):
    bm = bmesh.new()
    NT, NU = 28, 22
    front = [[bm.verts.new(place_ear(ear_point(s, i / NT, -1 + 2 * j / NU, -1), s)) for j in range(NU + 1)] for i in range(NT + 1)]
    back = [[bm.verts.new(place_ear(ear_point(s, i / NT, -1 + 2 * j / NU, 1), s)) for j in range(NU + 1)] for i in range(NT + 1)]
    for i in range(NT):
        for j in range(NU):
            bm.faces.new((front[i][j], front[i][j + 1], front[i + 1][j + 1], front[i + 1][j]))
            bm.faces.new((back[i][j], back[i + 1][j], back[i + 1][j + 1], back[i][j + 1]))
    for i in range(NT):  # rims
        for j in (0, NU):
            q = (front[i][j], front[i + 1][j], back[i + 1][j], back[i][j])
            bm.faces.new(q if j == 0 else q[::-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj('ear', bm, M_BODY)


def inner_ear(s):
    """Light patch lying in the cup of the ear."""
    bm = bmesh.new()
    NT, NU = 22, 14
    grid = []
    for i in range(NT + 1):
        t = 0.1 + 0.72 * i / NT
        row = []
        for j in range(NU + 1):
            u = (-1 + 2 * j / NU) * 0.62 * (1 - (i / NT) ** 3 * 0.6)
            p = ear_point(s, t, u, -1) + Vector((0, -0.004, 0))
            row.append(bm.verts.new(place_ear(p, s)))
        grid.append(row)
    for i in range(NT):
        for j in range(NU):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj('innerEar', bm, M_LIGHT)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in objs:
        p.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = objs[0]
    o.name = name
    o.data.name = name
    return o


def set_origin(o, origin):
    """Moves the object's origin to a point (vertices stay where they are)."""
    o.data.transform(Matrix.Translation(-Vector(origin)))
    o.location = Vector(origin)
    return o


# Ears as their own nodes (origin at the ear base) so they can twitch.
ears = []
for s in (-1, 1):
    e = join([ear(s), inner_ear(s)], 'EarL' if s < 0 else 'EarR')
    ears.append(set_origin(e, (s * 0.24, 0.0, 0.33)))

# Eyes (0.3 E each): the lid rim stays on the body; white, iris, pupil, highlights and the
# upper eyelid are built in eye space (looking along -Y) and placed as their own nodes.
eyes, movers = [], []
for s in (-1, 1):
    tag = 'L' if s < 0 else 'R'
    ex, ez = s * 0.19, 0.08
    n = surface_normal(ex, ez)
    q = Vector((0, -1, 0)).rotation_difference(n)
    c = Vector((ex, surface_y(ex, ez), ez)) + n * 0.002
    parts.append(torus(c + n * 0.006, n, 0.151, 0.017, M_BODY, 'lidRim'))
    pc = Vector((-s * 0.01, -0.02, -0.012))
    white = ellipsoid((0, 0, 0), (0.15, 0.034, 0.15), M_WHITE, 56, 28, None, 'eye')
    shine = ellipsoid(pc + Vector((0.032, -0.024, 0.036)), (0.03, 0.009, 0.03), M_WHITE, 24, 12, None, 'shine')
    shine2 = ellipsoid(pc + Vector((-0.034, -0.022, -0.03)), (0.013, 0.006, 0.013), M_WHITE, 16, 10, None, 'shine2')
    eye = join([white, shine, shine2], 'Eye' + tag)
    eye.rotation_mode = 'QUATERNION'
    eye.rotation_quaternion = q
    eye.location = c
    pupil = join([ellipsoid((0, 0, 0), (0.104, 0.022, 0.104), M_IRIS, 48, 24, None, 'iris'),
                  ellipsoid((0, -0.006, 0), (0.086, 0.021, 0.086), M_DEEP, 48, 24, None, 'pupil')], 'Pupil' + tag)
    pupil.parent = eye
    pupil.location = pc
    # Upper eyelid: covers the whole eye (and the bulging pupil) at scale 1, hangs from the top.
    lid = ellipsoid((0, -0.004, -0.153), (0.159, 0.058, 0.155), M_LID, 48, 24, None, 'Lid' + tag)
    lid.parent = eye
    lid.location = (0, 0, 0.153)
    # Lower eyelid: pushes up from the bottom for smiling and squinting eyes.
    low = ellipsoid((0, -0.004, 0.153), (0.159, 0.058, 0.155), M_LID, 48, 24, None, 'LidLow' + tag)
    low.parent = eye
    low.location = (0, 0, -0.153)
    eyes.append(eye)
    movers.extend([lid, low])

# Nose
parts.append(ellipsoid((0, surface_y(0, -0.035) - 0.004, -0.035), (0.034, 0.02, 0.023), M_DEEP, 24, 14, None, 'nose'))

# Smile: a short arc on the face with soft round ends
pts = []
for i in range(25):
    a = math.radians(212 + i * (116 / 24))
    x, z = 0.075 * math.cos(a), -0.045 + 0.07 * math.sin(a)
    pts.append(Vector((x, surface_y(x, z) - 0.008, z)))
mouth = set_origin(tube(pts, 0.021, M_DEEP, 'Mouth'), (0, surface_y(0, -0.095) - 0.008, -0.095))
# Open mouth for calls and surprise (the app scales it up from nothing).
mo = Vector((0, surface_y(0, -0.098) - 0.006, -0.098))
mouth_open = ellipsoid(mo, (0.062, 0.03, 0.055), M_DEEP, 32, 16, None, 'MouthOpen')
set_origin(mouth_open, mo)
movers.append(mouth_open)

# Echomotion signet on the belly: a patch that follows the belly's curve, with UVs for the
# logo. The app maps the official logo (assets/echomotion-logo.svg) onto it.
bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')
N, SIZE, CZ = 28, 0.26, -0.265
grid = [[bm.verts.new((x, surface_y(x, z) - 0.005, z))
         for z in (CZ + (j / N - 0.5) * SIZE for j in range(N + 1))]
        for x in ((i / N - 0.5) * SIZE for i in range(N + 1))]
for i in range(N):
    for j in range(N):
        f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
        for loop, (u, v) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
            loop[uvl].uv = (u / N, v / N)
logo = obj('Logo', bm, M_LOGO)  # kept separate so it casts no occlusion onto the belly


body = join(parts, 'Body')

# ---------- wings: membrane with three round arcs, arm and finger bones ----------
SHOULDER = (0.43, 0.03, 0.07)
LEN = 0.68  # from the shoulder to the tip: span = 2 * (0.43 + 0.68) = 2.22 E
CUSPS = [(-0.06, -0.15), (0.24, -0.13), (0.47, -0.04), (LEN, 0.18)]


def wing_top(u):
    """Upper edge (leading edge): a gentle arch from the shoulder up to the tip."""
    return 0.13 + 0.05 * u / LEN + 0.07 * math.sin(math.pi * max(0.0, u) / LEN)


def wing_bottom(u):
    """Lower edge: three round scallops (concave arcs) between soft points."""
    for (u0, v0), (u1, v1) in zip(CUSPS, CUSPS[1:]):
        if u <= u1 or u1 == LEN:
            s = max(0.0, min(1.0, (u - u0) / (u1 - u0)))
            depth = 0.075 * (u1 - u0) / 0.3
            return v0 + (v1 - v0) * s + depth * math.sin(math.pi * s) ** 0.8
    return CUSPS[-1][1]


def membrane_y(u, v, top, bot):
    """Membrane thickness profile: thin, a little thicker at the arm, rounded edges."""
    span = max(1e-4, top - bot)
    k = (v - bot) / span
    return 0.006 + 0.01 * max(0.0, math.sin(math.pi * min(1.0, max(0.0, k)))) ** 0.5


def wing(side):
    bm = bmesh.new()
    NU, NV = 64, 14
    grids = []
    for face_side in (-1, 1):
        g = []
        for i in range(NU + 1):
            u = -0.06 + (LEN + 0.06) * i / NU
            top, bot = wing_top(u), wing_bottom(u)
            if i == NU:
                top = bot = (top + bot) / 2
            row = []
            for j in range(NV + 1):
                v = bot + (top - bot) * j / NV
                y = face_side * membrane_y(u, v, top, bot) * (0.0 if j in (0, NV) or i == NU else 1.0)
                row.append(bm.verts.new((side * u, y, v)))
            g.append(row)
        grids.append(g)
    front, back = grids
    for i in range(NU):
        for j in range(NV):
            q = (front[i][j], front[i + 1][j], front[i + 1][j + 1], front[i][j + 1])
            bm.faces.new(q if side > 0 else q[::-1])
            q = (back[i][j], back[i][j + 1], back[i + 1][j + 1], back[i + 1][j])
            bm.faces.new(q if side > 0 else q[::-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mem = obj('membrane', bm, M_LIGHT)
    pieces = [mem]
    # Arm along the leading edge, then fingers from the wrist to the two inner points
    arm = [Vector((side * u, 0, wing_top(u) - 0.012)) for u in (-0.04 + i * (LEN + 0.02) / 20 for i in range(21))]
    pieces.append(tube(arm, [0.024 - 0.014 * i / 20 for i in range(21)], M_BONE, 'arm', sides=12))
    wrist = Vector((side * 0.3, 0, wing_top(0.3) - 0.014))
    for cu, cv in CUSPS[1:3]:
        end = Vector((side * cu, 0, cv + 0.012))
        pts = [wrist.lerp(end, k / 12) for k in range(13)]
        pieces.append(tube(pts, [0.014 - 0.006 * k / 12 for k in range(13)], M_BONE, 'finger', sides=10))
    o = join(pieces, 'WingL' if side < 0 else 'WingR')
    o.location = (side * SHOULDER[0], SHOULDER[1], SHOULDER[2])
    return o


wings = [wing(-1), wing(1)]


# ---------- echo rings ----------
def ring(name, radius, top, half_angle):
    c = Vector((0, -0.02, top - radius))
    pts = []
    for i in range(33):
        a = math.radians(90 - half_angle + 2 * half_angle * i / 32)
        pts.append(c + Vector((radius * math.cos(a), 0, radius * math.sin(a))))
    return tube(pts, 0.033, M_CYAN, name, sides=18)


rings = [ring('Ring1', 0.2, 0.87, 48), ring('Ring2', 0.27, 1.0, 48)]

# ---------- ambient occlusion baked into the vertex colors ----------
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 384
scene.world = bpy.data.worlds.new('World')
scene.world.light_settings.distance = 0.22
logo.hide_render = True
pupils = [o for o in scene.objects if o.name.startswith('Pupil')]
baked = [body, *ears, *eyes, *pupils, mouth, *wings]
for o in [*baked, *movers, *rings, logo]:
    me = o.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
for m in movers:
    m.hide_render = True
for o in baked:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
for m in movers:  # lids and the open mouth: lit softly, no baked shadows
    m.hide_render = False
    for d in m.data.color_attributes['Col'].data:
        d.color = (1, 1, 1, 1)
for o in [*rings, logo]:  # rings glow, the logo is printed on: no occlusion
    for d in o.data.color_attributes['Col'].data:
        d.color = (1, 1, 1, 1)
logo.hide_render = False

# ---------- export ----------
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    o.select_set(True)
print('nodes', sorted(o.name + ('<' + o.parent.name if o.parent else '') for o in scene.objects))
print('faces', sum(len(o.data.polygons) for o in scene.objects))
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format='GLB', use_selection=False, export_apply=True,
    export_yup=True, export_animations=False, export_normals=True,
)
bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup copies
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
print('DONE')

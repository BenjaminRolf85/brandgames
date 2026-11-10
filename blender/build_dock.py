# "Andock-Labor" (Docking Lab): the lab bench with its devices (original design, clean and a
# little futuristic). Everything sits in bench-local three.js coordinates (meters, y = 0 is the
# bench top) under the empty DockBenchSet; public/js/scenes/dock.js places the set at table height.
#   DockDeck        the bench top: a white slab with rounded corners, dark edge, a light strip
#   DockColumn      the cabinet below it, origin at its top, 1 m tall (the app scales it to the floor)
#   DockEmitter     the round holo projector under the protein (0, -0.8)
#   DockTray        the tray with four glowing pads for the candidates (0.35, -0.55)
#   DockReader      the assay reader with its microplate (DockPlate) and sample funnel (0.45, -0.87)
#   DockRack        test tubes with colored liquids; DockBeaker a beaker with a stirring rod
#   DockFlask       an Erlenmeyer flask; at Christmas its green liquid (DockFlaskLiquid) and the
#                   star on top (DockFlaskStar) make it a little fir tree (the app adds lights)
# Materials (recolored at runtime from the --xr-dock-* tokens): DockBench, DockTrim, DockMetal,
# DockGlow, DockGlow2, DockScreen, DockGlass, DockPlate, DockLiquid1..3, DockNeedle, DockStarGlow.
# Positions must match TRAY, PLATE, INLET and FLASK in public/js/scenes/dock.js.
#
# Usage:  blender -b -P build_dock.py -- <out.glb> <out.blend>
#         blender -b -P build_dock.py -- coin <scene.json> <out.png>   (game coin art, Cycles)
import os, sys, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, merge, export

ARGS = sys.argv[sys.argv.index('--') + 1:]


def rslab(name, c, w, h, d, r, top, side, segs=6, bev=0.006):
    """A slab with rounded corners (seen from above), three.js center c, size w x h x d."""
    bm = bmesh.new()
    pts = []
    for cx, cz, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)):
        for i in range(segs + 1):
            a = math.radians(a0 + 90 * i / segs)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    bot = [bm.verts.new(P(c[0] + x, c[1] - h / 2, c[2] + z)) for x, z in pts]
    tv = [bm.verts.new(P(c[0] + x, c[1] + h / 2, c[2] + z)) for x, z in pts]
    n = len(pts)
    ft = bm.faces.new(tv)
    fb = bm.faces.new(list(reversed(bot)))
    sides = [bm.faces.new((bot[i], bot[(i + 1) % n], tv[(i + 1) % n], tv[i])) for i in range(n)]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in sides:
        f.smooth = True
        f.material_index = 1
    ft.material_index = 0
    fb.material_index = 1
    ob = link(name, bm, top)
    ob.data.materials.append(side)
    if bev:
        mod = ob.modifiers.new('Bevel', 'BEVEL')
        mod.width = bev
        mod.segments = 3
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(50)
    return ob


def lathe(name, c, prof, mat, segs=36, cap_bottom=True, cap_top=False):
    """Revolves a profile [(r, y)] around the vertical axis through c (three.js)."""
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        rings.append([bm.verts.new(P(c[0] + r * math.cos(2 * math.pi * i / segs), c[1] + y, c[2] + r * math.sin(2 * math.pi * i / segs))) for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    return link(name, bm, mat)


def star(name, c, r_out, r_in, thick, mat, points=5):
    """A flat star facing the player (+z), extruded by thick."""
    bm = bmesh.new()
    front, back = [], []
    for i in range(points * 2):
        a = math.pi / 2 + i * math.pi / points
        r = r_out if i % 2 == 0 else r_in
        x, y = c[0] + r * math.cos(a), c[1] + r * math.sin(a)
        front.append(bm.verts.new(P(x, y, c[2] + thick / 2)))
        back.append(bm.verts.new(P(x, y, c[2] - thick / 2)))
    cf = bm.verts.new(P(c[0], c[1], c[2] + thick / 2 + thick * 0.6))
    cb = bm.verts.new(P(c[0], c[1], c[2] - thick / 2 - thick * 0.6))
    n = len(front)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((cf, front[i], front[j]))
        bm.faces.new((cb, back[j], back[i]))
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, mat)


def build_set():
    init()
    BENCH = material('DockBench', (0.86, 0.88, 0.93), 0.0, 0.32)
    TRIM = material('DockTrim', (0.03, 0.04, 0.07), 0.35, 0.45)
    METAL = material('DockMetal', (0.5, 0.55, 0.62), 0.9, 0.22)
    GLOW = material('DockGlow', (0, 0, 0), emit=(0.35, 0.85, 1.0))
    GLOW2 = material('DockGlow2', (0, 0, 0), emit=(0.6, 0.5, 1.0))
    SCREEN = material('DockScreen', (0.02, 0.025, 0.05), 0.4, 0.15)
    GLASS = material('DockGlass', (0.85, 0.93, 1.0), 0.0, 0.05)
    PLATE = material('DockPlate', (0.95, 0.96, 0.98), 0.0, 0.4)
    LIQ = [material('DockLiquid1', (0.2, 0.82, 0.75), 0.0, 0.2), material('DockLiquid2', (0.6, 0.52, 1.0), 0.0, 0.2), material('DockLiquid3', (1.0, 0.69, 0.18), 0.0, 0.2)]
    NEEDLE = material('DockNeedle', (0.14, 0.53, 0.29), 0.0, 0.25)
    STAR = material('DockStarGlow', (0, 0, 0), emit=(1.0, 0.82, 0.48))

    parts = {}

    # Bench top with a light strip along its front edge and two thin grooves.
    deck = [rslab('deck', (0, -0.02, -0.72), 1.28, 0.04, 0.54, 0.06, BENCH, TRIM, bev=0.008)]
    deck.append(tbox('strip', (0, -0.016, -0.4505), (1.12, 0.006, 0.004), GLOW))
    deck.append(tbox('lip', (0, -0.035, -0.72), (1.24, 0.012, 0.5), TRIM))
    for x in (-0.25, 0.25):
        deck.append(tbox('groove', (x, 0.0005, -0.72), (0.004, 0.002, 0.46), TRIM))
    parts['DockDeck'] = merge(deck, 'DockDeck')

    # Cabinet below (origin at its top; 1 m tall, scaled by the app down to the floor).
    cab = [tbox('cab', (0, -0.5, 0), (1.0, 1.0, 0.36), TRIM, bev=0.01)]
    cab.append(tbox('cabline', (0, -0.5, 0.1805), (0.006, 0.9, 0.003), GLOW2))
    col = merge(cab, 'DockColumn')
    col.location = P(0, -0.04, -0.74)
    parts['DockColumn'] = col

    # Holo emitter under the protein.
    em = [tcyl('base', (0, 0.008, -0.8), 0.13, 0.016, TRIM, segs=48, bev=0.003)]
    em.append(ttorus('ring', (0, 0.016, -0.8), 0.122, 0.005, METAL, axis='y', segs=64, tsegs=10))
    em.append(ttorus('glowring', (0, 0.018, -0.8), 0.096, 0.0035, GLOW, axis='y', segs=64, tsegs=8))
    em.append(tcyl('lens', (0, 0.018, -0.8), 0.072, 0.004, SCREEN, segs=48))
    em.append(ttorus('lensring', (0, 0.0205, -0.8), 0.05, 0.0018, GLOW2, axis='y', segs=48, tsegs=6))
    parts['DockEmitter'] = merge(em, 'DockEmitter')

    # Tray with four pads.
    tray = [rslab('tray', (0.35, 0.009, -0.55), 0.5, 0.018, 0.13, 0.03, TRIM, TRIM, bev=0.004)]
    for i in range(4):
        x = 0.35 + (i - 1.5) * 0.115
        tray.append(tcyl('pad', (x, 0.019, -0.552), 0.033, 0.004, METAL, segs=40))
        tray.append(ttorus('padglow', (x, 0.0215, -0.552), 0.035, 0.0022, GLOW, axis='y', segs=48, tsegs=6))
    tray.append(tbox('traystrip', (0.35, 0.009, -0.4845), (0.44, 0.004, 0.003), GLOW))
    parts['DockTray'] = merge(tray, 'DockTray')

    # Assay reader: white shell, dark screen with a light strip, plate bed and microplate, funnel.
    rd = [rslab('shell', (0.45, 0.05, -0.87), 0.2, 0.1, 0.17, 0.025, BENCH, BENCH, bev=0.008)]
    rd.append(tbox('screen', (0.45, 0.058, -0.7845), (0.15, 0.05, 0.004), SCREEN))
    rd.append(tbox('screenline', (0.45, 0.025, -0.7845), (0.15, 0.004, 0.0045), GLOW2))
    for k in range(4):
        rd.append(tbox('bar', (0.395 + k * 0.022, 0.06 + (k % 2) * 0.006, -0.7822), (0.012, 0.016 + k * 0.006, 0.001), GLOW))
    rd.append(tbox('bed', (0.45, 0.1015, -0.885), (0.142, 0.003, 0.1), TRIM))
    rd.append(tbox('plate', (0.45, 0.109, -0.885), (0.128, 0.01, 0.086), PLATE, bev=0.002))
    rd.append(lathe('funnel', (0.37, 0.1, -0.81), [(0.006, 0.0), (0.008, 0.006), (0.019, 0.017), (0.021, 0.018)], METAL, segs=32, cap_bottom=True))
    rd.append(ttorus('funnelglow', (0.37, 0.119, -0.81), 0.02, 0.0018, GLOW, axis='y', segs=40, tsegs=6))
    parts['DockReader'] = merge(rd, 'DockReader')

    # Test tubes in a rack.
    rk = [tbox('rackbase', (-0.28, 0.006, -0.9), (0.21, 0.012, 0.05), TRIM, bev=0.003)]
    rk.append(tbox('racktop', (-0.28, 0.072, -0.9), (0.21, 0.006, 0.05), METAL, bev=0.002))
    for x in (-0.38, -0.18):
        rk.append(tbox('post', (x, 0.04, -0.9), (0.008, 0.07, 0.008), METAL))
    rack = merge(rk, 'DockRack')
    tubes = []
    liq = []
    for i, x in enumerate((-0.34, -0.31, -0.28, -0.25, -0.22)):
        tubes.append(lathe('tube', (x, 0.012, -0.9), [(0.002, 0.0), (0.0065, 0.002), (0.0085, 0.008), (0.0085, 0.118), (0.0095, 0.12)], GLASS, segs=20, cap_bottom=True))
        h = (0.03, 0.055, 0.042, 0.068, 0.036)[i]
        liq.append(lathe('liq', (x, 0.012, -0.9), [(0.0015, 0.0005), (0.006, 0.0025), (0.0075, 0.008), (0.0075, h)], LIQ[i % 3], segs=16, cap_bottom=True, cap_top=True))
    parts['DockRack'] = rack
    parts['DockTubes'] = merge(tubes, 'DockTubes')
    parts['DockTubeLiquid'] = merge(liq, 'DockTubeLiquid')

    # Beaker with a stirring rod.
    parts['DockBeaker'] = lathe('DockBeaker', (-0.5, 0, -0.88), [(0.036, 0.0), (0.04, 0.003), (0.04, 0.088), (0.043, 0.092)], GLASS, segs=40, cap_bottom=True)
    parts['DockBeakerLiquid'] = lathe('DockBeakerLiquid', (-0.5, 0, -0.88), [(0.034, 0.002), (0.0375, 0.006), (0.0375, 0.046)], LIQ[1], segs=36, cap_bottom=True, cap_top=True)
    rod = tcyl('DockRod', (-0.485, 0.07, -0.875), 0.003, 0.15, GLASS, segs=12, rot=Matrix.Rotation(math.radians(-14), 3, 'Y'))
    parts['DockRod'] = rod

    # Erlenmeyer flask (a little fir at Christmas: green liquid, a star on top).
    fx, fz = -0.5, -0.58
    r0, r1, h = 0.056, 0.016, 0.14
    parts['DockFlask'] = lathe('DockFlask', (fx, 0, fz), [(r0 - 0.008, 0.0), (r0, 0.006), (r1, h), (r1, h + 0.04), (r1 + 0.004, h + 0.044)], GLASS, segs=48, cap_bottom=True)
    lh = 0.1
    parts['DockFlaskLiquid'] = lathe('DockFlaskLiquid', (fx, 0, fz), [(r0 - 0.012, 0.002), (r0 - 0.004, 0.008), (r0 - 0.004 + (r1 - r0) * (lh - 0.008) / h, lh)], NEEDLE, segs=40, cap_bottom=True, cap_top=True)
    parts['DockFlaskStar'] = star('DockFlaskStar', (fx, h + 0.072, fz), 0.024, 0.011, 0.008, STAR)

    root = bpy.data.objects.new('DockBenchSet', None)
    bpy.context.scene.collection.objects.link(root)
    for name, ob in parts.items():
        ob.name = name
        ob.data.name = name
        mw = ob.matrix_world.copy()
        ob.parent = root
        ob.matrix_world = mw
    export(ARGS[0], ARGS[1])


# ---------- game coin art (Cycles) ----------

def coin(scene_json, out_png):
    init()
    data = json.load(open(scene_json))
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 56
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'Medium High Contrast'
    sc.view_settings.exposure = -0.35

    def srgb(c):
        return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

    # Protein surface with its vertex colors (exported from the game).
    pr = data['protein']
    me = bpy.data.meshes.new('Protein')
    verts = [P(*pr['pos'][i:i + 3]) for i in range(0, len(pr['pos']), 3)]
    faces = [tuple(pr['idx'][i:i + 3]) for i in range(0, len(pr['idx']), 3)]
    me.from_pydata(verts, [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, d in enumerate(ca.data):
        d.color = (*pr['col'][i * 3:i * 3 + 3], 1)  # already linear (from the game)
    ob = bpy.data.objects.new('Protein', me)
    sc.collection.objects.link(ob)
    pm = bpy.data.materials.new('ProteinMat')
    pm.use_nodes = True
    nt = pm.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    hsv.inputs['Saturation'].default_value = 1.45
    hsv.inputs['Value'].default_value = 0.8
    nt.links.new(attr.outputs['Color'], hsv.inputs['Color'])
    nt.links.new(hsv.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.45
    bsdf.inputs['Coat Weight'].default_value = 0.3
    bsdf.inputs['Sheen Weight'].default_value = 0.25
    me.materials.append(pm)

    # The molecule, half docked, glowing where its contacts match.
    mats = {}

    def atom_mat(c, glow):
        key = (tuple(c), tuple(glow) if glow else None)
        if key not in mats:
            m = bpy.data.materials.new('Atom')
            m.use_nodes = True
            b = m.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value = (*srgb(c), 1)
            b.inputs['Roughness'].default_value = 0.22
            b.inputs['Coat Weight'].default_value = 1.0
            if glow:
                b.inputs['Emission Color'].default_value = (*srgb(glow), 1)
                b.inputs['Emission Strength'].default_value = 0.7
            mats[key] = m
        return mats[key]

    for a in data['atoms']:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=a['r'])
        bmesh.ops.translate(bm, vec=P(*a['p']), verts=bm.verts)
        o = link('atom', bm, atom_mat(a['c'], a.get('glow')))
        for p in o.data.polygons:
            p.use_smooth = True
    bond = atom_mat(data['bond'], None)
    for b in data['bonds']:
        a0, a1 = Vector(P(*b[0])), Vector(P(*b[1]))
        d = a1 - a0
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.0045, radius2=0.0045, depth=d.length)
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
        bmesh.ops.translate(bm, vec=(a0 + a1) / 2, verts=bm.verts)
        o = link('bond', bm, bond)
        for p in o.data.polygons:
            p.use_smooth = True

    # Backdrop: a glowing gradient disc and soft bokeh lights.
    bg = bpy.data.materials.new('Back')
    bg.use_nodes = True
    nt = bg.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.9, 0.9, 0.9)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    # Spherical gradient: 1 in the middle, 0 at the rim: a glow behind the protein.
    ramp.color_ramp.elements[0].color = (*srgb(data['bg'][1]), 1)
    ramp.color_ramp.elements[1].color = (*srgb(data['bg'][0]), 1)
    ramp.color_ramp.elements[0].position = 0.25
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=4.0)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    back = link('Backdrop', bm, bg)
    back.location = P(0, 0.02, -0.9)
    import random
    rnd = random.Random(7)
    for i in range(44):
        m = atom_mat((0, 0, 0), data['bokeh'][i % len(data['bokeh'])])
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.009 + rnd.random() * 0.014)
        a = rnd.random() * math.pi * 2
        r = 0.26 + rnd.random() * 0.34
        bmesh.ops.translate(bm, vec=P(math.cos(a) * r, math.sin(a) * r * 0.9 + 0.04, -0.3 - rnd.random() * 0.35), verts=bm.verts)
        link('bokeh', bm, m)

    # Lights and camera.
    def area(name, loc, energy, size, color):
        L = bpy.data.lights.new(name, 'AREA')
        L.energy = energy
        L.size = size
        L.color = color
        o = bpy.data.objects.new(name, L)
        o.location = loc
        sc.collection.objects.link(o)
        d = Vector((0, 0, 0)) - o.location
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return o
    area('Key', P(-0.6, 0.7, 0.9), 26, 0.7, (1.0, 0.96, 0.9))
    area('Rim', P(0.7, 0.45, -0.6), 40, 0.5, srgb(data['rim']))
    area('Rim2', P(-0.7, 0.3, -0.5), 18, 0.5, srgb(data['bokeh'][1]))
    area('Fill', P(0.6, -0.4, 0.8), 5, 0.8, (0.8, 0.85, 1.0))
    cam = bpy.data.cameras.new('Cam')
    cam.lens = 50
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = 2.0
    co = bpy.data.objects.new('Cam', cam)
    sc.collection.objects.link(co)
    co.location = P(*data['cam'])
    target = Vector(P(*data['look']))
    co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler()
    focus = Vector(P(*data.get('focus', data['look'])))
    cam.dof.focus_distance = (focus - co.location).length
    sc.camera = co
    sc.world = bpy.data.worlds.new('W')
    sc.world.color = srgb(data['bg'][1])
    sc.render.filepath = out_png
    bpy.ops.render.render(write_still=True)


if ARGS and ARGS[0] == 'coin':
    coin(ARGS[1], ARGS[2])
else:
    build_set()

# "Röstmeister" (Roast Master): a festive delicatessen counter with a drum roaster (original design).
# Builds two GLBs (meters, three.js coordinates via P()):
#   <out>.glb         the shop:
#     Counter          walnut counter with framed panels, drawers, a cream marble top, brass trims and a
#                      glass display case with treats (top of the marble at y = 0, front towards +z);
#                      children CounterGlass (panes), CounterGarland (fir garland with bows, Christmas),
#                      CounterPlinth (a dark box 1 m tall below the counter, scaled by the app to the floor)
#     Roaster          floor-standing drum roaster (front +z): RoasterBody, RoasterDrum (turns about z),
#                      RoasterGlass (sight glass), RoasterLever (pivot at its axle, turns about x),
#                      RoasterNeedle (thermometer needle, turns about z), RoasterStirrer (cooling tray arms,
#                      turns about y), RoasterFlame (burner glow), RoasterChimney; empties RoasterBeans
#                      (center of the visible drum), RoasterHopper (top of the hopper), RoasterTrayTop
#     Jar              glass jar (JarGlass) with a wooden lid (JarLid); beans come from the app
#     Bean             one coffee bean, about 1 long (scaled by the app)
#     Scale            brass beam balance: ScaleBase, ScaleBeam (pivot), ScalePan (one pan, origin at its hook)
#     Cup, Saucer, CoffeeTop   porcelain cup with a gold band, its saucer, the coffee surface (unit disc)
#     ItemCoffee, ItemPralines, ItemTea, ItemStollen, ItemJam, ItemCookies   gift basket items
#     Basket           wicker gift basket with a handle and a bow
#   <out>-guests.glb  the guests (original low-poly figures, about 1.6 m, feet at y = 0, facing +z):
#     GuestStudent, GuestGrandma, GuestBusiness, GuestFamily, GuestKid, GuestChef; each with children
#     <name>_Body, <name>_Head (pivot at the neck), <name>_ArmL, <name>_ArmR (pivot at the shoulder) and
#     empties <name>_Mouth (on the head), <name>_Hand (in the right hand)
# Materials are named Roast* / G* so the app recolors them from the --xr-roast-* tokens.
# Usage: blender -b -P build_roast.py -- <out.glb> <out.blend> [<guests.glb> <guests.blend>]
#   e.g. -- public/assets/models/roast.glb blender/roast.blend public/assets/models/roast-guests.glb blender/roast-guests.blend
#   then: bash blender/compress.sh public/assets/models/roast.glb public/assets/models/roast-guests.glb
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, link, tbox, tcyl, ttorus, merge, blob, bake_ao, export, rotate_parts

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
OUT_GUESTS = ARGS[2] if len(ARGS) > 2 else OUT_GLB.replace('.glb', '-guests.glb')
OUT_GUESTS_BLEND = ARGS[3] if len(ARGS) > 3 else OUT_BLEND.replace('.blend', '-guests.blend')
rnd = random.Random(7)


def lin(h):
    """'#rrggbb' -> linear RGB (Blender colors), so the render matches the app's tokens."""
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(name, hexcol, metal=0.0, rough=0.5, emit=None, alpha=1.0, trans=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(hexcol), 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*lin(emit), 1)
        b.inputs['Emission Strength'].default_value = 3.0
    if trans:
        b.inputs['Transmission Weight'].default_value = trans
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    return m


def make_materials():
    M = {}
    for name, hexcol, metal, rough in [
        ('RoastWood', '#6b4128', 0, 0.55), ('RoastWoodDark', '#3d2416', 0, 0.6), ('RoastWoodLight', '#a8724a', 0, 0.5),
        ('RoastMarble', '#efe5d3', 0, 0.25), ('RoastBrass', '#d6a74e', 1, 0.28), ('RoastPlinth', '#24160e', 0, 0.7),
        ('RoastEnamel', '#8c2433', 0.1, 0.3), ('RoastIron', '#2b2723', 0.6, 0.45), ('RoastCopper', '#c97a46', 1, 0.3),
        ('RoastSteel', '#9da3a8', 0.9, 0.35), ('RoastDrum', '#191513', 0.4, 0.6), ('RoastDial', '#f4ead6', 0, 0.4),
        ('RoastNeedle', '#d23a2a', 0, 0.4), ('RoastKnob', '#c8202f', 0, 0.25),
        ('RoastPorcelain', '#f7f2e9', 0, 0.2), ('RoastGold', '#e3b45a', 1, 0.25), ('RoastCoffee', '#3a2014', 0, 0.15),
        ('RoastChocDark', '#3b2116', 0, 0.35), ('RoastCookie', '#d7a15e', 0, 0.7), ('RoastCake', '#c98b4a', 0, 0.7),
        ('RoastSugar', '#fbf7f0', 0, 0.9), ('RoastBerry', '#9b1c3a', 0, 0.2), ('RoastKraft', '#b98b5a', 0, 0.85),
        ('RoastLabel', '#f4ead6', 0, 0.6), ('RoastTin', '#2f6f73', 0.6, 0.3), ('RoastBox', '#b5252f', 0, 0.45),
        ('RoastCloth', '#e8dcc6', 0, 0.9), ('RoastWicker', '#c08d52', 0, 0.75), ('RoastWickerDark', '#8a5e30', 0, 0.8),
        ('RoastFir', '#2e6a3f', 0, 0.8), ('RoastFirLight', '#4f8f55', 0, 0.8), ('RoastBow', '#c4202f', 0, 0.4),
        ('RoastBauble', '#e3b45a', 0.8, 0.2), ('RoastBean', '#93a96a', 0, 0.5),
    ]:
        M[name] = mat(name, hexcol, metal, rough)
    M['RoastGlass'] = mat('RoastGlass', '#d8eef2', 0, 0.05, alpha=0.25, trans=0.9)
    M['RoastFlameGlow'] = mat('RoastFlameGlow', '#ff8a3d', 0, 0.5, emit='#ff8a3d')
    return M


# ---------- small geometry helpers ----------

def lathe(name, prof, m, segs=32, cap_bottom=True, cap_top=False, smooth=True, c=(0, 0, 0)):
    """Spins a (radius, y) profile (bottom to top) around the three.js y axis at c."""
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new(P(c[0] + r * math.cos(a), c[1] + y, c[2] + r * math.sin(a))))
        rings.append(ring)
    for k in range(len(rings) - 1):
        r0, r1 = rings[k], rings[k + 1]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap_bottom and prof[0][0] > 1e-5:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and prof[-1][0] > 1e-5:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, m)
    for p in ob.data.polygons:
        p.use_smooth = smooth
    return ob


def tube_path(name, pts, r, m, segs=8):
    """A tube through three.js points (straight segments)."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        a = Vector(pts[max(0, i - 1)])
        b = Vector(pts[min(len(pts) - 1, i + 1)])
        d = (b - a).normalized()
        up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
        u = d.cross(up).normalized()
        v = d.cross(u).normalized()
        ring = []
        for k in range(segs):
            t = 2 * math.pi * k / segs
            q = Vector(p) + (u * math.cos(t) + v * math.sin(t)) * r
            ring.append(bm.verts.new(P(q.x, q.y, q.z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, m)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def disc(name, c, r, m, axis='z', segs=32, depth=0.002):
    return tcyl(name, c, r, depth, m, axis=axis, segs=segs)


def set_origin(ob, p3):
    """Moves the object's origin to the three.js point p3 without moving the geometry."""
    v = P(*p3)
    ob.data.transform(Matrix.Translation(-v))
    ob.location = v
    return ob


def empty(name, p3=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = 0.03
    e.location = P(*p3)
    if parent:
        bpy.context.view_layer.update()
        e.parent = parent
        e.location = P(*p3) - parent.matrix_world.translation
    return e


def child(ob, parent):
    """Parents ob to parent keeping its world position (parents sit at their own origin)."""
    bpy.context.view_layer.update()
    wl = ob.matrix_world.translation.copy()
    ob.parent = parent
    ob.location = wl - parent.matrix_world.translation
    return ob


def shade_flat(ob):
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


# ---------- the shop ----------

def build_counter(M):
    W, D = 1.5, 0.56  # body width and depth (x, z)
    top = 0.0
    parts = []
    # body (walnut), plinth strip and the marble top
    parts.append(tbox('c_body', (0, -0.47, 0), (W, 0.86, D), M['RoastWood'], bev=0.006))
    parts.append(tbox('c_kick', (0, -0.875, 0.01), (W - 0.04, 0.05, D - 0.04), M['RoastWoodDark'], bev=0.004))
    parts.append(tbox('c_top', (0, -0.022, 0.005), (W + 0.07, 0.044, D + 0.07), M['RoastMarble'], bev=0.01, segs=3))
    # brass edge along the top and a brass foot rail on the player side
    parts.append(tbox('c_trim', (0, -0.058, D / 2 + 0.006), (W, 0.014, 0.012), M['RoastBrass'], bev=0.003))
    # player side: a row of drawers with brass knobs, framed panels below
    zf = D / 2
    for i in range(4):
        x = -W / 2 + W / 8 + i * W / 4
        parts.append(tbox(f'c_drawer{i}', (x, -0.16, zf + 0.008), (W / 4 - 0.035, 0.13, 0.016), M['RoastWoodLight'], bev=0.005))
        parts.append(tcyl(f'c_knob{i}', (x, -0.16, zf + 0.026), 0.013, 0.02, M['RoastBrass'], axis='z', segs=14, bev=0.004))
    for i in range(3):
        x = -W / 2 + W / 6 + i * W / 3
        pw = W / 3 - 0.07
        # frame (four rails) and a raised inner board
        parts.append(tbox(f'c_pf{i}a', (x, -0.27, zf + 0.008), (pw, 0.022, 0.016), M['RoastWoodDark'], bev=0.003))
        parts.append(tbox(f'c_pf{i}b', (x, -0.80, zf + 0.008), (pw, 0.022, 0.016), M['RoastWoodDark'], bev=0.003))
        parts.append(tbox(f'c_pf{i}c', (x - pw / 2 + 0.011, -0.535, zf + 0.008), (0.022, 0.55, 0.016), M['RoastWoodDark'], bev=0.003))
        parts.append(tbox(f'c_pf{i}d', (x + pw / 2 - 0.011, -0.535, zf + 0.008), (0.022, 0.55, 0.016), M['RoastWoodDark'], bev=0.003))
        parts.append(tbox(f'c_pb{i}', (x, -0.535, zf + 0.012), (pw - 0.07, 0.46, 0.012), M['RoastWoodLight'], bev=0.012, segs=3))
    # corner posts (turned columns)
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(tcyl(f'c_post{sx}{sz}', (sx * (W / 2 - 0.005), -0.47, sz * (D / 2 - 0.005)), 0.028, 0.84, M['RoastWoodDark'], segs=16))
    # customer side: one long panel
    parts.append(tbox('c_back', (0, -0.5, -zf - 0.008), (W - 0.1, 0.6, 0.016), M['RoastWoodLight'], bev=0.01))

    # ----- the glass display case on the customer half -----
    dx0, dx1 = -0.66, 0.46
    dz0, dz1 = -0.27, -0.05
    dh = 0.27
    cx = (dx0 + dx1) / 2
    cw = dx1 - dx0
    cz = (dz0 + dz1) / 2
    cd = dz1 - dz0
    parts.append(tbox('d_base', (cx, 0.02, cz), (cw, 0.04, cd), M['RoastWoodDark'], bev=0.005))
    parts.append(tbox('d_floor', (cx, 0.045, cz), (cw - 0.03, 0.01, cd - 0.03), M['RoastCloth'], bev=0.002))
    parts.append(tbox('d_lid', (cx, 0.04 + dh + 0.008, cz), (cw + 0.01, 0.016, cd + 0.01), M['RoastWoodDark'], bev=0.004))
    for x in (dx0, dx1):
        for z in (dz0, dz1):
            parts.append(tbox(f'd_post{x}{z}', (x, 0.04 + dh / 2, z), (0.016, dh, 0.016), M['RoastBrass'], bev=0.003))
    # a glass shelf inside with treats
    parts.append(tbox('d_shelf_rail', (cx, 0.15, dz0 + 0.02), (cw - 0.04, 0.008, 0.01), M['RoastBrass']))
    treats = []
    # pralines in rows on the floor
    for i in range(14):
        x = dx0 + 0.07 + i * 0.033
        for j in range(2):
            z = cz - 0.03 + j * 0.05
            if (i + j) % 3 == 0:
                treats.append(blob(f't_pr{i}{j}', (x, 0.064, z), 0.013, M['RoastChocDark'], s=(1, 0.8, 1), segs=10, rings=6))
            elif (i + j) % 3 == 1:
                treats.append(tbox(f't_pr{i}{j}', (x, 0.062, z), (0.022, 0.02, 0.022), M['RoastChocDark'], bev=0.005))
            else:
                treats.append(blob(f't_pr{i}{j}', (x, 0.062, z), 0.012, M['RoastCookie'], s=(1, 0.55, 1), segs=10, rings=6))
                treats.append(blob(f't_pt{i}{j}', (x, 0.07, z), 0.006, M['RoastBerry'], segs=8, rings=5))
    # a stollen and cookie stacks on the right
    treats.append(blob('t_stollen', (0.3, 0.09, cz), 0.06, M['RoastCake'], s=(1.4, 0.55, 0.7), segs=18, rings=10))
    treats.append(blob('t_sugar', (0.3, 0.11, cz), 0.055, M['RoastSugar'], s=(1.38, 0.32, 0.66), segs=18, rings=10))
    for k in range(4):
        treats.append(tcyl(f't_ck{k}', (0.39, 0.058 + k * 0.012, cz + 0.02), 0.026, 0.01, M['RoastCookie'], segs=16, bev=0.003))
    for k in range(3):
        treats.append(tcyl(f't_ck2{k}', (-0.58, 0.058 + k * 0.012, cz), 0.026, 0.01, M['RoastCookie'], segs=16, bev=0.003))
    treats.append(tcyl('t_ck2top', (-0.58, 0.058 + 3 * 0.012, cz), 0.022, 0.006, M['RoastChocDark'], segs=16))
    parts += treats
    body = merge(parts, 'Counter')

    glass = [
        tbox('g_front', (cx, 0.04 + dh / 2, dz0), (cw, dh, 0.006), M['RoastGlass']),
        tbox('g_back', (cx, 0.04 + dh / 2, dz1), (cw, dh, 0.006), M['RoastGlass']),
        tbox('g_l', (dx0, 0.04 + dh / 2, cz), (0.006, dh, cd), M['RoastGlass']),
        tbox('g_r', (dx1, 0.04 + dh / 2, cz), (0.006, dh, cd), M['RoastGlass']),
        tbox('g_shelf', (cx, 0.15, cz), (cw - 0.03, 0.006, cd - 0.03), M['RoastGlass']),
    ]
    gl = merge(glass, 'CounterGlass')
    child(gl, body)

    # ----- fir garland draped along the top of the display case, with bows and baubles -----
    g = []
    n = 40
    y0 = 0.04 + dh + 0.02
    for i in range(n + 1):
        u = i / n
        x = dx0 - 0.02 + (cw + 0.04) * u
        s = (u * 3) % 1
        y = y0 - 0.035 * 4 * s * (1 - s)
        z = dz1 + 0.012
        g.append(blob(f'gl{i}', (x, y, z), 0.022 + 0.004 * rnd.random(), M['RoastFir' if i % 2 else 'RoastFirLight'], s=(1.2, 0.9, 1.0), segs=8, rings=5))
        for k in range(2):
            a = rnd.random() * math.pi * 2
            g.append(blob(f'gn{i}{k}', (x + 0.014 * math.cos(a), y + 0.012 * math.sin(a), z + 0.012), 0.012, M['RoastFir'], s=(1.6, 0.6, 0.8), segs=6, rings=4))
    for k, u in enumerate((0.0, 1 / 3, 2 / 3, 1.0)):
        x = dx0 - 0.02 + (cw + 0.04) * u
        # bow: two loops and two tails
        for sx in (-1, 1):
            g.append(blob(f'bl{k}{sx}', (x + sx * 0.022, y0 + 0.006, dz1 + 0.03), 0.02, M['RoastBow'], s=(1.2, 0.8, 0.45), segs=10, rings=6))
            g.append(tbox(f'bt{k}{sx}', (x + sx * 0.012, y0 - 0.03, dz1 + 0.03), (0.012, 0.05, 0.004), M['RoastBow'],
                          rot=Matrix.Rotation(sx * 0.35, 3, 'Y')))
        g.append(blob(f'bk{k}', (x, y0 + 0.006, dz1 + 0.034), 0.01, M['RoastBow'], segs=8, rings=5))
    for k, u in enumerate((1 / 6, 0.5, 5 / 6)):
        x = dx0 - 0.02 + (cw + 0.04) * u
        g.append(blob(f'bb{k}', (x, y0 - 0.06, dz1 + 0.03), 0.017, M['RoastBauble'], segs=12, rings=8))
        g.append(tcyl(f'bc{k}', (x, y0 - 0.04, dz1 + 0.03), 0.005, 0.008, M['RoastBrass'], segs=8))
    gar = merge(g, 'CounterGarland')
    child(gar, body)

    # plinth: a dark box from 0.9 m below the top, 1 m tall (the app scales it down to the floor)
    pl = tbox('CounterPlinth', (0, -0.9 - 0.5, 0), (W - 0.06, 1.0, D - 0.06), M['RoastPlinth'])
    set_origin(pl, (0, -0.9, 0))
    child(pl, body)
    return body


def build_roaster(M):
    root = empty('Roaster')
    parts = []
    DY = 0.86  # drum center height
    # cast iron feet and the burner cabinet
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(tcyl(f'r_foot{sx}{sz}', (sx * 0.17, 0.05, sz * 0.17), 0.028, 0.1, M['RoastIron'], segs=12, r2=0.02))
    parts.append(tbox('r_cab', (0, 0.38, 0), (0.44, 0.56, 0.44), M['RoastEnamel'], bev=0.02, segs=3))
    parts.append(tbox('r_cabtrim', (0, 0.665, 0), (0.46, 0.022, 0.46), M['RoastBrass'], bev=0.005))
    parts.append(tbox('r_cabfoot', (0, 0.11, 0), (0.46, 0.03, 0.46), M['RoastIron'], bev=0.006))
    # burner door with vents and a peephole
    parts.append(tbox('r_door', (0, 0.34, 0.222), (0.3, 0.3, 0.012), M['RoastIron'], bev=0.006))
    for i in range(5):
        parts.append(tbox(f'r_vent{i}', (0, 0.25 + i * 0.022, 0.23), (0.2, 0.008, 0.006), M['RoastDrum']))
    parts.append(ttorus('r_peep', (0.0, 0.43, 0.232), 0.03, 0.007, M['RoastBrass'], segs=24, tsegs=8))
    parts.append(tcyl('r_doorknob', (0.12, 0.34, 0.24), 0.012, 0.03, M['RoastBrass'], axis='z', segs=12))
    # drum housing (enamel cylinder along z) with brass bands
    parts.append(tcyl('r_house', (0, DY, -0.03), 0.2, 0.38, M['RoastEnamel'], axis='z', segs=40))
    for z in (-0.2, 0.13):
        parts.append(ttorus(f'r_band{z}', (0, DY, z), 0.2, 0.012, M['RoastBrass'], segs=40, tsegs=8))
    # front plate: an iron annulus around the sight glass
    bm = bmesh.new()
    segs = 40
    ro, ri = 0.215, 0.088
    z0, z1 = 0.16, 0.19
    outer0 = [bm.verts.new(P(ro * math.cos(2 * math.pi * i / segs), DY + ro * math.sin(2 * math.pi * i / segs), z0)) for i in range(segs)]
    outer1 = [bm.verts.new(P(ro * math.cos(2 * math.pi * i / segs), DY + ro * math.sin(2 * math.pi * i / segs), z1)) for i in range(segs)]
    inner1 = [bm.verts.new(P(ri * math.cos(2 * math.pi * i / segs), DY + ri * math.sin(2 * math.pi * i / segs), z1)) for i in range(segs)]
    inner0 = [bm.verts.new(P(ri * math.cos(2 * math.pi * i / segs), DY + ri * math.sin(2 * math.pi * i / segs), z0)) for i in range(segs)]
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((outer0[i], outer0[j], outer1[j], outer1[i]))
        bm.faces.new((outer1[i], outer1[j], inner1[j], inner1[i]))
        bm.faces.new((inner1[i], inner1[j], inner0[j], inner0[i]))
        bm.faces.new((inner0[i], inner0[j], outer0[j], outer0[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    plate = link('r_plate', bm, M['RoastIron'])
    for p in plate.data.polygons:
        p.use_smooth = True
    parts.append(plate)
    parts.append(ttorus('r_rim', (0, DY, 0.195), 0.093, 0.013, M['RoastBrass'], segs=36, tsegs=10))
    parts.append(ttorus('r_rim2', (0, DY, 0.19), 0.212, 0.01, M['RoastBrass'], segs=40, tsegs=8))
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        parts.append(blob(f'r_bolt{k}', (0.155 * math.cos(a), DY + 0.155 * math.sin(a), 0.192), 0.009, M['RoastBrass'], s=(1, 1, 0.6), segs=8, rings=5))
    # thermometer: brass bezel and a cream face above the sight glass (the needle is separate)
    dial_c = (0.0, DY + 0.148, 0.2)
    parts.append(tcyl('r_dialface', dial_c, 0.042, 0.012, M['RoastDial'], axis='z', segs=28))
    parts.append(ttorus('r_dialbezel', (dial_c[0], dial_c[1], dial_c[2] + 0.006), 0.044, 0.007, M['RoastBrass'], segs=28, tsegs=8))
    for k in range(9):
        a = math.radians(-120 + k * 30) + math.pi / 2
        parts.append(tbox(f'r_tick{k}', (dial_c[0] + 0.032 * math.cos(a), dial_c[1] + 0.032 * math.sin(a), dial_c[2] + 0.007), (0.003, 0.009, 0.002), M['RoastIron'],
                          rot=Matrix.Rotation(a - math.pi / 2, 3, 'Y')))
    # sample trier handle (lower right of the front) and the outlet chute to the cooling tray
    parts.append(tcyl('r_trier', (0.13, DY - 0.11, 0.21), 0.012, 0.06, M['RoastBrass'], axis='z', segs=12))
    parts.append(blob('r_trierknob', (0.13, DY - 0.11, 0.245), 0.016, M['RoastWoodDark'], segs=10, rings=6))
    parts.append(tbox('r_chute', (-0.06, DY - 0.15, 0.24), (0.1, 0.03, 0.12), M['RoastIron'], bev=0.006,
                      rot=Matrix.Rotation(0.5, 3, 'X')))
    # hopper (copper funnel) with a neck and a slide gate
    parts.append(tcyl('r_neck', (0, DY + 0.22, -0.04), 0.045, 0.08, M['RoastIron'], segs=20))
    parts.append(lathe('r_hopper', [(0.05, 0.0), (0.055, 0.02), (0.15, 0.17), (0.158, 0.19), (0.15, 0.19), (0.05, 0.03)], M['RoastCopper'], segs=32, cap_bottom=False,
                       c=(0, DY + 0.26, -0.04)))
    parts.append(ttorus('r_hopperrim', (0, DY + 0.45, -0.04), 0.155, 0.009, M['RoastBrass'], axis='y', segs=36, tsegs=8))
    parts.append(tbox('r_gate', (0.06, DY + 0.235, -0.04), (0.06, 0.012, 0.03), M['RoastBrass'], bev=0.003))
    # motor on the left side
    parts.append(tcyl('r_motor', (-0.25, DY - 0.03, -0.06), 0.07, 0.14, M['RoastIron'], axis='x', segs=24, bev=0.01))
    parts.append(tcyl('r_motorcap', (-0.33, DY - 0.03, -0.06), 0.05, 0.02, M['RoastBrass'], axis='x', segs=20))
    for k in range(5):
        parts.append(ttorus(f'r_fin{k}', (-0.22 - k * 0.02, DY - 0.03, -0.06), 0.072, 0.004, M['RoastIron'], axis='x', segs=24, tsegs=6))
    # lever axle boss on the right side
    parts.append(tcyl('r_boss', (0.215, DY, 0.05), 0.03, 0.04, M['RoastBrass'], axis='x', segs=16))
    # cooling tray in front: a support column, a perforated steel pan with a brass rim
    TZ, TY = 0.43, 0.62
    parts.append(tcyl('r_traycol', (0, 0.36, TZ), 0.03, 0.52, M['RoastIron'], segs=16))
    parts.append(tcyl('r_trayfoot', (0, 0.12, TZ), 0.09, 0.03, M['RoastIron'], segs=20, bev=0.006))
    parts.append(tbox('r_traystrut', (0, 0.45, (TZ + 0.2) / 2), (0.04, 0.03, TZ - 0.2), M['RoastIron'], bev=0.005))
    parts.append(lathe('r_tray', [(0.0, 0.0), (0.2, 0.0), (0.205, 0.07), (0.195, 0.07), (0.19, 0.01), (0.0, 0.01)], M['RoastSteel'], segs=40, cap_bottom=False,
                       c=(0, TY, TZ)))
    parts.append(ttorus('r_trayrim', (0, TY + 0.07, TZ), 0.202, 0.009, M['RoastBrass'], axis='y', segs=40, tsegs=8))
    for k in range(18):
        a = 2 * math.pi * k / 18
        parts.append(tcyl(f'r_hole{k}', (0.205 * math.cos(a), TY + 0.035, TZ + 0.205 * math.sin(a)), 0.006, 0.004, M['RoastDrum'], axis='x', segs=8,
                          rot=Matrix.Rotation(-a, 3, 'Z')))
    parts.append(tcyl('r_hub', (0, TY + 0.06, TZ), 0.022, 0.08, M['RoastIron'], segs=14))
    body = merge(parts, 'RoasterBody')
    child(body, root)

    # chimney (separate, so phones can leave it out of the framing)
    ch = [tube_path('r_pipe', [(0, DY + 0.05, -0.2), (0, DY + 0.05, -0.27), (0, DY + 0.25, -0.3), (0, 1.55, -0.3)], 0.045, M['RoastIron'], segs=16)]
    ch.append(ttorus('r_pipering', (0, 1.2, -0.3), 0.048, 0.008, M['RoastBrass'], axis='y', segs=20, tsegs=6))
    ch.append(tcyl('r_cap', (0, 1.58, -0.3), 0.075, 0.03, M['RoastIron'], segs=20, r2=0.03))
    chim = merge(ch, 'RoasterChimney')
    child(chim, root)

    # drum interior seen through the glass: an inward cylinder with vanes and a back disc
    bm = bmesh.new()
    segs = 32
    rr = 0.17
    za, zb = -0.12, 0.155
    ra = [bm.verts.new(P(rr * math.cos(2 * math.pi * i / segs), DY + rr * math.sin(2 * math.pi * i / segs), za)) for i in range(segs)]
    rb = [bm.verts.new(P(rr * math.cos(2 * math.pi * i / segs), DY + rr * math.sin(2 * math.pi * i / segs), zb)) for i in range(segs)]
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((ra[j], ra[i], rb[i], rb[j]))
    bm.faces.new(ra)
    drum = link('d_inner', bm, M['RoastDrum'])
    for p in drum.data.polygons:
        p.use_smooth = True
    dparts = [drum]
    for k in range(4):
        a = 2 * math.pi * k / 4
        dparts.append(tbox(f'd_vane{k}', (0.15 * math.cos(a), DY + 0.15 * math.sin(a), 0.02), (0.012, 0.045, 0.26), M['RoastSteel'],
                           rot=Matrix.Rotation(-a + math.pi / 2, 3, 'Y')))
    dparts.append(ttorus('d_ring', (0, DY, 0.0), 0.165, 0.006, M['RoastSteel'], segs=32, tsegs=6))
    drum = merge(dparts, 'RoasterDrum')
    set_origin(drum, (0, DY, 0))
    child(drum, root)

    gl = disc('RoasterGlass', (0, DY, 0.198), 0.09, M['RoastGlass'], axis='z', segs=32, depth=0.004)
    set_origin(gl, (0, DY, 0.198))
    child(gl, root)

    nd = merge([tbox('n_bar', (0, dial_c[1] + 0.014, dial_c[2] + 0.009), (0.004, 0.034, 0.002), M['RoastNeedle']),
                tcyl('n_hub', (0, dial_c[1], dial_c[2] + 0.01), 0.006, 0.004, M['RoastIron'], axis='z', segs=12)], 'RoasterNeedle')
    set_origin(nd, (0, dial_c[1], dial_c[2] + 0.009))
    child(nd, root)

    # lever: an iron arm with a red knob, axle on the right side (pull it forward and down)
    lv = merge([tcyl('l_axle', (0.245, DY, 0.05), 0.018, 0.03, M['RoastIron'], axis='x', segs=12),
                tube_path('l_arm', [(0.25, DY, 0.05), (0.255, DY + 0.12, 0.03), (0.26, DY + 0.25, 0.0)], 0.011, M['RoastIron'], segs=10),
                blob('l_knob', (0.26, DY + 0.27, 0.0), 0.035, M['RoastKnob'], segs=16, rings=10)], 'RoasterLever')
    set_origin(lv, (0.25, DY, 0.05))
    child(lv, root)

    st = merge([tbox('s_arm1', (0, TY + 0.03, TZ), (0.36, 0.014, 0.014), M['RoastIron'], bev=0.003),
                tbox('s_arm2', (0, TY + 0.03, TZ), (0.014, 0.014, 0.36), M['RoastIron'], bev=0.003),
                blob('s_cap', (0, TY + 0.1, TZ), 0.025, M['RoastBrass'], segs=12, rings=8)], 'RoasterStirrer')
    set_origin(st, (0, TY, TZ))
    child(st, root)

    fl = tbox('RoasterFlame', (0, 0.43, 0.215), (0.05, 0.05, 0.004), M['RoastFlameGlow'])
    child(fl, root)
    empty('RoasterBeans', (0, DY, 0.12), root)
    empty('RoasterHopper', (0, DY + 0.45, -0.04), root)
    empty('RoasterTrayTop', (0, TY + 0.015, TZ), root)
    empty('RoasterDial', dial_c, root)
    return root


def build_jar(M):
    root = empty('Jar')
    prof = [(0.0, 0.0), (0.05, 0.0), (0.058, 0.008), (0.06, 0.03), (0.06, 0.14), (0.056, 0.152), (0.045, 0.16), (0.044, 0.172)]
    # double wall: outside up, then back down inside, so the glass has a thickness
    inner = [(r - 0.003, y) for r, y in reversed(prof[1:])] + [(0.0, 0.003)]
    g = lathe('JarGlass', prof + inner, M['RoastGlass'], segs=28, cap_bottom=False)
    child(g, root)
    lid = merge([tcyl('j_lid', (0, 0.182, 0), 0.05, 0.024, M['RoastWoodLight'], segs=28, bev=0.006),
                 tcyl('j_lid2', (0, 0.197, 0), 0.036, 0.008, M['RoastWood'], segs=24, bev=0.003),
                 blob('j_knob', (0, 0.207, 0), 0.016, M['RoastWood'], s=(1, 0.8, 1), segs=14, rings=8),
                 ttorus('j_band', (0, 0.168, 0), 0.046, 0.003, M['RoastBrass'], axis='y', segs=28, tsegs=6)], 'JarLid')
    child(lid, root)
    return root


def build_bean(M):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.5)
    for v in bm.verts:
        x, y, z = v.co  # Blender: x length, y width, z height (flat side down)
        v.co.x = x * 1.0
        v.co.y = y * 0.74
        v.co.z = z * 0.52
        # the crease along the flat side
        if v.co.z < -0.05:
            v.co.z *= 0.55
        if abs(v.co.y) < 0.09 and v.co.z < 0.0:
            v.co.z += 0.09
    ob = link('Bean', bm, M['RoastBean'])
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def build_scale(M):
    root = empty('Scale')
    base = merge([tbox('sc_base', (0, 0.015, 0), (0.22, 0.03, 0.11), M['RoastWoodDark'], bev=0.006),
                  tbox('sc_plate', (0, 0.033, 0), (0.18, 0.006, 0.08), M['RoastBrass'], bev=0.002),
                  tcyl('sc_col', (0, 0.13, 0), 0.01, 0.19, M['RoastBrass'], segs=14),
                  blob('sc_top', (0, 0.235, 0), 0.016, M['RoastBrass'], segs=12, rings=8),
                  tcyl('sc_foot', (0, 0.045, 0), 0.025, 0.02, M['RoastBrass'], segs=16, r2=0.014)], 'ScaleBase')
    child(base, root)
    beam = merge([tbox('sb_bar', (0, 0.225, 0), (0.25, 0.008, 0.008), M['RoastBrass'], bev=0.002),
                  tbox('sb_ptr', (0, 0.255, 0), (0.005, 0.05, 0.003), M['RoastBrass']),
                  blob('sb_l', (-0.125, 0.225, 0), 0.008, M['RoastBrass'], segs=8, rings=5),
                  blob('sb_r', (0.125, 0.225, 0), 0.008, M['RoastBrass'], segs=8, rings=5)], 'ScaleBeam')
    set_origin(beam, (0, 0.225, 0))
    child(beam, root)
    pan_parts = [lathe('sp_bowl', [(0.0, -0.1), (0.05, -0.098), (0.062, -0.088), (0.064, -0.086), (0.0, -0.092)], M['RoastBrass'], segs=28, cap_bottom=False)]
    for k in range(3):
        a = 2 * math.pi * k / 3
        pan_parts.append(tube_path(f'sp_rod{k}', [(0.058 * math.cos(a), -0.088, 0.058 * math.sin(a)), (0, 0, 0)], 0.0016, M['RoastBrass'], segs=5))
    pan = merge(pan_parts, 'ScalePan')
    child(pan, root)
    return root


def build_cup(M):
    # the handle: an arc of 225 degrees, turned so it bulges outwards (+x) and meets the cup twice
    handle = ttorus('cu_handle', (0.05, 0.036, 0), 0.017, 0.0045, M['RoastPorcelain'], axis='z', segs=20, tsegs=8, arc=math.pi * 1.25)
    rotate_parts([handle], -0.625 * math.pi, center=(0.05, 0.036, 0))
    cup = merge([lathe('cu_body', [(0.0, 0.0), (0.024, 0.0), (0.03, 0.006), (0.04, 0.03), (0.044, 0.058), (0.046, 0.066), (0.042, 0.066), (0.039, 0.058),
                                   (0.035, 0.03), (0.0, 0.012)], M['RoastPorcelain'], segs=32, cap_bottom=True),
                 ttorus('cu_band', (0, 0.061, 0), 0.0445, 0.0022, M['RoastGold'], axis='y', segs=32, tsegs=6),
                 handle], 'Cup')
    sau = merge([lathe('sa_body', [(0.0, 0.0), (0.04, 0.0), (0.07, 0.008), (0.078, 0.014), (0.074, 0.016), (0.04, 0.007), (0.0, 0.006)], M['RoastPorcelain'], segs=36),
                 ttorus('sa_band', (0, 0.0135, 0), 0.075, 0.0018, M['RoastGold'], axis='y', segs=36, tsegs=6)], 'Saucer')
    top = disc('CoffeeTop', (0, 0, 0), 1.0, M['RoastCoffee'], axis='y', segs=32, depth=0.0005)
    return cup, sau, top


def build_items(M):
    out = []
    # coffee bag: kraft paper with a folded top, a label and a clip
    bag = merge([tbox('ib_body', (0, 0.055, 0), (0.075, 0.11, 0.045), M['RoastKraft'], bev=0.006),
                 tbox('ib_fold', (0, 0.118, 0), (0.077, 0.018, 0.02), M['RoastKraft'], bev=0.004),
                 tbox('ib_clip', (0, 0.118, 0), (0.08, 0.008, 0.024), M['RoastGold'], bev=0.002),
                 tbox('ib_label', (0, 0.06, 0.0235), (0.055, 0.045, 0.002), M['RoastLabel']),
                 blob('ib_bean', (0, 0.062, 0.026), 0.009, M['RoastChocDark'], s=(1, 0.7, 0.4), segs=10, rings=6)], 'ItemCoffee')
    out.append(bag)
    # pralines: a red box with a gold ribbon and a bow
    pr = [tbox('ip_box', (0, 0.02, 0), (0.1, 0.04, 0.07), M['RoastBox'], bev=0.004),
          tbox('ip_rib1', (0, 0.0205, 0), (0.102, 0.041, 0.012), M['RoastGold']),
          tbox('ip_rib2', (0, 0.0205, 0), (0.012, 0.041, 0.072), M['RoastGold'])]
    for sx in (-1, 1):
        pr.append(ttorus(f'ip_loop{sx}', (sx * 0.014, 0.046, 0), 0.012, 0.004, M['RoastGold'], axis='z', segs=16, tsegs=6))
    pr.append(blob('ip_knot', (0, 0.045, 0), 0.007, M['RoastGold'], segs=8, rings=5))
    out.append(merge(pr, 'ItemPralines'))
    # tea tin
    out.append(merge([tcyl('it_tin', (0, 0.04, 0), 0.032, 0.08, M['RoastTin'], segs=24, bev=0.003),
                      tcyl('it_lid', (0, 0.085, 0), 0.034, 0.014, M['RoastTin'], segs=24, bev=0.003),
                      tcyl('it_band', (0, 0.045, 0), 0.0325, 0.02, M['RoastGold'], segs=24),
                      blob('it_leaf', (0, 0.045, 0.031), 0.01, M['RoastFirLight'], s=(0.6, 1, 0.3), segs=8, rings=5)], 'ItemTea'))
    # stollen with powdered sugar
    out.append(merge([blob('is_loaf', (0, 0.032, 0), 0.05, M['RoastCake'], s=(1.5, 0.65, 0.85), segs=20, rings=12),
                      blob('is_sugar', (0, 0.05, 0), 0.047, M['RoastSugar'], s=(1.48, 0.35, 0.8), segs=20, rings=12),
                      tbox('is_board', (0, 0.004, 0), (0.17, 0.008, 0.1), M['RoastWoodLight'], bev=0.003)], 'ItemStollen'))
    # jam jar with a cloth cover and a string
    out.append(merge([lathe('ij_jar', [(0.0, 0.0), (0.03, 0.0), (0.034, 0.006), (0.034, 0.06), (0.03, 0.068), (0.0, 0.068)], M['RoastBerry'], segs=24),
                      blob('ij_cloth', (0, 0.071, 0), 0.042, M['RoastBox'], s=(1, 0.22, 1), segs=16, rings=8),
                      ttorus('ij_string', (0, 0.064, 0), 0.032, 0.002, M['RoastCloth'], axis='y', segs=24, tsegs=5),
                      tbox('ij_label', (0, 0.032, 0.033), (0.04, 0.026, 0.002), M['RoastLabel'])], 'ItemJam'))
    # cookies: a stack of nut cookies, the top one with chocolate
    ck = []
    for k in range(4):
        ck.append(tcyl(f'ic_c{k}', (0.002 * (k % 2), 0.007 + k * 0.013, 0), 0.034, 0.012, M['RoastCookie'], segs=20, bev=0.004))
    ck.append(tcyl('ic_top', (0.002, 0.007 + 3 * 0.013 + 0.007, 0), 0.026, 0.004, M['RoastChocDark'], segs=20))
    for k in range(5):
        a = 2 * math.pi * k / 5
        ck.append(blob(f'ic_nut{k}', (0.016 * math.cos(a), 0.056, 0.016 * math.sin(a)), 0.006, M['RoastCake'], s=(1, 0.7, 1), segs=8, rings=5))
    out.append(merge(ck, 'ItemCookies'))
    return out


def build_basket(M):
    p = []
    rows = 7
    for k in range(rows):
        y = 0.012 + k * 0.016
        r = 0.12 + 0.03 * k / (rows - 1)
        p.append(ttorus(f'bk_row{k}', (0, y, 0), r, 0.009, M['RoastWicker' if k % 2 else 'RoastWickerDark'], axis='y', segs=40, tsegs=6))
    p.append(tcyl('bk_floor', (0, 0.006, 0), 0.12, 0.012, M['RoastWickerDark'], segs=32))
    for k in range(16):
        a = 2 * math.pi * k / 16
        p.append(tube_path(f'bk_rib{k}', [(0.118 * math.cos(a), 0.0, 0.118 * math.sin(a)), (0.152 * math.cos(a), 0.11, 0.152 * math.sin(a))], 0.004, M['RoastWickerDark'], segs=5))
    p.append(ttorus('bk_rim', (0, 0.115, 0), 0.153, 0.012, M['RoastWicker'], axis='y', segs=40, tsegs=8))
    p.append(ttorus('bk_handle', (0, 0.115, 0), 0.15, 0.011, M['RoastWicker'], axis='z', segs=32, tsegs=8, arc=math.pi))
    # cloth lining peeking out, and a red bow on the handle
    p.append(lathe('bk_cloth', [(0.0, 0.03), (0.13, 0.04), (0.15, 0.1), (0.162, 0.118), (0.15, 0.112)], M['RoastCloth'], segs=24, cap_bottom=False))
    for sx in (-1, 1):
        p.append(blob(f'bk_bow{sx}', (sx * 0.03, 0.262, 0), 0.026, M['RoastBow'], s=(1.2, 0.8, 0.45), segs=10, rings=6))
        p.append(tbox(f'bk_tail{sx}', (sx * 0.016, 0.228, 0.004), (0.014, 0.06, 0.004), M['RoastBow'], rot=Matrix.Rotation(sx * 0.35, 3, 'Y')))
    p.append(blob('bk_knot', (0, 0.262, 0.004), 0.013, M['RoastBow'], segs=8, rings=5))
    return merge(p, 'Basket')


# ---------- guests ----------

def gmats():
    G = {}
    for name, hexcol, rough in [('GSkin', '#f2c6a5', 0.6), ('GHair', '#7a3f1f', 0.7), ('GCoat', '#2f8f88', 0.75), ('GPants', '#33405e', 0.8),
                                ('GAccent', '#f0b63c', 0.8), ('GAccent2', '#c8463c', 0.7), ('GShoe', '#2a221d', 0.5), ('GEye', '#1c1512', 0.2),
                                ('GWhite', '#fbfaf6', 0.5), ('GCheek', '#f08a8a', 0.7), ('GMetal', '#c9ccd2', 0.3)]:
        G[name] = mat(name, hexcol, 0.6 if name == 'GMetal' else 0.0, rough)
    return G


def head_parts(G, n, c, r, *, cheeks=True):
    """Head sphere with eyes (with highlights), nose, cheeks and ears; c = head center."""
    x, y, z = c
    p = [blob(f'{n}_skull', c, r, G['GSkin'], s=(1, 1.02, 0.96), segs=24, rings=16)]
    for sx in (-1, 1):
        ex = x + sx * r * 0.36
        ey = y + r * 0.08
        ez = z + r * 0.86
        p.append(blob(f'{n}_eye{sx}', (ex, ey, ez), r * 0.13, G['GEye'], s=(0.85, 1.1, 0.6), segs=12, rings=8))
        p.append(blob(f'{n}_hi{sx}', (ex + r * 0.04, ey + r * 0.05, ez + r * 0.07), r * 0.04, G['GWhite'], segs=8, rings=5))
        if cheeks:
            p.append(blob(f'{n}_cheek{sx}', (x + sx * r * 0.55, y - r * 0.2, z + r * 0.76), r * 0.16, G['GCheek'], s=(1, 0.7, 0.35), segs=10, rings=6))
        p.append(blob(f'{n}_ear{sx}', (x + sx * r * 0.98, y, z), r * 0.2, G['GSkin'], s=(0.5, 1, 0.8), segs=10, rings=6))
    p.append(blob(f'{n}_nose', (x, y - r * 0.08, z + r * 0.98), r * 0.13, G['GSkin'], s=(1, 0.9, 0.9), segs=10, rings=6))
    return p


def body_parts(G, n, h, *, coat='GCoat', pants='GPants', skirt=False, wide=1.0, kid=False):
    """Legs, shoes, a rounded torso; h = total height (to the top of the head)."""
    k = h / 1.62
    p = []
    hip = 0.74 * k
    sh = 1.27 * k
    if skirt:
        p.append(lathe(f'{n}_skirt', [(0.0, hip + 0.04 * k), (0.2 * k * wide, hip + 0.02 * k), (0.25 * k * wide, 0.42 * k), (0.0, 0.42 * k)], G[pants], segs=24, cap_bottom=True, cap_top=True))
    for sx in (-1, 1):
        lx = sx * 0.085 * k * wide
        p.append(tcyl(f'{n}_leg{sx}', (lx, (0.06 * k + hip) / 2, 0), 0.06 * k, hip - 0.06 * k, G['GSkin' if skirt else pants], segs=14))
        p.append(blob(f'{n}_shoe{sx}', (lx, 0.04 * k, 0.03 * k), 0.07 * k, G['GShoe'], s=(0.85, 0.55, 1.35), segs=14, rings=8))
    # torso: a rounded lathe (belly to shoulders)
    tor = [(0.0, hip - 0.02 * k), (0.15 * k * wide, hip - 0.01 * k), (0.19 * k * wide, hip + 0.12 * k), (0.2 * k * wide, hip + 0.3 * k),
           (0.18 * k * wide, sh - 0.05 * k), (0.12 * k, sh + 0.02 * k), (0.05 * k, sh + 0.05 * k), (0.0, sh + 0.05 * k)]
    t = lathe(f'{n}_torso', tor, G[coat], segs=28, cap_bottom=True)
    t.scale = (1.0, 0.78, 1.0)  # a little flatter front to back (Blender y = three -z)
    bpy.context.view_layer.update()
    p.append(t)
    p.append(tcyl(f'{n}_neck', (0, sh + 0.06 * k, 0), 0.045 * k, 0.08 * k, G['GSkin'], segs=12))
    return p, hip, sh


def arm_parts(G, n, sh, k, sx, *, coat='GCoat', wide=1.0, mitten=None):
    x0 = sx * 0.2 * k * wide
    top = (x0, sh - 0.04 * k, 0)
    bot = (x0 + sx * 0.05 * k, sh - 0.45 * k, 0.03 * k)
    p = [tube_path(f'{n}_arm{sx}', [top, ((top[0] + bot[0]) / 2 + sx * 0.012, (top[1] + bot[1]) / 2, 0.01), bot], 0.052 * k, G[coat], segs=12),
         blob(f'{n}_sho{sx}', top, 0.058 * k, G[coat], segs=12, rings=8),
         blob(f'{n}_hand{sx}', (bot[0], bot[1] - 0.04 * k, bot[2]), 0.05 * k, G[mitten or 'GSkin'], s=(0.9, 1.1, 0.9), segs=12, rings=8)]
    return p, top, (bot[0], bot[1] - 0.05 * k, bot[2] + 0.02 * k)


def assemble(n, body, head, arms, neck, mouth, hand):
    root = empty(n)
    b = merge(body, f'{n}_Body')
    child(b, root)
    h = merge(head, f'{n}_Head')
    set_origin(h, neck)
    child(h, root)
    for side, (parts, top) in zip(('L', 'R'), arms):
        a = merge(parts, f'{n}_Arm{side}')
        set_origin(a, top)
        child(a, root)
        if side == 'R':
            rarm = a
    empty(f'{n}_Mouth', mouth, h)
    empty(f'{n}_Hand', hand, rarm)
    return root


def build_guest(G, n, h, *, coat='GCoat', pants='GPants', skirt=False, wide=1.0, head_r=0.165, hair=None, extras=None, mitten=None, kid=False):
    k = h / 1.62
    body, hip, sh = body_parts(G, n, h, coat=coat, pants=pants, skirt=skirt, wide=wide, kid=kid)
    hc = (0, sh + 0.06 * k + head_r * 0.95, 0)
    head = head_parts(G, n, hc, head_r)
    if hair:
        head += hair(hc, head_r)
    if extras:
        eb, eh = extras(hc, head_r, hip, sh, k)
        body += eb
        head += eh
    arms = []
    hand = None
    for sx in (1, -1):
        parts, top, hd = arm_parts(G, n, sh, k, sx, coat=coat, wide=wide, mitten=mitten)
        arms.append((parts, top))
        if sx == -1:
            hand = hd
    mouth = (hc[0], hc[1] - head_r * 0.36, hc[2] + head_r * 0.92)
    return assemble(n, body, head, arms, (0, sh + 0.04 * k, 0), mouth, hand)


def build_guests(G):
    out = []

    # Student: puffer jacket, knit beanie with a pompom, long hair, a striped scarf, backpack straps.
    def st_hair(c, r):
        x, y, z = c
        return [blob('st_hairback', (x, y - r * 0.15, z - r * 0.25), r * 1.05, G['GHair'], s=(1.05, 1.15, 0.9), segs=20, rings=12),
                blob('st_fringe', (x, y + r * 0.55, z + r * 0.45), r * 0.75, G['GHair'], s=(1.2, 0.45, 0.7), segs=16, rings=8),
                lathe('st_beanie', [(r * 1.04, 0.0), (r * 1.06, r * 0.18), (r * 0.98, r * 0.45), (r * 0.7, r * 0.78), (r * 0.3, r * 0.92), (0.0, r * 0.95)], G['GAccent'], segs=24,
                      cap_bottom=False, c=(x, y + r * 0.42, z - r * 0.05)),
                ttorus('st_cuff', (x, y + r * 0.45, z - r * 0.05), r * 1.04, r * 0.1, G['GAccent2'], axis='y', segs=28, tsegs=8),
                blob('st_pom', (x, y + r * 1.42, z - r * 0.08), r * 0.25, G['GAccent2'], segs=12, rings=8)]

    def st_extra(c, r, hip, sh, k):
        eb = [ttorus('st_scarf', (0, sh + 0.03 * k, 0.0), 0.1 * k, 0.04 * k, G['GAccent2'], axis='y', segs=24, tsegs=10),
              tbox('st_scarftail', (0.06 * k, sh - 0.12 * k, 0.15 * k), (0.06 * k, 0.24 * k, 0.025 * k), G['GAccent2'], bev=0.008, rot=Matrix.Rotation(0.15, 3, 'Y'))]
        for i in range(3):
            eb.append(ttorus(f'st_puff{i}', (0, hip + (0.15 + i * 0.13) * k, 0), 0.188 * k, 0.012 * k, G['GCoat'], axis='y', segs=28, tsegs=6))
        for sx in (-1, 1):
            eb.append(tbox(f'st_strap{sx}', (sx * 0.1 * k, sh - 0.2 * k, 0.15 * k), (0.035 * k, 0.36 * k, 0.012 * k), G['GPants'], bev=0.004))
        return eb, []
    out.append(build_guest(G, 'GuestStudent', 1.58, hair=st_hair, extras=st_extra))

    # Grandmother: grey hair with a bun, round glasses, a cardigan with buttons, a skirt, pearls.
    def gm_hair(c, r):
        x, y, z = c
        p = [blob('gm_hair', (x, y + r * 0.18, z - r * 0.08), r * 1.04, G['GHair'], s=(1.04, 0.92, 0.98), segs=20, rings=12),
             blob('gm_bun', (x, y + r * 0.92, z - r * 0.3), r * 0.42, G['GHair'], segs=14, rings=10)]
        for sx in (-1, 1):
            p.append(ttorus(f'gm_glass{sx}', (x + sx * r * 0.36, y + r * 0.08, z + r * 0.97), r * 0.2, r * 0.025, G['GMetal'], axis='z', segs=20, tsegs=6))
        p.append(tube_path('gm_bridge', [(x - r * 0.16, y + r * 0.1, z + r * 0.99), (x, y + r * 0.14, z + r * 1.0), (x + r * 0.16, y + r * 0.1, z + r * 0.99)], r * 0.02, G['GMetal'], segs=5))
        return p

    def gm_extra(c, r, hip, sh, k):
        eb = []
        for i in range(4):
            eb.append(blob(f'gm_btn{i}', (0, hip + (0.08 + i * 0.1) * k, 0.155 * k), 0.012 * k, G['GAccent'], segs=8, rings=5))
        for i in range(11):
            a = math.pi * (0.15 + 0.7 * i / 10)
            eb.append(blob(f'gm_pearl{i}', (0.09 * k * math.cos(a) * -1, sh - 0.01 * k - 0.05 * k * math.sin(a), 0.07 * k + 0.05 * k * math.sin(a)), 0.011 * k, G['GWhite'], segs=8, rings=5))
        eb.append(ttorus('gm_collar', (0, sh + 0.0, 0), 0.105 * k, 0.025 * k, G['GAccent2'], axis='y', segs=24, tsegs=8))
        return eb, []
    out.append(build_guest(G, 'GuestGrandma', 1.5, skirt=True, wide=1.08, hair=gm_hair, extras=gm_extra))

    # Business person: short hair with a side part, a beard, suit with lapels, shirt collar and tie,
    # a briefcase in the left hand.
    def bz_hair(c, r):
        x, y, z = c
        return [blob('bz_hair', (x, y + r * 0.3, z - r * 0.12), r * 1.0, G['GHair'], s=(1.04, 0.78, 1.0), segs=20, rings=12),
                blob('bz_part', (x + r * 0.3, y + r * 0.72, z + r * 0.35), r * 0.45, G['GHair'], s=(1.4, 0.5, 0.9), segs=14, rings=8),
                blob('bz_beard', (x, y - r * 0.74, z + r * 0.42), r * 0.5, G['GHair'], s=(1.35, 0.62, 0.8), segs=16, rings=10)]

    def bz_extra(c, r, hip, sh, k):
        eb = [tbox('bz_shirt', (0, sh - 0.1 * k, 0.142 * k), (0.11 * k, 0.2 * k, 0.012 * k), G['GWhite'], bev=0.004),
              tbox('bz_tie', (0, sh - 0.14 * k, 0.152 * k), (0.035 * k, 0.24 * k, 0.012 * k), G['GAccent'], bev=0.004),
              blob('bz_knot', (0, sh - 0.02 * k, 0.152 * k), 0.022 * k, G['GAccent'], segs=10, rings=6)]
        for sx in (-1, 1):
            eb.append(tbox(f'bz_lapel{sx}', (sx * 0.075 * k, sh - 0.11 * k, 0.15 * k), (0.05 * k, 0.24 * k, 0.012 * k), G['GCoat'], bev=0.004,
                           rot=Matrix.Rotation(sx * 0.3, 3, 'Y')))
            eb.append(tbox(f'bz_collar{sx}', (sx * 0.05 * k, sh + 0.02 * k, 0.09 * k), (0.06 * k, 0.04 * k, 0.012 * k), G['GWhite'], bev=0.003,
                           rot=Matrix.Rotation(sx * 0.5, 3, 'Y')))
        eb.append(blob('bz_btn', (0, hip + 0.12 * k, 0.16 * k), 0.012 * k, G['GEye'], segs=8, rings=5))
        # briefcase by the left hand
        eb += [tbox('bz_case', (0.3 * k, hip - 0.2 * k, 0.04 * k), (0.06 * k, 0.24 * k, 0.32 * k), G['GAccent2'], bev=0.01),
               ttorus('bz_handle', (0.3 * k, hip - 0.06 * k, 0.04 * k), 0.035 * k, 0.008 * k, G['GShoe'], axis='x', segs=16, tsegs=6, arc=math.pi)]
        return eb, []
    out.append(build_guest(G, 'GuestBusiness', 1.7, hair=bz_hair, extras=bz_extra))

    # Family: a parent with a long ponytail, a coat with toggles and a scarf; a child with a knit hat
    # with ear flaps and mittens (GuestKid, placed beside the parent by the app).
    def fm_hair(c, r):
        x, y, z = c
        return [blob('fm_hair', (x, y + r * 0.2, z - r * 0.12), r * 1.05, G['GHair'], s=(1.05, 0.95, 1.0), segs=20, rings=12),
                blob('fm_fringe', (x - r * 0.25, y + r * 0.62, z + r * 0.48), r * 0.55, G['GHair'], s=(1.4, 0.45, 0.7), segs=14, rings=8),
                blob('fm_tail', (x, y - r * 0.2, z - r * 1.05), r * 0.38, G['GHair'], s=(0.8, 1.8, 0.8), segs=14, rings=10),
                blob('fm_tie', (x, y + r * 0.25, z - r * 0.95), r * 0.14, G['GAccent2'], segs=10, rings=6)]

    def fm_extra(c, r, hip, sh, k):
        eb = [ttorus('fm_scarf', (0, sh + 0.02 * k, 0), 0.1 * k, 0.045 * k, G['GAccent'], axis='y', segs=24, tsegs=10)]
        for i in range(3):
            eb.append(tbox(f'fm_toggle{i}', (0, hip + (0.1 + i * 0.12) * k, 0.158 * k), (0.05 * k, 0.014 * k, 0.014 * k), G['GAccent'], bev=0.004))
        return eb, []
    out.append(build_guest(G, 'GuestFamily', 1.64, hair=fm_hair, extras=fm_extra))

    def kid_hair(c, r):
        x, y, z = c
        p = [lathe('kd_hat', [(r * 1.05, 0.0), (r * 1.06, r * 0.2), (r * 0.95, r * 0.5), (r * 0.65, r * 0.8), (r * 0.25, r * 0.95), (0.0, r * 0.97)], G['GAccent'], segs=24,
                   cap_bottom=False, c=(x, y + r * 0.2, z - r * 0.02)),
             blob('kd_pom', (x, y + r * 1.2, z), r * 0.28, G['GWhite'], segs=12, rings=8),
             blob('kd_fringe', (x, y + r * 0.4, z + r * 0.62), r * 0.6, G['GHair'], s=(1.3, 0.4, 0.6), segs=14, rings=8)]
        for sx in (-1, 1):
            p.append(blob(f'kd_flap{sx}', (x + sx * r * 0.92, y - r * 0.2, z), r * 0.35, G['GAccent'], s=(0.45, 1.1, 0.8), segs=12, rings=8))
        return p
    out.append(build_guest(G, 'GuestKid', 1.0, head_r=0.14, hair=kid_hair, mitten='GAccent'))

    # Chef: a white double-breasted jacket with dark buttons, a tall pleated toque, a red neckerchief,
    # a short bob.
    def ch_hair(c, r):
        x, y, z = c
        p = [blob('ch_hair', (x, y + r * 0.05, z - r * 0.25), r * 1.0, G['GHair'], s=(1.1, 1.0, 1.0), segs=20, rings=12),
             blob('ch_fringe', (x - r * 0.2, y + r * 0.52, z + r * 0.52), r * 0.55, G['GHair'], s=(1.4, 0.4, 0.6), segs=14, rings=8),
             ttorus('ch_band', (x, y + r * 0.62, z - r * 0.05), r * 0.96, r * 0.12, G['GWhite'], axis='y', segs=28, tsegs=8)]
        for i in range(8):
            a = 2 * math.pi * i / 8
            p.append(blob(f'ch_puff{i}', (x + r * 0.62 * math.cos(a), y + r * 1.35, z - r * 0.05 + r * 0.62 * math.sin(a)), r * 0.5, G['GWhite'], s=(1, 1.3, 1), segs=12, rings=8))
        p.append(lathe('ch_toque', [(r * 0.95, 0.0), (r * 1.02, r * 0.6), (0.0, r * 0.62)], G['GWhite'], segs=24, cap_bottom=False, c=(x, y + r * 0.62, z - r * 0.05)))
        p.append(blob('ch_top', (x, y + r * 1.62, z - r * 0.05), r * 0.75, G['GWhite'], s=(1, 0.5, 1), segs=16, rings=8))
        return p

    def ch_extra(c, r, hip, sh, k):
        eb = [ttorus('ch_kerchief', (0, sh + 0.02 * k, 0), 0.095 * k, 0.03 * k, G['GAccent'], axis='y', segs=24, tsegs=8),
              blob('ch_knot', (0.02 * k, sh - 0.03 * k, 0.12 * k), 0.035 * k, G['GAccent'], s=(1, 1.4, 0.6), segs=10, rings=6),
              tbox('ch_apron', (0, hip - 0.05 * k, 0.15 * k), (0.3 * k, 0.4 * k, 0.012 * k), G['GAccent2'], bev=0.006)]
        for i in range(3):
            for sx in (-1, 1):
                eb.append(blob(f'ch_btn{i}{sx}', (sx * 0.06 * k, hip + (0.2 + i * 0.1) * k, 0.155 * k), 0.012 * k, G['GEye'], segs=8, rings=5))
        return eb, []
    out.append(build_guest(G, 'GuestChef', 1.6, hair=ch_hair, extras=ch_extra))
    return out


def main():
    init()
    M = make_materials()
    counter = build_counter(M)
    roaster = build_roaster(M)
    jar = build_jar(M)
    bean = build_bean(M)
    scale = build_scale(M)
    cup, sau, top = build_cup(M)
    items = build_items(M)
    basket = build_basket(M)
    bake_ao([(counter, 0.12), (bpy.data.objects['RoasterBody'], 0.12)], set(), distance=0.18, samples=24)
    export(OUT_GLB, OUT_BLEND)

    init()
    G = gmats()
    build_guests(G)
    export(OUT_GUESTS, OUT_GUESTS_BLEND)


main()

# Shared helpers for the Blender build scripts (bmesh primitives in three.js coordinates,
# merging, vertex AO). Import from a build script after adding this folder to sys.path.
import bpy, bmesh, math
from mathutils import Vector, Matrix

scene = None


def init():
    """Starts from an empty file; returns the scene."""
    global scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    return scene


def P(x, y, z):
    """three.js coordinates (Y up, Z towards the player) -> Blender (Z up)."""
    return Vector((x, -z, y))


def material(name, color, metal=0.0, rough=0.5, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    return m


METAL = material('PkMetal', (0.03, 0.035, 0.05), 0.75, 0.32)
LIGHT = material('PkMetalLight', (0.25, 0.27, 0.32), 0.95, 0.22)
PANEL = material('PkPanel', (0.06, 0.065, 0.09), 0.5, 0.45)
DARK = material('PkDark', (0.01, 0.01, 0.015), 0.3, 0.7)
GLOW = material('PkGlow', (0, 0, 0), emit=(1, 1, 1))
GOLD = material('CoinGold', (1.0, 0.7, 0.2), 1.0, 0.22)
FACE = material('CoinFace', (0.9, 0.9, 0.9), 0.3, 0.4)
CRYSTAL = material('CrystalGlow', (1.0, 0.3, 0.4), 0.1, 0.15, emit=(1.0, 0.3, 0.4))
ROCK = material('CrystalBase', (0.02, 0.02, 0.03), 0.5, 0.5)
SHELL = material('BugShell', (0.02, 0.02, 0.03), 0.9, 0.2)
BUGLOW = material('BugGlow', (0, 0, 0), emit=(1.0, 0.3, 0.4))
WING = material('BugWing', (0.4, 0.8, 1.0), 0.0, 0.1)


def link(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def bevel(ob, width, segs=2, angle=40):
    mod = ob.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segs
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    return ob


def tbox(name, c, s, mat, bev=0.0, segs=2, rot=None):
    """Box at three.js center c with three.js size s (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((s[0], s[2], s[1])), verts=bm.verts)
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, mat)
    return bevel(ob, bev, segs) if bev else ob


def tcyl(name, c, r, h, mat, axis='y', segs=24, r2=None, bev=0.0, rot=None):
    """Cylinder (or cone with r2) along a three.js axis, centered at c."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    if axis == 'z':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    elif axis == 'x':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return bevel(ob, bev) if bev else ob


def ttorus(name, c, R, r, mat, axis='z', segs=48, tsegs=10, arc=2 * math.pi):
    """Torus around a three.js axis (default: facing the player)."""
    bm = bmesh.new()
    rings = []
    closed = arc >= 2 * math.pi - 1e-6
    n = segs if closed else segs + 1
    for i in range(n):
        a = arc * i / segs
        ring = []
        for j in range(tsegs):
            b = 2 * math.pi * j / tsegs
            d = R + r * math.cos(b)
            ring.append(bm.verts.new((d * math.cos(a), d * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(segs if closed else segs):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for j in range(tsegs):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % tsegs], r0[(j + 1) % tsegs]))
    # local torus lies in the XY plane of Blender (normal +Z = three +Y)
    if axis == 'z':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    elif axis == 'x':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def shard(name, base, radius, height, mat, sides=6, tilt=(0, 0)):
    """A crystal shard: a short prism with a pointed tip and a small foot."""
    bm = bmesh.new()
    foot = bm.verts.new((0, 0, -0.05))
    ring = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        ring.append(bm.verts.new((radius * math.cos(a), radius * math.sin(a), height * 0.18)))
    ring2 = [bm.verts.new((v.co.x * 0.92, v.co.y * 0.92, height * 0.72)) for v in ring]
    tip = bm.verts.new((0, 0, height))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((foot, ring[j], ring[i]))
        bm.faces.new((ring[i], ring[j], ring2[j], ring2[i]))
        bm.faces.new((ring2[i], ring2[j], tip))
    rot = Matrix.Rotation(tilt[0], 3, 'X') @ Matrix.Rotation(tilt[1], 3, 'Y')
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=P(*base), verts=bm.verts)
    return link(name, bm, mat)


def merge(objs, name):
    """Joins objects into one (applies modifiers), keeping materials and UVs."""
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    mats = []
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.transform(ob.matrix_world)
        remap = []
        for m in ob.data.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        tmp = bmesh.new()
        tmp.from_mesh(me)
        for f in tmp.faces:
            f.material_index = remap[f.material_index] if remap else 0
        tmp_me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(tmp_me)
        tmp.free()
        bm.from_mesh(tmp_me)
        bpy.data.meshes.remove(tmp_me)
        ev.to_mesh_clear()
    for ob in objs:
        bpy.data.objects.remove(ob, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    out = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(out)
    for m in mats:
        out.data.materials.append(m)
    return out


def densify(ob, max_len=0.14, rounds=4):
    """Splits long edges so the baked vertex AO has enough resolution."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for _ in range(rounds):
        edges = [e for e in bm.edges if e.calc_length() > max_len]
        if not edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(ob.data)
    bm.free()




def blob(name, c, r, mat, s=(1, 1, 1), segs=14, rings=9, rot=None):
    """A smooth ellipsoid at three.js center c, radius r, scaled by s (three.js axes)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=Vector((s[0], s[2], s[1])), verts=bm.verts)
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=P(*c), verts=bm.verts)
    ob = link(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def cone(name, top_c, r_top, r_tip, h, mat, sz=1.0, segs=12, down=True):
    """A cone hanging down from top_c (or standing up from it), squashed in z by sz."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r_tip if down else r_top, radius2=r_top if down else r_tip, depth=h)
    bmesh.ops.scale(bm, vec=Vector((1, sz, 1)), verts=bm.verts)
    off = -h / 2 if down else h / 2
    bmesh.ops.translate(bm, vec=P(top_c[0], top_c[1] + off, top_c[2]), verts=bm.verts)
    ob = link(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def rrect(z0, z1, y0, y1, r_top, r_bot, n=4):
    """Rounded rectangle profile [(z, y)] (counterclockwise, starting bottom right)."""
    pts = []
    for cz, cy, r, a0, a1 in ((z1 - r_bot, y0 + r_bot, r_bot, -90, 0), (z1 - r_top, y1 - r_top, r_top, 0, 90),
                              (z0 + r_top, y1 - r_top, r_top, 90, 180), (z0 + r_bot, y0 + r_bot, r_bot, 180, 270)):
        if r <= 0:
            pts.append((cz, cy))
            continue
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            pts.append((cz + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def prism(name, prof, x0, x1, mat, smooth=True):
    """Extrudes a closed (z, y) profile along x with flat ends, so modules tile without grooves.
    smooth: rounded profiles are smooth shaded; sharp ones stay flat (no dark seams between
    stacked modules)."""
    bm = bmesh.new()
    a = [bm.verts.new(P(x0, y, z)) for z, y in prof]
    b = [bm.verts.new(P(x1, y, z)) for z, y in prof]
    n = len(prof)
    sides = [bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])) for i in range(n)]
    caps = [bm.faces.new(list(reversed(a))), bm.faces.new(b)]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in sides:
        f.smooth = smooth
    for f in caps:
        f.smooth = False
    return link(name, bm, mat)


def rotate_parts(parts, angle, center=(0, 0, 0)):
    """Turns already built parts in the picture plane (around the three.js z axis) about center."""
    c = P(*center)
    m = Matrix.Translation(c) @ Matrix.Rotation(-angle, 4, 'Y') @ Matrix.Translation(-c)
    for ob in parts:
        ob.matrix_world = m @ ob.matrix_world



def bake_ao(assets, glow_names, distance=0.35, samples=96):
    """Bakes ambient occlusion per asset into the vertex colors 'Col' (light parts stay white)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = distance
    obs = [a for a, _ in assets]
    others = [o for o in sc.objects if o.type == 'MESH' and o not in obs]
    for o in others:
        o.hide_render = True
    for ob, dens in assets:
        densify(ob, dens)
    for ob, _ in assets:
        for o2 in obs:
            o2.hide_render = o2 is not ob
        me = ob.data
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        glow_idx = {i for i, m in enumerate(me.materials) if m.name in glow_names or m.name.endswith('Glow')}
        bright = set()
        for poly in me.polygons:
            if poly.material_index in glow_idx:
                bright.update(poly.vertices)
        for i, d in enumerate(me.color_attributes['Col'].data):
            if i in bright:
                d.color = (1, 1, 1, 1)
            else:
                v = 0.25 + 0.75 * d.color[0]
                d.color = (v, v, v, 1)
    for o in obs:
        o.hide_render = False
    for o in others:
        o.hide_render = False
        me = o.data
        if 'Col' not in me.color_attributes:
            ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
            for d in ca.data:
                d.color = (1, 1, 1, 1)
            me.color_attributes.active_color = ca


def export(path_glb, path_blend):
    bpy.ops.export_scene.gltf(filepath=path_glb, export_format='GLB', use_selection=False, export_apply=True,
                              export_yup=True, export_animations=False, export_normals=True,
                              export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True)
    bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup copies
    bpy.ops.wm.save_as_mainfile(filepath=path_blend, compress=True)

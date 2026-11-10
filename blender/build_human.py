# Builds the human fighter for the AI arena in Blender from MakeHuman CC0 data (data files only,
# no add-on code): base mesh + body targets, game-engine skeleton with weights, eyes, brows,
# lashes, hair, shoes (fitted via .mhclo), plus a fight outfit cut from the body/tights geometry.
# Usage: blender -b -P build_human.py -- <mh_dir> <out_glb> <out_blend>
import bpy, json, gzip, os, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
MH, OUT_GLB, OUT_BLEND = argv[0], argv[1], argv[2]
SYS = f'{MH}/sysx'
DATA = f'{MH}/mpfbx/data'
S = 0.1  # MakeHuman decimeters -> meters
ACCENT = (0.02, 0.17, 0.8)  # blue (player color), linear
DARK = (0.012, 0.014, 0.02)


def to_b(p):
    return Vector((p[0] * S, -p[2] * S, p[1] * S))


# ---------- base mesh ----------
V, VT, F = [], [], []
group = None
for line in open(f'{DATA}/3dobjs/base.obj'):
    if line.startswith('v '):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '):
        VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '):
        group = line.split()[1]
    elif line.startswith('f '):
        idx = []
        for a in line.split()[1:]:
            p = a.split('/')
            idx.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else None))
        F.append((group, idx))
GROUPV = {}
for g, idx in F:
    GROUPV.setdefault(g, set()).update(i for i, _ in idx)


def apply_target(name, w):
    path = f'{DATA}/targets/{name}.target.gz'
    if not os.path.exists(path):
        print('missing target', name)
        return
    with gzip.open(path, 'rt') as fh:
        for line in fh:
            line = line.strip()
            if not line or line[0] == '#':
                continue
            p = line.split()
            i = int(p[0])
            for k in range(3):
                V[i][k] += w * float(p[k + 1])


# Athletic young man: male, young, high muscle, average weight; mixed ethnic features; ideal proportions.
apply_target('macrodetails/universal-male-young-maxmuscle-averageweight', 0.8)
apply_target('macrodetails/universal-male-young-averagemuscle-averageweight', 0.2)
for race in ('caucasian', 'african', 'asian'):
    apply_target(f'macrodetails/{race}-male-young', 1 / 3)
apply_target('macrodetails/proportions/male-young-maxmuscle-averageweight-idealproportions', 0.8)
apply_target('macrodetails/height/male-young-maxmuscle-averageweight-maxheight', 0.2)


def centroid(ix):
    ix = list(ix)
    return [sum(V[i][k] for i in ix) / len(ix) for k in range(3)]


# ---------- weights ----------
WJ = json.load(open(f'{DATA}/rigs/standard/weights.game_engine.json'))['weights']
VW = {}
for bone, lst in WJ.items():
    for i, w in lst:
        VW.setdefault(i, {})[bone] = VW.get(i, {}).get(bone, 0) + w


def wsum(i, prefixes):
    return sum(w for b, w in VW.get(i, {}).items() if b.startswith(prefixes))


# ---------- scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Armature from the rig description (joint helper cubes move with the targets)
RIG = json.load(open(f'{DATA}/rigs/standard/rig.game_engine.json'))


def rig_point(spec):
    st = spec.get('strategy')
    if st == 'CUBE' and spec.get('cube_name') in GROUPV:
        return to_b(centroid(GROUPV[spec['cube_name']]))
    if st == 'MEAN' and spec.get('vertex_indices'):
        return to_b(centroid(spec['vertex_indices']))
    if st == 'VERTEX' and 'vertex_index' in spec:
        return to_b(V[spec['vertex_index']])
    return Vector(spec['default_position'])


arm_data = bpy.data.armatures.new('FighterRig')
arm = bpy.data.objects.new('FighterRig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, b in RIG.items():
    eb = arm_data.edit_bones.new(name)
    eb.head = rig_point(b['head'])
    eb.tail = rig_point(b['tail'])
    if (eb.tail - eb.head).length < 1e-4:
        eb.tail = eb.head + Vector((0, 0, 0.02))
    eb.roll = b.get('roll', 0)
for name, b in RIG.items():
    if b.get('parent'):
        arm_data.edit_bones[name].parent = arm_data.edit_bones[b['parent']]
bpy.ops.object.mode_set(mode='OBJECT')


def make_mesh(name, faces, verts_of, uv_of=None, weights_of=None, material=None, colors_of=None):
    """faces: list of lists of source keys; verts_of(key)->Vector; builds a skinned mesh."""
    keymap = {}
    verts = []
    for fc in faces:
        for k in fc:
            if k not in keymap:
                keymap[k] = len(verts)
                verts.append(verts_of(k))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], [[keymap[k] for k in fc] for fc in faces])
    me.update()
    if uv_of:
        uvl = me.uv_layers.new(name='UVMap')
        li = 0
        for fi, fc in enumerate(faces):
            for j, _ in enumerate(fc):
                uvl.data[li].uv = uv_of(fi, j)
                li += 1
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    if weights_of:
        groups = {}
        for k, vi in keymap.items():
            for bone, w in weights_of(k).items():
                if w <= 0.001:
                    continue
                g = groups.get(bone) or ob.vertex_groups.new(name=bone)
                groups[bone] = g
                g.add([vi], w, 'REPLACE')
    if colors_of:
        ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
        for k, vi in keymap.items():
            ca.data[vi].color = (*colors_of(k, verts[vi]), 1.0)
    if material:
        me.materials.append(material)
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    return ob, keymap


def mat_tex(name, tex_path, size=1024, alpha=False, rough=0.55, metal=0.0, normal_path=None, vcol=False, color=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if color:
        bsdf.inputs['Base Color'].default_value = (*color, 1)
    if tex_path:
        img = bpy.data.images.load(tex_path)
        if img.size[0] > size:
            img.scale(size, size)
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = img
        nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(tn.outputs['Alpha'], bsdf.inputs['Alpha'])
            m.blend_method = 'HASHED' if hasattr(m, 'blend_method') else None
    if normal_path:
        img = bpy.data.images.load(normal_path)
        if img.size[0] > size // 2:
            img.scale(size // 2, size // 2)
        img.colorspace_settings.name = 'Non-Color'
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = img
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if vcol:
        ca = nt.nodes.new('ShaderNodeVertexColor')
        ca.layer_name = 'Col'
        nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
    m.use_backface_culling = False
    return m


# ---------- proxies (.mhclo fitting) ----------
def parse_mhclo(path):
    scales = {}
    refs = []
    delete = set()
    mode = None
    obj_file = None
    for line in open(path):
        t = line.split()
        if not t or t[0].startswith('#'):
            continue
        if t[0] in ('x_scale', 'y_scale', 'z_scale'):
            scales[t[0][0]] = (int(t[1]), int(t[2]), float(t[3]))
        elif t[0] == 'obj_file':
            obj_file = t[1]
        elif t[0] == 'verts':
            mode = 'verts'
        elif t[0] == 'delete_verts':
            mode = 'delete'
        elif mode == 'verts' and t[0].lstrip('-').isdigit():
            if len(t) == 1:
                refs.append(((int(t[0]), int(t[0]), int(t[0])), (1.0, 0, 0), (0, 0, 0)))
            elif len(t) >= 9:
                refs.append(((int(t[0]), int(t[1]), int(t[2])), tuple(map(float, t[3:6])), tuple(map(float, t[6:9]))))
        elif mode == 'delete':
            i = 0
            while i < len(t):
                if i + 2 < len(t) and t[i + 1] == '-':
                    delete.update(range(int(t[i]), int(t[i + 2]) + 1))
                    i += 3
                else:
                    if t[i].isdigit():
                        delete.add(int(t[i]))
                    i += 1
    return scales, refs, delete, obj_file


def parse_obj(path):
    v, vt, f = [], [], []
    for line in open(path):
        if line.startswith('v '):
            v.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            vt.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            idx = []
            for a in line.split()[1:]:
                p = a.split('/')
                idx.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else None))
            f.append(idx)
    return v, vt, f


DELETED = set()


def add_proxy(folder, name, material, face_filter=None):
    scales, refs, delete, obj_file = parse_mhclo(f'{folder}/{name}.mhclo')
    DELETED.update(delete)
    pv, pvt, pf = parse_obj(f'{folder}/{obj_file or name + ".obj"}')
    sc = {}
    for ax, k in (('x', 0), ('y', 1), ('z', 2)):
        if ax in scales:
            a, b, d = scales[ax]
            sc[k] = abs(V[a][k] - V[b][k]) / d
        else:
            sc[k] = 1.0
    pos = []
    for (r, w, off) in refs:
        p = [sum(w[j] * V[r[j]][k] for j in range(3)) + off[k] * sc[k] for k in range(3)]
        pos.append(p)

    def wts(k):
        r, w, _ = refs[k]
        out = {}
        for j in range(3):
            for b, x in VW.get(r[j], {}).items():
                out[b] = out.get(b, 0) + w[j] * x
        return out

    if face_filter:
        pf = [fc for fc in pf if face_filter(fc, pvt)]
    faces = [[i for i, _ in fc] for fc in pf]
    ob, _ = make_mesh(name, faces, lambda k: to_b(pos[k]), (lambda fi, j: pvt[pf[fi][j][1]] if pf[fi][j][1] is not None and pf[fi][j][1] < len(pvt) else (0.0, 0.0)) if pvt else None, wts, material)
    return ob


# ---------- body ----------
skin_dir = f'{SYS}/skins/young_caucasian_male'
skin_png = [f for f in os.listdir(skin_dir) if f.endswith('.png')][0]
skin_mat = mat_tex('Skin', f'{skin_dir}/{skin_png}', 1024, rough=0.5)

# proxies first (they register vertices of the body that get hidden, e.g. under shoes)
eyes_mat = mat_tex('Eyes', f'{SYS}/eyes/materials/brown_eye.png', 512, rough=0.15)
# The eye mesh has an outer cornea shell (mapped to the blue disc of the texture); MakeHuman renders
# it transparent. Leave it out so the iris is visible.
cornea = lambda fc, vt: not all(vt[t][0] > 0.85 and vt[t][1] < 0.15 for _, t in fc if t is not None)
add_proxy(f'{SYS}/eyes/high-poly', 'high-poly', eyes_mat, cornea)
add_proxy(f'{SYS}/eyebrows/eyebrow001', 'eyebrow001', mat_tex('Brows', f'{SYS}/eyebrows/eyebrow001/eyebrow001.png', 256, alpha=True, rough=0.7))
add_proxy(f'{SYS}/eyelashes/eyelashes01', 'eyelashes01', mat_tex('Lashes', f'{SYS}/eyelashes/eyelashes01/eyelashes01.png', 256, alpha=True, rough=0.7))
add_proxy(f'{SYS}/hair/short02', 'short02', mat_tex('Hair', f'{SYS}/hair/short02/short02_diffuse.png', 1024, alpha=True, rough=0.6, normal_path=f'{SYS}/hair/short02/short02_normal.png'))
# Outfit: 'business' (default) = MakeHuman's elegant suit (jacket, shirt, tie, trousers, dress shoes);
# 'sport' = the earlier fight outfit cut from the body (top, pants, gloves) with sneakers.
OUTFIT = os.environ.get('OUTFIT', 'business')
if OUTFIT == 'business':
    suit = 'male_elegantsuit01'
    add_proxy(f'{SYS}/clothes/{suit}', suit, mat_tex('Suit', f'{SYS}/clothes/{suit}/{suit}_diffuse.png', 2048, rough=0.62))
shoe = os.environ.get('SHOES', 'shoes04' if OUTFIT == 'business' else 'shoes06')
if shoe != 'none':
    add_proxy(f'{SYS}/clothes/{shoe}', shoe, mat_tex('Shoes', f'{SYS}/clothes/{shoe}/{shoe}_diffuse.png', 512, rough=0.35))

body_faces = [fc for g, fc in F if g == 'body' and not any(i in DELETED for i, _ in fc)]
body, bmap = make_mesh(
    'Body', [[i for i, _ in fc] for fc in body_faces], lambda i: to_b(V[i]),
    lambda fi, j: VT[body_faces[fi][j][1]], lambda i: VW.get(i, {}), skin_mat)

# Vertex normals of the body (for offsetting clothes)
body.data.calc_loop_triangles() if hasattr(body.data, 'calc_loop_triangles') else None
NORM = {i: body.data.vertices[vi].normal.copy() for i, vi in bmap.items()}

pelvis_z = arm_data.bones['pelvis'].head_local.z
spine1_z = arm_data.bones['spine_01'].head_local.z
neck_z = arm_data.bones['neck_01'].head_local.z
ankle_z = max(arm_data.bones['foot_l'].head_local.z, arm_data.bones['foot_r'].head_local.z)
waist_z = spine1_z + 0.01

if OUTFIT == 'sport':
    # ---------- outfit: sleeveless sports top (from body faces) ----------
    ARM = ('upperarm', 'lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')


    SHOULDER_X = abs(arm_data.bones['upperarm_l'].head_local.x)


    def top_ok(i):
        p = to_b(V[i])
        return (waist_z - 0.05 < p.z < neck_z - 0.01 and abs(p.x) < SHOULDER_X - 0.01
                and wsum(i, ARM) < 0.45 and wsum(i, ('neck', 'head')) < 0.5)


    top_faces = [[i for i, _ in fc] for fc in body_faces if all(top_ok(i) for i, _ in fc)]


    def top_color(i, p):
        n = NORM.get(i, Vector((0, 0, 1)))
        if abs(n.x) > 0.72 and p.z < neck_z - 0.1:
            return DARK  # side panels
        if p.z < waist_z - 0.02:
            return DARK  # hem
        return ACCENT


    cloth = mat_tex('Fabric', None, vcol=True, rough=0.82)
    make_mesh('Top', top_faces, lambda i: to_b(V[i]) + NORM.get(i, Vector()) * 0.0045, None, lambda i: VW.get(i, {}), cloth, top_color)

    # ---------- outfit: fight pants (from the tights helper) ----------
    def pants_ok(i):
        p = to_b(V[i])
        return p.z < waist_z + 0.02 and p.z > ankle_z + 0.03 and wsum(i, ARM) < 0.05


    tight_faces = [[i for i, _ in fc] for g, fc in F if g == 'helper-tights' and all(pants_ok(i) for i, _ in fc)]
    tnorm = {}
    for fc in tight_faces:
        a, b, c = (to_b(V[k]) for k in fc[:3])
        n = (b - a).cross(c - a)
        for k in fc:
            tnorm[k] = tnorm.get(k, Vector()) + n
    for k in tnorm:
        tnorm[k] = tnorm[k].normalized()
        if tnorm[k].dot(Vector((to_b(V[k]).x, to_b(V[k]).y + 0.02, 0))) < 0:
            pass


    def pants_color(i, p):
        n = tnorm.get(i, Vector())
        if p.z > waist_z - 0.03:
            return ACCENT  # waistband
        if abs(n.x) > 0.975 and n.x * p.x > 0:
            return ACCENT  # side stripe
        return DARK


    make_mesh('Pants', tight_faces, lambda i: to_b(V[i]) + tnorm.get(i, Vector()) * 0.004, None, lambda i: VW.get(i, {}), cloth, pants_color)

    # ---------- outfit: fingerless gloves ----------
    def glove_ok(i):
        return wsum(i, ('hand',)) > 0.45 and wsum(i, ('index_02', 'middle_02', 'ring_02', 'pinky_02', 'thumb_02', 'index_03', 'middle_03', 'ring_03', 'pinky_03', 'thumb_03')) < 0.2


    glove_faces = [[i for i, _ in fc] for fc in body_faces if all(glove_ok(i) for i, _ in fc)]


    def glove_color(i, p):
        w = wsum(i, ('lowerarm',))
        return ACCENT if w > 0.12 else (0.05, 0.05, 0.06)


    make_mesh('Gloves', glove_faces, lambda i: to_b(V[i]) + NORM.get(i, Vector()) * 0.0035, None, lambda i: VW.get(i, {}), mat_tex('Glove', None, vcol=True, rough=0.4), glove_color)


# ---------- export ----------
for ob in scene.objects:
    ob.select_set(True)
print('bones', len(arm_data.bones), 'objects', [o.name for o in scene.objects])
tris = sum(len(o.data.polygons) for o in scene.objects if o.type == 'MESH')
print('faces', tris, 'height', max(v.co.z for v in body.data.vertices), 'min', min(v.co.z for v in body.data.vertices))
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format='GLB', use_selection=False, export_apply=True,
    export_skins=True, export_animations=False, export_morph=False, export_yup=True,
    export_image_format='WEBP', export_image_quality=82, export_texcoords=True, export_normals=True,
)
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup copies
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
print('DONE')

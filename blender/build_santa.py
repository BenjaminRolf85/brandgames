# Santa Claus for the AI Arena, Christmas edition (original comic design): a chubby Santa with a
# big round belly in a red suit with white fur trims, a black belt with a gold buckle, short legs
# in black boots, a big head with rosy cheeks, a round nose, a bushy white beard and moustache and
# a floppy Santa hat. Skinned to the same skeleton bone names as fighter-human.glb (pelvis,
# spine_01, spine_02, neck_01, head, upperarm/lowerarm/hand, thigh/calf/foot), so the fighter's
# pose system drives it unchanged (public/js/fighter-glb.js); the arena adds the boxing gloves.
# Every part is bound rigidly to one bone (a toy-like comic figure). Faces -Y (three.js +z).
# Materials (colors from the --xr-xmas-santa-* tokens in the app): SantaSuit, SantaFur, SantaSkin,
# SantaCheek, SantaNose, SantaEye, SantaBelt, SantaGold, SantaBoot.
# Usage: blender -b -P build_santa.py -- <out.glb> <out.blend>
import sys, math
import bpy, bmesh
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, color, metal=0.0, rough=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    return m


SUIT = material('SantaSuit', (0.78, 0.05, 0.07), 0.0, 0.7)
FUR = material('SantaFur', (0.96, 0.96, 0.95), 0.0, 1.0)
SKIN = material('SantaSkin', (0.98, 0.74, 0.6), 0.0, 0.55)
CHEEK = material('SantaCheek', (0.95, 0.45, 0.45), 0.0, 0.6)
NOSE = material('SantaNose', (0.92, 0.35, 0.35), 0.0, 0.35)
EYE = material('SantaEye', (0.02, 0.02, 0.04), 0.0, 0.2)
BELT = material('SantaBelt', (0.03, 0.03, 0.04), 0.0, 0.45)
GOLD = material('SantaGold', (1.0, 0.75, 0.25), 1.0, 0.3)
BOOT = material('SantaBoot', (0.04, 0.04, 0.05), 0.0, 0.35)

# ---------- skeleton (Blender coordinates: Z up, the figure faces -Y) ----------

BONES = {
    'pelvis': ((0, 0, 0.84), (0, 0, 0.96), None),
    'spine_01': ((0, 0, 0.96), (0, 0, 1.14), 'pelvis'),
    'spine_02': ((0, 0, 1.14), (0, 0, 1.34), 'spine_01'),
    'neck_01': ((0, 0, 1.34), (0, 0, 1.41), 'spine_02'),
    'head': ((0, 0, 1.41), (0, 0, 1.72), 'neck_01'),
}
for s, n in ((1, 'l'), (-1, 'r')):
    BONES[f'upperarm_{n}'] = ((s * 0.3, 0, 1.3), (s * 0.37, 0, 1.04), 'spine_02')
    BONES[f'lowerarm_{n}'] = ((s * 0.37, 0, 1.04), (s * 0.4, -0.02, 0.8), f'upperarm_{n}')
    BONES[f'hand_{n}'] = ((s * 0.4, -0.02, 0.8), (s * 0.41, -0.03, 0.71), f'lowerarm_{n}')
    BONES[f'thigh_{n}'] = ((s * 0.14, 0, 0.84), (s * 0.15, 0, 0.47), 'pelvis')
    BONES[f'calf_{n}'] = ((s * 0.15, 0, 0.47), (s * 0.15, 0.01, 0.12), f'thigh_{n}')
    BONES[f'foot_{n}'] = ((s * 0.15, 0.01, 0.12), (s * 0.15, -0.15, 0.04), f'calf_{n}')

arm_data = bpy.data.armatures.new('SantaRig')
arm = bpy.data.objects.new('SantaRig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, (h, t, _) in BONES.items():
    eb = arm_data.edit_bones.new(name)
    eb.head = Vector(h)
    eb.tail = Vector(t)
for name, (_, _, parent) in BONES.items():
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
J = {name: Vector(h) for name, (h, _, _) in BONES.items()}
T = {name: Vector(t) for name, (_, t, _) in BONES.items()}

# ---------- parts (each bound to one bone) ----------

PARTS = []


def finish(name, bm, mat, bone):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    g = ob.vertex_groups.new(name=bone)
    g.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    PARTS.append(ob)
    return ob


def sphere(name, c, r, mat, bone, s=(1, 1, 1), rot=None, segs=28, rings=18):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    m = Matrix.Translation(Vector(c)) @ (rot.to_4x4() if rot else Matrix()) @ Matrix.Diagonal((*s, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return finish(name, bm, mat, bone)


def capsule(name, a, b, r1, r2, mat, bone, segs=22):
    a = Vector(a)
    b = Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    m = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    ob = finish(name, bm, mat, bone)
    sphere(f'{name}_a', a, r1, mat, bone, segs=20, rings=12)
    sphere(f'{name}_b', b, r2, mat, bone, segs=20, rings=12)
    return ob


def torus(name, c, R, r, mat, bone, s=(1, 1, 1), rot=None, segs=44, tsegs=12):
    bm = bmesh.new()
    verts = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ring = []
        for j in range(tsegs):
            b = 2 * math.pi * j / tsegs
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        verts.append(ring)
    for i in range(segs):
        for j in range(tsegs):
            bm.faces.new((verts[i][j], verts[(i + 1) % segs][j], verts[(i + 1) % segs][(j + 1) % tsegs], verts[i][(j + 1) % tsegs]))
    m = Matrix.Translation(Vector(c)) @ (rot.to_4x4() if rot else Matrix()) @ Matrix.Diagonal((*s, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, bone)


def box(name, c, size, mat, bone):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(c)) @ Matrix.Diagonal((*size, 1)), verts=bm.verts)
    ob = finish(name, bm, mat, bone)
    mod = ob.modifiers.new('Bevel', 'BEVEL')
    mod.width = min(size) * 0.25
    mod.segments = 3
    return ob


# Body: a big round belly (spine_01), the chest and shoulders (spine_02), the hips (pelvis).
sphere('belly', (0, -0.03, 1.06), 0.3, SUIT, 'spine_01', s=(1.02, 0.95, 1.0))
sphere('chest', (0, 0.0, 1.28), 0.22, SUIT, 'spine_02', s=(1.15, 0.85, 0.8))
for s in (1, -1):
    sphere(f'shoulder_{s}', (s * 0.24, 0, 1.3), 0.105, SUIT, 'spine_02')
sphere('hips', (0, 0.0, 0.86), 0.24, SUIT, 'pelvis', s=(1.05, 0.95, 0.6))
# Fur hem of the coat, a fur stripe up the front, the belt with its gold buckle.
torus('hem', (0, -0.02, 0.85), 0.25, 0.06, FUR, 'pelvis', s=(1.04, 0.92, 1))
box('placket', (0, -0.205, 1.24), (0.075, 0.05, 0.2), FUR, 'spine_02')
torus('belt', (0, -0.03, 1.02), 0.3, 0.036, BELT, 'spine_01', s=(1.0, 0.94, 1))
box('buckle', (0, -0.315, 1.02), (0.11, 0.035, 0.09), GOLD, 'spine_01')
box('buckleHole', (0, -0.33, 1.02), (0.055, 0.012, 0.04), BELT, 'spine_01')

# Head: big and round with rosy cheeks, a round red nose, dark eyes, bushy brows, white hair,
# a big beard and moustache.
HEAD = Vector((0, 0, 1.56))
sphere('head', HEAD, 0.155, SKIN, 'head', s=(1.0, 0.95, 1.05))
for s in (1, -1):
    sphere(f'cheek_{s}', HEAD + Vector((s * 0.085, -0.115, -0.03)), 0.045, CHEEK, 'head', s=(1, 0.6, 0.8))
    sphere(f'eye_{s}', HEAD + Vector((s * 0.052, -0.138, 0.035)), 0.02, EYE, 'head', s=(0.9, 0.6, 1.2))
    sphere(f'glint_{s}', HEAD + Vector((s * 0.047, -0.152, 0.045)), 0.006, FUR, 'head')
    sphere(f'brow_{s}', HEAD + Vector((s * 0.055, -0.13, 0.085)), 0.032, FUR, 'head', s=(1.5, 0.7, 0.6))
    sphere(f'hair_{s}', HEAD + Vector((s * 0.14, 0.03, -0.01)), 0.075, FUR, 'head', s=(0.7, 1.0, 1.0))
    sphere(f'moustache_{s}', HEAD + Vector((s * 0.05, -0.15, -0.055)), 0.045, FUR, 'head', s=(1.6, 0.8, 0.75),
           rot=Matrix.Rotation(s * -0.3, 3, 'Y'))
sphere('nose', HEAD + Vector((0, -0.165, -0.015)), 0.04, NOSE, 'head')
sphere('beard', HEAD + Vector((0, -0.08, -0.14)), 0.17, FUR, 'head', s=(1.05, 0.8, 1.0))
sphere('beardTip', HEAD + Vector((0, -0.11, -0.27)), 0.1, FUR, 'head', s=(0.9, 0.75, 1.0))
sphere('hairBack', HEAD + Vector((0, 0.07, -0.03)), 0.14, FUR, 'head', s=(1.0, 0.7, 0.85))

# The floppy Santa hat: fur brim, a soft cone that leans back and flops to the side, a pompom.
BRIM = HEAD + Vector((0, 0.01, 0.11))
torus('hatBrim', BRIM, 0.155, 0.05, FUR, 'head', s=(1, 1.02, 1), rot=Matrix.Rotation(0.12, 3, 'X'))


def hat_spine(u):
    return BRIM + Vector((0.2 * max(0.0, u - 0.4) ** 1.5, 0.1 * u, 0.33 * min(1.0, u * 1.2) - 0.2 * max(0.0, u - 0.55) ** 1.6))


bm = bmesh.new()
N, S = 30, 24
rings = []
for i in range(N + 1):
    u = i / N
    c = hat_spine(u)
    t = (hat_spine(min(1, u + 0.02)) - hat_spine(max(0, u - 0.02))).normalized()
    a = t.orthogonal().normalized()
    b = t.cross(a).normalized()
    r = 0.15 * (1 - u) ** 0.9 + 0.02
    rings.append([bm.verts.new(c + (a * math.cos(2 * math.pi * k / S) + b * math.sin(2 * math.pi * k / S)) * r) for k in range(S)])
for i in range(N):
    for k in range(S):
        bm.faces.new((rings[i][k], rings[i][(k + 1) % S], rings[i + 1][(k + 1) % S], rings[i + 1][k]))
bm.faces.new(list(reversed(rings[0])))
bm.faces.new(rings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
finish('hatCone', bm, SUIT, 'head')
sphere('pompom', hat_spine(1.0), 0.06, FUR, 'head')

# Arms: red sleeves with fur cuffs, small hands (the arena puts boxing gloves on them).
for s, n in ((1, 'l'), (-1, 'r')):
    capsule(f'upperarm_{n}', J[f'upperarm_{n}'], T[f'upperarm_{n}'], 0.09, 0.08, SUIT, f'upperarm_{n}')
    capsule(f'lowerarm_{n}', J[f'lowerarm_{n}'], T[f'lowerarm_{n}'], 0.078, 0.07, SUIT, f'lowerarm_{n}')
    cuff_dir = (T[f'lowerarm_{n}'] - J[f'lowerarm_{n}']).normalized()
    torus(f'cuff_{n}', T[f'lowerarm_{n}'] - cuff_dir * 0.03, 0.07, 0.03, FUR, f'lowerarm_{n}',
          rot=Vector((0, 0, 1)).rotation_difference(cuff_dir).to_matrix())
    sphere(f'hand_{n}', J[f'hand_{n}'] + Vector((0, -0.01, -0.04)), 0.055, SKIN, f'hand_{n}')
    # Legs: short and sturdy, red trousers, fur at the top of the black boots.
    capsule(f'thigh_{n}', J[f'thigh_{n}'], T[f'thigh_{n}'], 0.115, 0.095, SUIT, f'thigh_{n}')
    capsule(f'calf_{n}', J[f'calf_{n}'], T[f'calf_{n}'] + Vector((0, 0, 0.05)), 0.09, 0.08, SUIT, f'calf_{n}')
    torus(f'bootFur_{n}', J[f'calf_{n}'] + Vector((0, 0, -0.17)), 0.095, 0.035, FUR, f'calf_{n}')
    capsule(f'bootShaft_{n}', J[f'calf_{n}'] + Vector((0, 0, -0.18)), T[f'calf_{n}'], 0.09, 0.09, BOOT, f'calf_{n}')
    sphere(f'boot_{n}', J[f'foot_{n}'] + Vector((0, -0.07, -0.05)), 0.09, BOOT, f'foot_{n}', s=(0.95, 1.55, 0.7))

# ---------- one skinned mesh ----------

bpy.ops.object.select_all(action='DESELECT')
for ob in PARTS:
    for mod in ob.modifiers:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
for ob in PARTS:
    ob.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.ops.object.join()
santa = bpy.context.view_layer.objects.active
santa.name = 'Santa'
santa.data.name = 'Santa'
santa.parent = arm
mod = santa.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
print('faces', len(santa.data.polygons), 'height', max(v.co.z for v in santa.data.vertices))

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB, export_format='GLB', use_selection=False, export_apply=False,
    export_skins=True, export_animations=False, export_morph=False, export_yup=True, export_normals=True,
)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
print('DONE')

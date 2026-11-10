# Coin art for the gift coin "Für unsere Kunden / For our clients" in the main menu: a wrapped
# present with a gold ribbon and bow, its lid lifted a little so light and sparkles rise out,
# in front of out-of-focus fairy lights. Rendered with Cycles to a 512 x 512 PNG, then converted
# to public/assets/cards/clients.webp.
# Usage: blender -b -P blender/build_clients_coin.py -- <out.png> [size] [samples]
import bpy, math, sys, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/clients-coin.png'
SIZE = int(argv[1]) if len(argv) > 1 else 512
SAMPLES = int(argv[2]) if len(argv) > 2 else 64

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
random.seed(7)

# Colors of the app's design tokens (violet primary, cyan accent, gold coin), as linear RGB.
def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

VIOLET = srgb('7c5cff')
VIOLET_D = srgb('3b2a8f')
CYAN = srgb('22d3ee')
GOLD = srgb('f5b83d')
NIGHT = srgb('0b1030')


def mat(name, color, metal=0.0, rough=0.5, emit=None, strength=1.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


PAPER = mat('GiftPaper', srgb('6d3cf0'), 0.0, 0.4, coat=0.5)
PAPER_D = mat('GiftPaperDark', srgb('4b23c9'), 0.0, 0.4, coat=0.5)
RIBBON = mat('GiftRibbon', GOLD, 0.9, 0.22)
GLOW = mat('GiftGlow', (1, 1, 1), emit=srgb('ffe08a'), strength=14)
FLOOR = mat('Floor', NIGHT, 0.2, 0.25)


def bevel(ob, w, segs=3):
    m = ob.modifiers.new('Bevel', 'BEVEL')
    m.width = w
    m.segments = segs
    m.limit_method = 'ANGLE'
    return ob


def box(name, size, loc, material, bev=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(material)
    if bev:
        bevel(ob, bev)
    bpy.ops.object.shade_smooth()
    return ob


# The present: box, lid tilted up, ribbons, bow.
W, D, H = 1.0, 1.0, 0.78
box('Box', (W, D, H), (0, 0, H / 2), PAPER, 0.03)
box('RibbonX', (W + 0.012, 0.16, H + 0.012), (0, 0, H / 2), RIBBON, 0.01)
box('RibbonY', (0.16, D + 0.012, H + 0.012), (0, 0, H / 2), RIBBON, 0.01)
lid = box('Lid', (W + 0.08, D + 0.08, 0.2), (0, 0, 0), PAPER_D, 0.03)
lid_rx = box('LidRibbonX', (W + 0.092, 0.16, 0.212), (0, 0, 0), RIBBON, 0.01)
lid_ry = box('LidRibbonY', (0.16, D + 0.092, 0.212), (0, 0, 0), RIBBON, 0.01)
# Bow: two loops and a knot on the lid.
bow = []
for side in (-1, 1):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.045, location=(side * 0.17, 0, 0.2))
    t = bpy.context.object
    t.rotation_euler = (math.radians(90), math.radians(side * 25), 0)
    t.scale = (1, 0.62, 1)
    t.data.materials.append(RIBBON)
    bpy.ops.object.shade_smooth()
    bow.append(t)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.075, location=(0, 0, 0.17))
knot = bpy.context.object
knot.data.materials.append(RIBBON)
bpy.ops.object.shade_smooth()
bow.append(knot)
# Lid group: parent everything to an empty, lift and tilt it.
bpy.ops.object.empty_add(location=(0, 0, 0))
pivot = bpy.context.object
for ob in (lid, lid_rx, lid_ry, *bow):
    ob.parent = pivot
pivot.location = (-0.12, 0.08, H + 0.3)
pivot.rotation_euler = (math.radians(-14), math.radians(-18), math.radians(8))

# Light rising out of the open box, and sparkles.
box('Inner', (W - 0.06, D - 0.06, 0.02), (0, 0, H - 0.01), GLOW)
for i in range(26):
    r = random.uniform(0.03, 0.55)
    a = random.uniform(0, math.tau)
    z = H + random.uniform(0.1, 1.5)
    bpy.ops.mesh.primitive_ico_sphere_add(radius=random.uniform(0.015, 0.04), subdivisions=2, location=(math.cos(a) * r, math.sin(a) * r, z))
    s = bpy.context.object
    col = random.choice([GOLD, CYAN, srgb('ffffff'), srgb('f472b6')])
    s.data.materials.append(mat(f'Spark{i}', col, emit=col, strength=random.uniform(4, 9)))

# Floor with a soft reflection.
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
bpy.context.object.data.materials.append(FLOOR)

# Fairy lights behind the present (out of focus): two swags across the background.
for i in range(44):
    k = i / 43
    x = -3.2 + k * 6.4
    y = 3.2 + random.uniform(-0.2, 0.2)
    z = 1.75 - 0.45 * abs(math.sin(k * math.pi * 2)) + random.uniform(-0.05, 0.05)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07, location=(x, y, z))
    col = [GOLD, CYAN, srgb('f472b6'), srgb('a3e635'), VIOLET][i % 5]
    bpy.context.object.data.materials.append(mat(f'Bulb{i}', col, emit=col, strength=8))

# World: deep night blue.
world = bpy.data.worlds.new('World')
sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (*srgb('2a1d6b'), 1)
bg.inputs['Strength'].default_value = 0.9

# Lights: key, rim (cyan), warm fill from inside the box.
def light(kind, loc, energy, color, size=1.0, rot=(0, 0, 0)):
    bpy.ops.object.light_add(type=kind, location=loc, rotation=rot)
    l = bpy.context.object
    l.data.energy = energy
    l.data.color = color
    if kind == 'AREA':
        l.data.size = size
    return l

light('AREA', (-2.2, -2.4, 3.2), 150, (1, 0.95, 0.9), 2.5, (math.radians(50), 0, math.radians(-40)))
light('AREA', (2.6, 1.8, 2.0), 260, CYAN, 1.5, (math.radians(70), 0, math.radians(125)))
light('POINT', (0, 0, H + 0.25), 160, srgb('ffd98a'))

# Camera: three-quarter view from slightly above, shallow depth of field.
bpy.ops.object.camera_add(location=(2.0, -2.75, 2.55))
cam = bpy.context.object
sc.camera = cam
target = Vector((0, 0.15, 0.85))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 50
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = (target - cam.location).length
cam.data.dof.aperture_fstop = 2.4

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)

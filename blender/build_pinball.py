# Campaign Pinball (game 'pinball'): the pinball machine and its parts (original design).
# Units are meters at a real 21 inch playfield (the app scales the machine); three.js axes
# (x right, y up, z towards the player). The playfield is tilted by 7 degrees: a point
# (x, y) on the playfield with height h above it sits at FP(x, y, h) in the machine frame.
# Objects (each with its own origin, the app clones and places them):
#   PinCabinet   lower cabinet in the machine frame: side panels with red stripes, inner
#                linings, front and back, chrome side rails, lockdown bar, coin door with lit
#                coin slots, start button, flipper buttons, plunger housing, leg brackets
#   PinBackbox   the head on top of the cabinet's back: frame, chrome trim around the backglass
#                window, the dot matrix display's bezel, two speakers, a red crown
#   PinLeg       one leg, origin at its top, 1 m long downwards (the app scales it to the floor)
#   PinFoot      leg leveler, origin on the floor
#   PinBumper    pop bumper (field frame: origin on the playfield, y = up from the playfield)
#   PinPost      star post (fluted plastic) with a white rubber ring and a screw on top
#                (physics radius 0.0065)
#   PinStandup   standup target facing +x (switch housing, stem, white blade; the app prints
#                the face), origin on the playfield below the blade
#   PinSpinner   spinner frame: two wire brackets and the axle along z, 3 cm above the field
#   PinSpinnerFlap  the spinner's flap, origin on its axle (it turns about z)
#   PinStar      star rollover button in its ring (flush with the playfield)
#   PinRollover  wire rollover switch along x, with its slot
#   PinKickback  kickback in the outlane: coil housing and plunger with a rubber tip, firing
#                towards -z (up the playfield), origin at the tip
#   PinScrew     round slotted screw head;  PinNut  hex nut with washer (plastics on posts)
#   PinSpacer    hex standoff, 1 m tall (the app scales it to the plastic's height)
#   PinFlipper   flipper bat along +x from its pivot (radius 0.0125 to 0.0066, length 0.074)
#   PinDrop      drop target facing +x, origin at the bottom of its face
#   PinColumn    advertising column (poster channel); the poster band has UVs for a texture
#   PinHouse     the branch office on the right of the playfield (already at its place)
#   PinSaucer    the kickout hole in front of the branch office's door
#   PinGate      wire gate, hinge along x
#   PinPlunger   plunger rod with spring and knob, origin at the tip, the rod along +z
# Empties: BackglassAnchor, DmdAnchor (centers of the two windows), LegFL, LegFR, LegBL, LegBR,
# PriceCardAnchor (the price card in the coin door).
# Materials (the app recolors them from the --xr-pinball-* tokens): PbBody, PbAccent, PbChrome,
# PbDark, PbWood, PbButton, PbCoinGlow, PbSpeaker, PbLeg, PbFlipper, PbFlipperRubber, PbRubber,
# PbBumperBase, PbBumperBody, PbBumperCap, PbDropFace, PbColumn, PbPoster, PbHouse, PbRoof,
# PbWindowGlow, PbStarPost, PbStandup, PbStar, PbSpinner. Ambient occlusion is baked into the
# vertex colors.
# Usage: blender -b -P build_pinball.py -- <out.glb> <out.blend>
#        blender -b -P build_pinball.py -- coin <out.png>   (the menu coin picture)
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from bhelpers import init, P, material, link, tbox, tcyl, ttorus, merge, bake_ao, export, blob, prism

ARGS = sys.argv[sys.argv.index('--') + 1:]
COIN = ARGS[0] == 'coin'
init()

A = math.radians(7)
SA, CA = math.sin(A), math.cos(A)
TILT = Matrix.Rotation(A, 4, 'X')  # three.js rotation.x = A, in Blender coordinates


def FP(x, y, h=0.0):
    """Playfield point (x, y) at height h -> machine frame (three.js coordinates)."""
    return (x, y * SA + h * CA, -y * CA + h * SA)


def tilt(objs):
    for ob in objs:
        ob.matrix_world = TILT @ ob.matrix_world
    return objs


BODY = material('PbBody', (0.02, 0.04, 0.14), 0.25, 0.32)
ACCENT = material('PbAccent', (0.75, 0.03, 0.04), 0.2, 0.3)
CHROME = material('PbChrome', (0.9, 0.92, 0.95), 1.0, 0.12)
DARK = material('PbDark', (0.01, 0.012, 0.02), 0.3, 0.55)
WOOD = material('PbWood', (0.03, 0.05, 0.16), 0.1, 0.5)
BUTTON = material('PbButton', (0.8, 0.05, 0.06), 0.1, 0.25)
COINGLOW = material('PbCoinGlow', (0, 0, 0), emit=(1.0, 0.7, 0.2))
SPEAKER = material('PbSpeaker', (0.02, 0.025, 0.05), 0.2, 0.7)
LEG = material('PbLeg', (0.7, 0.72, 0.78), 0.9, 0.3)
FLIP = material('PbFlipper', (0.92, 0.9, 0.85), 0.0, 0.35)
FLIPRUB = material('PbFlipperRubber', (0.75, 0.04, 0.05), 0.0, 0.6)
RUBBER = material('PbRubber', (0.02, 0.02, 0.025), 0.0, 0.65)
BBASE = material('PbBumperBase', (0.03, 0.035, 0.06), 0.4, 0.4)
BBODY = material('PbBumperBody', (0.92, 0.9, 0.85), 0.0, 0.35)
BCAP = material('PbBumperCap', (1.0, 0.25, 0.55), 0.0, 0.2, emit=(0.4, 0.05, 0.2))
DROPFACE = material('PbDropFace', (0.2, 0.75, 1.0), 0.0, 0.3)
COLUMN = material('PbColumn', (0.1, 0.38, 0.27), 0.3, 0.35)
POSTER = material('PbPoster', (0.9, 0.85, 0.7), 0.0, 0.5)
HOUSE = material('PbHouse', (0.9, 0.82, 0.68), 0.0, 0.7)
ROOF = material('PbRoof', (0.75, 0.05, 0.06), 0.0, 0.55)
WINDOW = material('PbWindowGlow', (0, 0, 0), emit=(1.0, 0.8, 0.4))
STARPOST = material('PbStarPost', (1.0, 0.75, 0.1), 0.0, 0.3)
STANDUP = material('PbStandup', (0.95, 0.95, 0.95), 0.0, 0.35)
STAR = material('PbStar', (0.95, 0.95, 1.0), 0.0, 0.2)
SPINNER = material('PbSpinner', (0.85, 0.87, 0.9), 0.8, 0.25)

# ---------------------------------------------------------------- cabinet

BX0, BX1 = -0.288, 0.338   # outer sides
IX0, IX1 = -0.268, 0.318   # inner sides
YF, YB = -0.075, 1.30      # front and back of the cabinet (playfield y)
HT = 0.07                  # top rim above the playfield (glass level)
YBOT = -0.30               # bottom of the cabinet (machine y)


def side_profile(yf, yb, h_top, bottom):
    """Side panel outline (z, y) in the machine frame: vertical front and back, sloped top."""
    f = FP(0, yf, h_top)
    b = FP(0, yb, h_top)
    return [(f[2], bottom), (f[2], f[1]), (b[2], b[1]), (b[2], bottom)]


def cabinet():
    p = []
    prof = side_profile(YF, YB, HT, YBOT)
    zf = prof[0][0]
    zb = prof[2][0]
    p.append(prism('sideL', prof, BX0, IX0, BODY))
    p.append(prism('sideR', prof, IX1, BX1, BODY))
    # The side art (stripes, town, megaphones) is painted by the app onto the side panels.
    # Inner linings above the playfield.
    lin = [FP(0, YF, -0.02), FP(0, YF, HT), FP(0, YB, HT), FP(0, YB, -0.02)]
    lin = [(q[2], q[1]) for q in lin]
    p.append(prism('linL', lin, IX0, IX0 + 0.004, WOOD, smooth=False))
    p.append(prism('linR', lin, IX1 - 0.004, IX1, WOOD, smooth=False))
    # Front and back panels, bottom.
    ft = FP(0, YF, HT)[1]
    p.append(tbox('front', ((IX0 + IX1) / 2, (YBOT + ft) / 2 - 0.006, zf - 0.01), (IX1 - IX0, ft - YBOT - 0.012, 0.02), BODY))
    bt = FP(0, YB, HT)[1]
    p.append(tbox('back', ((IX0 + IX1) / 2, (YBOT + bt) / 2, zb + 0.01), (IX1 - IX0, bt - YBOT, 0.02), BODY))
    p.append(tbox('bottom', ((BX0 + BX1) / 2, YBOT + 0.01, (zf + zb) / 2), (BX1 - BX0, 0.02, zf - zb), DARK))
    # Under the playfield (seen through the shooter lane gap): a dark floor.
    p.extend(tilt([tbox('floor', ((IX0 + IX1) / 2, -0.03, -(YF + YB) / 2), (IX1 - IX0, 0.01, YB - YF), DARK)]))
    # Chrome side rails on top of the side panels and the lockdown bar at the front.
    rails = []
    for x in ((BX0 + IX0) / 2 - 0.002, (BX1 + IX1) / 2 + 0.002):
        rails.append(tbox('rail', (x, HT + 0.006, -(YF + YB) / 2 - 0.005), (0.03, 0.012, YB - YF + 0.01), CHROME, bev=0.004))
    rails.append(tbox('lockdown', ((BX0 + BX1) / 2, HT + 0.008, -(YF + 0.022)), (BX1 - BX0 + 0.012, 0.016, 0.06), CHROME, bev=0.006))
    rails.append(tbox('lockdownBase', ((BX0 + BX1) / 2, HT - 0.006, -(YF + 0.022)), (BX1 - BX0, 0.014, 0.056), DARK))
    p.extend(tilt(rails))
    # Coin door: chrome frame, dark inside, two lit coin slots and a return slot.
    cx = (BX0 + BX1) / 2
    cy = -0.15
    p.append(tbox('doorFrame', (cx, cy, zf + 0.004), (0.25, 0.21, 0.008), CHROME, bev=0.004))
    p.append(tbox('doorIn', (cx, cy, zf + 0.0085), (0.225, 0.185, 0.004), DARK))
    for dx in (-0.045, 0.045):
        p.append(tbox('slotPlate', (cx + dx, cy + 0.035, zf + 0.0115), (0.05, 0.07, 0.004), CHROME, bev=0.002))
        p.append(tbox('slot', (cx + dx, cy + 0.04, zf + 0.0138), (0.006, 0.035, 0.002), COINGLOW))
        p.append(tbox('return', (cx + dx, cy - 0.035, zf + 0.012), (0.03, 0.02, 0.004), DARK))
    p.append(tbox('doorLock', (cx, cy - 0.075, zf + 0.012), (0.012, 0.012, 0.006), CHROME))
    # Start button at the front left, flipper buttons on the sides.
    p.append(tcyl('startRing', (-0.2, 0.0, zf + 0.004), 0.016, 0.008, CHROME, axis='z', segs=24))
    p.append(tcyl('start', (-0.2, 0.0, zf + 0.009), 0.012, 0.01, BUTTON, axis='z', segs=24, bev=0.003))
    for x, s in ((BX0, -1), (BX1, 1)):
        p.append(tcyl('flipRing', (x + s * 0.003, 0.01, zf - 0.05), 0.019, 0.006, CHROME, axis='x', segs=24))
        p.append(tcyl('flipBtn', (x + s * 0.009, 0.01, zf - 0.05), 0.014, 0.012, BUTTON, axis='x', segs=24, bev=0.004))
    # Plunger housing on the front where the rod comes out (shooter lane x = 0.267).
    hp = FP(0.267, YF, 0.012)
    p.append(tbox('plungerPlate', (0.267, hp[1] - 0.005, zf + 0.004), (0.06, 0.05, 0.008), CHROME, bev=0.004))
    p.append(tcyl('plungerBush', (0.267, hp[1], zf + 0.012), 0.009, 0.012, CHROME, axis='z', segs=20))
    # Leg brackets under the corners, leg plates on the sides with two big bolts each.
    for x in (BX0 + 0.03, BX1 - 0.03):
        for z in (zf - 0.035, zb + 0.035):
            p.append(tbox('bracket', (x, YBOT - 0.006, z), (0.075, 0.012, 0.075), LEG, bev=0.003))
    for x, s in ((BX0, -1), (BX1, 1)):
        for z in (zf - 0.035, zb + 0.035):
            p.append(tbox('legPlate', (x + s * 0.003, YBOT + 0.035, z), (0.006, 0.11, 0.054), LEG, bev=0.0025))
            for by in (YBOT + 0.068, YBOT + 0.018):
                p.append(tcyl('washer', (x + s * 0.0068, by, z), 0.0115, 0.0016, CHROME, axis='x', segs=20))
                p.append(tcyl('bolt', (x + s * 0.0095, by, z), 0.0085, 0.005, CHROME, axis='x', segs=6, bev=0.001))
    # Coin door: coin return buttons and the price card's frame between the returns.
    for dx in (-0.045, 0.045):
        p.append(tcyl('returnBtn', (cx + dx, cy - 0.035, zf + 0.0145), 0.0055, 0.004, BUTTON, axis='z', segs=16, bev=0.001))
    p.append(tbox('cardFrame', (cx, cy - 0.035, zf + 0.0112), (0.056, 0.034, 0.0034), CHROME, bev=0.0012))
    p.append(tbox('cardBack', (cx, cy - 0.035, zf + 0.0124), (0.05, 0.028, 0.001), DARK))
    for sx in (-0.1, 0.1):
        for sy in (-0.09, 0.09):
            p.append(tcyl('doorScrew', (cx + sx * 1.15, cy + sy * 1.05, zf + 0.0088), 0.003, 0.0015, CHROME, axis='z', segs=10))
    cab = merge(p, 'PinCabinet')
    for e, (x, z) in (('LegFL', (BX0 + 0.02, zf - 0.035)), ('LegFR', (BX1 - 0.02, zf - 0.035)),
                      ('LegBL', (BX0 + 0.02, zb + 0.035)), ('LegBR', (BX1 - 0.02, zb + 0.035))):
        empty(e, (x, YBOT - 0.012, z))
    empty('PriceCardAnchor', (cx, cy - 0.035, zf + 0.0131))
    return cab, zb


def empty(name, c):
    e = bpy.data.objects.new(name, None)
    e.location = P(*c)
    bpy.context.scene.collection.objects.link(e)
    return e


def backbox(zb):
    p = []
    z0 = zb + 0.002          # back face
    depth = 0.2
    z1 = z0 + depth          # front face
    y0 = FP(0, YB, HT)[1] - 0.02
    hgt = 0.62
    y1 = y0 + hgt
    cx = (BX0 + BX1) / 2
    w = BX1 - BX0
    # Body: back, sides, top, bottom, with a front frame around the windows.
    p.append(tbox('bbBack', (cx, (y0 + y1) / 2, z0 + 0.01), (w, hgt, 0.02), BODY))
    p.append(tbox('bbSideL', (BX0 + 0.01, (y0 + y1) / 2, (z0 + z1) / 2), (0.02, hgt, depth), BODY, bev=0.004))
    p.append(tbox('bbSideR', (BX1 - 0.01, (y0 + y1) / 2, (z0 + z1) / 2), (0.02, hgt, depth), BODY, bev=0.004))
    p.append(tbox('bbTop', (cx, y1 - 0.01, (z0 + z1) / 2), (w, 0.02, depth), BODY, bev=0.004))
    p.append(tbox('bbBottom', (cx, y0 + 0.01, (z0 + z1) / 2), (w, 0.02, depth), BODY))
    gy = y1 - 0.05 - 0.2     # backglass center
    gw, gh = 0.56, 0.4
    dy = y0 + 0.092          # display center (a big dot matrix display)
    dw, dh = 0.46, 0.115
    # Front face: panels around the backglass and the display (a dark recess behind them).
    p.append(tbox('bbRecess', (cx, (y0 + y1) / 2, z1 - 0.03), (w - 0.04, hgt - 0.04, 0.01), DARK))
    fz = z1 - 0.006
    p.append(tbox('bbFaceTop', (cx, (gy + gh / 2 + y1) / 2, fz), (w - 0.004, y1 - gy - gh / 2, 0.012), BODY, bev=0.002))
    mid_top = gy - gh / 2
    mid_bot = dy + dh / 2
    p.append(tbox('bbFaceMid', (cx, (mid_top + mid_bot) / 2, fz), (w - 0.004, mid_top - mid_bot, 0.012), BODY))
    p.append(tbox('bbFaceBot', (cx, (y0 + dy - dh / 2) / 2, fz), (w - 0.004, dy - dh / 2 - y0, 0.012), BODY))
    for s in (-1, 1):
        sxg = cx + s * (gw / 2 + (w / 2 - gw / 2) / 2)
        p.append(tbox('bbFaceSide', (sxg, gy, fz), (w / 2 - gw / 2 - 0.002, gh, 0.012), BODY))
        sxd = cx + s * (dw / 2 + (w / 2 - dw / 2) / 2)
        p.append(tbox('bbFaceSideD', (sxd, dy, fz), (w / 2 - dw / 2 - 0.002, dh, 0.012), BODY))
    # Chrome trim around the backglass, a dark bezel around the display.
    t = 0.012
    for (c, s) in (((cx, gy + gh / 2 + t / 2), (gw + 2 * t, t)), ((cx, gy - gh / 2 - t / 2), (gw + 2 * t, t)),
                   ((cx - gw / 2 - t / 2, gy), (t, gh)), ((cx + gw / 2 + t / 2, gy), (t, gh))):
        p.append(tbox('trim', (c[0], c[1], z1 + 0.002), (s[0], s[1], 0.008), CHROME, bev=0.003))
    for (c, s) in (((cx, dy + dh / 2 + 0.006), (dw + 0.024, 0.012)), ((cx, dy - dh / 2 - 0.006), (dw + 0.024, 0.012)),
                   ((cx - dw / 2 - 0.006, dy), (0.012, dh)), ((cx + dw / 2 + 0.006, dy), (0.012, dh))):
        p.append(tbox('bezel', (c[0], c[1], z1 + 0.002), (s[0], s[1], 0.008), DARK, bev=0.002))
    # Speakers left and right of the display.
    for s in (-1, 1):
        sx = cx + s * 0.279
        p.append(tcyl('spk', (sx, dy, z1 + 0.001), 0.025, 0.006, SPEAKER, axis='z', segs=32))
        p.append(ttorus('spkRing', (sx, dy, z1 + 0.004), 0.026, 0.0035, CHROME, axis='z', segs=40, tsegs=8))
        p.append(tcyl('spkCone', (sx, dy, z1 + 0.004), 0.009, 0.004, CHROME, axis='z', segs=20))
    # Speaker grilles: chrome bars across each speaker.
    for s in (-1, 1):
        sx = cx + s * 0.279
        for k in (-2, -1, 0, 1, 2):
            yy = k * 0.0085
            half = math.sqrt(max(0.0, 0.0235 ** 2 - yy ** 2))
            p.append(tbox('grille', (sx, dy + yy, z1 + 0.0072), (2 * half, 0.0022, 0.0018), CHROME))
    # The backglass frame is hinged on the left and locked on the right: three hinge knuckles,
    # a lock with a key slot, a screw in each corner of the trim.
    hx = cx - gw / 2 - t
    for hy in (gy - 0.15, gy, gy + 0.15):
        p.append(tcyl('hinge', (hx - 0.002, hy, z1 + 0.006), 0.0042, 0.034, CHROME, segs=12, bev=0.001))
        p.append(tcyl('hingePin', (hx - 0.002, hy, z1 + 0.006), 0.0015, 0.038, DARK, segs=8))
    lx = cx + gw / 2 + t / 2
    p.append(tcyl('lock', (lx, gy, z1 + 0.0075), 0.0075, 0.004, CHROME, axis='z', segs=20, bev=0.001))
    p.append(tbox('keySlot', (lx, gy, z1 + 0.0096), (0.0014, 0.007, 0.0008), DARK))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(tcyl('trimScrew', (cx + sx * (gw / 2 + t / 2), gy + sy * (gh / 2 + t / 2), z1 + 0.0065), 0.0028, 0.0015, CHROME, axis='z', segs=10))
    # Red crown along the top edge and a chrome band below it.
    p.append(tbox('crown', (cx, y1 + 0.012, (z0 + z1) / 2 + 0.01), (w + 0.01, 0.024, depth + 0.02), ACCENT, bev=0.008))
    p.append(tbox('band', (cx, y1 - 0.03, z1 + 0.001), (w - 0.01, 0.01, 0.006), CHROME, bev=0.002))
    # Neck between head and cabinet.
    p.append(tbox('neck', (cx, y0 - 0.01, (z0 + z1) / 2), (w - 0.04, 0.03, depth - 0.02), DARK))
    bb = merge(p, 'PinBackbox')
    empty('BackglassAnchor', (cx, gy, z1 - 0.024))
    empty('DmdAnchor', (cx, dy, z1 - 0.024))
    return bb


def leg():
    bm = bmesh.new()
    # Tapered square tube, 1 m long, origin at the top.
    s0, s1 = 0.026, 0.02
    top = [bm.verts.new(P(x * s0, 0, z * s0)) for x, z in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bot = [bm.verts.new(P(x * s1, -1.0, z * s1)) for x, z in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((top[i], top[j], bot[j], bot[i]))
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link('PinLeg', bm, LEG)
    mod = ob.modifiers.new('Bevel', 'BEVEL')
    mod.width = 0.004
    mod.segments = 2
    return merge([ob], 'PinLeg')


def foot():
    p = [tcyl('nut', (0, 0.022, 0), 0.012, 0.012, LEG, segs=6),
         tcyl('stem', (0, 0.03, 0), 0.006, 0.02, CHROME, segs=12),
         tcyl('pad', (0, 0.008, 0), 0.022, 0.016, DARK, segs=24, r2=0.018, bev=0.003)]
    return merge(p, 'PinFoot')


# ---------------------------------------------------------------- playfield parts (field frame)

def bumper():
    p = [tcyl('base', (0, 0.002, 0), 0.034, 0.004, BBASE, segs=40, bev=0.0015),
         tcyl('body', (0, 0.017, 0), 0.024, 0.026, BBODY, segs=40),
         ttorus('skirt', (0, 0.009, 0), 0.03, 0.0022, CHROME, axis='y', segs=40, tsegs=8),
         tcyl('cap', (0, 0.033, 0), 0.031, 0.009, BCAP, segs=40, bev=0.003),
         blob('dome', (0, 0.038, 0), 0.027, BCAP, s=(1, 0.32, 1), segs=32, rings=12),
         ttorus('ring', (0, 0.043, 0), 0.02, 0.0018, CHROME, axis='y', segs=40, tsegs=6)]
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        p.append(tcyl('rod', (math.cos(a) * 0.028, 0.02, math.sin(a) * 0.028), 0.0014, 0.024, CHROME, segs=8))
    return merge(p, 'PinBumper')


def star_prism(name, r_out, r_in, y0, y1, mat, points=6):
    bm = bmesh.new()
    n = points * 2
    lo, hi = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = r_out if i % 2 == 0 else r_in
        lo.append(bm.verts.new(P(r * math.cos(a), y0, r * math.sin(a))))
        hi.append(bm.verts.new(P(r * math.cos(a), y1, r * math.sin(a))))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(hi)
    bm.faces.new(list(reversed(lo)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, mat)


def post():
    # A star post: fluted plastic, a white rubber ring at ball height, a slotted screw on top.
    p = [star_prism('star', 0.0043, 0.0029, 0.0, 0.022, STARPOST),
         tcyl('cap', (0, 0.0228, 0), 0.0036, 0.0016, STARPOST, segs=12, bev=0.0006),
         ttorus('rubber', (0, 0.011, 0), 0.0045, 0.0021, RUBBER, axis='y', segs=24, tsegs=8),
         blob('screw', (0, 0.0238, 0), 0.0024, CHROME, s=(1, 0.5, 1), segs=12, rings=6),
         tbox('slot', (0, 0.025, 0), (0.0036, 0.0005, 0.0007), DARK)]
    return merge(p, 'PinPost')


def standup():
    # Faces +x; the blade's front is at x = 0.002 (the app prints the face there).
    p = [tbox('housing', (-0.011, 0.005, 0), (0.012, 0.01, 0.02), DARK, bev=0.001),
         tbox('stem', (-0.004, 0.009, 0), (0.004, 0.018, 0.005), DARK),
         tbox('blade', (0.0, 0.0175, 0), (0.004, 0.023, 0.025), STANDUP, bev=0.0012)]
    for z in (-0.007, 0.007):
        p.append(tcyl('screw', (-0.011, 0.0105, z), 0.0018, 0.001, CHROME, segs=8))
    return merge(p, 'PinStandup')


def spinner():
    p = []
    for z in (-0.027, 0.027):
        p.append(tcyl('leg', (0, 0.016, z), 0.0013, 0.032, CHROME, segs=8))
        p.append(tbox('foot', (0, 0.0008, z), (0.012, 0.0016, 0.006), CHROME, bev=0.0005))
        p.append(blob('bearing', (0, 0.031, z), 0.0026, CHROME, segs=10, rings=6))
    p.append(tcyl('axle', (0, 0.031, 0), 0.0009, 0.054, CHROME, axis='z', segs=8))
    return merge(p, 'PinSpinner')


def spinner_flap():
    p = [tbox('flap', (0, -0.0125, 0), (0.0016, 0.023, 0.046), SPINNER, bev=0.0006),
         tcyl('sleeve', (0, 0, 0), 0.0017, 0.048, SPINNER, axis='z', segs=10)]
    return merge(p, 'PinSpinnerFlap')


def star_rollover():
    bm = bmesh.new()
    n = 10
    top, bot = [], []
    for i in range(n):
        a = math.pi / 2 + 2 * math.pi * i / n
        r = 0.0068 if i % 2 == 0 else 0.0029
        top.append(bm.verts.new(P(r * math.cos(a), 0.0022, -r * math.sin(a))))
        bot.append(bm.verts.new(P(r * math.cos(a), 0.0, -r * math.sin(a))))
    c = bm.verts.new(P(0, 0.0026, 0))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((top[i], top[j], c))
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    st = link('star', bm, STAR)
    p = [st, ttorus('ring', (0, 0.0006, 0), 0.0082, 0.0009, CHROME, axis='y', segs=24, tsegs=6)]
    return merge(p, 'PinStar')


def rollover_wire():
    arch = ttorus('wire', (0, 0, 0), 0.012, 0.0008, CHROME, axis='z', segs=16, tsegs=6, arc=math.pi)
    arch.data.transform(Matrix.Diagonal((1, 1, 0.38, 1)))  # a flat arch (Blender z = three y)
    p = [arch, tbox('slot', (0, 0.0003, 0), (0.028, 0.0006, 0.0042), DARK)]
    for x in (-0.0125, 0.0125):
        p.append(blob('end', (x, 0.0008, 0), 0.0012, CHROME, segs=8, rings=5))
    return merge(p, 'PinRollover')


def kickback():
    p = [tcyl('tip', (0, 0.0125, 0.003), 0.0058, 0.006, RUBBER, axis='z', segs=16, bev=0.0012),
         tcyl('rod', (0, 0.0125, 0.017), 0.0026, 0.024, CHROME, axis='z', segs=12),
         tbox('coil', (0, 0.0125, 0.036), (0.016, 0.016, 0.02), DARK, bev=0.0015),
         tcyl('wrap', (0, 0.0125, 0.036), 0.0092, 0.014, ACCENT, axis='z', segs=16),
         tbox('bracket', (0, 0.0012, 0.032), (0.026, 0.0024, 0.034), CHROME, bev=0.0006)]
    for x in (-0.01, 0.01):
        p.append(tcyl('screw', (x, 0.0028, 0.044), 0.0018, 0.001, CHROME, segs=8))
    return merge(p, 'PinKickback')


def screw():
    p = [blob('head', (0, 0.0, 0), 0.0024, CHROME, s=(1, 0.5, 1), segs=12, rings=6),
         tbox('slot', (0, 0.0011, 0), (0.0036, 0.0005, 0.0007), DARK)]
    return merge(p, 'PinScrew')


def nut():
    p = [tcyl('washer', (0, 0.0003, 0), 0.0042, 0.0006, CHROME, segs=16),
         tcyl('nut', (0, 0.0016, 0), 0.0029, 0.0022, CHROME, segs=6, bev=0.0004)]
    return merge(p, 'PinNut')


def spacer():
    return merge([tcyl('spacer', (0, 0.5, 0), 0.0024, 1.0, CHROME, segs=6)], 'PinSpacer')


def outline(len_, r0, r1, n=24):
    """Tapered capsule outline in the x/z plane (three.js), base circle at the origin, tip at +x.
    Both arcs run counterclockwise and meet the straight sides where they are tangent."""
    a = math.asin((r0 - r1) / len_)
    pts = []
    for i in range(n + 1):  # tip: the smaller arc
        t = -(math.pi / 2 - a) + (math.pi - 2 * a) * i / n
        pts.append((len_ + r1 * math.cos(t), r1 * math.sin(t)))
    for i in range(n + 1):  # base: the larger arc
        t = (math.pi / 2 - a) + (math.pi + 2 * a) * i / n
        pts.append((r0 * math.cos(t), r0 * math.sin(t)))
    return pts


def extrude_outline(name, pts, y0, y1, mat):
    bm = bmesh.new()
    lo = [bm.verts.new(P(x, y0, z)) for x, z in pts]
    hi = [bm.verts.new(P(x, y1, z)) for x, z in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(hi)
    bm.faces.new(list(reversed(lo)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, mat)
    for poly in ob.data.polygons:
        poly.use_smooth = abs(poly.normal.z) < 0.5
    return ob


def flipper():
    L, R0, R1 = 0.074, 0.0125, 0.0066
    body = extrude_outline('bat', outline(L, R0 - 0.0018, R1 - 0.0016), 0.0012, 0.017, FLIP)
    rub = extrude_outline('rubber', outline(L, R0, R1), 0.0045, 0.0125, FLIPRUB)
    p = [body, rub,
         tcyl('pivot', (0, 0.0185, 0), 0.0055, 0.004, CHROME, segs=20, bev=0.0012),
         tcyl('screw', (0, 0.0205, 0), 0.0025, 0.0015, DARK, segs=6)]
    return merge(p, 'PinFlipper')


def drop():
    p = [tbox('target', (-0.003, 0.016, 0), (0.006, 0.032, 0.033), FLIP, bev=0.0015),
         tbox('face', (0.0005, 0.017, 0), (0.0015, 0.026, 0.027), DROPFACE)]
    return merge(p, 'PinDrop')


def column():
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')  # calc_uvs needs a UV layer to write into
    bmesh.ops.create_cone(bm, cap_ends=False, cap_tris=False, segments=40, radius1=0.0212, radius2=0.0212, depth=0.064, calc_uvs=True)
    bmesh.ops.translate(bm, vec=P(0, 0.041, 0), verts=bm.verts)
    poster = link('poster', bm, POSTER)
    for poly in poster.data.polygons:
        poly.use_smooth = True
    p = [poster,
         tcyl('base', (0, 0.004, 0), 0.026, 0.008, COLUMN, segs=40, bev=0.002),
         ttorus('baseRing', (0, 0.009, 0), 0.0222, 0.002, COLUMN, axis='y', segs=40, tsegs=6),
         ttorus('topRing', (0, 0.073, 0), 0.0232, 0.0025, COLUMN, axis='y', segs=40, tsegs=6),
         blob('dome', (0, 0.075, 0), 0.024, COLUMN, s=(1, 0.55, 1), segs=32, rings=12),
         blob('finial', (0, 0.091, 0), 0.0045, CHROME, segs=12, rings=8)]
    return merge(p, 'PinColumn')


def house():
    # Footprint x 0.2145 .. 0.2445, playfield y 0.44 .. 0.50 (three.js z = -y); door to -x.
    x0, x1, z0, z1 = 0.2145, 0.2445, -0.5, -0.44
    wh = 0.034
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    p = [tbox('walls', (cx, wh / 2, cz), (x1 - x0, wh, z1 - z0), HOUSE, bev=0.001)]
    # Gable roof (ridge along z), with an overhang.
    bm = bmesh.new()
    ov = 0.005
    ridge = wh + 0.022
    v = [bm.verts.new(P(*c)) for c in ((x0 - ov, wh - 0.002, z0 - ov), (cx, ridge, z0 - ov), (x1 + ov, wh - 0.002, z0 - ov),
                                        (x0 - ov, wh - 0.002, z1 + ov), (cx, ridge, z1 + ov), (x1 + ov, wh - 0.002, z1 + ov))]
    bm.faces.new((v[0], v[3], v[4], v[1]))
    bm.faces.new((v[1], v[4], v[5], v[2]))
    bm.faces.new((v[0], v[1], v[2]))
    bm.faces.new((v[5], v[4], v[3]))
    bm.faces.new((v[0], v[2], v[5], v[3]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    roof = link('roof', bm, ROOF)
    mod = roof.modifiers.new('Solid', 'SOLIDIFY')
    mod.thickness = 0.003
    p.append(roof)
    # Gable triangles on the ends (walls up into the roof).
    for z in (z0, z1):
        bm = bmesh.new()
        a = bm.verts.new(P(x0, wh, z))
        b = bm.verts.new(P(x1, wh, z))
        c = bm.verts.new(P(cx, ridge - 0.003, z))
        bm.faces.new((a, b, c))
        g = link('gable', bm, HOUSE)
        mod = g.modifiers.new('Solid', 'SOLIDIFY')
        mod.thickness = 0.004
        p.append(g)
    # Door towards the saucer, with a light above it; windows on the long side and the ends.
    p.append(tbox('door', (x0 - 0.0008, 0.011, -0.468), (0.002, 0.02, 0.013), DARK))
    p.append(tbox('doorFrame', (x0 - 0.0006, 0.0115, -0.468), (0.0016, 0.023, 0.017), HOUSE))
    for z in (-0.49, -0.448):
        p.append(tbox('win', (x0 - 0.0008, 0.019, z), (0.002, 0.009, 0.007), WINDOW))
    for z in (z0 - 0.0008, z1 + 0.0008):
        p.append(tbox('winEnd', (cx, 0.02, z), (0.012, 0.009, 0.002), WINDOW))
    # Portico of a little branch office: steps, two columns, entablature and a pediment.
    zc = -0.468
    p.append(tbox('step1', (x0 - 0.003, 0.0012, zc), (0.006, 0.0024, 0.03), HOUSE))
    p.append(tbox('step2', (x0 - 0.0048, 0.0006, zc), (0.0096, 0.0012, 0.034), HOUSE))
    for dz in (-0.0115, 0.0115):
        p.append(tcyl('column', (x0 - 0.0028, 0.0146, zc + dz), 0.0016, 0.026, HOUSE, segs=12))
        p.append(tbox('capital', (x0 - 0.0028, 0.0272, zc + dz), (0.0042, 0.0012, 0.0042), HOUSE))
    p.append(tbox('entablature', (x0 - 0.0026, 0.0295, zc), (0.0052, 0.0036, 0.035), HOUSE))
    p.append(prism('pediment', [(zc - 0.0175, 0.0313), (zc + 0.0175, 0.0313), (zc, 0.0398)], x0 - 0.005, x0, ROOF, smooth=False))
    p.append(tbox('chimney', (cx + 0.006, ridge - 0.002, -0.49), (0.006, 0.014, 0.006), HOUSE))
    return merge(p, 'PinHouse')


def saucer():
    p = [ttorus('ring', (0, 0.0015, 0), 0.0185, 0.0026, CHROME, axis='y', segs=40, tsegs=8),
         tcyl('hole', (0, 0.0004, 0), 0.0165, 0.0008, DARK, segs=40)]
    return merge(p, 'PinSaucer')


def gate():
    # Origin on the hinge bar (the app places it 3 cm above the playfield and swings it).
    p = [tcyl('bar', (0, 0, 0), 0.0016, 0.046, CHROME, axis='x', segs=10)]
    for x in (-0.016, 0.016):
        p.append(tcyl('wireV', (x, -0.012, 0), 0.0011, 0.024, CHROME, segs=8))
    p.append(tcyl('wireH', (0, -0.024, 0), 0.0011, 0.032, CHROME, axis='x', segs=8))
    return merge(p, 'PinGate')


def gate_posts():
    return [tcyl('gpost', (x, 0.017, 0), 0.0028, 0.034, CHROME, segs=12) for x in (-0.024, 0.024)]


def plunger():
    p = [tcyl('tip', (0, 0.0, 0.004), 0.0065, 0.008, RUBBER, axis='z', segs=20, bev=0.0015),
         tcyl('rod', (0, 0.0, 0.1), 0.0034, 0.19, CHROME, axis='z', segs=16)]
    # Spring: a helix tube.
    bm = bmesh.new()
    turns, n, r, tr = 9, 9 * 16, 0.0068, 0.0011
    rings = []
    for i in range(n + 1):
        u = i / n
        a = u * turns * 2 * math.pi
        c = Vector(P(math.cos(a) * r, math.sin(a) * r, 0.018 + u * 0.075))
        tan = Vector(P(-math.sin(a) * r * turns * 2 * math.pi, math.cos(a) * r * turns * 2 * math.pi, 0.075)).normalized()
        a1 = tan.orthogonal().normalized()
        b1 = tan.cross(a1).normalized()
        rings.append([bm.verts.new(c + (a1 * math.cos(2 * math.pi * k / 6) + b1 * math.sin(2 * math.pi * k / 6)) * tr) for k in range(6)])
    for i in range(n):
        for k in range(6):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % 6], rings[i + 1][(k + 1) % 6], rings[i + 1][k]))
    spring = link('spring', bm, CHROME)
    for poly in spring.data.polygons:
        poly.use_smooth = True
    p.append(spring)
    p.append(tcyl('collar', (0, 0, 0.17), 0.008, 0.008, CHROME, axis='z', segs=20, bev=0.002))
    p.append(blob('knob', (0, 0, 0.205), 0.016, BUTTON, s=(1, 1, 1.25), segs=24, rings=14))
    p.append(ttorus('knobRing', (0, 0, 0.188), 0.011, 0.0025, CHROME, axis='z', segs=24, tsegs=8))
    return merge(p, 'PinPlunger')


def build_parts():
    parts = {
        'bumper': bumper(), 'post': post(), 'flipper': flipper(), 'drop': drop(), 'column': column(),
        'house': house(), 'saucer': saucer(), 'plunger': plunger(),
    }
    parts['gate'] = gate()
    parts['gatePosts'] = merge(gate_posts(), 'PinGatePosts')
    parts.update({
        'standup': standup(), 'spinner': spinner(), 'flap': spinner_flap(), 'star': star_rollover(),
        'rollover': rollover_wire(), 'kickback': kickback(), 'screw': screw(), 'nut': nut(), 'spacer': spacer(),
    })
    return parts


# ---------------------------------------------------------------- export

if not COIN:
    OUT_GLB, OUT_BLEND = ARGS[0], ARGS[1]
    cab, zb = cabinet()
    bb = backbox(zb)
    lg = leg()
    ft = foot()
    parts = build_parts()
    assets = [(cab, 0.06), (bb, 0.06), (lg, 0.2), (ft, 0.02)] + [(o, 0.01) for o in parts.values()]
    bake_ao(assets, {'PbCoinGlow', 'PbWindowGlow', 'PbBumperCap', 'PbStar'}, distance=0.04, samples=24)
    print('faces', sum(len(o.data.polygons) for o, _ in assets))
    export(OUT_GLB, OUT_BLEND)
    print('DONE')
    sys.exit(0)

# ---------------------------------------------------------------- coin picture
# A close-up on the playfield: the chrome ball on the left flipper, a pop bumper and the
# advertising column behind it, glowing channel inserts, fairy-light bokeh. No text.
OUT_PNG = ARGS[1]
parts = build_parts()
for k in ('house', 'saucer', 'gate', 'gatePosts', 'drop', 'post', 'standup', 'spinner', 'flap', 'star', 'rollover', 'kickback', 'screw', 'nut', 'spacer'):
    parts[k].hide_render = True


def place(ob, x, y, rot=0.0, s=1.0):
    """Puts a field-frame part at playfield (x, y) on the flat playfield (Blender: z up)."""
    ob.matrix_world = Matrix.Translation(P(x, 0, -y)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Scale(s, 4) @ ob.matrix_world


sc = bpy.context.scene
POSTER.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1.0, 0.55, 0.1, 1)
FIELD = material('CoinField', (0.02, 0.04, 0.13), 0.0, 0.35)
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
field = link('field', bm, FIELD)
field.location = P(0, 0, -0.3)
INSERTS = [((1.0, 0.69, 0.18), (0.035, 0.155)), ((1.0, 0.37, 0.64), (-0.035, 0.16)), ((0.25, 0.82, 1.0), (0.075, 0.13)),
           ((0.65, 0.55, 1.0), (-0.085, 0.125)), ((1.0, 0.25, 0.25), (0.1, 0.165)), ((0.26, 0.88, 0.54), (0.0, 0.19))]
for col, (x, y) in INSERTS:
    m = material('ins%d' % len(bpy.data.materials), (0, 0, 0), emit=col)
    m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.2
    bm = bmesh.new()
    pts = [(0, 0.022), (0.014, -0.006), (0.007, -0.006), (0.007, -0.02), (-0.007, -0.02), (-0.007, -0.006), (-0.014, -0.006)]
    vs = [bm.verts.new(P(x + px, 0.0006, -(y + py))) for px, py in pts]
    bm.faces.new(vs)
    link('arrow', bm, m)
# Ball (chrome), flipper with the ball on it, a bumper and the column behind.
ball = blob('ball', (0, 0, 0), 0.0145, CHROME, segs=48, rings=32)
place(ball, -0.02, 0.106)
ball.location.z = 0.0145
place(parts['flipper'], -0.055, 0.07, rot=math.radians(18))
place(parts['bumper'], 0.055, 0.215, s=1.1)
b2 = bumper()
place(b2, -0.005, 0.29)
place(parts['column'], -0.07, 0.205, s=1.05)
# Marketing touches: chat bubble lids with hearts on the bumpers, a flying envelope, hearts.
WHITE = material('CoinWhite', (0.95, 0.95, 0.97), 0.0, 0.35)
PINK = material('CoinPink', (1.0, 0.2, 0.45), 0.0, 0.3, emit=(1.0, 0.2, 0.45))
PINK.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.5
SEAL = material('CoinSeal', (0.55, 0.0, 0.04), 0.1, 0.35)


def heart(name, c, size, mat, rot=None):
    bm = bmesh.new()
    pts = []
    for i in range(40):
        a = 2 * math.pi * i / 40
        x = 16 * math.sin(a) ** 3
        y = 13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)
        pts.append((x / 17 * size, y / 17 * size))
    top = [bm.verts.new((x, 0.0015, y)) for x, y in pts]
    bot = [bm.verts.new((x, -0.0015, y)) for x, y in pts]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(40):
        j = (i + 1) % 40
        bm.faces.new((top[i], top[j], bot[j], bot[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, mat)
    m = Matrix.Translation(Vector(c)) @ (rot or Matrix.Identity(4))
    ob.matrix_world = m
    return ob


def bubble_lid(x, y, s):
    h = 0.047 * s
    lid = tcyl('lid', (0, 0, 0), 0.024 * s, 0.005 * s, WHITE, segs=40, bev=0.0015)
    tail = tcyl('tail', (0, 0, 0), 0.007 * s, 0.005 * s, WHITE, segs=3)
    lid.matrix_world = Matrix.Translation(P(x, h, -y)) @ lid.matrix_world
    tail.matrix_world = Matrix.Translation(P(x - 0.02 * s, h, -y + 0.016 * s)) @ tail.matrix_world
    heart('lidHeart', P(x, h + 0.014 * s, -y), 0.012 * s, PINK)  # a standing like-heart on the bubble


bubble_lid(0.055, 0.215, 1.1)
bubble_lid(-0.005, 0.29, 1.0)
for (hx, hy, hh, hs) in ((0.085, 0.24, 0.085, 0.011), (0.04, 0.27, 0.11, 0.008), (0.1, 0.3, 0.12, 0.007)):
    heart('flyHeart', P(hx, hh, -hy), hs, PINK, Matrix.Rotation(0.35, 4, 'Y'))  # upright, a little tilted
FLAP = material('CoinFlap', (0.01, 0.12, 0.55), 0.0, 0.45)  # deep, so the key light does not wash it out
PAPER = material('CoinPaper', (0.62, 0.64, 0.7), 0.0, 0.5)
env = tbox('envelope', (0, 0, 0), (0.034, 0.024, 0.003), PAPER, bev=0.001)
bm = bmesh.new()
vs = [bm.verts.new(v) for v in ((-0.0166, -0.0018, 0.0116), (0.0166, -0.0018, 0.0116), (0.0, -0.0018, -0.0025))]
bm.faces.new(vs)
flap = link('flap', bm, FLAP)  # the closed envelope flap, so it reads as a letter
seal = heart('seal', (0, -0.003, -0.0025), 0.005, SEAL)
for ob in (env, flap, seal):
    ob.matrix_world = Matrix.Translation(P(-0.085, 0.075, -0.15)) @ Matrix.Rotation(0.35, 4, 'Z') @ Matrix.Rotation(-0.25, 4, 'X') @ ob.matrix_world
place(parts['plunger'], 9, 9)
parts['plunger'].hide_render = True
# Fairy lights in the background (soft bokeh).
cols = [(1, 0.18, 0.25), (1, 0.82, 0.48), (0.56, 0.89, 0.44), (0.35, 0.85, 1.0), (0.9, 0.48, 0.85)]
for i in range(26):
    a = i / 25
    x = -0.16 + 0.32 * a
    y = 0.36 + 0.03 * math.sin(a * math.pi * 3) ** 2
    m = material('bulb%d' % i, (0, 0, 0), emit=cols[i % 5])
    m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 3.0
    blob('bulb', (x, 0.07 + 0.02 * math.sin(a * 9), -y), 0.004, m, segs=10, rings=6)
# World: deep blue with a warm red glow on one side.
wd = bpy.data.worlds.new('W')
sc.world = wd
wd.use_nodes = True
bg = wd.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.03, 0.05, 0.16, 1)
bg.inputs['Strength'].default_value = 0.9
for (loc, col, en) in ((P(0.15, 0.3, 0.2), (1.0, 0.85, 0.75), 6.0), (P(-0.25, 0.15, 0.05), (0.35, 0.6, 1.0), 4.0), (P(0.2, 0.1, -0.35), (1.0, 0.2, 0.25), 5.0)):
    ld = bpy.data.lights.new('L', 'AREA')
    ld.energy = en
    ld.color = col
    ld.size = 0.25
    lo = bpy.data.objects.new('L', ld)
    lo.location = loc
    lo.rotation_euler = (Vector((0, 0, 0)) - loc).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(lo)
cam_d = bpy.data.cameras.new('Cam')
cam_d.lens = 40
cam_d.dof.use_dof = True
cam_d.dof.aperture_fstop = 5.0
cam = bpy.data.objects.new('Cam', cam_d)
sc.collection.objects.link(cam)
cam.location = P(0.0, 0.105, 0.13)
target = P(-0.005, 0.022, -0.16)
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_d.dof.focus_distance = (P(-0.02, 0.0145, -0.106) - cam.location).length
sc.camera = cam
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 64
sc.cycles.use_denoising = True
sc.render.resolution_x = 512
sc.render.resolution_y = 512
sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'Medium High Contrast'
sc.view_settings.exposure = -0.3
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = OUT_PNG
bpy.ops.render.render(write_still=True)
print('DONE')

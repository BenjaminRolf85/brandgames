// "Andock-Labor": the molecule workshop of pockets 3 and 4. No library hit binds well enough, so
// you design your own molecule on the AI's scaffold: glowing attachment points sit next to the
// pocket's contact spots (and one points into the wall). Put an atom on a point and the fit meter
// and the glow answer at once; the AI estimates your design live ("AI estimates: 71 %"); the lab
// decides. Headset: grab an atom from the parts dish and plug it on with your hand (pull it off to
// remove it). Desktop: click a point, then an atom in the ring menu around it, or keys N, O, C,
// S, L (Cl), X (remove), Tab (next point). Phones: tap a point, then the big atom buttons.
import * as THREE from 'three';
import { t } from './i18n.js';
import { sfx } from './sfx.js';
import { DESIGN_ATOMS, buildDesign, designEstimate, judgePoint } from './dock-chem.js';
import { makePointMarkers, atomTile, makePartsDish } from './dock-visuals.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SNAP = 0.045; // an atom in the hand snaps onto a point within this distance
const KEYS = { n: 'N', o: 'O', c: 'C', s: 'S', l: 'Cl' };

export class Workshop {
  constructor(scene) {
    this.scene = scene;
    this.sel = null; // selected attachment point
    this.held = null; // headset: the atom in the hand
    const s = scene;
    // Ring menu (desktop and the headset's ray): five atoms and "remove".
    this.tiles = [...DESIGN_ATOMS, null].map((el) => {
      const tile = atomTile(el, scene.isXR ? 0.066 : 0.058);
      tile.userData.label = el ?? t('dockRemove');
      tile.userData.onClick = () => this.choose(el, true);
      tile.visible = false;
      s.group.add(tile);
      return { el, tile };
    });
    // Headset: the parts dish in reach, right in front of the protein.
    if (s.isXR) {
      this.dish = makePartsDish(s.kit);
      this.dish.position.set(0.23, s.eye - 0.3, -0.57);
      this.dish.rotation.set(0.35, -0.35, 0, 'YXZ');
      this.dish.visible = false;
      s.world.add(this.dish);
      for (const b of this.dish.userData.balls) {
        b.mesh.userData.interactive = true;
        b.mesh.userData.label = b.el;
        b.mesh.userData.onGrab = (p) => this.grabPart(b.el, p);
        b.mesh.userData.onRelease = () => this.releasePart();
      }
    }
    // Phones: big buttons for the atoms (with the color of the spot each one likes).
    if (s.touch) {
      const keys = { N: 'dockAtomN', O: 'dockAtomO', C: 'dockAtomC', S: 'dockAtomS', Cl: 'dockAtomCl' };
      this.pad = s.touchButtons([
        ...DESIGN_ATOMS.map((el, i) => ({ icon: '', label: t(keys[el]), group: i < 3 ? 'left' : 'right', onPress: () => this.choose(el, true) })),
        { icon: 'back', label: t('dockDone'), group: 'right', primary: true, onPress: () => this.select(null) },
      ], { grid: true });
    }
  }

  /** The current pocket's own design, if it has one. */
  get cand() {
    return this.scene.level?.candidates.find((c) => c.kind === 'scaffold') ?? null;
  }

  /** Building is possible while the scaffold is the active molecule. */
  get building() {
    const s = this.scene;
    const c = this.cand;
    return !!c && s.mode === 'play' && s.active === c && c.s === 'active';
  }

  /** The scaffold got a new view: add its attachment point markers. */
  attach(c) {
    const L = this.scene.level;
    const m = makePointMarkers(this.scene.kit, L.design.points, L.c0);
    m.userData.items.forEach((it) => {
      it.hit.userData.label = t('dockWorkshop');
      it.hit.userData.onClick = () => { if (this.building) this.select(it.k); };
    });
    c.view.group.add(m);
    c.markers = m;
  }

  select(k) {
    this.sel = k;
    if (k !== null) sfx.tick();
  }

  /** The next point without an atom (or none). */
  nextEmpty(from = -1) {
    const ch = this.cand?.choices ?? [];
    for (let i = 1; i <= ch.length; i++) {
      const k = (from + i + ch.length) % ch.length;
      if (!ch[k]) return k;
    }
    return null;
  }

  /** An atom for the selected point (the same atom again removes it; null removes). */
  choose(el, toggle = false) {
    if (!this.building || this.sel === null) return;
    const k = this.sel;
    const cur = this.cand.choices[k];
    const next = toggle && el === cur ? null : el;
    this.setChoice(k, next);
    if (next) this.sel = this.nextEmpty(k);
  }

  setChoice(k, el) {
    const s = this.scene;
    const c = this.cand;
    const L = s.level;
    if (!c || c.choices[k] === el) return;
    c.choices[k] = el;
    c.mol = buildDesign(L, c.choices);
    c.ai = designEstimate(L, c.choices);
    c.tested = false;
    c.lab = null;
    s.makeView(c);
    s.redrawAI();
    s.redrawLab();
    const how = judgePoint(L.design.points[k], el);
    if (how === 'good') sfx.correct();
    else if (how === 'bad' || how === 'clash') sfx.wrong();
    else sfx.build();
    s.engine.haptic(this.held?.p ?? s.hand, how === 'good' ? 0.5 : 0.8, how === 'good' ? 40 : 90);
  }

  // ---------- headset: atoms in the hand ----------

  grabPart(el, p) {
    if (!this.building) return;
    const s = this.scene;
    const mesh = new THREE.Mesh(s.kit.sphere, this.dish.userData.balls.find((b) => b.el === el).mesh.material);
    mesh.userData.noFit = true;
    s.world.add(mesh);
    this.held = { el, p, mesh, snap: null };
    sfx.grab();
    s.engine.haptic(p, 0.3, 25);
  }

  releasePart() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    h.mesh.removeFromParent();
    if (h.snap !== null && this.building) this.setChoice(h.snap, h.el);
  }

  /** Trigger or pinch without pointing at anything: pull an atom off, or take one from the dish. */
  proximity(p) {
    if (!this.building || !p.controller) return false;
    const s = this.scene;
    const hand = V().setFromMatrixPosition(s.ctrlMatrix(p));
    const c = this.cand;
    const items = c.markers?.userData.items ?? [];
    for (const it of items) {
      if (!c.choices[it.k]) continue;
      if (s.world.worldToLocal(it.hit.getWorldPosition(V())).distanceTo(hand) < 0.035) {
        const el = c.choices[it.k];
        this.setChoice(it.k, null);
        this.grabPart(el, p);
        this.held.mesh.userData.onRelease = () => this.releasePart();
        p.held = this.held.mesh;
        return true;
      }
    }
    for (const b of this.dish.userData.balls) {
      if (s.world.worldToLocal(b.mesh.getWorldPosition(V())).distanceTo(hand) < 0.06) {
        p.held = b.mesh;
        this.grabPart(b.el, p);
        return true;
      }
    }
    return false;
  }

  // ---------- frame ----------

  update(dt, time) {
    const s = this.scene;
    const c = this.cand;
    const on = this.building;
    if (!on && this.sel !== null) this.sel = null;
    if (!on && this.held) { this.held.mesh.removeFromParent(); this.held = null; }
    if (this.dish) this.dish.visible = on;
    // The scaffold itself is not a pointing target while you build (its points are).
    if (c?.view) c.view.proxy.userData.interactive = c.s !== 'active';
    // Headset: the atom follows the hand and snaps onto the nearest point.
    const items = c?.markers?.userData.items ?? [];
    if (this.held) {
      const h = this.held;
      const ctrl = s.ctrlMatrix(h.p);
      const hand = V(0, 0, -0.03).applyMatrix4(ctrl);
      let best = null;
      let bestD = SNAP;
      for (const it of items) {
        const wp = s.world.worldToLocal(it.hit.getWorldPosition(V()));
        const d = wp.distanceTo(hand);
        if (d < bestD) { best = { k: it.k, wp }; bestD = d; }
      }
      if (best && best.k !== h.snap) s.engine.haptic(h.p, 0.25, 20);
      h.snap = best ? best.k : null;
      this.sel = h.snap;
      h.mesh.position.copy(best ? best.wp : hand);
      h.mesh.scale.setScalar(0.0165 * (best ? 1.1 : 1));
    }
    // Markers face the viewer.
    if (c?.markers && c.view) {
      const camQ = s.engine.camera.getWorldQuaternion(new THREE.Quaternion());
      const faceQ = c.view.group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(camQ);
      c.markers.visible = on || c.s === 'tray';
      c.markers.userData.tick(time, on ? this.sel : null, c.choices, faceQ);
    }
    // Ring menu around the selected point (not on phones, not while holding an atom).
    const ring = on && this.sel !== null && !s.touch && !this.held && !s.drag;
    const it = ring ? items.find((x) => x.k === this.sel) : null;
    if (it) {
      const cam = s.engine.camera;
      const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
      const groupQInv = s.group.getWorldQuaternion(new THREE.Quaternion()).invert();
      const q = groupQInv.multiply(camQ);
      const center = s.group.worldToLocal(it.hit.getWorldPosition(V()));
      const mid = s.group.worldToLocal(c.view.group.getWorldPosition(V()));
      const toCam = s.group.worldToLocal(cam.getWorldPosition(V())).sub(center).normalize();
      const right = V(1, 0, 0).applyQuaternion(q);
      const up = V(0, 1, 0).applyQuaternion(q);
      // The ring sits outside the molecule (away from its middle, in the view plane).
      const out = center.clone().sub(mid);
      const o2 = V(out.dot(right), out.dot(up), 0);
      if (o2.lengthSq() < 1e-6) o2.set(0, 1, 0);
      o2.normalize();
      const R = s.isXR ? 0.085 : 0.075;
      center.addScaledVector(toCam, 0.05).addScaledVector(right, o2.x * R * 0.9).addScaledVector(up, o2.y * R * 0.9);
      this.tiles.forEach((tl, i) => {
        const a = Math.PI / 2 - (i * Math.PI * 2) / this.tiles.length;
        tl.tile.position.copy(center).addScaledVector(right, Math.cos(a) * R).addScaledVector(up, Math.sin(a) * R);
        tl.tile.quaternion.copy(q);
        tl.tile.visible = true;
      });
    } else this.tiles.forEach((tl) => { tl.tile.visible = false; });
    // Phones: the atom buttons replace the main buttons while a point is selected.
    const atoms = on && this.sel !== null;
    this.pad?.show(atoms);
    return atoms;
  }

  /** Desktop keys while building. Returns true if the key was used. */
  key(k) {
    if (!this.building) return false;
    const lower = k.toLowerCase();
    if (k === 'Tab') { this.select(this.nextEmpty(this.sel ?? -1) ?? ((this.sel ?? -1) + 1) % this.cand.choices.length); return true; }
    if (this.sel === null) {
      if (KEYS[lower] || lower === 'x' || k === 'Delete') { this.select(this.nextEmpty() ?? 0); }
      else return false;
    }
    if (KEYS[lower]) { this.choose(KEYS[lower]); return true; }
    if (lower === 'x' || k === 'Delete') { this.choose(null); return true; }
    return false;
  }

  clear() {
    this.sel = null;
    if (this.held) { this.held.mesh.removeFromParent(); this.held = null; }
    this.tiles.forEach((tl) => { tl.tile.visible = false; });
    if (this.dish) this.dish.visible = false;
    this.pad?.show(false);
  }
}

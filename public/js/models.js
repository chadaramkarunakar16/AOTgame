/* =========================================================================
   Character models: Minecraft-style boxes with procedurally painted pixel skins.
   Models face +Z. 1 "pixel" = 1 model unit; the root is scaled to world size.
   ========================================================================= */
import { THREE } from './engine.js';

export class Skin {
  constructor(w = 128, h = 64) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d'); this.W = w; this.H = h; this.cx = 0; this.cy = 0; this.rowH = 0;
    this.img = this.g.createImageData(w, h);
  }
  alloc(w, h) {
    if (this.cx + w > this.W) { this.cx = 0; this.cy += this.rowH; this.rowH = 0; }
    const r = { x: this.cx, y: this.cy }; this.cx += w; this.rowH = Math.max(this.rowH, h); return r;
  }
  box(w, h, d) {
    const o = this.alloc(2 * d + 2 * w, d + h), u = o.x, v = o.y;
    return { w, h, d, top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h] };
  }
  px(x, y, c, f = 1) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 4, D = this.img.data;
    D[i] = Math.max(0, Math.min(255, c[0] * f)); D[i + 1] = Math.max(0, Math.min(255, c[1] * f)); D[i + 2] = Math.max(0, Math.min(255, c[2] * f)); D[i + 3] = 255;
  }
  // fill a face rect; fn(i, j, w, h) may return a colour (or null to use c)
  fill(r, c, n = 0.1, fn = null) {
    const [x, y, w, h] = r;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const cc = fn ? (fn(i, j, w, h) || c) : c;
      this.px(x + i, y + j, cc, 1 + (Math.random() - 0.5) * n);
    }
  }
  allFaces(b, c, n = 0.1, fn = null) { ['top', 'bottom', 'right', 'front', 'left', 'back'].forEach(k => this.fill(b[k], c, n, fn ? (i, j, w, h) => fn(k, i, j, w, h) : null)); }
  texture() {
    this.g.putImageData(this.img, 0, 0);
    const t = new THREE.CanvasTexture(this.c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  }
}
export function boxGeo(skin, b, sx = b.w, sy = b.h, sz = b.d) {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv, W = skin.W, H = skin.H;
  const faces = [b.left, b.right, b.top, b.bottom, b.front, b.back];
  for (let f = 0; f < 6; f++) {
    const [x, y, w, h] = faces[f], u0 = x / W, u1 = (x + w) / W, v1 = 1 - y / H, v0 = 1 - (y + h) / H;
    uv.setXY(f * 4, u0, v1); uv.setXY(f * 4 + 1, u1, v1); uv.setXY(f * 4 + 2, u0, v0); uv.setXY(f * 4 + 3, u1, v0);
  }
  uv.needsUpdate = true;
  return g;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function mesh(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
const lam = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));

/* -------------------------------------------------------------------------
   People (hero + civilians)
   ------------------------------------------------------------------------- */
const HERO_PAL = { skin: [236, 194, 156], hair: [52, 36, 26], eye: [60, 110, 160], jacket: [146, 100, 58], shirt: [238, 234, 224], pants: [234, 230, 218], strap: [72, 48, 30], boot: [60, 42, 30], cape: [40, 108, 64] };
export function buildPerson(pal = HERO_PAL, opts = {}) {
  const P = Object.assign({}, HERO_PAL, pal);
  const sk = new Skin(128, 32);
  const hb = sk.box(8, 8, 8), bb = sk.box(8, 12, 4), ab = sk.box(4, 12, 4), lb = sk.box(4, 12, 4), cb = sk.box(10, 15, 1);
  // head
  sk.allFaces(hb, P.skin, 0.06);
  sk.fill(hb.top, P.hair, 0.2);
  if (opts.buzz) {
    sk.fill(hb.back, P.hair, 0.3, (i, j) => j > 3 ? P.skin : null);
    sk.fill(hb.left, P.skin, 0.06, (i, j) => j < 2 ? P.hair : null);
    sk.fill(hb.right, P.skin, 0.06, (i, j) => j < 2 ? P.hair : null);
  } else {
    sk.fill(hb.back, P.hair, 0.2, (i, j) => j > (opts.longHair ? 7 : 6) ? P.skin : null);
    sk.fill(hb.left, P.skin, 0.06, (i, j) => (j < 3 || i > 5 || (j < 5 && i > 3) || (opts.longHair && i > 3)) ? P.hair : null);
    sk.fill(hb.right, P.skin, 0.06, (i, j) => (j < 3 || i < 2 || (j < 5 && i < 4) || (opts.longHair && i < 4)) ? P.hair : null);
  }
  {
    const [x, y] = hb.front;
    for (let i = 0; i < 8; i++) { sk.px(x + i, y, P.hair); if (!opts.buzz) sk.px(x + i, y + 1, P.hair, 0.9); }
    if (!opts.buzz) [0, 1, 6, 7].forEach(i => sk.px(x + i, y + 2, P.hair));
    if (opts.longHair) for (let j = 2; j < 7; j++) { sk.px(x, y + j, P.hair); sk.px(x + 7, y + j, P.hair); }
    sk.px(x + 1, y + 3, P.hair, 0.6); sk.px(x + 2, y + 3, P.hair, 0.6); sk.px(x + 5, y + 3, P.hair, 0.6); sk.px(x + 6, y + 3, P.hair, 0.6);
    sk.px(x + 1, y + 4, [250, 250, 250]); sk.px(x + 2, y + 4, P.eye); sk.px(x + 5, y + 4, P.eye); sk.px(x + 6, y + 4, [250, 250, 250]);
    if (opts.glasses) { for (const gx of [0, 1, 2, 5, 6, 7]) sk.px(x + gx, y + 3, [40, 36, 30]); sk.px(x + 3, y + 4, [40, 36, 30]); sk.px(x + 4, y + 4, [40, 36, 30]); sk.px(x, y + 4, [40, 36, 30]); sk.px(x + 7, y + 4, [40, 36, 30]); }
    sk.px(x + 3, y + 5, P.skin, 0.88); sk.px(x + 4, y + 5, P.skin, 0.88);
    sk.px(x + 3, y + 6, [150, 90, 80]); sk.px(x + 4, y + 6, [150, 90, 80]);
  }
  // torso
  const uniform = opts.uniform !== false;
  sk.allFaces(bb, P.shirt, 0.06, (k, i, j, w, h) => {
    if (!uniform) return j > 8 ? P.pants : (k === 'front' && (i === 3 || i === 4) && j < 3 ? P.skin : null);
    if (j >= 8 && j <= 9) return P.strap;
    if (j > 9) return P.pants;
    if (k === 'front') { if (i === 3 || i === 4) return (j < 2 ? P.skin : P.shirt); if (i === 2 || i === 5) return P.strap; return P.jacket; }
    if (k === 'back') { if ((i === 3 || i === 4) && j >= 2 && j <= 5) return [236, 232, 210]; if ((i === 2 || i === 5) && (j === 3 || j === 4)) return [236, 232, 210]; return P.jacket; }
    return P.jacket;
  });
  if (uniform) { const [x, y] = bb.front; sk.px(x + 3, y + 8, [214, 180, 70]); sk.px(x + 4, y + 8, [214, 180, 70]); }
  // arms / legs
  sk.allFaces(ab, uniform ? P.jacket : P.shirt, 0.08, (k, i, j) => j >= 10 ? P.skin : (j === 9 ? (uniform ? [100, 68, 40] : null) : (k === 'bottom' ? P.skin : null)));
  sk.allFaces(lb, P.pants, 0.06, (k, i, j) => {
    if (k === 'bottom') return [40, 30, 22];
    if (j >= 7) return j === 7 ? [92, 66, 44] : P.boot;
    if (uniform && (j === 2 || j === 5)) return P.strap;
    return null;
  });
  // cape
  sk.allFaces(cb, P.cape, 0.08, (k, i, j, w, h) => {
    if (k === 'back') {
      if (i === 0 || i === w - 1 || j === h - 1) return [P.cape[0] * 0.7, P.cape[1] * 0.7, P.cape[2] * 0.7];
      const cx = i - 4.5, cy = j - 6;
      if (Math.abs(cx) < 0.6 && cy > -3 && cy < 5) return [236, 232, 210];
      if ((Math.abs(cx) === 1.5 && (cy === -1 || cy === 1)) || (Math.abs(cx) === 2.5 && cy === 2) || (Math.abs(cx) === 0.5 && cy === -4)) return [236, 232, 210];
    }
    return null;
  });
  const tex = sk.texture();
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const root = new THREE.Group();
  const model = pivot(root, 0, 0, 0);           // animation offsets
  const body = pivot(model, 0, 12, 0);
  const torso = mesh(body, boxGeo(sk, bb), mat, 0, 6, 0);
  const neck = pivot(body, 0, 12, 0);
  const head = mesh(neck, boxGeo(sk, hb), mat, 0, 4, 0);
  const armR = pivot(body, -6, 11, 0), armL = pivot(body, 6, 11, 0);
  mesh(armR, boxGeo(sk, ab), mat, 0, -4, 0); mesh(armL, boxGeo(sk, ab), mat, 0, -4, 0);
  const legR = pivot(model, -2, 12, 0), legL = pivot(model, 2, 12, 0);
  mesh(legR, boxGeo(sk, lb), mat, 0, -6, 0); mesh(legL, boxGeo(sk, lb), mat, 0, -6, 0);
  const R = { root, model, body, torso, neck, head, armR, armL, legR, legL, mat, mats: [mat] };
  if (opts.cape !== false) {
    const capeP = pivot(body, 0, 11.8, -2.3);
    mesh(capeP, boxGeo(sk, cb), mat, 0, -7.5, -0.5);
    R.cape = capeP;
  }
  if (opts.gear) {
    const steel = lam(0x7a8088), dark = lam(0x3a3c42), silver = lam(0xc8ccd2), brass = lam(0xb08a3a);
    R.mats.push(steel, dark, silver, brass);
    const gear = pivot(body, 0, 0, 0);
    mesh(gear, new THREE.BoxGeometry(7, 2.2, 2.6), dark, 0, 2.2, -3.2);           // rear gear unit
    const cylG = new THREE.CylinderGeometry(1.25, 1.25, 8.5, 8);
    for (const s of [-1, 1]) {
      const c = mesh(gear, cylG, silver, s * 3.1, 3.2, -5.6); c.rotation.x = Math.PI / 2; c.rotation.z = s * 0.25;  // gas canisters
      mesh(gear, new THREE.BoxGeometry(0.6, 0.6, 1), brass, s * 3.1 + s * 1.0, 3.2, -1.6);
      const hol = pivot(gear, s * 5.3, 1.5, -1.2);                                    // blade holsters on the hips
      mesh(hol, new THREE.BoxGeometry(2.2, 4.4, 9), steel, 0, 0, 0);
      mesh(hol, new THREE.BoxGeometry(2.4, 0.8, 9.2), dark, 0, 1.8, 0);
      for (let k = 0; k < 4; k++) mesh(hol, new THREE.BoxGeometry(0.4, 3, 0.5), silver, s * 1.2, 0.6, -3 + k * 2);
      hol.rotation.x = 0.35;
      mesh(gear, new THREE.BoxGeometry(1.8, 1.8, 2.6), dark, s * 4.4, 1.0, 1.6);       // anchor launchers
    }
    // twin swords
    R.blades = [];
    for (const arm of [armR, armL]) {
      const grip = pivot(arm, 0, -10.5, 0.4);
      mesh(grip, new THREE.BoxGeometry(1.3, 1.3, 3.6), dark, 0, 0, 0);
      mesh(grip, new THREE.BoxGeometry(1.8, 1.8, 0.6), brass, 0, 0, 1.9);
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0xdfe6ee, emissive: 0x223038 });
      const blade = mesh(grip, new THREE.BoxGeometry(0.45, 1.5, 15), bladeMat, 0, 0.1, 9.6);
      grip.rotation.x = 1.25;
      R.blades.push({ grip, blade, mat: bladeMat });
      R.mats.push(bladeMat);
    }
    R.launchR = new THREE.Vector3(-4.4, 13, 2.5); R.launchL = new THREE.Vector3(4.4, 13, 2.5);
  }
  // accessories for named characters
  if (opts.scarf) { const sc = lam(opts.scarf); R.mats.push(sc); mesh(neck, new THREE.BoxGeometry(9, 2.4, 5.4), sc, 0, 0.6, 0); const tail = pivot(neck, 2.4, 0.4, -2.6); mesh(tail, new THREE.BoxGeometry(2, 6, 0.8), sc, 0, -3, 0); tail.rotation.x = 0.5; R.scarf = tail; }
  if (opts.cravat) { const cv = lam(0xf2f0ea); R.mats.push(cv); mesh(body, new THREE.BoxGeometry(3, 3, 1), cv, 0, 10.6, 2.3); }
  if (opts.bolo) { const bl = lam(0x2a5ab0, { emissive: 0x0a1a40 }); R.mats.push(bl); mesh(body, new THREE.BoxGeometry(1.4, 1.4, 0.6), bl, 0, 9.6, 2.3); }
  if (opts.hat) { const ht = lam(opts.hat); R.mats.push(ht); mesh(head, new THREE.BoxGeometry(13, 0.8, 13), ht, 0, 4.4, 0); mesh(head, new THREE.BoxGeometry(8.6, 3.4, 8.6), ht, 0, 6.2, 0); }
  if (opts.coat) { const ct = lam(0x26262c); R.mats.push(ct); const tails = pivot(body, 0, 2, -1.6); mesh(tails, new THREE.BoxGeometry(8.6, 9, 1), ct, 0, -4.5, 0); R.cape = tails; }
  if (opts.guns && R.blades) {
    // anti-personnel gear: twin single-shot pistols in place of the blades
    const gm = lam(0x2a2a30), wood = lam(0x6a4a2a), brass = lam(0xb08a3a);
    R.mats.push(gm, wood, brass);
    R.guns = [];
    for (const b of R.blades) {
      b.blade.visible = false;
      const barrel = mesh(b.grip, new THREE.BoxGeometry(1.1, 1.1, 7), gm, 0, 0.4, 4.6);
      mesh(b.grip, new THREE.BoxGeometry(1.4, 2.6, 1.6), wood, 0, -0.9, 1.0);
      mesh(b.grip, new THREE.BoxGeometry(1.5, 0.5, 0.5), brass, 0, 0.9, 7.6);
      R.guns.push({ grip: b.grip, barrel });
    }
    R.blades = [];
  }
  if (opts.flag) {
    const pole = pivot(armR, 0, -10, 0);
    mesh(pole, new THREE.BoxGeometry(0.6, 14, 0.6), lam(0x6b4a2a), 0, 6, 0);
    const fl = mesh(pole, new THREE.BoxGeometry(0.3, 4, 6), lam(0x2fa04a, { emissive: 0x0a3010 }), 0, 11, 3);
    R.flag = fl;
  }
  return R;
}

/* -------------------------------------------------------------------------
   Titans
   ------------------------------------------------------------------------- */
export const TITAN_TYPES = {
  runt:     { height: 4.6, head: 10, tw: 9, th: 10, td: 6, aw: 3, ua: 5, fa: 5, lw: 3, tl: 4, sl: 4, belly: 1, speed: 3.0, label: 'Runt' },
  strider:  { height: 8.2, head: 8, tw: 8, th: 12, td: 5, aw: 3, ua: 7, fa: 7, lw: 3, tl: 7, sl: 7, belly: 0, speed: 3.6, label: 'Strider' },
  brute:    { height: 15, head: 8, tw: 11, th: 13, td: 6, aw: 4, ua: 7, fa: 7, lw: 4, tl: 7, sl: 7, belly: 0, speed: 4.4, label: 'Brute' },
  abnormal: { height: 9.5, head: 7, tw: 7, th: 11, td: 4, aw: 2, ua: 9, fa: 9, lw: 2, tl: 9, sl: 9, belly: 0, speed: 9.5, label: 'Leaper' },
  boss:     { height: 24, head: 8, tw: 12, th: 13, td: 7, aw: 4, ua: 7, fa: 7, lw: 5, tl: 7, sl: 7, belly: 0, speed: 3.4, label: 'The Bastion' },
  dummy:    { height: 8, head: 8, tw: 8, th: 12, td: 5, aw: 3, ua: 7, fa: 7, lw: 3, tl: 7, sl: 7, belly: 0, speed: 0, label: 'Training Dummy' },
  // ---- shifter titans (playable). napeHP = deep cuts needed; wind = attack wind-up factor; reach = swipe reach factor
  beast:    { height: 17, head: 8, tw: 11, th: 14, td: 6, aw: 4, ua: 11, fa: 11, lw: 4, tl: 6, sl: 6, belly: 1, speed: 3.6, label: 'Hurler Titan', style: 'fur', napeHP: 2, swipe: 32, reach: 1.3, wind: 1.0, shifter: true },
  armored:  { height: 15, head: 8, tw: 10, th: 13, td: 6, aw: 4, ua: 7, fa: 7, lw: 4, tl: 7, sl: 7, belly: 0, speed: 4.8, label: 'Ironclad Titan', style: 'armor', napeHP: 3, swipe: 30, reach: 1.05, wind: 0.9, shifter: true },
  colossal: { height: 34, head: 8, tw: 12, th: 14, td: 7, aw: 4, ua: 8, fa: 8, lw: 5, tl: 8, sl: 8, belly: 0, speed: 2.6, label: 'Behemoth Titan', style: 'muscle', napeHP: 3, swipe: 45, reach: 1.15, wind: 1.3, shifter: true },
  female:   { height: 14, head: 7, tw: 7, th: 12, td: 4, aw: 3, ua: 8, fa: 8, lw: 3, tl: 9, sl: 9, belly: 0, speed: 6.6, label: 'Huntress Titan', style: 'female', napeHP: 2, swipe: 28, reach: 1.1, wind: 0.68, shifter: true },
  jaw:      { height: 5.8, head: 8, tw: 7, th: 7, td: 5, aw: 3, ua: 6, fa: 7, lw: 3, tl: 4, sl: 4, belly: 0, speed: 9.5, label: 'Fang Titan', style: 'jaw', napeHP: 1, swipe: 26, reach: 1.25, wind: 0.5, shifter: true },
  attack:   { height: 15, head: 8, tw: 9, th: 13, td: 5, aw: 3, ua: 8, fa: 8, lw: 3, tl: 8, sl: 8, belly: 0, speed: 5.2, label: 'Fury Titan', style: 'attack', napeHP: 2, swipe: 32, reach: 1.1, wind: 0.72, shifter: true }
};
const SKIN_TONES = [[222, 168, 140], [200, 142, 112], [236, 190, 166], [178, 120, 92], [214, 160, 150], [190, 150, 120]];
const HAIRS = [[40, 30, 24], [96, 64, 34], [24, 22, 22], [150, 120, 70], [120, 40, 30], null];
function paintTitanSkin(T, type, rng) {
  const sk = new Skin(128, 64);
  const boxes = {
    head: sk.box(T.head, T.head, T.head), torso: sk.box(T.tw, T.th, T.td), neck: sk.box(4, 2, 4),
    ua: sk.box(T.aw, T.ua, T.aw), fa: sk.box(T.aw, T.fa, T.aw), tl: sk.box(T.lw, T.tl, T.lw), sl: sk.box(T.lw, T.sl, T.lw)
  };
  const wood = type === 'dummy', boss = type === 'boss', ab = type === 'abnormal', st = T.style || '';
  const STYLE_SKIN = { fur: [128, 104, 84], armor: [196, 150, 124], muscle: [178, 62, 52], female: [226, 196, 178], jaw: [150, 112, 96], attack: [204, 150, 120] };
  const STYLE_HAIR = { fur: [96, 78, 60], armor: [210, 178, 110], muscle: null, female: [236, 210, 140], jaw: [26, 22, 20], attack: [44, 32, 24] };
  const skin = wood ? [176, 136, 84] : boss ? [150, 96, 84] : st ? STYLE_SKIN[st] : SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
  const dk = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const hair = wood ? null : boss ? null : st ? STYLE_HAIR[st] : ab ? [30, 26, 24] : HAIRS[Math.floor(rng() * HAIRS.length)];
  const fur = st === 'fur', muscle = st === 'muscle';
  const furFn = (S) => (f, i, j) => ((i * 5 + j * 3 + (i * j) % 4) % 5 === 0 ? dk(S, 0.72) : (i + j * 2) % 7 === 0 ? dk(S, 1.12) : null);
  const muscleFn = (S) => (f, i, j, w, h) => (j % 3 === 0 && (i + j) % 4 !== 0 ? [236, 214, 200] : (i % 4 === 0 ? dk(S, 0.78) : null));
  const S = skin;
  const woodFn = wood ? (k, i, j) => (j % 4 === 3 ? dk(S, 0.75) : null) : null;
  // body parts
  for (const k of ['ua', 'fa', 'tl', 'sl', 'neck']) sk.allFaces(boxes[k], S, wood ? 0.12 : 0.07, woodFn || ((f, i, j, w, h) => {
    if (fur && !(k === 'fa' && j >= h - 2)) return furFn(S)(f, i, j);
    if (muscle) return muscleFn(S)(f, i, j, w, h);
    if (st === 'jaw' && k === 'fa' && j >= h - 2) return [236, 232, 220];   // bone claws
    if (st === 'armor' && (k === 'ua' || k === 'tl') && (i + j) % 3 === 0) return [226, 232, 240];
    if (k === 'fa' && j >= h - 2) return dk(S, 0.9);         // hands
    if (k === 'sl' && j >= h - 1) return dk(S, 0.85);        // feet
    if (k === 'sl' && f === 'front' && j === h - 1 && i % 2 === 0) return dk(S, 0.72);
    if (boss && (f === 'front' || f === 'left' || f === 'right') && ((i * 7 + j * 3) % 11 === 0)) return dk(S, 0.75);
    return null;
  }));
  // neck: the nape (back) is the weak spot
  sk.fill(boxes.neck.back, wood ? [200, 40, 40] : dk(S, 0.86), 0.05, wood ? (i, j) => ((i === 1 || i === 2) ? [240, 240, 240] : null) : null);
  // torso
  sk.allFaces(boxes.torso, S, 0.07, woodFn || (fur ? furFn(S) : null) || (muscle ? (f, i, j, w, h) => (f === 'front' && j > 2 && j < h - 2 && Math.abs(i + 0.5 - w / 2) > 1 && (j % 2 === 0) ? [236, 214, 200] : muscleFn(S)(f, i, j, w, h)) : null) || ((f, i, j, w, h) => {
    if (f === 'front') {
      const c = w / 2;
      if (j === 3 && Math.abs(i + 0.5 - c) > 0.6) return dk(S, 0.82);                      // pecs
      if (j > 4 && j < h - 3 && (Math.abs(i + 0.5 - c) < 0.6 || (j - 5) % 2 === 1) && Math.abs(i + 0.5 - c) < 2.6) return dk(S, 0.88); // abs
      if (j >= h - 2) return dk(S, 0.8);
      if (T.belly && j > 5 && Math.abs(i + 0.5 - c) < 3) return dk(S, 1.05);
    }
    if (f === 'back' && Math.abs(i + 0.5 - w / 2) < 0.6 && j > 1) return dk(S, 0.86);    // spine
    if (j >= h - 2) return dk(S, 0.82);
    return null;
  }));
  if (wood) { // target painted on the dummy's back
    const [x, y, w] = boxes.torso.back; for (let i = 0; i < w; i++) sk.px(x + i, y, [200, 40, 40]);
  }
  // head
  const hb = boxes.head, H = T.head;
  sk.allFaces(hb, S, 0.06, woodFn);
  if (hair) {
    sk.fill(hb.top, hair, 0.2);
    sk.fill(hb.back, hair, 0.2, (i, j) => j > H - 3 ? S : null);
    sk.fill(hb.left, S, 0.06, (i, j) => (j < 3 || i > H - 3) ? hair : null);
    sk.fill(hb.right, S, 0.06, (i, j) => (j < 3 || i < 2) ? hair : null);
  }
  {
    const [x, y] = hb.front, c = Math.floor(H / 2);
    if (hair) for (let i = 0; i < H; i++) { sk.px(x + i, y, hair); if (i < 2 || i > H - 3 || rng() < 0.4) sk.px(x + i, y + 1, hair); }
    const ey = Math.floor(H * 0.42), my = Math.floor(H * 0.72);
    const white = [245, 242, 230], pupil = boss ? [255, 140, 40] : ab ? [20, 20, 20] : [40, 40, 50];
    if (wood) {
      // painted target face
      sk.px(x + c - 2, y + ey, [40, 30, 20]); sk.px(x + c + 1, y + ey, [40, 30, 20]);
      for (let i = c - 2; i <= c + 1; i++) sk.px(x + i, y + my, [40, 30, 20]);
    } else if (muscle || st === 'attack' || st === 'jaw') {
      // lipless grin: a full row of teeth, deep-set glowing eyes
      const eyeC = muscle ? [255, 240, 200] : st === 'jaw' ? [250, 230, 120] : [120, 220, 150];
      sk.px(x + c - 2, y + ey, eyeC); sk.px(x + c + 1, y + ey, eyeC); sk.px(x + c - 3, y + ey, dk(S, 0.5)); sk.px(x + c + 2, y + ey, dk(S, 0.5));
      for (let i = 1; i < H - 1; i++) { sk.px(x + i, y + my, [244, 240, 226]); sk.px(x + i, y + my + 1, i % 2 ? [244, 240, 226] : [70, 20, 20]); sk.px(x + i, y + my - 1, i % 2 ? [244, 240, 226] : dk(S, 0.6)); }
      if (st === 'jaw') for (let j = my - 1; j < H; j++) for (let i = 0; i < H; i++) if (j > my + 1 || i < 1 || i > H - 2) sk.px(x + i, y + j, [236, 232, 220]);
    } else if (ab) {
      for (const ex of [c - 3, c + 1]) { sk.px(x + ex, y + ey, white); sk.px(x + ex + 1, y + ey, white); sk.px(x + ex, y + ey + 1, white); sk.px(x + ex + 1, y + ey + 1, pupil); }
      for (let i = 1; i < H - 1; i++) { sk.px(x + i, y + my, [70, 30, 30]); if (i % 2) sk.px(x + i, y + my + 1, white); else sk.px(x + i, y + my - 1, white); }
    } else {
      sk.px(x + c - 3, y + ey - 1, dk(S, 0.7)); sk.px(x + c - 2, y + ey - 1, dk(S, 0.7)); sk.px(x + c + 1, y + ey - 1, dk(S, 0.7)); sk.px(x + c + 2, y + ey - 1, dk(S, 0.7));
      sk.px(x + c - 3, y + ey, white); sk.px(x + c - 2, y + ey, pupil); sk.px(x + c + 1, y + ey, pupil); sk.px(x + c + 2, y + ey, white);
      sk.px(x + c - 1, y + ey + 1, dk(S, 0.85)); sk.px(x + c, y + ey + 2, dk(S, 0.8));
      // wide toothy grin
      const mw = Math.max(4, H - 3), m0 = Math.floor((H - mw) / 2);
      for (let i = m0; i < m0 + mw; i++) { sk.px(x + i, y + my, (i - m0) % 2 ? [236, 232, 214] : [250, 248, 236]); sk.px(x + i, y + my - 1, dk(S, 0.75)); }
      sk.px(x + m0 - 1, y + my - 1, dk(S, 0.7)); sk.px(x + m0 + mw, y + my - 1, dk(S, 0.7));
      if (rng() < 0.5) for (let i = m0 + 1; i < m0 + mw - 1; i++) sk.px(x + i, y + my + 1, [90, 40, 40]);
    }
  }
  return { sk, boxes, tex: sk.texture() };
}

export function buildTitan(type, rng = Math.random) {
  if (!rng) rng = Math.random;
  const T = TITAN_TYPES[type];
  const { sk, boxes, tex } = paintTitanSkin(T, type, rng);
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x000000 });
  const root = new THREE.Group();
  const total = T.tl + T.sl + T.th + 2 + T.head;
  const scale = T.height / total;
  const model = pivot(root, 0, 0, 0);
  model.scale.setScalar(scale);
  const hipY = T.tl + T.sl;
  const hips = pivot(model, 0, hipY, 0);
  const torso = pivot(hips, 0, 0, 0);
  mesh(torso, boxGeo(sk, boxes.torso), mat, 0, T.th / 2, 0);
  const neck = pivot(torso, 0, T.th, T.td * 0.1);
  mesh(neck, boxGeo(sk, boxes.neck), mat, 0, 1, -0.2);
  const head = pivot(neck, 0, 2, 0);
  mesh(head, boxGeo(sk, boxes.head), mat, 0, T.head / 2, T.head * 0.06);
  const arm = (s) => {
    const sh = pivot(torso, s * (T.tw / 2 + T.aw / 2), T.th - T.aw / 2, 0);
    mesh(sh, boxGeo(sk, boxes.ua), mat, 0, -T.ua / 2 + T.aw / 2, 0);
    const el = pivot(sh, 0, -T.ua + T.aw / 2, 0);
    mesh(el, boxGeo(sk, boxes.fa), mat, 0, -T.fa / 2, 0);
    return { sh, el };
  };
  const leg = (s) => {
    const hp = pivot(hips, s * (T.tw / 2 - T.lw / 2 - (T.tw > 9 ? 0.5 : 0)), 0, 0);
    mesh(hp, boxGeo(sk, boxes.tl), mat, 0, -T.tl / 2, 0);
    const kn = pivot(hp, 0, -T.tl, 0);
    mesh(kn, boxGeo(sk, boxes.sl), mat, 0, -T.sl / 2, 0);
    return { hp, kn };
  };
  const aR = arm(-1), aL = arm(1), lR = leg(-1), lL = leg(1);
  const R = { type, T, root, model, scale, hips, torso, neck, head, shR: aR.sh, elR: aR.el, shL: aL.sh, elL: aL.el, hpR: lR.hp, knR: lR.kn, hpL: lL.hp, knL: lL.kn, mats: [mat], mat };
  // hitboxes: [name, bone, cx, cy, cz, hx, hy, hz]
  R.hit = [
    ['nape', neck, 0, 1.6, -2.6, 2.6, 2.4, 1.6],
    ['head', head, 0, T.head / 2, 0, T.head / 2, T.head / 2, T.head / 2],
    ['torso', torso, 0, T.th / 2, 0, T.tw / 2, T.th / 2, T.td / 2],
    ['armR', aR.sh, 0, -T.ua / 2 + T.aw / 2, 0, T.aw / 2 + 0.3, T.ua / 2, T.aw / 2 + 0.3],
    ['armR', aR.el, 0, -T.fa / 2, 0, T.aw / 2 + 0.3, T.fa / 2, T.aw / 2 + 0.3],
    ['armL', aL.sh, 0, -T.ua / 2 + T.aw / 2, 0, T.aw / 2 + 0.3, T.ua / 2, T.aw / 2 + 0.3],
    ['armL', aL.el, 0, -T.fa / 2, 0, T.aw / 2 + 0.3, T.fa / 2, T.aw / 2 + 0.3],
    ['legR', lR.hp, 0, -T.tl / 2, 0, T.lw / 2, T.tl / 2, T.lw / 2],
    ['ankleR', lR.kn, 0, -T.sl / 2, 0, T.lw / 2 + 0.4, T.sl / 2, T.lw / 2 + 0.4],
    ['legL', lL.hp, 0, -T.tl / 2, 0, T.lw / 2, T.tl / 2, T.lw / 2],
    ['ankleL', lL.kn, 0, -T.sl / 2, 0, T.lw / 2 + 0.4, T.sl / 2, T.lw / 2 + 0.4]
  ];
  if (T.style === 'armor') {
    const crystal = new THREE.MeshLambertMaterial({ map: crystalTex(), color: 0xe8e0d2, emissive: 0x1a1810 });
    R.mats.push(crystal); R.armor = [];
    const plate = (bone, x, y, z, w, h, d, name) => { const m = mesh(bone, new THREE.BoxGeometry(w, h, d), crystal, x, y, z); m.userData.name = name; R.armor.push(m); return m; };
    plate(torso, 0, T.th * 0.62, T.td / 2 + 0.4, T.tw + 0.6, T.th * 0.66, 1.2, 'chest');
    plate(torso, 0, T.th * 0.6, -T.td / 2 - 0.4, T.tw + 0.6, T.th * 0.7, 1.2, 'back');
    plate(head, 0, T.head * 0.86, 0, T.head + 0.6, T.head * 0.34, T.head + 0.6, 'helm');
    plate(head, 0, T.head * 0.42, T.head / 2 + 0.3, T.head + 0.4, T.head * 0.28, 0.8, 'visor');
    R.napePlate = plate(neck, 0, 1.4, -2.7, 4.8, 3.6, 1.2, 'nape');
    for (const a of [aR, aL]) { plate(a.sh, 0, 0, 0, T.aw + 1.6, T.aw + 1, T.aw + 1.6, 'pauldron'); plate(a.el, 0, -T.fa / 2, 0, T.aw + 0.8, T.fa * 0.7, T.aw + 0.8, 'bracer'); }
    for (const l of [lR, lL]) plate(l.hp, 0, -T.tl * 0.5, 0.3, T.lw + 0.8, T.tl * 0.8, T.lw + 0.8, 'cuisse');
  }
  if (T.style === 'female' || T.style === 'attack' || T.style === 'fur') {
    // hair: a bun for the Huntress, a shaggy mane for the Hurler and the Fury titan
    const hcol = new THREE.MeshLambertMaterial({ color: T.style === 'female' ? 0xecd28c : T.style === 'fur' ? 0x6a5640 : 0x2c2018 });
    R.mats.push(hcol);
    if (T.style === 'female') mesh(head, new THREE.BoxGeometry(3, 3, 3), hcol, 0, T.head * 0.75, -T.head / 2 - 1);
    else mesh(head, new THREE.BoxGeometry(T.head + 1.2, T.head * 0.7, 2.4), hcol, 0, T.head * 0.55, -T.head / 2 - 0.6);
    if (T.style === 'fur') mesh(torso, new THREE.BoxGeometry(T.tw + 1, 4, T.td + 1.4), hcol, 0, T.th - 1.5, 0);
  }
  if (type === 'boss') {
    const crystal = new THREE.MeshLambertMaterial({ map: crystalTex(), color: 0xdfe9f5, emissive: 0x1a2430 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    R.mats.push(crystal);
    R.armor = [];
    const plate = (bone, x, y, z, w, h, d, name) => { const m = mesh(bone, new THREE.BoxGeometry(w, h, d), crystal, x, y, z); m.userData.name = name; R.armor.push(m); return m; };
    plate(torso, 0, T.th * 0.62, T.td / 2 + 0.4, T.tw + 0.6, T.th * 0.62, 1.2, 'chest');
    plate(torso, 0, T.th * 0.6, -T.td / 2 - 0.4, T.tw + 0.6, T.th * 0.7, 1.2, 'back');
    plate(head, 0, T.head * 0.82, 0, T.head + 0.8, T.head * 0.4, T.head + 0.8, 'helm');
    plate(head, 0, T.head * 0.5, -T.head / 2 - 0.4, T.head + 0.8, T.head * 0.8, 1, 'helmback');
    R.napePlate = plate(neck, 0, 1.4, -2.7, 4.8, 3.6, 1.2, 'nape');
    for (const a of [aR, aL]) { plate(a.sh, 0, 0, 0, T.aw + 1.6, T.aw + 1, T.aw + 1.6, 'pauldron'); plate(a.el, 0, -T.fa / 2, 0, T.aw + 0.8, T.fa * 0.7, T.aw + 0.8, 'bracer'); }
    for (const l of [lR, lL]) plate(l.kn, 0, -T.sl * 0.55, 0.3, T.lw + 0.8, T.sl * 0.7, T.lw + 0.8, 'greave');
    R.kneeGlow = [lR, lL].map(l => { const m = mesh(l.kn, new THREE.BoxGeometry(T.lw + 0.3, 1.6, T.lw + 0.3), glow, 0, -0.4, 0); return m; });
    R.glowMat = glow;
  }
  return R;
}
function crystalTex() {
  const sk = new Skin(16, 16), b = [0, 0, 16, 16];
  sk.fill(b, [220, 232, 245], 0.08, (i, j) => ((i + j) % 7 === 0 || (i - j + 16) % 9 === 0) ? [170, 190, 215] : (i < 1 || j < 1) ? [245, 250, 255] : null);
  const t = sk.texture(); return t;
}

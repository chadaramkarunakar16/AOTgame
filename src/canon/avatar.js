/* =========================================================================
   ScoutAvatar: the visible body of a scout that this client does not fly itself
   (other players, and bots). Driven by a plain state object with the same field
   names as the local player, so remote snapshots and bot simulation share it.
   ========================================================================= */
import { THREE, scene, camera } from './engine.js';
import { buildPerson } from './models.js';
import { Cable, Trail, makeShadow, placeShadow } from './fx.js';
import { charLook, FACTIONS } from './characters.js';
import { G } from './state.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const hx = new THREE.Vector3(), hy = new THREE.Vector3(), hz = new THREE.Vector3(), hBasis = new THREE.Matrix4(), hq = new THREE.Quaternion();
const HERO_S = 1.8 / 32;

export const ANCHOR_STATES = ['idle', 'fly', 'attached', 'retract', 'miss'];

function tagTexture(name, color, hp, ally) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 26px Oswald, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(name, 128, 22);
  g.fillStyle = color; g.fillText(name, 128, 22);
  if (ally && hp !== null) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(68, 44, 120, 10);
    g.fillStyle = hp > 50 ? '#7dffb0' : hp > 25 ? '#ffd36a' : '#ff6a55'; g.fillRect(70, 46, 116 * Math.max(0, hp) / 100, 6);
  }
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return t;
}

export class ScoutAvatar {
  constructor(opts) {
    this.charId = opts.char || 'recruit'; this.faction = opts.faction || 'corps'; this.name = opts.name || 'Scout';
    const { pal, opts: o } = charLook(this.charId);
    this.R = buildPerson(pal, o);
    this.R.root.scale.setScalar(HERO_S); this.R.model.position.y = -15;
    scene.add(this.R.root);
    this.cables = [new Cable(), new Cable()];
    this.trails = [new Trail([0.75, 0.9, 1]), new Trail([0.75, 0.9, 1])];
    this.shadow = makeShadow();
    this.lastFace = new THREE.Vector3(0, 0, -1);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.tag.renderOrder = 25; scene.add(this.tag);
    this.tagKey = '';
    this.flash = 0;
  }
  setTag(ally, hp) {
    const color = ally ? (FACTIONS[this.faction] ? FACTIONS[this.faction].color : '#fff') : '#ff7a6a';
    const key = `${this.name}|${color}|${ally ? Math.round(hp / 5) : ''}`;
    if (key === this.tagKey) return;
    this.tagKey = key;
    if (this.tag.material.map) this.tag.material.map.dispose();
    this.tag.material.map = tagTexture(this.name, color, ally ? hp : null, ally);
    this.tag.material.depthTest = !ally; this.tag.material.needsUpdate = true;
  }
  dispose() {
    scene.remove(this.R.root); scene.remove(this.tag); scene.remove(this.shadow);
    for (const c of this.cables) { c.hide(); scene.remove(c.mesh); scene.remove(c.hook); }
    for (const t of this.trails) scene.remove(t.mesh);
  }
  launchPoint(i, out) { return this.R.model.localToWorld(out.copy(i === 0 ? this.R.launchL : this.R.launchR)); }
  // S: { pos, vel, yaw, pitch, onGround, alive, deadT, grabbed, hitT, anchors:[{state,pos}], slashT, spinT, slashSide, swapT, sharp, reeling, boosting, aimT, hp }
  update(S, dt, ally) {
    const R = this.R, t = G.time, speed = S.vel.length();
    const visible = !S.hidden;
    R.root.visible = visible; this.tag.visible = visible && S.alive;
    if (!visible) { for (const c of this.cables) c.hide(); this.shadow.visible = false; return; }
    R.root.position.copy(S.pos); R.root.position.y += 0.85;
    const att = S.anchors.filter(a => a.state === 'attached');
    hy.set(0, 1, 0);
    if (S.alive && !S.grabbed) {
      if (att.length) { _a.set(0, 0, 0); for (const a of att) _a.add(_b.subVectors(a.pos, S.pos).normalize()); hy.lerp(_a.normalize(), 0.8).normalize(); }
      else if (!S.onGround && speed > 12) { _a.copy(S.vel).normalize(); hy.lerp(_a, Math.min(0.85, (speed - 12) / 22)).normalize(); }
    }
    const hv = Math.hypot(S.vel.x, S.vel.z);
    if (hv > 1.2 || !S.onGround) { if (speed > 0.5) this.lastFace.copy(S.vel).normalize(); }
    if (S.onGround && hv < 1.2) this.lastFace.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    if (S.slashT >= 0 || S.spinT >= 0 || S.aimT > 0) this.lastFace.set(-Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), -Math.cos(S.yaw) * Math.cos(S.pitch));
    hz.copy(this.lastFace).addScaledVector(hy, -this.lastFace.dot(hy));
    if (hz.lengthSq() < 0.001) hz.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    hz.normalize(); hx.crossVectors(hy, hz).normalize(); hz.crossVectors(hx, hy).normalize();
    hBasis.makeBasis(hx, hy, hz); hq.setFromRotationMatrix(hBasis);
    if (!S.alive) { const f = Math.min(1, (S.deadT || 0) * 1.5); _q.setFromAxisAngle(hx, -1.45 * f); hq.premultiply(_q); }
    R.root.quaternion.slerp(hq, 1 - Math.exp(-dt * (S.alive ? 10 : 3)));
    R.model.rotation.y = S.spinT >= 0 ? (S.spinT / 0.6) * Math.PI * 4 : 0;
    const set = (o, x, y, z, k = 14) => { o.rotation.x += (x - o.rotation.x) * Math.min(1, dt * k); o.rotation.y += (y - o.rotation.y) * Math.min(1, dt * k); o.rotation.z += (z - o.rotation.z) * Math.min(1, dt * k); };
    let lR = 0, lL = 0, aR = [0.1, 0, -0.08], aL = [0.1, 0, 0.08], bodyX = 0, headX = 0;
    if (!S.alive) { aR = [-2.6, 0, -0.4]; aL = [-2.6, 0, 0.4]; lR = 0.2; lL = -0.1; }
    else if (S.grabbed) { aR = [0, 0, -0.15]; aL = [0, 0, 0.15]; lR = Math.sin(t * 12) * 0.5; lL = -Math.sin(t * 12) * 0.5; headX = -0.3; }
    else if (S.onGround && !att.length) {
      if (hv > 1) { const ph = (this.runPh = (this.runPh || 0) + hv * dt * 1.25); const sw = Math.sin(ph * 2.6) * Math.min(1, hv / 8); lR = sw; lL = -sw; aR = [-sw * 0.8 + 0.2, 0, -0.1]; aL = [sw * 0.8 + 0.2, 0, 0.1]; bodyX = 0.18 * Math.min(1, hv / 8); }
      else { const b = Math.sin(t * 2) * 0.04; aR = [0.15 + b, 0, -0.12]; aL = [0.15 + b, 0, 0.12]; }
    } else {
      lR = 0.35 + Math.sin(t * 9) * 0.06; lL = 0.55 - Math.sin(t * 9) * 0.06;
      aR = [0.9, 0, -0.35]; aL = [0.9, 0, 0.35]; bodyX = 0.1;
      if (S.reeling) { lR = -0.6; lL = -0.4; }
    }
    if (S.hitT > 0) { bodyX -= 0.5 * S.hitT; aR = [-1.2, 0, -0.8]; aL = [-1.2, 0, 0.8]; }
    let twist = 0;
    if (S.drawn) { aR = [-2.75, 0, -0.75]; aL = [-2.75, 0, 0.75]; bodyX = -0.25; lR = 0.7; lL = 0.25; }
    if (S.slashT >= 0) {
      const f = Math.min(1, S.slashT / 0.17), e = 1 - Math.pow(1 - f, 3), s = S.slashSide ? 1 : -1;
      aR = [-1.6, 0, -0.3 - 0.4 * e]; aL = [-1.6, 0, 0.3 + 0.4 * e]; twist = s * (1.35 - 2.7 * e); bodyX = 0.3 * e;
    }
    if (S.aimT > 0) { const p = -Math.PI / 2 - S.pitch; aR = [p, 0, -0.1]; aL = [p, 0, 0.1]; }
    if (S.spinT >= 0) { aR = [-1.5, 0, -1.4]; aL = [-1.5, 0, 1.4]; lR = 0.3; lL = 0.3; }
    if (S.swapT > 0) { const f = S.swapT / 0.65; aR = [0.6 + Math.sin(f * Math.PI) * 0.8, 0, -0.5]; aL = [0.6 + Math.sin(f * Math.PI) * 0.8, 0, 0.5]; }
    set(R.legR, lR, 0, 0); set(R.legL, lL, 0, 0); set(R.body, bodyX, twist, 0, S.slashT >= 0 ? 45 : 10); set(R.neck, headX, -twist * 0.4, 0);
    const fast = S.slashT >= 0 || S.spinT >= 0 || S.drawn ? 45 : 14;
    for (const [arm, pose, side] of [[R.armR, aR, 1], [R.armL, aL, 0]]) {
      const a = S.anchors[side];
      if (a && a.state === 'attached' && S.slashT < 0 && S.spinT < 0 && !S.drawn && !(S.aimT > 0) && S.alive && !S.grabbed) {
        R.root.updateMatrixWorld(true);
        _a.copy(a.pos); arm.parent.worldToLocal(_a); _a.sub(arm.position).normalize();
        _q.setFromUnitVectors(DOWN, _a); arm.quaternion.slerp(_q, Math.min(1, dt * 12));
      } else set(arm, pose[0], pose[1], pose[2], fast);
    }
    if (R.cape) {
      const flap = Math.min(1.35, 0.12 + speed * 0.028) + Math.sin(t * (10 + speed * 0.4)) * 0.07 * Math.min(1, speed / 15);
      set(R.cape, S.onGround && hv < 1 ? 0.06 : flap, 0, Math.sin(t * 7) * 0.05 * Math.min(1, speed / 20), 10);
    }
    if (R.scarf) set(R.scarf, 0.5 + Math.min(1.2, speed * 0.03), 0, Math.sin(t * 8) * 0.1, 10);
    for (const b of R.blades) {
      const s = (S.sharp ?? 100) / 100;
      b.mat.color.setRGB(0.55 + 0.35 * s, 0.58 + 0.34 * s, 0.6 + 0.33 * s);
      b.blade.scale.z = S.sharp > 0 ? 1 : 0.25; b.blade.position.z = S.sharp > 0 ? 9.6 : 3.6;
    }
    R.root.updateMatrixWorld(true);
    // cables
    for (let i = 0; i < 2; i++) {
      const a = S.anchors[i], c = this.cables[i];
      if (!a || a.state === 'idle' || !S.alive) { c.hide(); continue; }
      const lp = this.launchPoint(i, _a);
      c.set(lp, a.pos, a.state === 'attached' ? 0.3 : a.state === 'retract' ? 0.4 : 0.15, t);
    }
    // sword trails
    const on = S.slashT >= 0 || S.spinT >= 0 || S.drawn || (speed > 32 && !S.onGround);
    R.blades.forEach((b, i) => {
      const base = b.blade.localToWorld(_a.set(0, 0, -6)), tip = b.blade.localToWorld(_b.set(0, 0, 7.5));
      this.trails[i].push(base, tip, on && S.sharp > 0 && S.alive);
    });
    placeShadow(this.shadow, S.pos.x, S.pos.y, S.pos.z, 1.1, 40);
    // name tag
    this.setTag(ally, S.hp ?? 100);
    this.tag.position.set(S.pos.x, S.pos.y + 2.55, S.pos.z);
    const d = camera.position.distanceTo(this.tag.position), sc = Math.max(1.1, d * 0.032);
    this.tag.scale.set(sc * 2, sc * 0.5, 1);
    this.tag.material.opacity = d > 160 ? Math.max(0, 1 - (d - 160) / 60) : 1;
  }
}

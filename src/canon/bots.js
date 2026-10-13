/* =========================================================================
   Scouts that this client does not fly with the mouse:
   - BotScout: host-run AI (Skyward Legion blades or Interior Squad guns).
     Assisted flight: velocity steering with wall avoidance; anchors fire at
     real blocks along the path, so it reads like Vector Gear swinging.
   - RemoteScout: another player's scout, interpolated from snapshots.
   Both expose the same fields titans and the HUD read (pos, vel, alive, ...).
   ========================================================================= */
import { THREE, getBlock, SOLID, CROSS, B, chunkReady } from './engine.js';
import { G } from './state.js';
import { Sfx } from './audio.js';
import { ScoutAvatar, ANCHOR_STATES } from './avatar.js';
import { sphereTitanParts, titanThreats } from './titans.js';
import { charStats } from './characters.js';
import { gasPuff, sparkBurst, steamBurst } from './fx.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const PW = 0.3, PH = 1.8, GRAV = 26;
const rnd = (a, b) => a + Math.random() * (b - a);

export function rayVoxel(o, d, maxD) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = d.x ? (d.x > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
  let ty = d.y ? (d.y > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
  let tz = d.z ? (d.z > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
  let t = 0, nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < 300 && t <= maxD; i++) {
    const id = getBlock(x, y, z);
    if (id && id !== B.WATER && !CROSS[id]) return { x, y, z, id, t, nx, ny, nz };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}
function collides(x0, y0, z0, x1, y1, z1) {
  for (let y = Math.floor(y0); y <= Math.floor(y1); y++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++)
    if (SOLID[getBlock(x, y, z)]) return true;
  return false;
}
function moveAxis(p, axis, d) {
  p[axis] += d;
  const b = [p.x - PW, p.y, p.z - PW, p.x + PW, p.y + PH, p.z + PW];
  if (!collides(...b)) return false;
  if (axis === 'y') { if (d < 0) p.y = Math.floor(b[1]) + 1; else p.y = Math.floor(b[4]) - PH - 0.001; }
  else if (axis === 'x') { if (d > 0) p.x = Math.floor(b[3]) - PW - 0.001; else p.x = Math.floor(b[0]) + 1 + PW + 0.001; }
  else { if (d > 0) p.z = Math.floor(b[5]) - PW - 0.001; else p.z = Math.floor(b[2]) + 1 + PW + 0.001; }
  return true;
}
function napeApproach(t, out) {
  // a point behind and a little above the nape
  const f = t.fwd; t.napeWorld(out);
  out.x -= f.x * (1.6 + t.h * 0.06); out.z -= f.z * (1.6 + t.h * 0.06); out.y += 0.6 + t.h * 0.03;
  return out;
}
const breach = () => !!(G.mp && G.mp.active && G.mp.match && G.mp.match.mode === 'breach');
// the Ironclad's plates turn blades until its knees are cut, so bots go low first
const kneeFirst = (t) => t.type === 'armored' && t.state !== 'crippled' && t.state !== 'rise' && t.m && t.m.knL;
function kneeOf(t, bot, out) {
  const side = (bot.id.charCodeAt(bot.id.length - 3) || 0) & 1;
  (side ? t.m.knL : t.m.knR).getWorldPosition(out);
  out.y -= t.h * 0.12;
  return out;
}

/* ------------------------------------------------------------------ shared scout state */
class ScoutBody {
  constructor(o) {
    this.id = o.id; this.name = o.name; this.char = o.char || 'recruit'; this.faction = o.faction || 'corps';
    this.team = o.team || 'scouts'; this.isScout = true;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.alive = true; this.hp = 100; this.deadT = 0; this.hitT = 0; this.invuln = 0;
    this.anchors = [{ state: 'idle', pos: new THREE.Vector3() }, { state: 'idle', pos: new THREE.Vector3() }];
    this.slashT = -1; this.spinT = -1; this.slashSide = 0; this.swapT = 0; this.sharp = 100;
    this.reeling = false; this.boosting = false; this.grabbedBy = null; this.aimT = 0; this.hidden = false;
    this.avatar = new ScoutAvatar({ char: this.char, faction: this.faction, name: this.name });
  }
  get anchored() { return this.anchors.some(a => a.state === 'attached'); }
  get grabbed() { return !!this.grabbedBy; }
  dispose() { this.avatar.dispose(); }
  netState() {
    const r2 = (v) => Math.round(v * 100) / 100, A = this.anchors;
    return { id: this.id, k: 's', p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], v: [r2(this.vel.x), r2(this.vel.y), r2(this.vel.z)], y: r2(this.yaw), pi: r2(this.pitch),
      f: (this.onGround ? 1 : 0) | (this.alive ? 2 : 0) | (this.boosting ? 4 : 0) | (this.reeling ? 8 : 0) | (this.hidden ? 16 : 0), hp: Math.round(this.hp),
      a: [ANCHOR_STATES.indexOf(A[0].state), r2(A[0].pos.x), r2(A[0].pos.y), r2(A[0].pos.z), ANCHOR_STATES.indexOf(A[1].state), r2(A[1].pos.x), r2(A[1].pos.y), r2(A[1].pos.z)],
      sl: r2(this.slashT), sp: r2(this.spinT), ss: this.slashSide, sw: r2(this.swapT), sh: Math.round(this.sharp), am: r2(this.aimT), g: this.grabbedBy ? this.grabbedBy.id : null, dt: r2(this.deadT) };
  }
}
export function scoutStateOf(P) {
  // the local player's snapshot in the same format
  const r2 = (v) => Math.round(v * 100) / 100, A = P.anchors;
  return { id: P.id, k: 's', p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], v: [r2(P.vel.x), r2(P.vel.y), r2(P.vel.z)], y: r2(P.yaw), pi: r2(P.pitch),
    f: (P.onGround ? 1 : 0) | (P.alive ? 2 : 0) | (P.boosting ? 4 : 0) | (P.reeling ? 8 : 0) | (P.hidden ? 16 : 0), hp: Math.round(P.hp),
    a: [ANCHOR_STATES.indexOf(A[0].state), r2(A[0].pos.x), r2(A[0].pos.y), r2(A[0].pos.z), ANCHOR_STATES.indexOf(A[1].state), r2(A[1].pos.x), r2(A[1].pos.y), r2(A[1].pos.z)],
    sl: r2(P.swingT), sp: r2(P.spinT >= 0 ? P.spinT : P.cutSpinT >= 0 ? P.cutSpinT * 1.4 : -1), ss: P.slashSide, dr: P.drawn ? 1 : 0, sw: r2(P.swapT), sh: Math.round(P.sharp), am: r2(P.aimT || 0), g: P.grabbedBy ? P.grabbedBy.id : null, dt: r2(P.deadT) };
}

/* ------------------------------------------------------------------ remote player's scout */
export class RemoteScout extends ScoutBody {
  constructor(o) { super(o); this.local = false; this.buf = []; this.boostVis = 0; }
  netApply(o) {
    this.buf.push({ t: performance.now(), x: o.p[0], y: o.p[1], z: o.p[2], vx: o.v[0], vy: o.v[1], vz: o.v[2], yaw: o.y, pi: o.pi });
    if (this.buf.length > 8) this.buf.shift();
    const f = o.f;
    this.onGround = !!(f & 1); const alive = !!(f & 2); this.boosting = !!(f & 4); this.reeling = !!(f & 8); this.hidden = !!(f & 16);
    if (alive && !this.alive) { this.buf = this.buf.slice(-1); this.pos.set(o.p[0], o.p[1], o.p[2]); }
    this.alive = alive; this.hp = o.hp;
    for (let i = 0; i < 2; i++) { this.anchors[i].state = ANCHOR_STATES[o.a[i * 4]] || 'idle'; this.anchors[i].pos.set(o.a[i * 4 + 1], o.a[i * 4 + 2], o.a[i * 4 + 3]); }
    this.slashT = o.sl; this.spinT = o.sp; this.slashSide = o.ss; this.drawn = !!o.dr; this.swapT = o.sw; this.sharp = o.sh; this.aimT = o.am || 0; this.deadT = o.dt || 0;
    this.grabbedBy = o.g ? (G.entity(o.g) || null) : null;
    if (this.boosting || this.reeling) this.noiseT = G.time;
  }
  update(dt) {
    const b = this.buf;
    if (b.length) {
      const rt = performance.now() - 110;
      while (b.length > 2 && b[1].t <= rt) b.shift();
      if (b.length >= 2 && rt >= b[0].t) {
        const f = Math.min(1.3, (rt - b[0].t) / Math.max(1, b[1].t - b[0].t));
        this.pos.set(b[0].x + (b[1].x - b[0].x) * f, b[0].y + (b[1].y - b[0].y) * f, b[0].z + (b[1].z - b[0].z) * f);
        this.vel.set(b[1].vx, b[1].vy, b[1].vz);
        let dy = b[1].yaw - b[0].yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw = b[0].yaw + dy * f; this.pitch = b[1].pi;
      } else { this.pos.set(b[0].x, b[0].y, b[0].z); this.vel.set(b[0].vx, b[0].vy, b[0].vz); this.yaw = b[0].yaw; this.pitch = b[0].pi; }
    }
    if (this.grabbedBy && this.grabbedBy.alive) { this.grabbedBy.handWorld(this.grabbedBy.holdSide || -1, _a); this.pos.set(_a.x, _a.y - 1, _a.z); }
    // wire-anchored to a titan: keep the hook on the moving body is the owner's job; we draw what we get
    if (this.boosting && Math.random() < dt * 30) { this.avatar.launchPoint(0, _a); gasPuff(_a, _b.copy(this.vel).multiplyScalar(-0.2), 1, 0.35); }
    this.avatar.update(this, dt, this.ally());
  }
  ally() { const me = G.localTeam ? G.localTeam() : 'scouts'; return me === this.team; }
}

/* ------------------------------------------------------------------ bot scout (host) */
export class BotScout extends ScoutBody {
  constructor(o) {
    super(o);
    this.local = true; this.bot = true; this.skill = o.skill ?? 0.6;
    this.stats = charStats(this.char);
    this.gas = 100; this.spare = 8; this.ammo = 2; this.reloadT = 0; this.fireCD = 0;
    this.brain = { mode: 'roam', goal: new THREE.Vector3(), target: null, think: 0, evadeT: 0, fireT: 0, anchorT: 0, slashCD: 0, wander: new THREE.Vector3(), stuckT: 0, lastPos: new THREE.Vector3() };
    this.slashHit = new Set(); this.lastHurtBy = null; this.lastHurtT = -99;
  }
  respawn(sp) {
    this.pos.set(sp.x, sp.y, sp.z); this.vel.set(0, 0, 0);
    Object.assign(this, { alive: true, hp: this.stats.hp, gas: 100, spare: 8, sharp: 100, ammo: 2, reloadT: 0, deadT: 0, grabbedBy: null, invuln: 2, slashT: -1, spinT: -1, hidden: false });
    for (const a of this.anchors) a.state = 'idle';
    this.brain.mode = 'roam'; this.brain.target = null; this.brain.think = 0;
  }
  // ---- hooks called by titans / area effects / bullets
  hurt(dmg, kb, by, reason) {
    if (!this.alive || this.invuln > 0) return;
    this.hp -= dmg; this.hitT = 0.45; this.invuln = 0.6; this.lastHurtBy = by; this.lastHurtT = G.time;
    if (kb) { this.vel.add(kb); this.detach(0); }
    if (this.hp <= 0) this.die(reason || 'Fell in battle', by);
    if (by && G.hooks.hitConfirm) G.hooks.hitConfirm(this, by, Math.round(dmg), !this.alive, 'hit');
  }
  detach(jam) { for (const a of this.anchors) if (a.state !== 'idle') a.state = 'retract'; if (jam) this.brain.jamT = jam; }
  push(kb) { this.vel.add(kb); this.detach(0); }
  grabbed(t) {
    if (!this.alive || this.grabbedBy || this.invuln > 0) return;
    this.grabbedBy = t; this.detach(0); this.brain.escapeT = rnd(1.2, 3.6) / (0.6 + this.skill);
    if (!t.remote) t.takeHold(this); else if (G.hooks.netGrab) G.hooks.netGrab(t, this);
  }
  crushed(t, kind, dir) {
    this.grabbedBy = null;
    if (kind === 'devour') { this.die(`Devoured by ${t.name || 'a titan'}`, t.id); if (G.hooks.hitConfirm) G.hooks.hitConfirm(this, t.id, 100, true, 'devour'); return; }
    if (kind === 'throw' && dir) this.vel.set(dir[0], dir[1], dir[2]); else this.vel.set(Math.sin(t.yaw) * 18, 10, Math.cos(t.yaw) * 18);
    this.invuln = 0; this.hurt(kind === 'throw' ? 25 : 45, null, t.id, kind === 'throw' ? `Thrown by ${t.name || 'a titan'}` : `Crushed by ${t.name || 'a titan'}`);
  }
  die(reason, by) {
    if (!this.alive) return;
    this.alive = false; this.deadT = 0; this.detach(0);
    if (this.grabbedBy) { if (!this.grabbedBy.remote) this.grabbedBy.holding = null; this.grabbedBy = null; }
    const k = by || (G.time - this.lastHurtT < 6 ? this.lastHurtBy : null);
    if (G.hooks.scoutDied) G.hooks.scoutDied(this, k, reason);
  }
  // ---- AI
  pickTarget() {
    let best = null, bd = 1e9;
    const hostile = (e) => G.hostile ? G.hostile(this, e) : e.team === 'titans';
    for (const t of G.titans) {
      if (!t.alive || !hostile(t) || t.type === 'dummy') continue;
      let d = t.pos.distanceTo(this.pos) * (t === this.brain.target ? 0.6 : 1) * (t.T.shifter ? 0.8 : 1);
      // Wall Breach: defend first. Titans inside the walls come before the ones still marching in.
      if (breach()) d *= Math.max(Math.abs(t.pos.x), Math.abs(t.pos.z)) < window.DR + 6 ? 0.55 : 1.5;
      if (d < bd) { bd = d; best = t; }
    }
    for (const s of G.scouts) {
      if (s === this || !s.alive || !hostile(s) || s.hidden) continue;
      const d = s.pos.distanceTo(this.pos) * (s === this.brain.target ? 0.6 : 1) * 0.9;
      if (d < bd) { bd = d; best = s; }
    }
    return bd < 260 ? best : null;
  }
  think(dt) {
    const Br = this.brain;
    Br.think -= dt;
    if (Br.think > 0) return;
    Br.think = 0.35 + Math.random() * 0.25;
    if (this.gas < 22 || (this.faction === 'corps' && this.sharp <= 0 && this.spare <= 0)) {
      // refuel: nearest canister or depot
      let best = null, bd = 1e9;
      for (const f of G.fuel.list) { const d = Math.hypot(f.x - this.pos.x, f.z - this.pos.z); if (d < bd) { bd = d; best = f; } }
      for (const s of window.SUPPLY) { const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z); if (d < bd) { bd = d; best = { x: s.x, y: window.supplyY(s) + 1, z: s.z, depot: true }; } }
      if (best) { Br.mode = 'refuel'; Br.goal.set(best.x, best.y + 1, best.z); Br.fuel = best; return; }
    }
    Br.target = this.pickTarget();
    Br.mode = Br.target ? 'hunt' : 'roam';
    if (!Br.target && (Br.wander.lengthSq() === 0 || this.pos.distanceTo(Br.wander) < 15)) Br.wander.set(rnd(-120, 120), 70, rnd(-80, 180));
  }
  update(dt) {
    this.invuln = Math.max(0, this.invuln - dt); this.hitT = Math.max(0, this.hitT - dt);
    this.aimT = Math.max(0, this.aimT - dt); this.fireCD -= dt;
    if (this.slashT >= 0) { this.slashT += dt; if (this.slashT > 0.34) this.slashT = -1; }
    if (this.spinT >= 0) { this.spinT += dt; if (this.spinT > 0.62) this.spinT = -1; }
    if (this.swapT > 0) { this.swapT -= dt; if (this.swapT <= 0) { this.sharp = 100; this.spare--; } }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = 2; }
    const Br = this.brain; if (Br.jamT > 0) Br.jamT -= dt;
    if (!this.alive) {
      this.deadT += dt; this.vel.y -= GRAV * dt; this.vel.multiplyScalar(0.98);
      this.integrate(dt);
      this.avatar.update(this, dt, this.allyView()); return;
    }
    if (this.grabbedBy) {
      const t = this.grabbedBy;
      if (!t.alive) { this.grabbedBy = null; }
      else {
        t.handWorld(t.holdSide || -1, _a); this.pos.set(_a.x, _a.y - 1, _a.z); this.vel.set(0, 0, 0);
        Br.escapeT -= dt;
        if (Br.escapeT <= 0) {
          // cut free: sever the holding arm
          const part = (t.holdSide || -1) > 0 ? 'armL' : 'armR';
          this.grabbedBy = null; this.invuln = 1.2; this.vel.set(-Math.sin(t.yaw) * 6, 14, -Math.cos(t.yaw) * 6);
          steamBurst(_a, 20, 1, t.h * 0.08, 4);
          if (t.remote) { if (G.hooks.netEscape) G.hooks.netEscape(t, part, this.id); }
          else { t.dis[part] = 0; t.hit(part, { deep: true, speed: 20, by: this.id }); t.holding = null; t.state = 'recover'; t.st = 0; }
        }
      }
      this.avatar.update(this, dt, this.allyView()); return;
    }
    titanThreats(this);
    if (!this.alive || this.grabbedBy) { this.avatar.update(this, dt, this.allyView()); return; }
    this.think(dt);
    this.steer(dt);
    this.integrate(dt);
    this.combat(dt);
    // refuel on contact
    if (Br.mode === 'refuel' && Br.fuel && this.pos.distanceTo(Br.goal) < 4.5) {
      if (Br.fuel.depot) { this.gas = 100; this.spare = 8; this.sharp = 100; this.hp = Math.min(this.stats.hp, this.hp + 40); }
      else if (G.hooks.botFuel) G.hooks.botFuel(this, Br.fuel);
      Br.fuel = null; Br.think = 0;
    }
    if (this.faction === 'corps' && this.sharp <= 0 && this.swapT <= 0 && this.spare > 0) this.swapT = 0.65;
    this.avatar.update(this, dt, this.allyView());
  }
  allyView() { const me = G.localTeam ? G.localTeam() : 'scouts'; return me === this.team; }
  steer(dt) {
    const Br = this.brain, v = this.vel, speed = v.length();
    let goal = _a;
    const T = Br.target;
    if (Br.mode === 'refuel') goal.copy(Br.goal);
    else if (Br.mode === 'hunt' && T && Br.retreatT > 0) {
      // hit and run: peel away and climb after every pass, then come round again
      goal.copy(Br.retreatTo);
    } else if (Br.mode === 'hunt' && T) {
      if (T.isScout) {
        // duel: blades close in, guns keep a firing distance and stay high
        goal.copy(T.pos); goal.y += 1;
        if (this.faction === 'interior') { const away = _b.subVectors(this.pos, T.pos); away.y = 0; const d = away.length() || 1; goal.addScaledVector(away, 32 / d); goal.y = Math.max(goal.y + 10, T.pos.y + 8); }
      } else if (this.faction === 'interior') {
        // gunners harass titans' napes from range
        T.napeWorld(goal); const back = T.fwd; goal.x -= back.x * 22; goal.z -= back.z * 22; goal.y += 6;
      } else if (kneeFirst(T)) kneeOf(T, this, goal);
      else napeApproach(T, goal);
    } else goal.copy(Br.wander);
    // evade a titan winding up on us
    Br.evadeT -= dt; if (Br.retreatT > 0) Br.retreatT -= dt;
    for (const t of G.titans) {
      if (!t.alive || t.team !== 'titans') continue;
      if ((t.state === 'windup' || t.state === 'lunge') && t.target === this && t.pos.distanceTo(this.pos) < t.h * 0.9 + 6 && Br.evadeT <= 0 && Math.random() < this.skill) {
        Br.evadeT = 0.8; Br.evadeDir = _c.subVectors(this.pos, t.pos).setY(0).normalize().clone().add(new THREE.Vector3(0, 1.1, 0)).normalize();
      }
    }
    const to = _b.subVectors(goal, this.pos), dist = to.length();
    to.divideScalar(dist || 1);
    // keep altitude when travelling far
    const gy = window.groundH(Math.floor(this.pos.x), Math.floor(this.pos.z));
    if (dist > 25 && this.pos.y < gy + 10) to.y += 0.6;
    // avoid walls ahead
    if (speed > 4) {
      _c.copy(v).normalize();
      const hit = rayVoxel(_d.copy(this.pos).add(UP), _c, Math.min(26, speed * 0.7));
      if (hit) { to.y += 1.2; to.x += hit.nx * 0.8; to.z += hit.nz * 0.8; }
    }
    to.normalize();
    let cruise = Br.mode === 'hunt' && T && !T.isScout && this.faction === 'corps' ? (dist < 40 ? 30 + this.skill * 10 : 38) : 34;
    cruise *= this.stats.speed;
    if (Br.evadeT > 0 && Br.evadeDir) { to.copy(Br.evadeDir); cruise = 40; }
    if (Br.mode === 'refuel' && dist < 20) cruise = Math.max(8, dist * 1.4);
    if (Br.mode === 'hunt' && T && T.isScout && this.faction === 'interior' && dist < 10) cruise = 18;
    const can = this.gas > 0 && !(Br.jamT > 0);
    const want = _c.copy(to).multiplyScalar(can ? cruise : 6);
    const acc = can ? 34 + this.skill * 16 : 8;
    const dv = _d.subVectors(want, v); const dl = dv.length();
    if (dl > acc * dt) dv.multiplyScalar(acc * dt / dl);
    v.add(dv);
    if (!can) v.y -= GRAV * dt;
    else v.y -= GRAV * 0.25 * dt;
    this.boosting = can && dl > 8 && Math.random() < 0.6;
    if (can) this.gas = Math.max(0, this.gas - (this.boosting ? 2.2 : 0.55) * dt * this.stats.gas);
    this.yaw = Math.atan2(-v.x, -v.z); this.pitch = Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.5;
    // cosmetic anchors: hook real blocks ahead and above while flying
    Br.anchorT -= dt;
    for (const a of this.anchors) {
      if (a.state === 'fly') { a.flyT -= dt; if (a.flyT <= 0) a.state = 'attached'; }
      else if (a.state === 'retract') { a.retT = (a.retT || 0) - dt; if (a.retT <= 0) a.state = 'idle'; }
      else if (a.state === 'attached') { a.hold -= dt; const behind = _c.subVectors(a.pos, this.pos).dot(v) < 0; if (a.hold <= 0 || (behind && speed > 8) || a.pos.distanceTo(this.pos) > 85) { a.state = 'retract'; a.retT = 0.18; } }
    }
    if (Br.anchorT <= 0 && can && speed > 6) {
      Br.anchorT = rnd(0.5, 1.1);
      const a = this.anchors.find(q => q.state === 'idle');
      if (a) {
        const dir = _c.copy(v).normalize().multiplyScalar(1).add(_d.set(rnd(-0.4, 0.4), 0.8, rnd(-0.4, 0.4))).normalize();
        const hit = rayVoxel(_d.copy(this.pos).add(UP), dir, 75);
        let hitPt = null;
        if (hit) hitPt = _d.copy(this.pos).add(UP).addScaledVector(dir, hit.t);
        else if (T && !T.isScout && T.alive && this.pos.distanceTo(T.pos) < 70) hitPt = T.chest(_d);
        if (hitPt) { a.state = 'fly'; a.pos.copy(hitPt); a.flyT = Math.min(0.25, hitPt.distanceTo(this.pos) / 300); a.hold = rnd(0.7, 1.6); this.reeling = Math.random() < 0.3; }
      }
    }
    if (!this.anchors.some(a => a.state === 'attached')) this.reeling = false;
  }
  integrate(dt) {
    const v = this.vel, n = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < n; i++) {
      const h = dt / n, p = this.pos;
      if (moveAxis(p, 'x', v.x * h)) v.x *= -0.1;
      if (moveAxis(p, 'z', v.z * h)) v.z *= -0.1;
      this.onGround = false;
      if (moveAxis(p, 'y', v.y * h)) { if (v.y < 0) this.onGround = true; v.y = 0; }
    }
    if (this.onGround && this.alive) { v.x *= 0.9; v.z *= 0.9; }
    // chunk not generated yet (host still streaming the arena): stand on the terrain height instead of falling through
    if (!chunkReady(Math.floor(this.pos.x), Math.floor(this.pos.z))) { const gy = window.groundH(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 1; if (this.pos.y < gy) { this.pos.y = gy; if (v.y < 0) v.y = 0; this.onGround = true; } }
    if (this.pos.y < -20) this.die('Fell', null);
  }
  combat(dt) {
    const Br = this.brain, T = Br.target; if (!T || !T.alive) return;
    const speed = this.vel.length();
    if (this.faction === 'interior') {
      // shoot: lead the target, miss by skill
      const tp = T.isScout ? _a.copy(T.pos).add(_b.set(0, 0.9, 0)) : T.napeWorld(_a);
      const d = this.pos.distanceTo(tp);
      if (d < 70 && this.fireCD <= 0 && this.ammo > 0 && Math.random() < dt * 3) {
        const lead = d / (110 * this.stats.bullet);
        tp.addScaledVector(T.vel || _b.set(0, 0, 0), lead * (0.4 + this.skill * 0.6));
        const err = (1 - this.skill) * 0.06 + 0.012;
        const dir = _c.subVectors(tp, _d.copy(this.pos).add(_b.set(0, 1.2, 0))).normalize().add(_b.set(rnd(-err, err), rnd(-err, err), rnd(-err, err))).normalize();
        this.aimT = 0.5; this.yaw = Math.atan2(-dir.x, -dir.z); this.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        if (G.hooks.fireBullet) G.hooks.fireBullet(this, _d.copy(this.pos).add(_b.set(0, 1.2, 0)), dir.clone());
        this.ammo--; this.fireCD = 0.35;
        if (this.ammo <= 0) { this.reloadT = 1.6 * this.stats.reload; }
      }
      return;
    }
    if (this.sharp <= 0 || this.swapT > 0) return;
    Br.slashCD -= dt;
    if (T.isScout) {
      // blade duel: slash when close
      if (Br.slashCD <= 0 && T.pos.distanceTo(this.pos) < 4.2 && speed > 9) {
        Br.slashCD = 0.5; this.slashT = 0; this.slashSide ^= 1; Sfx.slash(0.6);
        if (G.hooks.pvpHit) G.hooks.pvpHit(this, T, speed);
      }
      return;
    }
    const knees = kneeFirst(T);
    const np = knees ? kneeOf(T, this, _a) : T.napeWorld(_a), d = np.distanceTo(_b.copy(this.pos).add(_c.set(0, 1, 0)));
    const reach = 3.4 + T.h * 0.14 + Math.min(4, speed * 0.1);
    const behind = knees || _c.subVectors(this.pos, T.pos).setY(0).normalize().dot(T.fwd) < 0.25 || this.pos.y > T.pos.y + T.h;
    if (Br.slashCD <= 0 && d < reach && (behind || Math.random() < 0.15)) {
      Br.slashCD = 0.55;
      const away = _d.subVectors(this.pos, T.pos).setY(0).normalize();
      Br.retreatT = rnd(3, 6) * (1.3 - this.skill * 0.5);
      Br.retreatTo = this.pos.clone().addScaledVector(away, rnd(28, 45)).add(_d.set(rnd(-15, 15), rnd(10, 20), rnd(-15, 15)));
      // lunge through the nape like the player's lock-on
      const dir = _c.subVectors(np, this.pos).normalize(); this.vel.copy(dir.multiplyScalar(Math.max(speed, 16)));
      if (speed > 30 && !this.onGround && Math.random() < 0.5) this.spinT = 0; else { this.slashT = 0; this.slashSide ^= 1; }
      const first = knees ? (n) => /^(ankle|leg)/.test(n) : (n) => n === 'nape';
      const parts = sphereTitanParts(T, _b.copy(this.pos).add(_c.set(0, 1, 0)), 3.4 + (this.spinT >= 0 ? 1 : 0)).sort((a, b) => (first(a.name) ? -1 : 0) - (first(b.name) ? -1 : 0) || a.dist - b.dist);
      const hitRoll = Math.random() < 0.15 + this.skill * 0.35;
      const part = parts.length ? parts[0] : null;
      if (part && hitRoll) {
        const deep = this.sharp > 0 && (speed * this.stats.cut >= 11 || this.spinT >= 0);
        const info = { deep, speed, spin: this.spinT >= 0, air: !this.onGround, by: this.id };
        this.sharp = Math.max(0, this.sharp - (part.name === 'nape' ? 16 : 10));
        sparkBurst(np, 8, 7);
        if (T.remote) { if (G.hooks.netHit) G.hooks.netHit(T, part.name, info); }
        else { const res = T.hit(part.name, info); if (G.hooks.hitResolved) G.hooks.hitResolved(T, part.name, res, info); }
      } else if (Math.random() < 0.5) {
        // whiff: go for an ankle instead next time, or reposition
        Br.think = 0;
      }
    }
  }
}

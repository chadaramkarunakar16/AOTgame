/* =========================================================================
   Titans: AI, procedural animation, attacks with readable wind-ups, limb damage,
   collapse + steam dissolve, destruction of buildings, and the boss.
   ========================================================================= */
import { THREE, scene, camera, getBlock, setBlock, SOLID, makeCanvasTex } from './engine.js';
import { buildTitan, TITAN_TYPES } from './models.js';
import { steamBurst, sparkBurst, dust, debris, chunkDebris, makeShadow, placeShadow, addShake, steam } from './fx.js';
import { Sfx } from './audio.js';
import { G } from './state.js';

const B = window.B;
const groundTop = (x, z) => {
  if (typeof getBlock === 'function') {
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let yy = 100; yy >= 20; yy--) {
      const id = getBlock(bx, yy, bz);
      if (id && SOLID[id]) return yy + 1;
    }
  }
  return (typeof window !== 'undefined' && window.groundH) ? (window.groundH(Math.floor(x), Math.floor(z)) + 1) : 47;
};
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);
const WALLISH = new Set([B.STONEBRICK, B.MOSSY]);
const UNBREAKABLE = new Set([B.BEDROCK]);

const alertTex = makeCanvasTex(64, 64, (g) => {
  g.fillStyle = 'rgba(255,40,30,0.95)'; g.beginPath(); g.moveTo(32, 2); g.lineTo(62, 58); g.lineTo(2, 58); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.fillRect(28, 18, 8, 24); g.fillRect(28, 46, 8, 8);
});
alertTex.magFilter = THREE.LinearFilter;
const napeTex = makeCanvasTex(64, 64, (g) => {
  g.strokeStyle = 'rgba(255,220,90,1)'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,220,90,0.9)'; g.beginPath(); g.arc(32, 32, 6, 0, Math.PI * 2); g.fill();
});
napeTex.magFilter = THREE.LinearFilter;

function aimQuat(bone, target, out) {
  // quaternion (in bone's parent space) that points the bone's -Y axis at a world target
  const parent = bone.parent;
  _v.copy(target); parent.worldToLocal(_v); _v.sub(bone.position).normalize();
  return out.setFromUnitVectors(DOWN, _v);
}
export function obbLocal(bone, p, out) { out.copy(p); bone.worldToLocal(out); return out; }
let titanSeq = 0;
const SWIPE_DMG = { runt: 18, boss: 35 };
// chest point of any scout-like entity
const scoutChest = (s, out) => out.copy(s.pos).add(_v3.set(0, 0.9, 0));

export class Titan {
  constructor(type, x, z, opts = {}) {
    this.type = type; this.T = TITAN_TYPES[type]; this.h = this.T.height;
    this.id = opts.id || ('t' + (++titanSeq) + '_' + Math.random().toString(36).slice(2, 5));
    this.owner = opts.owner || null; this.remote = !!opts.remote; this.ctrl = opts.ctrl || 'ai';
    this.name = opts.name || ''; this.team = opts.team || (this.ctrl === 'player' ? 'player_shifter' : 'titans'); this.bot = !!opts.bot;
    this.atkN = 0; this.hitIds = new Set(); this.napeGuard = 0; this.hardened = 0; this.target = null; this.targetT = 0;
    this.recentHits = new Map(); this.kit = null; this.input = null; this.lodN = Math.floor(Math.random() * 3);
    this.m = buildTitan(type, opts.rng); this.root = this.m.root; this.s = this.m.scale;
    scene.add(this.root);
    const gy = groundTop(x, z);
    this.pos = new THREE.Vector3(x, opts.y != null && opts.y <= gy + 1 ? opts.y : gy, z);
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.speed = this.T.speed * (0.85 + Math.random() * 0.3);
    this.state = 'walk'; this.st = 0; this.alive = true; this.removed = false;
    this.goal = opts.goal || null; this.route = opts.route || null; this.wanderT = 0; this.wanderTo = new THREE.Vector3(x, 0, z);
    this.atkCD = 1.5 + Math.random() * 2; this.atk = null; this.atkSide = 1; this.hitDone = false;
    this.dis = { armR: 0, armL: 0, legs: 0 };
    this.flash = 0; this.flinch = 0; this.walkPh = Math.random() * 6; this.lastStep = 0;
    this.groanT = 2 + Math.random() * 8; this.smashT = 0;
    this.napeHP = opts.napeHP || this.T.napeHP || 1; this.napeMax = this.napeHP; this.hpMax = this.napeMax * 100; this.hp = this.hpMax; this.lastDmgT = -99; this.passive = !!opts.passive; this.aggroR = opts.aggroR || (38 + this.h * 2.2);
    this.alertness = opts.alert ? 1 : 0;
    this.radius = this.h * 0.2 + 0.4;
    this.shadow = makeShadow();
    this.steamSrc = [];
    this.leap = null; this.zig = 0; this.zigT = 0;
    this.holding = null; this.holdT = 0; this.escape = 0;
    this.deathT = 0; this.fallDir = 1;
    this.civTarget = null;
    this.kneelAmt = 0; this.rootPitch = 0; this.sink = 0;
    this.alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTex, depthTest: false, transparent: true }));
    this.alert.renderOrder = 20; this.alert.visible = false; scene.add(this.alert);
    this.napeMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: napeTex, depthTest: false, transparent: true, opacity: 0.0 }));
    this.napeMark.renderOrder = 19; scene.add(this.napeMark);
    this.cur = {}; // current smoothed pose values
    this.boss = null;
    this.onKill = opts.onKill || null;
    this.tag = opts.tag || '';
    if (opts.y !== undefined) this.pos.y = opts.y;
    this.update(0);
  }
  get fwd() { return _v3.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  napeWorld(out) { return this.m.neck.localToWorld(out.set(0, 1.6, -2.6)); }
  headWorld(out) { return this.m.head.localToWorld(out.set(0, this.T.head * 0.5, 0)); }
  handWorld(side, out) { const el = side > 0 ? this.m.elL : this.m.elR; return el.localToWorld(out.set(0, -this.T.fa + 1, 0)); }
  chest(out) { return this.m.torso.localToWorld(out.set(0, this.T.th * 0.6, 0)); }

  // ---------------------------------------------------------------- damage
  // shifter titans have a health bar: deep nape cuts take a full segment (100), everything else chips it
  hurtHP(d, info) {
    if (!this.alive || d <= 0) return;
    this.hp -= d; this.lastDmgT = G.time;
    this.napeHP = Math.max(0, Math.ceil(this.hp / 100));
    if (this !== G.localTitan) {
      if (window.popup) window.popup(`💥 -${d} HP [${Math.max(0, this.hp)} / ${this.hpMax} HP]`, '#ff4a4a');
      if (window.toast && (d >= 30 || this.hp <= 0)) {
        window.toast(`HIT ${this.name || 'TITAN'}! -${d} HP [HP: ${Math.max(0, this.hp)}/${this.hpMax}]`, 1.2);
      }
    }
    if (this.hp <= 0) this.kill(info);
  }
  hit(part, info) {
    const res = this.hitInner(part, info);
    if (this.T.shifter && this.alive && res.kind !== 'kill') {
      const chip = { shallow: 30, limb: 18, flesh: 6, weak: 10 }[res.kind] || 0;
      if (chip) { this.hurtHP(chip, info); if (!this.alive) res.kind = 'kill'; }
    }
    res.hp = this.hp; res.hpMax = this.hpMax;
    if (G.hooks.titanHurt && !this.remote) G.hooks.titanHurt(this, part, res, info);
    return res;
  }
  hitInner(part, info) {
    // returns a result object describing what happened
    if (!this.alive) return { kind: 'none' };
    this.flash = 1; this.flinch = 1; this.alertness = 1;
    if (info.by) this.recentHits.set(info.by, G.time);
    const res = { kind: 'flesh', part };
    if (this.hardened > 0) return { kind: 'armor', part };
    if (this.boss) { const r = this.boss.hit(this, part, info); if (r) return r; }
    if (this.kit && this.kit.hit) { const r = this.kit.hit(this, part, info); if (r) return r; }
    if (part === 'nape') {
      if (this.napeGuard > 0) return { kind: 'guard', part };
      if (info.deep && this.T.shifter) {
        this.hurtHP(100, info);
        if (!this.alive) return { kind: 'kill' };
        this.staggerDur = 0.8; if (this.ctrl === 'ai') { this.state = 'stagger'; this.st = 0; }
        return { kind: 'napecrack', part, left: this.napeHP };
      }
      if (info.deep) {
        if (--this.napeHP > 0) { this.napeRegen = 9; this.state = this.ctrl === 'ai' ? 'stagger' : this.state; this.st = 0; this.staggerDur = 1.2; return { kind: 'napecrack', part, left: this.napeHP }; }
        this.kill(info); return { kind: 'kill' };
      }
      res.kind = 'shallow';
      return res;
    }
    if (part === 'armR' || part === 'armL') {
      if (this.dis[part] <= 0) {
        this.dis[part] = this.type === 'boss' ? 6 : 12;
        const el = part === 'armL' ? this.m.elL : this.m.elR;
        this.steamSrc.push({ bone: el, x: 0, y: 0, z: 0, t: this.dis[part] });
        el.getWorldPosition(_v);
        chunkDebris(_v, [0.8, 0.55, 0.45], 6, 6, this.h * 0.08);
        if (this.holding && this.holdSide === (part === 'armL' ? 1 : -1)) this.release(true);
        if (this.atk && this.atkSide === (part === 'armL' ? 1 : -1)) { this.atk = null; this.state = 'recover'; this.st = 0; }
        res.kind = 'limb';
      }
      return res;
    }
    if (part === 'ankleR' || part === 'ankleL' || part === 'legR' || part === 'legL') {
      const fresh = this.dis.legs <= 0;
      this.dis.legs = Math.max(this.dis.legs, this.type === 'boss' ? 5 : 8);
      const kn = part.endsWith('L') ? this.m.knL : this.m.knR;
      this.steamSrc.push({ bone: kn, x: 0, y: -this.T.sl, z: 0, t: this.dis.legs });
      if (this.holding) this.release(true);
      this.atk = null; if (this.state !== 'dying') { this.state = 'crippled'; this.st = 0; }
      res.kind = fresh ? 'limb' : 'flesh';
      return res;
    }
    return res;
  }
  kill(info) {
    if (!this.alive) return;
    this.alive = false; this.state = 'dying'; this.st = 0; this.atk = null;
    if (this.holding) this.release(false);
    this.alert.visible = false; this.napeMark.visible = false;
    this.fallDir = Math.random() < 0.7 ? 1 : -1; this.killedBy = info && info.by; this.napeGuard = 0; this.hardened = 0;
    const p = this.napeWorld(new THREE.Vector3());
    steamBurst(p, 40, this.h * 0.15, this.h * 0.18, 6, 2.6);
    Sfx.groanT = 0;
    if (this.onKill) this.onKill(this, info);
    if (!this.remote && G.hooks.titanKilled) G.hooks.titanKilled(this, info || {});
  }
  release(escaped) {
    if (this.holdingHorse) {
      const h = this.holdingHorse;
      this.holdingHorse = null;
      h.grabbedBy = null;
      if (escaped) { this.state = 'recover'; this.st = 0; this.flinch = 1.5; }
    }
    if (!this.holding) return;
    const who = this.holding; this.holding = null;
    if (who.grabbedBy === this) who.grabbedBy = null;
    if (G.hooks.releaseScout) G.hooks.releaseScout(this, who, escaped);
    if (escaped) { this.state = 'recover'; this.st = 0; this.flinch = 1.5; }
  }
  // nearest living, hostile target (scout, rival titan, or horse)
  pickTarget() {
    let best = null, bd = 1e9;
    for (const s of G.scouts) {
      if (!s.alive || s.grabbedBy || s.hidden) continue;
      if (this.team && s.team && this.team === s.team) continue;
      const d = Math.hypot(s.pos.x - this.pos.x, s.pos.z - this.pos.z) * (s === this.target ? 0.7 : 1);
      if (d < bd) { bd = d; best = s; }
    }
    // Target opposing titans (including player-piloted Titan in Titan vs Titan mode)
    for (const t of G.titans) {
      if (t === this || !t.alive) continue;
      if (this.team && t.team && this.team === t.team) continue;
      const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) * (t === this.target ? 0.7 : 1);
      if (d < bd) { bd = d; best = t; }
    }
    // Target horses
    if (G.horses) {
      for (const h of G.horses) {
        if (!h.alive || h.grabbedBy || h.removed) continue;
        const d = Math.hypot(h.pos.x - this.pos.x, h.pos.z - this.pos.z) * 1.3;
        if (d < bd) { bd = d; best = h; }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.st += dt; this.flash = Math.max(0, this.flash - dt * 6); this.flinch = Math.max(0, this.flinch - dt * 3);
    for (const k in this.dis) if (this.dis[k] > 0) this.dis[k] -= dt;
    if (this.state === 'dying' || this.state === 'dissolve') { this.updateDeath(dt); return; }

    // Thrown Titan physics (e.g. grabbed & tossed across the map)
    if (this.thrown) {
      this.st += dt;
      this.thrown.v.y -= 28 * dt;
      this.pos.addScaledVector(this.thrown.v, dt);
      this.rootPitch = (this.rootPitch || 0) + dt * 4;
      const gy = groundTop(this.pos.x, this.pos.z);
      if (this.pos.y <= gy || this.st > 4) {
        this.pos.y = gy; this.rootPitch = 0; this.thrown = null;
        this.state = 'crippled'; this.st = 0; this.dis.legs = 4.5;
        this.hurtHP(60, { by: 'throw', kind: 'crash' });
        this.flash = 1; this.flinch = 1.5;
        dust(this.pos, 35, 5); chunkDebris(this.pos, [0.8, 0.7, 0.6], 18, 14, 1.2);
        Sfx.crash(1.5); Sfx.stomp(); addShake(0.8);
        this.smashSphere(this.pos.clone().add(_v.set(0, 2, 0)), 4, 120);
      }
      this.finishMove(dt, false);
      return;
    }
    // Held by another Titan
    if (this.grabbedBy) {
      this.state = 'holding';
      this.finishMove(dt, false);
      return;
    }
    // Titan holding another Titan or Horse: update victim position to follow holder's hand
    if (this.holding && this.holding.hurtHP) {
      const hand = this.handWorld(this.holdSide || -1, _v2);
      this.holding.pos.copy(hand).addScaledVector(this.fwd, 1.2);
      // Lift high overhead into the air!
      this.holding.pos.y = Math.max(hand.y, this.pos.y + this.h * 0.65);
      this.holding.yaw = this.yaw + Math.PI;
      this.holding.rootPitch = 0.5; // visibly lifted and dangling helpless
    }
    if (this.holdingHorse) {
      const hand = this.handWorld(this.holdSide || -1, _v2);
      this.holdingHorse.pos.copy(hand);
      this.holdingHorse.yaw = this.yaw + Math.PI;
      this.holdingHorse.updateVisuals(dt);
    }

    if (this.alive && this.hp <= 0) {
      this.kill({ by: 'hp_depleted' });
      return;
    }
    if (this === G.localTitan && !this.alive && gameState === 'play') {
      if (window.__die) window.__die('Your Titan shifter form was destroyed', this.killedBy);
    }
    this.napeGuard = Math.max(0, this.napeGuard - dt); this.hardened = Math.max(0, this.hardened - dt);
    if (this.napeRegen > 0 && (this.napeRegen -= dt) <= 0) this.napeHP = this.napeMax;
    if (this.T.shifter && this.alive && this.hp < this.hpMax && G.time - this.lastDmgT > 7 && !(this.kit && this.kit.locked)) { this.hp = Math.min(this.hpMax, this.hp + 9 * dt); this.napeHP = Math.ceil(this.hp / 100); this.regenning = true; } else this.regenning = false;
    if (this.boss) this.boss.update(this, dt);
    if (this.kit) this.kit.update(this, dt);
    if (this.ctrl === 'player') { const mv = this.pilot ? this.pilot(this, dt) : false; this.finishMove(dt, mv); return; }
    this.targetT -= dt;
    if (this.targetT <= 0 || (this.target && (!this.target.alive || this.target.grabbedBy))) { this.targetT = 0.5; this.target = this.pickTarget(); }
    const P = this.target;
    const pp = P ? P.pos : null;
    const pAlive = !!P && P.alive && !this.passive;
    let dx = 0, dz = 0, dist = 1e9, dy = 0;
    if (pp) { dx = pp.x - this.pos.x; dz = pp.z - this.pos.z; dist = Math.hypot(dx, dz); dy = pp.y - this.pos.y; }
    const canSee = pAlive && dist < this.aggroR;
    if (canSee) this.alertness = Math.min(1, this.alertness + dt * 0.8); else this.alertness = Math.max(0, this.alertness - dt * 0.1);
    const aggro = canSee && this.alertness > 0.3 && !P.grabbedBy && dy < this.h * 1.35 + 3;
    if (this.kit && this.kit.ai && aggro && this.state !== 'holding') this.kit.ai(this, P, dist, dy, dt);
    let moving = false, tx = this.pos.x, tz = this.pos.z, spd = this.speed;
    // ------- state machine
    if (this.state === 'crippled') {
      if (this.dis.legs <= 0) { this.state = 'rise'; this.st = 0; }
    } else if (this.state === 'rise') {
      if (this.st > 1.2) { this.state = 'walk'; this.st = 0; }
    } else if (this.state === 'holding') {
      this.holdT += dt;
      if (this.holdT > 3.2) {
        if (this.holdingHorse) {
          this.crush(Math.random() < 0.5 ? 'throw' : 'devour');
        } else if (this.holding && this.holding.hurtHP) {
          this.crush(Math.random() < 0.5 ? 'throw' : 'slam');
        } else {
          this.crush(Math.random() < 0.5 ? 'throw' : 'devour');
        }
      }
    } else if (this.state === 'windup' || this.state === 'strike' || this.state === 'lunge') {
      this.updateAttack(dt);
    } else if (this.state === 'recover') {
      if (this.st > 0.9) { this.state = 'walk'; this.st = 0; }
    } else if (this.state === 'leap') {
      this.updateLeap(dt);
    } else if (this.state === 'stagger') {
      if (this.st > (this.staggerDur || 2)) { this.state = 'walk'; this.st = 0; }
    } else if (this.state === 'charge') {
      // the kit drives the charge
    } else {
      // walk / chase
      this.atkCD -= dt;
      if (aggro) {
        tx = pp.x; tz = pp.z; this.state = 'chase';
        const reach = this.h * 0.55 + 1.6;
        const vertOK = dy > -2 && dy < this.h * 1.15;
        if (this.atkCD <= 0 && dist < reach + 1.5 && vertOK && this.dis.legs <= 0) this.startAttack(dist, dy);
        else if (this.type === 'abnormal' && this.atkCD <= 0 && dist > 8 && dist < 26 && dy < 10 && Math.random() < dt * 1.5) this.startLeap(pp);
        moving = dist > reach * 0.55;
        spd *= this.type === 'abnormal' ? 1.1 : 1.3;
      } else if (this.civTarget && !this.civTarget.done) {
        tx = this.civTarget.pos.x; tz = this.civTarget.pos.z;
        const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        moving = d > this.h * 0.35 + 1;
        if (!moving && this.civTarget.pos.y - this.pos.y < this.h * 1.15) { this.civTarget.threat = (this.civTarget.threat || 0) + dt; this.yaw += Math.atan2(Math.sin(Math.atan2(tx - this.pos.x, tz - this.pos.z) - this.yaw), Math.cos(Math.atan2(tx - this.pos.x, tz - this.pos.z) - this.yaw)) * Math.min(1, dt * 3); }
      } else if (this.route && this.route.length) {
        const w = this.route[0]; tx = w.x; tz = w.z;
        if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 6) this.route.shift();
        moving = true;
      } else if (this.goal) {
        tx = this.goal.x; tz = this.goal.z; moving = Math.hypot(tx - this.pos.x, tz - this.pos.z) > 4;
        if (!moving) this.goal = null;
      } else if (!this.passive) {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 5 + Math.random() * 8; const a = Math.random() * 6.28, r = 10 + Math.random() * 25; this.wanderTo.set(this.pos.x + Math.cos(a) * r, 0, this.pos.z + Math.sin(a) * r); }
        tx = this.wanderTo.x; tz = this.wanderTo.z; moving = Math.hypot(tx - this.pos.x, tz - this.pos.z) > 3; spd *= 0.6;
        if (!aggro) this.state = 'walk';
      }
      if (this.type === 'dummy') moving = false;
    }
    if (this.dis.legs > 0 || this.speed <= 0 || this.state === 'charge' || this.airborne || this.state === 'holding') moving = false;
    // ------- locomotion
    if (moving && this.state !== 'holding') {
      let want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      if (this.type === 'abnormal') {
        this.zigT -= dt; if (this.zigT <= 0) { this.zigT = 0.6 + Math.random() * 1.4; this.zig = (Math.random() - 0.5) * 1.6; }
        want += this.zig;
      }
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const turn = (this.type === 'abnormal' ? 4 : 1.6) * dt;
      this.yaw += Math.max(-turn, Math.min(turn, d));
      const f = Math.cos(Math.min(Math.abs(d), 1.4));
      this.plowT = (this.plowT || 0) - dt;
      const v = spd * f * (this.plowT > 0 ? 0.5 : 1);
      this.pos.x += Math.sin(this.yaw) * v * dt; this.pos.z += Math.cos(this.yaw) * v * dt;
      this.walkPh += v * dt * (5.2 / this.h) * (this.type === 'abnormal' ? 1.3 : 1);
      this.smashT -= dt;
      if (this.smashT <= 0) { this.smashT = 0.2; this.smash(); }
    } else if (this.state === 'chase' && aggro) {
      // face the player while standing
      let d = Math.atan2(dx, dz) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += Math.max(-2 * dt, Math.min(2 * dt, d));
    }
    this.finishMove(dt, moving);
  }
  // shared by AI and player-piloted titans: separation, ground, footsteps, voice, animation
  finishMove(dt, moving) {
    // separation from other titans (held and holding titans never push each other to prevent moonwalking!)
    for (const o of G.titans) {
      if (o === this || !o.alive || o === this.holding || this.holding === o || this.grabbedBy === o || o.grabbedBy === this) continue;
      const sx = this.pos.x - o.pos.x, sz = this.pos.z - o.pos.z, sd = Math.hypot(sx, sz), md = this.radius + o.radius;
      if (sd < md && sd > 0.01) { const push = (md - sd) * 0.5; this.pos.x += sx / sd * push; this.pos.z += sz / sd * push; }
    }
    if (this.state !== 'leap' && !this.airborne && !this.airborneLock && !this.thrown) {
      const gy = groundTop(this.pos.x, this.pos.z);
      this.pos.y = gy;
    }
    this.footsteps();
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = 6 + Math.random() * 10; Sfx.titanGroan(this.h, this.pos.distanceTo(camera.position), this.panTo(), this.type === 'abnormal'); }
    // attacking titans always animate every frame: their hand positions decide hits
    const busy = this.state === 'windup' || this.state === 'strike' || this.state === 'lunge' || this.state === 'holding' || this.state === 'leap';
    if (busy || this.lod(dt)) { const ldt = busy ? dt + (this.lodAcc || 0) : this.lodDt; this.lodAcc = 0; this.animate(ldt, moving); this.updateFx(ldt); if (this.kit && this.kit.fx) this.kit.fx(this, ldt); }
  }
  // level of detail: titans far from the camera pose themselves every third frame
  lod(dt) {
    this.lodAcc = (this.lodAcc || 0) + dt;
    const far = Math.abs(this.pos.x - camera.position.x) + Math.abs(this.pos.z - camera.position.z) > 170 + this.h * 4;
    if (far && ++this.lodN % 3 !== 0) return false;
    this.lodDt = this.lodAcc; this.lodAcc = 0;
    return true;
  }
  footsteps() {
    const stepPh = Math.floor(this.walkPh / Math.PI);
    if (stepPh === this.lastStep) return;
    this.lastStep = stepPh;
    const d = this.pos.distanceTo(camera.position), pan = this.panTo();
    Sfx.titanStep(this.h, d, pan);
    const mine = G.localTitan === this;
    if (this.h > 12 && d < 40) addShake((mine ? 0.04 : 0.08) * (1 - d / 40) * Math.min(2, this.h / 15));
    if (this.h > 7) dust(_v.set(this.pos.x + Math.sin(this.yaw + (stepPh & 1 ? 1.2 : -1.2)) * this.h * 0.12, this.pos.y, this.pos.z + Math.cos(this.yaw + (stepPh & 1 ? 1.2 : -1.2)) * this.h * 0.12), 3, this.h * 0.12);
  }
  // owner: finish a hold — crush/slam, devour, or throw
  crush(kind, dir) {
    if (this.holdingHorse) {
      const h = this.holdingHorse;
      this.holdingHorse = null;
      h.grabbedBy = null;
      this.state = 'recover'; this.st = 0;
      if (kind === 'throw') {
        const v = dir ? new THREE.Vector3(dir[0], dir[1] + 6, dir[2]) : this.fwd.clone().multiplyScalar(38).setY(16);
        h.vel.copy(v);
        h.onGround = false;
        Sfx.whinny && Sfx.whinny();
        Sfx.swipe(0);
        dust(h.pos, 15, 2);
        if (window.popup) window.popup('HORSE THROWN AWAY BY TITAN!', '#ff7a6a');
      } else {
        dust(h.pos, 25, 3.5);
        chunkDebris(h.pos, [0.6, 0.2, 0.1], 20, 14, 1.2);
        Sfx.hitFlesh && Sfx.hitFlesh();
        Sfx.thwack && Sfx.thwack(1.5);
        h.remove();
        if (window.popup) window.popup('HORSE DEVOURED BY TITAN!', '#ff4a4a');
      }
      return;
    }
    const who = this.holding; this.holding = null;
    this.state = 'recover'; this.st = 0;
    if (who && who.hurtHP) {
      who.grabbedBy = null;
      if (kind === 'throw') {
        const v = dir ? new THREE.Vector3(dir[0], dir[1] + 6, dir[2]).multiplyScalar(1.4) : this.fwd.clone().multiplyScalar(42).setY(16);
        who.thrown = { v, t: 0 };
        who.state = 'leap'; who.st = 0;
        Sfx.swipe(0); Sfx.roar(this.h);
        addShake(0.5);
        if (G.hooks.titanThrew) G.hooks.titanThrew(this, who);
      } else {
        // Slam down violently into the ground
        who.pos.copy(this.pos).addScaledVector(this.fwd, this.radius + who.radius + 1.2);
        const gy = groundTop(who.pos.x, who.pos.z);
        who.pos.y = gy;
        who.state = 'crippled'; who.st = 0; who.dis.legs = 4.5;
        who.hurtHP(75, { by: this.id, kind: 'slam' });
        who.flash = 1; who.flinch = 1.6;
        dust(who.pos, 35, 4.5);
        chunkDebris(who.pos, [0.85, 0.4, 0.4], 16, 12, 1.2);
        Sfx.thwack(1.7); Sfx.crash(1.4); Sfx.stomp();
        addShake(0.7);
        this.smashSphere(who.pos.clone().add(_v.set(0, 2, 0)), 4, 150);
        if (G.hooks.titanSlammed) G.hooks.titanSlammed(this, who);
      }
      return;
    }
    if (who) {
      if (kind === 'devour') {
        dust(this.headWorld(_v2), 25, 3);
        chunkDebris(this.headWorld(_v2), [0.8, 0.1, 0.1], 18, 12, 1.0);
        Sfx.hitFlesh && Sfx.hitFlesh();
        Sfx.thwack && Sfx.thwack(1.6);
        addShake(0.5);
      } else if (kind === 'throw') {
        Sfx.swipe(0);
        addShake(0.4);
        if (!dir) {
          const throwDir = this.fwd.clone().multiplyScalar(36).setY(16);
          dir = [throwDir.x, throwDir.y, throwDir.z];
        }
      }
      if (G.hooks.crushScout) G.hooks.crushScout(this, who, kind, dir);
    }
  }
  // replica: follow the owner's snapshots (interpolated ~100 ms behind)
  netUpdate(dt) {
    const N = this.net; if (!N || !N.buf.length) return false;
    const rt = performance.now() - 110;
    const b = N.buf;
    while (b.length > 2 && b[1].t <= rt) b.shift();
    let x, y, z, yaw;
    if (b.length >= 2 && rt >= b[0].t) {
      const f = Math.min(1.25, (rt - b[0].t) / Math.max(1, b[1].t - b[0].t));
      x = b[0].x + (b[1].x - b[0].x) * f; y = b[0].y + (b[1].y - b[0].y) * f; z = b[0].z + (b[1].z - b[0].z) * f;
      let dy = b[1].yaw - b[0].yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yaw = b[0].yaw + dy * f;
    } else { x = b[0].x; y = b[0].y; z = b[0].z; yaw = b[0].yaw; }
    const mv = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (mv > 30) this.pos.set(x, y, z); else this.pos.set(x, y, z);
    this.yaw = yaw;
    const v = dt > 0 ? mv / dt : 0;
    if (v > 0.3 && this.state !== 'leap') this.walkPh += v * dt * (5.2 / this.h) * (this.type === 'abnormal' ? 1.3 : 1);
    return v > 0.3 && this.state !== 'crippled';
  }
  netState() {
    const r2 = (v) => Math.round(v * 100) / 100;
    const o = { id: this.id, k: 't', ty: this.type, p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], y: r2(this.yaw), s: this.state, st: r2(this.st), a: this.atk, as: this.atkSide, n: this.atkN, wd: r2(this.windDur || 1),
      d: [r2(this.dis.armR), r2(this.dis.armL), r2(this.dis.legs)], al: r2(this.alertness), h: this.holding ? this.holding.id : null, hs: this.holdSide || -1,
      hp: Math.round(this.hp), tg: this.target ? this.target.id : null, lw: Math.round((this.aimLow || 0) * 100) / 100, nh: this.napeHP, ng: r2(this.napeGuard), gs: this.guardSide || -1, hd: r2(this.hardened), sk: r2(this.sink), rp: r2(this.rootPitch) };
    if (this.grabAim) o.ga = [r2(this.grabAim.x), r2(this.grabAim.y), r2(this.grabAim.z)];
    if (this.kit && this.kit.netState) o.x = this.kit.netState(this);
    if (this.boss) o.b = { ph: this.boss.phase, kn: this.boss.kneelT, ve: this.boss.venting, kl: this.boss.knees.ankleL, kr: this.boss.knees.ankleR };
    return o;
  }
  netApply(o) {
    if (!this.net) this.net = { buf: [] };
    const b = this.net.buf; b.push({ t: performance.now(), x: o.p[0], y: o.p[1], z: o.p[2], yaw: o.y });
    if (b.length > 8) b.shift();
    if (!this.alive) return;
    if (o.s !== this.state) { if (o.s === 'dying' || o.s === 'dissolve') return; this.state = o.s; this.st = o.st; }
    else if (Math.abs(this.st - o.st) > 0.3) this.st = o.st;
    this.atk = o.a; this.atkSide = o.as; this.windDur = o.wd;
    if (o.n !== this.atkN) { this.atkN = o.n; this.hitIds.clear(); }
    this.dis.armR = o.d[0]; this.dis.armL = o.d[1]; this.dis.legs = o.d[2];
    this.alertness = o.al; this.holdSide = o.hs; this.aimLow = o.lw || 0; if (o.hp !== undefined) this.hp = o.hp; this.napeHP = o.nh; this.napeGuard = o.ng; this.guardSide = o.gs; this.hardened = o.hd;
    this.grabAim = o.ga ? new THREE.Vector3(o.ga[0], o.ga[1], o.ga[2]) : null;
    this.holding = o.h ? (G.entity(o.h) || null) : null;
    this.target = o.tg ? (G.entity(o.tg) || null) : null;
    if (this.kit && this.kit.netApply && o.x) this.kit.netApply(this, o.x);
    if (this.boss && o.b) { const B = this.boss; if (o.b.ph !== B.phase && o.b.ph >= 2 && B.phase < 2) B.shedArmor(this); B.phase = o.b.ph; B.kneelT = o.b.kn; B.venting = o.b.ve; B.knees.ankleL = o.b.kl; B.knees.ankleR = o.b.kr; }
  }
  panTo() {
    _v2.subVectors(this.pos, camera.position);
    const r = _v.set(1, 0, 0).applyQuaternion(camera.quaternion);
    return Math.max(-1, Math.min(1, _v2.normalize().dot(r)));
  }
  // kind: forced attack ('swipe' | 'grab' | 'stomp' | 'bite'), aim: world point for player-piloted titans
  startAttack(dist, dy, kind, aim) {
    const canR = this.dis.armR <= 0, canL = this.dis.armL <= 0;
    if (!canR && !canL && kind !== 'bite') { this.atkCD = 1; return false; }
    this.atkSide = canR && canL ? (this.atkSide === -1 ? 1 : -1) : canR ? -1 : 1;
    if (this.ctrl === 'ai') this.atkSide = canR && canL ? (Math.random() < 0.5 ? -1 : 1) : canR ? -1 : 1;
    let atk = kind;
    if (!atk) { const grab = this.type !== 'dummy' && Math.random() < (this.type === 'abnormal' ? 0.75 : 0.6) && dy > -3.5; atk = grab ? 'grab' : (this.boss && this.boss.wantsStomp(this, dist, dy) ? 'stomp' : 'swipe'); }
    this.atk = atk; this.aimPt = aim ? aim.clone() : null;
    this.state = 'windup'; this.st = 0; this.atkN++; this.hitIds.clear();
    // swipes dip toward low targets (a scout standing at the titan's feet is not safe)
    { const tp = this.aimTarget(_v2), shY = this.pos.y + this.h * 0.72, hd = Math.max(1, Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z));
      this.aimLow = Math.max(0, Math.min(1.1, -Math.atan2(tp.y - shY, hd) * 0.9)); }
    const k = this.T.wind || (this.type === 'runt' ? 0.75 : this.type === 'abnormal' ? 0.6 : this.type === 'brute' ? 1.05 : this.type === 'boss' ? 1.1 : 0.9);
    this.windDur = (atk === 'grab' || atk === 'bite' ? 0.85 : atk === 'stomp' ? 1.2 : 0.95) * k / (this.boss ? this.boss.rage : 1) * (this.ctrl === 'player' ? 0.42 : 1) / (this.rage || 1);
    this.atkCD = 2.2 + Math.random() * 1.6;
    Sfx.windup(this.panTo());
    return true;
  }
  aimTarget(out) {
    // where this attack is aimed: the player's crosshair point, or the AI target
    if (this.aimPt) return out.copy(this.aimPt);
    const P = this.target; if (P) return out.copy(P.pos).add(_v3.set(0, 0.9, 0)).addScaledVector(P.vel, 0.25);
    return out.copy(this.pos).addScaledVector(this.fwd, this.h * 0.5).add(_v3.set(0, this.h * 0.5, 0));
  }
  updateAttack(dt) {
    if (this.state === 'windup') {
      if (this.atk === 'grab' || this.atk === 'bite') this.grabAim = this.aimTarget(this.grabAim || new THREE.Vector3());
      // keep facing the target during windup
      if (this.ctrl === 'ai' && this.target) {
        let d = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, d));
      }
      if (this.st >= this.windDur) {
        this.state = this.atk === 'grab' || this.atk === 'bite' ? 'lunge' : 'strike'; this.st = 0;
        if (this.atk === 'swipe') Sfx.swipe(this.panTo());
        if (this.atk === 'stomp') { if (this.boss) this.boss.stomp(this); else if (this.kit && this.kit.stomp) this.kit.stomp(this); }
      }
    } else if (this.state === 'strike') {
      // smash blocks along the swipe (damage to scouts is checked on the victim's side: titanThreats)
      const isSwipe = this.atk === 'swipe', isKick = this.atk === 'kick';
      if (isSwipe || isKick) {
        const hand = this.handWorld(this.atkSide, _v2);
        this.smashSphere(hand, this.h * 0.11 + 0.6, this.h > 20 ? 24 : 10);
        // Titan vs Titan: punches and kicks strike other hostile titans (including small titans below!)
        const punchReach = this.ctrl === 'player' ? 16 : (this.h * 0.22 + 3.0) * (this.T.reach || 1);
        const fwdX = (this.ctrl === 'player' && this.aimPt) ? (this.aimPt.x - this.pos.x) : this.fwd.x;
        const fwdZ = (this.ctrl === 'player' && this.aimPt) ? (this.aimPt.z - this.pos.z) : this.fwd.z;
        const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
        const fNormX = fwdX / fwdLen, fNormZ = fwdZ / fwdLen;
        for (const other of G.titans) {
          if (other === this || !other.alive) continue;
          if (this.team && other.team && this.team === other.team) continue;
          if (this.hitIds.has(other.id)) continue;
          
          // Capsule cylinder check: measures distance to the nearest point on the target Titan's body
          const nearestY = Math.max(other.pos.y, Math.min(other.pos.y + other.h, hand.y));
          const distToHand = Math.hypot(hand.x - other.pos.x, hand.y - nearestY, hand.z - other.pos.z);
          
          // Forward reach cone check (standing in front of a smaller titan strikes them cleanly!)
          const dx = other.pos.x - this.pos.x, dz = other.pos.z - this.pos.z;
          const distH = Math.hypot(dx, dz);
          const fwdDot = (dx * fNormX + dz * fNormZ) / Math.max(0.1, distH);
          const maxReach = this.ctrl === 'player' ? 18 : (this.h * 0.5 + 4.0) * (this.T.reach || 1);
          const minHitDot = this.ctrl === 'player' ? -0.1 : 0.35;
          const yDiff = Math.abs((this.pos.y + this.h * 0.4) - (other.pos.y + other.h * 0.5));
          
          const hit = (distToHand < punchReach + other.radius + 1.2) ||
                      (fwdDot > minHitDot && distH < maxReach && yDiff < this.h + 6);
          
          if (hit) {
            this.hitIds.add(other.id);
            const baseDmg = isKick ? 52 : (this.T.swipe || SWIPE_DMG[this.type] || 35);
            const dmg = Math.round(baseDmg * (this.dmgMul || 1) * (this.kit && this.kit.fist > 0 ? 1.6 : 1));
            
            // Damage other titan & trigger bright red flash
            other.hurtHP(dmg, { by: this.id, kind: isKick ? 'kick' : 'punch' });
            other.flash = 1; other.flinch = 1.6;
            
            // Heavy knockback
            const kbDir = new THREE.Vector3(dx, 0, dz).normalize();
            const kbPower = isKick ? 20 : (12 + (this.h / Math.max(4, other.h)) * 5);
            other.pos.addScaledVector(kbDir, Math.min(14, kbPower * 0.25));
            
            // KNOCKDOWN: Small titans or heavy hits fall straight down to the ground!
            if (other.ctrl === 'ai') {
              other.state = 'crippled';
              other.st = 0;
              other.dis.legs = Math.max(other.dis.legs, 4.5); // stays down on ground!
              other.knockdownType = (isKick || Math.random() < 0.5) ? 'back' : 'knees';
              dust(other.pos, 35, 4.5);
              Sfx.stomp();
            }
            
            dust(hand, 20, 3.5);
            chunkDebris(hand, [0.95, 0.15, 0.15], 14, 10, 0.8);
            Sfx.thwack(1.6);
            if (isKick) Sfx.crash(1.2);
            addShake(isKick ? 0.5 : 0.35);
            if (G.hooks.titanHitOther) G.hooks.titanHitOther(this, other, dmg, !other.alive);
          }
        }
        if (G.horses) {
          for (const h of G.horses) {
            if (!h || h.grabbedBy || h.removed) continue;
            const dx = h.pos.x - this.pos.x, dz = h.pos.z - this.pos.z;
            const distH = Math.hypot(dx, dz);
            const fwdDot = (dx * fNormX + dz * fNormZ) / Math.max(0.1, distH);
            if (distH < punchReach + 2.5 && fwdDot > 0.3) {
              if (h.mounted) h.dismount();
              const kbDir = new THREE.Vector3(dx, 0, dz).normalize();
              h.vel.copy(kbDir).multiplyScalar(24).setY(12);
              h.onGround = false;
              dust(h.pos, 20, 2.5);
              Sfx.thwack && Sfx.thwack(1.4);
              Sfx.whinny && Sfx.whinny();
              if (window.toast) window.toast('HORSE STRUCK BY TITAN!', 2);
            }
          }
        }
      }
      if (this.st > (this.ctrl === 'player' ? 0.24 : 0.32)) { this.state = 'recover'; this.st = 0; this.atk = null; }
    } else if (this.state === 'lunge') {
      if (this.atk === 'bite' && this.st < 0.35) { const f = this.fwd; this.pos.addScaledVector(f, dt * this.h * 2.2); }
      if (this.atk === 'grab') {
        if (this.st < 0.25) this.pos.addScaledVector(this.fwd, dt * this.h * 1.5);
        // Grab hostile titans within reach (any size!)
        const grabReach = this.ctrl === 'player' ? Math.max(18, (this.h * 0.8 + 8.0) * (this.T.reach || 1)) : (this.h * 0.45 + 3.2) * (this.T.reach || 1);
        const fwdX = (this.ctrl === 'player' && this.aimPt) ? (this.aimPt.x - this.pos.x) : this.fwd.x;
        const fwdZ = (this.ctrl === 'player' && this.aimPt) ? (this.aimPt.z - this.pos.z) : this.fwd.z;
        const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
        const fNormX = fwdX / fwdLen, fNormZ = fwdZ / fwdLen;
        for (const other of G.titans) {
          if (other === this || !other.alive || other.grabbedBy) continue;
          if (this.team && other.team && this.team === other.team) continue;
          const dx = other.pos.x - this.pos.x, dz = other.pos.z - this.pos.z;
          const distH = Math.hypot(dx, dz) - other.radius;
          const fwdDot = (dx * fNormX + dz * fNormZ) / Math.max(0.1, Math.hypot(dx, dz));
          const minDot = this.ctrl === 'player' ? -0.25 : 0.25;
          if (distH < grabReach && fwdDot > minDot) {
            this.takeHoldTitan(other);
            break;
          }
        }
        // Also grab horses within reach!
        if (!this.holding && !this.holdingHorse && G.horses) {
          for (const h of G.horses) {
            if (!h || h.grabbedBy || h.removed) continue;
            const dx = h.pos.x - this.pos.x, dz = h.pos.z - this.pos.z;
            const distH = Math.hypot(dx, dz);
            const fwdDot = (dx * fNormX + dz * fNormZ) / Math.max(0.1, distH);
            if (distH < grabReach && fwdDot > 0.2) {
              this.takeHoldHorse(h);
              break;
            }
          }
        }
      }
      if (this.st > 0.4) { this.state = 'recover'; this.st = 0; this.atk = null; }
    }
  }
  // owner side: a victim reported being grabbed by this titan
  takeHold(scout) {
    if (this.holding || !this.alive) return false;
    this.holding = scout; this.holdSide = this.state === 'leap' ? -1 : this.atkSide; this.holdT = 0; this.state = 'holding'; this.st = 0; this.atk = null;
    Sfx.grabbed(); if (G.hooks.titanTook) G.hooks.titanTook(this, scout);
    return true;
  }
  takeHoldTitan(other) {
    if (this.holding || !this.alive || !other || !other.alive) return false;
    this.holding = other; other.grabbedBy = this;
    this.holdSide = this.atkSide || -1; this.holdT = 0; this.state = 'holding'; this.st = 0; this.atk = null;
    Sfx.grabbed();
    if (window.popup) window.popup(`LIFTED ${other.name || 'TITAN'}! [LMB] SLAM · [RMB] THROW`, '#ffd36a');
    if (G.hooks.titanTook) G.hooks.titanTook(this, other);
    return true;
  }
  takeHoldHorse(horse) {
    if (this.holding || this.holdingHorse || !this.alive || !horse) return false;
    this.holdingHorse = horse;
    horse.grabbedBy = this;
    if (horse.mounted) horse.dismount();
    this.holdSide = this.atkSide || -1;
    this.holdT = 0;
    this.state = 'holding';
    this.st = 0;
    this.atk = null;
    Sfx.grabbed();
    if (Sfx.whinny) Sfx.whinny();
    if (window.popup) window.popup('TITAN GRABBED A HORSE!', '#ff8844');
    return true;
  }
  startLeap(target) {
    this.state = 'leap'; this.st = 0; this.atkN++; this.hitIds.clear();
    const T = target.clone(); const d = Math.hypot(T.x - this.pos.x, T.z - this.pos.z);
    const dur = 0.6 + d / 40;
    this.leap = { from: this.pos.clone(), to: new THREE.Vector3(T.x, groundTop(T.x, T.z), T.z), dur, h: 6 + d * 0.25 };
    this.yaw = Math.atan2(T.x - this.pos.x, T.z - this.pos.z);
    this.atkCD = 4; Sfx.titanGroan(this.h, d, this.panTo(), true);
  }
  updateLeap() {
    const L = this.leap, f = Math.min(1, this.st / L.dur);
    this.pos.lerpVectors(L.from, L.to, f); this.pos.y += Math.sin(f * Math.PI) * L.h;
    if (f >= 1) {
      this.state = 'recover'; this.st = 0;
      dust(this.pos, 18, 3); Sfx.stomp(); addShake(Math.max(0, 0.5 - this.pos.distanceTo(camera.position) / 60));
      this.smashSphere(this.pos.clone().add(_v.set(0, 2, 0)), 3, 30);
    }
  }
  smash() {
    // break blocks in front of / inside the titan's body as it walks
    const f = this.fwd, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const halfW = Math.max(1, this.T.tw * this.s * 0.55), top = this.h * (this.type === 'runt' ? 0.9 : 0.8);
    const reachF = this.radius + 1.2;
    const gy = Math.floor(this.pos.y);
    let n = 0, budget = this.h > 12 ? 45 : 18;
    const strong = this.h > 12;
    for (let yy = gy; yy < gy + top && n < budget; yy++) {
      for (let u = -halfW; u <= halfW && n < budget; u += 0.9) {
        for (let w = 0; w <= reachF && n < budget; w += 0.9) {
          const x = Math.floor(this.pos.x + f.x * w + c * u), z = Math.floor(this.pos.z + f.z * w - s * u);
          const id = getBlock(x, yy, z);
          if (!id || !SOLID[id] || UNBREAKABLE.has(id)) continue;
          if (yy < groundTop(x, z) - 0) continue;
          if (WALLISH.has(id) && !strong && Math.random() > 0.2) continue;
          this.breakBlock(x, yy, z, id); n++;
        }
      }
    }
    if (n > 4) this.plowT = 0.45;   // pushing through a building slows it down
  }
  smashSphere(p, r, budget) {
    let n = 0; const r2 = r * r;
    for (let y = Math.floor(p.y - r); y <= p.y + r && n < budget; y++) for (let z = Math.floor(p.z - r); z <= p.z + r && n < budget; z++) for (let x = Math.floor(p.x - r); x <= p.x + r && n < budget; x++) {
      const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, dz = z + 0.5 - p.z; if (dx * dx + dy * dy + dz * dz > r2) continue;
      const id = getBlock(x, y, z); if (!id || !SOLID[id] || UNBREAKABLE.has(id)) continue;
      if (y < groundTop(x, z)) continue;
      if (WALLISH.has(id) && this.h < 12 && Math.random() > 0.3) continue;
      this.breakBlock(x, y, z, id); n++;
    }
  }
  breakBlock(x, y, z, id) {
    setBlock(x, y, z, 0, true);
    if (G.hooks.blockEdit) G.hooks.blockEdit(x, y, z, this);
    if (Math.random() < 0.35) debris(x, y, z, id, 2, 7, 0.4);
    if (Math.random() < 0.08) dust(_v.set(x + 0.5, y, z + 0.5), 1, 2);
    if (G.hooks.blockBroken) G.hooks.blockBroken(x, y, z, id, this.id);
    const above = getBlock(x, y + 1, z); if (above && !SOLID[above]) { setBlock(x, y + 1, z, 0, true); if (G.hooks.blockEdit) G.hooks.blockEdit(x, y + 1, z); }
    this.crashT = (this.crashT || 0) + 1;
  }
  // ---------------------------------------------------------------- animation
  animate(dt, moving) {
    const m = this.m, T = this.T, t = G.time;
    const tg = { hipsY: 0, torsoX: 0.05, torsoY: 0, torsoZ: 0, neckX: 0, neckY: 0, shRX: 0, shRZ: -0.08, elRX: -0.2, shLX: 0, shLZ: 0.08, elLX: -0.2, hpRX: 0, knRX: 0, hpLX: 0, knLX: 0, drop: 0, aimR: null, aimL: null };
    const ab = this.type === 'abnormal';
    if (moving || this.state === 'leap') {
      const amp = ab ? 0.85 : 0.5, sw = Math.sin(this.walkPh) * amp;
      tg.hpRX = sw; tg.hpLX = -sw; tg.knRX = Math.max(0, -Math.cos(this.walkPh)) * amp * 1.3; tg.knLX = Math.max(0, Math.cos(this.walkPh)) * amp * 1.3;
      tg.shRX = -sw * 0.7; tg.shLX = sw * 0.7;
      tg.hipsY = Math.abs(Math.cos(this.walkPh)) * 0.6; tg.torsoZ = Math.sin(this.walkPh) * 0.06;
      if (ab) { tg.torsoX = 0.55; tg.shRZ = -0.9 + Math.sin(this.walkPh * 2) * 0.4; tg.shLZ = 0.9 - Math.sin(this.walkPh * 2) * 0.4; tg.shRX = -1.0 - sw; tg.shLX = -1.0 + sw; tg.neckX = -0.4; }
    } else {
      const br = Math.sin(t * 1.3 + this.walkPh) * 0.04;
      tg.shRZ += -br; tg.shLZ += br; tg.torsoX += br * 0.5;
    }
    if (this.type === 'dummy') { tg.shRZ = -1.3; tg.shLZ = 1.3; tg.elRX = 0; tg.elLX = 0; }
    // looking at the target (or where the pilot aims)
    const P = this.ctrl === 'player' && this.lookPt ? { pos: this.lookPt } : this.target;
    if (P && this.alertness > 0.3) {
      let d = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      tg.neckY = Math.max(-0.9, Math.min(0.9, d)) * 0.8;
      const up = Math.atan2(P.pos.y - (this.pos.y + this.h * 0.9), Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z));
      tg.neckX = Math.max(-0.6, Math.min(0.5, -up)) + (tg.neckX || 0) * 0.5;
    }
    const side = this.atkSide; // -1 = right arm, 1 = left arm
    const sh = side < 0 ? 'shR' : 'shL', el = side < 0 ? 'elR' : 'elL';
    if (this.state === 'windup' || this.state === 'strike') {
      if (this.atk === 'swipe') {
        if (this.state === 'windup') {
          const k = Math.min(1, this.st / this.windDur);
          tg[sh + 'X'] = -2.5 * k; tg[sh + 'Z'] = side * 0.9 * k; tg[el + 'X'] = -0.6 * k; tg.torsoY = -side * 0.7 * k; tg.torsoX = -0.15 * k;
        } else {
          const k = Math.min(1, this.st / 0.25);
          const low = this.aimLow || 0;
          tg[sh + 'X'] = -1.4 + low; tg[sh + 'Z'] = side * 0.3; tg[el + 'X'] = -0.15; tg.torsoY = -side * 0.7 + side * 1.8 * k; tg.torsoX = 0.25 + low * 0.45;
        }
      } else if (this.atk === 'stomp' || this.atk === 'kick') {
        const k = Math.min(1, this.st / this.windDur);
        if (this.state === 'windup') { tg.hpRX = -1.4 * k; tg.knRX = 0.9 * k; tg.torsoX = -0.25 * k; tg.shRZ = -0.7 * k; tg.shLZ = 0.7 * k; }
        else { tg.hpRX = -2.1; tg.knRX = 0.1; tg.torsoX = -0.35; }
      }
    }
    if ((this.state === 'windup' && this.atk === 'grab') || this.state === 'lunge') {
      const tgt = this.grabAim || (P ? P.pos : this.headWorld(_v2).addScaledVector(this.fwd, this.h));
      tg[side < 0 ? 'aimR' : 'aimL'] = tgt;
      tg.torsoX = this.state === 'lunge' ? 0.5 : 0.2; tg[el + 'X'] = this.state === 'lunge' ? 0 : -0.5;
    }
    if (this.state === 'holding') {
      const face = this.headWorld(_v2).clone().addScaledVector(this.fwd, this.h * 0.25).add(_v.set(0, -this.h * 0.08, 0));
      tg[side < 0 ? 'aimR' : 'aimL'] = face; tg[el + 'X'] = -0.9; tg.torsoX = 0.15;
    }
    if (this.state === 'crippled' || this.state === 'rise') {
      const k = this.state === 'rise' ? 1 - Math.min(1, this.st / 1.2) : Math.min(1, this.st / 0.5);
      if (this.knockdownType === 'back') {
        this.rootPitch = -1.35 * k;
        tg.torsoX = -0.4 * k;
        tg.hpRX = -0.5 * k; tg.hpLX = -0.5 * k;
        tg.knRX = 0.6 * k; tg.knLX = 0.6 * k;
        tg.drop = (T.sl + T.tl) * 0.9 * k;
      } else {
        this.rootPitch = 0;
        tg.hpRX = -0.6 * k; tg.hpLX = -0.6 * k;
        tg.knRX = 2.1 * k; tg.knLX = 2.1 * k;
        tg.torsoX = 0.55 * k;
        tg.drop = (T.sl + T.tl * 0.6) * k;
      }
      tg.shRZ = -0.6 * k; tg.shLZ = 0.6 * k; tg.shRX = -0.5 * k; tg.shLX = -0.5 * k;
    } else if (!this.thrown) {
      this.rootPitch = 0;
    }
    if (this.state === 'stagger') { tg.torsoX = -0.3; tg.neckX = -0.5; tg.shRZ = -0.7; tg.shLZ = 0.7; }
    if (this.napeGuard > 0) {
      // one hand clamped over the back of the neck
      const g = this.guardSide || -1, gs = g < 0 ? 'shR' : 'shL', ge = g < 0 ? 'elR' : 'elL';
      tg[gs + 'X'] = -2.9; tg[gs + 'Z'] = g * 0.35; tg[ge + 'X'] = -2.1; tg.neckX = 0.35; tg.torsoX = 0.15;
      if (g < 0) tg.aimR = null; else tg.aimL = null;
    }
    if (this.state === 'charge') { tg.torsoX = 0.6; tg.neckX = -0.3; tg.shRX = -0.8; tg.shLX = -0.8; tg.shRZ = -0.5; tg.shLZ = 0.5; }
    if (this.kit && this.kit.roarPose > 0) {
      // E: War Cry & Earth Stomp - Reared back roaring with stomping leg
      tg.torsoX = -0.85; tg.neckX = -0.95;
      tg.shRX = -2.2; tg.shLX = -2.2;
      tg.shRZ = -1.4; tg.shLZ = 1.4;
      tg.elRX = -0.6; tg.elLX = -0.6;
      tg.hpRX = -1.3; tg.knRX = 1.0; // Stomping leg
    }
    if (this.kit && this.kit.dashPunch) {
      // Q: Megaton Dash Punch - Deep lunging haymaker punch stance
      tg.torsoX = 0.85; tg.neckX = -0.3;
      tg.shRX = -2.8; tg.shRZ = -0.3; tg.elRX = -0.15;
      tg.shLX = 0.6; tg.shLZ = 0.5; tg.elLX = -0.8;
      tg.hpRX = -0.9; tg.knRX = 0.6; tg.hpLX = 0.8; tg.knLX = 0.3;
    }
    if (this.airborne) {
      // R: Seismic Ground Slam / Hop - Double fist hammer overhead in mid-air
      tg.torsoX = -0.35; tg.neckX = -0.4;
      tg.shRX = -2.85; tg.shLX = -2.85;
      tg.shRZ = -0.25; tg.shLZ = 0.25;
      tg.elRX = -0.7; tg.elLX = -0.7;
      tg.hpRX = -0.7; tg.knRX = 1.2;
      tg.hpLX = -0.7; tg.knLX = 1.2;
    }
    // flinch
    tg.torsoX -= this.flinch * 0.25; tg.neckX -= this.flinch * 0.3;
    // apply with smoothing
    const k = 1 - Math.exp(-dt * (this.state === 'strike' || this.state === 'lunge' ? (this.ctrl === 'player' ? 32 : 22) : this.state === 'windup' && this.ctrl === 'player' ? 16 : 9));
    const C = this.cur;
    for (const key in tg) { if (key.startsWith('aim')) continue; if (C[key] === undefined) C[key] = tg[key]; C[key] += (tg[key] - C[key]) * k; }
    const setQ = (bone, x, y, z) => { bone.quaternion.slerp(_q.setFromEuler(_e.set(x, y, z)), 1); };
    m.hips.position.y = T.tl + T.sl + C.hipsY - C.drop;
    setQ(m.torso, C.torsoX, C.torsoY, C.torsoZ);
    setQ(m.neck, C.neckX, C.neckY, 0);
    setQ(m.elR, C.elRX, 0, 0); setQ(m.elL, C.elLX, 0, 0);
    setQ(m.hpR, C.hpRX, 0, 0); setQ(m.knR, C.knRX, 0, 0); setQ(m.hpL, C.hpLX, 0, 0); setQ(m.knL, C.knLX, 0, 0);
    this.root.position.copy(this.pos); this.root.position.y -= this.sink;
    this.root.rotation.set(this.rootPitch, this.yaw, 0, 'YXZ');
    this.root.updateMatrixWorld(true);
    for (const [bone, ax, az, aim] of [[m.shR, C.shRX, C.shRZ, tg.aimR], [m.shL, C.shLX, C.shLZ, tg.aimL]]) {
      if (aim) bone.quaternion.slerp(aimQuat(bone, aim, _q), Math.min(1, dt * 12));
      else bone.quaternion.slerp(_q.setFromEuler(_e.set(ax, 0, az)), Math.min(1, dt * 14));
    }
    // lost forearms
    m.elR.scale.setScalar(this.dis.armR > 0 ? Math.max(0.001, 1 - Math.min(1, (12 - this.dis.armR) * 4)) + Math.max(0, 1.5 - this.dis.armR) / 1.5 : 1);
    m.elL.scale.setScalar(this.dis.armL > 0 ? Math.max(0.001, 1 - Math.min(1, (12 - this.dis.armL) * 4)) + Math.max(0, 1.5 - this.dis.armL) / 1.5 : 1);
    this.root.updateMatrixWorld(true);
    // flash colours: BRIGHT RED hit flash, red pulse during windups, and persistent glowing red during death!
    const em = this.m.mat.emissive;
    if (this.state === 'dying' || this.state === 'dissolve') {
      em.setRGB(0.9, 0.08, 0.04);
    } else if (this.flash > 0) {
      em.setRGB(this.flash * 0.95, this.flash * 0.05, this.flash * 0.05);
    } else if (this.state === 'windup' || this.state === 'lunge') {
      const p = 0.5 + 0.5 * Math.sin(G.time * 30);
      em.setRGB(0.55 * p, 0.06 * p, 0.03 * p);
    } else {
      em.setRGB(0, 0, 0);
    }
    if (this.m.glowMat) this.m.glowMat.color.setRGB(1, 0.45 + Math.sin(G.time * 6) * 0.15, 0.1);
  }
  updateFx(dt) {
    // alert sprite above the head during windups
    const winding = this.state === 'windup' || this.state === 'lunge' || this.state === 'leap' && this.st < 0.3;
    this.alert.visible = winding;
    if (winding) {
      this.headWorld(this.alert.position); this.alert.position.y += this.T.head * this.s * 0.9 + 0.8;
      const d = this.alert.position.distanceTo(camera.position); const sc = Math.max(1.2, d * 0.045) * (1 + 0.15 * Math.sin(G.time * 25));
      this.alert.scale.set(sc, sc, 1);
    }
    // nape marker for the local scout: gold when you can cut it, blue when guarded, faint from the front
    const P = G.player;
    if (P && this.alive && !G.localTitan && P.alive) {
      const np = this.napeWorld(_v2);
      const d = np.distanceTo(P.pos);
      const behind = _v.subVectors(P.pos, this.pos).setY(0).normalize().dot(this.fwd) < 0.2 || P.pos.y > this.pos.y + this.h;
      const ns = G.napeSense, focus = ns && ns.t === this;
      const open = !(this.napeGuard > 0 || this.hardened > 0) && (!this.boss || this.boss.napeExposed(this));
      const show = d < 42 && open ? (behind ? 0.9 : 0.3) : (d < 30 && !open ? 0.6 : 0);
      const mat = this.napeMark.material;
      mat.opacity += (show - mat.opacity) * Math.min(1, dt * 6);
      mat.color.setHex(!open ? 0x8cc8ff : focus && ns.state === 'strike' ? 0xffffff : focus && ns.state === 'slow' ? 0xffa060 : 0xffd36a);
      this.napeMark.visible = mat.opacity > 0.02;
      if (this.napeMark.visible) {
        this.m.neck.localToWorld(this.napeMark.position.set(0, 1.6, -3.4));
        const strike = focus && ns.state === 'strike';
        const sc = Math.max(0.6, this.h * 0.12) * (strike ? 1.5 + 0.25 * Math.sin(G.time * 30) : 1 + 0.12 * Math.sin(G.time * 8));
        this.napeMark.scale.set(sc, sc, 1);
      }
    } else { this.napeMark.visible = false; }
    // steam from cuts
    for (let i = this.steamSrc.length - 1; i >= 0; i--) {
      const s = this.steamSrc[i]; s.t -= dt;
      if (s.t <= 0) { this.steamSrc.splice(i, 1); continue; }
      if (Math.random() < dt * 14) {
        s.bone.localToWorld(_v.set(s.x, s.y, s.z));
        steam.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, 1.6, this.h * 0.05, this.h * 0.2, 0.95, 0.95, 0.96, 0.45, -0.8, 1);
      }
    }
    placeShadow(this.shadow, this.pos.x, this.pos.y + 0.5, this.pos.z, this.h * 0.55, 12);
  }
  updateDeath(dt) {
    const T = this.T;
    // Aerial death gravity: Pull falling dead carcass down to the ground!
    const gy = groundTop(this.pos.x, this.pos.z);
    if (this.pos.y > gy) {
      this.pos.y = Math.max(gy, this.pos.y - 32 * dt);
      if (this.pos.y <= gy) {
        dust(this.pos, 35, this.h * 0.3);
        if (Sfx.collapse) Sfx.collapse();
        addShake(0.6);
      }
    }
    if (this.state === 'dying') {
      const f = Math.min(1, this.st / 1.6);
      const e = f * f;
      this.rootPitch = this.fallDir * e * 1.45;
      const C = this.cur;
      C.knRX = (C.knRX || 0) + (1.2 - (C.knRX || 0)) * dt * 4; C.knLX = (C.knLX || 0) + (1.2 - (C.knLX || 0)) * dt * 4;
      this.sink = e * T.sl * this.s * 0.6;
      this.m.knR.rotation.x = C.knRX; this.m.knL.rotation.x = C.knLX;
      this.m.shR.rotation.set(-1.2 * e, 0, -0.6); this.m.shL.rotation.set(-1.0 * e, 0, 0.6);
      this.m.neck.rotation.x = -0.3 * e;
      this.root.position.copy(this.pos); this.root.position.y -= this.sink;
      this.root.rotation.set(this.rootPitch, this.yaw, 0, 'YXZ');
      this.root.updateMatrixWorld(true);
      if (Math.random() < dt * 20) { this.chest(_v); steam.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3, 2, this.h * 0.08, this.h * 0.3, 1, 1, 1, 0.5, -1, 1); }
      if (f >= 1) {
        this.state = 'dissolve'; this.st = 0;
        const d = this.pos.distanceTo(camera.position);
        Sfx.collapse(); addShake(Math.max(0, 0.7 * this.h / 15 - d / 80));
        const fall = _v.copy(this.fwd).multiplyScalar(this.fallDir * this.h * 0.5).add(this.pos);
        dust(fall, 26, this.h * 0.25, [0.75, 0.7, 0.6], this.h * 0.5);
        this.smashSphere(fall.add(_v2.set(0, this.h * 0.12, 0)), this.h * 0.22, 60);
        this.alert.visible = false; this.napeMark.visible = false; this.shadow.visible = false;
      }
      return;
    }
    // dissolving into hot steam
    const f = Math.min(1, this.st / 6);
    for (const mt of this.m.mats) {
      if (mt.color) mt.color.setRGB(1 - f * 0.55, 1 - f * 0.65, 1 - f * 0.65);
      if (mt.emissive) mt.emissive.setRGB(0.45 * (1 - f) * Math.min(1, this.st * 2), 0.12 * (1 - f), 0.02);
    }
    this.sink += dt * this.h * 0.03;
    this.root.position.y = this.pos.y - this.sink;
    const sc = 1 - f * 0.35; this.m.model.scale.setScalar(this.s * sc);
    this.root.updateMatrixWorld(true);
    const rate = (1 - f) * 55 * Math.min(1.2, this.h / 8 + 0.3) + 6;
    for (let i = 0; i < rate * dt; i++) {
      const parts = [this.m.torso, this.m.head, this.m.hpR, this.m.hpL, this.m.shR, this.m.shL, this.m.knR, this.m.knL];
      const b = parts[Math.floor(Math.random() * parts.length)];
      b.localToWorld(_v.set((Math.random() - 0.5) * 6, -Math.random() * 6, (Math.random() - 0.5) * 6));
      steam.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 2.5, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 2.5, 2.4 + Math.random() * 1.2, this.h * 0.12 + 0.6, this.h * 0.5 + 2, 0.97, 0.95, 0.93, 0.55, -1.4, 0.7);
    }
    if (f >= 1) this.remove();
  }
  remove() {
    if (this.removed) return;
    this.removed = true;
    scene.remove(this.root); scene.remove(this.alert); scene.remove(this.napeMark); scene.remove(this.shadow);
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const mt of this.m.mats) { if (mt.map) mt.map.dispose(); mt.dispose(); }
  }
}

/* ---- ray and sphere queries against titan hitboxes ---- */
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Matrix4(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
export function rayTitans(origin, dir, maxT) {
  let best = null;
  for (const t of G.titans) {
    if (!t.alive && t.state !== 'dying') continue;
    if (t.pos.distanceTo(origin) > maxT + t.h * 1.5) continue;
    for (const hb of t.m.hit) {
      const bone = hb[1];
      _inv.copy(bone.matrixWorld).invert();
      _o.copy(origin).applyMatrix4(_inv);
      _d.copy(dir).transformDirection(_inv).multiplyScalar(1); // normalized; recompute scale below
      // use un-normalised direction to keep t in world units
      _d.copy(origin).add(dir).applyMatrix4(_inv).sub(_o);
      let t0 = 0, t1 = maxT;
      const c = [hb[2], hb[3], hb[4]], h = [hb[5], hb[6], hb[7]], oo = [_o.x, _o.y, _o.z], dd = [_d.x, _d.y, _d.z];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        const lo = c[a] - h[a], hi = c[a] + h[a];
        if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < lo || oo[a] > hi) { ok = false; break; } continue; }
        let ta = (lo - oo[a]) / dd[a], tb = (hi - oo[a]) / dd[a]; if (ta > tb) { const s = ta; ta = tb; tb = s; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
      }
      if (ok && (!best || t0 < best.t)) {
        best = { t: t0, titan: t, bone, name: hb[0], local: new THREE.Vector3(oo[0] + dd[0] * t0, oo[1] + dd[1] * t0, oo[2] + dd[2] * t0) };
      }
    }
  }
  return best;
}
export function sphereTitanParts(t, p, r) {
  // returns list of {name, dist} for hitboxes within r of p
  const out = [];
  const sc = t.s;
  for (const hb of t.m.hit) {
    obbLocal(hb[1], p, _v);
    const dx = Math.max(0, Math.abs(_v.x - hb[2]) - hb[5]), dy = Math.max(0, Math.abs(_v.y - hb[3]) - hb[6]), dz = Math.max(0, Math.abs(_v.z - hb[4]) - hb[7]);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * sc;
    if (d <= r) out.push({ name: hb[0], dist: d, bone: hb[1] });
  }
  return out;
}
// push a point out of a titan's solid parts (torso, head, legs); returns push normal or null
export function pushOutOfTitan(t, p, rad) {
  if (!t.alive) return null;
  for (const hb of t.m.hit) {
    const n = hb[0]; if (n === 'nape' || n.startsWith('arm')) continue;
    obbLocal(hb[1], p, _v);
    const r = rad / t.s;
    const px = hb[5] + r - Math.abs(_v.x - hb[2]), py = hb[6] + r - Math.abs(_v.y - hb[3]), pz = hb[7] + r - Math.abs(_v.z - hb[4]);
    if (px > 0 && py > 0 && pz > 0) {
      if (px < py && px < pz) _v.x += Math.sign(_v.x - hb[2]) * px; else if (py < pz) _v.y += Math.sign(_v.y - hb[3]) * py; else _v.z += Math.sign(_v.z - hb[4]) * pz;
      hb[1].localToWorld(_v);
      const nrm = _v.clone().sub(p); p.copy(_v);
      return nrm.normalize();
    }
  }
  return null;
}

/* ---- projectiles: boulders, rock shards (titans) ----
   Every client simulates every projectile; damage is checked against the scouts each client owns,
   and only the thrower's owner breaks blocks (and broadcasts the edits). */
const boulderGeo = new THREE.BoxGeometry(1, 1, 1);
let projSeq = 0;
export function throwBoulder(from, to, size = 2.4, opts = {}) {
  const T = Math.max(1.0, from.distanceTo(to) / (opts.speed || 30));
  const v = new THREE.Vector3().subVectors(to, from).divideScalar(T); v.y += 0.5 * 22 * T;
  return spawnProjectile({ id: opts.id || ('pr' + (++projSeq) + Math.random().toString(36).slice(2, 4)), from: [from.x, from.y, from.z], v: [v.x, v.y, v.z], size, dmg: opts.dmg || 25, by: opts.by || null, mine: opts.mine !== false, blast: opts.blast ?? 2, color: opts.color });
}
export function spawnProjectile(sp) {
  const mat = new THREE.MeshLambertMaterial({ color: sp.color || 0x8a8580 });
  const m = new THREE.Mesh(boulderGeo, mat); m.scale.setScalar(sp.size); m.position.set(sp.from[0], sp.from[1], sp.from[2]); scene.add(m);
  const b = { id: sp.id, m, v: new THREE.Vector3(sp.v[0], sp.v[1], sp.v[2]), size: sp.size, life: 7, dmg: sp.dmg, by: sp.by, mine: sp.mine, blast: sp.blast, hitIds: new Set(), w: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4) };
  G.projectiles.push(b);
  if (sp.mine && G.hooks.projectileSpawned) G.hooks.projectileSpawned(sp);
  return b;
}
export function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const b = G.projectiles[i];
    b.life -= dt; b.v.y -= 22 * dt;
    b.m.position.addScaledVector(b.v, dt);
    b.m.rotation.x += b.w.x * dt; b.m.rotation.y += b.w.y * dt;
    if (Math.random() < dt * 20) steam.spawn(b.m.position.x, b.m.position.y, b.m.position.z, 0, 0.5, 0, 0.8, 0.8, 2, 0.75, 0.72, 0.7, 0.3, 0, 1);
    let hit = false;
    for (const sc of G.scouts) {
      if (!sc.local || !sc.alive || b.hitIds.has(sc.id)) continue;
      if (b.m.position.distanceTo(scoutChest(sc, _v)) < b.size * 0.6 + 0.8) {
        hit = true; b.hitIds.add(sc.id);
        if (G.hooks.hurtScout) G.hooks.hurtScout(sc, b.dmg, b.v.clone().setY(0).normalize().multiplyScalar(18).setY(8), b.by, 'Crushed by a boulder');
      }
    }
    // Check collision with hostile titans
    for (const t of G.titans) {
      if (!t.alive || t.id === b.by || b.hitIds.has(t.id)) continue;
      if (b.by) {
        const src = G.titans.find(x => x.id === b.by);
        if (src && src.team && t.team && src.team === t.team) continue;
      }
      if (b.m.position.distanceTo(t.chest(_v)) < b.size * 0.7 + t.radius) {
        hit = true; b.hitIds.add(t.id);
        t.hurtHP(Math.round(b.dmg * 1.5), { by: b.by, kind: 'boulder' });
        t.flash = 1; t.flinch = 1.4;
        if (t.ctrl === 'ai') { t.state = 'stagger'; t.st = 0; t.staggerDur = 0.75; }
        break;
      }
    }
    const p = b.m.position;
    if (!hit && (SOLID[getBlock(Math.floor(p.x), Math.floor(p.y - b.size * 0.4), Math.floor(p.z))] || b.life <= 0)) hit = true;
    if (hit) {
      dust(p, 12, 2.5); chunkDebris(p, [0.55, 0.53, 0.5], 8, 9, 0.6); Sfx.crash(1);
      addShake(Math.max(0, 0.5 - p.distanceTo(camera.position) / 50));
      if (b.mine && b.blast > 0) {
        const r = b.blast, r2 = r * r + 1;
        for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) {
          if (x * x + y * y + z * z > r2) continue;
          const bx = Math.floor(p.x) + x, by = Math.floor(p.y) + y, bz = Math.floor(p.z) + z, id = getBlock(bx, by, bz);
          if (id && SOLID[id] && by >= groundTop(bx, bz) && id !== B.BEDROCK) { setBlock(bx, by, bz, 0, true); if (G.hooks.blockEdit) G.hooks.blockEdit(bx, by, bz, b.by); if (G.hooks.blockBroken) G.hooks.blockBroken(bx, by, bz, id, b.by); }
        }
      }
      scene.remove(b.m); b.m.material.dispose(); G.projectiles.splice(i, 1);
    }
  }
}

/* ---- area effects (stomps, steam blasts, roars) — applied to scouts and enemy titans ---- */
// e: { x, y, z, r, dmg, kb, up, falloff, detach, jam, yMax, by, reason }
export function areaEffect(e, broadcast = true) {
  if (broadcast && G.hooks.aoeSent) G.hooks.aoeSent(e);
  for (const sc of G.scouts) {
    if (!sc.local || !sc.alive) continue;
    const dx = sc.pos.x - e.x, dz = sc.pos.z - e.z, dy = sc.pos.y - e.y, d = Math.hypot(dx, dy, dz);
    if (d > e.r || (e.yMax !== undefined && dy > e.yMax)) continue;
    const f = e.falloff ? 1 - 0.75 * (d / e.r) : 1;
    const kb = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar((e.kb || 0) * f).setY((e.up || 0) * f);
    if (e.detach && G.hooks.detachScout) G.hooks.detachScout(sc, e.jam || 0);
    if (e.dmg && G.hooks.hurtScout) G.hooks.hurtScout(sc, Math.round(e.dmg * f), kb, e.by, e.reason || 'Caught in the blast');
    else if (kb.lengthSq() > 0.01 && G.hooks.pushScout) G.hooks.pushScout(sc, kb);
  }
  // Also damage enemy titans in the blast
  for (const t of G.titans) {
    if (!t.alive || t.id === e.by) continue;
    if (e.by) {
      const src = G.titans.find(x => x.id === e.by);
      if (src && src.team && t.team && src.team === t.team) continue;
    }
    const dx = t.pos.x - e.x, dz = t.pos.z - e.z, dy = t.pos.y - e.y, d = Math.hypot(dx, dz);
    if (d > e.r + t.radius || (e.yMax !== undefined && dy > e.yMax)) continue;
    const f = e.falloff ? 1 - 0.7 * (d / (e.r + t.radius)) : 1;
    const dmg = Math.round((e.dmg || 0) * f * 1.3);
    if (dmg > 0) {
      t.hurtHP(dmg, { by: e.by, kind: 'aoe' });
      t.flash = 1; t.flinch = 1.2;
      if (t.ctrl === 'ai' && dmg > 16) { t.state = 'stagger'; t.st = 0; t.staggerDur = 0.65; }
    }
    if (e.kb) {
      const kbDir = new THREE.Vector3(dx, 0, dz).normalize();
      t.pos.addScaledVector(kbDir, Math.min(6, (e.kb || 0) * 0.12));
    }
  }
}

/* ---- victim side: does any titan's swipe / grab / bite / leap reach this scout right now? ---- */
export function titanThreats(sc) {
  if (!sc.alive || sc.grabbedBy || sc.invuln > 0) return;
  const ch = scoutChest(sc, _v);
  for (const t of G.titans) {
    if (!t.alive || t.team !== 'titans' || t.hitIds.has(sc.id)) continue;
    if (Math.abs(t.pos.x - ch.x) > t.h * 1.4 + 6 || Math.abs(t.pos.z - ch.z) > t.h * 1.4 + 6) continue;
    const reach = t.T.reach || 1;
    if (t.state === 'strike' && t.atk === 'swipe' && t.st > 0.05) {
      // distance to the whole forearm, not just the hand
      const hand = t.handWorld(t.atkSide, _v2), elb = (t.atkSide > 0 ? t.m.elL : t.m.elR).getWorldPosition(_v4);
      const seg = _v5.subVectors(hand, elb), f = Math.max(0, Math.min(1, _v6.subVectors(ch, elb).dot(seg) / Math.max(1e-6, seg.lengthSq())));
      const near = _v6.copy(elb).addScaledVector(seg, f);
      if (near.distanceTo(ch) < (t.h * 0.17 + 1.7) * reach) {
        t.hitIds.add(sc.id);
        const kb = new THREE.Vector3().subVectors(ch, t.pos).setY(0).normalize().multiplyScalar(22).setY(9);
        const dmg = t.T.swipe || SWIPE_DMG[t.type] || 28;
        if (G.hooks.hurtScout) G.hooks.hurtScout(sc, Math.round(dmg * (t.dmgMul || 1)), kb, t.id, t.name ? `Swatted by ${t.name}` : 'Swatted by a titan');
        return;
      }
    } else if (t.state === 'lunge' && t.st > 0.08 && !t.holding) {
      const hand = t.atk === 'bite' ? t.headWorld(_v2) : t.handWorld(t.atkSide, _v2);
      if (hand.distanceTo(ch) < (t.h * 0.14 + 1.3) * reach * (t.atk === 'bite' ? 1.6 : 1)) {
        t.hitIds.add(sc.id);
        if (t.atk === 'bite') { if (G.hooks.hurtScout) G.hooks.hurtScout(sc, Math.round(55 * (t.dmgMul || 1)), new THREE.Vector3().subVectors(ch, t.pos).setY(0).normalize().multiplyScalar(14).setY(6), t.id, t.name ? `Mauled by ${t.name}` : 'Mauled'); }
        else if (G.hooks.grabScout) G.hooks.grabScout(t, sc);
        return;
      }
    } else if (t.state === 'leap' && t.st > 0.3) {
      const hand = t.handWorld(-1, _v2);
      if (hand.distanceTo(ch) < 2.6 * reach) { t.hitIds.add(sc.id); if (G.hooks.grabScout) G.hooks.grabScout(t, sc); return; }
    }
  }
}

/* =========================================================================
   The Bastion — armoured colossus, three phases.
   1: armoured; break both glowing knees to drop it, then crack the nape plate.
   2: unleashed; faster, hurls boulders, summons runts; two nape cuts.
   3: scalding; vents steam blasts on a timer; one final nape cut.
   ========================================================================= */
export class BossBrain {
  constructor() {
    this.phase = 1; this.knees = { ankleL: 3, ankleR: 3 }; this.plateHP = 1; this.napeHP2 = 2; this.rage = 1;
    this.throwT = 6; this.ventT = 8; this.venting = 0; this.kneelT = 0; this.stompCD = 0; this.summoned = false;
    this.events = [];
  }
  napeExposed() { return this.phase >= 2 || this.kneelT > 0; }
  wantsStomp(t, dist, dy) { return dy < 3 && dist < t.h * 0.5 && this.stompCD <= 0; }
  stomp(t) {
    this.stompCD = 5;
    const foot = t.pos.clone().addScaledVector(t.fwd, t.h * 0.15);
    Sfx.stomp(); dust(foot, 30, 4, [0.75, 0.7, 0.6], 6); addShake(0.6);
    areaEffect({ x: foot.x, y: foot.y, z: foot.z, r: 14, yMax: 4, dmg: 20, kb: 20, up: 12, by: t.id, reason: 'Stomped by the Bastion' });
    t.smashSphere(foot, 4, 50);
  }
  armored(part) {
    if (this.phase >= 2) return part === 'head' || part === 'torso';
    if (part === 'nape') return this.kneelT <= 0;
    return part !== 'ankleL' && part !== 'ankleR';
  }
  hit(t, part, info) {
    const at = info.point || t.pos;
    if (this.phase === 1) {
      if (part === 'ankleL' || part === 'ankleR') {
        if (this.knees[part] <= 0) return { kind: 'armor' };
        this.knees[part]--;
        sparkBurst(at, 24, 12, [1, 0.6, 0.2]);
        if (this.knees[part] <= 0) {
          const idx = part === 'ankleR' ? 0 : 1;
          t.m.kneeGlow[idx].visible = false;
          this.events.push({ msg: 'KNEE SHATTERED', sub: 'Break the other knee!' });
          if (this.knees.ankleL <= 0 && this.knees.ankleR <= 0) {
            this.kneelT = 10; t.dis.legs = 10; t.state = 'crippled'; t.st = 0; t.atk = null;
            if (t.holding) t.release(true);
            t.m.napePlate.material = new THREE.MeshLambertMaterial({ color: 0xffb070, emissive: 0x803010 });
            this.events.push({ msg: 'THE BASTION FALLS!', sub: 'Its nape armour is cracked — strike now!' });
            Sfx.collapse(); addShake(0.8);
          }
          return { kind: 'limb' };
        }
        return { kind: 'weak' };
      }
      if (part === 'nape' && this.kneelT > 0) {
        if (!info.deep) return { kind: 'shallow' };
        // shatter the plate: phase 2
        this.phase = 2; this.rage = 1.35; this.kneelT = 0; t.dis.legs = 0.5; t.state = 'stagger'; t.st = 0; t.staggerDur = 2.5;
        t.speed = 5.2;
        this.shedArmor(t);
        this.events.push({ msg: 'ARMOUR BROKEN', sub: 'Phase 2 — the Bastion is unleashed!', phase: 2, napeHit: true });
        return { kind: 'bosshit' };
      }
      return { kind: 'armor' };
    }
    if (part === 'nape') {
      if (!info.deep) return { kind: 'shallow' };
      if (this.phase === 2) {
        this.napeHP2--;
        t.state = 'stagger'; t.st = 0; t.staggerDur = 2; t.atk = null; if (t.holding) t.release(true);
        if (this.napeHP2 <= 0) {
          this.phase = 3; this.rage = 1.6; this.ventT = 4; this.events.push({ msg: 'IT BURNS!', sub: 'Phase 3 — dodge the steam blasts, then finish it!', phase: 3, napeHit: true });
        } else this.events.push({ msg: 'DEEP CUT!', sub: 'One more cut to break its will', napeHit: true });
        return { kind: 'bosshit' };
      }
      if (this.phase === 3) {
        if (this.venting > 0) return { kind: 'armor' };
        t.kill(info); return { kind: 'kill' };
      }
    }
    if (this.armored(part)) return { kind: 'armor' };
    return null; // normal handling (limb cuts slow it)
  }
  shedArmor(t) {
    for (const a of t.m.armor) {
      if (a.userData.name === 'helm') continue;
      const p = a.getWorldPosition(new THREE.Vector3());
      chunkDebris(p, [0.85, 0.9, 0.97], 4, 10, 1.4);
      a.visible = false;
    }
    steamBurst(t.chest(new THREE.Vector3()), 60, t.h * 0.3, t.h * 0.15, 8, 3);
    Sfx.steamBurst(1.5); Sfx.armorClank(); addShake(0.6);
    for (const k of t.m.kneeGlow) k.visible = false;
  }
  update(t, dt) {
    this.stompCD -= dt;
    if (this.kneelT > 0) {
      this.kneelT -= dt;
      if (this.kneelT <= 0 && this.phase === 1) {
        // it stands back up; knees regrow partially
        this.knees.ankleL = 2; this.knees.ankleR = 2; for (const k of t.m.kneeGlow) k.visible = true;
        t.m.napePlate.material = t.m.armor[0].material;
        this.events.push({ msg: 'IT RISES AGAIN', sub: 'Break both knees once more!' });
      }
    }
    const P = t.target;
    if (this.phase >= 2 && t.alive) {
      if (!this.summoned) { this.summoned = true; this.events.push({ summon: 2 }); }
      this.throwT -= dt;
      const d = P ? t.pos.distanceTo(P.pos) : 0;
      if (this.throwT <= 0 && P && P.alive && d > 22 && d < 110 && (t.state === 'walk' || t.state === 'chase')) {
        this.throwT = this.phase === 3 ? 4.5 : 6;
        const from = t.handWorld(-1, new THREE.Vector3()).add(new THREE.Vector3(0, 2, 0));
        const to = P.pos.clone().addScaledVector(P.vel, Math.min(1.5, d / 30));
        throwBoulder(from, to, 2.6, { by: t.id });
        Sfx.titanGroan(t.h, d, 0, false);
      }
    }
    if (this.phase === 3 && t.alive) {
      if (this.venting > 0) {
        this.venting -= dt;
        const k = 1 - this.venting / 1.6;
        for (const mt of t.m.mats) if (mt.emissive) mt.emissive.setRGB(0.6 * k, 0.15 * k, 0.02);
        if (Math.random() < dt * 30) { t.chest(_v); steam.spawn(_v.x + (Math.random() - 0.5) * 6, _v.y + (Math.random() - 0.5) * 8, _v.z + (Math.random() - 0.5) * 6, 0, 3, 0, 1.2, 1.5, 4, 1, 0.92, 0.85, 0.5, -1, 1); }
        if (this.venting <= 0) {
          // the blast
          const c = t.chest(new THREE.Vector3());
          steamBurst(c, 90, t.h * 0.4, t.h * 0.2, 16, 2.4, 1.5);
          Sfx.steamBurst(2); addShake(0.7);
          areaEffect({ x: c.x, y: c.y, z: c.z, r: 20, dmg: 30, falloff: true, kb: 34, up: 6, by: t.id, reason: 'Scalded by the Bastion' });
          this.ventT = 7;
        }
      } else {
        this.ventT -= dt;
        if (this.ventT <= 0) { this.venting = 1.6; Sfx.steamBurst(0.6); this.events.push({ warn: 'STEAM BLAST INCOMING — GET CLEAR!' }); }
      }
    }
  }
}

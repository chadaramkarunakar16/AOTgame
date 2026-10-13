/* =========================================================================
   Champion titans: ability kits, player piloting and bot behaviour.
   A kit runs on the titan's owner. Effects on scouts go out as area effects /
   projectiles (applied victim-side); cosmetic state rides along in snapshots.
   ========================================================================= */
import { THREE, scene, camera, getBlock, SOLID } from './engine.js';
import { G } from './state.js';
import { Sfx } from './audio.js';
import { steam, steamBurst, sparkBurst, dust, chunkDebris, addShake } from './fx.js';
import { throwBoulder, areaEffect } from './titans.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const groundTop = (x, z) => window.groundH(Math.floor(x), Math.floor(z)) + 1;
const rnd = (a, b) => a + Math.random() * (b - a);
// top solid voxel under a point (titans that climb stand on buildings)
function surfaceBelow(x, y, z) {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let yy = Math.floor(y + 1.5); yy > 2; yy--) if (SOLID[getBlock(bx, yy, bz)]) return yy + 1;
  return groundTop(x, z);
}
function warn(e) { if (G.hooks.warn) G.hooks.warn(e); }
function cast(t, key, data) { if (G.hooks.abilityCast) G.hooks.abilityCast(t, key, data || {}); }
function chestOf(t) { return t.chest(new THREE.Vector3()); }
function aimFlat(t, aim, maxD) {
  const d = _v.subVectors(aim, t.pos); d.y = 0; const l = d.length();
  if (l > maxD) d.multiplyScalar(maxD / l);
  return t.pos.clone().add(d);
}
function faceTo(t, p) { t.yaw = Math.atan2(p.x - t.pos.x, p.z - t.pos.z); }
// a titan-sized ballistic hop (owner side); onLand runs when it touches down
function hop(t, to, h, dur, onLand) {
  t.airborne = { from: t.pos.clone(), to: to.clone(), h, dur, t: 0, onLand };
  faceTo(t, to);
}

/* ------------------------------------------------------------------ kits */
const KITS = {
  beast: {
    blurb: 'Long-armed artillery. Pitch rock shards, call wild titans, bombard an area.',
    Q: { name: 'Boulder Pitch', cd: 6.5, desc: 'Hurl a spray of rock shards at your crosshair.',
      cast(t, aim, K) {
        const from = t.handWorld(-1, new THREE.Vector3()).add(_u.set(0, 2, 0));
        const d = from.distanceTo(aim);
        for (let i = 0; i < 6; i++) {
          const to = aim.clone().add(_u.set(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).multiplyScalar(2 + d * 0.05));
          throwBoulder(from, to, rnd(0.9, 1.4), { dmg: 18, speed: 62, blast: 1, by: t.id });
        }
        Sfx.swipe(0); Sfx.crash(0.6); cast(t, 'Q');
      } },
    E: { name: 'Command Roar', cd: 24, desc: 'Summon two wild titans and enrage every wild titan near you.',
      cast(t, aim, K) { if (G.hooks.summon) G.hooks.summon(t, 2); if (G.hooks.enrage) G.hooks.enrage(t.pos, 90, 12); K.roarT = 1.6; cast(t, 'E'); Sfx.roar(t.h); } },
    R: { name: 'Bombardment', cd: 50, desc: 'Crush a house into rubble, then rain it over the area you aim at.',
      cast(t, aim, K) { const at = aimFlat(t, aim, 140); at.y = surfaceBelow(at.x, at.y + 30, at.z); K.bomb = { t: 1.5, at, n: 0 }; warn({ x: at.x, y: at.y, z: at.z, r: 22, t: 3.2, label: 'BOMBARDMENT' }); cast(t, 'R'); Sfx.roar(t.h); } },
    update(t, dt, K) {
      if (K.bomb) {
        const B = K.bomb; B.t -= dt;
        if (B.t <= 0 && B.n < 18 && Math.random() < dt * 14) {
          B.n++;
          const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 22;
          const to = new THREE.Vector3(B.at.x + Math.cos(a) * r, B.at.y, B.at.z + Math.sin(a) * r);
          const from = to.clone().add(_u.set(rnd(-8, 8), 46, rnd(-8, 8)));
          throwBoulder(from, to, rnd(1.6, 2.6), { dmg: 30, speed: 70, blast: 2, by: t.id });
        }
        if (B.n >= 18) K.bomb = null;
      }
      K.roarT = Math.max(0, (K.roarT || 0) - dt);
    },
    ai(t, tg, dist, dy, dt, K) {
      if (K.ready('Q') && dist > 16 && dist < 95 && Math.random() < dt * 0.8) K.use('Q', tg.pos.clone().addScaledVector(tg.vel, Math.min(1, dist / 60)));
      else if (K.ready('E') && dist < 70 && Math.random() < dt * 0.15) K.use('E', tg.pos);
      else if (K.ready('R') && dist > 25 && dist < 110 && Math.random() < dt * 0.1) K.use('R', tg.pos);
    }
  },

  armored: {
    blurb: 'A walking fortress. Plates turn blades. Cut the knees, then the nape.',
    hit(t, part, info) {
      if (part === 'ankleL' || part === 'ankleR') return null; // the knee pits are soft
      if (part === 'nape') {
        if (info.deep && (t.state === 'crippled' || t.state === 'stagger' || G.localTitan != null) && t.napeGuard <= 0) {
          t.hurtHP(120, info);
          return null;
        }
        return null;
      }
      return { kind: 'armor', part };
    },
    Q: { name: 'Shoulder Charge', cd: 9, desc: 'Charge forward, flattening buildings and anyone in the way.',
      cast(t, aim, K) { faceTo(t, aim); K.charge = 1.9; K.chargeTick = 0; t.state = 'charge'; t.st = 0; cast(t, 'Q'); Sfx.roar(t.h * 0.8); } },
    E: { name: 'Harden', cd: 18, desc: 'Stone skin for 4.5 s. Nothing gets through, but you move slowly.',
      cast(t, aim, K) { t.hardened = 4.5; cast(t, 'E'); Sfx.armorClank(); steamBurst(chestOf(t), 20, 4, 3, 3, 1.4); } },
    R: { name: 'Wall Breaker', cd: 38, desc: 'Leap at your crosshair and crash down in a shockwave.',
      cast(t, aim, K) {
        const to = aimFlat(t, aim, 38); to.y = groundTop(to.x, to.z);
        warn({ x: to.x, y: to.y, z: to.z, r: 18, t: 1.2, label: 'WALL BREAKER' });
        hop(t, to, 16, 1.2, () => {
          t.smashSphere(t.pos.clone().add(_u.set(0, 4, 0)), 7, 420);
          areaEffect({ x: t.pos.x, y: t.pos.y, z: t.pos.z, r: 18, dmg: 32, falloff: true, kb: 26, up: 14, detach: true, by: t.id, reason: `Crushed by ${t.name || 'the Ironclad Titan'}` });
          dust(t.pos, 40, 5, [0.75, 0.7, 0.6], 9); Sfx.stomp(); Sfx.collapse(); addShake(0.7);
        });
        cast(t, 'R');
      } },
    update(t, dt, K) {
      if (K.charge > 0) {
        K.charge -= dt; K.chargeTick -= dt;
        const f = t.fwd; t.pos.x += f.x * 24 * dt; t.pos.z += f.z * 24 * dt; t.walkPh += 24 * dt * (5.2 / t.h);
        if (K.chargeTick <= 0) {
          K.chargeTick = 0.12;
          t.smashSphere(t.pos.clone().addScaledVector(f, t.radius + 1.5).add(_u.set(0, t.h * 0.45, 0)), 4.5, 90);
          const c = chestOf(t).addScaledVector(f, 2);
          areaEffect({ x: c.x, y: c.y - t.h * 0.3, z: c.z, r: 6.5, dmg: 36, kb: 28, up: 10, detach: true, by: t.id, reason: `Flattened by ${t.name || 'the Ironclad Titan'}` });
        }
        if (K.charge <= 0) { t.state = 'recover'; t.st = 0; }
      }
      K.speedMul = t.hardened > 0 ? 0.55 : 1;
    },
    ai(t, tg, dist, dy, dt, K) {
      if (K.ready('Q') && dist > 12 && dist < 45 && dy < 6 && Math.random() < dt * 0.7) K.use('Q', tg.pos);
      else if (K.ready('E') && t.recentHits.size && Math.random() < dt * 0.6) K.use('E', tg.pos);
      else if (K.ready('R') && dist > 14 && dist < 38 && Math.random() < dt * 0.25) K.use('R', tg.pos);
    }
  },

  colossal: {
    blurb: 'Slow as a siege tower, tall as one too. Scald, stomp, and one cataclysm per life.',
    Q: { name: 'Steam Shroud', cd: 15, desc: 'Vent scalding steam for 6 s. Burns scouts and blows their anchors off you.',
      cast(t, aim, K) { K.steam = 6; K.steamTick = 0; cast(t, 'Q'); Sfx.steamBurst(1.6); } },
    E: { name: 'Quake Stomp', cd: 10, desc: 'Stomp the ground: shockwave around your feet.',
      cast(t, aim, K) { t.startAttack(0, 0, 'stomp', aim); cast(t, 'E'); } },
    R: { name: 'Cataclysm', cd: 999, desc: 'Once per life, after 4:00. A 5 s glowing wind-up everyone can see, then a huge blast. Leaves you spent and exposed.',
      gate(t, K) { if (K.cataUsed) return 'Already used this life'; if ((G.matchTime ?? 999) < 240) return `Unlocks at 4:00`; return null; },
      cast(t, aim, K) {
        K.cata = 5; K.cataUsed = true;
        const c = chestOf(t);
        warn({ x: t.pos.x, y: t.pos.y, z: t.pos.z, r: 44, t: 5, label: 'CATACLYSM · GET CLEAR', big: true });
        cast(t, 'R'); Sfx.siren();
        void c;
      } },
    stomp(t) {
      const foot = t.pos.clone().addScaledVector(t.fwd, t.h * 0.15);
      Sfx.stomp(); dust(foot, 40, 6, [0.75, 0.7, 0.6], 10); addShake(0.7);
      areaEffect({ x: foot.x, y: foot.y, z: foot.z, r: 19, yMax: 8, dmg: 24, falloff: true, kb: 22, up: 14, detach: true, by: t.id, reason: `Stomped by ${t.name || 'the Behemoth Titan'}` });
      t.smashSphere(foot, 5, 160);
    },
    update(t, dt, K) {
      if (K.steam > 0) {
        K.steam -= dt; K.steamTick -= dt;
        if (K.steamTick <= 0) {
          K.steamTick = 0.45;
          const c = chestOf(t);
          areaEffect({ x: c.x, y: c.y, z: c.z, r: t.h * 0.62, dmg: 5, kb: 12, up: 4, detach: true, by: t.id, reason: `Scalded by ${t.name || 'the Behemoth Titan'}` });
        }
      }
      if (K.cata > 0) {
        K.cata -= dt;
        if (K.cata <= 0) {
          const c = chestOf(t);
          areaEffect({ x: c.x, y: c.y - t.h * 0.3, z: c.z, r: 44, dmg: 75, falloff: true, kb: 40, up: 20, detach: true, by: t.id, reason: `Vaporised by ${t.name || 'the Behemoth Titan'}` });
          t.smashSphere(c, 11, 900);
          steamBurst(c, 160, t.h * 0.6, t.h * 0.3, 26, 3.6, 2); Sfx.collapse(); Sfx.steamBurst(2.5); addShake(1);
          K.spent = 12; t.hp = Math.min(t.hp, 100); t.napeHP = 1; t.napeRegen = 0;
          cast(t, 'boom');
        }
      }
      if (K.spent > 0) K.spent -= dt;
      K.speedMul = K.spent > 0 ? 0.3 : K.cata > 0 ? 0 : K.steam > 0 ? 0.7 : 1;
      K.locked = K.spent > 0 || K.cata > 0;
    },
    napeOpen(t) { return true; },
    ai(t, tg, dist, dy, dt, K) {
      if (K.ready('Q') && dist < t.h * 0.8 && dy > 6 && Math.random() < dt * 0.8) K.use('Q', tg.pos);
      else if (K.ready('E') && dist < 16 && dy < 6 && Math.random() < dt * 0.9) K.use('E', tg.pos);
      else if (!K.gate('R') && K.cds.R <= 0 && G.scouts.filter(s => s.alive && s.pos.distanceTo(t.pos) < 40).length >= 3 && Math.random() < dt * 0.1) K.use('R', tg.pos);
    }
  },

  female: {
    blurb: 'Fast, agile, ruthless. Harden at the last moment, kick through the air, scream for help.',
    Q: { name: 'Snap Harden', cd: 11, desc: 'Harden for 2.5 s: the perfect block against a nape cut.',
      cast(t, aim, K) { t.hardened = 2.5; cast(t, 'Q'); Sfx.armorClank(); } },
    E: { name: 'Flying Kick', cd: 7, desc: 'Dash at your crosshair with a flying kick.',
      cast(t, aim, K) {
        const to = aimFlat(t, aim, 30); to.y = groundTop(to.x, to.z);
        K.kick = 0.5; K.kickTick = 0;
        hop(t, to, Math.max(3, Math.min(14, aim.y - t.pos.y - t.h * 0.4)), 0.55, () => { dust(t.pos, 14, 3); Sfx.stomp(); });
        cast(t, 'E'); Sfx.swipe(0);
      } },
    R: { name: 'Shriek', cd: 45, desc: 'Shriek: jams every scout\'s gear within 34 m and calls every wild titan to you.',
      cast(t, aim, K) {
        const c = chestOf(t);
        areaEffect({ x: c.x, y: c.y, z: c.z, r: 34, kb: 8, up: 2, detach: true, jam: 2.2, by: t.id });
        if (G.hooks.callTitans) G.hooks.callTitans(t.pos, 150);
        cast(t, 'R'); Sfx.scream();
      } },
    update(t, dt, K) {
      if (K.kick > 0) {
        K.kick -= dt; K.kickTick -= dt;
        if (K.kickTick <= 0) { K.kickTick = 0.1; const c = chestOf(t); areaEffect({ x: c.x, y: c.y - 2, z: c.z, r: 5.5, dmg: 34, kb: 26, up: 8, detach: true, by: t.id, reason: `Kicked by ${t.name || 'the Huntress Titan'}` }); t.smashSphere(c, 3, 40); }
      }
      K.speedMul = t.hardened > 0 ? 0.4 : 1;
    },
    ai(t, tg, dist, dy, dt, K) {
      const behind = _v.subVectors(tg.pos, t.pos).setY(0).normalize().dot(t.fwd) < -0.2;
      if (K.ready('Q') && behind && dist < 14 && Math.random() < dt * 3) K.use('Q', tg.pos);
      else if (K.ready('E') && dist > 10 && dist < 30 && Math.random() < dt * 0.7) K.use('E', tg.pos);
      else if (K.ready('R') && G.scouts.filter(s => s.alive && s.pos.distanceTo(t.pos) < 34).length >= 2 && Math.random() < dt * 0.3) K.use('R', tg.pos);
    }
  },

  jaw: {
    blurb: 'Small, fast, climbs anything. Pounce on scouts and bite.',
    rmb: 'bite', climb: true, jump: 20,
    Q: { name: 'Pounce', cd: 3.2, desc: 'Leap at your crosshair, jaws first.',
      cast(t, aim, K) {
        const d = Math.min(36, t.pos.distanceTo(aim)), dir = _v.subVectors(aim, t.pos).normalize();
        const to = t.pos.clone().addScaledVector(dir, d);
        to.y = Math.max(surfaceBelow(to.x, to.y + 2, to.z), to.y - 1);
        K.pounce = 0.75; K.pounceTick = 0;
        hop(t, to, 3 + Math.max(0, aim.y - t.pos.y) * 0.4, 0.75, () => { dust(t.pos, 10, 2); });
        cast(t, 'Q'); Sfx.titanGroan(t.h, 0, 0, true);
      } },
    E: { name: 'Cable Snap', cd: 10, desc: 'Snap every grapple cable within 24 m and jam the gear for a second.',
      cast(t, aim, K) { const c = chestOf(t); areaEffect({ x: c.x, y: c.y, z: c.z, r: 24, dmg: 6, kb: 6, detach: true, jam: 1.2, by: t.id }); cast(t, 'E'); Sfx.scream(0.6); } },
    R: { name: 'Frenzy', cd: 40, desc: '8 s of speed, faster attacks, and limbs that regrow instantly.',
      cast(t, aim, K) { K.frenzy = 8; cast(t, 'R'); Sfx.roar(8); } },
    update(t, dt, K) {
      if (K.pounce > 0) {
        K.pounce -= dt; K.pounceTick -= dt;
        if (K.pounceTick <= 0) { K.pounceTick = 0.08; const h = t.headWorld(new THREE.Vector3()); areaEffect({ x: h.x, y: h.y - 1.5, z: h.z, r: 3.6, dmg: 42, kb: 14, up: 4, detach: true, by: t.id, reason: `Mauled by ${t.name || 'the Fang Titan'}` }); }
      }
      if (K.frenzy > 0) { K.frenzy -= dt; t.dis.armR = Math.min(t.dis.armR, 0); t.dis.armL = Math.min(t.dis.armL, 0); t.dis.legs = Math.min(t.dis.legs, 0); }
      K.speedMul = K.frenzy > 0 ? 1.45 : 1; t.rage = K.frenzy > 0 ? 1.7 : 1;
    },
    ai(t, tg, dist, dy, dt, K) {
      if (K.ready('Q') && dist > 6 && dist < 34 && Math.random() < dt * 1.5) K.use('Q', tg.pos.clone().addScaledVector(tg.vel, 0.35));
      else if (K.ready('E') && G.scouts.some(s => s.alive && s.anchored && s.pos.distanceTo(t.pos) < 24) && Math.random() < dt * 0.8) K.use('E', tg.pos);
      else if (K.ready('R') && dist < 30 && Math.random() < dt * 0.2) K.use('R', tg.pos);
    }
  },

  attack: {
    blurb: 'A brawler. Hardened fists, a war cry, and stone spikes from the ground.',
    jump: 13,
    Q: { name: 'Megaton Dash Punch', cd: 6, desc: 'Rocket forward 16 m and deliver a crushing hardened punch, flattening enemies.',
      cast(t, aim, K) {
        faceTo(t, aim);
        const fwd = _v.subVectors(aim, t.pos).setY(0).normalize();
        K.dashPunch = { t: 0.38, dir: fwd.clone() };
        K.fist = 8;
        t.dmgMul = 2.5;
        const hand = t.handWorld(-1, new THREE.Vector3());
        sparkBurst(hand, 55, 4.0, [0.3, 0.7, 1.0]);
        steamBurst(t.pos, 30, 4, 3, 6, 1.4);
        Sfx.armorClank();
        Sfx.swipe(0);
        addShake(0.5);
        cast(t, 'Q');
        if (window.toast) window.toast('Q: MEGATON DASH PUNCH! (+150% DMG & KNOCKDOWN)', 2.2);
      } },
    E: { name: 'War Cry & Stomp', cd: 16, desc: 'Stomp the earth and roar, sending a 42m shockwave that forces all enemy titans to their knees.',
      cast(t, aim, K) {
        K.roarPose = 1.8;
        const c = chestOf(t);
        dust(t.pos, 60, 8.0, [0.85, 0.8, 0.7], 16);
        steamBurst(c, 60, 9, 4, 14, 2.8);
        addShake(0.9);
        Sfx.stomp();
        Sfx.roar(t.h * 1.5);
        Sfx.crash(1.4);
        areaEffect({ x: c.x, y: c.y, z: c.z, r: 42, dmg: 35, kb: 36, up: 16, detach: true, by: t.id });
        for (const other of G.titans) {
          if (other !== t && other.alive && other.pos.distanceTo(t.pos) < 45) {
            other.state = 'crippled';
            other.st = 0;
            other.dis.legs = 3.8;
            other.knockdownType = 'knees'; // forced onto knees!
            other.flash = 1;
            dust(other.pos, 30, 3.5);
          }
        }
        K.rageT = 8; t.rage = 1.6;
        cast(t, 'E');
        if (window.toast) window.toast('E: WAR CRY! ENEMY TITANS FORCED TO KNEES!', 2.5);
      } },
    R: { name: 'Seismic Ground Slam', cd: 22, desc: 'Leap high into the air and smash both fists into the earth, erupting monolithic spikes.',
      cast(t, aim, K) {
        faceTo(t, aim);
        const dir = _v.subVectors(aim, t.pos).setY(0).normalize();
        const to = t.pos.clone().addScaledVector(dir, 14);
        to.y = groundTop(to.x, to.z);
        hop(t, to, 8.0, 0.75, () => {
          // On landing impact!
          t.smashSphere(t.pos.clone().add(_u.set(0, 2, 0)), 6.5, 300);
          dust(t.pos, 50, 7.0, [0.85, 0.8, 0.7], 15);
          chunkDebris(t.pos, [0.7, 0.6, 0.5], 24, 16, 1.4);
          Sfx.stomp();
          Sfx.collapse();
          Sfx.roar(t.h);
          addShake(1.0);
          K.spikes = { dir: dir.clone(), i: 0, t: 0, from: t.pos.clone() };
          cast(t, 'R', { d: [dir.x, dir.z], p: [t.pos.x, t.pos.y, t.pos.z] });
          if (window.toast) window.toast('R: SEISMIC GROUND SLAM & MONOLITHIC SPIKES!', 2.5);
        });
        Sfx.jump();
      } },
    update(t, dt, K) {
      if (K.fist > 0) K.fist -= dt;
      t.dmgMul = K.fist > 0 ? 2.5 : 1;
      if (K.rageT > 0) K.rageT -= dt;
      t.rage = K.rageT > 0 ? 1.6 : 1;
      if (K.roarPose > 0) K.roarPose -= dt;

      // Q: Megaton Dash Punch movement & physics
      if (K.dashPunch) {
        const DP = K.dashPunch;
        DP.t -= dt;
        const spd = 42; // rocket forward at 42 m/s!
        t.pos.x += DP.dir.x * spd * dt;
        t.pos.z += DP.dir.z * spd * dt;
        dust(t.pos, 4, 1.0);
        // Break blocks along path
        t.smashSphere(t.pos.clone().add(_u.set(0, t.h * 0.4, 0)), 3.5, 30);
        // Check impact with hostile titans
        for (const other of G.titans) {
          if (other === t || !other.alive || (t.team && other.team && t.team === other.team)) continue;
          if (other.pos.distanceTo(t.pos) < (t.radius + other.radius + 3.0)) {
            other.hurtHP(95, { by: t.id, kind: 'megaton_punch' });
            other.flash = 1; other.flinch = 2.0;
            other.pos.addScaledVector(DP.dir, 18);
            other.state = 'crippled';
            other.st = 0;
            other.dis.legs = 4.5;
            other.knockdownType = 'back'; // sprawling backwards flat on the back!
            dust(other.pos, 40, 5.0);
            chunkDebris(other.pos, [0.9, 0.2, 0.2], 20, 14, 1.2);
            Sfx.crash(1.6); Sfx.thwack(2.0); addShake(0.9);
            if (G.hooks.titanHitOther) G.hooks.titanHitOther(t, other, 95, !other.alive);
          }
        }
        if (DP.t <= 0) K.dashPunch = null;
      }

      // R: Spikes eruption
      if (K.spikes) {
        const S = K.spikes; S.t -= dt;
        if (S.t <= 0 && S.i < 12) {
          S.t = 0.06; S.i++;
          const p = S.from.clone().addScaledVector(S.dir, 4 + S.i * 3.5); p.y = groundTop(p.x, p.z);
          areaEffect({ x: p.x, y: p.y, z: p.z, r: 6.0, yMax: 12, dmg: 60, kb: 12, up: 24, detach: true, by: t.id, reason: `Impaled by ${t.name || 'the Attack Titan'}` });
          t.smashSphere(p.clone().add(_u.set(0, 2, 0)), 3.5, 50);
          dust(p, 25, 3.5);
          chunkDebris(p, [0.75, 0.7, 0.65], 14, 10, 1.0);
          Sfx.stomp();
        }
        if (S.i >= 12) K.spikes = null;
      }
    },
    ai(t, tg, dist, dy, dt, K) {
      if (K.ready('Q') && dist < 18 && Math.random() < dt) K.use('Q', tg.pos);
      else if (K.ready('E') && G.scouts.filter(s => s.alive && s.pos.distanceTo(t.pos) < 26).length >= 2 && Math.random() < dt * 0.6) K.use('E', tg.pos);
      else if (K.ready('R') && dist > 8 && dist < 36 && dy < 8 && Math.random() < dt * 0.35) K.use('R', tg.pos);
    }
  }
};
export const SHIFTER_TYPES = ['beast', 'armored', 'colossal', 'female', 'jaw', 'attack'];
export function kitInfo(type) { return KITS[type]; }

/* ------------------------------------------------------------------ kit runtime attached to a titan */
export function attachKit(t) {
  const D = KITS[t.type]; if (!D) return null;
  const K = {
    def: D, cds: { Q: 0, E: 0, R: 0 }, stamina: 100, speedMul: 1, locked: false,
    ready(k) { return this.cds[k] <= 0 && !this.locked && !this.gate(k) && t.alive && ['walk', 'chase', 'recover'].includes(t.state); },
    gate(k) { const a = D[k]; return a && a.gate ? a.gate(t, K) : null; },
    use(k, aim) {
      const a = D[k]; if (!a || !this.ready(k)) return false;
      this.cds[k] = a.cd; a.cast(t, aim.clone ? aim.clone() : new THREE.Vector3(aim.x, aim.y, aim.z), K);
      return true;
    },
    update(t, dt) {
      for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
      if (D.update) D.update(t, dt, K);
      updateHop(t, dt);
    },
    hit: D.hit ? (t, part, info) => D.hit(t, part, info, K) : null,
    napeOpen: D.napeOpen ? (t) => D.napeOpen(t, K) : null,
    stomp: D.stomp ? (t) => D.stomp(t, K) : null,
    ai: D.ai ? (t, tg, dist, dy, dt) => { if (t.ctrl === 'ai' && tg) D.ai(t, tg, dist, dy, dt, K); } : null,
    netState() { return [K.steam > 0 ? 1 : 0, K.cata > 0 ? +K.cata.toFixed(2) : 0, K.spent > 0 ? 1 : 0, K.frenzy > 0 ? 1 : 0, K.charge > 0 ? 1 : 0, K.fist > 0 ? 1 : 0]; },
    netApply(t, x) { K.steam = x[0] ? 1 : 0; K.cata = x[1]; K.spent = x[2] ? 1 : 0; K.frenzy = x[3] ? 1 : 0; K.charge = x[4] ? 1 : 0; K.fist = x[5] ? 1 : 0; },
    fx(t, dt) { kitFx(t, dt, K); }
  };
  t.kit = K;
  return K;
}
function updateHop(t, dt) {
  const A = t.airborne; if (!A || !A.dur) return;
  A.t += dt; const f = Math.min(1, A.t / A.dur);
  t.pos.lerpVectors(A.from, A.to, f); t.pos.y += Math.sin(f * Math.PI) * A.h;
  t.walkPh += dt * 4;
  if (f >= 1) { t.airborne = null; if (A.onLand) A.onLand(); }
}
// cosmetic effects driven by kit state (runs on owner and replicas)
function kitFx(t, dt, K) {
  if (!t.alive) return;
  const em = t.m.mat.emissive;
  if (K.steam > 0 && Math.random() < dt * 40) { t.chest(_v); steam.spawn(_v.x + rnd(-1, 1) * t.h * 0.2, _v.y + rnd(-1, 1) * t.h * 0.3, _v.z + rnd(-1, 1) * t.h * 0.2, rnd(-3, 3), rnd(2, 6), rnd(-3, 3), 2, t.h * 0.08, t.h * 0.35, 1, 0.95, 0.9, 0.5, -1, 0.8); }
  if (K.cata > 0) { const k = 1 - K.cata / 5, p = 0.5 + 0.5 * Math.sin(G.time * (8 + k * 30)); em.setRGB(0.4 + 0.6 * k * p, 0.2 + 0.5 * k * p, 0.05 + 0.3 * k * p); if (Math.random() < dt * 30) { t.chest(_v); steam.spawn(_v.x, _v.y, _v.z, rnd(-6, 6), rnd(0, 8), rnd(-6, 6), 1.5, 2, 8, 1, 0.8, 0.5, 0.6, -2, 1); } }
  if (K.spent > 0) { em.setRGB(0.25, 0.08, 0.03); if (Math.random() < dt * 25) { t.chest(_v); steam.spawn(_v.x + rnd(-4, 4), _v.y + rnd(-6, 6), _v.z + rnd(-4, 4), 0, 3, 0, 2, 2, 6, 1, 1, 1, 0.45, -1, 1); } }
  if (t.hardened > 0) em.setRGB(0.32, 0.4, 0.5);
  if (K.frenzy > 0) em.setRGB(0.35 + 0.2 * Math.sin(G.time * 20), 0.05, 0.02);
  if (K.fist > 0 && Math.random() < dt * 12) { const h = t.handWorld(t.atkSide || -1, _v); sparkBurst(h, 1, 2, [0.8, 0.9, 1], 0.2); }
  if (K.charge > 0 && Math.random() < dt * 20) dust(t.pos, 2, 2);
}
// visuals for a cast seen on a replica (owner already played its own)
export function castFx(t, key, data) {
  if (!t) return;
  const c = t.chest(new THREE.Vector3());
  if (key === 'boom') { steamBurst(c, 160, t.h * 0.6, t.h * 0.3, 26, 3.6, 2); Sfx.collapse(); Sfx.steamBurst(2.5); addShake(Math.max(0, 1 - c.distanceTo(camera.position) / 120)); return; }
  const type = t.type;
  if (type === 'beast' && key === 'E') Sfx.roar(t.h);
  if (type === 'beast' && key === 'Q') Sfx.swipe(0);
  if (type === 'colossal' && key === 'R') Sfx.siren();
  if (type === 'colossal' && key === 'Q') Sfx.steamBurst(1.4);
  if (type === 'female' && key === 'R') Sfx.scream();
  if ((type === 'female' && key === 'Q') || (type === 'armored' && key === 'E')) Sfx.armorClank();
  if (type === 'jaw' && key === 'E') Sfx.scream(0.6);
  if (type === 'attack' && key === 'E') Sfx.roar(t.h);
  if (type === 'attack' && key === 'R' && data && data.d) spikeFx(data);
  if (type === 'armored' && key === 'Q') Sfx.roar(t.h * 0.8);
}
// crystal spikes (visual only, everyone draws them)
const spikeMat = new THREE.MeshLambertMaterial({ color: 0xdfe9f5, emissive: 0x2a3a50, transparent: true });
const spikeGeo = new THREE.ConeGeometry(1.4, 7, 5);
const spikes = [];
export function spikeFx(data) {
  for (let i = 1; i <= 11; i++) {
    const x = data.p[0] + data.d[0] * (4 + i * 3), z = data.p[2] + data.d[1] * (4 + i * 3), y = groundTop(x, z);
    const m = new THREE.Mesh(spikeGeo, spikeMat.clone()); m.position.set(x + rnd(-1, 1), y - 4, z + rnd(-1, 1)); m.rotation.set(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3));
    scene.add(m); spikes.push({ m, t: -i * 0.07, y });
  }
  sparkBurst(new THREE.Vector3(data.p[0], data.p[1] + 1, data.p[2]), 20, 10, [0.8, 0.9, 1]);
}
export function updateSpikes(dt) {
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i]; s.t += dt;
    if (s.t < 0) continue;
    s.m.position.y = s.y - 4 + Math.min(1, s.t * 8) * 6.5;
    if (s.t > 3) s.m.material.opacity = Math.max(0, 1 - (s.t - 3));
    if (s.t > 4) { scene.remove(s.m); s.m.material.dispose(); spikes.splice(i, 1); }
  }
}

/* ------------------------------------------------------------------ player piloting (owner side) */
const STAM = { sprint: 20, guard: 16, regen: 18 };
export function pilot(t, dt) {
  const I = t.input, K = t.kit; if (!I || !K) return false;
  const T = t.T;
  // state transitions (mirrors the AI's)
  if (t.state === 'crippled') {
    if (I.jump || I.kick || I.lmb) {
      // Quick recovery kip-up!
      t.dis.legs = 0;
      t.state = 'rise';
      t.st = 0.5;
      dust(t.pos, 16, 2.0);
      if (Sfx.jump) Sfx.jump();
      if (window.popup) window.popup('QUICK RECOVERY!', '#ffd36a');
    } else if (I.mv.x || I.mv.y) {
      // Allow crawling/rolling sideways or in direction of input!
      const cy = I.camYaw || t.yaw;
      const fwdX = -Math.sin(cy), fwdZ = -Math.cos(cy);
      const rightX = Math.cos(cy), rightZ = -Math.sin(cy);
      const rollDirX = fwdX * I.mv.y + rightX * I.mv.x;
      const rollDirZ = fwdZ * I.mv.y + rightZ * I.mv.x;
      t.pos.x += rollDirX * 14 * dt;
      t.pos.z += rollDirZ * 14 * dt;
      dust(t.pos, 4, 1.0);
    }
    if (t.dis.legs <= 0) { t.state = 'rise'; t.st = 0; }
  }
  else if (t.state === 'rise') { if (t.st > 0.9) { t.state = 'walk'; t.st = 0; } }
  else if (t.state === 'holding') {
    t.holdT += dt;
    if ((!t.holding && !t.holdingHorse) || (t.holdSide > 0 ? t.dis.armL : t.dis.armR) > 0) { t.release(true); }
    else if (t.holdT > 0.25 && I.lmb) {
      if (t.holdingHorse) t.crush('devour');
      else if (t.holding && t.holding.hurtHP) t.crush('slam');
      else t.crush('devour');
    }
    else if (t.holdT > 0.25 && I.rmb) {
      const d = _v.subVectors(I.aim, t.pos).normalize();
      t.crush('throw', [d.x * 52, Math.max(16, d.y * 44 + 14), d.z * 52]);
    }
    else if (t.holdT > 5.5) t.crush(t.holdingHorse ? 'throw' : (t.holding && t.holding.hurtHP ? 'slam' : 'crush'));
  }
  else if (t.state === 'windup' || t.state === 'strike' || t.state === 'lunge') t.updateAttack(dt);
  else if (t.state === 'recover') {
    // If player inputs an attack or move, cancel recover immediately into next action!
    if (I.lmb || I.rmb || I.kick || I.q || I.e || I.r || t.st > 0.12) { t.state = 'walk'; t.st = 0; }
  }
  else if (t.state === 'stagger') { if (t.st > (t.staggerDur || 1)) { t.state = 'walk'; t.st = 0; } }
  else if (t.state === 'leap') t.updateLeap(dt);
  const free = (t.state === 'walk' || t.state === 'chase') && !t.airborne;
  // stamina, guard
  const guarding = I.guard && free && K.stamina > 2 && (t.dis.armR <= 0 || t.dis.armL <= 0);
  if (guarding) { t.napeGuard = 0.2; t.guardSide = t.dis.armR <= 0 ? -1 : 1; K.stamina -= STAM.guard * dt; }
  const sprinting = I.sprint && free && !guarding && K.stamina > 1 && (I.mv.x || I.mv.y);
  if (sprinting) K.stamina -= STAM.sprint * dt;
  else if (!guarding) K.stamina = Math.min(100, K.stamina + STAM.regen * dt);
  // attacks and abilities (a press during an attack is buffered briefly)
  for (const k of ['lmb', 'rmb', 'kick', 'q', 'e', 'r']) if (I[k]) K.buf = { k, t: 0.45 };
  if (K.buf) { K.buf.t -= dt; if (K.buf.t <= 0) K.buf = null; }
  if (K.comboT > 0) { K.comboT -= dt; if (K.comboT <= 0) K.combo = 0; }

  const aimYaw = Math.atan2(I.aim.x - t.pos.x, I.aim.z - t.pos.z);
  if (free && !guarding && K.buf) {
    const b = K.buf.k; K.buf = null;
    t.yaw = aimYaw; // Snap to aim immediately on attack launch
    if (b === 'kick') {
      t.startAttack(0, 0, 'kick', I.aim);
    } else if (b === 'lmb') {
      K.combo = (K.combo || 0) + 1;
      K.comboT = 1.2;
      const atkType = (K.combo % 3 === 0) ? 'kick' : 'swipe';
      t.startAttack(0, 0, atkType, I.aim);
    }
    else if (b === 'rmb') {
      t.startAttack(0, 0, K.def.rmb || 'grab', I.aim);
    }
    else {
      const k = b.toUpperCase();
      if (!K.use(k, I.aim) && G.hooks.abilityDenied) G.hooks.abilityDenied(t, k, K.gate(k) || (K.cds[k] > 0 ? `${Math.ceil(K.cds[k])} s` : ''));
    }
    if (I.jump && K.def.jump && !t.airborne) {
      const d = _w.set(-Math.sin(I.camYaw), 0, -Math.cos(I.camYaw));
      const to = t.pos.clone().addScaledVector(d, (I.mv.y > 0 ? 1 : 0.2) * K.def.jump * 0.9);
      to.y = K.def.climb ? surfaceBelow(to.x, t.pos.y + 3, to.z) : groundTop(to.x, to.z);
      hop(t, to, K.def.jump * 0.45, 0.85, () => { dust(t.pos, 8, 2); Sfx.land(1.2); });
    }
  }

  // Smoothly face aim when attacking or standing still
  let dAim = aimYaw - t.yaw;
  dAim = Math.atan2(Math.sin(dAim), Math.cos(dAim));
  if (t.state === 'windup' || t.state === 'lunge' || t.state === 'holding' || guarding || (!I.mv.x && !I.mv.y)) {
    t.yaw += dAim * Math.min(1, dt * 14);
  }
  // movement
  let moving = false;
  if (!t.airborne && t.dis.legs <= 0 && ['walk', 'chase', 'recover', 'windup', 'strike', 'holding'].includes(t.state) && (I.mv.x || I.mv.y)) {
    const cy = I.camYaw, fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    let wx = fx * I.mv.y + rx * I.mv.x, wz = fz * I.mv.y + rz * I.mv.x; const wl = Math.hypot(wx, wz) || 1; wx /= wl; wz /= wl;
    const busy = t.state === 'windup' || t.state === 'strike' || t.state === 'holding';
    const spd = T.speed * 1.75 * (sprinting ? 1.6 : 1) * (guarding ? 0.5 : 1) * (busy ? 0.35 : 1) * (K.speedMul || 1);
    if (!busy && !guarding) { let d = Math.atan2(wx, wz) - t.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); const tr = (t.type === 'jaw' ? 9 : t.type === 'colossal' ? 1.6 : 3.4) * dt; t.yaw += Math.max(-tr, Math.min(tr, d)); }
    const px = t.pos.x, pz = t.pos.z;
    t.pos.x += wx * spd * dt; t.pos.z += wz * spd * dt;
    // arena edge
    const r = Math.hypot(t.pos.x, t.pos.z); if (r > 290) { t.pos.x *= 290 / r; t.pos.z *= 290 / r; }
    t.walkPh += spd * dt * (5.2 / t.h);
    t.smashT = (t.smashT || 0) - dt; if (t.smashT <= 0) { t.smashT = 0.2; t.smash(); }
    // climbing titans walk up walls and over roofs
    if (K.def.climb) {
      const ahead = SOLID[getBlock(Math.floor(t.pos.x + wx * 1.2), Math.floor(t.pos.y + 1.5), Math.floor(t.pos.z + wz * 1.2))];
      if (ahead) { t.pos.x = px; t.pos.z = pz; t.pos.y += 9 * dt; t.climbing = true; }
      else t.climbing = false;
    }
    moving = true;
  } else t.climbing = false;
  if (K.def.climb && !t.airborne) {
    const gy = surfaceBelow(t.pos.x, t.pos.y + 0.5, t.pos.z);
    if (!t.climbing) t.pos.y += (gy - t.pos.y) * Math.min(1, dt * (gy < t.pos.y ? 6 : 12));
    t.airborneLock = true;
  }
  return moving;
}
export function initPilotedTitan(t) {
  attachKit(t);
  t.pilot = pilot;
  t.alertness = 1;
}

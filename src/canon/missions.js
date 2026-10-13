/* =========================================================================
   Missions: Phase Two Canonical Two-Wall Expedition Architecture
   Wall Sina (Human Territory) & Wall Rose (Breached Trost Bastion)
   ========================================================================= */
import { THREE, scene, camera, getBlock, SOLID, chunkReady } from './engine.js';
import { Sfx, Music } from './audio.js';
import { buildPerson } from './models.js';
import { steamBurst, sparkBurst, sparks, steam, dust, addShake } from './fx.js';
import { BossBrain, throwBoulder } from './titans.js';
import { attachKit, spikeFx } from './shifters.js';
import { spawnHorse, clearHorses } from './horses.js';
import { G } from './state.js';

const W = typeof window !== 'undefined' ? window : {};
const DR = W.DR || 246, GROUND = W.GROUND || 46, WALL_TOP = W.WALL_TOP || 86;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V(), _w = V(), _p1 = V(), _p2 = V();
const CAPTAIN = 'Commander Erwin Smith';

export const MISSIONS = [
  // ---- STORY MODE: OPERATION DEFENSE & RECLAMATION OF WALL ROSE ----
  { id: 'story_shiganshina', name: 'Operation: Advance to Wall Rose', sub: 'Chapter I · Departure from Wall Sina', art: 'm1.jpg', time: 0.10,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: 12, yaw: 0 },
    brief: `Scouts — Wall Rose has been breached at Trost District! Pure Titans are surging through the smashed outer gate and threaten to reach Wall Sina. <b>Mount your military steed [H]</b>, ride south across the <b>Grand Expedition Field (~235m)</b>, eliminate 6 invading Pure Titans in Trost, and secure the breached Outer Gate!`,
    objectives: ['Ride military horse south on the Grand Highway [H]', 'Eliminate 6 invading Titans in Trost District', 'Secure the breached Trost Outer Gate'],
    ranks: [8000, 5000, 2500], outro: 'The forward camp is secure. Prepare for the enemy ambush.' },
  { id: 'story_armored', name: 'Clash of the Armored Titan', sub: 'Chapter II · The Iron Fortress (Reiner)', art: 'm2.jpg', time: 0.16,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: 12, yaw: 0 },
    brief: `<b>The Armored Titan ambushes from the ruins of Trost!</b> His segmented armor plates turn standard blades. Gallop down the Grand Highway, break his glowing knee joints, strike his nape with maximum velocity, or <b>press [T] to transform into the Attack Titan</b> and brawl him in the streets!`,
    objectives: ['Defeat the Armored Titan in Trost ruins', 'Break his knee armor or brawl in Titan Form (T)', 'Protect the forward lines'],
    ranks: [14000, 9000, 5000], outro: 'Reiner has been repelled! But a greater danger approaches…' },
  { id: 'story_colossal', name: 'The God of Destruction', sub: 'Chapter III · The Colossal Explosion (Bertholdt)', art: 'm3.jpg', time: 0.48,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: 12, yaw: 0 },
    brief: `A cataclysmic flash tears through the southern horizon! The <b>34-meter Colossal Titan</b> has manifested atop Wall Rose! The district is consumed by boiling steam and flames. <b>Evade the scalding steam</b>, scale Wall Rose's high ramparts, distract the titan, and cut his exposed nape between steam vents!`,
    objectives: ['Gallop south to Wall Rose on horseback [H]', 'Evade boiling steam blasts', 'Scale the colossal rampart and strike the nape'],
    ranks: [24000, 16000, 9000], outro: 'The Colossal Titan has fallen. The smoke clears over Wall Rose.' },
  { id: 'story_beast', name: 'The Beast\'s Artillery', sub: 'Chapter IV · The Final Charge (Zeke)', art: 'm4.jpg', time: 0.12,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: 196, yaw: 0 },
    brief: `Outside Wall Rose on the southern plains, the <b>Beast Titan</b> stands flanked by pure titans, hurling crushed boulders at supersonic speeds! <b>Lead the cavalry charge on horseback [H]</b>, dodge the crushing boulder barrages using smoke flares for cover, slice through his escort titans, and slay the Beast Titan!`,
    objectives: ['Gallop on horseback in Erwin\'s charge [H]', 'Dodge supersonic boulder artillery volleys', 'Eliminate escort titans and defeat the Beast Titan'],
    ranks: [28000, 18000, 10000], outro: 'The Beast\'s artillery has been silenced. The charge succeeded!' },
  { id: 'story_reclamation', name: 'Wall Rose Reclaimed', sub: 'Chapter V · The Last Stand', art: 'title.jpg', time: 0.18,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: 196, yaw: 0 },
    brief: `The decisive battle for humanity! The enemy Shifters make a desperate united attack at the Trost breach to overrun humanity! <b>Fight alongside the Scout Regiment or as the Attack Titan [T]</b>, eliminate both Reiner and Zeke, and permanently seal the breach! Today, humanity reclaims its freedom!`,
    objectives: ['Defeat both the Armored Titan and Beast Titan at the breach', 'Protect the Wall Rose gate', 'Reclaim the territory for humanity'],
    ranks: [35000, 22000, 12000], outro: 'Wall Rose has been reclaimed! The territory is secure!' },
  // ---- DEDICATED TRAINING & SANDBOX MODES ----
  { id: 'practice', name: 'Practice Ground', sub: 'Mastery Yard · Vector Gear, Cavalry & Titan Combat', art: 'm1.jpg', time: 0.12,
    spawn: { x: -48, y: GROUND + 1.2, z: -68, yaw: 0 },
    brief: `Welcome to the Scout Regiment Practice Ground in Wall Sina. Here you can train on your <b>Military Steed (press H to mount/whistle)</b>, practice aerial grappling on high tether poles, test your blade cuts on wooden dummies, and press <b>[T]</b> to test your Titan Shifter transformation.`,
    objectives: ['Ride your military horse [H]', 'Grapple to tether poles and practice flight', 'Slash the training dummy nape', 'Press [T] to test Titan Shifter combat'],
    ranks: [6000, 4000, 2000], outro: 'Practice complete. You are ready for the battlefield.' },
  { id: 'expedition', name: 'Scout Expedition', sub: 'Open World Sandbox · Endless Battle & Roam', art: 'title.jpg', time: 0.14,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: 12, yaw: 0 },
    brief: `Take to the open world with your squadron. Roam Wall Sina Royal Capital, the Grand Highway, the Giant Pine Forest, Dauper Village, Utgard Castle ruins, and the breached Wall Rose. <b>Ride on horseback with [H]</b>, eliminate roaming Titans of all sizes, and transform into any Titan Shifter at will with <b>[T]</b>.`,
    objectives: ['Roam the open world on horseback [H]', 'Slay roaming Titans of all sizes', 'Press [T] to transform into Titan form at will'],
    ranks: [50000, 25000, 10000], outro: 'Scouts return from the expedition.' }
];

/* ---------------------------------------------------------------- on-screen markers */
class Markers {
  constructor() { this.list = []; this.root = document.getElementById('markers'); }
  add(pos, label, cls = '') {
    const el = document.createElement('div'); el.className = 'marker ' + cls;
    el.innerHTML = `<div class="mdot"></div><div class="mlabel">${label}</div><div class="mdist"></div>`;
    this.root.append(el);
    const m = { pos, el, label, on: true, dist: el.querySelector('.mdist'), edge: cls.includes('edge') };
    this.list.push(m); return m;
  }
  remove(m) { m.el.remove(); this.list = this.list.filter(x => x !== m); }
  clear() { for (const m of this.list) m.el.remove(); this.list = []; }
  update() {
    const w = window.innerWidth, h = window.innerHeight, P = G.player;
    for (const m of this.list) {
      if (!m.on) { m.el.style.display = 'none'; continue; }
      _v.copy(m.pos).project(camera);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      const inside = !behind && x > 30 && x < w - 30 && y > 30 && y < h - 30;
      if (!inside && !m.edge) { m.el.style.display = 'none'; continue; }
      if (!inside) {
        let dx = x - w / 2, dy = y - h / 2; if (behind) { dx = -dx; dy = -dy; }
        const s = Math.min((w / 2 - 40) / Math.abs(dx || 1e-6), (h / 2 - 40) / Math.abs(dy || 1e-6));
        x = w / 2 + dx * s; y = h / 2 + dy * s;
        m.el.classList.add('offscreen');
      } else m.el.classList.remove('offscreen');
      m.el.style.display = 'block';
      m.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      m.dist.textContent = Math.round(m.pos.distanceTo(P.pos)) + ' m';
    }
  }
}
export const markers = new Markers();

/* ---------------------------------------------------------------- civilians */
const CIV_PALS = [
  { shirt: [180, 60, 60], pants: [70, 60, 90], hair: [60, 40, 20] },
  { shirt: [70, 120, 170], pants: [90, 80, 60], hair: [200, 170, 90] },
  { shirt: [210, 180, 90], pants: [60, 70, 60], hair: [30, 25, 20] },
  { shirt: [120, 160, 90], pants: [80, 60, 50], hair: [120, 60, 30] },
  { shirt: [160, 110, 170], pants: [50, 50, 70], hair: [90, 60, 40] }
];
let activeCivilians = [];
function clearCivilians() {
  for (const c of activeCivilians) {
    if (c.R && c.R.root) scene.remove(c.R.root);
  }
  activeCivilians.length = 0;
}
function makeCivilian(x, y, z, i) {
  const pal = CIV_PALS[i % CIV_PALS.length];
  const R = buildPerson({ shirt: pal.shirt, pants: pal.pants, hair: pal.hair, skin: [226 - i * 8, 184 - i * 6, 150 - i * 4], boot: [70, 50, 35] }, { uniform: false, cape: false, longHair: i % 2 === 1 });
  R.root.scale.setScalar(1.75 / 32); R.root.position.set(x, y, z); scene.add(R.root);
  return { R, pos: V(x, y, z), done: false, lost: false, threat: 0, t: Math.random() * 6, fade: 0 };
}
function spawnDeparturePlazaCitizens() {
  clearCivilians();
  // 16 cheering citizens lining the departure avenue in Ehrmich District (z from -20 to 8)
  for (let i = 0; i < 16; i++) {
    const side = (i % 2 === 0) ? -7.5 : 7.5;
    const z = -20 + i * 2.1;
    const c = makeCivilian(side + (Math.random() - 0.5) * 1.2, GROUND + 1, z, i);
    c.R.root.lookAt(0, GROUND + 1, z);
    activeCivilians.push(c);
  }
}
function triggerDepartureFanfare(api) {
  spawnDeparturePlazaCitizens();
  // Green signal flares shoot high from Wall Sina South Ramparts
  flare(V(-14, WALL_TOP + 2, 14), [0.2, 1, 0.4]);
  flare(V(14, WALL_TOP + 2, 14), [0.2, 1, 0.4]);
  Sfx.fanfare();
  addShake(0.5);
  api.bigMsg('OPERATION ADVANCE!', '57th Expedition beyond Wall Sina begins!', '#7dffb0', 3.5);
}

/* ---------------------------------------------------------------- helpers */
function surfaceAt(x, z) { for (let y = 120; y > 0; y--) if (SOLID[getBlock(Math.floor(x), y, Math.floor(z))]) return y + 1; return GROUND + 1; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function aliveTitans() { return G.titans.filter(t => t.alive && t.type !== 'dummy'); }
function flare(p, color = [0.4, 1, 0.5]) {
  for (let i = 0; i < 40; i++) sparks.spawn(p.x, p.y + 1, p.z, (Math.random() - 0.5) * 3, 18 + Math.random() * 12, (Math.random() - 0.5) * 3, 1.2 + Math.random() * 0.6, 0.6, 0.2, color[0], color[1], color[2], 1, 9, 0.6);
  for (let i = 0; i < 16; i++) steam.spawn(p.x, p.y + 2 + i * 1.5, p.z, (Math.random() - 0.5), 2, (Math.random() - 0.5), 4, 1, 3, color[0] * 0.6 + 0.4, color[1] * 0.6 + 0.4, color[2] * 0.6 + 0.4, 0.5, -0.5, 0.5);
}

/* =========================================================================
   Mission logic
   ========================================================================= */
export const Missions = {
  /* ------------------------------------------------------------ story Chapter I */
  story_shiganshina() {
    return {
      titans: [], targetCount: 6, killed: 0, secured: false, gateBeacon: null,
      start(api) {
        this.api = api;
        markers.clear();
        clearHorses();
        // Steed waits at the base of the wall rampart on the departure avenue
        spawnHorse(0, 0, { yaw: 0, y: GROUND + 1 });
        triggerDepartureFanfare(api);

        api.setObjective('Chapter I · Departure from Wall Sina', 'Ride south, eliminate 6 Titans in Trost, and secure the breach');
        api.say('Commander Erwin: <i>"Scouts — the gates of Wall Sina are opening! Citizens are cheering for our victory. <b>Leap down with your ODM gear or mount your military steed [H]</b>, charge south along the Grand Highway, eliminate 6 invading Pure Titans in Trost District, and secure the breached Outer Gate!"</i>', 12);

        // Titans roaming in Trost District ruins and southern approaches
        const spawns = [
          { type: 'runt', x: -16, z: 175 },
          { type: 'strider', x: 12, z: 185 },
          { type: 'abnormal', x: -18, z: 205 },
          { type: 'strider', x: 15, z: 215 },
          { type: 'abnormal', x: -10, z: 228 },
          { type: 'brute', x: 0, z: 238 }
        ];
        this.titans = spawns.map(s => {
          const t = api.spawnTitan(s.type, s.x, s.z, { alert: true, yaw: Math.random() * 6, team: 'enemy_titans' });
          t.mk = markers.add(t.pos, s.type.toUpperCase() + ' TITAN', 'danger edge');
          return t;
        });
        this.targetCount = 6;
        this.updateProgress();
      },
      updateProgress() {
        const alive = this.titans.filter(t => t.alive).length;
        this.killed = this.targetCount - alive;
        if (!this.secured) {
          this.api.setProgress(`Titans eliminated: <b>${this.killed}</b> / ${this.targetCount} · Travel south to Wall Rose`);
        }
      },
      update(dt, api) {
        for (const t of this.titans) {
          if (t.mk) {
            if (t.alive) {
              t.mk.pos.copy(t.pos);
              t.mk.pos.y += t.h + 1;
            } else {
              markers.remove(t.mk);
              t.mk = null;
            }
          }
        }
        this.updateProgress();
        const alive = this.titans.filter(t => t.alive).length;
        if (alive === 0 && !this.secured) {
          this.secured = true;
          api.bigMsg('TROST CLEARED', 'Advance to the breached Outer Gate!', '#7dffb0', 3.0);
          api.say('Commander Erwin: <i>"Trost District is cleared! All Scouts, regroup at the Outer Gate breach and ignite green flares!"</i>', 9);
          Sfx.horn();
          const gatePos = V(0, GROUND + 1, 246);
          this.gateBeacon = markers.add(gatePos, 'GATE BREACH', 'goal edge');
          api.setProgress('Advance to the <b>Trost Outer Gate breach</b> to secure forward camp');
        }
        if (this.secured && this.gateBeacon) {
          const P = G.player;
          if (P.pos.distanceTo(this.gateBeacon.pos) < 12) {
            flare(this.gateBeacon.pos, [0.2, 1, 0.4]);
            Sfx.fanfare();
            api.bigMsg('CAMP SECURED', 'Forward base established at Wall Rose breach', '#7dffb0', 3.5);
            api.complete({
              msg: 'Chapter I Cleared: Forward Camp Secured!',
              bonus: 5000,
              extra: `<div><b>6 / 6</b><span>Titans Slain</span></div>`
            });
            markers.clear();
            this.gateBeacon = null;
          }
        }
        markers.update();
      },
      cleanup() { markers.clear(); clearCivilians(); }
    };
  },

  /* ------------------------------------------------------------ story Chapter II */
  story_armored() {
    return {
      boss: null, done: false,
      start(api) {
        this.api = api;
        markers.clear();
        clearHorses();
        spawnHorse(0, 0, { yaw: 0, y: GROUND + 1 });
        triggerDepartureFanfare(api);

        api.setObjective('Chapter II · The Iron Fortress', 'Defeat the Armored Titan (Reiner) in Trost ruins');
        const b = this.boss = api.spawnTitan('armored', 0, 222, {
          yaw: Math.PI,
          name: 'Armored Titan (Reiner)',
          aggroR: 120,
          team: 'enemy_titans'
        });
        attachKit(b);
        api.setBoss(b);
        api.say('Commander Erwin: <i>"The Armored Titan ambushes at the Trost District ruins! Gallop south on horseback [H], strike his glowing knees, or press <b>[T]</b> to transform into the Attack Titan and brawl him!"</i>', 12);
        api.bigMsg('ARMORED AMBUSH', 'Reiner Braun attacks at Wall Rose', '#ff9a40', 3.0);
        Sfx.horn();
        this.mkKneeR = markers.add(V(), 'KNEE', 'danger');
        this.mkKneeL = markers.add(V(), 'KNEE', 'danger');
        this.mkNape = markers.add(V(), 'NAPE', 'goal edge');
        Music.target = 1;
      },
      update(dt, api) {
        const b = this.boss;
        if (!b) return;
        if (b.alive && b.hp > 0) {
          b.m.knR.localToWorld(this.mkKneeR.pos.set(0, -0.4, 0));
          b.m.knL.localToWorld(this.mkKneeL.pos.set(0, -0.4, 0));
          b.napeWorld(this.mkNape.pos);
          const kneeling = b.state === 'crippled' || b.state === 'stagger';
          this.mkKneeR.on = !kneeling;
          this.mkKneeL.on = !kneeling;
          this.mkNape.on = kneeling || (G.localTitan != null);
          api.setProgress(`Armored Titan HP: <b style="color:#ff9a40">${Math.ceil(b.hp)} / ${b.hpMax}</b> · Press <b>[T]</b> for Titan Form`);
        } else if (!this.done) {
          this.done = true;
          b.hp = 0;
          if (b.alive) b.kill({ by: 'hp_depleted' });
          api.setBoss(null);
          markers.clear();
          steamBurst(b.pos.clone().add(V(0, 6, 0)), 150, 12, 8, 20, 3.5, 2);
          Sfx.fanfare();
          api.bigMsg('ARMOR SHATTERED', 'Reiner forced into retreat!', '#ffd36a', 3.5);
          api.complete({
            msg: 'Chapter II Cleared: Armored Titan Repelled!',
            bonus: 9000,
            extra: `<div><b>REINER</b><span>Repelled</span></div>`
          });
        }
        markers.update();
      },
      cleanup() { markers.clear(); clearCivilians(); this.api && this.api.setBoss(null); }
    };
  },

  /* ------------------------------------------------------------ story Chapter III */
  story_colossal() {
    return {
      boss: null, steamCooldown: 7, isSteaming: false, steamTimer: 0, done: false,
      start(api) {
        this.api = api;
        markers.clear();
        clearHorses();
        spawnHorse(0, 0, { yaw: 0, y: GROUND + 1 });
        triggerDepartureFanfare(api);

        api.setObjective('Chapter III · The God of Destruction', 'Defeat the 34m Colossal Titan atop Wall Rose');
        const b = this.boss = api.spawnTitan('colossal', 0, 240, {
          yaw: Math.PI,
          name: 'Colossal Titan (Bertholdt)',
          aggroR: 150,
          team: 'enemy_titans'
        });
        attachKit(b);
        api.setBoss(b);
        api.say('Hange Zoe: <i>"The Colossal Titan has manifested atop Wall Rose! Gallop south, scale the high ramparts, evade the boiling steam blasts, and strike the nape between steam vents!"</i>', 12);
        api.bigMsg('COLOSSAL TITAN', 'The God of Destruction atop Wall Rose', '#ff4433', 3.5);
        Sfx.siren();
        addShake(1.2);
        this.mkNape = markers.add(V(), 'NAPE', 'goal edge');
        Music.target = 1;
      },
      update(dt, api) {
        const b = this.boss;
        if (!b) return;
        if (b.alive && b.hp > 0) {
          b.napeWorld(this.mkNape.pos);
          this.steamCooldown -= dt;
          if (!this.isSteaming && this.steamCooldown <= 0) {
            this.isSteaming = true;
            this.steamTimer = 5.5;
            api.toast('SCALDING STEAM VENTING! GET CLEAR!', 2.0);
            Sfx.steamBurst(2.0);
          }
          if (this.isSteaming) {
            this.steamTimer -= dt;
            const chest = b.chest(V());
            steamBurst(chest, 8, 8, 6, 12, 1.5, 1);
            const P = G.player;
            const dist = P.pos.distanceTo(chest);
            if (dist < 22 && !G.localTitan) {
              const push = _v.subVectors(P.pos, chest).normalize().multiplyScalar(28 * dt);
              P.vel.add(push);
              P.hp = Math.max(1, P.hp - 12 * dt);
              api.toast('BURNING STEAM! BACK OFF!', 0.5);
            }
            if (this.steamTimer <= 0) {
              this.isSteaming = false;
              this.steamCooldown = 11;
              api.toast('Steam vents cooled! STRIKE NOW!', 2.0);
            }
          }
          this.mkNape.on = !this.isSteaming;
          const status = this.isSteaming ? '<b style="color:#ff4433">VENTING STEAM (DANGER)</b>' : '<b style="color:#7dffb0">VENTS COOLED (ATTACK NOW!)</b>';
          api.setProgress(`Colossal Titan HP: <b style="color:#ff6050">${Math.ceil(b.hp)} / ${b.hpMax}</b> · ${status}`);
        } else if (!this.done) {
          this.done = true;
          b.hp = 0;
          if (b.alive) b.kill({ by: 'hp_depleted' });
          api.setBoss(null);
          markers.clear();
          steamBurst(b.pos.clone().add(V(0, 16, 0)), 300, 24, 18, 40, 5, 3);
          Sfx.fanfare();
          api.bigMsg('COLOSSAL DEFEATED', 'The titan collapses from Wall Rose!', '#ffd36a', 3.5);
          api.complete({
            msg: 'Chapter III Cleared: The Colossal Titan Defeated!',
            bonus: 14000,
            extra: `<div><b>BERTHOLDT</b><span>Vanquished</span></div>`
          });
        }
        markers.update();
      },
      cleanup() { markers.clear(); clearCivilians(); this.api && this.api.setBoss(null); }
    };
  },

  /* ------------------------------------------------------------ story Chapter IV */
  story_beast() {
    return {
      boss: null, escorts: [], pitchTimer: 5, done: false,
      start(api) {
        this.api = api;
        markers.clear();
        clearHorses();
        spawnHorse(0, 0, { yaw: 0, y: GROUND + 1 });
        triggerDepartureFanfare(api);

        api.setObjective('Chapter IV · The Final Charge', 'Survive supersonic boulder artillery and defeat the Beast Titan (Zeke)');
        const b = this.boss = api.spawnTitan('beast', 0, 275, {
          yaw: Math.PI,
          name: 'Beast Titan (Zeke)',
          aggroR: 160,
          team: 'enemy_titans'
        });
        attachKit(b);
        api.setBoss(b);
        this.escorts = [
          api.spawnTitan('strider', -24, 250, { yaw: Math.PI, alert: true, team: 'enemy_titans' }),
          api.spawnTitan('brute', 0, 255, { yaw: Math.PI, alert: true, team: 'enemy_titans' }),
          api.spawnTitan('abnormal', 24, 250, { yaw: Math.PI, alert: true, team: 'enemy_titans' })
        ];
        this.escorts.forEach((t) => {
          t.mk = markers.add(t.pos, 'ESCORT', 'danger');
        });
        this.mkBoss = markers.add(b.pos, 'BEAST TITAN', 'goal edge');
        api.say('Commander Erwin: <i>"Scouts, charge across the plains! The Beast Titan stands outside Wall Rose hurling crushed boulders at supersonic speeds — ride your horses [H], dodge the volleys, cut down his escorts, and take his head!"</i>', 12);
        api.bigMsg('THE FINAL CHARGE', 'Dodge supersonic boulder artillery!', '#ff4433', 3.5);
        Sfx.horn();
        Music.target = 1;
      },
      update(dt, api) {
        const b = this.boss;
        if (!b) return;
        for (const t of this.escorts) {
          if (t.mk) {
            if (t.alive && t.hp > 0) { t.mk.pos.copy(t.pos); t.mk.pos.y += t.h + 1; }
            else { markers.remove(t.mk); t.mk = null; }
          }
        }
        if (b.alive && b.hp > 0) {
          this.mkBoss.pos.copy(b.pos);
          this.mkBoss.pos.y += b.h + 1;
          this.pitchTimer -= dt;
          if (this.pitchTimer <= 0) {
            this.pitchTimer = 5.2 + Math.random() * 1.5;
            const P = G.player;
            const from = b.handWorld(-1, V()).add(V(0, 3, 0));
            api.toast('BOULDER SALVO INCOMING! DODGE!', 1.8);
            Sfx.swipe(0);
            Sfx.crash(0.8);
            for (let i = 0; i < 4; i++) {
              const scatter = V((Math.random() - 0.5) * 16, Math.random() * 4, (Math.random() - 0.5) * 16);
              const target = P.pos.clone().add(scatter).addScaledVector(P.vel, 0.5);
              throwBoulder(from, target, 2.2 + Math.random() * 0.8, { dmg: 28, speed: 55, blast: 2, by: b.id });
            }
          }
          const escortsAlive = this.escorts.filter(t => t.alive && t.hp > 0).length;
          api.setProgress(`Beast Titan HP: <b style="color:#ff6050">${Math.ceil(b.hp)} / ${b.hpMax}</b> · Escorts: <b>${escortsAlive}</b>`);
        } else if (!this.done) {
          this.done = true;
          b.hp = 0;
          if (b.alive) b.kill({ by: 'hp_depleted' });
          api.setBoss(null);
          markers.clear();
          steamBurst(b.pos.clone().add(V(0, 8, 0)), 150, 12, 8, 22, 3.5, 2);
          Sfx.fanfare();
          api.bigMsg('BEAST VANQUISHED', 'The artillery is silenced! The charge succeeded!', '#ffd36a', 3.5);
          api.complete({
            msg: 'Chapter IV Cleared: Beast Titan Defeated!',
            bonus: 18000,
            extra: `<div><b>ZEKE</b><span>Defeated</span></div>`
          });
        }
        markers.update();
      },
      cleanup() { markers.clear(); clearCivilians(); this.api && this.api.setBoss(null); }
    };
  },

  /* ------------------------------------------------------------ story Chapter V */
  story_reclamation() {
    return {
      bossArmored: null, bossBeast: null, done: false,
      start(api) {
        this.api = api;
        markers.clear();
        clearHorses();
        spawnHorse(0, 0, { yaw: 0, y: GROUND + 1 });
        triggerDepartureFanfare(api);

        api.setObjective('Chapter V · The Last Stand', 'Defeat both Armored & Beast Titans to seal Wall Rose');
        const arm = this.bossArmored = api.spawnTitan('armored', 0, 225, {
          yaw: Math.PI,
          name: 'Armored Titan',
          aggroR: 120,
          team: 'enemy_titans'
        });
        attachKit(arm);
        const bst = this.bossBeast = api.spawnTitan('beast', 0, 255, {
          yaw: Math.PI,
          name: 'Beast Titan',
          aggroR: 140,
          team: 'enemy_titans'
        });
        attachKit(bst);
        api.setBoss(arm);
        this.mkArm = markers.add(arm.pos, 'ARMORED', 'danger edge');
        this.mkBst = markers.add(bst.pos, 'BEAST', 'danger edge');
        api.say('Captain Levi: <i>"This is it. Humanity\'s decisive battle. Reiner and Zeke are holding the Trost breach. Slay both Shifters so we can seal Wall Rose forever! Press [T] to transform into the Attack Titan and crush them!"</i>', 12);
        api.bigMsg('THE LAST STAND', 'Reclaim Wall Rose for Humanity!', '#ffd36a', 3.5);
        Sfx.horn();
        Music.target = 1;
      },
      update(dt, api) {
        const arm = this.bossArmored, bst = this.bossBeast;
        if (!arm || !bst) return;
        const armAlive = arm.alive && arm.hp > 0;
        const bstAlive = bst.alive && bst.hp > 0;
        if (armAlive) { this.mkArm.pos.copy(arm.pos); this.mkArm.pos.y += arm.h + 1; }
        else if (this.mkArm) { markers.remove(this.mkArm); this.mkArm = null; }
        if (bstAlive) { this.mkBst.pos.copy(bst.pos); this.mkBst.pos.y += bst.h + 1; }
        else if (this.mkBst) { markers.remove(this.mkBst); this.mkBst = null; }

        if (armAlive) api.setBoss(arm);
        else if (bstAlive) api.setBoss(bst);

        const bothDead = !armAlive && !bstAlive;
        if (!bothDead) {
          api.setProgress(`Armored: <b style="color:${armAlive ? '#ff9a40' : '#888'}">${armAlive ? Math.ceil(arm.hp) : 'FALLEN'}</b> · Beast: <b style="color:${bstAlive ? '#ff6050' : '#888'}">${bstAlive ? Math.ceil(bst.hp) : 'FALLEN'}</b>`);
        } else if (!this.done) {
          this.done = true;
          arm.hp = 0; bst.hp = 0;
          if (arm.alive) arm.kill({ by: 'hp_depleted' });
          if (bst.alive) bst.kill({ by: 'hp_depleted' });
          api.setBoss(null);
          markers.clear();
          spikeFx({ p: [0, GROUND + 1, 246], d: [0, 1] });
          spikeFx({ p: [-4, GROUND + 1, 246], d: [0, 1] });
          spikeFx({ p: [4, GROUND + 1, 246], d: [0, 1] });
          flare(V(0, WALL_TOP + 2, 246), [0.2, 1, 0.4]);
          flare(V(-15, WALL_TOP + 2, 246), [0.2, 1, 0.4]);
          flare(V(15, WALL_TOP + 2, 246), [0.2, 1, 0.4]);
          Sfx.fanfare();
          api.bigMsg('WALL ROSE RECLAIMED!', 'Humanity has prevailed! The breach is sealed!', '#7dffb0', 4.5);
          api.complete({
            msg: 'CAMPAIGN COMPLETE: WALL ROSE HAS BEEN RECLAIMED!',
            bonus: 30000,
            extra: `<div><b>VICTORY</b><span>Wall Rose Sealed</span></div>`
          });
        }
        markers.update();
      },
      cleanup() { markers.clear(); clearCivilians(); this.api && this.api.setBoss(null); }
    };
  },

  /* ------------------------------------------------------------ Practice Ground */
  practice() {
    return {
      step: 0, t: 0, dummy: null, runt: null,
      start(api) {
        this.api = api;
        markers.clear();
        clearHorses();
        const P = G.player;
        // Spawn military horse right beside trainee
        spawnHorse(P.pos.x - 3, P.pos.z, { yaw: P.yaw, y: P.pos.y });

        this.dummy = api.spawnTitan('dummy', -44, -58, { yaw: -0.12, passive: true });
        this.mkDummy = markers.add(V(-44, GROUND + 7, -58), 'TRAINING NAPE', 'danger edge');

        api.setObjective('Practice Ground', 'Train Cavalry, 3DMG & Titan Shifter Combat in Wall Sina');
        api.say('Commander Erwin: <i>"Welcome to the Scout Practice Ground in Wall Sina, cadet. Your <b>military horse</b> is by your side on the field — press <b>[H]</b> to whistle or mount. Practice aerial grappling on the tether poles, slash the training mannequin\'s nape (F), or press <b>[T]</b> to test your Titan Shifter transformation."</i>', 12);
        api.setProgress('Ride horse [H] · Grapple poles · Slash dummy nape (F) · Transform [T]');
      },
      onNapeHit(t) {
        if (t === this.dummy) {
          this.api.bigMsg('PERFECT STRIKE', 'Deep cut delivered to target nape', '#ffd36a', 2.2);
          Sfx.fanfare();
          if (!this.runt) {
            this.runt = this.api.spawnTitan('strider', -54, -48, { yaw: Math.PI, alert: true });
            this.runt.aggroR = 100;
            this.api.toast('A combat training Titan has entered the yard!', 3.0);
          }
        }
      },
      onKill(t) {
        if (t === this.runt) {
          this.api.bigMsg('PRACTICE COMPLETE', 'You are ready for the reclamation!', '#7dffb0', 3.0);
          this.api.complete({ msg: 'Practice Ground Completed!', bonus: 5000 });
        }
      },
      update(dt, api) {
        this.t += dt;
        markers.update();
      },
      cleanup() { markers.clear(); }
    };
  },

  /* ------------------------------------------------------------ Scout Expedition (Free Roam) */
  expedition() {
    return {
      t: 2, killed: 0,
      start(api) {
        this.api = api;
        markers.clear();
        clearHorses();
        spawnHorse(0, 0, { yaw: 0, y: GROUND + 1 });
        triggerDepartureFanfare(api);

        api.setObjective('Scout Expedition', 'Open-world battle across Wall Sina, Grand Field & Wall Rose');
        api.say('Captain Levi: <i>"The expedition is underway. Ride across the Grand Highway, Giant Pine Forest, and Wall Rose ruins. Whistle your horse anytime with <b>[H]</b>, or transform into a Titan with <b>[T]</b>. Slay every Titan in sight."</i>', 10);
        api.setProgress('Expedition active · Press [H] for Horse · Press [T] for Titan Form');
      },
      update(dt, api) {
        this.t -= dt;
        const alive = aliveTitans();
        if (this.t <= 0 && alive.length < 9) {
          this.t = 4;
          const P = G.player, a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 50;
          let x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
          const types = ['runt', 'strider', 'strider', 'abnormal', 'brute'];
          api.spawnTitan(types[Math.floor(Math.random() * types.length)], x, z, { yaw: Math.random() * 6 });
        }
        api.setProgress(`Titans nearby: <b>${alive.length}</b> · Slain: <b>${G.player.kills}</b> · [H] Horse · [T] Titan`);
        markers.update();
      },
      cleanup() { markers.clear(); clearCivilians(); }
    };
  }
};

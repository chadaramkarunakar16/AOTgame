/* =========================================================================
   Missions: tutorial → defend the district → rescue → ring race → boss,
   plus Free Roam. Each mission is a small state machine driven by update().
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
const DR = W.DR || 84, GROUND = W.GROUND || 46, WALL_TOP = W.WALL_TOP || 76;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V(), _w = V(), _p1 = V(), _p2 = V();
const CAPTAIN = 'Commander Erwin Smith';

export const MISSIONS = [
  // ---- STORY MODE: RECLAMATION OF WALL MARIA (BATTLE OF SHIGANSHINA) ----
  { id: 'story_shiganshina', name: 'Operation: Return to Wall Maria', sub: 'Chapter I · The Silent District', art: 'm1.jpg', time: 0.10,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: -55, yaw: 0 },
    brief: `Scouts — today we begin <b>Operation: Return to Wall Maria</b>. The ruins of Shiganshina are eerily quiet, but aggressive Pure Titans lurk along the canal and central avenue. <b>Ride on horseback [H]</b>, eliminate 6 roaming Titans, and secure the breached Outer Gate.`,
    objectives: ['Ride military horse into Shiganshina [H]', 'Eliminate 6 aggressive Titans in the district', 'Reach the breached Outer Gate to secure camp'],
    ranks: [8000, 5000, 2500], outro: 'The forward camp is secure. Prepare for the enemy ambush.' },
  { id: 'story_armored', name: 'Clash of the Armored Titan', sub: 'Chapter II · The Iron Fortress (Reiner)', art: 'm2.jpg', time: 0.16,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: -55, yaw: 0 },
    brief: `<b>The Armored Titan ambushes from the rooftops!</b> His segmented armor plates turn standard blades. Break his glowing knee joints, strike his nape with maximum speed, or <b>press T to transform into the Attack Titan</b> and brawl him in the streets!`,
    objectives: ['Defeat the Armored Titan', 'Break his knee armor or brawl in Titan Form (T)', 'Protect the forward lines'],
    ranks: [14000, 9000, 5000], outro: 'Reiner has been repelled! But a greater danger approaches…' },
  { id: 'story_colossal', name: 'The God of Destruction', sub: 'Chapter III · The Colossal Explosion (Bertholdt)', art: 'm3.jpg', time: 0.48,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: -55, yaw: 0 },
    brief: `A cataclysmic flash tears through the sky! The <b>34-meter Colossal Titan</b> has manifested atop Wall Maria! The district is consumed by flames and boiling steam. <b>Evade the scalding steam</b>, scale the colossal walls, distract the titan, and cut his exposed nape between steam vents!`,
    objectives: ['Survive the boiling steam blasts', 'Scale Wall Maria\'s high ramparts', 'Strike the exposed nape to bring down the Colossal Titan'],
    ranks: [24000, 16000, 9000], outro: 'The Colossal Titan has fallen. The smoke clears over Wall Maria.' },
  { id: 'story_beast', name: 'The Beast\'s Artillery', sub: 'Chapter IV · The Final Charge (Zeke)', art: 'm4.jpg', time: 0.12,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: -55, yaw: 0 },
    brief: `Outside Wall Maria on the southern plains, the <b>Beast Titan</b> stands flanked by pure titans, hurling crushed boulders at supersonic speeds! <b>Lead the cavalry charge on horseback [H]</b>, dodge the crushing boulder barrages using smoke flares for cover, slice through his escort titans, and slay the Beast Titan!`,
    objectives: ['Gallop on horseback in Erwin\'s charge [H]', 'Dodge supersonic boulder artillery volleys', 'Eliminate escort titans and defeat the Beast Titan'],
    ranks: [28000, 18000, 10000], outro: 'The Beast\'s artillery has been silenced. The charge succeeded!' },
  { id: 'story_reclamation', name: 'Wall Maria Reclaimed', sub: 'Chapter V · The Last Stand', art: 'title.jpg', time: 0.18,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: -55, yaw: 0 },
    brief: `The final stand for humanity! The enemy Shifters make a desperate united attack at the Outer Gate to stop us from sealing Wall Maria! <b>Fight alongside the Scout Regiment or as the Attack Titan [T]</b>, eliminate the Shifters, and permanently seal the gate breach! Today, humanity reclaims its freedom!`,
    objectives: ['Defeat both the Armored Titan and Beast Titan at the breach', 'Protect the Wall Maria gate', 'Reclaim Wall Maria for humanity'],
    ranks: [35000, 22000, 12000], outro: 'Wall Maria has been reclaimed! The ocean awaits beyond the horizon!' },
  // ---- OUR OWN DEDICATED MODES ----
  { id: 'practice', name: 'Practice Ground', sub: 'Mastery Yard · Vector Gear, Cavalry & Titan Combat', art: 'm1.jpg', time: 0.12,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: -55, yaw: 0 },
    brief: `Welcome to the Scout Regiment Practice Ground. Here you can train on your <b>Military Steed (press H to mount/whistle)</b>, practice aerial grappling, test your blade cuts on wooden dummies, and press <b>[T]</b> to transform into your Titan Shifter form.`,
    objectives: ['Ride your military horse [H]', 'Grapple to tether poles and practice flight', 'Slash the training dummy nape', 'Press [T] to test Titan Shifter combat'],
    ranks: [6000, 4000, 2000], outro: 'Practice complete. You are ready for the battlefield.' },
  { id: 'expedition', name: 'Scout Expedition', sub: 'Wall Maria Sandbox · Endless Battle & Roam', art: 'title.jpg', time: 0.14,
    spawn: { x: 0, y: WALL_TOP + 1.2, z: -55, yaw: 0 },
    brief: `Take to the field with your squadron. Roam the Shiganshina canals, outer scorched plains, and colossal wall ramparts. <b>Ride on horseback with [H]</b>, eliminate roaming Titans of all sizes, and transform into any Titan Shifter at will with <b>[T]</b>.`,
    objectives: ['Roam Shiganshina and outer battlefield on horseback [H]', 'Slay roaming Titans of all sizes', 'Press [T] to transform into Titan form at will'],
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

/* ---------------------------------------------------------------- rings */
const ringGeo = new THREE.TorusGeometry(3.6, 0.32, 8, 40);
function makeRing(pos, next) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.9, depthWrite: false });
  const m = new THREE.Mesh(ringGeo, mat); m.position.copy(pos);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(3.3, 32), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.add(glow);
  scene.add(m);
  const r = { m, mat, glow, pos: m.position, n: V(0, 0, 1), done: false, checked: false };
  if (next) r.n.subVectors(next, pos).normalize();
  m.lookAt(_v.copy(pos).add(r.n));
  return r;
}
function nudgeRing(r) {
  if (r.checked || !chunkReady(Math.floor(r.pos.x), Math.floor(r.pos.z))) return;
  const free = () => { for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) if (x * x + y * y + z * z <= 12 && SOLID[getBlock(Math.floor(r.pos.x) + x, Math.floor(r.pos.y) + y, Math.floor(r.pos.z) + z)]) return false; return true; };
  for (let i = 0; i < 10 && !free(); i++) r.pos.y += 3;
  r.checked = true;
}
function passRing(r, prev, cur) {
  // segment prev→cur crossing the ring plane within its radius
  prev = _p1.copy(prev); prev.y += 1; cur = _p2.copy(cur); cur.y += 1;
  const a = _v.subVectors(prev, r.pos).dot(r.n), b = _w.subVectors(cur, r.pos).dot(r.n);
  if (Math.abs(cur.x - r.pos.x) + Math.abs(cur.z - r.pos.z) > 30) return false;
  if ((a > 0) === (b > 0) && Math.abs(b) > 0.6) return false;
  const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) || 1);
  const p = V().lerpVectors(prev, cur, t);
  return p.distanceTo(r.pos) < 4.5;
}

/* ---------------------------------------------------------------- civilians */
const CIV_PALS = [
  { shirt: [180, 60, 60], pants: [70, 60, 90], hair: [60, 40, 20] }, { shirt: [70, 120, 170], pants: [90, 80, 60], hair: [200, 170, 90] },
  { shirt: [210, 180, 90], pants: [60, 70, 60], hair: [30, 25, 20] }, { shirt: [120, 160, 90], pants: [80, 60, 50], hair: [120, 60, 30] },
  { shirt: [160, 110, 170], pants: [50, 50, 70], hair: [90, 60, 40] }
];
function makeCivilian(x, y, z, i) {
  const pal = CIV_PALS[i % CIV_PALS.length];
  const R = buildPerson({ shirt: pal.shirt, pants: pal.pants, hair: pal.hair, skin: [226 - i * 8, 184 - i * 6, 150 - i * 4], boot: [70, 50, 35] }, { uniform: false, cape: false, longHair: i % 2 === 1 });
  R.root.scale.setScalar(1.75 / 32); R.root.position.set(x, y, z); scene.add(R.root);
  return { R, pos: V(x, y, z), done: false, lost: false, threat: 0, t: Math.random() * 6, fade: 0 };
}

/* ---------------------------------------------------------------- helpers */
function surfaceAt(x, z) { for (let y = 120; y > 0; y--) if (SOLID[getBlock(Math.floor(x), y, Math.floor(z))]) return y + 1; return GROUND + 1; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function aliveTitans() { return G.titans.filter(t => t.alive && t.type !== 'dummy'); }
function flare(p, color = [0.4, 1, 0.5]) {
  for (let i = 0; i < 40; i++) sparks.spawn(p.x, p.y + 1, p.z, (Math.random() - 0.5) * 3, 18 + Math.random() * 12, (Math.random() - 0.5) * 3, 1.2 + Math.random() * 0.6, 0.6, 0.2, color[0], color[1], color[2], 1, 9, 0.6);
  for (let i = 0; i < 16; i++) steam.spawn(p.x, p.y + 2 + i * 1.5, p.z, (Math.random() - 0.5), 2, (Math.random() - 0.5), 4, 1, 3, color[0] * 0.6 + 0.4, color[1] * 0.6 + 0.4, color[2] * 0.6 + 0.4, 0.5, -0.5, 0.5);
}
function napeHint(api) { api.say('Remember — <b>only the nape</b> kills. Get behind it, build speed, and press <b>F</b>. Slashing an ankle drops a titan to its knees.', 7); }

/* =========================================================================
   Mission logic
   ========================================================================= */
export const Missions = {
  /* ------------------------------------------------------------ story Chapter I */
  story_shiganshina() {
    return {
      titans: [], targetCount: 5, killed: 0, secured: false, gateBeacon: null,
      start(api) {
        this.api = api;
        markers.clear();
        clearHorses();
        spawnHorse(0, -38, { yaw: 0, y: GROUND + 1 });

        api.setObjective('Chapter I · The Silent District', 'Eliminate 6 roaming Titans and secure the Outer Gate');
        api.say('Commander Erwin: <i>"Scouts — Shiganshina is quiet, but aggressive Titans roam the canal banks and avenue. <b>Ride on horseback [H]</b>, eliminate 6 roaming Titans, and secure our forward camp at the gate."</i>', 9);

        const spawns = [
          { type: 'runt', x: -18, z: -20 },
          { type: 'strider', x: -4, z: -5 },
          { type: 'abnormal', x: 20, z: 10 },
          { type: 'strider', x: -25, z: 22 },
          { type: 'abnormal', x: 26, z: 35 },
          { type: 'brute', x: 0, z: 52 }
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
          this.api.setProgress(`Titans eliminated: <b>${this.killed}</b> / ${this.targetCount}`);
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
          api.bigMsg('DISTRICT CLEARED', 'Advance to the breached Outer Gate!', '#7dffb0', 3.0);
          api.say('Commander Erwin: <i>"The canal and avenue are clear! All Scouts, regroup at the Outer Gate breach and ignite green flares!"</i>', 9);
          Sfx.horn();
          const gatePos = V(0, GROUND + 1, DR - 6);
          this.gateBeacon = markers.add(gatePos, 'GATE BREACH', 'goal edge');
          api.setProgress('Advance to the <b>Outer Gate breach</b> to secure forward camp');
        }
        if (this.secured && this.gateBeacon) {
          const P = G.player;
          if (P.pos.distanceTo(this.gateBeacon.pos) < 9) {
            flare(this.gateBeacon.pos, [0.2, 1, 0.4]);
            Sfx.fanfare();
            api.bigMsg('CAMP SECURED', 'Forward base established at Wall Maria', '#7dffb0', 3);
            api.complete({
              msg: 'Chapter I Cleared: Forward Camp Secured!',
              bonus: 5000,
              extra: `<div><b>5 / 5</b><span>Titans Slain</span></div>`
            });
            markers.clear();
            this.gateBeacon = null;
          }
        }
        markers.update();
      },
      cleanup() { markers.clear(); }
    };
  },

  /* ------------------------------------------------------------ story Chapter II */
  story_armored() {
    return {
      boss: null, done: false,
      start(api) {
        this.api = api;
        markers.clear();
        spawnHorse(0, -38, { yaw: 0, y: GROUND + 1 });

        api.setObjective('Chapter II · The Iron Fortress', 'Defeat the Armored Titan (Reiner)');
        const b = this.boss = api.spawnTitan('armored', 0, 22, {
          yaw: Math.PI,
          name: 'Armored Titan (Reiner)',
          aggroR: 90,
          team: 'enemy_titans'
        });
        attachKit(b);
        api.setBoss(b);
        api.say('Commander Erwin: <i>"The Armored Titan ambushes from the ruins! His armor turns ordinary blades — strike his glowing knees or press <b>[T]</b> to transform into the Attack Titan and brawl him!"</i>', 9);
        api.bigMsg('ARMORED AMBUSH', 'Reiner Braun attacks', '#ff9a40', 2.8);
        Sfx.horn();
        this.mkKneeR = markers.add(V(), 'KNEE', 'danger');
        this.mkKneeL = markers.add(V(), 'KNEE', 'danger');
        this.mkNape = markers.add(V(), 'NAPE', 'goal');
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
          if (b.alive) b.kill({ by: 'hp_depleted' });
          api.setBoss(null);
          markers.clear();
          steamBurst(b.pos.clone().add(V(0, 6, 0)), 120, 10, 6, 18, 3, 2);
          Sfx.fanfare();
          api.bigMsg('ARMOR SHATTERED', 'Reiner forced into retreat!', '#ffd36a', 3);
          api.complete({
            msg: 'Chapter II Cleared: Armored Titan Repelled!',
            bonus: 9000,
            extra: `<div><b>REINER</b><span>Repelled</span></div>`
          });
        }
        markers.update();
      },
      cleanup() { markers.clear(); this.api && this.api.setBoss(null); }
    };
  },

  /* ------------------------------------------------------------ story Chapter III */
  story_colossal() {
    return {
      boss: null, steamCooldown: 7, isSteaming: false, steamTimer: 0, done: false,
      start(api) {
        this.api = api;
        markers.clear();
        spawnHorse(0, -38, { yaw: 0, y: GROUND + 1 });

        api.setObjective('Chapter III · The God of Destruction', 'Defeat the 34m Colossal Titan atop Wall Maria');
        const b = this.boss = api.spawnTitan('colossal', 0, DR - 4, {
          yaw: Math.PI,
          name: 'Colossal Titan (Bertholdt)',
          aggroR: 120,
          team: 'enemy_titans'
        });
        attachKit(b);
        api.setBoss(b);
        api.say('Hange Zoe: <i>"The Colossal Titan is venting boiling steam! Do not grapple while the steam vents are roaring! Scale the ramparts, wait for cooling, and strike the nape!"</i>', 9);
        api.bigMsg('COLOSSAL TITAN', 'The God of Destruction atop Wall Maria', '#ff4433', 3.2);
        Sfx.siren();
        addShake(1.2);
        this.mkNape = markers.add(V(), 'NAPE', 'goal edge');
        Music.target = 1;
      },
      update(dt, api) {
        const b = this.boss;
        if (!b) return;
        if (b.alive) {
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
          api.setBoss(null);
          markers.clear();
          steamBurst(b.pos.clone().add(V(0, 16, 0)), 300, 24, 18, 40, 5, 3);
          Sfx.fanfare();
          api.bigMsg('COLOSSAL DEFEATED', 'The titan collapses from the wall!', '#ffd36a', 3.5);
          api.complete({
            msg: 'Chapter III Cleared: The Colossal Titan Defeated!',
            bonus: 14000,
            extra: `<div><b>BERTHOLDT</b><span>Vanquished</span></div>`
          });
        }
        markers.update();
      },
      cleanup() { markers.clear(); this.api && this.api.setBoss(null); }
    };
  },

  /* ------------------------------------------------------------ story Chapter IV */
  story_beast() {
    return {
      boss: null, escorts: [], pitchTimer: 5, done: false,
      start(api) {
        this.api = api;
        markers.clear();
        spawnHorse(0, -38, { yaw: 0, y: GROUND + 1 });

        api.setObjective('Chapter IV · The Final Charge', 'Survive supersonic boulder artillery and defeat the Beast Titan (Zeke)');
        const b = this.boss = api.spawnTitan('beast', 0, 42, {
          yaw: Math.PI,
          name: 'Beast Titan (Zeke)',
          aggroR: 150,
          team: 'enemy_titans'
        });
        attachKit(b);
        api.setBoss(b);
        this.escorts = [
          api.spawnTitan('strider', -18, 22, { yaw: Math.PI, alert: true, team: 'enemy_titans' }),
          api.spawnTitan('brute', 0, 26, { yaw: Math.PI, alert: true, team: 'enemy_titans' }),
          api.spawnTitan('abnormal', 18, 24, { yaw: Math.PI, alert: true, team: 'enemy_titans' })
        ];
        this.escorts.forEach((t) => {
          t.mk = markers.add(t.pos, 'ESCORT', 'danger');
        });
        this.mkBoss = markers.add(b.pos, 'BEAST TITAN', 'goal edge');
        api.say('Commander Erwin: <i>"Scouts, charge across the plains! The Beast Titan hurls crushed boulders at supersonic speeds — ride your horses [H], use ruins for cover, launch green smoke flares, cut down his escorts, and take his head!"</i>', 10);
        api.bigMsg('THE FINAL CHARGE', 'Dodge supersonic boulder artillery!', '#ff4433', 3.2);
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
      cleanup() { markers.clear(); this.api && this.api.setBoss(null); }
    };
  },

  /* ------------------------------------------------------------ story Chapter V */
  story_reclamation() {
    return {
      bossArmored: null, bossBeast: null, done: false,
      start(api) {
        this.api = api;
        markers.clear();
        spawnHorse(0, -38, { yaw: 0, y: GROUND + 1 });

        api.setObjective('Chapter V · The Last Stand', 'Defeat both the Armored Titan & Beast Titan to seal Wall Maria');
        const arm = this.bossArmored = api.spawnTitan('armored', 0, 18, {
          yaw: Math.PI,
          name: 'Armored Titan',
          aggroR: 100,
          team: 'enemy_titans'
        });
        attachKit(arm);
        const bst = this.bossBeast = api.spawnTitan('beast', 0, 42, {
          yaw: Math.PI,
          name: 'Beast Titan',
          aggroR: 120,
          team: 'enemy_titans'
        });
        attachKit(bst);
        api.setBoss(arm);
        this.mkArm = markers.add(arm.pos, 'ARMORED', 'danger edge');
        this.mkBst = markers.add(bst.pos, 'BEAST', 'danger edge');
        api.say('Captain Levi: <i>"This is it. Humanity\'s decisive battle. Reiner and Zeke are holding the district avenue. Slay both Shifters so we can seal Wall Maria forever! Press [T] to transform into the Attack Titan and crush them!"</i>', 12);
        api.bigMsg('THE LAST STAND', 'Reclaim Wall Maria for Humanity!', '#ffd36a', 3.5);
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
          if (arm.alive) arm.kill({ by: 'hp_depleted' });
          if (bst.alive) bst.kill({ by: 'hp_depleted' });
          api.setBoss(null);
          markers.clear();
          spikeFx({ p: [0, GROUND + 1, DR], d: [0, 1] });
          spikeFx({ p: [-4, GROUND + 1, DR], d: [0, 1] });
          spikeFx({ p: [4, GROUND + 1, DR], d: [0, 1] });
          flare(V(0, WALL_TOP + 2, DR), [0.2, 1, 0.4]);
          flare(V(-15, WALL_TOP + 2, DR), [0.2, 1, 0.4]);
          flare(V(15, WALL_TOP + 2, DR), [0.2, 1, 0.4]);
          Sfx.fanfare();
          api.bigMsg('WALL MARIA RECLAIMED!', 'Humanity has prevailed! The breach is sealed!', '#7dffb0', 4.5);
          api.complete({
            msg: 'CAMPAIGN COMPLETE: WALL MARIA HAS BEEN RECLAIMED!',
            bonus: 30000,
            extra: `<div><b>VICTORY</b><span>Wall Maria Sealed</span></div>`
          });
        }
        markers.update();
      },
      cleanup() { markers.clear(); this.api && this.api.setBoss(null); }
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
        spawnHorse(-48, -28, { yaw: 0, y: GROUND + 1 });

        this.dummy = api.spawnTitan('dummy', -44, -34, { yaw: -0.12, passive: true });
        this.mkDummy = markers.add(V(-44, GROUND + 7, -34), 'TRAINING NAPE', 'danger edge');

        api.setObjective('Practice Ground', 'Train Cavalry, 3DMG & Titan Shifter Combat');
        api.say('Commander Erwin: <i>"Welcome to the Scout Practice Ground, cadet. Your <b>military horse</b> is by your side on the field — press <b>[H]</b> to whistle or mount. Practice aerial grappling on the tether poles, slash the training mannequin\'s nape (F), or press <b>[T]</b> to test your Titan Shifter transformation."</i>', 12);
        api.setProgress('Ride horse [H] · Grapple poles · Slash dummy nape (F) · Transform [T]');
      },
      onNapeHit(t) {
        if (t === this.dummy) {
          this.api.bigMsg('PERFECT STRIKE', 'Deep cut delivered to target nape', '#ffd36a', 2.2);
          Sfx.fanfare();
          if (!this.runt) {
            this.runt = this.api.spawnTitan('strider', -54, -22, { yaw: Math.PI, alert: true });
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
        spawnHorse(0, -38, { yaw: 0, y: GROUND + 1 });

        api.setObjective('Scout Expedition', 'Endless battle across Shiganshina & outer plains');
        api.say('Captain Levi: <i>"The expedition is underway. Ride across the canal avenues and outer scorched plains. Whistle your horse anytime with <b>[H]</b>, or transform into a Titan with <b>[T]</b>. Slay every Titan in sight."</i>', 10);
        api.setProgress('Expedition active · Press [H] for Horse · Press [T] for Titan Form');
      },
      update(dt, api) {
        this.t -= dt;
        const alive = aliveTitans();
        if (this.t <= 0 && alive.length < 8) {
          this.t = 4;
          const P = G.player, a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 45;
          let x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
          const types = ['runt', 'strider', 'strider', 'abnormal', 'brute'];
          api.spawnTitan(types[Math.floor(Math.random() * types.length)], x, z, { yaw: Math.random() * 6 });
        }
        api.setProgress(`Titans nearby: <b>${alive.length}</b> · Slain: <b>${G.player.kills}</b> · [H] Horse · [T] Titan`);
        markers.update();
      },
      cleanup() { markers.clear(); }
    };
  }
};

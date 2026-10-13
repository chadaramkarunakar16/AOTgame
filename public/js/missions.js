/* =========================================================================
   Missions: tutorial → defend the district → rescue → ring race → boss,
   plus Free Roam. Each mission is a small state machine driven by update().
   ========================================================================= */
import { THREE, scene, camera, getBlock, SOLID, chunkReady } from './engine.js';
import { Sfx, Music } from './audio.js';
import { buildPerson } from './models.js';
import { steamBurst, sparkBurst, sparks, steam, dust } from './fx.js';
import { BossBrain } from './titans.js';
import { G } from './state.js';

const W = window;
const DR = W.DR, GROUND = W.GROUND, WALL_TOP = W.WALL_TOP;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V(), _w = V(), _p1 = V(), _p2 = V();
const CAPTAIN = 'Capt. Isolde Marr';

export const MISSIONS = [
  { id: 'tutorial', name: 'First Flight', sub: 'Training Yard · Tutorial', art: 'm1.jpg', time: 0.09,
    spawn: { x: 30, y: GROUND + 1, z: -22, yaw: -0.5 },
    brief: `Cadet — the Skyward Legion doesn't walk. It <b>flies</b>. Today you learn the Vector Gear: fire an anchor, ride the cable, release, anchor again. Then you'll learn the only lesson that matters out there: <b>a titan only dies to a deep cut across the nape of its neck.</b>`,
    objectives: ['Anchor to the training poles', 'Chain both anchors and swing', 'Boost through the rings', 'Cut the training dummy\'s nape', 'Bring down a real titan'],
    ranks: [5000, 3000, 1500], outro: 'Not bad for a first flight. The wall needs you now.' },
  { id: 'defense', name: 'Hold the Line', sub: 'South Gate · Defend the district', art: 'm2.jpg', time: 0.17,
    spawn: { x: 0, y: WALL_TOP + 1, z: DR - 2, yaw: Math.PI },
    brief: `Scouts report titans crossing the southern fields — three waves, maybe more. The gate's portcullis is jammed open. Every titan that gets inside will tear Haverwall apart block by block. <b>Meet them at the gate. Don't let district damage reach 100%.</b>`,
    objectives: ['Survive 3 waves of titans', 'Keep district damage below 100%', 'Leapers run and jump — watch the pink ones'],
    ranks: [16000, 10000, 6000], outro: 'The south gate holds. For now.' },
  { id: 'rescue', name: 'Search & Rescue', sub: 'West Quarter · Save the trapped', art: 'm3.jpg', time: 0.24,
    spawn: { x: -75, y: GROUND + 30, z: 0, yaw: -Math.PI / 2 },
    brief: `The west quarter was breached overnight. Five townsfolk are stranded on the rooftops and titans are closing in on them. <b>Fly to each civilian and press E</b> to fire their evacuation flare. If a titan reaches them first, they're gone. We can't lose more than two.`,
    objectives: ['Rescue the stranded civilians (E)', 'Lose no more than 2', 'Titans hunt the civilians — draw them off'],
    ranks: [12000, 8000, 4000], outro: 'They\'re safe behind the inner gate. Good flying.' },
  { id: 'race', name: 'Gale Run', sub: 'Giant Forest · Timed ring course', art: 'm4.jpg', time: 0.06,
    spawn: { x: 0, y: GROUND + 1, z: 52, yaw: 0 },
    brief: `Messenger duty: the Forest Outpost needs orders and the only way there is through the canopy. <b>Fly through every ring before the clock runs out</b> — each ring buys you more time. Chain your anchors, keep your momentum, and don't touch the ground.`,
    objectives: ['Pass all 16 rings in order', 'Each ring adds 5 seconds', 'Gold under 50s · Silver under 70s'],
    ranks: [9000, 6500, 4000], outro: 'Orders delivered. The forest has never seen anyone that fast.' },
  { id: 'boss', name: 'The Bastion', sub: 'South Fields · Boss', art: 'm5.jpg', time: 0.481, flow: 0,
    spawn: { x: 0, y: WALL_TOP + 1, z: DR - 2, yaw: Math.PI },
    brief: `It's here. A colossus twenty-four blocks tall, wrapped in stone armour — the one they call <b>the Bastion</b>. Blades will shatter on its plates. <b>Cut the glowing knee joints</b> to bring it down, then strike the nape. It will not die easily. If it reaches the gate, Haverwall falls.`,
    objectives: ['Break both glowing knees to topple it', 'Strike the exposed nape — three phases', 'Keep it from breaching the gate'],
    ranks: [30000, 20000, 12000], outro: 'The Bastion has fallen.' },
  { id: 'free', name: 'Free Roam', sub: 'Sandbox · Endless titans', art: 'title.jpg', time: 0.14,
    spawn: { x: -3, y: WALL_TOP + 1, z: DR - 2, yaw: Math.PI },
    brief: `No orders, no clock. Titans roam the fields endlessly. Practise your swings and chase high chains. Fuel canisters are scattered across the fields — fly through one to refill your gas.`,
    objectives: ['Titans keep coming', 'Fly through fuel canisters to refill gas', 'Supply depots refill gas and blades'],
    ranks: [40000, 20000, 8000], outro: 'Enough for today.' }
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
  /* ------------------------------------------------------------ tutorial */
  tutorial() {
    const M = {
      step: 0, t: 0, rings: [], dummy: null, runt: null, swapped: false, attachedL: false, attachedR: false, air: 0, moved: 0, startPos: null,
      objective: 'Learn the Vector Gear',
      start(api) {
        this.api = api; this.startPos = G.player.pos.clone();
        this.dummy = api.spawnTitan('dummy', 34, -48, { yaw: -0.12, passive: true });
        this.setStep(0);
      },
      setStep(s) {
        this.step = s; this.t = 0; const api = this.api;
        markers.clear();
        const P = G.player;
        if (s === 0) { api.say('Welcome to the yard, cadet. <b>WASD</b> to move, <b>mouse</b> to look. Take a few steps.', 99); api.setProgress('Move around'); }
        if (s === 1) {
          api.say('See the tall pole? Aim at it — the crosshair turns <b style="color:#7ff">cyan</b> when your anchor can reach. <b>Hold LEFT MOUSE</b> to fire the left anchor and ride the cable.', 99);
          api.setProgress('Anchor with LEFT MOUSE (hold)');
          markers.add(V(41, GROUND + 26, -39), 'ANCHOR HERE', 'goal edge');
        }
        if (s === 2) { api.say('Good! Now the right anchor: <b>hold RIGHT MOUSE</b>. Release one, fire the other — chain them and swing like a pendulum. Keep your momentum!', 99); api.setProgress('Fire the right anchor and stay airborne'); }
        if (s === 3) {
          api.say('<b>SPACE</b> fires gas for a boost (and jumps on the ground). <b>SHIFT</b> reels your cables in fast. Fly through all <b>4 rings</b>.', 99);
          const pts = [V(40, 58, -30), V(53, 63, -45), V(38, 66, -57), V(25, 60, -42)];
          this.rings = pts.map((p, i) => makeRing(p, pts[(i + 1) % pts.length]));
          this.ringI = 0; this.prev = P.pos.clone();
          this.mk = markers.add(this.rings[0].pos, 'RING', 'goal edge');
        }
        if (s === 4) {
          api.say('Now the real lesson. Titans regenerate from anything — <b>except a deep cut to the NAPE</b>, the back of the neck. Get behind the dummy, build speed, and press <b>F</b> as you pass the red target.', 99);
          api.setProgress('Cut the dummy\'s nape (F) at speed');
          this.mk = markers.add(V(34, GROUND + 7, -50), 'NAPE', 'danger edge');
        }
        if (s === 5) { api.say('Every cut dulls your blades. Watch the blade gauge — <b>press R</b> to swap in a fresh pair from your reserve. Supply depots (green beams) refill gas and blades.', 99); api.setProgress('Swap blades (R)'); }
        if (s === 6) {
          api.say('<b>A real titan has broken into the yard!</b> They swipe and grab — when one glows red and shows a <b style="color:#f66">!</b>, get clear. If you\'re grabbed, <b>mash F</b>. Take it down!', 10);
          api.setProgress('Kill the titan');
          this.runt = api.spawnTitan('strider', 60, -62, { yaw: -2.4, alert: true });
          this.runt.aggroR = 120;
          api.bigMsg('TITAN BREACH!', 'Bring it down', '#ff8060', 2);
          Sfx.horn();
        }
      },
      onAttach(a) { if (a.side === 0) this.attachedL = true; else this.attachedR = true; },
      onSwap() { this.swapped = true; },
      onShallow() { if (this.step === 4) this.api.say('<b>Too shallow!</b> You need speed for a deep cut. Anchor past it, reel in with <b>SHIFT</b> or boost with <b>SPACE</b>, and slash as you fly by.', 8); },
      onNapeHit(t) { if (t === this.dummy && this.step === 4) { this.api.bigMsg('PERFECT CUT', 'That\'s how you kill a titan', '#ffd36a', 2); setTimeout(() => this.setStep(5), 1500); this.step = 4.5; } },
      onKill(t) { if (t === this.runt) { this.api.complete({ msg: 'Training complete' }); } },
      update(dt, api) {
        this.t += dt; const P = G.player;
        if (this.step === 0) { if (P.pos.distanceTo(this.startPos) > 4 || this.t > 6) this.setStep(1); }
        else if (this.step === 1) { if (this.attachedL) this.setStep(2); }
        else if (this.step === 2) { if (!P.onGround) this.air += dt; api.setProgress(`Right anchor ${this.attachedR ? '✔' : '✘'} · Air time ${Math.min(3, this.air).toFixed(1)} / 3.0 s`); if (this.attachedR && this.air > 3) this.setStep(3); }
        else if (this.step === 3) {
          const r = this.rings[this.ringI];
          this.rings.forEach((q, i) => { q.mat.color.set(i === this.ringI ? 0xffd36a : q.done ? 0x60ff90 : 0x8899aa); q.mat.opacity = i === this.ringI ? 0.95 : 0.35; q.m.rotation.z += dt * (i === this.ringI ? 1.5 : 0.3); });
          if (r && passRing(r, this.prev, P.pos)) {
            r.done = true; Sfx.ring(); api.addScore(200, 'RING'); this.ringI++;
            if (this.ringI >= this.rings.length) { markers.clear(); this.rings.forEach(q => scene.remove(q.m)); this.setStep(4); }
            else this.mk.pos = this.rings[this.ringI].pos;
          }
          api.setProgress(`Rings ${this.ringI} / 4`);
          this.prev.copy(P.pos);
        }
        else if (this.step === 5) { if (this.swapped || this.t > 12) { this.dummy.kill({}); this.setStep(6); } }
        if (this.step === 6 && this.runt && !this.runt.alive && this.runt.state === 'dissolve') { /* handled in onKill */ }
        markers.update();
      },
      drawMap(ctx, P, dot) { if (this.rings[this.ringI] && this.step === 3) dot(this.rings[this.ringI].pos.x, this.rings[this.ringI].pos.z, 4, '#ffd36a', '#000'); },
      cleanup() { markers.clear(); this.rings.forEach(q => scene.remove(q.m)); }
    };
    return M;
  },

  /* ------------------------------------------------------------ defend the district */
  defense() {
    const WAVES = [
      [['strider', -20], ['runt', 10], ['strider', 30]],
      [['strider', -40], ['abnormal', 0], ['runt', 25], ['strider', 45]],
      [['brute', 0], ['strider', -35], ['abnormal', 30], ['runt', -15], ['strider', 50]]
    ];
    const MAXDMG = 4200;
    return {
      wave: -1, breakT: 3, fuel: 5, objective: 'Defend the south gate',
      start(api) {
        this.api = api;
        G.hooks.blockBroken = (x, y, z) => { if (Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)) < DR) G.districtDamage++; };
        api.say('Titans sighted in the south fields! Hold them at the gate. <b>Ankle cuts</b> stop them in their tracks — then go for the nape.', 7);
        api.setProgress('First wave incoming…');
      },
      spawnWave(i) {
        const api = this.api;
        for (const [type, x] of WAVES[i]) {
          const z = DR + 85 + Math.random() * 40;
          const route = [V(x * 0.3, 0, DR + 22), V(rnd(-3, 3), 0, DR + 4), V(rnd(-3, 3), 0, DR - 14), V(rnd(-50, 50), 0, rnd(-40, 40))];
          api.spawnTitan(type, x + rnd(-6, 6), z, { yaw: Math.PI, route });
        }
        api.bigMsg(`WAVE ${i + 1}`, i === 2 ? 'A Brute leads them — fifteen blocks tall' : `${WAVES[i].length} titans approaching`, '#ff8060', 2.4);
        Sfx.horn();
      },
      update(dt, api) {
        const alive = aliveTitans();
        if (this.wave < 0 || (alive.length === 0 && this.wave < WAVES.length)) {
          if (this.wave === WAVES.length - 1 && alive.length === 0) { api.complete({ msg: 'The gate holds', bonus: Math.max(0, Math.round((1 - G.districtDamage / MAXDMG) * 5000)), extra: `<div><b>${Math.round(G.districtDamage / MAXDMG * 100)}%</b><span>District damage</span></div>` }); return; }
          this.breakT -= dt;
          if (this.breakT <= 0) { this.wave++; this.spawnWave(this.wave); this.breakT = 9; }
          else if (this.wave >= 0) api.setProgress(`Wave ${this.wave + 1} cleared! Next wave in ${Math.ceil(this.breakT)}s`);
        } else {
          const dmg = Math.min(100, G.districtDamage / MAXDMG * 100);
          api.setProgress(`Wave ${this.wave + 1}/3 · Titans <b>${alive.length}</b> · District damage <b style="color:${dmg > 66 ? '#f66' : dmg > 33 ? '#fc6' : '#9f9'}">${dmg.toFixed(0)}%</b>`);
        }
        if (G.districtDamage >= MAXDMG) api.fail('The district has been overrun.');
        markers.update();
      },
      cleanup() { G.hooks.blockBroken = null; markers.clear(); }
    };
  },

  /* ------------------------------------------------------------ rescue */
  rescue() {
    return {
      civs: [], saved: 0, lost: 0, objective: 'Rescue the stranded civilians', spawnT: 25, extra: false,
      start(api) {
        this.api = api;
        // choose rooftop spots in the west quarter
        const spots = [];
        for (let i = 44; i <= 50; i++) for (let j = 44; j <= 56; j++) {
          const H = W.houseFor(i, j);
          if (!H.ok) continue;
          const bx = i * 12 - 600, bz = j * 12 - 600;
          if (bx > -12) continue;
          const u = Math.round((H.u0 + H.u1) / 2), v = Math.round((H.v0 + H.v1) / 2);
          spots.push([bx + u, W.houseRoofY(u, v) + 1, bz + v]);
        }
        spots.sort(() => Math.random() - 0.5);
        const pick = []; for (const s of spots) { if (pick.every(p => Math.hypot(p[0] - s[0], p[2] - s[2]) > 24)) pick.push(s); if (pick.length >= 5) break; }
        pick.forEach((s, i) => { const c = makeCivilian(s[0] + 0.5, s[1], s[2] + 0.5, i); c.mk = markers.add(c.pos.clone().add(V(0, 2.6, 0)), 'CIVILIAN', 'civ edge'); this.civs.push(c); });
        // titans start well away from every civilian
        const types = ['runt', 'strider', 'strider'];
        let placed = 0;
        for (let k = 0; k < 300 && placed < types.length; k++) {
          const x = k < 150 ? rnd(-68, -6) : rnd(8, 60), z = rnd(-62, 62);
          if (this.civs.some(c => Math.hypot(c.pos.x - x, c.pos.z - z) < (k < 150 ? 34 : 20)) || Math.hypot(x + 75, z) < 30) continue;
          api.spawnTitan(types[placed++], x, z, { yaw: Math.random() * 6 });
        }
        this.calm = 10;
        if (location.search.includes('civtest') && this.civs[0]) { const c = this.civs[0]; G.player.pos.set(c.pos.x + 3, c.pos.y + 2, c.pos.z + 3); }
        api.say('Five civilians on the western rooftops. Fly to them and press <b>E</b> to light their flares. Titans are hunting them — <b>draw them off or cut them down</b>.', 8);
      },
      interact() {
        const P = G.player;
        for (const c of this.civs) {
          if (c.done) continue;
          if (c.R.root.position.distanceTo(P.pos) < 5.5) {
            c.done = true; this.saved++; Sfx.rescue(); flare(c.R.root.position); markers.remove(c.mk);
            this.api.addScore(800, 'RESCUE'); this.api.bigMsg('CIVILIAN RESCUED', `${this.saved} saved`, '#7dffb0', 1.6);
            return;
          }
        }
      },
      update(dt, api) {
        const P = G.player;
        for (const c of this.civs) {
          c.t += dt;
          if (c.done) { c.fade += dt; c.R.root.position.y += dt * (c.lost ? 0 : 0.6); c.R.root.scale.setScalar(1.75 / 32 * Math.max(0.001, 1 - c.fade / 1.5)); if (c.fade > 1.5) c.R.root.visible = false; continue; }
          // settle on the roof once the chunk loads
          if (!c.settled && chunkReady(Math.floor(c.pos.x), Math.floor(c.pos.z))) { c.pos.y = surfaceAt(c.pos.x, c.pos.z); c.R.root.position.y = c.pos.y; c.mk.pos.y = c.pos.y + 2.6; c.settled = true; }
          // the roof might get destroyed under them
          if (c.settled && !SOLID[getBlock(Math.floor(c.pos.x), Math.floor(c.pos.y - 0.5), Math.floor(c.pos.z))]) { c.pos.y = surfaceAt(c.pos.x, c.pos.z); c.R.root.position.y = c.pos.y; c.mk.pos.y = c.pos.y + 2.6; }
          // wave for help
          const R = c.R; R.armR.rotation.z = -2.6 + Math.sin(c.t * 9) * 0.5; R.armL.rotation.z = 0.3 + Math.sin(c.t * 2) * 0.1;
          R.root.rotation.y = Math.atan2(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
          const near = c.R.root.position.distanceTo(P.pos) < 5.5;
          c.mk.el.classList.toggle('near', near);
          c.mk.el.querySelector('.mlabel').textContent = near ? 'PRESS E' : (c.threat > 0.3 ? 'IN DANGER!' : 'CIVILIAN');
          if (c.threat > 0.3 && !c.warned) { c.warned = true; api.toast('A civilian is in danger — get there fast!', 2.5); }
          if (c.threat <= 0.05) c.warned = false;
          if (c.threat > 6) {
            c.done = true; c.lost = true; this.lost++; markers.remove(c.mk);
            steamBurst(c.R.root.position, 14, 1, 1.5, 3, 1.5); dust(c.R.root.position, 8, 1.5);
            api.bigMsg('CIVILIAN TAKEN', `${this.lost} lost`, '#ff7060', 2); Sfx.failSting();
          }
        }
        // titans hunt the nearest civilian (after a short grace period)
        this.calm -= dt;
        for (const t of G.titans) {
          if (this.calm > 0) break;
          if (!t.alive) continue;
          let best = null, bd = 1e9;
          for (const c of this.civs) { if (c.done) continue; const d = Math.hypot(c.pos.x - t.pos.x, c.pos.z - t.pos.z); if (d < bd) { bd = d; best = c; } }
          t.civTarget = best;
          if (best && bd > t.h * 0.35 + 3) best.threat = Math.max(0, best.threat - dt * 0.5);
        }
        this.spawnT -= dt;
        if (this.spawnT <= 0 && !this.extra) { this.extra = true; api.spawnTitan('abnormal', -70, -10, { yaw: 1.5, alert: true }); api.bigMsg('LEAPER SIGHTED', 'It runs — and it leaps', '#ff7ad0', 2); Sfx.horn(); }
        const left = this.civs.filter(c => !c.done).length;
        api.setProgress(`Rescued <b style="color:#7dffb0">${this.saved}</b> · Lost <b style="color:#f77">${this.lost}</b>/2 · Remaining ${left}`);
        if (this.lost > 2) api.fail('Too many civilians were lost.');
        else if (left === 0 && this.saved >= 3) api.complete({ msg: `${this.saved} civilians saved`, bonus: this.saved * 1000, extra: `<div><b>${this.saved}/5</b><span>Rescued</span></div>` });
        markers.update();
      },
      drawMap(ctx, P, dot) { for (const c of this.civs) if (!c.done) dot(c.pos.x, c.pos.z, 4, c.threat > 0.3 ? '#ff0' : '#7dffb0', '#000'); },
      cleanup() { for (const c of this.civs) scene.remove(c.R.root); markers.clear(); }
    };
  },

  /* ------------------------------------------------------------ ring race */
  race() {
    const PTS = [[0, 60, 30], [14, 63, 8], [-18, 66, -12], [-30, 70, -40], [-12, 77, -64], [0, 82, -96], [-20, 72, -130], [10, 66, -160], [-15, 72, -194], [20, 78, -222],
      [42, 68, -188], [56, 72, -152], [62, 82, -112], [46, 78, -82], [40, 62, -42], [18, 58, -10]];
    return {
      rings: [], i: 0, clock: 32, elapsed: 0, started: false, objective: 'Fly through every ring',
      start(api) {
        this.api = api;
        const pts = PTS.map(p => V(p[0], p[1], p[2]));
        this.rings = pts.map((p, k) => makeRing(p, pts[k + 1] || V(p.x, p.y, p.z + 10).add(_v.subVectors(p, pts[k - 1]))));
        this.prev = G.player.pos.clone();
        this.mk = markers.add(this.rings[0].pos, 'RING 1', 'goal edge');
        api.say('The clock starts when you pass the first ring. <b>Hold W while swinging</b> to pump speed, <b>SHIFT</b> to reel, <b>SPACE</b> to boost.', 8);
      },
      update(dt, api) {
        const P = G.player;
        for (const r of this.rings) nudgeRing(r);
        if (this.started) { this.clock -= dt; this.elapsed += dt; }
        this.rings.forEach((q, k) => {
          const cur = k === this.i, nxt = k === this.i + 1;
          q.mat.color.set(cur ? 0xffd36a : q.done ? 0x60ff90 : nxt ? 0x9fc6ff : 0x8899aa);
          q.mat.opacity = cur ? 0.95 : q.done ? 0.15 : nxt ? 0.55 : 0.25;
          q.glow.material.opacity = cur ? 0.18 + Math.sin(G.time * 6) * 0.06 : 0.02;
          q.m.visible = !q.done || (G.time - (q.doneT || 0)) < 0.6;
          if (q.done) q.m.scale.setScalar(1 + (G.time - q.doneT) * 2);
        });
        const r = this.rings[this.i];
        if (r && passRing(r, this.prev, P.pos)) {
          r.done = true; r.doneT = G.time; Sfx.ring(); this.i++;
          if (!this.started) { this.started = true; api.bigMsg('GO!', 'The clock is running', '#ffd36a', 1.2); }
          else this.clock += 5;
          api.addScore(250 + Math.round(P.vel.length() * 8), 'RING');
          sparkBurst(r.pos, 30, 10, [1, 0.9, 0.5], 0.3);
          if (this.i >= this.rings.length) {
            const t = this.elapsed, medal = t < 50 ? 'GOLD' : t < 70 ? 'SILVER' : 'BRONZE';
            api.complete({ msg: `${medal} — ${api.fmtTime(t)}`, bonus: Math.max(0, Math.round((90 - t) * 120)), extra: `<div><b>${medal}</b><span>Medal</span></div>` });
            markers.clear(); return;
          }
          this.mk.pos = this.rings[this.i].pos; this.mk.el.querySelector('.mlabel').textContent = 'RING ' + (this.i + 1);
        }
        this.prev.copy(P.pos);
        if (this.started && this.clock <= 0) api.fail('Out of time.');
        api.setProgress(`Ring <b>${Math.min(this.i + 1, 16)}</b> / 16 · ${this.started ? `Time left <b style="color:${this.clock < 8 ? '#f66' : '#fff'}">${this.clock.toFixed(1)}s</b> · ${api.fmtTime(this.elapsed)}` : 'Clock starts at ring 1'}`);
        markers.update();
      },
      drawMap(ctx, P, dot) { const r = this.rings[this.i]; if (r) dot(r.pos.x, r.pos.z, 5, '#ffd36a', '#000'); const n = this.rings[this.i + 1]; if (n) dot(n.pos.x, n.pos.z, 3, '#9fc6ff', '#000'); },
      cleanup() { this.rings.forEach(q => scene.remove(q.m)); markers.clear(); }
    };
  },

  /* ------------------------------------------------------------ boss */
  boss() {
    return {
      boss: null, gate: 100, objective: 'Bring down the Bastion', intro: 0,
      start(api) {
        this.api = api;
        const b = this.boss = api.spawnTitan('boss', 0, DR + 150, { yaw: Math.PI, route: [V(0, 0, DR + 40), V(0, 0, DR + 6), V(0, 0, DR - 30), V(0, 0, 0)], aggroR: 55, alert: false });
        b.boss = new BossBrain(); b.speed = 3.2;
        api.setBoss(b);
        this.mk = markers.add(V(), 'KNEE', 'danger');
        this.mk2 = markers.add(V(), 'KNEE', 'danger');
        this.mk3 = markers.add(V(), 'NAPE', 'goal');
        api.say('There it is. <b>Its armour turns blades</b> — go for the <b style="color:#ff9a40">glowing knees</b>. Bring it to the ground, then cut the nape.', 9);
        Music.target = 1;
      },
      update(dt, api) {
        const b = this.boss, br = b.boss;
        // phase events
        while (br.events.length) {
          const e = br.events.shift();
          if (e.msg) api.bigMsg(e.msg, e.sub || '', e.phase ? '#ff9a40' : '#ffd36a', 2.4);
          if (e.warn) api.toast(e.warn, 2);
          if (e.napeHit) api.addScore(2500, 'BASTION WOUNDED');
          if (e.phase === 2) api.say('Its armour is gone but it\'s faster — and it\'s <b>throwing boulders</b>. Keep moving. Two more deep nape cuts!', 8);
          if (e.phase === 3) api.say('It\'s venting scalding steam! <b>When it glows, get clear</b> — then strike between the blasts!', 8);
          if (e.summon) { for (let i = 0; i < e.summon; i++) api.spawnTitan('runt', b.pos.x + rnd(-20, 20), b.pos.z + rnd(10, 25), { alert: true }); api.toast('The Bastion calls smaller titans to its side!', 2.5); }
        }
        // gate assault
        const inside = b.alive && b.pos.z < DR - 6 && Math.abs(b.pos.x) < DR;
        const atGate = b.alive && (Math.hypot(b.pos.x, b.pos.z - DR) < 18 || inside) && b.dis.legs <= 0 && br.kneelT <= 0;
        if (atGate) {
          this.gate -= dt * (inside ? 4 : 2.2);
          if (Math.random() < dt * 2) { b.smashSphere(V(rnd(-6, 6), GROUND + rnd(4, 18), DR - 2), 3, 30); Sfx.crash(0.8); }
          if (!this.warned) { this.warned = true; api.bigMsg('IT\'S AT THE GATE!', 'Stop it before the wall falls', '#ff6050', 2.4); }
        }
        if (this.gate <= 0) api.fail('The Bastion breached the gate. Haverwall has fallen.');
        // markers on the weak points
        const ph = br.phase;
        this.mk.on = this.mk2.on = b.alive && ph === 1 && br.kneelT <= 0;
        if (this.mk.on) { b.m.knR.localToWorld(this.mk.pos.set(0, -0.4, 0)); b.m.knL.localToWorld(this.mk2.pos.set(0, -0.4, 0)); this.mk.el.style.opacity = br.knees.ankleR > 0 ? 1 : 0; this.mk2.el.style.opacity = br.knees.ankleL > 0 ? 1 : 0; }
        this.mk3.on = b.alive && (br.kneelT > 0 || ph >= 2);
        if (this.mk3.on) b.napeWorld(this.mk3.pos);
        api.setProgress(`${['', 'Phase I — break the glowing knees', 'Phase II — two deep nape cuts', 'Phase III — finish it between steam blasts'][ph] || ''} · Gate <b style="color:${this.gate < 40 ? '#f66' : '#9f9'}">${Math.max(0, this.gate).toFixed(0)}%</b>`);
        if (!b.alive && !this.done) { this.done = true; api.setBoss(b); api.complete({ msg: 'The Bastion has fallen!', bonus: Math.round(this.gate * 80), extra: `<div><b>${Math.max(0, this.gate).toFixed(0)}%</b><span>Gate integrity</span></div>` }); }
        markers.update();
      },
      cleanup() { markers.clear(); this.api && this.api.setBoss(null); }
    };
  },

  /* ------------------------------------------------------------ free roam */
  free() {
    return {
      t: 2, fuel: 8, objective: 'Free Roam — titans never stop coming',
      start(api) { this.api = api; api.say('Free roam. Titans gather in the fields outside the walls. Blue beams mark <b>fuel canisters</b> — fly through them to refuel.', 6); },
      update(dt, api) {
        this.t -= dt;
        const alive = aliveTitans();
        if (this.t <= 0 && alive.length < 6) {
          this.t = 4;
          const P = G.player, a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 40;
          let x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
          const types = ['runt', 'strider', 'strider', 'abnormal', 'brute', 'runt'];
          api.spawnTitan(types[Math.floor(Math.random() * types.length)], x, z, { yaw: Math.random() * 6 });
        }
        api.setProgress(`Titans nearby <b>${alive.length}</b> · Slain <b>${G.player.kills}</b>`);
        markers.update();
      },
      cleanup() { markers.clear(); }
    };
  }
};

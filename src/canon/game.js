/* =========================================================================
   Titan Siege — player, mobility gear, camera, combat, HUD, loop.
   ========================================================================= */
import {
  THREE, B, BLOCKS, HOTBAR, SOLID, CROSS, TILE_FACE, ATLAS_N, TS, atlasCanvas, renderer, scene, camera, matOpaque, matWater,
  waterUniforms, waterTex, crackTex, getBlock, setBlock, chunkReady, getChunk, setupWorkers, startWorld, updateChunks, updateSky,
  sky, sun, moon, stars, fogCol, lightCol, sunDir, view, setDayTime, getLight, meshedAround, setRenderDist, getRenderDist, countMeshed
} from './engine.js';
import { Sfx, Music } from './audio.js';
import { buildPerson } from './models.js';
import { steam, steamBurst, sparkBurst, gasPuff, dust, debris, trails, Cable, makeShadow, placeShadow, shake, addShake, drawSpeedLines, updateFX, clearFX, fxUniforms, cutArc } from './fx.js';
import { Titan, rayTitans, sphereTitanParts, pushOutOfTitan, updateProjectiles, titanThreats, areaEffect } from './titans.js';
import { G } from './state.js';
import { MISSIONS, Missions, markers } from './missions.js';
import { activeHorse, whistleHorse, getActiveHorse, dismountPlayerHorse, spawnHorse, clearHorses } from './horses.js';
import { FuelDrops, FUEL, randomDropSpot } from './fuel.js';
import { initMP, mpUpdate, MP, setBoard, spectateTarget, leaveMatch } from './mp.js';
import { pilotInput, pilotCamera, pilotHud, showPilotHud, pilotDenied, pilotSlots } from './pilot.js';
import { charLook, charStats, CHARACTERS } from './characters.js';
import { GUN, parryActive } from './guns.js';
import { TOUCH, initTouch, touchFrame, setTouch, releaseAll as touchRelease } from './touch.js';
import { SHIFTER_TYPES, kitInfo, initPilotedTitan, attachKit, castFx, updateSpikes } from './shifters.js';

const $ = (id) => document.getElementById(id);
const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const params = new URLSearchParams(location.search);
const WORLD_SEED = 'wall_maria';
const RANGE = 78;

/* ---------------------------------------------------------------- lights for entities */
const hemi = new THREE.HemisphereLight(0xe8f2ff, 0x6a5a44, 2.2); scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 2.4); scene.add(sunLight); scene.add(sunLight.target);
function updateLights() {
  const L = getLight();
  sunLight.position.copy(sunDir).multiplyScalar(100).add(camera.position); sunLight.target.position.copy(camera.position);
  sunLight.intensity = 0.3 + 2.4 * L.dayF; sunLight.color.copy(lightCol);
  hemi.intensity = 0.9 + 1.5 * L.dayF;
}

/* ---------------------------------------------------------------- player */
const P = G.player = {
  id: 'me', name: 'You', team: 'scouts', faction: 'corps', local: true, isScout: true,
  pos: V(), vel: V(), onGround: false, alive: true, hp: 100, gas: 100, sharp: 100, spare: 8, swapT: 0,
  yaw: 0, pitch: -0.12, grabbedBy: null, escape: 0, lastHurt: -99, invuln: 0, hitT: 0,
  slashT: -1, slashCD: 0, spinT: -1, slashSide: 0, slashHit: new Set(), swingT: -1, drawn: false, cutSpinT: -1,
  airT: 0, groundT: 0, boosting: false, boostHeld: 0, reeling: false, fp: false, stunT: 0, lastImpact: 0, brace: 0,
  anchors: [], runPh: 0, stepDist: 0, deadT: 0, kills: 0, score: 0, combo: 0, chainT: 0, bestCombo: 0, lastKillT: -99,
  frozen: true, jumpT: 0, maxSpeed: 0
};
function mkAnchor(side) { return { side, state: 'idle', held: false, pos: V(), target: V(), len: 0, titan: null, bone: null, local: V(), kind: 'stone', block: null, t: 0, cable: new Cable() }; }
P.anchors = [mkAnchor(0), mkAnchor(1)];
G.scouts = [P];
let hero = buildPerson(undefined, { gear: true });
const HERO_S = 1.8 / 32;
hero.root.scale.setScalar(HERO_S);
hero.model.position.y = -15;
scene.add(hero.root);
// multiplayer characters: new skin + perks (null restores the single-player hero)
function setLocalChar(id) {
  scene.remove(hero.root);
  if (id) { const { pal, opts } = charLook(id); hero = buildPerson(pal, opts); }
  else hero = buildPerson(undefined, { gear: true });
  hero.root.scale.setScalar(HERO_S); hero.model.position.y = -15; scene.add(hero.root);
  P.charId = id || null; P.char = id ? charStats(id) : null; P.maxHp = P.char ? P.char.hp : 100;
  P.faction = id ? CHARACTERS[id].faction : 'corps';
  document.body.classList.toggle('gunner', P.faction === 'interior');
  for (const b of fpBlades) b.g.visible = P.faction !== 'interior';
}
const heroShadow = makeShadow();
// first-person blades
const fpRig = new THREE.Group(); camera.add(fpRig);
const fpBlades = [-1, 1].map(s => {
  const g = new THREE.Group(); g.position.set(0.42 * s, -0.42, -0.6); fpRig.add(g);
  const mat = new THREE.MeshLambertMaterial({ color: 0xdfe6ee, emissive: 0x334450, depthTest: true });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.85), mat); blade.position.set(0, 0.0, -0.45); g.add(blade);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.2), new THREE.MeshLambertMaterial({ color: 0x3a3c42 })); g.add(grip);
  g.rotation.set(0.25, -0.18 * s, 0.35 * s);
  return { g, mat, blade, s };
});
fpRig.visible = false;

/* ---------------------------------------------------------------- input */
const keys = {}; const mouse = { l: false, r: false };
let locked = false, gameState = 'title', sens = +(localStorage.getItem('ts_sens') || 1), invertY = false;
const pressed = new Set();
function onPress(code) {
  pressed.add(code);
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'F5' || e.code === 'Space' || e.code === 'Tab' || e.code === 'F3') e.preventDefault();
  if (gameState === 'play') {
    if (!keys[e.code]) onPress(e.code);
    keys[e.code] = true;
    if (e.code === 'Escape') {
      if (tacticalMapOpen) { toggleTacticalMap(false); return; }
      pauseGame();
    }
  } else if (e.code === 'Escape' && gameState === 'pause') resumeGame();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab' && MP.active) setBoard(false); });
document.addEventListener('keydown', (e) => { if (e.code === 'Tab' && MP.active && !e.repeat) setBoard(true); });
canvasEl().addEventListener('mousedown', (e) => {
  if (gameState !== 'play') return;
  if (!locked) requestLock();
  if (e.button === 0) { mouse.l = true; onPress('Mouse0'); }
  if (e.button === 2) { mouse.r = true; onPress('Mouse2'); }
});
window.addEventListener('click', () => {
  if (gameState === 'play' && !locked && !TOUCH.on) requestLock();
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (gameState !== 'play' || !locked) return;
  const k = 0.0021 * sens;
  P.yaw -= e.movementX * k; P.pitch -= e.movementY * k * (invertY ? -1 : 1);
  P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch));
});
function canvasEl() { return renderer.domElement; }
function requestLock() { if (TOUCH.on) return; try { const r = canvasEl().requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvasEl();
});
document.addEventListener('pointerlockerror', () => { locked = false; });
// gamepad
const pad = { lx: 0, ly: 0, rx: 0, ry: 0, btn: [], prev: [], connected: false };
window.addEventListener('gamepadconnected', () => { pad.connected = true; toast('Gamepad connected'); });
function pollPad(dt) {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps && Array.from(gps).find(g => g);
  if (!gp) { pad.connected = false; return; }
  pad.connected = true;
  const dz = (v) => Math.abs(v) < 0.15 ? 0 : v;
  pad.lx = dz(gp.axes[0] || 0); pad.ly = dz(gp.axes[1] || 0); pad.rx = dz(gp.axes[2] || 0); pad.ry = dz(gp.axes[3] || 0);
  pad.prev = pad.btn; pad.btn = gp.buttons.map(b => b.pressed || b.value > 0.4);
  const just = (i) => pad.btn[i] && !pad.prev[i];
  if (gameState === 'play') {
    P.yaw -= pad.rx * dt * 3.2 * sens; P.pitch -= pad.ry * dt * 2.4 * sens; P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch));
    if (just(6)) onPress('Mouse0'); if (just(7)) onPress('Mouse2');
    if (just(0)) onPress('Space'); if (just(2) || just(5)) onPress('KeyF'); if (just(3)) onPress('KeyR'); if (just(1)) onPress('KeyE');
    if (just(10) || just(11)) onPress('KeyV'); if (just(9)) pauseGame();
  } else if (gameState === 'pause' && just(9)) resumeGame();
  else if ((gameState === 'brief') && just(0)) beginMission();
}
const padHeld = (i) => pad.connected && !!pad.btn[i];
const held = {
  l: () => mouse.l || keys.KeyQ || padHeld(6),
  r: () => mouse.r || keys.KeyC || padHeld(7),
  space: () => keys.Space || padHeld(0),
  reel: () => keys.ShiftLeft || keys.ShiftRight || padHeld(4) || (TOUCH.on && TOUCH.gas && P.anchors.some(a => a.state === 'attached')),
  brake: () => keys.KeyG || padHeld(13),
};

/* ---------------------------------------------------------------- voxel raycast with distance */
function rayVoxel(o, d, maxD) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = d.x ? (d.x > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
  let ty = d.y ? (d.y > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
  let tz = d.z ? (d.z > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 400 && t <= maxD; i++) {
    const id = getBlock(x, y, z);
    if (id && id !== B.WATER && !CROSS[id]) return { x, y, z, id, nx, ny, nz, t };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

/* ---------------------------------------------------------------- aiming */
const AIM = { valid: false, any: false, point: V(), dist: 0, titan: null, bone: null, local: V(), kind: 'stone', block: null, name: '', miss: V() };
const camBase = V(); let camDist = 5.4;
function chest(out) { out.copy(P.pos); out.y += 1.0; return out; }
function computeAim() {
  const d = _a.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const skip = P.fp ? 0.2 : camDist * 0.95;
  const o = _b.copy(camBase).addScaledVector(d, skip);
  const maxT = RANGE + 30;
  const hv = rayVoxel(o, d, maxT);
  const ht = rayTitans(o, d, maxT);
  AIM.any = false; AIM.valid = false; AIM.titan = null;
  let t = Infinity;
  if (hv) t = hv.t;
  if (ht && ht.t < t) {
    t = ht.t; AIM.titan = ht.titan; AIM.bone = ht.bone; AIM.local.copy(ht.local); AIM.kind = 'flesh'; AIM.name = ht.name; AIM.block = null;
  } else if (hv) {
    AIM.block = [hv.x, hv.y, hv.z]; const def = BLOCKS[hv.id];
    AIM.kind = def && (def.snd === 'wood' || def.snd === 'leaves') ? 'wood' : 'stone'; AIM.name = '';
  }
  AIM.scout = null;
  if (G.mode === 'mp') for (const s of G.scouts) {
    if (s === P || !s.alive || s.hidden || !G.hostile(P, s)) continue;
    const c = _c.copy(s.pos); c.y += 1; const along = _d.subVectors(c, o).dot(d);
    if (along < 0 || along > t) continue;
    const off = _d.subVectors(c, o).addScaledVector(d, -along).length();
    if (off < 0.9 + (P.faction === "interior" ? 0.2 + along * 0.015 : 0) + (TOUCH.on ? 0.4 + along * 0.01 : 0)) { t = along; AIM.scout = s; AIM.titan = null; AIM.block = null; AIM.kind = 'flesh'; AIM.name = ''; }
  }
  if (t < Infinity) {
    AIM.any = true;
    AIM.point.copy(o).addScaledVector(d, t);
    if (AIM.scout) { AIM.point.copy(AIM.scout.pos); AIM.point.y += 1; }   // aim assist: snap to the chest we're locked on
    AIM.dist = AIM.point.distanceTo(chest(_c));
    AIM.valid = AIM.dist <= RANGE;
  }
  AIM.miss.copy(chest(_c)).addScaledVector(d, RANGE);
}

// Touch hooks aim for you: each side searches rings of rays around the crosshair (nudged toward its own side
// and slightly upward) and takes the best anchor in range from the innermost ring that finds one. A titan
// under the crosshair takes both hooks. Refreshed ~20 times a second for the markers, and again on fire.
const mkAim = () => ({ valid: false, point: V(), dist: 0, titan: null, bone: null, local: V(), kind: 'stone', block: null, name: '' });
const TAIM = [mkAim(), mkAim()];
const RINGS = [[0, 1], [0.1, 6], [0.2, 8], [0.32, 10], [0.45, 12]];
let taimT = 0;
function touchAim() {
  const f = _a.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const r = V().set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const u = V().crossVectors(r, f).normalize();
  const o = V().copy(camBase).addScaledVector(f, P.fp ? 0.2 : camDist * 0.95);
  const ch = chest(V()), dir = V(), pt = V();
  for (let side = 0; side < 2; side++) {
    const T = TAIM[side]; T.valid = false;
    if (AIM.valid && AIM.titan) { Object.assign(T, { valid: true, dist: AIM.dist, titan: AIM.titan, bone: AIM.bone, kind: AIM.kind, block: null, name: AIM.name }); T.point.copy(AIM.point); T.local.copy(AIM.local); continue; }
    const s = side ? 1 : -1;
    let best = null, bs = 1e9;
    for (let ri = 0; ri < RINGS.length && !best; ri++) {
      const [rad, n] = RINGS[ri];
      for (let k = 0; k < n; k++) {
        const an = (k / n) * Math.PI * 2 + ri * 0.4;
        const ox = 0.09 * s + rad * Math.cos(an), oy = 0.06 + rad * Math.sin(an);
        dir.copy(f).addScaledVector(r, Math.tan(ox)).addScaledVector(u, Math.tan(oy)).normalize();
        const maxT = RANGE + camDist + 2;
        const hv = rayVoxel(o, dir, maxT), ht = ri < 2 ? rayTitans(o, dir, maxT) : null;
        const useT = ht && (!hv || ht.t < hv.t), t = useT ? ht.t : hv ? hv.t : -1;
        if (t < 0) continue;
        pt.copy(o).addScaledVector(dir, t);
        const dist = pt.distanceTo(ch);
        if (dist > RANGE || dist < 3) continue;
        // inner rings first; within a ring prefer anchors above you, then titans
        const sc = Math.hypot(ox - 0.09 * s, oy - 0.06) - Math.max(-0.05, Math.min(0.12, (pt.y - ch.y) / 60)) - (useT ? 0.05 : 0);
        if (sc < bs) {
          bs = sc; best = T; T.valid = true; T.point.copy(pt); T.dist = dist;
          if (useT) { T.titan = ht.titan; T.bone = ht.bone; T.local.copy(ht.local); T.kind = 'flesh'; T.name = ht.name; T.block = null; }
          else { T.titan = null; T.block = [hv.x, hv.y, hv.z]; const def = BLOCKS[hv.id]; T.kind = def && (def.snd === 'wood' || def.snd === 'leaves') ? 'wood' : 'stone'; T.name = ''; }
        }
      }
    }
  }
}

// 3D marker on the exact anchor point under the crosshair
const aimTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(32, 6); g.lineTo(58, 32); g.lineTo(32, 58); g.lineTo(6, 32); g.closePath(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 5, 0, 6.3); g.fill(); const t = new THREE.CanvasTexture(c); return t; })();
const aimMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: aimTex, depthTest: false, transparent: true, opacity: 0.9 }));
aimMark.renderOrder = 30; aimMark.visible = false; scene.add(aimMark);
const sideMarks = [0, 1].map(() => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: aimTex, depthTest: false, transparent: true, opacity: 0.85 })); m.renderOrder = 30; m.visible = false; scene.add(m); return m; });
function updateAimMark() {
  const showing = gameState === 'play' && P.alive && !P.grabbedBy && !P.stunT;
  for (let i = 0; i < 2; i++) {
    const m = sideMarks[i], T = TAIM[i], a = P.anchors[i];
    m.visible = TOUCH.on && showing && T.valid && a.state !== 'attached' && (i === 0 || !TAIM[0].valid || T.point.distanceToSquared(TAIM[0].point) > 1);
    if (!m.visible) continue;
    m.position.copy(T.point);
    const s = camera.position.distanceTo(T.point) * 0.03;
    m.scale.set(s, s, 1);
    m.material.color.set(T.titan ? (T.name === 'nape' ? 0xffd36a : 0xffa060) : 0x7dffb0);
  }
  aimMark.visible = showing && AIM.any && !(TOUCH.on && !AIM.valid);
  if (!aimMark.visible) return;
  aimMark.position.copy(AIM.point);
  const d = camera.position.distanceTo(AIM.point), s = d * 0.022 * (1 + 0.1 * Math.sin(G.time * 10));
  aimMark.scale.set(s, s, 1);
  aimMark.material.color.set(!AIM.valid ? 0xff6a5a : AIM.titan ? (AIM.name === 'nape' ? 0xffd36a : 0xffa060) : 0x6ff3ff);
  aimMark.material.opacity = AIM.valid ? 0.95 : 0.45;
}

/* ---------------------------------------------------------------- anchors */
function launchPoint(i, out) {
  const v = i === 0 ? hero.launchL : hero.launchR;
  return hero.model.localToWorld(out.copy(v));
}
function fireAnchor(i) {
  const a = P.anchors[i];
  if (!P.alive || P.grabbedBy || P.frozen || P.stunT > 0) return;
  if (P.jamT > 0) { Sfx.dry(); toast('GEAR JAMMED', 0.8); return; }
  a.held = true; a.t = 0;
  launchPoint(i, a.pos);
  Sfx.anchorFire();
  let A = AIM;
  if (TOUCH.on) { touchAim(); taimT = 0; if (TAIM[i].valid) A = TAIM[i]; }
  if (A.valid) {
    a.state = 'fly'; a.target.copy(A.point); a.titan = A.titan; a.bone = A.bone; a.local.copy(A.local); a.kind = A.kind; a.block = A.block;
  } else { a.state = 'miss'; a.target.copy(AIM.any && AIM.dist < RANGE * 1.2 ? AIM.point : AIM.miss); a.titan = null; a.block = null; }
  P.gas = Math.max(0, P.gas - GAS.fire);
  if (G.mission && G.mission.onAnchorFire) G.mission.onAnchorFire(i);
}
function releaseAnchor(i) {
  const a = P.anchors[i]; a.held = false;
  if (a.state === 'attached' || a.state === 'fly') { a.state = 'retract'; if (a.state === 'attached') Sfx.release(); }
}
function detachAll() { for (const a of P.anchors) { a.held = false; if (a.state !== 'idle') a.state = 'retract'; } }
function updateAnchors(dt) {
  for (const a of P.anchors) {
    const lp = launchPoint(a.side, _d);
    if (a.titan && (a.state === 'fly' || a.state === 'attached')) {
      if (a.titan.removed || a.titan.state === 'dissolve') { a.state = 'retract'; a.titan = null; }
      else a.bone.localToWorld(a.target.copy(a.local));
    }
    if (a.state === 'attached' && a.block) {
      const [x, y, z] = a.block; if (!getBlock(x, y, z)) { a.state = 'retract'; Sfx.release(); }
    }
    if (a.state === 'fly' || a.state === 'miss') {
      a.t += dt;
      const sp = 300 * dt, dv = _a.subVectors(a.target, a.pos), dl = dv.length();
      if (dl <= sp) {
        a.pos.copy(a.target);
        if (a.state === 'miss') { a.state = 'retract'; Sfx.anchorMiss(); }
        else if (!a.held) a.state = 'retract';
        else {
          a.state = 'attached'; a.len = a.pos.distanceTo(chest(_c));
          Sfx.anchorHit(a.kind, a.len);
          sparkBurst(a.pos, a.kind === 'flesh' ? 4 : 8, 5, a.kind === 'flesh' ? [1, 0.9, 0.8] : [1, 0.85, 0.5], 0.15);
          if (a.titan) { a.titan.alertness = 1; }
          if (G.mission && G.mission.onAttach) G.mission.onAttach(a);
        }
      } else a.pos.addScaledVector(dv, sp / dl);
    } else if (a.state === 'retract') {
      const sp = 340 * dt, dv = _a.subVectors(lp, a.pos), dl = dv.length();
      if (dl <= sp + 0.5) a.state = 'idle'; else a.pos.addScaledVector(dv, sp / dl);
    } else if (a.state === 'attached') a.pos.copy(a.target);
    // cable visuals
    if (a.state === 'idle') a.cable.hide();
    else {
      const taut = a.state === 'attached' ? Math.max(0, a.len - a.pos.distanceTo(chest(_c))) : 0;
      const sag = a.state === 'attached' ? Math.min(2.5, taut * 0.5) : a.state === 'retract' ? 0.4 : 0.15;
      a.cable.set(lp, a.pos, sag, G.time);
    }
  }
}

/* ---------------------------------------------------------------- physics */
const PW = 0.3, PH = 1.8, GRAV = 26, RUN = 8.5, SPRINT = 11.5, MAXV = 85, ANCHOR_STOP = 2.8;
export const GAS = { fire: 0.25, boost: 7, reel: 3.5, hang: 0.35, brake: 2.5 };
function collides(x0, y0, z0, x1, y1, z1) {
  for (let y = Math.floor(y0); y <= Math.floor(y1); y++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++)
    if (SOLID[getBlock(x, y, z)]) return true;
  return false;
}
function moveAxis(axis, d) {
  const p = P.pos; p[axis] += d;
  const b = [p.x - PW, p.y, p.z - PW, p.x + PW, p.y + PH, p.z + PW];
  if (!collides(...b)) return false;
  if (axis === 'y') { if (d < 0) p.y = Math.floor(b[1]) + 1; else p.y = Math.floor(b[4]) - PH - 0.001; }
  else if (axis === 'x') { if (d > 0) p.x = Math.floor(b[3]) - PW - 0.001; else p.x = Math.floor(b[0]) + 1 + PW + 0.001; }
  else { if (d > 0) p.z = Math.floor(b[5]) - PW - 0.001; else p.z = Math.floor(b[2]) + 1 + PW + 0.001; }
  return true;
}
// feet within ~1 block of something solid (just above the ground counts)
function nearGround() { const p = P.pos; return collides(p.x - PW, p.y - 1.15, p.z - PW, p.x + PW, p.y - 0.02, p.z + PW); }
function tryStepUp(axis, d) {
  // vault 1-block ledges at any speed, on the ground or skimming just above it
  const p = P.pos, oy = p.y, ox = p[axis];
  p.y += 1.01;
  if (collides(p.x - PW, p.y, p.z - PW, p.x + PW, p.y + PH, p.z + PW)) { p.y = oy; return false; }
  p[axis] += d;
  if (collides(p.x - PW, p.y, p.z - PW, p.x + PW, p.y + PH, p.z + PW)) { p.y = oy; p[axis] = ox; return false; }
  return true;
}
let impactSpeed = 0, slam = 0, slamWall = false;
function moveWithCollision(dx, dy, dz) {
  const v = P.vel;
  if (moveAxis('x', dx)) { if (!((P.onGround || nearGround()) && tryStepUp('x', dx))) { impactSpeed = Math.max(impactSpeed, Math.abs(v.x)); if (Math.abs(v.x) > slam) { slam = Math.abs(v.x); slamWall = true; } v.x *= -0.05; } }
  if (moveAxis('z', dz)) { if (!((P.onGround || nearGround()) && tryStepUp('z', dz))) { impactSpeed = Math.max(impactSpeed, Math.abs(v.z)); if (Math.abs(v.z) > slam) { slam = Math.abs(v.z); slamWall = true; } v.z *= -0.05; } }
  P.onGround = false;
  if (moveAxis('y', dy)) { if (dy < 0) { P.onGround = true; impactSpeed = Math.max(impactSpeed, -v.y * 0.6); if (-v.y > slam) { slam = -v.y; slamWall = false; } } v.y = 0; }
}
// hard impacts hurt: humans can't drop out of the sky or slam a wall at full speed
const SAFE_IMPACT = 22, SAFE_WALL = 27, IMPACT_DMG = 2.4;
export function impactDamage(speed, wall) { const safe = wall ? SAFE_WALL : SAFE_IMPACT; return speed <= safe ? 0 : Math.round((speed - safe) * IMPACT_DMG); }
function moveInput() {
  let x = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), y = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  if (pad.connected) { x += pad.lx; y -= pad.ly; }
  if (TOUCH.on) { x += TOUCH.mv.x; y += TOUCH.mv.y; }
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  return { x, y };
}
function attachedAnchors() { return P.anchors.filter(a => a.state === 'attached'); }
function stepPlayer(h, mv, att) {
  const v = P.vel;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  let wx = fx * mv.y + rx * mv.x, wz = fz * mv.y + rz * mv.x;
  if (P.onGround && !att.length) {
    const spd = (((held.reel() || TOUCH.sprint) && mv.y > 0) ? SPRINT : RUN) * (P.char ? P.char.run : 1);
    const k = 1 - Math.exp(-16 * h);
    v.x += (wx * spd - v.x) * k; v.z += (wz * spd - v.z) * k;
  } else {
    const acc = att.length ? 15 : 9;
    v.x += wx * acc * h; v.z += wz * acc * h;
  }
  v.y -= GRAV * h;
  if (P.boosting) {
    const cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
    let bx, by, bz;
    if (mv.x || mv.y) { bx = fx * cp * mv.y + rx * mv.x; by = sp * mv.y + 0.28; bz = fz * cp * mv.y + rz * mv.x; }
    else { bx = fx * cp; by = sp + 0.2; bz = fz * cp; }
    const bl = Math.hypot(bx, by, bz) || 1;
    const acc = 36;
    v.x += bx / bl * acc * h; v.y += by / bl * acc * h + GRAV * 0.35 * h; v.z += bz / bl * acc * h;
    // gas brake: holding boost while dropping fast cushions the fall
    if (v.y < -6) v.y += Math.min(-v.y - 6, 50 * h);
  }
  if (P.braking) {
    // landing thrusters (G): kill the fall fast and bleed off ground speed, cheap on gas
    if (v.y < -2) v.y += Math.min(-v.y - 2, 110 * h);
    if (!att.length) { const k = Math.min(1, 2.4 * h); v.x -= v.x * k; v.z -= v.z * k; }
  }
  const ch = chest(_a);
  for (const a of att) {
    const d = _b.subVectors(a.pos, ch), dist = d.length() || 0.001; d.divideScalar(dist);
    // the cable is a rope you swing on; only Shift reels you in. A light auto-reel keeps swings lively.
    // reelK 0..1: keyboard Shift is all or nothing; touch hooks pull in by default and the stick sets how hard
    const reel = P.gas > 0 ? 3 + 23 * P.reelK : 0;
    a.len = Math.max(ANCHOR_STOP, Math.min(a.len, dist) - reel * h);
    if (P.gas > 0) v.addScaledVector(d, (2.5 + 35.5 * P.reelK) * h);
    // gear brake: the reel slows you as you close on the anchor, so you arrive instead of splatting into it
    const vr = v.dot(d), room = Math.max(0, dist - ANCHOR_STOP);
    const vmax = Math.sqrt(2 * 55 * room) + 3;
    if (vr > vmax) v.addScaledVector(d, -(vr - vmax) * Math.min(1, 14 * h));
    // surface brake: whatever wall or roof is ahead, arrive at it instead of hitting it
    if (P.wallAhead < 40) {
      const va = v.dot(P.wallDir), room2 = Math.max(0, P.wallAhead - 0.9);
      const vcap = Math.sqrt(2 * 70 * room2) + 4;
      if (va > vcap) v.addScaledVector(P.wallDir, -(va - vcap) * Math.min(1, 16 * h));
    }
    if (mv.y > 0) { // pump the swing in the direction of travel
      const vr = v.dot(d); _c.copy(v).addScaledVector(d, -vr);
      const tl = _c.length(); if (tl > 2) v.addScaledVector(_c, 7 * h / tl);
    }
  }
  // drag
  const sp = v.length();
  if (!P.onGround) v.multiplyScalar(1 - Math.min(0.5, (0.015 + sp * 0.0011) * h));
  // rope constraints (remove outward radial velocity when taut)
  for (let it = 0; it < 2; it++) for (const a of att) {
    const d = _b.subVectors(chest(_a), a.pos), dist = d.length() || 0.001;
    if (dist >= a.len - 0.02) { d.divideScalar(dist); const vr = v.dot(d); if (vr > 0) v.addScaledVector(d, -vr); }
  }
  const maxv = MAXV * (P.char ? P.char.speed : 1);
  const sp2 = v.length(); if (sp2 > maxv) v.multiplyScalar(maxv / sp2);
  moveWithCollision(v.x * h, v.y * h, v.z * h);
  // positional correction toward anchors
  for (const a of att) {
    const d = _b.subVectors(a.pos, chest(_a)), dist = d.length();
    if (dist > a.len) {
      d.multiplyScalar((dist - a.len) / dist);
      const ox = P.pos.x, oy = P.pos.y, oz = P.pos.z;
      moveAxis('x', d.x); moveAxis('y', d.y); moveAxis('z', d.z);
      // feed part of the correction back into velocity (makes reeling build real speed)
      v.x += (P.pos.x - ox) / h * 0.2; v.y += (P.pos.y - oy) / h * 0.2; v.z += (P.pos.z - oz) / h * 0.2;
    }
  }
  // titans are solid
  for (const t of G.titans) {
    if (!t.alive || t.pos.distanceTo(P.pos) > t.h * 1.5 + 3) continue;
    const c = chest(_c).clone();
    const n = pushOutOfTitan(t, c, 0.45);
    if (n) {
      const nx = c.x - P.pos.x, ny = c.y - 1.0 - P.pos.y, nz = c.z - P.pos.z;
      if (!collides(P.pos.x + nx - PW, P.pos.y + ny, P.pos.z + nz - PW, P.pos.x + nx + PW, P.pos.y + ny + PH, P.pos.z + nz + PW)) P.pos.set(c.x, c.y - 1.0, c.z);
      const vn = v.dot(n); if (vn < 0) v.addScaledVector(n, -vn * 1.1);
      if (n.y > 0.6) P.onGround = true;
    }
  }
}
function updatePlayer(dt) {
  if (P.frozen) {
    const c = getChunk(Math.floor(P.pos.x) >> 4, Math.floor(P.pos.z) >> 4);
    if (c && c.mesh && meshedAround(2) >= 0.99) P.frozen = false; else return;
  }
  P.invuln = Math.max(0, P.invuln - dt); P.hitT = Math.max(0, P.hitT - dt);
  P.slashCD -= dt;
  if (!P.alive) {
    P.deadT += dt; P.vel.y -= GRAV * dt; P.vel.x *= 0.98; P.vel.z *= 0.98;
    moveWithCollision(P.vel.x * dt, P.vel.y * dt, P.vel.z * dt);
    if (P.onGround) { P.vel.x *= 0.8; P.vel.z *= 0.8; }
    return;
  }
  if (P.mounted) {
    const steed = getActiveHorse();
    if (G.time - P.lastHurt > 6 && P.hp < (P.maxHp || 100)) P.hp = Math.min(P.maxHp || 100, P.hp + 4 * dt);
    if (P.swapT > 0) { P.swapT -= dt; if (P.swapT <= 0) { P.sharp = 100; P.spare--; popup('FRESH BLADES', '#cfe8ff'); } }
    if (pressed.has('KeyR') || (TOUCH.on && P.sharp <= 0 && P.swapT <= 0 && P.spare > 0)) swapBlades();
    if (pressed.has('KeyF') && P.stunT <= 0) startSlash();

    // Space leaps off horse into the air
    if (pressed.has('Space')) {
      if (steed) steed.dismount();
      P.vel.y = 11;
      P.vel.x += -Math.sin(P.yaw) * 6;
      P.vel.z += -Math.cos(P.yaw) * 6;
      P.onGround = false;
      P.jumpT = 0.2;
      Sfx.jump();
      popup('LEAPED OFF HORSE', '#ffd36a');
      return;
    }

    // Firing ODM hooks while mounted immediately leaps into aerial 3DMG flight!
    const wantsHook = pressed.has('Mouse0') || pressed.has('KeyQ') || pressed.has('Mouse2') || pressed.has('KeyC');
    if (wantsHook) {
      if (steed) steed.dismount();
      P.vel.y = 8;
      P.onGround = false;
      if (pressed.has('Mouse0') || pressed.has('KeyQ')) fireAnchor(0);
      if (pressed.has('Mouse2') || pressed.has('KeyC')) fireAnchor(1);
      popup('ODM GEAR ENGAGED', '#a4d4ff');
      return;
    }
    return;
  }
  // grabbed: follow the titan's hand
  if (P.grabbedBy) {
    const t = P.grabbedBy;
    t.handWorld(t.holdSide || -1, _a); P.pos.set(_a.x, _a.y - 1.0, _a.z); P.vel.set(0, 0, 0);
    if (pressed.has('KeyF') || pressed.has('Space')) {
      P.escape++; Sfx.hitFlesh(); steamBurst(_a, 4, 0.5, 0.6, 2, 0.8); addShake(0.15);
      P.sharp = Math.max(0, P.sharp - 3);
      if (P.escape >= 7) escapeGrab(t);
    }
    $('grabbar').style.width = (P.escape / 7 * 100) + '%';
    return;
  }
  titanThreats(P);
  if (P.grabbedBy) return;
  if (P.jamT > 0) P.jamT -= dt;
  const mv = P.stunT > 0 ? { x: 0, y: 0 } : moveInput();
  // anchors input
  if (P.stunT <= 0) {
    if (pressed.has('Mouse0') || (pressed.has('KeyQ'))) fireAnchor(0);
    if (pressed.has('Mouse2') || (pressed.has('KeyC'))) fireAnchor(1);
    if (!held.l() && P.anchors[0].held) releaseAnchor(0);
    if (!held.r() && P.anchors[1].held) releaseAnchor(1);
  }
  // jump / gas
  const att = attachedAnchors();
  if (pressed.has('Space')) {
    if (P.onGround) { P.vel.y = 9.6; P.onGround = false; P.jumpT = 0.18; Sfx.jump(); }
    else if (P.gas > 0) { Sfx.boostBurst(); P.boostHeld = 0; }
  }
  P.jumpT -= dt;
  P.boosting = held.space() && !P.onGround && P.jumpT <= 0 && P.gas > 0;
  // touch: the landing thrusters fire by themselves when a hard landing is coming (P.brace is last frame's warning)
  if (TOUCH.on && P.brace > 0 && !att.length) P.autoBrakeT = 0.4;
  P.autoBrakeT = (P.autoBrakeT || 0) - dt;
  P.braking = (held.brake() || (TOUCH.on && P.autoBrakeT > 0)) && !P.onGround && P.gas > 0 && P.stunT <= 0;
  if (P.braking && P.vel.length() > 3) { P.gas = Math.max(0, P.gas - GAS.brake * dt); if (Math.random() < dt * 30) { launchPoint(Math.random() < 0.5 ? 0 : 1, _a); gasPuff(_a, _b.set(0, -6, 0), 1, 0.45); } }
  const gm = P.char ? P.char.gas : 1;
  if (P.boosting) { P.gas = Math.max(0, P.gas - GAS.boost * gm * dt); }
  P.reelK = held.reel() ? 1 : 0;
  if (TOUCH.on && !P.reelK) P.reelK = mv.y > 0.25 ? 0.35 + 0.65 * Math.min(1, (mv.y - 0.25) / 0.6) : mv.y < -0.35 ? 0 : 0.35;
  if (!(att.length > 0 && P.gas > 0)) P.reelK = 0;
  P.reeling = P.reelK > 0.6;
  if (att.length) P.gas = Math.max(0, P.gas - (GAS.hang + (GAS.reel - GAS.hang) * P.reelK) * gm * dt);
  // physics substeps
  impactSpeed = 0; slam = 0;
  // what's straight ahead of us right now (for the reel's surface brake)
  P.wallAhead = 99;
  if (att.length && P.reelK > 0.2 && P.vel.lengthSq() > 25) {
    P.wallDir = P.wallDir || V(); P.wallDir.copy(P.vel).normalize();
    const wh = rayVoxel(chest(_a), P.wallDir, 40); if (wh) P.wallAhead = wh.t;
  }
  if (att.length) P.lastAttachT = G.time;
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const wasGround = P.onGround;
  for (let i = 0; i < n; i++) stepPlayer(dt / n, mv, att);
  if (impactSpeed > 24) { addShake(Math.min(0.5, impactSpeed / 90)); Sfx.thud(); dust(P.pos, 6, 1); }
  if (P.onGround && !wasGround && impactSpeed > 9) { Sfx.land(Math.min(1.5, impactSpeed / 15)); dust(P.pos, 4, 0.8); }
  // reeling into what you're hooked to is basic Vector Gear movement: no impact damage while attached or just after letting go
  const geared = att.length > 0 || G.time - (P.lastAttachT ?? -9) < 0.45;
  const idmg = geared ? 0 : impactDamage(slam, slamWall);
  if (idmg > 0 && G.time - P.lastImpact > 0.35) {
    P.lastImpact = G.time;
    const wall = slamWall;
    popup(`${wall ? 'WALL SLAM' : 'HARD LANDING'}  −${idmg}`, '#ff7a6a');
    Sfx.bones(Math.min(1.4, idmg / 40));
    if (idmg >= 22) { P.stunT = Math.min(1.1, 0.35 + idmg / 70); detachAll(); P.boosting = false; toast(wall ? 'You hit that wall far too fast' : TOUCH.on ? 'Too fast! Out of gas to brake' : 'Too fast! Hold G to fire your landing thrusters', 2.6); }
    P.invuln = 0; damagePlayer(idmg, null, null, wall ? 'Slammed into a wall' : 'Hit the ground too hard'); P.invuln = 0.15;
  }
  if (P.stunT > 0) P.stunT = Math.max(0, P.stunT - dt);
  // brace warning: falling fast with the ground coming up
  P.brace = 0;
  if (!P.onGround && P.vel.y < -SAFE_IMPACT * 0.85 && !att.length && !P.braking) {
    const hit = rayVoxel(_a.copy(P.pos).add(_b.set(0, 0.2, 0)), DOWN, -P.vel.y * 1.4);
    if (hit) P.brace = impactDamage(-P.vel.y) || 1;
  }
  // air/ground timers & combo chain
  if (P.onGround) { P.groundT += dt; P.airT = 0; } else { P.airT += dt; P.groundT = 0; }
  if (P.combo > 0) {
    P.chainT -= dt;
    if (P.chainT <= 0 || (P.groundT > 0.9 && !att.length)) { if (P.combo >= 2) popup(`CHAIN ENDED · x${P.combo}`, '#9ab'); P.combo = 0; }
  }
  // footsteps
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.onGround && hs > 1) {
    P.runPh += hs * dt * 1.25; P.stepDist += hs * dt;
    if (P.stepDist > 2.2) { P.stepDist = 0; const id = getBlock(Math.floor(P.pos.x), Math.floor(P.pos.y - 0.1), Math.floor(P.pos.z)); Sfx.block(BLOCKS[id] ? BLOCKS[id].snd : 'stone', 'step'); }
  }
  // gas puffs
  if (P.boosting && Math.random() < dt * 40) { launchPoint(0, _a); _b.copy(P.vel).multiplyScalar(-0.2); gasPuff(_a.add(_c.set(0, 0, 0)), _b, 1, 0.35); }
  if (P.reeling && Math.random() < dt * 14) { launchPoint(1, _a); gasPuff(_a, _b.set(0, 0, 0), 1, 0.2); }
  // regen
  if (G.time - P.lastHurt > 6 && P.hp < (P.maxHp || 100)) P.hp = Math.min(P.maxHp || 100, P.hp + 4 * dt);
  // blades
  if (P.swapT > 0) { P.swapT -= dt; if (P.swapT <= 0) { P.sharp = 100; P.spare--; popup('FRESH BLADES', '#cfe8ff'); } }
  if (P.faction === 'interior') {
    P.fireCD -= dt; P.aimT = Math.max(0, (P.aimT || 0) - dt);
    if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) P.ammo = 2; }
    if (pressed.has('KeyR')) reloadGun();
    if (pressed.has('KeyF') && P.stunT <= 0) fireGun();
  } else {
    if (pressed.has('KeyR') || (TOUCH.on && P.sharp <= 0 && P.swapT <= 0 && P.spare > 0)) swapBlades();
    if (pressed.has('KeyF') && P.stunT <= 0) startSlash();
  }
  if (P.lungeT > 0) {
    P.lungeT -= dt;
    const t = P.lungeTarget;
    if (t && t.alive && !P.slashHit.has(t)) {
      const np = lungePoint(t, _a), dir = _b.copy(np).sub(chest(_c));
      if (dir.length() > 0.6) { dir.normalize(); P.vel.lerp(dir.multiplyScalar(P.lungeSpeed), Math.min(1, dt * 18)); }
    }
    if (P.lungeT <= 0) P.lungeTarget = null;
  }
  updateSlash(dt);
  // visual swing: blades stay cocked during a lunge and cut when you arrive (or whiff when it ends)
  if (P.drawn && P.lungeT <= 0) { P.drawn = false; P.swingT = 0; Sfx.slash(0.9); }
  if (P.swingT >= 0) { P.swingT += dt; if (P.swingT > 0.3) P.swingT = -1; }
  if (P.cutSpinT >= 0) { P.cutSpinT += dt; if (P.cutSpinT > 0.42) P.cutSpinT = -1; }
  if (P.slashT >= 0) { P.slashT += dt; if (P.slashT > 0.34 && P.lungeT <= 0) P.slashT = -1; }
  if (P.spinT >= 0) { P.spinT += dt; if (P.spinT > 0.62) P.spinT = -1; }
  // falling out of the world
  if (P.pos.y < -20) damagePlayer(999, _a.set(0, 0, 0), null);
  P.maxSpeed = Math.max(P.maxSpeed, P.vel.length());
}
function fireGun() {
  if (!P.alive || P.reloadT > 0 || P.fireCD > 0) return;
  if (P.ammo <= 0) { reloadGun(); return; }
  const from = chest(_a).add(_b.set(0, 0.3, 0)).clone();
  const to = AIM.any ? AIM.point : AIM.miss;
  const dir = _c.subVectors(to, from).normalize().clone();
  if (G.hooks.fireBullet) G.hooks.fireBullet(P, from, dir);
  P.ammo--; P.fireCD = GUN.cd; P.aimT = 0.6; addShake(0.12); fovKick = Math.min(6, fovKick + 3);
  if (P.ammo <= 0) reloadGun();
}
function reloadGun() { if (P.reloadT > 0 || P.ammo >= 2) return; P.reloadT = GUN.reload * (P.char ? P.char.reload : 1); Sfx.reload(); }
function swapBlades() {
  if (P.swapT > 0 || P.sharp >= 100) return;
  if (P.spare <= 0) { toast('No spare blades — find a supply depot!'); Sfx.dry(); return; }
  P.swapT = 0.65 * (P.char ? P.char.swap : 1); Sfx.bladeSwap();
  if (G.mission && G.mission.onSwap) G.mission.onSwap();
}

/* ---------------------------------------------------------------- combat */
let hitStop = 0, slowT = 0, slowDur = 1, flashA = 0, vignetteA = 0;
// where a lunge should head: over the head first if we're in front, then through the nape
function lungePoint(t, out) {
  const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
  const front = (P.pos.x - t.pos.x) * fx + (P.pos.z - t.pos.z) * fz > t.h * 0.05;
  if (front) { t.headWorld(out); out.y += t.T.head * t.s * 0.5 + 1.4; out.x -= fx * 0.5; out.z -= fz * 0.5; return out; }
  t.napeWorld(out); out.x -= fx * (0.6 + t.h * 0.03); out.z -= fz * (0.6 + t.h * 0.03); return out;
}
function startSlash() {
  if (P.slashCD > 0 || !P.alive || P.swapT > 0) return;
  if (P.sharp <= 0) { Sfx.dry(); toast(TOUCH.on ? 'Blades are broken: tap BLADES' : 'Blades are broken — press R to swap'); return; }
  let speed = P.vel.length();
  P.slashHit.clear(); P.lungePre = speed;
  // lock-on lunge: slashing near a nape dashes you into it
  const ch = chest(_a); let best = null, bd = 1e9;
  for (const t of G.titans) {
    if (!t.alive) continue;
    const np = t.napeWorld(_b); const d = np.distanceTo(ch);
    const reach = (4.5 + t.h * 0.14 + Math.min(8, speed * 0.18)) * (TOUCH.on ? 1.25 : 1);
    if (d < reach && d < bd) { bd = d; best = t; }
  }
  if (best) {
    const dir = lungePoint(best, _b).sub(ch).normalize();
    const sp = Math.max(speed, 14);
    P.lungePre = speed;
    P.vel.copy(dir).multiplyScalar(sp); speed = sp;
    P.lungeT = 0.45; P.lungeTarget = best; P.lungeSpeed = sp;
    sparkBurst(ch, 6, 4, [0.8, 0.9, 1], 0.12);
  }
  if ((P.lungePre ?? speed) > 30 * (P.char ? P.char.spin : 1) && !P.onGround) { P.spinT = 0; P.slashCD = 0.62; P.drawn = false; Sfx.spin(); }
  else {
    P.slashT = 0; P.slashCD = 0.3; P.slashSide ^= 1;
    if (best) { P.drawn = true; P.swingT = -1; Sfx.bladeDraw(); }
    else { P.swingT = 0; Sfx.slash(Math.min(1.3, 0.7 + speed / 40)); }
  }
}
const PRIORITY = { nape: 0, ankleL: 1, ankleR: 1, armL: 2, armR: 2, legL: 3, legR: 3, head: 4, torso: 5 };
function updateSlash() {
  const spin = P.spinT >= 0;
  const active = spin ? P.spinT < 0.6 : (P.slashT >= 0.03 && (P.slashT < 0.24 || P.lungeT > 0));
  if (!active) return;
  const speed = P.vel.length();
  const dir = _d.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const center = chest(_a).addScaledVector(dir, 1.2);
  const ch = chest(_c);
  const r = (spin ? 3.9 : 2.9) + Math.min(1.4, speed * 0.03);
  for (const t of G.titans) {
    if (!t.alive || P.slashHit.has(t)) continue;
    if (t.pos.distanceTo(P.pos) > t.h * 1.4 + r + 4) continue;
    let parts = sphereTitanParts(t, center, r);
    if (!parts.length) parts = sphereTitanParts(t, ch, r * 0.85);
    if (t === P.lungeTarget && P.lungeT > 0) { parts = sphereTitanParts(t, ch, r + 0.6).filter(q => q.name === 'nape'); }
    if (!parts.length) continue;
    parts.sort((a, b) => (PRIORITY[a.name] - PRIORITY[b.name]) || (a.dist - b.dist));
    P.slashHit.add(t);
    resolveHit(t, parts[0].name, parts[0].bone, speed, spin);
  }
  // other humans (Civil War)
  if (G.mode === 'mp' && G.hooks.pvpHit) for (const s of G.scouts) {
    if (s === P || !s.alive || s.hidden || P.slashHit.has(s) || !G.hostile(P, s)) continue;
    const c = _b.copy(s.pos); c.y += 1;
    if (c.distanceTo(center) < r * 0.85 || c.distanceTo(ch) < r * 0.8) {
      P.slashHit.add(s);
      const dmg = G.hooks.pvpHit(P, s, speed);
      hitStop = 0.05; addShake(0.2); sparkBurst(c, 12, 8); cutArc(c, 1.6, 0xffd0c0); Sfx.hitFlesh(); hitMarker('hit'); dmgNumber(`−${dmg}`);
      if (P.drawn) { P.drawn = false; P.swingT = 0; }
    }
  }
}
function resolveHit(t, part, bone, speed, spin) {
  const air = !P.onGround;
  if (t === P.lungeTarget) speed = Math.max(P.lungePre || 0, speed * 0.45);   // depth comes from your own speed, not the lunge
  const deep = P.sharp > 0 && (speed * (P.char ? P.char.cut : 1) >= 11 || spin || (t.type === 'dummy' && speed >= 7));
  const point = part === 'nape' ? t.napeWorld(V()) : bone.getWorldPosition(V());
  const info = { deep, speed: speed * (P.char ? P.char.cut || 1 : 1), spin, air, point, by: P.id };
  if (P.drawn || t === P.lungeTarget) { P.drawn = false; P.swingT = 0; P.cutSpinT = part === 'nape' ? 0 : -1; Sfx.slash(1.3); }
  cutArc(point, 1.6 + t.h * 0.08, 0xf2f8ff, 0.28);
  if (t.remote) {
    // the titan's owner decides; show contact now, the result arrives in a few ms
    hitStop = 0.03; Sfx.hitFlesh(); sparkBurst(point, 8, 7); P.sharp = Math.max(0, P.sharp - (part === 'nape' ? 12 : 8));
    if (G.hooks.netHit) G.hooks.netHit(t, part, info);
    return;
  }
  const res = t.hit(part, info);
  if (G.hooks.hitResolved) G.hooks.hitResolved(t, part, res, info);
  hitFeedback(t, part, res, speed, spin, air, point, true);
}
// local feedback for a hit the local scout landed (called directly, or when a remote titan's owner answers)
function hitFeedback(t, part, res, speed, spin, air, point, wearBlades) {
  const k = res.kind;
  hitMarker(k === 'kill' ? 'kill' : k === 'armor' || k === 'guard' ? 'block' : k === 'none' ? 'wall' : 'hit');
  if (t.T && t.T.shifter) { const dmg = { napecrack: 100, shallow: 30, limb: 18, flesh: 6, weak: 10 }[k]; if (dmg) dmgNumber(`−${dmg}`, k === 'napecrack' ? '#ffd36a' : '#ffe0a0'); }
  if (!point) point = part === 'nape' ? t.napeWorld(V()) : t.chest(V());
  if (!wearBlades) wearBlades = false;
  const wear = !wearBlades ? (k === 'armor' || k === 'guard' ? 18 : 0) : k === 'armor' || k === 'guard' ? 30 : part === 'nape' ? 16 : 10;
  const was = P.sharp; P.sharp = Math.max(0, P.sharp - wear);
  if (was > 0 && P.sharp <= 0) { Sfx.bladeBreak(); popup('BLADES SHATTERED — R TO SWAP', '#f88'); sparkBurst(chest(_a), 20, 8, [0.9, 0.95, 1]); }
  if (k === 'kill' || k === 'bosshit') {
    cutArc(point, 3 + t.h * 0.22, 0xffe08a, 0.5);
    hitStop = 0.11; slowT = slowDur = k === 'kill' ? 1.0 : 0.6; flashA = 0.35;
    addShake(0.55); Sfx.napeKill();
    steamBurst(point, 50, t.h * 0.12, t.h * 0.14, 7, 2.6);
    sparkBurst(point, 30, 14, [1, 0.95, 0.8], 0.3);
    P.vel.multiplyScalar(0.72); P.lungeT = 0; P.lungeTarget = null;
    if (k === 'kill') registerKill(t, speed, spin, air);
    else { addScore(1500, 'ARMOR BREAKER'); P.combo++; P.chainT = 7; }
    if (G.mission && G.mission.onNapeHit) G.mission.onNapeHit(t, k);
  } else if (k === 'limb') {
    hitStop = 0.06; addShake(0.25); Sfx.hitFlesh(); steamBurst(point, 16, t.h * 0.06, t.h * 0.08, 4, 1.8); sparkBurst(point, 10, 9);
    const nm = part.startsWith('ankle') || part.startsWith('leg') ? (t.type === 'boss' ? 'KNEE BROKEN' : 'ANKLE CUT — TITAN DOWN') : 'ARM SEVERED';
    addScore(t.type === 'boss' ? 600 : 180, nm); P.chainT = Math.max(P.chainT, 4);
    if (G.mission && G.mission.onLimb) G.mission.onLimb(t, part);
  } else if (k === 'weak') {
    hitStop = 0.05; addShake(0.2); Sfx.armorClank(); Sfx.hitFlesh(); sparkBurst(point, 24, 12, [1, 0.6, 0.2]);
    addScore(120, 'KNEE CRACKED');
  } else if (k === 'shallow') {
    hitStop = 0.04; addShake(0.15); Sfx.hitFlesh(); steamBurst(point, 8, 0.6, t.h * 0.05, 2, 1.2);
    bigMsg('TOO SHALLOW', 'Hit the nape at speed for a deep cut', '#ffcf6a', 1.6);
    if (G.mission && G.mission.onShallow) G.mission.onShallow(t);
  } else if (k === 'napecrack') {
    hitStop = 0.09; addShake(0.45); Sfx.napeKill(); steamBurst(point, 30, t.h * 0.1, t.h * 0.1, 6, 2);
    bigMsg('NAPE CRACKED', `${res.left} more deep cut${res.left > 1 ? 's' : ''} — before it regenerates`, '#ffcf6a', 1.6);
    addScore(400, 'NAPE CRACK'); P.chainT = Math.max(P.chainT, 5);
  } else if (k === 'guard') {
    addShake(0.25); Sfx.armorClank(); sparkBurst(point, 20, 12, [0.8, 0.9, 1], 0.25);
    popup('BLOCKED · IT\'S GUARDING THE NAPE', '#9cd2ff');
    const away = _b.subVectors(P.pos, point).normalize(); P.vel.addScaledVector(away, 10);
  } else if (k === 'armor') {
    addShake(0.2); Sfx.armorClank(); sparkBurst(point, 26, 13, [1, 0.95, 0.7], 0.28);
    popup(t.hardened > 0 ? 'HARDENED · WAIT IT OUT' : 'ARMORED — FIND A WEAK POINT', '#cde');
    const away = _b.subVectors(P.pos, point).normalize(); P.vel.addScaledVector(away, 8);
  } else if (k === 'flesh') {
    hitStop = 0.03; Sfx.hitFlesh(); steamBurst(point, 6, 0.6, t.h * 0.04, 2, 1); sparkBurst(point, 6, 6);
    addScore(25, 'HIT');
  }
}
function registerKill(t, speed, spin, air) {
  P.kills++;
  const quick = G.time - P.lastKillT < 5;
  P.lastKillT = G.time;
  P.combo++; P.chainT = 7; P.bestCombo = Math.max(P.bestCombo, P.combo);
  const labels = ['NAPE CUT'];
  let base = t.type === 'boss' ? 10000 : t.type === 'brute' ? 1600 : t.type === 'abnormal' ? 1400 : t.type === 'runt' ? 800 : 1000;
  const sb = Math.round(Math.max(0, speed - 10) * 25); if (sb > 0) { base += sb; labels.push('SPEED'); }
  if (air) { base += 400; labels.push('AERIAL'); }
  if (spin) { base += 350; labels.push('SPIN'); }
  if (quick) { base += 300; labels.push('QUICK'); }
  addScore(base, labels.join(' · '));
  if (P.combo >= 2) { bigMsg(`x${P.combo} CHAIN`, labels.join(' · '), '#ffd36a', 1.4); Sfx.combo(P.combo); }
  else bigMsg('NAPE CUT!', labels.slice(1).join(' · ') || 'Titan slain', '#ffffff', 1.3);
  if (G.mission && G.mission.onKill) G.mission.onKill(t);
}
function addScore(base, label) {
  const mult = 1 + Math.min(4, Math.max(0, P.combo - 1) * 0.5);
  const pts = Math.round(base * mult);
  P.score += pts;
  popup(`+${pts.toLocaleString()}  ${label}${mult > 1 ? `  ×${mult.toFixed(1)}` : ''}`, '#ffe9a8');
}
G.hooks.damagePlayer = damagePlayer;
// --- generic scout hooks (titans call these for scouts this client owns; multiplayer wraps them)
G.hooks.hurtScout = (sc, dmg, kb, by, reason) => { if (sc === P) damagePlayer(dmg, kb, by ? (G.entity(by) || { id: by }) : null, reason); else if (sc.hurt) sc.hurt(dmg, kb, by, reason); };
G.hooks.detachScout = (sc, jam) => { if (sc === P) { detachAll(); if (jam) { P.jamT = Math.max(P.jamT || 0, jam); toast('GEAR JAMMED', 1.4); } } else if (sc.detach) sc.detach(jam); };
G.hooks.pushScout = (sc, kb) => { if (sc === P) { P.vel.add(kb); detachAll(); } else if (sc.push) sc.push(kb); };
G.hooks.grabScout = (t, sc) => {
  if (sc === P) { if (!grabLocal(t)) return; if (!t.remote) t.takeHold(P); else if (G.hooks.netGrab) G.hooks.netGrab(t, P); }
  else if (sc.grabbed) sc.grabbed(t);
};
G.hooks.releaseScout = (t, who, escaped) => { if (who === P) { P.grabbedBy = null; $('grab').classList.remove('show'); } else if (G.hooks.netRelease) G.hooks.netRelease(t, who, escaped); };
G.hooks.crushScout = (t, who, kind, dir) => { if (who === P) crushedBy(t, kind, dir); else if (who && who.crushed) who.crushed(t, kind, dir); else if (G.hooks.netCrush) G.hooks.netCrush(t, who, kind, dir); };
G.entity = G.entity || ((id) => id === P.id ? P : G.titans.find(t => t.id === id) || null);
function damagePlayer(amount, kb, titan, reason) {
  if (!P.alive || P.invuln > 0 || gameState !== 'play') return;
  P.hp -= amount; P.lastHurt = G.time; P.invuln = 0.7; P.hitT = 0.45;
  if (titan) P.lastAttacker = titan;
  if (kb) { P.vel.add(kb); detachAll(); }
  addShake(0.65); vignetteA = 1; Sfx.hurt(); hitStop = 0.06;
  if (P.hp <= 0) die(reason || (titan ? 'Struck down by a titan' : 'You fell'), titan);
  if (titan && titan.id && G.hooks.hitConfirm) G.hooks.hitConfirm(P, titan.id, Math.round(amount), !P.alive, 'hit');
}
function grabLocal(t) {
  if (!P.alive || P.invuln > 0 || P.grabbedBy || gameState !== 'play') return false;
  P.grabbedBy = t; P.escape = 0; detachAll(); P.boosting = false;
  $('grab').classList.add('show'); $('grabkey').textContent = TOUCH.on ? 'TAP FAST' : 'MASH F'; addShake(0.5); vignetteA = 0.7; Sfx.grabbed();
  return true;
}
G.api_grabLocal = grabLocal;
function crushedBy(t, kind = 'crush', dir) {
  P.grabbedBy = null; $('grab').classList.remove('show');
  const who = t.name ? ` by ${t.name}` : '';
  if (kind === 'devour') { P.invuln = 0; P.lastAttacker = t; die(`Devoured${who}`, t); if (G.hooks.hitConfirm) G.hooks.hitConfirm(P, t.id, 100, true, 'devour'); return; }
  if (kind === 'throw') {
    if (dir) P.vel.set(dir[0], dir[1], dir[2]);
    else P.vel.set(Math.sin(t.yaw) * 36, 18, Math.cos(t.yaw) * 36);
    addShake(0.8);
    Sfx.swipe(0);
    if (window.toast) window.toast('THROWN BY TITAN!', 2);
  } else {
    P.vel.set(Math.sin(t.yaw) * 12, 6, Math.cos(t.yaw) * 12);
  }
  P.invuln = 0; damagePlayer(kind === 'throw' ? 25 : 45, null, t, kind === 'throw' ? `Thrown${who}` : `Crushed${who}`); P.invuln = 1.2;
}
function escapeGrab(t) {
  const part = (t.holdSide || -1) > 0 ? 'armL' : 'armR';
  P.grabbedBy = null; $('grab').classList.remove('show');
  if (t.remote) { if (G.hooks.netEscape) G.hooks.netEscape(t, part); }
  else { t.dis[part] = 0; t.hit(part, { deep: true, speed: 20, by: P.id }); t.holding = null; t.state = 'recover'; t.st = 0; }
  P.vel.set(-Math.sin(t.yaw) * 6, 14, -Math.cos(t.yaw) * 6); P.invuln = 1.2;
  hitStop = 0.08; addShake(0.4); Sfx.hitFlesh(); steamBurst(t.handWorld(-1, V()), 20, 1, t.h * 0.08, 4);
  bigMsg('ESCAPED!', 'Cut your way free', '#aef', 1.3); addScore(300, 'ESCAPE');
}
function die(reason, killer) {
  if (!P.alive && gameState === 'dead') return;
  P.alive = false; P.deadT = 0; detachAll();
  P.boosting = false; P.braking = false; P.reeling = false;
  slowT = slowDur = 1.0;
  try {
    if (Sfx.death) Sfx.death();
    else if (Sfx.failSting) Sfx.failSting();
  } catch (e) {
    console.warn('Audio death sound error:', e);
  }
  Music.target = 0.1;
  if (P.grabbedBy) { if (!P.grabbedBy.remote) P.grabbedBy.holding = null; P.grabbedBy = null; $('grab').classList.remove('show'); }
  const k = killer || (G.time - P.lastHurt < 6 ? P.lastAttacker : null);
  if (G.mode === 'mp') { if (G.hooks.localDied) G.hooks.localDied(reason, k); return; }
  setTimeout(() => { showDeath(reason); }, 400);
}
window.__die = die;

/* ---------------------------------------------------------------- hit feedback (what you feel when YOU land a hit) */
let markT = -9, hurtA = 0, lastCrash = 0, crashCD = 0;
function hitMarker(kind = 'hit') {
  const el = $('hitmark'); el.className = kind; void el.offsetWidth; el.classList.add('show');
  if (G.time - markT > 0.06) Sfx.hitTick(kind === 'kill'); markT = G.time;
}
function dmgNumber(text, color = '#ffe0a0') {
  const d = document.createElement('div'); d.className = 'dmgn'; d.textContent = text; d.style.color = color;
  d.style.left = (20 + Math.random() * 34) + 'px'; d.style.top = (-44 - Math.random() * 16) + 'px';
  $('dmgfloat').append(d); setTimeout(() => d.remove(), 900);
  while ($('dmgfloat').children.length > 6) $('dmgfloat').firstChild.remove();
}
// a victim (or the titan owner) confirmed our hit landed
function confirmHit(ev) {
  const kill = !!ev.kill, recent = G.time - markT < 0.15;
  if (!recent || kill) hitMarker(kill ? 'kill' : ev.kind === 'grab' ? 'grab' : ev.kind === 'deflect' ? 'block' : 'hit');
  addShake(kill ? 0.5 : G.localTitan ? 0.32 : 0.2); hitStop = Math.max(hitStop, kill ? 0.1 : 0.05);
  if (ev.dmg) dmgNumber(`−${ev.dmg}`, kill ? '#ff5a40' : '#ffe0a0');
  if (ev.kind === 'grab') { bigMsg('GRABBED', `${ev.v || 'A scout'} · LMB devour · RMB throw`, '#ffb070', 1.4); Sfx.thwack(1.2); }
  else if (kill) { bigMsg(ev.kind === 'devour' ? 'DEVOURED' : 'KILL', ev.v || '', '#ff6a50', 1.4); Sfx.thwack(1.5); }
  else Sfx.thwack(G.localTitan ? 1 : 0.6);
}
G.hooks.titanTook = (t, sc) => { if (t === G.localTitan) confirmHit({ kind: 'grab', v: sc.name }); };
G.hooks.titanHitOther = (t, other, dmg, kill) => {
  if (t === G.localTitan) {
    hitMarker(kill ? 'kill' : 'hit');
    dmgNumber(`−${Math.round(dmg)}`, kill ? '#ff4040' : '#ffd36a');
    if (kill) {
      bigMsg('TITAN DESTROYED', other.name || 'Pure Titan', '#ff3b30', 2.2);
      addShake(0.6);
      Sfx.napeKill();
      P.kills = (P.kills || 0) + 1;
    }
  }
};
G.hooks.titanThrew = (t, other) => {
  if (t === G.localTitan) {
    bigMsg('TITAN LAUNCHED', `${other.name || 'Enemy Titan'} hurled through air`, '#ffd36a', 1.8);
    addShake(0.4);
  }
};
G.hooks.titanSlammed = (t, other) => {
  if (t === G.localTitan) {
    bigMsg('GROUND SLAM', `${other.name || 'Enemy Titan'} crushed into pavement`, '#ff5a40', 1.8);
    addShake(0.7);
  }
};
// the local titan got cut
G.hooks.titanHurt = (t, part, res) => {
  if (t !== G.localTitan) return;
  const k = res.kind, dmg = { napecrack: 100, shallow: 30, limb: 18, flesh: 6, weak: 10, kill: 100 }[k] || 0;
  if (k === 'guard') { hitMarker('block'); popup('BLOCKED THE CUT', '#9cd2ff'); Sfx.armorClank(); addShake(0.15); return; }
  if (k === 'armor') { Sfx.armorClank(); popup('CLANG · YOUR ARMOUR HOLDS', '#cde'); return; }
  hurtA = Math.min(1, 0.45 + dmg / 120); addShake(0.25 + dmg / 220); Sfx.hurt();
  if (dmg) dmgNumber(`−${dmg}`, '#ff6a50');
  if (k === 'napecrack') bigMsg('NAPE CUT', `${res.left} segment${res.left === 1 ? '' : 's'} left · hold C to guard it`, '#ff5a40', 1.8);
  else if (k === 'shallow') popup('A SHALLOW CUT ON YOUR NAPE', '#ffb07a');
  else if (k === 'limb') popup(part.startsWith('arm') ? 'ARM SEVERED · REGROWING' : 'ANKLES CUT · YOU\'RE DOWN', '#ffb07a');
};
function titanFeel(dt) {
  const t = G.localTitan; if (!t) return;
  crashCD -= dt;
  const c = t.crashT || 0;
  if (c > lastCrash) { const n = c - lastCrash; addShake(Math.min(0.3, 0.05 + n * 0.012)); if (crashCD <= 0) { Sfx.crash(Math.min(1.2, 0.35 + n * 0.04)); crashCD = 0.2; if (t.state === 'strike' || t.state === 'charge') hitMarker('wall'); } }
  lastCrash = c;
  hurtA = Math.max(0, hurtA - dt * 1.8); $('hurtflash').style.opacity = hurtA.toFixed(2);
}

/* ---------------------------------------------------------------- nape sense
   Tells you how close you are to the nearest nape and whether a cut right now would be deep:
   a ring around the crosshair that tightens as you close in, a gold glow at the screen edge,
   rising ticks, and a STRIKE cue the moment F would land a killing cut. */
const NS = { t: null, d: 1e9, reach: 0, state: 'none', k: 0, tickT: 0, lastState: 'none', from: 'back' };
export function napeReach(t, speed) { return 4.5 + t.h * 0.14 + Math.min(8, speed * 0.18); }
export function napeOpen(t) {
  if (t.napeGuard > 0 || t.hardened > 0) return false;
  if (t.boss && !t.boss.napeExposed(t)) return false;
  if (t.kit && t.kit.napeOpen && !t.kit.napeOpen(t)) return false;
  return true;
}
function updateNapeSense(dt) {
  NS.state = 'none'; NS.t = null;
  if (!P.alive || P.grabbedBy || P.frozen || gameState !== 'play' || G.localTitan || P.faction === 'interior') { NS.lastState = 'none'; return; }
  const ch = chest(_a), speed = P.vel.length();
  let best = null, bd = 1e9;
  for (const t of G.titans) {
    if (!t.alive || t.team === 'scouts') continue;
    const d = t.napeWorld(_b).distanceTo(ch);
    if (d < bd) { bd = d; best = t; }
  }
  const range = 42 + (P.char ? P.char.sense : 0);
  if (!best || bd > range) { NS.lastState = 'none'; return; }
  const t = best, reach = napeReach(t, speed);
  NS.t = t; NS.d = bd; NS.reach = reach;
  const rel = _c.subVectors(P.pos, t.pos); rel.y = 0; rel.normalize();
  const behind = rel.dot(t.fwd) < 0.2 || P.pos.y > t.pos.y + t.h * 1.02;
  NS.from = behind ? 'back' : 'front';
  NS.k = Math.max(0, Math.min(1, 1 - (bd - reach) / (range - reach)));
  if (bd > reach) NS.state = 'track';
  else if (!napeOpen(t)) NS.state = 'guarded';
  else if (speed >= 11 || (speed > 30 && !P.onGround)) NS.state = 'strike';
  else NS.state = 'slow';
  if (NS.state === 'strike' && NS.lastState !== 'strike') Sfx.napeReady();
  NS.tickT -= dt;
  if (NS.state === 'track' && NS.tickT <= 0) { NS.tickT = 0.08 + (1 - NS.k) * 0.55; Sfx.napeTick(NS.k); }
  NS.lastState = NS.state;
}
G.napeSense = NS;

/* ---------------------------------------------------------------- supply depots */
const depots = [];
const beamMat = new THREE.MeshBasicMaterial({ color: 0x5dffa0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 6, 8, 1, true);
const depotIconTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = 'rgba(20,60,30,0.85)'; g.beginPath(); g.arc(32, 32, 30, 0, 6.3); g.fill(); g.strokeStyle = '#7dffb0'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#7dffb0'; g.fillRect(27, 14, 10, 36); g.fillRect(14, 27, 36, 10); const t = new THREE.CanvasTexture(c); return t; })();
function setupDepots() {
  for (const d of depots) { scene.remove(d.beam); scene.remove(d.icon); }
  depots.length = 0;
  for (const s of window.SUPPLY) {
    const y = window.supplyY(s) + 1;
    const beam = new THREE.Mesh(beamGeo, beamMat.clone()); beam.position.set(s.x + 0.5, y + 3, s.z + 0.5); scene.add(beam);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: depotIconTex, depthTest: true, transparent: true })); icon.renderOrder = 18; scene.add(icon);
    depots.push({ s, x: s.x + 0.5, y, z: s.z + 0.5, beam, icon, cd: 0 });
  }
}
let supplyMk = null;
function updateSupplyHint() {
  const need = P.alive && (P.gas < 25 || (P.sharp <= 0 && P.spare <= 0) || (P.spare <= 1 && P.sharp < 30));
  if (need && depots.length) {
    let best = depots[0], bd = 1e9;
    for (const d of depots) { const dd = Math.hypot(d.x - P.pos.x, d.z - P.pos.z); if (dd < bd) { bd = dd; best = d; } }
    if (!supplyMk || !markers.list.includes(supplyMk)) supplyMk = markers.add(new THREE.Vector3(), 'RESUPPLY', 'civ edge');
    supplyMk.pos.set(best.x, best.y + 3, best.z);
  } else if (supplyMk) { markers.remove(supplyMk); supplyMk = null; }
}
function updateDepots(dt) {
  updateSupplyHint();
  for (const d of depots) {
    d.cd -= dt;
    const dist = Math.hypot(P.pos.x - d.x, P.pos.z - d.z), dy = P.pos.y - d.y;
    d.icon.position.set(d.x, d.y + 2.4 + Math.sin(G.time * 2) * 0.2, d.z);
    const cd = camera.position.distanceTo(d.icon.position); const sc = Math.max(0.8, cd * 0.022); d.icon.scale.set(sc, sc, 1);
    d.icon.material.opacity = Math.max(0, Math.min(1, (cd - 6) / 14));
    const hd = Math.hypot(camera.position.x - d.x, camera.position.z - d.z);
    d.beam.material.opacity = 0.22 * Math.max(0, Math.min(1, (hd - 2.5) / 12));
    if (P.alive && dist < 3.8 && dy > -1.5 && dy < 4 && d.cd <= 0 && (P.gas < 85 || P.spare < 8 || P.sharp < 50 || P.hp < 70)) {
      d.cd = 4; P.gas = 100; P.spare = 8; if (P.sharp <= 0 && P.swapT <= 0) { P.sharp = 100; }
      P.hp = Math.min(P.maxHp || 100, P.hp + 40); P.ammo = 2;
      Sfx.resupply(); bigMsg('RESUPPLIED', 'Gas refilled · blades restocked', '#7dffb0', 1.4);
      gasPuff(_a.set(d.x, d.y + 1, d.z), _b.set(0, 2, 0), 8, 0.8);
    }
  }
}

/* ---------------------------------------------------------------- fuel drops */
const fuel = G.fuel = new FuelDrops();
function applyFuel() {
  P.gas = Math.min(100, P.gas + FUEL.GAS); P.spare = Math.min(8, P.spare + FUEL.BLADES); P.hp = Math.min(P.maxHp || 100, P.hp + FUEL.HP);
  if (P.sharp <= 0 && P.swapT <= 0 && P.spare > 0) swapBlades();
  Sfx.fuel(); popup(`+${FUEL.GAS}% GAS  ·  +${FUEL.BLADES} BLADES`, '#8fdcff');
}
G.api_applyFuel = applyFuel;
function updateFuel(dt) {
  const local = G.mode !== 'mp';
  const touched = fuel.update(dt, P.pos, P.alive && !G.localTitan && (P.gas < 96 || P.spare < 8), P.char ? P.char.pickup : 1);
  if (touched) {
    if (local) { const d = fuel.remove(touched.id); gasPuff(_a.set(d.x, d.y + 1.5, d.z), _b.set(0, 3, 0), 10, 0.7); applyFuel(); }
    else if (G.hooks.takeFuel) { touched.pending = true; G.hooks.takeFuel(touched); }
  }
  // No random arcade drops during Story Mode chapters to prevent floating items
  if (G.mission && G.mission.id && G.mission.id.startsWith('story_')) return;
  if (!local || !G.mission || !G.mission.fuel) return;
  // single player: keep a handful of canisters scattered around you
  fuel.spT -= dt;
  for (const d of [...fuel.list]) if (Math.hypot(d.x - P.pos.x, d.z - P.pos.z) > 230) fuel.remove(d.id);
  if (fuel.spT <= 0 && fuel.list.length < G.mission.fuel) {
    fuel.spT = 6;
    const sp = randomDropSpot(P.pos.x, P.pos.z, 35, 140);
    if (sp) fuel.add('f' + (fuel.nextId++), sp.x, sp.y, sp.z);
  }
}

/* ---------------------------------------------------------------- camera & hero animation */
const camTarget = V(); let camRoll = 0, fovKick = 0, curFov = 72, pitchLim = 0.3, introT = 0;
const INTRO = 2.6, _q2 = new THREE.Quaternion(), _e2 = new THREE.Euler(); let introFrom = null;
function updateCamera(dt) {
  if (gameState === 'title' || gameState === 'loading' || gameState === 'brief' || gameState === 'menu') {
    // slow cinematic orbit around the district
    const t = performance.now() * 0.00004;
    const r = gameState === 'title' ? 120 : 90;
    camera.position.set(Math.sin(t) * r, 105 + Math.sin(t * 3) * 6, Math.cos(t) * r);
    camera.lookAt(0, 62, 0);
    view.x = 0; view.z = 0;
    camera.fov = 60; camera.updateProjectionMatrix();
    return;
  }
  if (G.mode === 'mp' && MP.active) {
    // spectate your killer while you wait to respawn
    const deadLocal = G.localTitan ? (!G.localTitan.alive && G.localTitan.st > 2.5) : (!P.alive && P.deadT > 2.2);
    const k = deadLocal ? spectateTarget() : null;
    if (k) {
      const h = k.h || 2, a = performance.now() * 0.00025;
      camera.position.set(k.pos.x + Math.sin(a) * (h * 1.3 + 12), k.pos.y + h * 1.1 + 6, k.pos.z + Math.cos(a) * (h * 1.3 + 12));
      camera.lookAt(k.pos.x, k.pos.y + h * 0.6, k.pos.z); camera.fov = 60; camera.updateProjectionMatrix();
      view.x = k.pos.x; view.z = k.pos.z; return;
    }
  }
  if (G.localTitan) { pilotCamera(G.localTitan, dt, P, shake); return; }
  const speed = P.vel.length();
  _a.copy(P.pos).add(_b.set(0, 1.45, 0));
  if (P.grabbedBy) _a.y += 0.5;
  const k = 1 - Math.exp(-dt * (speed > 30 ? 18 : 26));
  camTarget.lerp(_a, k);
  if (camTarget.distanceTo(_a) > 8) camTarget.copy(_a);
  pitchLim += ((P.onGround ? 0.3 : 0.62) - pitchLim) * (1 - Math.exp(-dt * 3));
  const opitch = Math.max(-1.25, Math.min(pitchLim, P.pitch));   // orbit pitch: never swing under the hero
  const cp = Math.cos(opitch), sp = Math.sin(opitch);
  const fwd = _b.set(-Math.sin(P.yaw) * cp, sp, -Math.cos(P.yaw) * cp);
  const right = _c.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  let dist;
  if (P.fp) { camBase.copy(P.pos).add(_d.set(0, 1.62, 0)); dist = 0; }
  else {
    const tall = camera.aspect < 0.9;   // portrait: sit further back and higher, so the hero is low in the frame
    const want = 5.4 + Math.min(3.2, speed * 0.05) + (P.alive ? 0 : 3) + Math.max(0, P.pitch - 0.3) * 1.5 + (tall ? 1.3 : 0);
    const sh = rayVoxel(camTarget, right, 1.3); const shoulder = sh ? Math.max(0, sh.t - 0.35) : 0.95;
    const pivot = _d.copy(camTarget).addScaledVector(right, shoulder);
    const back = _a.copy(fwd).negate();
    // collision: pull the camera in front of walls
    const hit = rayVoxel(pivot, back, want + 0.3);
    dist = hit ? Math.max(0.5, hit.t - 0.35) : want;
    camDist += (dist - camDist) * (dist < camDist ? 1 : 1 - Math.exp(-dt * 5));
    camBase.copy(pivot).addScaledVector(back, camDist);
    camBase.y += tall ? 0.7 : 0.25;
  }
  camera.position.copy(camBase);
  if (introT > 0) {
    // mission intro: sweep down from an establishing shot onto the hero
    introT -= dt;
    const tt = 1 - Math.max(0, introT) / INTRO, e = tt * tt * (3 - 2 * tt);
    if (!introFrom) {
      // establishing shot: high behind the hero, pulled in front of any wall in the way
      const head = V().copy(P.pos); head.y += 1.6;
      const dir = new THREE.Vector3(Math.sin(P.yaw + 0.35) * 22, 18, Math.cos(P.yaw + 0.35) * 22); const len = dir.length(); dir.divideScalar(len);
      const hit = rayVoxel(head, dir, len);
      introFrom = head.addScaledVector(dir, hit ? Math.max(3, hit.t - 1.5) : len);
    }
    _a.copy(introFrom);
    camera.position.lerpVectors(_a, camBase, e);
    _m4.lookAt(_a, _b.copy(P.pos).add(_c.set(0, 1.5, 0)), UP); _q.setFromRotationMatrix(_m4);
    camera.quaternion.copy(_q).slerp(_q2.setFromEuler(_e2.set(P.pitch, P.yaw, 0, 'YXZ')), e);
    camera.fov = 60 + 12 * e; camera.updateProjectionMatrix();
    view.x = P.pos.x; view.z = P.pos.z;
    return;
  }
  // roll / sway with lateral velocity
  const lat = P.onGround ? 0 : P.vel.dot(right);
  const rollT = Math.max(-0.14, Math.min(0.14, -lat * 0.0045)) + (P.boosting ? Math.sin(G.time * 31) * 0.004 : 0);
  camRoll += (rollT - camRoll) * (1 - Math.exp(-dt * 4));
  camera.rotation.set(P.pitch + shake.y * 0.05, P.yaw + shake.x * 0.05, camRoll + shake.roll, 'YXZ');
  camera.position.x += shake.x * 0.3; camera.position.y += shake.y * 0.3;
  // FOV kick
  fovKick = Math.max(0, fovKick - dt * 30);
  if (P.boosting) fovKick = Math.min(6, fovKick + dt * 40);
  const fovT = 72 + Math.min(30, Math.max(0, speed - 9) * 0.55) + fovKick + (P.reeling ? 3 : 0);
  curFov += (fovT - curFov) * (1 - Math.exp(-dt * 5));
  camera.fov = curFov; camera.updateProjectionMatrix();
  view.x = P.pos.x; view.z = P.pos.z;
}
const hq = new THREE.Quaternion(), hBasis = new THREE.Matrix4(), hx = V(), hy = V(), hz = V();
// gun HUD
let shellKey = '';
function updateGunHud() { const k = `${P.ammo}|${P.reloadT > 0}`; if (k === shellKey) return; shellKey = k; $('shell0').classList.toggle('on', P.ammo > 0); $('shell1').classList.toggle('on', P.ammo > 1); $('gunrl').textContent = P.reloadT > 0 ? 'RELOADING…' : 'F FIRE · R RELOAD'; }
const lastFace = new THREE.Vector3(0, 0, -1);
function updateHero(dt) {
  const R = hero, t = G.time, speed = P.vel.length();
  R.root.position.copy(P.pos); R.root.position.y += 0.85;
  const att = attachedAnchors();
  // orientation
  hy.set(0, 1, 0);
  if (!P.alive) { /* keep */ }
  else if (P.grabbedBy) { hy.set(0, 1, 0); }
  else if (P.mounted) { hy.set(0, 1, 0); }
  else if (att.length) {
    _a.set(0, 0, 0); for (const a of att) _a.add(_b.subVectors(a.pos, P.pos).normalize());
    hy.lerp(_a.normalize(), 0.8).normalize();
  } else if (!P.onGround && speed > 12) {
    _a.copy(P.vel).normalize(); hy.lerp(_a, Math.min(0.85, (speed - 12) / 22)).normalize();
  }
  const hv = Math.hypot(P.vel.x, P.vel.z);
  if (P.mounted) lastFace.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  else {
    if (hv > 1.2 || !P.onGround) { if (speed > 0.5) lastFace.copy(P.vel).normalize(); }
    if (P.onGround && hv < 1.2) lastFace.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    if (P.slashT >= 0 || P.spinT >= 0 || P.drawn || P.swingT >= 0) lastFace.set(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
  }
  hz.copy(lastFace).addScaledVector(hy, -lastFace.dot(hy));
  if (hz.lengthSq() < 0.001) hz.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)).addScaledVector(hy, -hy.y * 0);
  hz.normalize(); hx.crossVectors(hy, hz).normalize(); hz.crossVectors(hx, hy).normalize();
  hBasis.makeBasis(hx, hy, hz); hq.setFromRotationMatrix(hBasis);
  if (!P.alive) {
    const f = Math.min(1, P.deadT * 1.5);
    _q.setFromAxisAngle(hx, -1.45 * f); hq.premultiply(_q);
  }
  R.root.quaternion.slerp(hq, 1 - Math.exp(-dt * (P.alive ? 10 : 3)));
  // spin attack / spinning nape cut: corkscrew around the body's up axis
  R.model.rotation.y = P.spinT >= 0 ? (P.spinT / 0.6) * Math.PI * 4 : P.cutSpinT >= 0 ? (1 - Math.pow(1 - P.cutSpinT / 0.42, 2)) * Math.PI * 3 * (P.slashSide ? 1 : -1) : 0;
  // limbs
  const set = (o, x, y, z, k = 14) => { o.rotation.x += (x - o.rotation.x) * Math.min(1, dt * k); o.rotation.y += (y - o.rotation.y) * Math.min(1, dt * k); o.rotation.z += (z - o.rotation.z) * Math.min(1, dt * k); };
  let lR = 0, lL = 0, aR = [0.1, 0, -0.08], aL = [0.1, 0, 0.08], bodyX = 0, headX = 0;
  if (!P.alive) { aR = [-2.6, 0, -0.4]; aL = [-2.6, 0, 0.4]; lR = 0.2; lL = -0.1; }
  else if (P.grabbedBy) { aR = [0, 0, -0.15]; aL = [0, 0, 0.15]; lR = Math.sin(t * 12) * 0.5; lL = -Math.sin(t * 12) * 0.5; headX = -0.3; }
  else if (P.mounted) {
    lR = 1.05; lL = 1.05;
    aR = [-0.65, 0, -0.22]; aL = [-0.65, 0, 0.22];
    bodyX = 0.12;
  }
  else if (P.onGround && !att.length) {
    if (hv > 1) { const s = Math.sin(P.runPh * 2.6) * Math.min(1, hv / 8) * 1.0; lR = s; lL = -s; aR = [-s * 0.8 + 0.2, 0, -0.1]; aL = [s * 0.8 + 0.2, 0, 0.1]; bodyX = 0.18 * Math.min(1, hv / 8); }
    else { const b = Math.sin(t * 2) * 0.04; aR = [0.15 + b, 0, -0.12]; aL = [0.15 + b, 0, 0.12]; }
  } else {
    lR = 0.35 + Math.sin(t * 9) * 0.06; lL = 0.55 - Math.sin(t * 9) * 0.06;
    aR = [0.9, 0, -0.35]; aL = [0.9, 0, 0.35]; bodyX = 0.1;
    if (P.reeling) { lR = -0.6; lL = -0.4; }
  }
  if (P.hitT > 0) { bodyX -= 0.5 * P.hitT; aR = [-1.2, 0, -0.8]; aL = [-1.2, 0, 0.8]; }
  let twist = 0;
  const swing = P.swingT >= 0, sside = P.slashSide ? 1 : -1;
  if (P.drawn) { aR = [-2.75, 0, -0.75]; aL = [-2.75, 0, 0.75]; bodyX = -0.25; lR = 0.7; lL = 0.25; }   // blades cocked back, knees tucked
  if (swing) {
    // a wide horizontal cut: blades out front, the whole torso whips through
    const f = Math.min(1, P.swingT / 0.17), e = 1 - Math.pow(1 - f, 3);
    aR = [-1.6, 0, -0.3 - 0.4 * e]; aL = [-1.6, 0, 0.3 + 0.4 * e]; twist = sside * (1.35 - 2.7 * e); bodyX = 0.3 * e;
  }
  if (P.spinT >= 0 || P.cutSpinT >= 0) { aR = [-1.5, 0, -1.45]; aL = [-1.5, 0, 1.45]; lR = 0.35; lL = 0.35; twist = 0; }
  if (P.aimT > 0) { const pa = -Math.PI / 2 - P.pitch; aR = [pa, 0, -0.08]; aL = [pa, 0, 0.08]; }
  if (P.swapT > 0) { const f = P.swapT / 0.65; aR = [0.6 + Math.sin(f * Math.PI) * 0.8, 0, -0.5]; aL = [0.6 + Math.sin(f * Math.PI) * 0.8, 0, 0.5]; }
  const busy = swing || P.drawn || P.spinT >= 0 || P.cutSpinT >= 0;
  set(R.legR, lR, 0, 0); set(R.legL, lL, 0, 0); set(R.body, bodyX, twist, 0, swing ? 45 : 10); set(R.neck, headX, -twist * 0.4, 0);
  const fast = busy ? 45 : 14;
  // arms reach toward attached anchors (like holding the gear triggers up the cable)
  for (const [arm, pose, side] of [[R.armR, aR, 1], [R.armL, aL, 0]]) {
    const a = P.anchors[side];
    if (a.state === 'attached' && !busy && P.alive && !P.grabbedBy) {
      R.root.updateMatrixWorld(true);
      _a.copy(a.pos); arm.parent.worldToLocal(_a); _a.sub(arm.position).normalize();
      _q.setFromUnitVectors(DOWN, _a);
      arm.quaternion.slerp(_q, Math.min(1, dt * 12));
    } else set(arm, pose[0], pose[1], pose[2], fast);
  }
  // cape flutter
  if (R.cape) {
    const flap = Math.min(1.35, 0.12 + speed * 0.028) + Math.sin(t * (10 + speed * 0.4)) * 0.07 * Math.min(1, speed / 15);
    set(R.cape, P.onGround && hv < 1 ? 0.06 : flap, 0, Math.sin(t * 7) * 0.05 * Math.min(1, speed / 20), 10);
  }
  // blades: colour by sharpness, broken stubs
  for (const b of R.blades) {
    const s = P.sharp / 100;
    b.mat.color.setRGB(0.55 + 0.35 * s, 0.58 + 0.34 * s, 0.6 + 0.33 * s);
    b.mat.emissive.setRGB(0.05 + 0.12 * s, 0.07 + 0.14 * s, 0.09 + 0.16 * s);
    b.blade.scale.z = P.sharp > 0 ? 1 : 0.25; b.blade.position.z = P.sharp > 0 ? 9.6 : 3.6;
    b.grip.visible = P.swapT <= 0.3;
  }
  R.root.visible = ((!P.fp && camDist > 1.25) || !P.alive) && !P.hidden && !G.localTitan && !(G.mode === 'mp' && !P.alive && P.deadT > 4);
  fpRig.visible = P.fp && P.alive;
  if (fpRig.visible) {
    for (const b of fpBlades) {
      let rx = 0.25, ry = -0.18 * b.s, rz = 0.35 * b.s, px = 0.42 * b.s, py = -0.42;
      if (P.drawn) { rx = -0.75; ry = -0.5 * b.s; rz = 1.0 * b.s; py = -0.22; px = 0.5 * b.s; }
      if (swing) {
        // both blades sweep across the view, alternating direction
        const f = Math.min(1, P.swingT / 0.2), e = 1 - Math.pow(1 - f, 3), a = sside * (1 - 2 * e);
        ry = -0.18 * b.s + a * 1.25; rx = 0.25 - Math.sin(f * Math.PI) * 0.45; rz = 0.35 * b.s - a * 0.6; px = 0.42 * b.s + a * 0.32; py = -0.38 + Math.sin(f * Math.PI) * 0.08;
      }
      if (P.spinT >= 0 || P.cutSpinT >= 0) rz += (P.spinT >= 0 ? P.spinT : P.cutSpinT) * 25;
      b.g.position.set(px, py, -0.6);
      b.g.rotation.set(rx, ry, rz);
      b.blade.visible = P.sharp > 0 && P.swapT <= 0.3;
      b.mat.color.setRGB(0.6 + 0.35 * P.sharp / 100, 0.62 + 0.35 * P.sharp / 100, 0.66 + 0.3 * P.sharp / 100);
    }
  }
  R.root.updateMatrixWorld(true);
  // sword trails
  const on = busy || (speed > 32 && !P.onGround);
  R.blades.forEach((b, i) => {
    const base = b.blade.localToWorld(_a.set(0, 0, -6)), tip = b.blade.localToWorld(_b.set(0, 0, 7.5));
    trails[i].push(base, tip, on && P.sharp > 0 && !P.fp);
  });
  placeShadow(heroShadow, P.pos.x, P.pos.y, P.pos.z, 1.1, 40);
}

/* ---------------------------------------------------------------- HUD */
const hud = {
  score: $('score'), combo: $('combo'), chain: $('chainbar'), kills: $('kills'), hp: $('hpbar'), gas: $('gasbar'), gasv: $('gasval'),
  bl: $('bladeL'), br: $('bladeR'), spare: $('spare'), xh: $('xh'), dist: $('xhdist'), aL: $('ancL'), aR: $('ancR'), speed: $('speed'),
  mTitle: $('mtitle'), mObj: $('mobj'), mProg: $('mprog'), big: $('bigmsg'), bigT: $('bigt'), bigS: $('bigs'), pop: $('popups'),
  vign: $('vignette'), boss: $('bossbar'), bossFill: $('bossfill'), bossName: $('bossname'), bossPhase: $('bossphase'), build: $('buildtag'),
  dlg: $('dialog'), dlgText: $('dlgtext'), toast: $('toast'), lowgas: $('lowgas'),
  nglow: $('nglow'), nring: $('nring'), ncue: $('ncue'), brace: $('brace'), stun: $('stun')
};
let bigTimer = 0, toastTimer = 0, dlgTimer = 0;
function bigMsg(t, s = '', color = '#fff', dur = 1.5) {
  hud.bigT.textContent = t; hud.bigS.textContent = s; hud.bigT.style.color = color;
  hud.big.classList.remove('show'); void hud.big.offsetWidth; hud.big.classList.add('show'); bigTimer = dur;
}
function popup(text, color = '#fff') {
  const d = document.createElement('div'); d.className = 'pop'; d.textContent = text; d.style.color = color;
  hud.pop.prepend(d); setTimeout(() => d.remove(), 2200);
  while (hud.pop.children.length > 5) hud.pop.lastChild.remove();
}
function toast(t, dur = 2.5) { hud.toast.textContent = t; hud.toast.classList.add('show'); toastTimer = dur; }
// mission text names keyboard keys; on touch it names the buttons instead
const TOUCH_WORDS = [
  [/<b>WASD<\/b> to move, <b>mouse<\/b> to look/g, '<b>left thumb</b> to move, <b>drag</b> to look'], [/LEFT MOUSE/g, 'HOOK L'], [/RIGHT MOUSE/g, 'HOOK R'],
  [/<b>SPACE<\/b>/g, '<b>GAS</b>'], [/<b>SHIFT<\/b> reels your cables in fast/g, '<b>Push the stick forward</b> while hooked to reel in'], [/<b>SHIFT<\/b>/g, '<b>stick forward</b>'],
  [/<b>Hold W while swinging<\/b>/g, '<b>Push the stick forward while swinging</b>'], [/press <b>F<\/b>/g, 'tap <b>SLASH</b>'], [/\(F\)/g, '(SLASH)'], [/<b>mash F<\/b>/g, '<b>tap fast</b>'],
  [/<b>press R<\/b>/g, '<b>tap BLADES</b>'], [/\(R\)/g, '(BLADES)'], [/press <b>E<\/b>/g, 'tap <b>USE</b>'], [/press E/g, 'tap USE'], [/\(E\)/g, '(USE)']
];
const tw = (t) => TOUCH.on ? TOUCH_WORDS.reduce((a, [re, to]) => a.replace(re, to), String(t)) : t;
function say(text, dur = 6) { hud.dlgText.innerHTML = tw(text); hud.dlg.classList.add('show'); dlgTimer = dur; }
function setObjective(title, obj) { hud.mTitle.textContent = title; hud.mObj.innerHTML = tw(obj); }
function setProgress(t) { hud.mProg.innerHTML = tw(t); }
let bossRef = null;
function setBoss(t) { bossRef = t; hud.boss.classList.toggle('show', !!t); }
let lastHud = {};
function updateHUD(dt) {
  const set = (k, v, fn) => { if (lastHud[k] !== v) { lastHud[k] = v; fn(v); } };
  set('score', P.score, v => hud.score.textContent = v.toLocaleString());
  set('kills', P.kills, v => hud.kills.textContent = v);
  set('combo', P.combo, v => { hud.combo.textContent = v >= 2 ? `×${(1 + Math.min(4, (v - 1) * 0.5)).toFixed(1)}  CHAIN ${v}` : ''; hud.combo.classList.toggle('on', v >= 2); });
  hud.chain.style.width = (P.combo > 0 ? Math.max(0, P.chainT / 7) * 100 : 0) + '%';
  set('hp', Math.ceil(P.hp / (P.maxHp || 100) * 100), v => { hud.hp.style.width = Math.max(0, v) + '%'; hud.hp.parentElement.classList.toggle('low', v < 30); });
  set('gas', Math.ceil(P.gas), v => { hud.gas.style.width = v + '%'; hud.gasv.textContent = v + '%'; hud.lowgas.classList.toggle('show', v < 20); });
  const sh = Math.ceil(P.sharp);
  set('sharp', sh + (P.swapT > 0 ? 'x' : ''), () => { const h = P.swapT > 0 ? 0 : sh; hud.bl.style.height = h + '%'; hud.br.style.height = h + '%'; hud.bl.parentElement.classList.toggle('broken', sh <= 0); hud.br.parentElement.classList.toggle('broken', sh <= 0); });
  set('spare', P.spare, v => hud.spare.textContent = '×' + v);
  set('speed', Math.round(P.vel.length() * 3.6), v => hud.speed.textContent = v + ' km/h');
  // crosshair
  let cls = 'xh';
  if (AIM.valid) cls += AIM.titan ? (AIM.name === 'nape' ? ' nape' : ' titan') : ' ok';
  else cls += TOUCH.on && (TAIM[0].valid || TAIM[1].valid) ? ' ok' : ' out';
  if (P.anchors[0].state === 'attached') cls += ' L'; if (P.anchors[1].state === 'attached') cls += ' R';
  if (NS.state === 'strike') cls += ' nape';
  set('xh', cls, v => hud.xh.className = v);
  set('xd', TOUCH.on ? (AIM.valid ? Math.round(AIM.dist) + ' m' : '') : AIM.any ? (AIM.valid ? Math.round(AIM.dist) + ' m' : 'OUT OF RANGE') : '—', v => hud.dist.textContent = v);
  if (P.faction === 'interior') updateGunHud();
  // nearest enemy titan's health (scouts or player titan)
  let eb = null, ed = 75;
  const playerPos = G.localTitan ? G.localTitan.pos : P.pos;
  for (const t of G.titans) {
    if (!t.alive || t === G.localTitan) continue;
    if (G.localTitan && t.team && G.localTitan.team && t.team === G.localTitan.team) continue;
    const d = t.pos.distanceTo(playerPos);
    if (d < ed) { ed = d; eb = t; }
  }
  set('ebar', eb ? (eb.id + '_' + Math.round(eb.hp)) : '', () => {
    $('ebar').classList.toggle('show', !!eb);
    if (eb) {
      const typeLabel = eb.T ? (eb.T.label || eb.type).toUpperCase() : 'TITAN';
      $('ebar-n').textContent = `${(eb.name ? eb.name + ' · ' : '')}${typeLabel}  [ ${Math.max(0, Math.round(eb.hp))} / ${eb.hpMax} HP ]`;
      const segCount = eb.napeMax || 1;
      $('ebar-segs').innerHTML = Array.from({ length: segCount - 1 }, (_, i) => `<div class="seg" style="left:${((i + 1) / segCount * 100).toFixed(1)}%"></div>`).join('');
    }
  });
  if (eb) $('ebar-f').style.width = Math.max(0, eb.hp / eb.hpMax * 100).toFixed(1) + '%';
  // nape sense
  const ns = NS.state;
  set('ns', ns, v => { hud.nglow.className = v; hud.nring.className = v; hud.ncue.className = v; });
  if (ns === 'none') { hud.nglow.style.opacity = '0'; hud.nring.style.opacity = '0'; hud.ncue.style.opacity = '0'; }
  else {
    const k = NS.k, sz = ns === 'track' ? 34 + (1 - k) * 130 : 30;
    hud.nring.style.width = hud.nring.style.height = sz + 'px'; hud.nring.style.margin = `${-sz / 2}px 0 0 ${-sz / 2}px`;
    hud.nring.style.opacity = ns === 'track' ? (0.25 + 0.75 * k).toFixed(2) : '1';
    hud.nglow.style.opacity = ns === 'track' ? (k * k * 0.32).toFixed(3) : ns === 'strike' ? '0.75' : '0.45';
    hud.ncue.style.opacity = ns === 'track' ? (k > 0.35 ? '0.9' : '0') : '1';
    const txt = ns === 'strike' ? (TOUCH.on ? 'STRIKE  ·  SLASH' : 'STRIKE  ·  F') : ns === 'slow' ? 'TOO SLOW · BOOST IN' : ns === 'guarded' ? (NS.t && NS.t.hardened > 0 ? 'NAPE HARDENED' : NS.t && NS.t.napeGuard > 0 ? 'NAPE GUARDED · WAIT' : 'NAPE ARMOURED') : `NAPE ${Math.round(NS.d)} m${NS.from === 'front' ? '  ·  GET BEHIND' : ''}`;
    set('ncue', txt, v => hud.ncue.textContent = v);
  }
  set('brace', P.brace + (TOUCH.on ? 't' : ''), () => { const v = P.brace; hud.brace.classList.toggle('show', v > 0); hud.brace.textContent = TOUCH.on ? 'BRAKING' : v > 1 ? `HOLD G TO BRAKE  (−${v})` : 'HOLD G TO BRAKE'; });
  hud.stun.style.opacity = P.stunT > 0 ? Math.min(1, P.stunT * 2).toFixed(2) : '0';
  // timers
  if (bigTimer > 0) { bigTimer -= dt; if (bigTimer <= 0) hud.big.classList.remove('show'); }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) hud.toast.classList.remove('show'); }
  if (dlgTimer > 0) { dlgTimer -= dt; if (dlgTimer <= 0) hud.dlg.classList.remove('show'); }
  vignetteA = Math.max(0, vignetteA - dt * 1.4);
  const low = P.alive && P.hp < 30 ? 0.35 + 0.25 * Math.sin(G.time * 6) : 0;
  hud.vign.style.opacity = Math.max(vignetteA, low).toFixed(3);
  // boss
  if (bossRef) {
    const b = bossRef.boss;
    if (b) {
      const phase = bossRef.alive ? b.phase : 4;
      const prog = !bossRef.alive ? 0 : phase === 1 ? (0.75 + 0.25 * ((b.knees.ankleL + b.knees.ankleR) / 6)) : phase === 2 ? 0.25 + 0.25 * b.napeHP2 : 0.2;
      hud.bossFill.style.width = (prog * 100).toFixed(1) + '%';
      set('bphase', phase, v => hud.bossPhase.textContent = v <= 3 ? ['', 'PHASE I · ARMORED', 'PHASE II · UNLEASHED', 'PHASE III · SCALDING'][v] : 'DEFEATED');
    } else {
      const prog = !bossRef.alive ? 0 : Math.max(0, bossRef.hp / (bossRef.hpMax || 100));
      hud.bossFill.style.width = (prog * 100).toFixed(1) + '%';
      const label = bossRef.name || (bossRef.T ? bossRef.T.label.toUpperCase() : 'TITAN');
      if (hud.bossName) hud.bossName.textContent = label;
      set('bphase', bossRef.alive ? Math.ceil(bossRef.hp) : 0, v => hud.bossPhase.textContent = bossRef.alive ? `${label} · ${Math.ceil(bossRef.hp)} HP` : `${label} · DEFEATED`);
    }
  }
  const ejectBadge = $('titan-eject-badge');
  if (ejectBadge) ejectBadge.style.display = G.localTitan ? 'flex' : 'none';
  const horseBadge = $('horse-badge');
  if (horseBadge) {
    if (G.localTitan) horseBadge.style.display = 'none';
    else {
      horseBadge.style.display = 'flex';
      const bl = horseBadge.querySelector('.badge-label');
      if (bl) bl.textContent = P.mounted ? 'Dismount Steed [E]' : 'Ride Steed [H]';
    }
  }
}

/* ---------------------------------------------------------------- minimap */
const mm = $('minimap'), mctx = mm.getContext('2d');
let mapImg = null; const MAP_R = 330, MAP_S = 2;
function buildMapImage() {
  const n = Math.floor(MAP_R * 2 / MAP_S), c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const col = window.mapColor(-MAP_R + i * MAP_S, -MAP_R + j * MAP_S), k = (j * n + i) * 4;
    img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); mapImg = c;
}
function drawMinimap() {
  const W = mm.width, H = mm.height, cx = W / 2, cy = H / 2, scale = G.localTitan ? 0.7 : 1.0;
  const C = G.localTitan ? G.localTitan.pos : P.pos, Pp = P.pos; P.pos = C;
  mctx.save(); mctx.clearRect(0, 0, W, H);
  mctx.beginPath(); mctx.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); mctx.clip();
  mctx.fillStyle = '#26301f'; mctx.fillRect(0, 0, W, H);
  mctx.translate(cx, cy); mctx.rotate(P.yaw); mctx.scale(scale, scale);
  if (mapImg) { mctx.imageSmoothingEnabled = false; mctx.drawImage(mapImg, -MAP_R - P.pos.x, -MAP_R - P.pos.z, MAP_R * 2, MAP_R * 2); }
  const dot = (x, z, r, col, stroke) => { mctx.beginPath(); mctx.arc(x - P.pos.x, z - P.pos.z, r, 0, Math.PI * 2); mctx.fillStyle = col; mctx.fill(); if (stroke) { mctx.strokeStyle = stroke; mctx.lineWidth = 1.5; mctx.stroke(); } };
  for (const d of fuel.list) { mctx.fillStyle = '#7fd6ff'; mctx.beginPath(); mctx.arc(d.x - P.pos.x, d.z - P.pos.z, 3, 0, 6.3); mctx.fill(); mctx.strokeStyle = '#003050'; mctx.lineWidth = 1; mctx.stroke(); }
  for (const d of depots) { mctx.fillStyle = '#5dffa0'; mctx.fillRect(d.x - P.pos.x - 3, d.z - P.pos.z - 1, 6, 2); mctx.fillRect(d.x - P.pos.x - 1, d.z - P.pos.z - 3, 2, 6); }
  if (G.mission && G.mission.drawMap) G.mission.drawMap(mctx, P, dot);
  for (const t of G.titans) {
    if (!t.alive || t === G.localTitan) continue;
    const pulse = t.state === 'windup' || t.state === 'lunge' ? 1.5 : 1;
    dot(t.pos.x, t.pos.z, (2 + t.h * 0.28) * pulse, t.T.shifter ? '#ffb030' : t.type === 'boss' ? '#ff4a2a' : t.type === 'abnormal' ? '#ff7ad0' : '#ff5040', t.T.shifter ? '#fff' : '#300');
  }
  if (G.mode === 'mp') for (const s of G.scouts) {
    if (s === G.player || !s.alive || s.hidden) continue;
    const ally = G.localTeam && G.localTeam() === s.team;
    if (!ally && G.localTitan && !(s.boosting || s.reeling) && s.pos.distanceTo(C) > 40) continue;   // titans only hear scouts using gas
    dot(s.pos.x, s.pos.z, 3, ally ? '#7dffb0' : '#ff8a7a', '#000');
  }
  mctx.restore();
  P.pos = Pp;
  // player arrow + frame
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.moveTo(cx, cy - 7); mctx.lineTo(cx + 5, cy + 5); mctx.lineTo(cx, cy + 2); mctx.lineTo(cx - 5, cy + 5); mctx.closePath(); mctx.fill();
  mctx.strokeStyle = 'rgba(220,200,150,0.9)'; mctx.lineWidth = 3; mctx.beginPath(); mctx.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); mctx.stroke();
  // north marker
  const na = -P.yaw - Math.PI / 2; const nx = cx + Math.cos(na) * (W / 2 - 12), ny = cy + Math.sin(na) * (W / 2 - 12);
  mctx.fillStyle = '#ffd36a'; mctx.font = 'bold 13px Oswald, sans-serif'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillText('N', nx, ny);
}

/* ---------------------------------------------------------------- titans API for missions */
function spawnTitan(type, x, z, opts = {}) {
  const t = new Titan(type, x, z, opts);
  G.titans.push(t);
  return t;
}
function clearTitans() { for (const t of G.titans) t.remove(); G.titans.length = 0; }
G.api = { spawnTitan, clearTitans, setObjective, setProgress, bigMsg, popup, toast, say, setBoss, addScore, complete: completeMission, fail: failMission, depots, chest, P };

/* ---------------------------------------------------------------- screens & flow */
const screens = ['title', 'missions', 'story-select', 'brief', 'pause', 'death', 'done', 'loading', 'controls', 'mpmenu', 'lobby', 'shifter-select', 'tactical-map'];
function show(id) { for (const s of screens) $(s).classList.toggle('show', s === id); $('hud').classList.toggle('show', id === null && (gameState === 'play')); }
let curMission = 0, campaign = false, missionT = 0;

/* ---------------------------------------------------------------- Titan Transformation & Shifter Systems */
export const SHIFTER_CARDS = {
  attack: {
    id: 'attack',
    name: 'Attack Titan',
    kanji: '進撃の巨人',
    pilot: 'Eren Yeager',
    color: '#2ecc71',
    glow: 'rgba(46, 204, 113, 0.4)',
    specs: [{ l: 'HEIGHT', v: '15m' }, { l: 'CLASS', v: 'Brawler' }, { l: 'STRIKE', v: 'High' }],
    blurb: 'Ever advancing in the pursuit of freedom. Hardened crystal knuckles, fierce war cry roar, and piercing ground spikes.',
    skills: [
      { k: 'LMB', n: 'Brawler Strike', d: 'Heavy direct melee punch' },
      { k: 'RMB', n: 'Grab', d: 'Seize and throw opponents' },
      { k: 'Q', n: 'Hardened Fist', d: '+60% strike power for 5s' },
      { k: 'E', n: 'War Cry', d: 'Shockwave roar knocking foes back' },
      { k: 'R', n: 'Stone Spikes', d: 'Piercing line of ground earth spikes' }
    ]
  },
  armored: {
    id: 'armored',
    name: 'Armored Titan',
    kanji: '鎧の巨人',
    pilot: 'Reiner Braun',
    color: '#f39c12',
    glow: 'rgba(243, 156, 18, 0.4)',
    specs: [{ l: 'HEIGHT', v: '15m' }, { l: 'CLASS', v: 'Fortress' }, { l: 'DEFENSE', v: 'Impenetrable' }],
    blurb: 'Sheathed in hardened segmented armor plates. Blasts through stone buildings and charges headlong into battle.',
    skills: [
      { k: 'LMB', n: 'Iron Punch', d: 'Crushing armored fist slam' },
      { k: 'RMB', n: 'Grab', d: 'Crush caught enemies' },
      { k: 'Q', n: 'Shoulder Charge', d: 'Ramming tackle flattening all' },
      { k: 'E', n: 'Harden Armor', d: 'Total stone defense for 4.5s' },
      { k: 'R', n: 'Wall Breaker', d: 'Cataclysmic leap & ground slam' }
    ]
  },
  beast: {
    id: 'beast',
    name: 'Beast Titan',
    kanji: '獣の巨人',
    pilot: 'Zeke Yeager',
    color: '#d35400',
    glow: 'rgba(211, 84, 0, 0.4)',
    specs: [{ l: 'HEIGHT', v: '17m' }, { l: 'CLASS', v: 'Artillery' }, { l: 'RANGE', v: 'Extreme' }],
    blurb: 'Ape-like titan with tremendous reach. Pitches high-speed rock shards and calls forth legions of wild titans.',
    skills: [
      { k: 'LMB', n: 'Long Swipe', d: 'Broad sweep hitting distant targets' },
      { k: 'RMB', n: 'Grab', d: 'Hurl enemies far away' },
      { k: 'Q', n: 'Boulder Pitch', d: 'Spray of lethal rock shards' },
      { k: 'E', n: 'Command Roar', d: 'Summon & enrage ally titans' },
      { k: 'R', n: 'Bombardment', d: 'Rain of heavy crushing boulders' }
    ]
  },
  colossal: {
    id: 'colossal',
    name: 'Colossal Titan',
    kanji: '超大型巨人',
    pilot: 'Bertholdt Hoover',
    color: '#e74c3c',
    glow: 'rgba(231, 76, 60, 0.45)',
    specs: [{ l: 'HEIGHT', v: '34m' }, { l: 'CLASS', v: 'Siege Giant' }, { l: 'HEAT', v: 'Scorching' }],
    blurb: 'The God of Destruction. Overlooks the colossal walls, dispelling enemies with scalding steam and atomic blasts.',
    skills: [
      { k: 'LMB', n: 'Colossal Sweep', d: 'Sweeps an entire district block' },
      { k: 'RMB', n: 'Grab', d: 'Lift and crush from the skies' },
      { k: 'Q', n: 'Steam Shroud', d: 'Burning high-pressure steam cloud' },
      { k: 'E', n: 'Quake Stomp', d: 'District-wide seismic shockwave' },
      { k: 'R', n: 'Cataclysm', d: 'Nuclear-tier detonation' }
    ]
  },
  female: {
    id: 'female',
    name: 'Female Titan',
    kanji: '女型の巨人',
    pilot: 'Annie Leonhart',
    color: '#3498db',
    glow: 'rgba(52, 152, 219, 0.4)',
    specs: [{ l: 'HEIGHT', v: '14m' }, { l: 'CLASS', v: 'Martial Artist' }, { l: 'SPEED', v: 'High' }],
    blurb: 'Unrivaled versatility and martial arts lethality. Snap-hardens crystal on defense and strikes with flying kicks.',
    skills: [
      { k: 'LMB', n: 'Martial Strike', d: 'Fast precision punch' },
      { k: 'RMB', n: 'Grapple', d: 'Direct martial hold' },
      { k: 'Q', n: 'Snap Harden', d: 'Instant crystal nape shield' },
      { k: 'E', n: 'Flying Kick', d: 'Airborne martial arts dash kick' },
      { k: 'R', n: 'Shriek', d: 'Disorient enemies and call horde' }
    ]
  },
  jaw: {
    id: 'jaw',
    name: 'Jaw Titan',
    kanji: '顎の巨人',
    pilot: 'Porco Galliard',
    color: '#f1c40f',
    glow: 'rgba(241, 196, 15, 0.4)',
    specs: [{ l: 'HEIGHT', v: '5.8m' }, { l: 'CLASS', v: 'Predator' }, { l: 'SPEED', v: 'Extreme' }],
    blurb: 'Agile quadruped hunter with hardened bone mask and claws. Climbs walls and pounces at terrifying velocity.',
    skills: [
      { k: 'LMB', n: 'Claw Swipe', d: 'Razor slash cutting limbs' },
      { k: 'RMB', n: 'Bone Bite', d: 'Crushing jaw bite attack' },
      { k: 'Q', n: 'Pounce', d: 'Lightning-fast lunging bite' },
      { k: 'E', n: 'Cable Snap', d: 'Disrupt and snap grapples' },
      { k: 'R', n: 'Frenzy', d: 'Extreme sprint and instant regen' }
    ]
  }
};
let currentShifter = localStorage.getItem('ts_shifter') || 'attack';

function transformVFX(pos) {
  flashA = 1.0;
  sparkBurst(pos.clone().add(_a.set(0, 4, 0)), 65, 18, [1.0, 0.92, 0.45]);
  steamBurst(pos.clone().add(_a.set(0, 6, 0)), 120, 10, 14, 18, 3.2);
  dust(pos, 50, 7, [0.8, 0.75, 0.65], 12);
  addShake(1.4);
}

function transformIntoTitan(shifterType = currentShifter) {
  if (G.localTitan || !P.alive) return;
  currentShifter = shifterType;
  localStorage.setItem('ts_shifter', shifterType);
  const info = SHIFTER_CARDS[shifterType] || SHIFTER_CARDS.attack;
  Sfx.init();
  Sfx.thunder();
  transformVFX(P.pos);
  const pTitan = spawnTitan(shifterType, P.pos.x, P.pos.z, {
    id: 'player_shifter',
    name: info.pilot,
    ctrl: 'player',
    team: 'player_shifter',
    yaw: P.yaw + Math.PI,
    y: P.pos.y
  });
  G.localTitan = pTitan;
  initPilotedTitan(pTitan);
  mpSetTitanMode(pTitan);
  Sfx.roar(pTitan.h);
  bigMsg('TITAN TRANSFORMATION', info.name.toUpperCase(), '#ffd36a', 2.8);
  toast(`Transformed into ${info.name}! [T] Eject · [LMB] Strike · [RMB] Grab · [Q/E/R] Skills`, 4);
}

function ejectFromTitan() {
  if (!G.localTitan) return;
  const t = G.localTitan;
  const nape = t.napeWorld(new THREE.Vector3());

  // Realistic ejection: Titan carcass collapses, smokes, and dissolves away
  t.ctrl = 'ai';
  t.kill({ by: 'eject' });
  steamBurst(nape, 120, t.h * 0.45, t.h * 0.45, 16, 4.0, 2);
  sparkBurst(nape, 45, 3.0, [1.0, 0.9, 0.4]);
  Sfx.steamBurst(2.5);
  addShake(0.6);

  // Character emerges cutting out from the nape, launching upward into the air with 3DMG ready
  resetPlayer({ x: nape.x, y: nape.y + 2, z: nape.z, yaw: P.yaw });
  P.vel.set(-Math.sin(P.yaw) * 12, 16, -Math.cos(P.yaw) * 12);
  P.alive = true; P.gas = 100; P.sharp = 100;

  G.localTitan = null;
  mpSetTitanMode(null);
  toast('Ejected from Titan nape! Titan dissolving into steam. [T] to Transform', 3.0);
}

function buildShifterCards() {
  const wrap = $('shifter-cards');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const [key, S] of Object.entries(SHIFTER_CARDS)) {
    const card = document.createElement('div');
    card.className = 'scard' + (key === currentShifter ? ' chosen' : '');
    card.style.setProperty('--sc-col', S.color);
    card.style.setProperty('--sc-glow', S.glow);
    const specsHtml = S.specs.map(sp => `<div class="sc-spec">${sp.l}: <b>${sp.v}</b></div>`).join('');
    const skillsHtml = S.skills.map(sk => `<div class="sc-sk"><span class="k">${sk.k}</span><span class="sn">${sk.n}</span><span class="sd">${sk.d}</span></div>`).join('');
    card.innerHTML = `
      <div class="sc-header">
        <div class="sc-title">${S.name}</div>
        <div class="sc-kanji">${S.kanji}</div>
      </div>
      <div class="sc-pilot">PILOT: ${S.pilot}</div>
      <div class="sc-specs">${specsHtml}</div>
      <div class="sc-blurb">"${S.blurb}"</div>
      <div class="sc-skills">${skillsHtml}</div>
      <button class="btn primary sc-btn">TRANSFORM &amp; BATTLE</button>
    `;
    card.onclick = () => {
      Sfx.init(); Sfx.ui();
      startTitanVsTitan(key);
    };
    wrap.append(card);
  }
}

function startTitanVsTitan(shifterType = 'attack') {
  currentShifter = shifterType;
  localStorage.setItem('ts_shifter', shifterType);
  const info = SHIFTER_CARDS[shifterType] || SHIFTER_CARDS.attack;
  G.mode = 'titan_arena';
  G.titanVictory = false;
  G.titanDefeated = false;
  gameState = 'loading'; show('loading');
  clearTitans(); clearFX(); fuel.clear();
  for (const b of G.projectiles) scene.remove(b.m); G.projectiles.length = 0;
  if (G.mission && G.mission.cleanup) G.mission.cleanup();
  G.districtDamage = 0; setBoss(null);
  startWorld(WORLD_SEED);
  resetPlayer({ x: 0, y: 46, z: 0, yaw: 0 });
  setDayTime(0.13, 0.12);
  view.x = 0; view.z = 0;

  setTimeout(() => {
    Sfx.init(); Music.start();
    gameState = 'play'; show(null);
    requestLock();

    const gh = (x, z) => window.groundH ? (window.groundH(Math.floor(x), Math.floor(z)) + 1) : 47;

    // Spawn Player Titan
    const pTitan = spawnTitan(shifterType, 0, 0, {
      id: 'player_shifter',
      name: info.pilot,
      ctrl: 'player',
      team: 'player_shifter',
      yaw: 0,
      y: gh(0, 0)
    });
    G.localTitan = pTitan;
    initPilotedTitan(pTitan);
    mpSetTitanMode(pTitan);

    // Select rival shifter boss
    const rivalType = {
      attack: 'armored',
      armored: 'attack',
      beast: 'colossal',
      colossal: 'beast',
      female: 'attack',
      jaw: 'female'
    }[shifterType] || 'armored';
    const rivalInfo = SHIFTER_CARDS[rivalType] || SHIFTER_CARDS.armored;

    const rivalBoss = spawnTitan(rivalType, 0, 85, {
      id: 'rival_boss',
      name: `${rivalInfo.name} (${rivalInfo.pilot})`,
      ctrl: 'ai',
      team: 'enemy_titans',
      yaw: Math.PI,
      alert: true,
      y: gh(0, 85)
    });
    attachKit(rivalBoss);
    setBoss(rivalBoss);

    // Spawn pure roaming titans
    const pureSpawns = [
      { type: 'abnormal', x: -45, z: 50 },
      { type: 'strider', x: 50, z: 45 },
      { type: 'strider', x: -35, z: 95 },
      { type: 'runt', x: 35, z: 80 }
    ];
    for (const sp of pureSpawns) {
      spawnTitan(sp.type, sp.x, sp.z, {
        team: 'enemy_titans',
        alert: true,
        yaw: Math.random() * 6.28,
        y: gh(sp.x, sp.z)
      });
    }

    // Set Hostility
    G.hostile = (a, b) => a.team !== b.team;

    setObjective('TITAN VS TITAN', `Defeat the ${rivalInfo.name} and the invading Titan horde`);
    setProgress(`HOSTILE TITANS: ${G.titans.length - 1}`);

    // Cinematic transform FX
    Sfx.thunder();
    transformVFX(pTitan.pos);
    Sfx.roar(pTitan.h);
    bigMsg('TITAN VS TITAN', `${info.name.toUpperCase()} VS ${rivalInfo.name.toUpperCase()}`, '#ffd36a', 3.5);
    toast('LMB: Strike/Combo · F: Knockdown Kick · RMB: Grab/Throw · Q/E/R: Skills · C: Guard Nape', 5);
  }, 400);
}
function resetPlayer(spawn) {
  if (G.localTitan) {
    G.localTitan.remove();
    G.localTitan = null;
  }
  mpSetTitanMode(null);
  G.titanVictory = false;
  G.titanDefeated = false;
  clearHorses();
  hero.root.visible = true;
  fpRig.visible = false;
  heroShadow.visible = true;

  P.pos.set(spawn.x + 0.5, spawn.y, spawn.z + 0.5); P.vel.set(0, 0, 0);
  P.yaw = spawn.yaw || 0; P.pitch = -0.1;
  P.onGround = true;
  Object.assign(P, { alive: true, hp: 100, gas: 100, sharp: 100, spare: 8, swapT: 0, grabbedBy: null, invuln: 3.0, slashT: -1, spinT: -1, swingT: -1, drawn: false, cutSpinT: -1, lungeT: 0, slashCD: 0, combo: 0, chainT: 0, bestCombo: 0, kills: 0, score: 0, frozen: true, stunT: 0, maxSpeed: 0, deadT: 0, hitT: 0, lastKillT: -99, jamT: 0, lastAttacker: null, lastHurt: -99, braking: false, brace: 0, boosting: false, reeling: false });
  for (const a of P.anchors) { a.state = 'idle'; a.held = false; a.cable.hide(); }
  $('grab').classList.remove('show');
  camTarget.copy(P.pos);
}
function loadMission(i) {
  if (typeof i === 'string') {
    const idx = MISSIONS.findIndex(m => m.id === i);
    i = idx >= 0 ? idx : 0;
  }
  curMission = i; const M = MISSIONS[i];
  gameState = 'loading'; show('loading');
  if (G.localTitan) {
    G.localTitan.remove();
    G.localTitan = null;
  }
  mpSetTitanMode(null);
  G.titanVictory = false;
  G.titanDefeated = false;
  clearHorses();
  clearTitans(); clearFX(); fuel.clear(); fuel.spT = 1;
  for (const b of G.projectiles) scene.remove(b.m); G.projectiles.length = 0;
  if (G.mission && G.mission.cleanup) G.mission.cleanup();
  G.districtDamage = 0; setBoss(null);
  startWorld(WORLD_SEED);
  resetPlayer(params.has('pos') ? (() => { const [x, y, z] = params.get('pos').split(',').map(Number); return { x, y, z, yaw: 0 }; })() : M.spawn);
  view.x = P.pos.x; view.z = P.pos.z;
  setDayTime(M.time ?? 0.12, M.flow ?? 0.15);
  // briefing
  $('brieftitle').textContent = M.name; $('briefsub').textContent = M.sub; $('brieftext').innerHTML = tw(M.brief);
  $('briefimg').style.backgroundImage = `url(art/${M.art})`;
  $('briefobj').innerHTML = M.objectives.map(o => `<li>${tw(o)}</li>`).join('');
  gameState = 'brief'; show('brief');
  $('beginbtn').disabled = false;
  Music.target = 0.2;
}
function beginMission() {
  const M = MISSIONS[curMission];
  Sfx.init(); Music.start(); Sfx.ui();
  gameState = 'play'; show(null);
  requestLock();
  missionT = 0;
  G.mission = Missions[M.id]();
  G.mission.start(G.api);
  if (params.has('step') && G.mission.setStep) G.mission.setStep(+params.get('step'));
  setObjective(M.name, G.mission.objective || '');
  Sfx.horn();
  introT = INTRO; camDist = 5.4; introFrom = null;
  bigMsg(M.name.toUpperCase(), M.sub, '#ffd36a', 2.6);
  if (params.has('yaw')) P.yaw = +params.get('yaw');
  if (params.has('pitch')) P.pitch = +params.get('pitch');
  if (params.has('spawn')) params.get('spawn').split(',').forEach((ty, i) => spawnTitan(ty.replace('!', ''), P.pos.x - Math.sin(P.yaw) * (22 + i * 14) + (i - 1) * 12, P.pos.z - Math.cos(P.yaw) * (22 + i * 14), { yaw: P.yaw, passive: !ty.endsWith('!'), alert: ty.endsWith('!') }));
  if (params.has('aimat')) { const [x, y, z] = params.get('aimat').split(',').map(Number); const dx = x - P.pos.x, dy = y - P.pos.y - 1.6, dz = z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }
}
function completeMission(stats = {}) {
  if (gameState !== 'play') return;
  gameState = 'done';
  setTimeout(() => {
    document.exitPointerLock && document.exitPointerLock();
    const M = MISSIONS[curMission];
    const time = missionT;
    const score = P.score + (stats.bonus || 0);
    const rank = score > M.ranks[0] ? 'S' : score > M.ranks[1] ? 'A' : score > M.ranks[2] ? 'B' : 'C';
    $('donetitle').textContent = M.name + ' — Complete';
    $('donestats').innerHTML = `
      <div><b>${score.toLocaleString()}</b><span>Score</span></div>
      <div><b>${P.kills}</b><span>Titans slain</span></div>
      <div><b>${P.bestCombo}</b><span>Best chain</span></div>
      <div><b>${fmtTime(time)}</b><span>Time</span></div>
      <div><b>${Math.round(P.maxSpeed * 3.6)}</b><span>Top km/h</span></div>
      ${stats.extra || ''}`;
    $('donerank').textContent = rank; $('donerank').className = 'rank r' + rank;
    const best = JSON.parse(localStorage.getItem('ts_best') || '{}');
    if (!best[M.id] || best[M.id] < score) { best[M.id] = score; localStorage.setItem('ts_best', JSON.stringify(best)); }
    const unlocked = Math.max(+localStorage.getItem('ts_unlocked') || 0, curMission + 1); localStorage.setItem('ts_unlocked', unlocked);
    $('nextbtn').style.display = curMission < MISSIONS.length - 1 ? '' : 'none';
    $('nextbtn').textContent = 'Next Mission';
    $('donequote').textContent = M.outro || 'Wall Maria has been secured. Humanity reclaims its freedom!';
    show('done'); Sfx.fanfare(); Music.target = 0.25;
  }, 1800);
  bigMsg('MISSION COMPLETE', stats.msg || '', '#ffd36a', 3);
  slowT = slowDur = 1.2;
}
function failMission(reason) {
  if (gameState !== 'play') return;
  showDeath(reason, true);
}
function showDeath(reason, failed) {
  gameState = 'dead';
  document.exitPointerLock && document.exitPointerLock();
  P.alive = false; P.boosting = false; P.braking = false; P.reeling = false;
  if (G.localTitan) {
    G.localTitan.remove();
    G.localTitan = null;
  }
  mpSetTitanMode(null);
  document.body.classList.remove('titanmode');
  $('deathtitle').textContent = failed ? 'MISSION FAILED' : 'YOU ARE DEAD';
  $('deathreason').textContent = reason || 'Slain in battle beyond the walls';
  show('death');
  try { if (Sfx.failSting) Sfx.failSting(); } catch (e) { /* audio fallback */ }
  Music.target = 0.1;
}
function pauseGame() {
  if (gameState !== 'play') return;
  gameState = 'pause'; show('pause'); for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; touchRelease();
  const mp = G.mode === 'mp';
  $('restartbtn').style.display = mp ? 'none' : ''; $('quitbtn').textContent = mp ? 'Leave match' : 'Quit to Title';
  document.querySelector('#pause h1').textContent = mp ? 'Menu' : 'Paused';
  document.querySelector('#pause .sub').textContent = mp ? 'The battle goes on without you. Hurry back.' : 'The titans can wait.';
  document.exitPointerLock && document.exitPointerLock();
}
function resumeGame() { gameState = 'play'; show(null); requestLock(); }
function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; }
G.api.fmtTime = fmtTime;

function buildMissionCards() {
  const unlocked = 99; // every mission is selectable; Campaign plays them in order
  const best = JSON.parse(localStorage.getItem('ts_best') || '{}');
  const wrap = $('cards'); wrap.innerHTML = '';
  MISSIONS.forEach((M, i) => {
    const isStory = M.id.startsWith('story_');
    const d = document.createElement('div'); d.className = 'card' + (i > unlocked ? ' locked' : '');
    const numLabel = isStory ? `CHAPTER ${i + 1}` : M.id === 'free' ? 'SANDBOX' : `TRAINING ${i - 4}`;
    d.innerHTML = `<div class="cimg" style="background-image:url(art/${M.art})"></div><div class="cnum">${numLabel}</div><div class="cname">${M.name}</div><div class="csub">${M.sub}</div><div class="cbest">${best[M.id] ? 'Best ' + best[M.id].toLocaleString() : (i > unlocked ? 'Locked' : '')}</div>`;
    d.onclick = () => { if (i > unlocked) { Sfx.init(); Sfx.dry(); return; } Sfx.init(); Sfx.ui(); campaign = isStory; loadMission(i); };
    wrap.append(d);
  });
}

function buildStoryCards() {
  const wrap = $('story-cards');
  if (!wrap) return;
  wrap.innerHTML = '';
  const best = JSON.parse(localStorage.getItem('ts_best') || '{}');
  const storyMissions = MISSIONS.slice(0, 5);
  storyMissions.forEach((M, i) => {
    const d = document.createElement('div');
    d.className = 'story-card';
    d.innerHTML = `
      <div class="story-card-top">
        <div class="story-card-num">CHAPTER ${i + 1}</div>
        <div class="story-card-best">${best[M.id] ? 'Score: ' + best[M.id].toLocaleString() : 'Ready'}</div>
      </div>
      <div class="story-card-name">${M.name}</div>
      <div class="story-card-sub">${M.sub}</div>
      <div class="story-card-brief">${M.brief ? M.brief.replace(/<[^>]*>/g, '').slice(0, 140) + '…' : ''}</div>
      <div class="story-card-foot">
        <span style="font-size:12px;color:#aaa">3DMG &amp; Shifter Combat</span>
        <button class="btn small" style="margin:0;padding:6px 16px;background:linear-gradient(135deg, #184e36, #2ecc71);border-color:#7dffb0;color:#fff;font-weight:700">Deploy</button>
      </div>
    `;
    d.onclick = () => {
      Sfx.init(); Sfx.ui();
      campaign = true;
      loadMission(i);
    };
    wrap.append(d);
  });
}

function menuMusic() { Sfx.init(); if (!Music.on) { Music.target = 0.25; Music.start(); } }
document.addEventListener('click', () => { if (gameState === 'title') menuMusic(); });
if ($('btn-campaign')) { const u = +localStorage.getItem('ts_unlocked') || 0; if (u > 0 && u < 5) $('btn-campaign').textContent = `Continue Campaign · ${MISSIONS[u].name}`; $('btn-campaign').onclick = () => { Sfx.init(); Sfx.ui(); campaign = true; const u2 = Math.min(MISSIONS.length - 1, +localStorage.getItem('ts_unlocked') || 0); loadMission(u2 >= 5 ? 0 : u2); }; }
if ($('btn-story-mode')) $('btn-story-mode').onclick = () => { Sfx.init(); Sfx.ui(); buildStoryCards(); show('story-select'); };
if ($('story-back')) $('story-back').onclick = () => { Sfx.ui(); show('title'); };
if ($('story-start-all')) $('story-start-all').onclick = () => { Sfx.init(); Sfx.ui(); campaign = true; loadMission(0); };
if ($('btn-titan-mode')) $('btn-titan-mode').onclick = () => { Sfx.init(); Sfx.ui(); buildShifterCards(); show('shifter-select'); };
if ($('shifter-back')) $('shifter-back').onclick = () => { Sfx.ui(); show('title'); };
if ($('btn-practice')) $('btn-practice').onclick = () => { Sfx.init(); Sfx.ui(); campaign = false; loadMission('practice'); };
if ($('btn-expedition')) $('btn-expedition').onclick = () => { Sfx.init(); Sfx.ui(); campaign = false; loadMission('expedition'); };
if ($('titan-eject-badge')) $('titan-eject-badge').onclick = () => { if (G.localTitan) ejectFromTitan(); };
if ($('horse-badge')) $('horse-badge').onclick = () => { whistleHorse(P); };
if ($('titan-ready')) $('titan-ready').onclick = () => { if (gameState === 'play' && !G.localTitan && P.alive) transformIntoTitan(); };
if ($('btn-missions')) $('btn-missions').onclick = () => { Sfx.init(); Sfx.ui(); buildMissionCards(); show('missions'); };
if ($('btn-free')) $('btn-free').onclick = () => { Sfx.init(); Sfx.ui(); campaign = false; loadMission('expedition'); };
$('btn-controls').onclick = () => { Sfx.init(); Sfx.ui(); show('controls'); };
$('ctrl-back').onclick = () => { Sfx.ui(); show(gameState === 'pause' ? 'pause' : 'title'); };
$('mis-back').onclick = () => { Sfx.ui(); show('title'); };
$('beginbtn').onclick = () => beginMission();
$('briefback').onclick = () => { Sfx.ui(); gameState = 'title'; show('title'); };
$('resumebtn').onclick = () => { Sfx.ui(); resumeGame(); };
$('restartbtn').onclick = () => { Sfx.ui(); if (G.mode === 'titan_arena') startTitanVsTitan(currentShifter); else loadMission(curMission); };
$('pausectrl').onclick = () => { Sfx.ui(); show('controls'); };
$('quitbtn').onclick = () => { Sfx.ui(); if (G.mode === 'mp') { leaveMatch(); } else quitToTitle(); };
$('retrybtn').onclick = () => { Sfx.ui(); if (G.mode === 'titan_arena') startTitanVsTitan(currentShifter); else loadMission(curMission); };
$('deathquit').onclick = () => { Sfx.ui(); quitToTitle(); };
$('nextbtn').onclick = () => { Sfx.ui(); loadMission(Math.min(MISSIONS.length - 1, curMission + 1)); };
$('replaybtn').onclick = () => { Sfx.ui(); if (G.mode === 'titan_arena') startTitanVsTitan(currentShifter); else loadMission(curMission); };
$('donequit').onclick = () => { Sfx.ui(); quitToTitle(); };
$('sens').value = sens; $('sens').oninput = (e) => { sens = +e.target.value; localStorage.setItem('ts_sens', sens); };
try { const mv = localStorage.getItem('ts_master'); if (mv !== null) $('vol').value = mv; } catch (e) { /* ignore */ }
$('vol').oninput = (e) => { if (Sfx.master) Sfx.master.gain.value = +e.target.value; try { localStorage.setItem('ts_master', e.target.value); } catch (er) { /* ignore */ } };
// music volume: pause menu slider, multiplayer menu slider, and the M key (full → half → off)
function syncMusicUI() { $('musicvol').value = Music.vol; $('musicvol2').value = Music.vol; }
syncMusicUI();
$('musicvol').oninput = $('musicvol2').oninput = (e) => { Music.setVolume(+e.target.value); syncMusicUI(); };
let tacticalMapOpen = false;
function renderTacticalMap() {
  const canvas = $('tactical-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Antique military parchment / slate background
  ctx.fillStyle = '#141d16';
  ctx.fillRect(0, 0, w, h);

  // Phase Two Coordinate mapping: X [-180, 180], Z [-220, 280] (Canonical AoT Scale)
  const minX = -180, maxX = 180;
  const minZ = -220, maxZ = 280;
  const toX = (x) => ((x - minX) / (maxX - minX)) * w;
  const toY = (z) => ((z - minZ) / (maxZ - minZ)) * h;

  // Tactical Grid Lines
  ctx.strokeStyle = 'rgba(232, 196, 106, 0.08)';
  ctx.lineWidth = 1;
  for (let gx = -160; gx <= 160; gx += 40) {
    ctx.beginPath(); ctx.moveTo(toX(gx), 0); ctx.lineTo(toX(gx), h); ctx.stroke();
  }
  for (let gz = -200; gz <= 260; gz += 40) {
    ctx.beginPath(); ctx.moveTo(0, toY(gz)); ctx.lineTo(w, toY(gz)); ctx.stroke();
  }

  // Giant Pine Forests (Titan Forest zones)
  ctx.fillStyle = 'rgba(28, 70, 36, 0.45)';
  ctx.fillRect(toX(-145), toY(20), toX(-45) - toX(-145), toY(185) - toY(20));
  ctx.fillRect(toX(45), toY(20), toX(145) - toX(45), toY(185) - toY(20));
  ctx.fillStyle = 'rgba(120, 220, 140, 0.35)';
  ctx.font = 'bold 9px Oswald, sans-serif';
  ctx.fillText('GIANT PINE FOREST', toX(-95), toY(100));
  ctx.fillText('GIANT PINE FOREST', toX(95), toY(100));

  // Dauper Village & Utgard Castle
  ctx.fillStyle = 'rgba(180, 140, 80, 0.7)';
  ctx.fillRect(toX(-85), toY(45), toX(-50) - toX(-85), toY(80) - toY(45));
  ctx.fillStyle = '#ffd36a';
  ctx.font = '9px Oswald, sans-serif';
  ctx.fillText('DAUPER VILLAGE', toX(-68), toY(62));

  ctx.fillStyle = 'rgba(140, 140, 150, 0.8)';
  ctx.fillRect(toX(-115), toY(115), toX(-92) - toX(-115), toY(138) - toY(115));
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText('UTGARD CASTLE', toX(-104), toY(128));

  // The Grand Royal Expedition Highway (connecting Wall Sina z=14 to Wall Rose z=196)
  ctx.strokeStyle = 'rgba(232, 205, 140, 0.65)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(14));
  ctx.lineTo(toX(0), toY(196));
  ctx.stroke();

  // Wall Sina (Inner Living City - Center (0, -100), Radius 76)
  const sinaCenterX = toX(0), sinaCenterY = toY(-100);
  const sinaRadX = (76 / (maxX - minX)) * w;
  const sinaRadY = (76 / (maxZ - minZ)) * h;

  // Wall Sina 4 Cardinal Bastion Districts:
  // Utopia (North), Ehrmich (South), Stohess (East), Yarckel (West)
  ctx.fillStyle = 'rgba(30, 65, 45, 0.55)';
  ctx.strokeStyle = '#7dffb0';
  ctx.lineWidth = 2.5;

  // Ehrmich District (South Gate Departure)
  ctx.fillRect(toX(-28), toY(-28), toX(28) - toX(-28), toY(14) - toY(-28));
  ctx.strokeRect(toX(-28), toY(-28), toX(28) - toX(-28), toY(14) - toY(-28));
  // Utopia District (North)
  ctx.fillRect(toX(-28), toY(-214), toX(28) - toX(-28), toY(-172) - toY(-214));
  ctx.strokeRect(toX(-28), toY(-214), toX(28) - toX(-28), toY(-172) - toY(-214));
  // Stohess District (East)
  ctx.fillRect(toX(72), toY(-128), toX(114) - toX(72), toY(-72) - toY(-128));
  ctx.strokeRect(toX(72), toY(-128), toX(114) - toX(72), toY(-72) - toY(-128));
  // Yarckel District (West)
  ctx.fillRect(toX(-114), toY(-128), toX(-72) - toX(-114), toY(-72) - toY(-128));
  ctx.strokeRect(toX(-114), toY(-128), toX(-72) - toX(-114), toY(-72) - toY(-128));

  // Wall Sina Circular Sanctuary
  ctx.beginPath();
  ctx.ellipse(sinaCenterX, sinaCenterY, sinaRadX, sinaRadY, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(35, 75, 45, 0.45)';
  ctx.fill();
  ctx.strokeStyle = '#7dffb0';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Mitras Royal Palace Keep at Center
  ctx.fillStyle = '#ffd36a';
  ctx.fillRect(sinaCenterX - 7, sinaCenterY - 7, 14, 14);

  // Wall Sina Labels
  ctx.fillStyle = '#7dffb0';
  ctx.font = 'bold 11px Oswald, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WALL SINA · ROYAL CAPITAL (MITRAS)', sinaCenterX, sinaCenterY - 14);
  ctx.font = '9px Oswald, sans-serif';
  ctx.fillStyle = '#a8f0b0';
  ctx.fillText('HUMAN TERRITORY & CITIZEN RESIDENCES', sinaCenterX, sinaCenterY + 20);
  ctx.fillText('EHRMICH DEPARTURE GATE', toX(0), toY(8));

  // The Grand Expedition Field Label
  ctx.fillStyle = 'rgba(216, 207, 184, 0.55)';
  ctx.font = '10px Oswald, sans-serif';
  ctx.fillText('THE GRAND EXPEDITION FIELD (~235M SCALE)', toX(0), toY(110));

  // Wall Rose Southern Fortress (z = 196, Monolithic Line)
  ctx.strokeStyle = '#ff6a5a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(toX(-140), toY(196));
  ctx.lineTo(toX(-36), toY(196));
  ctx.moveTo(toX(36), toY(196));
  ctx.lineTo(toX(140), toY(196));
  ctx.stroke();

  // Trost District Bastion (z = 196 to 248, x = -36 to 36)
  ctx.fillStyle = 'rgba(95, 35, 25, 0.55)';
  ctx.fillRect(toX(-36), toY(196), toX(36) - toX(-36), toY(248) - toY(196));
  ctx.strokeStyle = '#ff6a5a';
  ctx.lineWidth = 3;
  ctx.strokeRect(toX(-36), toY(196), toX(36) - toX(-36), toY(248) - toY(196));

  // Smashed Trost Outer Gate Breach (z = 246, x = 0)
  ctx.strokeStyle = '#ffd36a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(toX(-12), toY(246));
  ctx.lineTo(toX(12), toY(246));
  ctx.stroke();

  // Wall Rose Labels
  ctx.fillStyle = '#ff6a5a';
  ctx.font = 'bold 11px Oswald, sans-serif';
  ctx.fillText('WALL ROSE · TROST DISTRICT', toX(0), toY(215));
  ctx.fillStyle = '#ffd36a';
  ctx.font = '10px Oswald, sans-serif';
  ctx.fillText('COLOSSAL BREACH [TITAN INVASION FRONT]', toX(0), toY(240));

  // Strategic Supply Depots
  for (const d of depots) {
    ctx.fillStyle = '#6ff3ff';
    ctx.fillRect(toX(d.x) - 3, toY(d.z) - 3, 6, 6);
  }

  // Roaming & Boss Titans
  for (const t of G.titans) {
    if (!t.alive || t === G.localTitan) continue;
    const tx = toX(t.pos.x), ty = toY(t.pos.z);
    ctx.fillStyle = t.boss ? '#ff2a2a' : '#ff5544';
    ctx.beginPath();
    ctx.arc(tx, ty, t.boss ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Active Military Steed
  const steed = getActiveHorse();
  if (steed && !steed.removed) {
    const hx = toX(steed.pos.x), hy = toY(steed.pos.z);
    ctx.fillStyle = '#c89650';
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd36a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Player Marker (Gold Arrow)
  const px = toX(P.pos.x), py = toY(P.pos.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-P.yaw);
  ctx.fillStyle = '#ffd36a';
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Real-time Distances & Coordinates
  const distSina = Math.round(P.pos.distanceTo(new THREE.Vector3(0, 86, 14)));
  const distRose = Math.round(P.pos.distanceTo(new THREE.Vector3(0, 46, 246)));
  if ($('stat-dist-sina')) $('stat-dist-sina').innerHTML = `Distance to Wall Sina: <b style="color:#7dffb0">${distSina}m</b>`;
  if ($('stat-dist-maria')) $('stat-dist-maria').innerHTML = `Distance to Wall Sina: <b style="color:#7dffb0">${distSina}m</b>`;
  if ($('stat-dist-rose')) $('stat-dist-rose').innerHTML = `Distance to Wall Rose: <b style="color:#ff6a5a">${distRose}m</b>`;
  if ($('stat-steed')) $('stat-steed').innerHTML = `Steed Status: <b style="color:#ffd36a">${P.mounted ? 'MOUNTED' : (steed && !steed.removed ? 'READY ON GROUND' : 'AWAITING DISPATCH')}</b>`;
  if ($('stat-coords')) $('stat-coords').innerHTML = `Coordinates: <b>X: ${Math.round(P.pos.x)} | Y: ${Math.round(P.pos.y)} | Z: ${Math.round(P.pos.z)}</b>`;
}

function toggleTacticalMap(force) {
  tacticalMapOpen = (force !== undefined) ? force : !tacticalMapOpen;
  const mapModal = $('tactical-map');
  if (!mapModal) return;
  if (tacticalMapOpen) {
    mapModal.classList.add('show');
    renderTacticalMap();
    if (document.exitPointerLock) document.exitPointerLock();
  } else {
    mapModal.classList.remove('show');
    if (gameState === 'play' && !TOUCH.on) requestLock();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    if (/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
    if (gameState === 'play') toggleTacticalMap();
  }
});

if ($('map-close-btn')) $('map-close-btn').onclick = () => toggleTacticalMap(false);
if ($('minimap')) $('minimap').onclick = () => { if (gameState === 'play') toggleTacticalMap(true); };
$('rdist').value = getRenderDist(); $('rdist').oninput = (e) => setRenderDist(+e.target.value);
$('invy').onchange = (e) => { invertY = e.target.checked; };
$('touchon').checked = TOUCH.on;
$('touchon').onchange = (e) => setTouch(e.target.checked);
function quitToTitle() {
  if (G.mission && G.mission.cleanup) G.mission.cleanup();
  G.mission = null; G.mode = null; clearTitans(); setBoss(null);
  G.localTitan = null; mpSetTitanMode(null);
  G.titanVictory = false; G.titanDefeated = false;
  gameState = 'title'; show('title'); Music.target = 0.15;
  document.exitPointerLock && document.exitPointerLock();
}

/* ---------------------------------------------------------------- multiplayer glue */
function titanInputs() {
  const on = gameState === 'play';
  const mv = on ? moveInput() : { x: 0, y: 0 };
  return { mv, sprint: on && (keys.ShiftLeft || keys.ShiftRight || padHeld(4) || TOUCH.sprint), jump: pressed.has('Space'), lmb: pressed.has('Mouse0'), rmb: pressed.has('Mouse2'),
    kick: pressed.has('KeyF'), guard: on && (keys.KeyC || keys.ControlLeft || padHeld(5)), q: pressed.has('KeyQ'), e: pressed.has('KeyE'), r: pressed.has('KeyR') };
}
function mpResetWorld() {
  if (G.mission && G.mission.cleanup) G.mission.cleanup(); G.mission = null;
  clearTitans(); clearFX(); fuel.clear();
  for (const b of G.projectiles) scene.remove(b.m); G.projectiles.length = 0;
  setBoss(null); markers.clear(); G.districtDamage = 0; G.hooks.blockBroken = null;
  startWorld(WORLD_SEED); setDayTime(0.14, 0.1);
}
function mpStartPlay(name) {
  Sfx.init(); Music.start();
  gameState = 'play'; show(null); document.body.classList.add('mpmode');
  if ($('game-voice')) $('game-voice').style.display = 'block';
  requestLock(); introT = 0; camDist = 5.4;
  bigMsg(name.toUpperCase(), TOUCH.on ? (G.localTitan ? 'Tear down the wall · hold GUARD to cover your nape' : P.faction === 'interior' ? 'Deflected bullets come back' : 'Only the nape kills · hold HOOK to swing') : G.localTitan ? 'Tear down the wall · LMB swipe · RMB grab · C guard nape · Q E R abilities' : P.faction === 'interior' ? 'F fires · R reloads · deflected bullets come back' : 'Only the nape kills · G brakes your fall · TAB scoreboard', '#ffd36a', 3.2);
}
function mpEndPlay() { gameState = 'mpend'; document.exitPointerLock && document.exitPointerLock(); }
function mpClearMatch() {
  document.body.classList.remove('mpmode', 'titanmode', 'gunner'); showPilotHud(false);
  if ($('game-voice')) $('game-voice').style.display = 'none';
  clearTitans(); fuel.clear(); G.localTitan = null; P.hidden = false; P.id = 'me'; setBoard(false);
  for (const b of G.projectiles) scene.remove(b.m); G.projectiles.length = 0;
  setLocalChar(null);
  gameState = 'menu';
}
function mpSetTitanMode(t) {
  document.body.classList.toggle('titanmode', !!t); showPilotHud(!!t);
  if (t) { detachAll(); P.vel.set(0, 0, 0); for (const a of P.anchors) { a.state = 'idle'; a.cable.hide(); } }
}
function mpShowScreen(id) {
  if (id === 'title') { gameState = 'title'; show('title'); return; }
  gameState = 'menu'; show(id);
  document.exitPointerLock && document.exitPointerLock();
}
initMP({
  showScreen: mpShowScreen, resetWorld: mpResetWorld, startPlay: mpStartPlay, endPlay: mpEndPlay, clearMatch: mpClearMatch,
  setLocalChar, setTitanMode: mpSetTitanMode,
  resetPlayer: (sp) => { resetPlayer({ x: sp.x - 0.5, y: sp.y, z: sp.z - 0.5, yaw: sp.yaw ?? Math.PI }); P.hp = P.maxHp || 100; P.ammo = 2; P.reloadT = 0; P.fireCD = 0; camTarget.copy(P.pos); },
  hitFeedback: (t, part, res, speed, spin, air, point, wear) => hitFeedback(t, part, res, speed, spin, air, point, wear),
  confirmHit: (ev) => confirmHit(ev),
  crushedBy: (t, kind, dir) => crushedBy(t, kind, dir),
  applyFuel: () => applyFuel(), bigMsg, popup, toast, pilotDenied,
  gameState: () => gameState,
  releaseInput: () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; pressed.clear(); },
  relock: () => { if (!locked) requestLock(); }
});
initTouch({
  press: onPress,
  key: (code, on) => { if (on && !keys[code]) onPress(code); keys[code] = on; },
  hook: (i, on) => { if (on) { mouse[i ? 'r' : 'l'] = true; onPress(i ? 'Mouse2' : 'Mouse0'); } else mouse[i ? 'r' : 'l'] = false; },
  look: (dx, dy) => {
    if (gameState !== 'play') return;
    const slow = !G.localTitan && AIM.titan ? (AIM.name === 'nape' ? 0.6 : 0.85) : 1;   // aim slows over a titan
    P.yaw -= dx * sens * slow; P.pitch -= dy * sens * slow * (invertY ? -1 : 1);
    P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch));
  },
  pause: () => pauseGame(),
  map: () => toggleTacticalMap(),
  board: () => { if (MP.active) setBoard(!MP.boardOpen); },
  chat: () => { if (G.chatOpen) G.chatOpen(); },
  grabbed: () => !!P.grabbedBy,
  slots: () => pilotSlots(),
  toast: (t, d) => toast(t, d),
  changed: () => { lastHud = {}; $('touchon').checked = TOUCH.on; if (!TOUCH.on && gameState === 'play') toast('Click to aim', 1.6); },
  state: () => {
    const t = G.localTitan;
    const steed = getActiveHorse();
    return {
      play: gameState === 'play',
      titan: !!t,
      mp: !!MP.active && G.mode === 'mp',
      chat: !!(G.chatAvail && G.chatAvail()),
      gunner: P.faction === 'interior',
      use: !!(G.mission && G.mission.interact) && G.mode !== 'mp',
      horse: P.mounted || (steed && steed.isPlayerNear(P, 6.0)),
      mounted: P.mounted,
      strike: NS.state === 'strike',
      hooked: P.anchors.some(a => a.state === 'attached'),
      anchors: [P.anchors[0].state === 'attached', P.anchors[1].state === 'attached'],
      targets: [TAIM[0].valid, TAIM[1].valid],
      dull: P.sharp < 25 && P.spare > 0
    };
  }
});
// phones: a lighter start (the dynamic scaler still adjusts), a shorter view, and pause single player when the app is backgrounded
if (TOUCH.on) {
  if (!params.has('rd')) { setRenderDist(6); $('rdist').value = 6; }
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode !== 'mp') pauseGame(); });
}
$('btn-mp').onclick = () => { Sfx.init(); Sfx.ui(); menuMusic(); mpShowScreen('mpmenu'); };
if (params.has('join')) mpShowScreen('mpmenu');

/* ---------------------------------------------------------------- main loop */
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, dynScale = 1, dynT = 0;
let showDebug = false;
const debugEl = $('debug');
function frame(now) {
  requestAnimationFrame(frame);
  try {
    const rawDt = Math.min(0.05, (now - last) / 1000); last = now;
  fpsAcc += rawDt; fpsN++;
  if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  let scale = 1;
  if (hitStop > 0) { hitStop -= rawDt; scale = 0.05; }
  else if (slowT > 0) { slowT -= rawDt; const f = Math.max(0, slowT / slowDur); scale = 1 - 0.75 * Math.min(1, f * 1.6); }
  const dt = rawDt * scale;
  pollPad(rawDt);
  touchFrame();
  const mpLive = G.mode === 'mp' && MP.active;
  if (gameState === 'play' || gameState === 'done' || (mpLive && (gameState === 'pause' || gameState === 'mpend'))) {
    G.time += dt; missionT += dt;
    // global keys
    if ((pressed.has('F5') || pressed.has('KeyV')) && !G.localTitan) { P.fp = !P.fp; toast(P.fp ? 'First-person camera' : 'Third-person camera', 1.2); }
    if (pressed.has('F3')) { showDebug = !showDebug; debugEl.style.display = showDebug ? 'block' : 'none'; }
    if (G.localTitan) {
      if (pressed.has('KeyT')) {
        ejectFromTitan();
      }
    } else {
      if (pressed.has('KeyH')) {
        const steed = getActiveHorse();
        if (P.mounted && steed) {
          steed.dismount();
        } else if (steed && steed.isPlayerNear(P, 6.0)) {
          steed.mount();
        } else {
          whistleHorse(P);
        }
      }
      if (pressed.has('KeyE')) {
        if (G.mission && G.mission.interact) {
          G.mission.interact();
        }
      }
      if (pressed.has('KeyT') && P.alive) transformIntoTitan();
    }
    if (params.has('debug') && pressed.has('KeyK')) { const t = G.titans.find(q => q.alive); if (t) resolveHit(t, 'nape', t.m.neck, 30, false); }
    if (params.has('debug') && pressed.has('KeyX')) damagePlayer(999, V(), null);
    if (params.has('debug') && pressed.has('KeyJ')) { const t = G.titans.find(q => q.alive && q.boss); if (t) { P.dbgK = !P.dbgK; resolveHit(t, P.dbgK ? 'ankleL' : 'ankleR', P.dbgK ? t.m.knL : t.m.knR, 30, false); } }
    if (G.localTitan) {
      if (G.localTitan.alive) {
        pilotInput(G.localTitan, dt, titanInputs(), P);
        P.pos.copy(G.localTitan.pos);
      }
      aimMark.visible = false;
    }
    else { updatePlayer(dt); computeAim(); if (TOUCH.on) { taimT -= rawDt; if (taimT <= 0) { taimT = 0.05; touchAim(); } } updateAimMark(); updateAnchors(dt); }
    const curSteed = getActiveHorse();
    const hpPrompt = $('horse-prompt');
    if (hpPrompt) {
      if (P.mounted) {
        hpPrompt.style.display = 'block';
        hpPrompt.textContent = '[H] DISMOUNT · [SPACE] LEAP · [ODM] FLY';
      } else if (curSteed && curSteed.isPlayerNear(P, 6.0)) {
        hpPrompt.style.display = 'block';
        hpPrompt.textContent = '[H] MOUNT HORSE';
      } else {
        hpPrompt.style.display = 'none';
      }
    }
    if (curSteed) {
      curSteed.update(dt, P, {
        mv: moveInput(),
        sprint: keys.ShiftLeft || keys.ShiftRight,
        jump: pressed.has('Space'),
        slash: pressed.has('KeyF')
      });
    }
    for (const t of G.titans) t.update(dt);
    for (let i = G.titans.length - 1; i >= 0; i--) if (G.titans[i].removed) G.titans.splice(i, 1);
    updateProjectiles(dt);
    updateDepots(dt);
    updateFuel(dt);
    updateNapeSense(dt);
    titanFeel(rawDt);
    if (G.mission && gameState === 'play' && G.mode !== 'mp') G.mission.update(dt, G.api);
    if (G.mode === 'titan_arena' && gameState === 'play') {
      const enemiesLeft = G.titans.filter(t => t.alive && t !== G.localTitan && t.team !== 'player_shifter').length;
      setProgress(`HOSTILE TITANS: ${enemiesLeft}`);
      if (enemiesLeft === 0 && G.localTitan && G.localTitan.alive && !G.titanVictory) {
        G.titanVictory = true;
        bigMsg('VICTORY', 'ALL TITANS SLAIN · DISTRICT SECURED', '#ffd36a', 5);
        Sfx.fanfare();
        setTimeout(() => {
          completeMission();
        }, 4000);
      }
      if (G.localTitan && !G.localTitan.alive && !G.titanDefeated) {
        G.titanDefeated = true;
        bigMsg('TITAN SLAIN', 'YOUR NAPE WAS DESTROYED', '#ff6a55', 3.5);
        setTimeout(() => {
          $('deathtitle').textContent = 'YOUR TITAN HAS FALLEN';
          $('deathreason').textContent = 'The district was overrun by hostile Titans.';
          gameState = 'dead';
          show('death');
          document.exitPointerLock && document.exitPointerLock();
        }, 2500);
      }
    }
    if ($('titan-ready')) $('titan-ready').classList.toggle('show', !G.localTitan && P.alive && gameState === 'play');
    if (mpLive) mpUpdate(dt, rawDt);
    // music intensity from nearby threats
    let threat = 0;
    const me = G.localTitan ? G.localTitan.pos : P.pos;
    for (const t of G.titans) { if (!t.alive || t === G.localTitan) continue; const d = t.pos.distanceTo(me); threat = Math.max(threat, (t.alertness > 0.3 ? 0.55 : 0.3) * Math.max(0, 1 - d / 120) + (d < 40 ? 0.35 : 0)); }
    if (bossRef && bossRef.alive) threat = Math.max(threat, 0.95);
    if (G.localTitan) for (const sc of G.scouts) if (sc.alive && sc.pos.distanceTo(me) < 80) threat = Math.max(threat, 0.75);
    Music.target = P.alive || G.localTitan ? Math.max(0.18, Math.min(1, threat)) : 0.1;
  }
  pressed.clear();
  updateCamera(rawDt);
  if ((gameState === 'play' || gameState === 'done' || gameState === 'dead' || gameState === 'pause' || gameState === 'mpend') && !G.localTitan) updateHero(dt);
  else if (G.localTitan) { hero.root.visible = false; fpRig.visible = false; heroShadow.visible = false; }
  updateChunks(gameState === 'loading' || gameState === 'brief' ? 14 : 5);
  updateSky(dt);
  updateLights();
  fxUniforms.uFogColor.value.copy(scene.fog.color); fxUniforms.uFogNear.value = scene.fog.near; fxUniforms.uFogFar.value = scene.fog.far;
  updateFX(dt, 0.55 + 0.45 * getLight().dayF);
  updateSpikes(dt);
  // fog
  const fogFar = getRenderDist() * 16;
  scene.fog.color.copy(fogCol); scene.fog.near = fogFar * 0.5; scene.fog.far = fogFar * 0.97;
  renderer.setClearColor(scene.fog.color);
  waterUniforms.uTime.value = G.time; waterTex.offset.set(G.time * 0.03, G.time * 0.05);
  // speed lines & flash
  const speed = gameState === 'play' && !G.localTitan ? P.vel.length() : 0;
  flashA = Math.max(0, flashA - rawDt * 2.5);
  const sk = gameState === 'play' && !G.localTitan ? (P.swingT >= 0 ? { k: P.swingT / 0.3, side: P.slashSide ? 1 : -1, power: Math.min(1, speed / 40), fp: P.fp } : P.cutSpinT >= 0 ? { k: P.cutSpinT / 0.42, side: P.slashSide ? 1 : -1, power: 1, fp: P.fp } : null) : null;
  drawSpeedLines(Math.max(0, Math.min(1, (speed - 20) / 35)) * (P.fp ? 1 : 0.85), flashA, sk);
  if (gameState === 'play' || gameState === 'done' || (mpLive && gameState === 'mpend')) { updateHUD(rawDt); drawMinimap(); if (G.localTitan) pilotHud(G.localTitan, rawDt); }
  // audio
  let steamAmt = 0;
  for (const t of G.titans) if (t.state === 'dissolve' && t.pos.distanceTo(P.pos) < 60) steamAmt += 1;
  const isPlaying = gameState === 'play' && P.alive;
  Sfx.update(rawDt, {
    speed: isPlaying ? speed : 0,
    boost: isPlaying && (P.boosting || (P.braking && P.vel.length() > 3)),
    reel: isPlaying ? (P.reeling ? 1 : (attachedAnchors().length && P.gas > 0 ? 0.15 : 0)) : 0,
    alt: P.pos.y - 46,
    steam: steamAmt,
    muffle: gameState === 'pause' || gameState === 'dead'
  });
  if (gameState === 'loading') {
    const p = meshedAround(3);
    $('loadpct').textContent = Math.round(p * 100) + '%';
  }
  if (gameState === 'brief') { const p = meshedAround(3); $('beginbtn').textContent = p >= 0.99 ? 'Begin Mission' : `Preparing district… ${Math.round(p * 100)}%`; }
  // dynamic resolution to hold 60fps
  dynT += rawDt;
  if (dynT > 2) { dynT = 0; const pr = renderer.getPixelRatio(), lo = TOUCH.on ? 0.65 : 0.75, hi = Math.min(window.devicePixelRatio, TOUCH.on ? 1.15 : 1.25); if (fps < 50 && pr > lo) renderer.setPixelRatio(Math.max(lo, pr - 0.15)); else if (fps > 58 && pr < hi) renderer.setPixelRatio(Math.min(pr + 0.1, hi)); }
  if (showDebug && MP.active && MP.net) {
    MP.net.measure = true;
    const N = MP.net.stats, now = performance.now();
    if (!MP.netMon || now - MP.netMon.t > 1000) { MP.netMon = { t: now, up: ((N.bytesUp - (MP.netMon ? MP.netMon.bu : 0)) / 1024).toFixed(1), down: ((N.bytesDown - (MP.netMon ? MP.netMon.bd : 0)) / 1024).toFixed(1), bu: N.bytesUp, bd: N.bytesDown }; }
    debugEl.textContent = `${fps} fps  pr ${renderer.getPixelRatio().toFixed(2)}  calls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k\n` +
      `net ${MP.net.isHost ? 'HOST' : 'client'}  up ${MP.netMon.up} KB/s  down ${MP.netMon.down} KB/s  ping ${MP.net.isHost ? '-' : MP.ping + ' ms'}  peers ${MP.net.peers.size}\n` +
      `titans ${G.titans.length}  scouts ${G.scouts.length}  projectiles ${G.projectiles.length}  fuel ${G.fuel.list.length}  edits ${MP.editLog.size}`;
  } else if (showDebug) debugEl.textContent = `${fps} fps  pr ${renderer.getPixelRatio().toFixed(2)}  calls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k  chunks ${countMeshed()}\npos ${P.pos.x.toFixed(1)} ${P.pos.y.toFixed(1)} ${P.pos.z.toFixed(1)}  v ${speed.toFixed(1)}  titans ${G.titans.length}\n` + G.titans.map(t => `${t.type} ${t.state} al${t.alertness.toFixed(1)} (${t.pos.x.toFixed(0)},${t.pos.y.toFixed(0)},${t.pos.z.toFixed(0)}) route ${t.route ? t.route.length : '-'} legs ${t.dis.legs.toFixed(1)}`).join('\n');
  renderer.render(scene, camera);
  } catch (err) {
    console.error('Frame loop error caught:', err);
  }
}

/* ---------------------------------------------------------------- boot */
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH.on ? 1.15 : 1.25));
setupWorkers();
startWorld(WORLD_SEED);
setupDepots();
buildMapImage();
setDayTime(0.1, 0.15);
show('title');
window.__game = { TOUCH, TAIM, setBlock, getBlock, G, P, loadMission, beginMission, spawnTitan, MISSIONS, fireAnchor, releaseAnchor, AIM, resolveHit, MP, startTitanVsTitan, transformIntoTitan, ejectFromTitan, SHIFTER_CARDS, get state() { return gameState; } };
if (params.has('mission')) {
  const i = +params.get('mission');
  loadMission(i);
  if (params.has('auto')) {
    const iv = setInterval(() => { if (meshedAround(3) >= 0.99) { clearInterval(iv); beginMission(); } }, 200);
  }
}
requestAnimationFrame(frame);

/* =========================================================================
   Playing as a titan: over-the-shoulder camera, crosshair aiming with a little
   magnetism toward scouts, input mapping, and the titan HUD (abilities, stamina,
   nape integrity, limbs, and Titan Sense: scouts you can hear and scouts behind you).
   ========================================================================= */
import { THREE, camera, view } from './engine.js';
import { G } from './state.js';
import { Sfx } from './audio.js';
import { kitInfo } from './shifters.js';
import { rayVoxel } from './bots.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const $ = (id) => document.getElementById(id);
let built = false, H = {};
const camPos = new THREE.Vector3(); let camDist = 20, fov = 66;
export const PILOT = { aim: new THREE.Vector3(), aimScout: null, senseT: 0, behind: null };

function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.append(e); return e; }
function buildHud() {
  built = true;
  const root = H.root = el('div', '', $('hud')); root.id = 'thud';
  H.xh = el('div', 'txh', root, '<div class="r"></div><div class="d"></div>');
  H.bar = el('div', 'tbar', root);
  H.slots = {};
  for (const k of ['LMB', 'RMB', 'Q', 'E', 'R']) {
    const s = el('div', 'tslot', H.bar, `<div class="tk">${k}</div><div class="tn"></div><div class="tcd"></div>`);
    H.slots[k] = { s, n: s.querySelector('.tn'), cd: s.querySelector('.tcd') };
  }
  H.side = el('div', 'tside', root);
  H.name = el('div', 'tname', H.side);
  H.hp = el('div', 'thp', H.side, '<div class="lab">HEALTH <span class="hv"></span></div><div class="hbar"><div class="hlag"></div><div class="hfill"></div><div class="segs"></div></div><div class="regen"></div>');
  H.nape = el('div', 'tnape', H.side);
  H.limbs = el('div', 'tlimbs', H.side);
  H.stam = el('div', 'tstam', H.side, '<div class="lab">STAMINA</div><div class="bar"><div></div></div>');
  H.keys = el('div', 'tkeys', H.side, '<b>SHIFT</b> sprint &nbsp; <b>C</b> guard nape &nbsp; <b>SPACE</b> jump');
  H.hold = el('div', 'thold', root, 'LMB <b>DEVOUR</b> &nbsp;·&nbsp; RMB <b>THROW</b>');
  H.behind = el('div', 'tbehind', root, '<div class="arr"></div><div class="tx">BEHIND YOU</div>');
  H.sense = el('div', 'tsense', root);
  H.marks = [];
  H.deny = el('div', 'tdeny', root);
}
export function pilotSlots() { return built ? H.slots : null; }
export function showPilotHud(on) {
  if (!built) buildHud();
  H.root.style.display = on ? 'block' : 'none';
  document.body.classList.toggle('titanmode', on);
}

/* ---------------------------------------------------------------- input → titan */
export function pilotInput(t, dt, I, P) {
  // camera angles live on P.yaw / P.pitch (mouse look is shared with the scout)
  const cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
  const fwd = _a.set(-Math.sin(P.yaw) * cp, sp, -Math.cos(P.yaw) * cp);
  // aim: voxels, then scouts near the ray (magnetism grows with distance)
  const o = _b.copy(camera.position);
  const hit = rayVoxel(o, fwd, 240);
  let tAim = hit ? hit.t : 160, best = null;
  for (const s of G.scouts) {
    if (!s.alive || s.hidden || (G.hostile && !G.hostile(t, s))) continue;
    const c = _c.copy(s.pos); c.y += 1;
    const along = c.clone().sub(o).dot(fwd); if (along < 2 || along > tAim + 2) continue;
    const off = c.clone().sub(o).addScaledVector(fwd, -along).length();
    if (off < 1.6 + along * 0.035 && (!best || along < best.along)) best = { s, along };
  }
  if (best) { PILOT.aim.copy(best.s.pos); PILOT.aim.y += 1; PILOT.aimScout = best.s; }
  else { PILOT.aim.copy(o).addScaledVector(fwd, tAim); PILOT.aimScout = null; }
  t.input = { mv: I.mv, camYaw: P.yaw, sprint: I.sprint, jump: I.jump, lmb: I.lmb, rmb: I.rmb, guard: I.guard, q: I.q, e: I.e, r: I.r, aim: PILOT.aim.clone() };
  t.lookPt = PILOT.aim.clone();
}

/* ---------------------------------------------------------------- camera */
export function pilotCamera(t, dt, P, shake) {
  const cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
  const fwd = _a.set(-Math.sin(P.yaw) * cp, sp, -Math.cos(P.yaw) * cp);
  const right = _b.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const pivot = _c.copy(t.pos); pivot.y += t.h * 0.86 + 1.2; pivot.addScaledVector(right, t.h * 0.22 + 1);
  const want = t.h * 0.95 + 8;
  const back = fwd.clone().negate();
  const hit = rayVoxel(pivot, back, want);
  const d = hit ? Math.max(3, hit.t - 0.5) : want;
  camDist += (d - camDist) * (d < camDist ? 1 : 1 - Math.exp(-dt * 4));
  camPos.copy(pivot).addScaledVector(back, camDist);
  camera.position.copy(camPos);
  camera.position.x += shake.x * 0.6; camera.position.y += shake.y * 0.6;
  camera.rotation.set(P.pitch + shake.y * 0.04, P.yaw + shake.x * 0.04, shake.roll, 'YXZ');
  const sprint = t.input && t.input.sprint && (t.input.mv.x || t.input.mv.y);
  fov += ((sprint ? 74 : 66) - fov) * (1 - Math.exp(-dt * 4));
  camera.fov = fov; camera.updateProjectionMatrix();
  view.x = t.pos.x; view.z = t.pos.z;
}

/* ---------------------------------------------------------------- HUD */
let lastKey = {};
const setOnce = (k, v, fn) => { if (lastKey[k] !== v) { lastKey[k] = v; fn(v); } };
export function pilotHud(t, dt) {
  if (!built) buildHud();
  const K = t.kit, D = kitInfo(t.type);
  setOnce('name', t.type, () => { H.name.textContent = t.T.label.toUpperCase(); });
  // abilities
  const busy = !t.alive || !['walk', 'chase', 'recover'].includes(t.state);
  const rmbName = D.rmb === 'bite' ? 'Bite' : 'Grab';
  for (const k of ['LMB', 'RMB', 'Q', 'E', 'R']) {
    const S = H.slots[k];
    const name = k === 'LMB' ? (t.state === 'holding' ? 'Devour' : 'Swipe') : k === 'RMB' ? (t.state === 'holding' ? 'Throw' : rmbName) : D[k].name;
    setOnce('n' + k, name, v => S.n.textContent = v);
    let frac = 0, txt = '';
    if (K && K.cds[k] !== undefined) { const cd = D[k].cd; frac = K.cds[k] / cd; txt = K.cds[k] > 0 ? Math.ceil(K.cds[k]) : ''; const g = K.gate(k); if (g && !(K.cds[k] > 0)) { frac = 1; txt = k === 'R' && t.type === 'colossal' ? '🔒' : ''; } }
    S.cd.style.height = (Math.min(1, frac) * 100).toFixed(0) + '%';
    setOnce('cd' + k, txt + '|' + (busy ? 1 : 0), () => { S.cd.textContent = txt; S.s.classList.toggle('busy', busy); });
  }
  // stamina, nape, limbs
  H.stam.querySelector('.bar > div').style.width = (K ? K.stamina : 100).toFixed(0) + '%';
  // health: each segment is one deep nape cut; blade nicks chip it; it regrows if you avoid damage
  const hpPct = Math.max(0, t.hp / t.hpMax * 100);
  H.hp.querySelector('.hfill').style.width = hpPct.toFixed(1) + '%';
  H.hp.querySelector('.hlag').style.width = hpPct.toFixed(1) + '%';
  setOnce('hpsegs', t.napeMax, () => { H.hp.querySelector('.segs').innerHTML = Array.from({ length: t.napeMax - 1 }, (_, i) => `<div class="seg" style="left:${((i + 1) / t.napeMax * 100).toFixed(1)}%"></div>`).join(''); });
  setOnce('hpv', Math.ceil(t.hp), v => { H.hp.querySelector('.hv').textContent = `${Math.max(0, v)} / ${t.hpMax}`; H.hp.classList.toggle('low', t.hp <= 100); });
  setOnce('regen', t.regenning ? 1 : 0, v => { H.hp.querySelector('.regen').textContent = v ? 'REGENERATING' : ''; });
  setOnce('nape', `${t.napeGuard > 0}|${t.hardened > 0}`, () => {
    H.nape.innerHTML = t.hardened > 0 ? '<span class="tag hard">HARDENED</span>' : t.napeGuard > 0 ? '<span class="tag guard">NAPE GUARDED</span>' : '';
  });
  const limb = (v, n) => v > 0 ? `<span class="limb cut">${n} ${Math.ceil(v)}s</span>` : `<span class="limb">${n}</span>`;
  setOnce('limbs', `${Math.ceil(t.dis.armL)}|${Math.ceil(t.dis.armR)}|${Math.ceil(t.dis.legs)}`, () => { H.limbs.innerHTML = limb(t.dis.armL, 'L ARM') + limb(t.dis.armR, 'R ARM') + limb(t.dis.legs, 'LEGS'); });
  H.hold.style.display = t.state === 'holding' ? 'block' : 'none';
  // crosshair
  H.xh.className = 'txh' + (PILOT.aimScout ? ' lock' : '');
  // Titan Sense: scouts you can hear (gas, reel) and anyone behind you
  let behind = null, bd = 1e9;
  const fw = t.fwd, used = new Set();
  const w = window.innerWidth, h = window.innerHeight;
  let mi = 0;
  for (const s of G.scouts) {
    if (!s.alive || s.hidden || (G.hostile && !G.hostile(t, s))) continue;
    const d = s.pos.distanceTo(t.pos);
    const rel = _a.subVectors(s.pos, t.pos).setY(0); const rl = rel.length() || 1;
    if (d < 24 && rel.dot(fw) / rl < -0.25 && d < bd) { bd = d; behind = s; }
    const noisy = (s.boosting || s.reeling || (s.noiseT && G.time - s.noiseT < 1.5)) && d < 110;
    if (!noisy && d > 34) continue;
    // screen marker
    _b.copy(s.pos); _b.y += 1.2; _b.project(camera);
    if (_b.z > 1) continue;
    const x = (_b.x * 0.5 + 0.5) * w, y = (-_b.y * 0.5 + 0.5) * h;
    if (x < 0 || x > w || y < 0 || y > h) continue;
    let m = H.marks[mi]; if (!m) { m = H.marks[mi] = el('div', 'tmark', H.sense); }
    m.style.display = 'block'; m.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    m.classList.toggle('loud', noisy); mi++; used.add(s);
  }
  for (; mi < H.marks.length; mi++) H.marks[mi].style.display = 'none';
  PILOT.behind = behind;
  if (behind) {
    const rel = _a.subVectors(behind.pos, t.pos); const ang = Math.atan2(rel.x, rel.z) - t.yaw;
    H.behind.style.display = 'block';
    H.behind.querySelector('.arr').style.transform = `rotate(${(Math.PI - ang).toFixed(2)}rad)`;
    PILOT.senseT -= dt; if (PILOT.senseT <= 0) { PILOT.senseT = Math.max(0.18, bd / 40); Sfx.napeTick(1 - bd / 24); }
  } else H.behind.style.display = 'none';
}
export function pilotDenied(msg) {
  if (!built) return;
  H.deny.textContent = msg; H.deny.classList.remove('show'); void H.deny.offsetWidth; H.deny.classList.add('show');
  Sfx.dry();
}

/* =========================================================================
   Touch controls (phones and tablets, portrait or landscape).
   Left thumb: a floating move stick that appears where the thumb lands. Right thumb: drag anywhere to
   look, or hold a button and keep dragging (hooks, gas and attacks aim while held). Scouts get two
   hooks that pick their own anchor, gas, attack and blades; titans get swipe, grab, guard, jump and
   their three abilities. On by default when the main pointer is a finger; a keyboard or mouse in play
   turns it off and the next touch turns it back on (?touch=1 / ?touch=0 force it either way).
   ========================================================================= */
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const forced = q.has('touch') ? q.get('touch') !== '0' : null;
const coarse = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

export const TOUCH = {
  on: forced !== null ? forced : coarse,
  mv: { x: 0, y: 0 }, sprint: false, gas: false, used: false,
};
const STICK_TRAVEL = 50, DEAD = 0.12, LOOK = 0.0052, LOOK_START = 6;   // look: ~0.3° per CSS px before sensitivity

let api = null, layer = null, stick = null, knob = null;
const ptrs = new Map();                 // pointerId -> { kind: 'stick'|'look'|'btn', ... }
const btns = {};                        // act -> element

// what each button does: hold buttons stay down while the finger is on them; 'look' ones also aim while held
const ACTS = {
  hookL: { label: 'HOOK', sub: 'L', hold: true, look: true, set: 'scout', down: () => api.hook(0, true), up: () => api.hook(0, false) },
  hookR: { label: 'HOOK', sub: 'R', hold: true, look: true, set: 'scout', down: () => api.hook(1, true), up: () => api.hook(1, false) },
  gas: { label: 'GAS', hold: true, look: true, set: 'scout', down: () => { TOUCH.gas = true; api.key('Space', true); }, up: () => { TOUCH.gas = false; api.key('Space', false); } },
  attack: { label: 'SLASH', look: true, set: 'scout', down: () => api.press('KeyF') },
  swap: { label: 'BLADES', small: true, set: 'scout', down: () => api.press('KeyR') },
  use: { label: 'USE', small: true, set: 'scout', down: () => api.press('KeyE') },
  horse: { label: 'HORSE', sub: 'MOUNT', small: true, set: 'scout', down: () => api.press('KeyH') },
  titan: { label: 'TITAN', sub: 'SHIFT', small: true, down: () => api.press('KeyT') },
  brake: { label: 'BRAKE', small: true, set: 'scout', hold: true, down: () => api.key('KeyG', true), up: () => api.key('KeyG', false) },
  swipe: { label: 'SWIPE', look: true, set: 'titan', down: () => api.press('Mouse0') },
  grab: { label: 'GRAB', look: true, set: 'titan', down: () => api.press('Mouse2') },
  guard: { label: 'GUARD', sub: 'NAPE', hold: true, set: 'titan', down: () => api.key('KeyC', true), up: () => api.key('KeyC', false) },
  jump: { label: 'JUMP', small: true, set: 'titan', down: () => api.press('Space') },
  q: { label: 'Q', ab: true, set: 'titan', down: () => api.press('KeyQ') },
  e: { label: 'E', ab: true, set: 'titan', down: () => api.press('KeyE') },
  r: { label: 'R', ab: true, set: 'titan', down: () => api.press('KeyR') },
  map: { label: 'MAP', top: true, down: () => api.map ? api.map() : api.press('KeyM') },
  menu: { label: 'II', top: true, down: () => api.pause() },
  board: { label: 'SCORES', top: true, mp: true, down: () => api.board() },
  chat: { label: 'CHAT', top: true, mp: true, click: true, down: () => api.chat() },
  view: { label: 'VIEW', top: true, set: 'scout', down: () => api.press('KeyV') },
};

function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.append(e); return e; }

function build() {
  layer = el('div', '', document.body); layer.id = 'touch';
  stick = el('div', 'tstick', layer); knob = el('div', 'tknob', stick);
  const top = el('div', 'ttop', layer);
  for (const [k, A] of Object.entries(ACTS)) {
    const b = el('div', `tb tb-${k}${A.small ? ' small' : ''}${A.ab ? ' ab' : ''}${A.top ? ' top' : ''}${A.set ? ' s-' + A.set : ''}${A.mp ? ' s-mp' : ''}`, A.top ? top : layer,
      `<span class="tbl">${A.label}</span>${A.sub ? `<span class="tbs">${A.sub}</span>` : ''}${A.ab ? '<span class="tbn"></span><span class="tbcd"></span>' : ''}`);
    b.dataset.act = k; btns[k] = b;
  }
  const hint = el('div', '', layer); hint.id = 'thint';
  hint.innerHTML = `<div class="th-card"><div class="th-h">TOUCH CONTROLS</div>
    <div class="th-r"><b>Left thumb</b> move · push all the way to sprint</div>
    <div class="th-r"><b>Right thumb</b> drag anywhere to look</div>
    <div class="th-r"><b>HOOK L / R</b> hold to swing. They aim for you, and you can keep dragging to steer</div>
    <div class="th-r"><b>Stick forward while hooked</b> reels you in · <b>GAS</b> flies</div>
    <div class="th-r"><b>SLASH</b> when the gold ring says STRIKE. Only the nape kills</div>
    <div class="th-r th-t"><b>Titans:</b> SWIPE, GRAB, hold GUARD to cover your nape, Q E R abilities</div>
    <div class="th-go">Tap to play</div></div>`;
  hint.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); hideHint(); });
  layer.addEventListener('pointerdown', onDown, { passive: false });
  layer.addEventListener('pointermove', onMove, { passive: false });
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp);
  layer.addEventListener('lostpointercapture', onUp);
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  // the chat button must focus the text box inside a real click, or phones won't raise the keyboard
  btns.chat.addEventListener('click', () => { if (TOUCH.on) api.chat(); });
  idleStick(); window.addEventListener('resize', () => { if (!stick.classList.contains('on')) idleStick(); });
}
// a faint stick where the left thumb rests, so new players see where to put it
function idleStick() { stick.classList.add('idle'); knob.style.transform = ''; stick.style.transform = `translate(${36}px, ${innerHeight - 120 - 44 - (innerHeight > innerWidth ? 30 : 0)}px)`; }

let hintShown = false;
function showHint() {
  let seen = false; try { seen = localStorage.getItem('ts_touch_hint') === '1'; } catch (e) { /* ignore */ }
  if (seen || hintShown) return;
  hintShown = true; $('thint').classList.add('show');
}
function hideHint() { $('thint').classList.remove('show'); try { localStorage.setItem('ts_touch_hint', '1'); } catch (e) { /* ignore */ } }

function stickZone(x, y) {
  const w = innerWidth, h = innerHeight;
  return x < w * 0.5 && y > h * (h > w ? 0.42 : 0.3);
}
function onDown(e) {
  if (e.pointerType === 'mouse' && forced === null) return;
  e.preventDefault();
  TOUCH.used = true;
  try { layer.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
  // grabbed: every tap is a cut at the fist
  if (api.grabbed()) { api.press('KeyF'); ptrs.set(e.pointerId, { kind: 'none' }); return; }
  const b = e.target.closest && e.target.closest('.tb');
  if (b && b.offsetParent !== null) {
    const A = ACTS[b.dataset.act];
    if (A.click) { ptrs.set(e.pointerId, { kind: 'none' }); return; }
    b.classList.add('down');
    if (A.down) A.down();
    ptrs.set(e.pointerId, { kind: 'btn', b, A, x: e.clientX, y: e.clientY, moved: 0 });
    if (navigator.vibrate && !A.top) try { navigator.vibrate(8); } catch (er) { /* ignore */ }
    return;
  }
  const busy = [...ptrs.values()].some(p => p.kind === 'stick');
  if (!busy && stickZone(e.clientX, e.clientY)) {
    const r = 60, x = Math.max(r + 8, Math.min(innerWidth - r - 8, e.clientX)), y = Math.max(r + 8, Math.min(innerHeight - r - 8, e.clientY));
    ptrs.set(e.pointerId, { kind: 'stick', cx: x, cy: y });
    stick.style.transform = `translate(${x - r}px, ${y - r}px)`; stick.classList.remove('idle'); stick.classList.add('on'); knob.style.transform = '';
    setStick(e.clientX - x, e.clientY - y);
    return;
  }
  ptrs.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0 });
}
function setStick(dx, dy) {
  const l = Math.hypot(dx, dy), k = l > STICK_TRAVEL ? STICK_TRAVEL / l : 1;
  knob.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
  let m = Math.min(1, l / STICK_TRAVEL);
  m = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
  TOUCH.mv.x = l ? dx / l * m : 0; TOUCH.mv.y = l ? -dy / l * m : 0;
  TOUCH.sprint = m > 0.92 && TOUCH.mv.y > 0.6;
}
function lookBy(p, e) {
  const dx = e.clientX - p.x, dy = e.clientY - p.y, dt = Math.max(1, e.timeStamp - (p.t || e.timeStamp - 16));
  p.x = e.clientX; p.y = e.clientY; p.t = e.timeStamp;
  p.moved += Math.abs(dx) + Math.abs(dy);
  if (p.moved < LOOK_START) return;
  // light acceleration: slow drags aim precisely, fast flicks turn around
  const v = Math.hypot(dx, dy) / dt;
  const acc = 1 + Math.max(0, Math.min(1.1, (v - 0.5) * 0.55));
  api.look(dx * LOOK * acc, dy * LOOK * acc);
}
function onMove(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  const list = evs && evs.length ? evs : [e];
  if (p.kind === 'stick') {
    let dx = e.clientX - p.cx, dy = e.clientY - p.cy;
    const l = Math.hypot(dx, dy), lim = STICK_TRAVEL + 18;
    if (l > lim) {   // the base follows a thumb that drifts past the rim
      p.cx += dx / l * (l - lim); p.cy += dy / l * (l - lim);
      stick.style.transform = `translate(${p.cx - 60}px, ${p.cy - 60}px)`;
      dx = e.clientX - p.cx; dy = e.clientY - p.cy;
    }
    setStick(dx, dy);
  } else if (p.kind === 'look' || (p.kind === 'btn' && p.A.look)) {
    for (const c of list) lookBy(p, c);
  }
}
function onUp(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  ptrs.delete(e.pointerId);
  if (p.kind === 'stick') { TOUCH.mv.x = TOUCH.mv.y = 0; TOUCH.sprint = false; stick.classList.remove('on'); idleStick(); }
  else if (p.kind === 'btn') { p.b.classList.remove('down'); if (p.A.up) p.A.up(); }
}
export function releaseAll() {
  for (const [id, p] of ptrs) { if (p.kind === 'btn') { p.b.classList.remove('down'); if (p.A.up) p.A.up(); } ptrs.delete(id); }
  TOUCH.mv.x = TOUCH.mv.y = 0; TOUCH.sprint = false; TOUCH.gas = false;
  if (stick) { stick.classList.remove('on'); idleStick(); }
}

export function setTouch(on, why) {
  on = !!on; if (on === TOUCH.on) return;
  TOUCH.on = on; releaseAll();
  document.body.classList.toggle('touch', on);
  if (why && api && api.toast) api.toast(why, 2);
  if (api && api.changed) api.changed(on);
}

/* per frame: which buttons show, cooldowns, glows */
let lastSig = '';
export function touchFrame() {
  if (!layer) return;
  const st = api.state();
  const playing = TOUCH.on && st.play;
  layer.style.display = playing ? 'block' : 'none';
  if (!playing) { if (ptrs.size) releaseAll(); return; }
  const sig = `${st.titan ? 't' : 's'}|${st.mp}|${st.gunner}|${st.use}|${st.chat}|${st.horse ? 'h1' : 'h0'}|${st.mounted ? 'm1' : 'm0'}`;
  if (sig !== lastSig) {
    lastSig = sig;
    layer.classList.toggle('titan', st.titan); layer.classList.toggle('mp', st.mp); layer.classList.toggle('use', st.use); layer.classList.toggle('chat', st.chat);
    layer.classList.toggle('near-horse', !!st.horse);
    btns.attack.querySelector('.tbl').textContent = st.gunner ? 'FIRE' : 'SLASH';
    btns.swap.querySelector('.tbl').textContent = st.gunner ? 'RELOAD' : 'BLADES';
    if (btns.horse) {
      btns.horse.querySelector('.tbl').textContent = st.mounted ? 'DISMOUNT' : 'HORSE';
      const sub = btns.horse.querySelector('.tbs');
      if (sub) sub.textContent = st.mounted ? 'LEAP' : 'RIDE';
    }
    if (btns.titan) {
      btns.titan.querySelector('.tbl').textContent = st.titan ? 'EJECT' : 'TITAN';
      const sub = btns.titan.querySelector('.tbs');
      if (sub) sub.textContent = st.titan ? 'HUMAN' : 'SHIFT';
    }
    if (!st.titan) showHint();
  }
  if (st.titan) {
    const S = api.slots && api.slots();
    if (S) for (const k of ['Q', 'E', 'R']) {
      const b = btns[k.toLowerCase()], s = S[k]; if (!s) continue;
      const n = s.n.textContent, cd = s.cd.style.height, t = s.cd.textContent;
      if (b._n !== n) { b._n = n; b.querySelector('.tbn').textContent = n; }
      if (b._cd !== cd) { b._cd = cd; b.querySelector('.tbcd').style.height = cd; }
      if (b._t !== t) { b._t = t; b.querySelector('.tbcd').textContent = t; b.classList.toggle('cd', !!t); }
    }
    // swipe / grab follow the titan HUD (Devour and Throw while holding someone, Bite for jaw titans)
    if (S) for (const [k, b] of [['LMB', btns.swipe], ['RMB', btns.grab]]) { const n = S[k] && S[k].n.textContent.toUpperCase(); if (n && b._n !== n) { b._n = n; b.querySelector('.tbl').textContent = n; } }
  } else {
    btns.attack.classList.toggle('strike', st.strike);
    btns.gas.classList.toggle('reel', st.hooked);
    btns.hookL.classList.toggle('on', st.anchors[0]); btns.hookR.classList.toggle('on', st.anchors[1]);
    btns.hookL.classList.toggle('none', !st.targets[0]); btns.hookR.classList.toggle('none', !st.targets[1]);
    btns.swap.classList.toggle('warn', st.dull);
  }
}

export function initTouch(a) {
  api = a;
  build();
  document.body.classList.toggle('touch', TOUCH.on);
  if (forced !== null) return;
  // hybrid devices: a finger turns touch controls on, a real keyboard or mouse in play turns them off
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !TOUCH.on) setTouch(true, 'Touch controls on'); }, true);
  document.addEventListener('keydown', (e) => {
    if (!TOUCH.on || !api.state().play || /INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
    if (/^(Key[WASDFQERGC]|Space|ShiftLeft|ShiftRight)$/.test(e.code)) setTouch(false, 'Keyboard detected: touch controls hidden');
  });
  window.addEventListener('mousedown', (e) => { if (TOUCH.on && api.state().play && !e.sourceCapabilities?.firesTouchEvents && matchMedia('(pointer: fine)').matches && performance.now() - lastTouch > 1500) setTouch(false, 'Mouse detected: touch controls hidden'); }, true);
  window.addEventListener('touchstart', () => { lastTouch = performance.now(); }, { capture: true, passive: true });
}
let lastTouch = -1e9;

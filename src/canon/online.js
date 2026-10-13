/* =========================================================================
   Online services (when the site runs with its /api backend):
   - session analytics: start / heartbeat / end
   - room registry: hosts announce their room every 20 s
   - world browser + Quick Play: spread players across open rooms
   Everything here fails quietly when there is no backend (local file server).
   ========================================================================= */
export const VERSION = 'v3';
const SID = (() => { try { let s = sessionStorage.getItem('ts_sid'); if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('ts_sid', s); } return s; } catch (e) { return Math.random().toString(36).slice(2); } })();
export const ONLINE = { ok: null, sid: SID };

async function post(path, body) {
  try { const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }); return r.ok ? r.json() : null; }
  catch (e) { return null; }
}
export async function detect() {
  if (ONLINE.ok !== null) return ONLINE.ok;
  // only the deployed site (https) and the local dev server (port 8740) have the /api backend
  if (location.protocol !== 'https:' && !/^874\d$/.test(location.port)) { ONLINE.ok = false; return false; }
  try { const r = await fetch('/api/rooms', { cache: 'no-store' }); ONLINE.ok = r.ok && (r.headers.get('content-type') || '').includes('json'); }
  catch (e) { ONLINE.ok = false; }
  return ONLINE.ok;
}
// ---------------------------------------------------------------- analytics
let beatTimer = null, lastInfo = {}, beatN = 0, myName = '';
export async function sessionStart(name) {
  if (!(await detect())) return;
  myName = name;
  post('/api/session', { ev: 'start', sid: SID, name, v: VERSION });
  // every 3 min while the tab is visible (hidden tabs drop off the live list); n lets the server skip
  // the full analytics write on most beats
  const beat = (chg) => post('/api/session', Object.assign({ ev: 'beat', sid: SID, v: VERSION, n: ++beatN, name: myName }, chg ? { chg: 1 } : {}, lastInfo));
  if (!beatTimer) {
    beatTimer = setInterval(() => { if (!document.hidden) beat(false); }, 180000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(true); });
  }
  window.addEventListener('pagehide', () => { try { navigator.sendBeacon('/api/session', new Blob([JSON.stringify({ ev: 'end', sid: SID })], { type: 'application/json' })); } catch (e) { /* ignore */ } });
}
export function sessionInfo(info) {
  const changed = info.room !== lastInfo.room || info.role !== lastInfo.role;
  lastInfo = Object.assign({}, lastInfo, info);
  if (changed && ONLINE.ok) post('/api/session', Object.assign({ ev: 'beat', sid: SID, v: VERSION, chg: 1, name: myName }, lastInfo));
}
// ---------------------------------------------------------------- room registry (host)
let roomTimer = null, roomState = null, lastBeat = 0;
export function roomAnnounce(state) {
  if (!ONLINE.ok) return;
  roomState = Object.assign({ v: VERSION }, state);
  const now = Date.now();
  if (now - lastBeat > 3000) { lastBeat = now; post('/api/room', Object.assign({ ev: 'beat' }, roomState)); }
  if (!roomTimer) roomTimer = setInterval(() => { if (roomState) { lastBeat = Date.now(); post('/api/room', Object.assign({ ev: 'beat' }, roomState)); } }, 20000);
}
export function roomClose(code) {
  if (roomTimer) { clearInterval(roomTimer); roomTimer = null; }
  roomState = null;
  if (!ONLINE.ok || !code) return;
  try { navigator.sendBeacon('/api/room', new Blob([JSON.stringify({ ev: 'close', code })], { type: 'application/json' })); } catch (e) { post('/api/room', { ev: 'close', code }); }
}
// ---------------------------------------------------------------- browser + quick play
export async function listRooms() { return (await roomsSummary()).rooms; }
// { rooms (this game version), players (in all public lobbies) }
export async function roomsSummary() {
  if (!(await detect())) return { rooms: [], players: 0 };
  try { const r = await fetch('/api/rooms', { cache: 'no-store' }); const j = await r.json(); const rooms = (j.rooms || []).filter(x => x.v === VERSION); return { rooms, players: rooms.reduce((a, x) => a + x.players, 0) }; }
  catch (e) { return { rooms: [], players: 0 }; }
}
// Quick Play policy: join the least-busy open room under its soft cap (75% full), lobby before live.
// No candidate → the caller hosts a new public room, so busy worlds never pile up.
export function pickRooms(rooms) {
  const soft = (r) => Math.max(2, Math.ceil(r.max * 0.75));
  return rooms.filter(r => r.public && r.players < soft(r) && r.phase !== 'over')
    .sort((a, b) => a.players - b.players || (a.phase === 'lobby' ? -1 : 0) - (b.phase === 'lobby' ? -1 : 0) || b.left - a.left);
}

/* =========================================================================
   Multiplayer: lobby, match rules, replication, scoreboard, kill feed,
   respawn timers, bots and fuel drops.
   The host's browser is the referee: it runs the bots, the AI titans, the
   fuel drops and the score. Every player flies their own scout (or pilots
   their own titan) and streams its state; damage is decided on the side of
   whoever gets hit.
   ========================================================================= */
import { THREE, scene, camera, startWorld, queueEdit, setPinned, pinnedProgress, meshedAround, getBlock, SOLID } from './engine.js';
import { G } from './state.js';
import { Sfx, Music } from './audio.js';
import { Net, makeCode } from './net.js';
import { Titan, spawnProjectile, areaEffect } from './titans.js';
import { RemoteScout, BotScout, scoutStateOf } from './bots.js';
import { CHARACTERS, CORPS_ROSTER, INTERIOR_ROSTER, FACTIONS, charStats, SHIFTING } from './characters.js';
import { TOUCH } from './touch.js';
import { SHIFTER_TYPES, kitInfo, initPilotedTitan, attachKit, castFx, updateSpikes } from './shifters.js';
import { spawnBullet, removeBullet, updateBullets, clearBullets, GUN } from './guns.js';
import { randomDropSpot, FUEL } from './fuel.js';
import { steamBurst, sparkBurst, gasPuff } from './fx.js';
import { enc, dec } from './wire.js';
import { ONLINE, detect, sessionStart, sessionInfo, roomAnnounce, roomClose, listRooms, roomsSummary, pickRooms, VERSION } from './online.js';

const W = window, DR = W.DR, WALL_TOP = W.WALL_TOP;
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cidOf = (sc) => typeof sc.char === 'string' ? sc.char : (sc.charId || 'recruit');
const pidOf = (eid) => eid ? String(eid).split(':')[0] : null;
const SNAP_DT = 0.05, MS_DT = 0.5;
const SHIFTER_NAMES = { beast: 'Zane', armored: 'Ryker', colossal: 'Barrett', female: 'Anika', jaw: 'Pablo', attack: 'Ezra' };
const CADETS = ['Hux', 'Brenner', 'Voss', 'Lark', 'Pell', 'Gareth', 'Ellis', 'Marek', 'Hollis', 'Finch', 'Rina', 'Ivo', 'Milo', 'Nadia', 'Mack', 'Bram', 'Kesh', 'Tamsin'];
const PURE_TYPES = ['runt', 'strider', 'strider', 'runt', 'abnormal', 'strider', 'brute'];
export const MODES = {
  breach: { name: 'Wall Breach', sides: ['corps', 'titans'], desc: 'The Skyward Legion defends Haverwall. Titans win by tearing the district down, and each titan wrecks it at a capped rate, so they have to survive inside the walls. The Legion wins by holding out or earning enough Legion points.' },
  civil: { name: 'Civil War', sides: ['corps', 'interior'], desc: 'The Skyward Legion against the Interior Squad: blades against pistols. Deflect bullets with a well-timed slash. Wild titans roam the field.' }
};
const DIFF = { recruit: 0.35, veteran: 0.6, elite: 0.85 };

export const MP = {
  net: null, active: false, inLobby: false, api: null,
  me: { id: null, name: '', team: 'corps', char: 'leroy', shifter: 'beast' },
  roster: [], settings: { maxPlayers: 8, public: true, mode: 'breach', minutes: 12, bots: true, scoutBots: 4, shifterBots: 1, density: 1, diff: 'veteran', civilTitans: true, shifting: false, teamSize: 4 },
  match: null, ents: new Map(), raw: new Map(), snapT: 0, msT: 0, editBuf: [], dzBuf: 0, editLog: new Map(), seq: 0, gen: 0,
  feed: [], localDeadAt: 0, respawnAt: null,
  hostShort: 'p0', pidSeq: 0, peerOf: new Map(), shortOf: new Map(), snapSeq: 0, lastSnapQ: -1, tick: 0, editT: 0, pingT: 0, ping: 0
};
G.mp = MP;
G.localTeam = () => MP.me.team;
G.hostile = (a, b) => {
  const ta = a.team === 'titans' ? 'titans' : a.team, tb = b.team === 'titans' ? 'titans' : b.team;
  if (!ta || !tb) return true;
  return ta !== tb;
};

/* ======================================================================== helpers */
function myScoutId() { return MP.me.id + ':s'; }
function isHost() { return MP.net && MP.net.isHost; }
function player(id) { return MP.roster.find(p => p.id === id); }
function ownerOf(eid) {
  const pid = pidOf(eid);
  if (!pid || pid.startsWith('pt') || pid.startsWith('b')) return MP.hostShort;
  return pid;
}
function mine(eid) { return ownerOf(eid) === MP.me.id; }
function entity(id) {
  if (!id) return null;
  if (G.player && id === G.player.id) return G.player;
  return MP.ents.get(id) || G.titans.find(t => t.id === id) || null;
}
G.entity = entity;
function displayName(eid) {
  if (!eid) return 'the fall';
  const pid = pidOf(eid), p = player(pid);
  if (p) return p.name;
  const t = G.titans.find(q => q.id === eid);
  if (t) return t.name || (t.T ? t.T.label : 'a titan');
  return 'a titan';
}
function teamOfEid(eid) { const p = player(pidOf(eid)); if (p) return p.team; return 'titans'; }

/* ======================================================================== events */
// send an event: host applies it and relays it; a client sends it to the host
function send(ev) {
  ev.o = MP.me.id;
  if (ev.to && ev.to === MP.me.id) { const H = EV[ev.e]; if (H) { try { H(ev); } catch (e) { console.error('event', ev.e, e); } } return; }
  if (isHost()) { handleEvent(ev, MP.me.id); }
  else MP.net.toHost({ t: 'ev', ev });
}
function handleEvent(ev, from) {
  // routing on the host (from = transport id of the sender)
  if (isHost()) {
    if (ev.to && ev.to !== MP.me.id) { const tp = MP.peerOf.get(ev.to); if (tp) MP.net.toPeer(tp, { t: 'ev', ev }); if (!ev.also) return; }
    else if (!ev.to) MP.net.broadcast({ t: 'ev', ev }, from === MP.net.id ? null : from);
  }
  const H = EV[ev.e];
  if (H) { try { H(ev); } catch (e) { console.error('event', ev.e, e); } }
}
const EV = {
  hit(ev) {
    const t = G.titans.find(q => q.id === ev.tid); if (!t || t.remote || !t.alive) return;
    const info = Object.assign({}, ev.info, { point: t.napeWorld(new THREE.Vector3()) });
    const res = t.hit(ev.part, info);
    send({ e: 'hitres', tid: t.id, part: ev.part, kind: res.kind, left: res.left, by: info.by, speed: info.speed, spin: info.spin, air: info.air });
  },
  hitres(ev) {
    const t = G.titans.find(q => q.id === ev.tid);
    if (t && ev.kind !== 'kill' && ev.kind !== 'none') { t.flash = 1; if (ev.kind === 'limb' && t.remote) steamBurst(t.chest(new THREE.Vector3()), 10, 1, t.h * 0.06, 3, 1.4); }
    if (ev.by === (G.player && G.player.id) && t && MP.api && !(ev.local && ev.o === MP.me.id)) MP.api.hitFeedback(t, ev.part, { kind: ev.kind, left: ev.left }, ev.speed, ev.spin, ev.air, null, false);
    if (isHost()) hostHitStats(ev);
  },
  blocks(ev) { if (ev.o === MP.me.id) return; const a = ev.b; for (let i = 0; i < a.length; i += 3) queueEdit(a[i], a[i + 1], a[i + 2], 0); if (isHost() && MP.match && MP.match.mode === 'breach') MP.match.district += ev.dz || 0; },
  aoe(ev) { if (ev.o === MP.me.id) return; areaEffect(ev.a, false); },
  proj(ev) { if (ev.o === MP.me.id) return; spawnProjectile(Object.assign({}, ev.p, { mine: false })); },
  shot(ev) { if (ev.o === MP.me.id) return; spawnBullet(Object.assign({}, ev.b, { mine: false })); },
  deflect(ev) {
    if (ev.o !== MP.me.id) { removeBullet(ev.old); spawnBullet(Object.assign({}, ev.nb, { mine: false })); }
    if (isHost()) { const p = player(pidOf(ev.nb.by)); if (p) { p.score += 50; p.deflects = (p.deflects || 0) + 1; } }
  },
  grab(ev) {
    const t = G.titans.find(q => q.id === ev.tid), sc = entity(ev.sid);
    if (!t || t.remote) return;
    if (!sc || !t.takeHold(sc)) send({ e: 'release', to: ownerOf(ev.sid), sid: ev.sid, tid: ev.tid });
  },
  release(ev) {
    const sc = entity(ev.sid); if (!sc) return;
    if (sc === G.player) { G.player.grabbedBy = null; $('grab').classList.remove('show'); }
    else if (sc.bot) sc.grabbedBy = null;
  },
  escape(ev) {
    const t = G.titans.find(q => q.id === ev.tid); if (!t || t.remote) return;
    t.dis[ev.part] = 0; t.hit(ev.part, { deep: true, speed: 20, by: ev.sid }); t.holding = null; t.state = 'recover'; t.st = 0;
  },
  crush(ev) {
    const sc = entity(ev.sid), t = G.titans.find(q => q.id === ev.tid) || { id: ev.tid, name: ev.tn, yaw: 0 };
    if (sc === G.player && MP.api) MP.api.crushedBy(t, ev.kind, ev.dir);
    else if (sc && sc.bot) sc.crushed(t, ev.kind, ev.dir);
  },
  hitc(ev) {
    if (!MP.api) return;
    if ((G.localTitan && ev.by === G.localTitan.id) || (G.player && ev.by === G.player.id)) MP.api.confirmHit(ev);
  },
  pvp(ev) {
    const sc = entity(ev.sid); if (!sc || !sc.local) return;
    const kb = new THREE.Vector3(ev.kb[0], ev.kb[1], ev.kb[2]);
    if (G.hooks.hurtScout) G.hooks.hurtScout(sc, ev.dmg, kb, ev.by, `Cut down by ${displayName(ev.by)}`);
  },
  death(ev) { if (isHost()) hostScoutDeath(ev); },
  tdeath(ev) {
    const t = G.titans.find(q => q.id === ev.id);
    if (t && t.remote && t.alive) t.kill({ by: ev.by });
    if (isHost()) hostTitanDeath(ev);
  },
  fuelTake(ev) {
    if (!isHost()) return;
    const d = G.fuel.list.find(f => f.id === ev.fid);
    if (!d) { send({ e: 'fuelDeny', to: ev.o, fid: ev.fid }); return; }
    G.fuel.remove(ev.fid);
    send({ e: 'fuelGone', fid: ev.fid, by: ev.by, x: d.x, y: d.y, z: d.z });
  },
  fuelGone(ev) {
    G.fuel.remove(ev.fid);
    gasPuff(new THREE.Vector3(ev.x, ev.y + 1.5, ev.z), new THREE.Vector3(0, 3, 0), 10, 0.7);
    if (ev.by === (G.player && G.player.id) && MP.api) MP.api.applyFuel();
    const b = MP.ents.get(ev.by); if (b && b.bot) { b.gas = Math.min(100, b.gas + FUEL.GAS); b.spare = Math.min(8, b.spare + FUEL.BLADES); b.hp = Math.min(b.stats.hp, b.hp + FUEL.HP); }
  },
  fuelDeny(ev) { const d = G.fuel.list.find(f => f.id === ev.fid); if (d) d.pending = false; },
  fuelAdd(ev) { if (ev.o === MP.me.id) return; G.fuel.add(ev.d.id, ev.d.x, ev.d.y, ev.d.z); },
  ab(ev) { if (ev.o === MP.me.id) return; const t = G.titans.find(q => q.id === ev.id); castFx(t, ev.k, ev.d); },
  warn(ev) { showWarn(ev.w); },
  summon(ev) { if (!isHost()) return; const t = entity(ev.tid); if (!t) return; hostSummon(t, ev.n); },
  enrage(ev) { if (!isHost()) return; for (const t of G.titans) if (!t.T.shifter && t.alive && !t.remote && Math.hypot(t.pos.x - ev.x, t.pos.z - ev.z) < ev.r) { t.rage = 1.4; t.rageT = ev.d; t.alertness = 1; t.speed = t.T.speed * 1.35; } },
  call(ev) { if (!isHost()) return; for (const t of G.titans) if (!t.T.shifter && t.alive && !t.remote && Math.hypot(t.pos.x - ev.x, t.pos.z - ev.z) < ev.r) { t.goal = new THREE.Vector3(ev.x + rnd(-15, 15), 0, ev.z + rnd(-15, 15)); t.route = null; t.alertness = 1; } },
  feed(ev) { pushFeed(ev); },
  ann(ev) { if (MP.api) MP.api.bigMsg(ev.text, ev.sub || '', ev.color || '#ffd36a', ev.dur || 2.2); if (ev.snd === 'horn') Sfx.horn(); else if (ev.snd) Sfx.announce(ev.n || 1); },
  respawn(ev) { if (ev.id === MP.me.id) MP.respawnAt = ev.at; },
  kicked(ev) { leaveMatch('The host closed the room.'); }
};

/* ======================================================================== hooks the game calls */
const MP_HOOKS = ['hitConfirm', 'blockEdit', 'aoeSent', 'projectileSpawned', 'netHit', 'hitResolved', 'netGrab', 'netEscape', 'netRelease', 'netCrush', 'takeFuel', 'botFuel', 'abilityCast', 'abilityDenied', 'warn', 'summon', 'enrage', 'callTitans', 'fireBullet', 'bulletDeflected', 'pvpHit', 'scoutDied', 'localDied', 'titanKilled'];
function unwireHooks() { for (const k of MP_HOOKS) delete G.hooks[k]; }
function wireHooks() {
  const hk = G.hooks;
  hk.blockEdit = (x, y, z, src) => {
    if (!MP.active) return;
    MP.editBuf.push(x, y, z);
    if (src && MP.match && MP.match.mode === 'breach' && Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)) < DR) MP.dzBuf += districtPoint(src);
  };
  hk.hitConfirm = (victim, by, dmg, kill, kind) => { if (!by || !MP.active) return; const pid = pidOf(by); if (!pid || pid.startsWith('pt') || pid.startsWith('b')) return; const o = ownerOf(by); send({ e: 'hitc', to: o, by, v: victim.name || displayName(victim.id), dmg, kill, kind }); };
  hk.aoeSent = (a) => { if (MP.active) send({ e: 'aoe', a }); };
  hk.projectileSpawned = (sp) => { if (MP.active) send({ e: 'proj', p: sp }); };
  hk.netHit = (t, part, info) => { const i = Object.assign({}, info); delete i.point; send({ e: 'hit', to: ownerOf(t.id), tid: t.id, part, info: i }); };
  hk.hitResolved = (t, part, res, info) => { if (MP.active) send({ e: 'hitres', tid: t.id, part, kind: res.kind, left: res.left, by: info.by, speed: info.speed, spin: info.spin, air: info.air, local: true }); };
  hk.netGrab = (t, sc) => send({ e: 'grab', to: ownerOf(t.id), tid: t.id, sid: sc.id });
  hk.netEscape = (t, part, sid) => send({ e: 'escape', to: ownerOf(t.id), tid: t.id, part, sid: sid || G.player.id });
  hk.netRelease = (t, who) => { if (who && who.id) send({ e: 'release', to: ownerOf(who.id), sid: who.id, tid: t.id }); };
  hk.netCrush = (t, who, kind, dir) => { if (who && who.id) send({ e: 'crush', to: ownerOf(who.id), sid: who.id, tid: t.id, tn: t.name, kind, dir }); };
  hk.takeFuel = (d) => send({ e: 'fuelTake', fid: d.id, by: G.player.id });
  hk.botFuel = (b, d) => { if (G.fuel.list.find(f => f.id === d.id)) { G.fuel.remove(d.id); send({ e: 'fuelGone', fid: d.id, by: b.id, x: d.x, y: d.y, z: d.z }); } };
  hk.abilityCast = (t, k, d) => send({ e: 'ab', id: t.id, k, d });
  hk.abilityDenied = (t, k, why) => { if (MP.api) MP.api.pilotDenied(`${kitInfo(t.type)[k].name}${why ? ' · ' + why : ''}`); };
  hk.warn = (w) => send({ e: 'warn', w });
  hk.summon = (t, n) => send({ e: 'summon', tid: t.id, n, to: MP.hostShort });
  hk.enrage = (p, r, d) => send({ e: 'enrage', x: p.x, z: p.z, r, d, to: MP.hostShort });
  hk.callTitans = (p, r) => send({ e: 'call', x: p.x, z: p.z, r, to: MP.hostShort });
  hk.fireBullet = (sc, from, dir) => {
    const st = charStats(cidOf(sc));
    const v = dir.clone().multiplyScalar(GUN.speed * st.bullet).add(sc.vel ? sc.vel.clone().multiplyScalar(0.5) : new THREE.Vector3());
    const b = { id: 'u' + MP.me.id + '_' + (++MP.seq), p: [from.x, from.y, from.z], v: [v.x, v.y, v.z], by: sc.id, team: sc.team, mine: true };
    spawnBullet(b); send({ e: 'shot', b });
  };
  hk.bulletDeflected = (sc, old, nb) => { removeBullet(old.id); spawnBullet(nb); send({ e: 'deflect', old: old.id, nb: Object.assign({}, nb, { mine: false }) }); if (sc === G.player && MP.api) { MP.api.popup('DEFLECTED!  +50', '#fff3c0'); MP.api.bigMsg('DEFLECTED', '', '#fff3c0', 0.8); } };
  hk.pvpHit = (att, target, speed) => {
    const deep = speed >= 11 || att.spinT >= 0;
    const dmg = Math.round(Math.min(65, (deep ? 30 : 14) + speed * 0.6) * charStats(cidOf(att)).cut);
    const kb = target.pos.clone().sub(att.pos).setY(0).normalize().multiplyScalar(10);
    send({ e: 'pvp', to: ownerOf(target.id), sid: target.id, by: att.id, dmg, kb: [kb.x, 4, kb.z] });
    return dmg;
  };
  hk.scoutDied = (b, by, reason) => send({ e: 'death', id: b.id, by, reason, to: MP.hostShort });
  hk.localDied = (reason, killer) => {
    MP.localDeadAt = G.time; MP.respawnAt = null;
    send({ e: 'death', id: G.player.id, by: killer ? killer.id : null, reason, to: MP.hostShort });
    showDeathOverlay(reason, killer ? killer.id : null);
  };
  hk.titanKilled = (t, info) => {
    const assists = [...t.recentHits.entries()].filter(([id, tm]) => id !== info.by && G.time - tm < 14).map(([id]) => id);
    // mark ourselves dead BEFORE reporting: on the host the respawn time comes back synchronously
    if (t === G.localTitan) { MP.localDeadAt = G.time; MP.respawnAt = null; showDeathOverlay(`Nape cut by ${displayName(info.by)}`, info.by); }
    send({ e: 'tdeath', id: t.id, by: info.by || null, assists, type: t.type, shifter: !!t.T.shifter, spd: Math.round(info.speed || 0) });
  };
}

/* ======================================================================== host: scoring */
function hostHitStats(ev) {
  const p = player(pidOf(ev.by)); if (!p) return;
  if (ev.kind === 'limb') { p.limbs = (p.limbs || 0) + 1; p.score += 25 * charStats(p.char).limb; }
  if (ev.kind === 'napecrack') p.score += 150;
  if (ev.kind === 'bosshit') p.score += 300;
}
// District damage is rate-limited per titan, so titans have to survive inside the walls to tear the district down.
// Blocks still break at full speed; only the score is capped. Shifters share a budget that grows slowly with their number.
const DZ_PURE = { runt: 1, strider: 1.5, abnormal: 1.5, brute: 3 };
function dzRate(t) {
  if (!t.T.shifter) return DZ_PURE[t.type] || 2;
  const n = Math.max(1, MP.roster.filter(p => p.team === 'titans').length);
  return 20 / (1 + n);   // blocks per second each: 10 solo, 6.7 each for two, 4 each for four
}
function districtPoint(src) {
  const t = typeof src === 'string' ? G.titans.find(q => q.id === src) : src;
  if (!t || !t.T) return 0;
  const r = dzRate(t), cap = r * 8, now = G.time;
  t.dzTok = Math.min(cap, (t.dzTok ?? cap) + (now - (t.dzT ?? now)) * r); t.dzT = now;
  if (t.dzTok < 1) return 0;
  t.dzTok -= 1; return 1;
}
function streakName(n) { return n >= 10 ? 'HUMANITY\'S STRONGEST' : n >= 8 ? 'TITAN SLAYER' : n >= 5 ? 'UNSTOPPABLE' : n >= 3 ? 'ON A ROLL' : null; }
const MULTI = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'RAMPAGE'];
function creditKill(kp, victimPlayer, ev, label) {
  const M = MP.match;
  if (kp) {
    kp.k++; kp.streak++; kp.best = Math.max(kp.best, kp.streak); kp.dsk = 0;
    const now = M.t;
    kp.multi = now - (kp.lastKill ?? -99) < 8 ? (kp.multi || 1) + 1 : 1; kp.lastKill = now;
    if (!M.firstBlood) { M.firstBlood = true; announce('FIRST BLOOD', `${kp.name} draws first`, '#ff8a6a', 1); kp.score += 100; }
    else if (kp.multi >= 2) announce(MULTI[Math.min(5, kp.multi)], kp.name, '#ffd36a', kp.multi);
    const sn = streakName(kp.streak);
    if (sn && [3, 5, 8, 10].includes(kp.streak)) announce(sn, `${kp.name} · ${kp.streak} in a row · bounty on their head`, '#ffcf6a', 2);
  }
  if (victimPlayer) {
    if (victimPlayer.streak >= 3 && kp) { kp.score += 100 * victimPlayer.streak; announce('SHUTDOWN', `${kp.name} ended ${victimPlayer.name}'s streak of ${victimPlayer.streak}`, '#ff9a6a', 2); }
    victimPlayer.d++; victimPlayer.streak = 0; victimPlayer.dsk = (victimPlayer.dsk || 0) + 1;
  }
  void label; void ev;
}
function leaderCheck() {
  const M = MP.match, top = [...MP.roster].sort((a, b) => b.score - a.score)[0];
  if (top && top.score > 0 && M.leader !== top.id) { if (M.leader) announce(`${top.name.toUpperCase()} TAKES THE LEAD`, `${top.score.toLocaleString()} points`, '#9fe8ff', 0); M.leader = top.id; }
}
function respawnTime(p, titan) {
  const M = MP.match, min = M.t / 60;
  // comeback: once half the district is gone, the city guard rushes Legion reinforcements to the wall
  const rally = M.mode === 'breach' && !titan && p.team === 'corps' && M.district >= M.maxDistrict * 0.5;
  return Math.round((5 + 1.6 * Math.min(12, min) + 1.5 * Math.min(4, Math.max(0, (p.dsk || 1) - 1)) + (titan ? 3 : 0)) * (rally ? 0.6 : 1));
}
function hostScoutDeath(ev) {
  const M = MP.match; if (!M || M.phase !== 'live') return;
  const vp = player(pidOf(ev.id)), kp = ev.by ? player(pidOf(ev.by)) : null;
  const killerTitan = ev.by ? G.titans.find(t => t.id === ev.by) : null;
  const devour = /Devoured/.test(ev.reason || '');
  if (kp && kp !== vp) { kp.score += devour ? 400 : 300; if (kp.team === 'titans') M.titanKills++; }
  if (M.mode === 'civil' && kp && kp.team !== vp?.team) M.kills[kp.team] = (M.kills[kp.team] || 0) + 1;
  creditKill(kp && kp !== vp ? kp : null, vp, ev);
  pushFeedAll({ k: ev.by ? displayName(ev.by) : '', kt: ev.by ? teamOfEid(ev.by) : '', v: vp ? vp.name : displayName(ev.id), vt: vp ? vp.team : 'corps', how: ev.reason || 'Fell', devour, tt: killerTitan ? killerTitan.type : null });
  if (vp) {
    const rt = respawnTime(vp, false); vp.rt = M.t + rt;
    if (vp.bot) vp.botRespawn = M.t + rt;
    else send({ e: 'respawn', to: vp.id, id: vp.id, at: vp.rt, also: false });
  }
  leaderCheck();
}
function hostTitanDeath(ev) {
  const M = MP.match; if (!M || M.phase !== 'live') return;
  const vp = player(pidOf(ev.id)), kp = ev.by ? player(pidOf(ev.by)) : null;
  const pure = !ev.shifter;
  if (kp) {
    const base = pure ? (ev.type === 'brute' || ev.type === 'abnormal' ? 150 : 100) : 500;
    kp.score += base + Math.max(0, ev.spd - 10) * 4; kp.tk = (kp.tk || 0) + 1;
    kp.fastest = Math.max(kp.fastest || 0, ev.spd * 3.6);
    if (M.mode === 'breach') M.legion += pure ? (ev.type === 'brute' || ev.type === 'abnormal' ? 2 : 1) : 8;
    if (M.mode === 'civil') kp.score += 0;
  }
  for (const a of ev.assists || []) { const ap = player(pidOf(a)); if (ap && ap !== kp) { ap.a++; ap.score += 50 * charStats(ap.char).assist; } }
  if (kp || vp) creditKill(kp, vp, ev);
  if (ev.shifter || kp) pushFeedAll({ k: ev.by ? displayName(ev.by) : '', kt: ev.by ? teamOfEid(ev.by) : '', v: vp ? `${vp.name} (${kitInfo(ev.type) ? (G.titans.find(t => t.id === ev.id) || { T: { label: ev.type } }).T.label : ev.type})` : labelOf(ev.type), vt: 'titans', how: `Nape cut${ev.spd ? ` · ${Math.round(ev.spd * 3.6)} km/h` : ''}` });
  if (vp) {
    const rt = respawnTime(vp, true); vp.rt = M.t + rt;
    if (vp.bot) vp.botRespawn = M.t + rt;
    else send({ e: 'respawn', to: vp.id, id: vp.id, at: vp.rt });
  }
  leaderCheck();
}
function labelOf(type) { const t = { runt: 'Runt', strider: 'Strider', brute: 'Brute', abnormal: 'Leaper' }; return t[type] || type; }
function announce(text, sub, color, n) { send({ e: 'ann', text, sub, color, snd: n ? 'a' : null, n }); }
function pushFeedAll(f) { send(Object.assign({ e: 'feed' }, f)); }

/* ======================================================================== host: bots, titans, fuel */
function hostSummon(t, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, x = t.pos.x + Math.cos(a) * 14, z = t.pos.z + Math.sin(a) * 14;
    spawnPure(pick(['runt', 'strider', 'abnormal']), x, z, { alert: true });
  }
}
function spawnPure(type, x, z, opts = {}) {
  const t = new Titan(type, x, z, Object.assign({ id: 'pt' + (++MP.seq), owner: MP.me.id, yaw: opts.yaw ?? Math.random() * 6 }, opts));
  G.titans.push(t);
  return t;
}
function pureTarget() {
  const M = MP.match, s = MP.settings;
  const scouts = G.scouts.filter(q => q.alive || true).length;
  if (M.mode === 'civil') return s.civilTitans ? Math.round(3 + scouts * 0.4) : 0;
  return Math.min(18, Math.round((3 + scouts * 1.4) * s.density + M.t / 120));
}
function hostPureSpawner(dt) {
  const M = MP.match; M.pureT -= dt;
  if (M.pureT > 0) return;
  M.pureT = 2.5;
  const alive = G.titans.filter(t => t.alive && !t.T.shifter && t.type !== 'dummy').length;
  if (alive >= pureTarget()) return;
  const late = M.t / (MP.settings.minutes * 60);
  let type = pick(PURE_TYPES); if (late > 0.5 && Math.random() < 0.3) type = pick(['brute', 'abnormal']);
  if (M.mode === 'breach') {
    const side = Math.random();
    let x, z;
    if (side < 0.65) { x = rnd(-110, 110); z = DR + rnd(95, 150); }
    else { x = (Math.random() < 0.5 ? -1 : 1) * (DR + rnd(90, 130)); z = rnd(-40, 70); }
    const gate = [new THREE.Vector3(rnd(-4, 4), 0, DR + 20), new THREE.Vector3(rnd(-3, 3), 0, DR + 4), new THREE.Vector3(rnd(-3, 3), 0, DR - 14), new THREE.Vector3(rnd(-50, 50), 0, rnd(-50, 40))];
    const route = Math.random() < 0.7 ? [new THREE.Vector3(x * 0.4, 0, DR + 40), ...gate] : [new THREE.Vector3(Math.sign(x || 1) * (DR + 8), 0, z), new THREE.Vector3(Math.sign(x || 1) * (DR - 20), 0, z * 0.5)];
    spawnPure(type, x, z, { yaw: Math.PI, route });
  } else {
    const a = Math.random() * 6.28, r = rnd(110, 190);
    spawnPure(type, Math.cos(a) * r, Math.sin(a) * r, {});
  }
}
function hostFuel(dt) {
  const M = MP.match; M.fuelT -= dt;
  if (M.fuelT > 0) return;
  M.fuelT = 3;
  const want = 9 + Math.round(G.scouts.length * 1.5);
  if (G.fuel.list.length >= want) return;
  const sp = M.mode === 'breach' ? randomDropSpot(0, DR + 30, 20, 150) : randomDropSpot(0, 0, 30, 170);
  if (!sp) return;
  const d = { id: 'f' + (++MP.seq), x: sp.x, y: sp.y, z: sp.z };
  G.fuel.add(d.id, d.x, d.y, d.z); send({ e: 'fuelAdd', d });
}
function botName(char) {
  const used = new Set(MP.roster.map(p => p.name));
  const c = CHARACTERS[char];
  if (c && char !== 'recruit' && char !== 'officer' && !used.has(c.name)) return c.name;
  let n; do { n = (c && c.faction === 'interior' ? 'Officer ' : 'Cadet ') + pick(CADETS); } while (used.has(n) && used.size < 40);
  return n;
}
function makeBotPlayer(team, extra = {}) {
  const id = 'b' + (++MP.seq);
  let char = team === 'interior' ? pick(INTERIOR_ROSTER) : team === 'corps' ? pick(CORPS_ROSTER) : null;
  const usedChars = new Set(MP.roster.map(p => p.char));
  if (char && usedChars.has(char) && Math.random() < 0.8) char = team === 'interior' ? 'officer' : 'recruit';
  const p = Object.assign({ id, name: team === 'titans' ? '' : botName(char), team, char, shifter: null, bot: true, host: false, k: 0, d: 0, a: 0, score: 0, streak: 0, best: 0, dsk: 0 }, extra);
  MP.roster.push(p);
  return p;
}
function hostBots() {
  const s = MP.settings, M = { mode: s.mode };
  const humans = MP.roster.filter(p => !p.bot);
  const count = (team) => MP.roster.filter(p => p.team === team).length;
  if (!s.bots) return;
  if (M.mode === 'breach') {
    const humanScouts = humans.filter(p => p.team === 'corps').length, humanTitans = humans.filter(p => p.team === 'titans').length;
    const wantScouts = humanTitans > 0 || humanScouts > 0 ? Math.max(humanScouts, s.scoutBots) : 0;
    while (count('corps') < wantScouts) makeBotPlayer('corps');
    const wantShifters = Math.max(humanTitans, humanScouts > 0 ? s.shifterBots : 0);
    while (count('titans') < wantShifters) {
      const taken = new Set(MP.roster.filter(p => p.team === 'titans').map(p => p.shifter));
      const type = pick(SHIFTER_TYPES.filter(t => !taken.has(t))) || pick(SHIFTER_TYPES);
      makeBotPlayer('titans', { shifter: type, name: SHIFTER_NAMES[type] });
    }
  } else {
    while (count('corps') < s.teamSize) makeBotPlayer('corps');
    while (count('interior') < s.teamSize) makeBotPlayer('interior');
  }
}
function spawnBotEntity(p) {
  if (p.team === 'titans') {
    const sp = spawnPoint('titans');
    const t = new Titan(p.shifter, sp.x, sp.z, { id: `${p.id}:t${++MP.gen}`, owner: MP.me.id, name: p.name, bot: true, yaw: Math.PI, alert: true });
    attachKit(t); t.speed = t.T.speed * 1.25; t.aggroR = 140;
    G.titans.push(t); p.ent = t.id;
  } else {
    let b = MP.ents.get(`${p.id}:s`);
    if (!b) { b = new BotScout({ id: `${p.id}:s`, name: p.name, char: p.char, faction: p.team, team: p.team, skill: DIFF[MP.settings.diff] }); MP.ents.set(b.id, b); G.scouts.push(b); }
    b.respawn(spawnPoint(p.team)); p.ent = b.id;
  }
  p.rt = null; p.botRespawn = null;
}
function spawnPoint(team) {
  const M = MP.match;
  if (team === 'titans') { const x = rnd(-70, 70), z = DR + rnd(90, 125); return { x, y: W.groundH(Math.floor(x), Math.floor(z)) + 1, z }; }
  if (M.mode === 'breach') { const x = pick([-56, -40, -28, 28, 40, 56]) + rnd(-2, 2); return { x, y: WALL_TOP + 1, z: DR - 2 }; }
  const side = team === 'corps' ? -1 : 1, z = pick([-50, -32, 32, 50]) + rnd(-2, 2);
  return { x: side * (DR - 2), y: WALL_TOP + 1, z };
}

/* ======================================================================== lobby */
function humans() { return MP.roster.filter(p => !p.bot).length; }
function announceRoom() {
  if (!isHost() || !MP.net || MP.net.mode !== 'peer') return;
  const M = MP.match;
  roomAnnounce({ code: MP.net.code, host: MP.me.name, mode: MP.settings.mode, players: humans(), max: MP.settings.maxPlayers, phase: MP.active ? (M && M.phase === 'over' ? 'over' : 'live') : 'lobby', public: MP.settings.public, left: M ? Math.max(0, Math.round(M.len - M.t)) : 0 });
}
function trackSession() {
  const me = MP.me;
  sessionInfo({ room: MP.net ? MP.net.code : '', role: me.team === 'titans' ? me.shifter : me.char, mode: MP.settings.mode, phase: MP.active ? 'live' : MP.inLobby ? 'lobby' : 'menu' });
}
function lobbyState() { return { t: 'lobby', roster: MP.roster.filter(p => !p.bot).map(p => ({ id: p.id, name: p.name, team: p.team, char: p.char, shifter: p.shifter, host: p.host })), settings: MP.settings, code: MP.net.code }; }
function pushLobby() { if (isHost()) { MP.net.broadcast(lobbyState()); renderLobby(); announceRoom(); } trackSession(); }
export async function hostRoom(kind) {
  MP.net = new Net();
  try {
    if (kind === 'offline') await MP.net.offline();
    else if (kind === 'local') await MP.net.localHost();
    else await MP.net.peerHost();
  } catch (e) { mpError(e.message); return; }
  MP.me.id = MP.hostShort; MP.pidSeq = 0; MP.peerOf.clear(); MP.shortOf.clear(); MP.peerOf.set(MP.me.id, MP.net.id); MP.shortOf.set(MP.net.id, MP.me.id);
  MP.roster = [{ id: MP.me.id, name: MP.me.name, team: MP.me.team, char: MP.me.char, shifter: MP.me.shifter, host: true, bot: false }];
  wireNet();
  MP.inLobby = true; showLobby(); announceRoom(); trackSession();
}
export async function joinRoom(code, kind, auto) {
  MP.net = new Net();
  code = code.trim().toUpperCase();
  try {
    if (kind === 'local') await MP.net.localJoin(code); else await MP.net.peerJoin(code);
  } catch (e) { MP.net.close(); MP.net = null; mpError(e.message); return false; }
  MP.me.id = null;
  wireNet();
  MP.net.toHost({ t: 'hello', name: MP.me.name, team: MP.me.team, char: MP.me.char, shifter: MP.me.shifter, auto: !!auto, v: VERSION });
  MP.inLobby = true; showLobby(); trackSession();
  return true;
}
// Quick Play: join the least-busy open world, or open a new public one
export async function quickPlay() {
  $('mp-err').textContent = 'Finding a world…';
  if (!(await detect())) { $('mp-err').textContent = 'Quick Play needs the online version of the game. Host a room or join with a code.'; return; }
  for (const r of pickRooms(await listRooms()).slice(0, 4)) {
    $('mp-err').textContent = `Joining ${r.host}'s world (${r.players}/${r.max})…`;
    if (await joinRoom(r.code, 'peer', true)) return;
  }
  $('mp-err').textContent = 'Every world is busy or empty · opening a new one…';
  MP.settings.public = true;
  await hostRoom('peer');
}
// Live lobbies: refreshed every 5 s while the multiplayer screen is open
let worldsBusy = false;
async function renderWorlds() {
  const el = $('mp-worlds'); if (!el || worldsBusy) return;
  worldsBusy = true;
  const { rooms, players } = await roomsSummary();
  worldsBusy = false;
  $('mp-livecount').textContent = rooms.length ? `${players} playing in ${rooms.length} ${rooms.length === 1 ? 'lobby' : 'lobbies'}` : '';
  rooms.sort((a, b) => (a.players >= a.max) - (b.players >= b.max) || b.players - a.players);
  el.innerHTML = rooms.length ? rooms.map(r => {
    const full = r.players >= r.max;
    const left = Math.max(0, Math.round(r.left - Math.max(0, Date.now() - r.t) / 1000));
    const status = r.phase === 'lobby' ? 'In lobby · picking sides' : r.phase === 'live' ? `<span class="live">● In match</span> · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : 'Wrapping up';
    return `<div class="world ${full ? 'full' : ''}"><div><b>${esc(r.host)}'s lobby</b> <span class="wm">${esc((MODES[r.mode] || {}).name || r.mode)}</span><div class="ws">${status}${r.country ? ' · ' + esc(r.country) : ''}</div></div>
      <div><div class="wp ${full ? 'full' : ''}">${r.players}/${r.max}</div><div class="wbar"><div style="width:${Math.min(100, r.players / r.max * 100).toFixed(0)}%"></div></div></div>
      <button class="btn small" data-world="${esc(r.code)}" ${full ? 'disabled' : ''}>${full ? 'Full' : 'Join'}</button></div>`;
  }).join('') : '<div class="mpnote" style="padding:0 12px">No public lobbies right now. Press Quick play or Create a lobby and others will find yours here.</div>';
}
async function titleCount() {
  if (!$('title').classList.contains('show')) return;
  const { rooms, players } = await roomsSummary();
  $('btn-mp').textContent = players > 0 ? `Multiplayer · ${players} playing now` : 'Multiplayer';
  void rooms;
}
function wireNet() {
  const N = MP.net;
  N.on('ev', (m, from) => handleEvent(m.ev, from));
  N.on('chat', (m) => showChat(m));
  if (N.isHost) {
    N.on('say', (m, from) => hostSay(m, from));
    N.on('hello', (m, from) => {
      if (m.v && m.v !== VERSION) { N.toPeer(from, { t: 'full', why: 'This world runs a different version of the game. Refresh the page.' }); return; }
      if (!MP.shortOf.get(from) && humans() >= MP.settings.maxPlayers) { N.toPeer(from, { t: 'full', why: 'That world is full.' }); return; }
      if (m.auto) {
        // Quick Play joiners go to the side with fewer people
        const sides = MODES[MP.settings.mode].sides, cnt = (sd) => MP.roster.filter(p => !p.bot && p.team === sd).length;
        m.team = cnt(sides[1]) < cnt(sides[0]) ? sides[1] : sides[0];
      }
      let sid = MP.shortOf.get(from);
      if (!sid) { sid = 'p' + (++MP.pidSeq); MP.shortOf.set(from, sid); MP.peerOf.set(sid, from); }
      N.toPeer(from, { t: 'welcome', id: sid });
      if (!player(sid)) MP.roster.push({ id: sid, name: (m.name || 'Scout').slice(0, 16), team: m.team, char: m.char, shifter: m.shifter, host: false, bot: false, k: 0, d: 0, a: 0, score: 0, streak: 0, best: 0, dsk: 0, ip: m.ip || null });
      fixPick(player(sid));
      if (MP.active) { N.toPeer(from, startMsg()); N.toPeer(from, { t: 'edits', e: [...MP.editLog.keys()].flatMap(k => k.split(',').map(Number)) }); N.toPeer(from, { t: 'fuelAll', list: G.fuel.list.map(d => ({ id: d.id, x: d.x, y: d.y, z: d.z })) }); }
      pushLobby();
      for (const h of CHAT.hist) N.toPeer(from, h);
      sysFeed(`${m.name || 'A scout'} joined`);
    });
    N.on('pick', (m, from) => { const p = player(MP.shortOf.get(from)); if (!p) return; Object.assign(p, { team: m.team, char: m.char, shifter: m.shifter, name: (m.name || p.name).slice(0, 16) }); fixPick(p); pushLobby(); if (MP.active && MP.match) { /* team change takes effect on next respawn */ } });
    N.on('st', (m, from) => {
      const pid = MP.shortOf.get(from);
      for (const r of m.s) { const o = dec(r); if (pidOf(o.id) !== pid) continue; MP.raw.set(o.id, r); applyState(o); }
      const p = player(pid); if (p) p.ping = m.pg;
    });
    N.on('pi', (m, from) => N.toPeer(from, { t: 'po', c: m.c }));
    N.onPeerLeave = (tp) => {
      const pid = MP.shortOf.get(tp); if (!pid) return;
      MP.shortOf.delete(tp); MP.peerOf.delete(pid);
      const p = player(pid); MP.roster = MP.roster.filter(q => q.id !== pid);
      for (const [id] of MP.raw) if (pidOf(id) === pid) { MP.raw.delete(id); removeEnt(id); }
      pushLobby(); if (p) sysFeed(`${p.name} left`);
    };
  } else {
    N.on('welcome', (m) => { MP.me.id = m.id; renderLobby(); });
    N.on('full', (m) => leaveMatch(m.why || 'That world is full.'));
    N.on('po', (m) => { MP.ping = Math.round(performance.now() - m.c); });
    N.on('lobby', (m) => { MP.roster = m.roster; MP.settings = m.settings; MP.net.code = m.code; const me = player(MP.me.id); if (me) Object.assign(MP.me, { team: me.team, char: me.char, shifter: me.shifter }); renderLobby(); });
    N.on('start', (m) => beginMatch(m));
    N.on('snap', (m) => {
      if (m.q <= MP.lastSnapQ) return;   // unordered channel: drop stale snapshots
      MP.lastSnapQ = m.q;
      for (const r of m.s) applyState(dec(r));
      MP.lastSnap = performance.now(); MP.hostT = m.mt;
    });
    N.on('ms', (m) => applyMatchState(m));
    N.on('edits', (m) => { const a = m.e; for (let i = 0; i < a.length; i += 3) queueEdit(a[i], a[i + 1], a[i + 2], 0); });
    N.on('fuelAll', (m) => { G.fuel.clear(); for (const d of m.list) G.fuel.add(d.id, d.x, d.y, d.z); });
    N.on('end', (m) => showEnd(m));
    N.on('lobbyBack', () => backToLobby());
    N.onHostLost = () => leaveMatch('Lost connection to the host.');
  }
}
// one shifter per type, valid teams for the mode
function fixPick(p) {
  if (!p) return;
  const sides = MODES[MP.settings.mode].sides;
  if (!sides.includes(p.team)) p.team = sides[0];
  if (p.team === 'titans') {
    const taken = new Set(MP.roster.filter(q => q !== p && q.team === 'titans' && !q.bot).map(q => q.shifter));
    if (!p.shifter || taken.has(p.shifter)) p.shifter = SHIFTER_TYPES.find(t => !taken.has(t)) || 'beast';
  } else {
    const roster = p.team === 'interior' ? INTERIOR_ROSTER : CORPS_ROSTER;
    if (!roster.includes(p.char)) p.char = roster[0];
  }
}
function sendPick() {
  if (isHost()) { const p = player(MP.me.id); Object.assign(p, { team: MP.me.team, char: MP.me.char, shifter: MP.me.shifter, name: MP.me.name }); fixPick(p); Object.assign(MP.me, { team: p.team, char: p.char, shifter: p.shifter }); pushLobby(); }
  else MP.net.toHost({ t: 'pick', team: MP.me.team, char: MP.me.char, shifter: MP.me.shifter, name: MP.me.name });
}

/* ---------------------------------------------------------------- lobby UI */
function showLobby() { if (MP.api) MP.api.showScreen('lobby'); $('mp-err').textContent = ''; renderLobby(); }
function renderLobby() {
  if (!MP.net) return;
  const s = MP.settings, mode = MODES[s.mode], host = isHost();
  $('lb-code').textContent = MP.net.mode === 'offline' ? 'PRACTICE' : MP.net.code;
  $('lb-link').style.display = MP.net.mode === 'peer' ? '' : 'none';
  $('lb-modename').textContent = mode.name; $('lb-modedesc').textContent = mode.desc;
  $('lb-modes').innerHTML = Object.entries(MODES).map(([k, m]) => `<button class="chip ${k === s.mode ? 'on' : ''}" data-mode="${k}" ${host ? '' : 'disabled'}>${m.name}</button>`).join('');
  // teams
  $('lb-teams').innerHTML = mode.sides.map(side => {
    const F = FACTIONS[side], list = MP.roster.filter(p => p.team === side && !p.bot);
    return `<div class="lbteam" style="--tc:${F.color}"><div class="lbth">${F.name}</div>
      ${list.map(p => `<div class="lbp ${p.id === MP.me.id ? 'me' : ''}">${p.host ? '<span class="crown">★</span>' : ''}${esc(p.name)}<span class="lbc">${side === 'titans' ? (kitInfo(p.shifter) ? labelShifter(p.shifter) : '') : esc((CHARACTERS[p.char] || {}).name || '')}</span></div>`).join('') || '<div class="lbp empty">No players yet</div>'}
      <button class="btn small join" data-team="${side}">${MP.me.team === side ? 'Your side' : 'Join ' + F.short}</button></div>`;
  }).join('');
  // picker
  const me = MP.me;
  if (me.team === 'titans') {
    const taken = new Set(MP.roster.filter(q => q.id !== me.id && q.team === 'titans').map(q => q.shifter));
    $('lb-pickh').textContent = 'Choose your titan';
    $('lb-pick').innerHTML = SHIFTER_TYPES.map(t => { const D = kitInfo(t); return `<div class="pcard ${me.shifter === t ? 'on' : ''} ${taken.has(t) ? 'taken' : ''}" data-shifter="${t}"><div class="pn">${labelShifter(t)}</div><div class="pt">${D.blurb}</div><div class="pa"><b>Q</b> ${D.Q.name}<br><b>E</b> ${D.E.name}<br><b>R</b> ${D.R.name}</div>${taken.has(t) ? '<div class="ptk">TAKEN</div>' : ''}</div>`; }).join('');
  } else {
    const roster = me.team === 'interior' ? INTERIOR_ROSTER : CORPS_ROSTER;
    $('lb-pickh').textContent = 'Choose your character';
    $('lb-pick').innerHTML = roster.map(id => { const c = CHARACTERS[id]; return `<div class="pcard ${me.char === id ? 'on' : ''}" data-char="${id}"><div class="pn">${c.name}</div><div class="pt">${c.title}</div><div class="pa">${c.perk}</div>${c.titan ? `<div class="ptitan">Titan form: ${labelShifter(c.titan)} (coming soon)</div>` : ''}</div>`; }).join('');
  }
  // settings (host edits, others read)
  const opt = (k, vals, labels) => `<div class="srow"><span>${labels[0]}</span><div>${vals.map((v, i) => `<button class="chip ${s[k] === v ? 'on' : ''}" data-set="${k}" data-val="${v}" ${host ? '' : 'disabled'}>${labels[i + 1]}</button>`).join('')}</div></div>`;
  $('lb-settings').innerHTML = (MP.net.mode === 'peer' ? opt('maxPlayers', [4, 6, 8, 12], ['Max players', '4', '6', '8', '12']) + opt('public', [true, false], ['Listed in the world browser', 'Yes', 'No']) : '')
    + opt('minutes', [8, 12, 16], ['Match length', '8 min', '12 min', '16 min'])
    + opt('bots', [true, false], ['Bots fill empty slots', 'On', 'Off'])
    + opt('diff', ['recruit', 'veteran', 'elite'], ['Bot skill', 'Recruit', 'Veteran', 'Elite'])
    + (s.mode === 'breach' ? opt('scoutBots', [2, 4, 6], ['Legion size (with bots)', '2', '4', '6']) + opt('shifterBots', [0, 1, 2], ['Bot champion titans', 'None', '1', '2']) + opt('density', [0.6, 1, 1.5], ['Wild titans', 'Few', 'Normal', 'Swarm'])
      : opt('teamSize', [2, 4, 6], ['Team size (with bots)', '2', '4', '6']) + opt('civilTitans', [true, false], ['Wild titans roam', 'Yes', 'No']))
;
  $('lb-start').style.display = host ? '' : 'none';
  $('lb-wait').style.display = host ? 'none' : '';
  $('lb-name').value = me.name;
}
function labelShifter(t) { return { beast: 'Hurler Titan', armored: 'Ironclad Titan', colossal: 'Behemoth Titan', female: 'Huntress Titan', jaw: 'Fang Titan', attack: 'Fury Titan' }[t] || t; }
function lobbyClick(e) {
  const b = e.target.closest('[data-mode],[data-team],[data-shifter],[data-char],[data-set]'); if (!b) return;
  Sfx.init(); Sfx.ui();
  if (b.dataset.mode && isHost()) { MP.settings.mode = b.dataset.mode; for (const p of MP.roster) fixPick(p); Object.assign(MP.me, (({ team, char, shifter }) => ({ team, char, shifter }))(player(MP.me.id))); pushLobby(); return; }
  if (b.dataset.set && isHost()) { const k = b.dataset.set, v = b.dataset.val; MP.settings[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v; pushLobby(); return; }
  if (b.dataset.team) { MP.me.team = b.dataset.team; if (b.dataset.team === 'interior' && !INTERIOR_ROSTER.includes(MP.me.char)) MP.me.char = 'kurt'; if (b.dataset.team === 'corps' && !CORPS_ROSTER.includes(MP.me.char)) MP.me.char = 'leroy'; }
  if (b.dataset.shifter && !b.classList.contains('taken')) MP.me.shifter = b.dataset.shifter;
  if (b.dataset.char) MP.me.char = b.dataset.char;
  localStorage.setItem('ts_mp_me', JSON.stringify({ name: MP.me.name, team: MP.me.team, char: MP.me.char, shifter: MP.me.shifter }));
  sendPick(); renderLobby();
}
function mpError(msg) { $('mp-err').textContent = msg; if (MP.api) MP.api.showScreen('mpmenu'); }

/* ======================================================================== match start / end */
function startMsg() { return { t: 'start', settings: MP.settings, roster: MP.roster.map(p => Object.assign({}, p, { ip: undefined })), mt: MP.match ? MP.match.t : 0 }; }
export function hostStart() {
  if (!isHost()) return;
  MP.roster = MP.roster.filter(p => !p.bot);
  for (const p of MP.roster) Object.assign(p, { k: 0, d: 0, a: 0, score: 0, streak: 0, best: 0, dsk: 0, limbs: 0, tk: 0, fastest: 0, deflects: 0, rt: null, ent: null, botRespawn: null });
  hostBots();
  const m = startMsg(); m.mt = 0;
  MP.net.broadcast(m);
  beginMatch(m);
}
function beginMatch(m) {
  MP.settings = m.settings; MP.roster = m.roster; MP.lastSnapQ = -1;
  SHIFTING.enabled = !!m.settings.shifting;
  const me = player(MP.me.id); if (me) Object.assign(MP.me, { team: me.team, char: me.char, shifter: me.shifter });
  const corps = MP.roster.filter(p => p.team === 'corps').length;
  MP.match = { phase: 'live', mode: m.settings.mode, t: m.mt || 0, len: m.settings.minutes * 60, legion: 0, legionTarget: Math.round((30 + 18 * Math.max(1, corps)) * m.settings.minutes / 12), district: 0, maxDistrict: 8400, titanKills: 0, kills: { corps: 0, interior: 0 }, pureT: 4, fuelT: 1, firstBlood: false, leader: null, warned: {} };
  MP.inLobby = false; MP.active = true; G.mode = 'mp'; MP.ents.clear(); MP.raw.clear(); MP.editLog.clear(); MP.editBuf = []; MP.dzBuf = 0; MP.feed = []; MP.respawnAt = null;
  wireHooks();
  // fresh world, scouts list, fuel
  MP.api.resetWorld();
  if (isHost()) setPinned(16);
  G.scouts.length = 0;
  clearBullets();
  spawnLocal(true);
  if (isHost()) { MP.roster = m.roster.map(p => Object.assign(player(p.id) || {}, p)); for (const p of MP.roster) if (p.bot) spawnBotEntity(p); }
  MP.api.startPlay(MODES[MP.settings.mode].name);
  $('mpboard').classList.remove('show'); $('mpend').classList.remove('show');
  renderTop(true);
  Sfx.horn();
  announceRoom(); trackSession();
}
function spawnLocal(first) {
  const me = MP.me, P = G.player, api = MP.api;
  MP.respawnAt = null; hideDeathOverlay();
  if (G.localTitan) { const old = G.localTitan; if (old.alive) old.remove(); G.titans = G.titans.filter(t => t !== old); }
  G.localTitan = null;
  if (me.team === 'titans') {
    const sp = spawnPoint('titans');
    const t = new Titan(me.shifter, sp.x, sp.z, { id: `${me.id}:t${++MP.gen}`, owner: me.id, ctrl: 'player', name: me.name, yaw: Math.PI });
    initPilotedTitan(t);
    G.titans.push(t); G.localTitan = t;
    P.id = myScoutId(); P.hidden = true; P.alive = false;
    G.scouts.splice(0, G.scouts.length, ...G.scouts.filter(s => s !== P));
    api.setTitanMode(t);
    P.yaw = 0; P.pitch = -0.12;   // titans spawn south of the wall and look north at it
  } else {
    P.id = myScoutId(); P.team = me.team; P.faction = me.team; P.hidden = false;
    api.setLocalChar(me.char);
    api.setTitanMode(null);
    api.resetPlayer(spawnPoint(me.team));
    P.invuln = 2.5;
    if (!G.scouts.includes(P)) G.scouts.unshift(P);
  }
  if (!first) Sfx.horn();
}
function backToLobby() {
  endLocal();
  MP.inLobby = true; showLobby();
}
function endLocal() {
  MP.active = false; G.mode = 'sp';
  for (const [, e] of MP.ents) if (e.dispose) e.dispose();
  MP.ents.clear(); MP.raw.clear();
  if (MP.api) MP.api.clearMatch();
  G.localTitan = null; setPinned(0); clearBullets(); unwireHooks(); G.mode = 'sp';
  G.scouts.length = 0; if (G.player) G.scouts.push(G.player);
  hideDeathOverlay(); clearWarns();
  $('mpend').classList.remove('show'); $('mpend').innerHTML = ''; $('mpboard').classList.remove('show');
}
export function leaveMatch(msg) {
  const was = MP.active || MP.inLobby;
  if (MP.net && MP.net.isHost && MP.net.mode === 'peer') roomClose(MP.net.code);
  endLocal(); MP.inLobby = false;
  if (MP.net) { MP.net.close(); MP.net = null; }
  chatClear();
  if (MP.api) MP.api.showScreen('mpmenu');
  if (msg && was) $('mp-err').textContent = msg;
  trackSession();
}
function hostCheckEnd() {
  const M = MP.match; if (M.phase !== 'live') return;
  let winner = null, why = '';
  if (M.mode === 'breach') {
    if (M.district >= M.maxDistrict) { winner = 'titans'; why = 'Haverwall has fallen'; }
    else if (M.legion >= M.legionTarget) { winner = 'corps'; why = 'The Legion broke the assault'; }
    else if (M.t >= M.len) { winner = 'corps'; why = 'The wall held until dusk'; }
    // warnings
    const pct = M.district / M.maxDistrict;
    for (const w of [0.5, 0.75, 0.9]) if (pct >= w && !M.warned['d' + w]) { M.warned['d' + w] = true; announce(`DISTRICT ${Math.round(w * 100)}% DESTROYED`, w === 0.5 ? 'Reinforcements: the Legion respawns 40% faster' : 'Hold the line!', '#ff7a5a', 0); }
  } else {
    const target = 25;
    if (M.kills.corps >= target) { winner = 'corps'; why = `First to ${target} eliminations`; }
    else if (M.kills.interior >= target) { winner = 'interior'; why = `First to ${target} eliminations`; }
    else if (M.t >= M.len) { winner = M.kills.corps === M.kills.interior ? 'draw' : M.kills.corps > M.kills.interior ? 'corps' : 'interior'; why = 'Time'; }
  }
  if (M.len - M.t < 60 && !M.warned.min) { M.warned.min = true; announce('ONE MINUTE LEFT', '', '#ffd36a', 0); }
  if (!winner) return;
  M.phase = 'over';
  const msg = { t: 'end', winner, why, roster: MP.roster.map(p => ({ id: p.id, name: p.name, team: p.team, char: p.char, shifter: p.shifter, bot: p.bot, k: p.k, d: p.d, a: p.a, score: p.score, best: p.best, limbs: p.limbs || 0, fastest: p.fastest || 0, deflects: p.deflects || 0 })), legion: M.legion, district: M.district / M.maxDistrict, kills: M.kills, mode: M.mode };
  MP.net.broadcast(msg); showEnd(msg); announceRoom();
}

/* ======================================================================== replication */
function applyState(o) {
  if (o.id === (G.player && G.player.id) && !G.localTitan) return;
  if (G.localTitan && o.id === G.localTitan.id) return;
  let e = MP.ents.get(o.id);
  if (o.k === 's') {
    if (!e) {
      const p = player(pidOf(o.id));
      e = new RemoteScout({ id: o.id, name: o.n || (p ? p.name : 'Scout'), char: o.c || (p ? p.char : 'recruit'), faction: o.fa || (p ? p.team : 'corps'), team: o.fa || (p ? p.team : 'corps') });
      MP.ents.set(o.id, e); G.scouts.push(e);
    }
    e.seen = performance.now(); e.netApply(o);
  } else if (o.k === 't') {
    let t = G.titans.find(q => q.id === o.id);
    if (!t) {
      if (o.s === 'dissolve') return;
      const p = player(pidOf(o.id));
      t = new Titan(o.ty, o.p[0], o.p[2], { id: o.id, remote: true, owner: ownerOf(o.id), name: o.n || (p ? p.name : ''), y: o.p[1] });
      if (t.T.shifter) attachKit(t);
      t.yaw = o.y; G.titans.push(t); MP.ents.set(o.id, t);
    }
    t.seen = performance.now();
    if (o.s === 'dying' && t.alive) t.kill({});
    t.netApply(o);
  }
}
function removeEnt(id) {
  const e = MP.ents.get(id); if (!e) return;
  MP.ents.delete(id);
  if (e.isScout) { e.dispose(); const i = G.scouts.indexOf(e); if (i >= 0) G.scouts.splice(i, 1); }
  else if (e.remove) { e.remove(); G.titans = G.titans.filter(t => t !== e); }
}
function myStates() {
  const out = [];
  if (G.localTitan) out.push(enc(G.localTitan.netState()));
  else if (G.player) out.push(enc(scoutStateOf(G.player)));
  return out;
}
// where a recipient is (their scout or titan), for interest management
function focusOf(pid) {
  for (const [id, r] of MP.raw) if (pidOf(id) === pid) return r[0] === 0 ? [r[2], r[4]] : [r[3], r[5]];
  return null;
}
const BUSY = new Set([2, 3, 4, 6, 9, 11, 12]);   // windup strike lunge holding leap charge dying
function hostSnapshot() {
  MP.tick++;
  const all = myStates().map(r => ({ r, pid: MP.me.id }));
  for (const [, e] of MP.ents) if (e.bot && e.isScout) all.push({ r: enc(e.netState()), pid: pidOf(e.id) });
  for (const t of G.titans) if (!t.remote && t !== G.localTitan) all.push({ r: enc(t.netState()), pid: pidOf(t.id), titan: true, pure: !t.T.shifter, busy: !t.alive || ['windup', 'strike', 'lunge', 'holding', 'leap', 'charge'].includes(t.state) });
  for (const [id, r] of MP.raw) all.push({ r, pid: pidOf(id), titan: r[0] === 1, busy: r[0] === 1 && BUSY.has(r[7]) });
  const q = ++MP.snapSeq;
  let bytes = 0;
  for (const [tp] of MP.net.peers) {
    const pid = MP.shortOf.get(tp); if (!pid) continue;
    const f = focusOf(pid);
    const out = [];
    for (const e of all) {
      if (e.pid === pid) continue;
      // far entities update less often; slow pure titans at 10 Hz unless mid-attack
      const x = e.r[0] === 0 ? e.r[2] : e.r[3], z = e.r[0] === 0 ? e.r[4] : e.r[5];
      const far = f ? Math.hypot(x - f[0], z - f[1]) > 190 : false;
      const every = far ? 4 : (e.pure && !e.busy ? 2 : 1);
      if (MP.tick % every) continue;
      out.push(e.r);
    }
    const msg = { t: 'snap', q, mt: Math.round(MP.match.t * 100) / 100, s: out };
    MP.net.toPeer(tp, msg, true);
    if (MP.net.measure) bytes += JSON.stringify(msg).length;
  }
  if (MP.net.measure) MP.snapBytes = bytes;
}
function matchState() {
  const M = MP.match;
  return { t: 'ms', mt: M.t, ph: M.phase, lg: M.legion, lgT: M.legionTarget, ds: M.district, dsM: M.maxDistrict, ki: M.kills, mode: M.mode,
    r: MP.roster.map(p => [p.id, p.name, p.team, p.k, p.d, p.a, p.score, p.streak, p.bot ? 1 : 0, p.rt ?? null, p.char, p.shifter, p.ping ?? null]) };
}
function applyMatchState(m) {
  const M = MP.match; if (!M) return;
  M.t = m.mt; M.phase = m.ph; M.legion = m.lg; M.legionTarget = m.lgT; M.district = m.ds; M.maxDistrict = m.dsM; M.kills = m.ki;
  MP.roster = m.r.map(a => ({ id: a[0], name: a[1], team: a[2], k: a[3], d: a[4], a: a[5], score: a[6], streak: a[7], bot: !!a[8], rt: a[9], char: a[10], shifter: a[11], ping: a[12] }));
  const me = player(MP.me.id);
  if (me && me.rt && !MP.respawnAt && MP.localDeadAt) MP.respawnAt = me.rt;
}

/* ======================================================================== per-frame */
export function mpUpdate(dt, rawDt) {
  if (!MP.active) return;
  const M = MP.match, host = isHost();
  if (M.phase === 'live') M.t += rawDt;
  G.matchTime = M.t;
  // flush block edits (owner side), batched at 10 Hz
  MP.editT -= rawDt;
  if (MP.editBuf.length && MP.editT <= 0) {
    MP.editT = 0.1;
    const b = MP.editBuf, dz = MP.dzBuf; MP.editBuf = []; MP.dzBuf = 0;
    if (host) { for (let i = 0; i < b.length; i += 3) MP.editLog.set(b[i] + ',' + b[i + 1] + ',' + b[i + 2], 0); M.district += dz; }
    send({ e: 'blocks', b, dz });
  }
  // bots and replicas
  for (const [, e] of MP.ents) if (e.isScout) e.update(dt);
  if (host) {
    for (const p of MP.roster) if (p.bot && p.botRespawn !== null && p.botRespawn !== undefined && M.t >= p.botRespawn) spawnBotEntity(p);
    for (const p of MP.roster) if (p.bot && p.team === 'titans' && !p.ent) spawnBotEntity(p);
    for (const t of G.titans) if (t.rageT > 0 && (t.rageT -= dt) <= 0) { t.rage = 1; t.speed = t.T.speed; }
    if (M.phase === 'live') { hostPureSpawner(dt); hostFuel(dt); hostCheckEnd(); }
    // remove dissolved titans' bookkeeping
    for (const p of MP.roster) if (p.bot && p.team === 'titans' && p.ent && !G.titans.find(t => t.id === p.ent && t.alive) && !p.botRespawn) p.ent = null;
  }
  // stale replicas
  const now = performance.now();
  for (const [id, e] of MP.ents) if (!e.bot && e.seen && now - e.seen > 3000) removeEnt(id);
  // local respawn
  if (MP.respawnAt !== null && M.t >= MP.respawnAt) spawnLocal(false);
  // backup: if the respawn message never arrived, use the time from the scoreboard (or a fallback)
  if (MP.localDeadAt && MP.respawnAt === null) {
    const me = player(MP.me.id);
    if (me && me.rt && me.rt > M.t - 1) MP.respawnAt = me.rt;
    else if (G.time - MP.localDeadAt > 4) MP.respawnAt = M.t + Math.round(5 + 1.6 * Math.min(12, M.t / 60));
  }
  // network ticks
  MP.snapT -= rawDt;
  if (MP.snapT <= 0) {
    MP.snapT = SNAP_DT;
    if (host) hostSnapshot();
    else MP.net.toHost({ t: 'st', s: myStates(), pg: MP.ping || 0 }, true);
  }
  if (host) { MP.msT -= rawDt; if (MP.msT <= 0) { MP.msT = MS_DT; const ms = matchState(); MP.net.broadcast(ms); if ((MP.annT = (MP.annT || 0) - MS_DT) <= 0) { MP.annT = 20; announceRoom(); } } }
  else { MP.pingT -= rawDt; if (MP.pingT <= 0) { MP.pingT = 2; MP.net.toHost({ t: 'pi', c: performance.now() }); } }
  updateBullets(dt); updateSpikes(dt); updateWarns(dt);
  renderTop(false); updateDeathOverlay(); if (MP.boardOpen) renderBoard();
}

/* ======================================================================== HUD: top bar, feed, board, death, warnings, end */
let topLast = '';
function renderTop(force) {
  const M = MP.match; if (!M) return;
  const left = Math.max(0, M.len - M.t), mm = Math.floor(left / 60), ss = Math.floor(left % 60);
  let html;
  if (M.mode === 'breach') {
    const dp = Math.min(100, M.district / M.maxDistrict * 100), lp = Math.min(100, M.legion / M.legionTarget * 100);
    const inside = G.titans.filter(t => t.alive && Math.max(Math.abs(t.pos.x), Math.abs(t.pos.z)) < DR).length;
    html = `<div class="mt-time">${mm}:${String(ss).padStart(2, '0')}</div>
      <div class="mt-bars"><div class="mt-side corps"><span>LEGION ${M.legion}/${M.legionTarget}</span><div class="mt-bar"><div style="width:${lp.toFixed(1)}%"></div></div></div>
      <div class="mt-side titans"><span>DISTRICT DESTROYED ${dp.toFixed(0)}%${inside ? ` · <b class="inside">${inside} INSIDE</b>` : ''}</span><div class="mt-bar"><div style="width:${dp.toFixed(1)}%"></div></div></div></div>`;
  } else {
    html = `<div class="mt-time">${mm}:${String(ss).padStart(2, '0')}</div><div class="mt-score"><span class="corps">${M.kills.corps || 0}</span><span class="vs">SKYWARD LEGION · FIRST TO 25 · INTERIOR SQUAD</span><span class="interior">${M.kills.interior || 0}</span></div>`;
  }
  const me = player(MP.me.id);
  const meLine = me ? `<div class="mt-me">${me.k} K · ${me.d} D · ${me.a} A · <b>${(me.score || 0).toLocaleString()}</b>${me.streak >= 3 ? ` · <span class="bounty">BOUNTY ×${me.streak}</span>` : ''}</div>` : '';
  html += meLine;
  if (html !== topLast || force) { topLast = html; $('mptop').innerHTML = html; }
}
function pushFeed(f) {
  const el = document.createElement('div'); el.className = 'kf';
  const col = (t) => (FACTIONS[t] || FACTIONS.titans).color;
  const icon = f.devour ? '🦷' : f.tt ? '✊' : '⚔';
  el.innerHTML = f.sys ? `<span class="sys">${esc(f.sys)}</span>` : (f.k ? `<b style="color:${col(f.kt)}">${esc(f.k)}</b> <span class="ic">${icon}</span> ` : '') + `<b style="color:${col(f.vt)}">${esc(f.v)}</b> <span class="how">${esc(f.how || '')}</span>`;
  if (f.k === MP.me.name || f.v === MP.me.name || (f.v || '').startsWith(MP.me.name + ' (')) el.classList.add('mine');
  $('mpfeed').prepend(el);
  while ($('mpfeed').children.length > 6) $('mpfeed').lastChild.remove();
  setTimeout(() => el.classList.add('old'), 7000); setTimeout(() => el.remove(), 9000);
  if (f.k === MP.me.name && !f.sys) Sfx.killDing();
}
function sysFeed(text) { if (MP.active) pushFeed({ sys: text }); }
export function setBoard(open) { MP.boardOpen = open; $('mpboard').classList.toggle('show', open); if (open) renderBoard(); }
function renderBoard() {
  const M = MP.match; if (!M) return;
  const sides = MODES[M.mode].sides;
  const rows = (side) => MP.roster.filter(p => p.team === side).sort((a, b) => b.score - a.score).map(p => {
    const dead = p.rt && p.rt > M.t ? `<span class="rsp">${Math.ceil(p.rt - M.t)}s</span>` : '';
    const role = side === 'titans' ? labelShifter(p.shifter) : (CHARACTERS[p.char] || {}).name || '';
    return `<tr class="${p.id === MP.me.id ? 'me' : ''}"><td class="nm">${esc(p.name)}${p.bot ? ' <span class="bot">BOT</span>' : ''}${p.streak >= 3 ? ' <span class="bounty">×' + p.streak + '</span>' : ''} ${dead}</td><td class="rl">${esc(role)}</td><td>${p.k}</td><td>${p.d}</td><td>${p.a}</td><td class="sc">${(p.score || 0).toLocaleString()}</td><td class="pg">${p.bot ? '' : p.id === MP.me.id && isHost() ? 'host' : p.ping ? p.ping + 'ms' : ''}</td></tr>`;
  }).join('');
  const meP = player(MP.me.id), nextRt = meP ? respawnTime(Object.assign({}, meP, { dsk: (meP.dsk || 0) + 1 }), meP.team === 'titans') : Math.round(5 + 1.6 * Math.min(12, M.t / 60));
  $('mpboard').innerHTML = `<div class="bd-h">${MODES[M.mode].name} <span>Respawn now takes ${nextRt}s and grows as the battle goes on</span></div>` + sides.map(side => `<div class="bd-team" style="--tc:${FACTIONS[side].color}"><div class="bd-th">${FACTIONS[side].name}</div><table><tr><th>Name</th><th>Role</th><th>K</th><th>D</th><th>A</th><th>Score</th><th></th></tr>${rows(side)}</table></div>`).join('');
}
// death / respawn overlay (spectates the killer)
function showDeathOverlay(reason, killerId) {
  MP.deathInfo = { reason, killerId };
  $('mpdead').classList.add('show');
  $('mpdead-why').textContent = reason || '';
  $('mpdead-by').textContent = killerId ? `Killed by ${displayName(killerId)}` : '';
}
function hideDeathOverlay() { $('mpdead').classList.remove('show'); MP.localDeadAt = 0; MP.deathInfo = null; }
function updateDeathOverlay() {
  if (!$('mpdead').classList.contains('show')) return;
  const M = MP.match;
  const left = MP.respawnAt !== null ? Math.max(0, MP.respawnAt - M.t) : null;
  const txt = left === null ? '…' : Math.ceil(left);
  if ($('mpdead-t').textContent !== String(txt)) { $('mpdead-t').textContent = txt; if (left !== null && left <= 3 && left > 0) Sfx.countdown(false); }
}
export function spectateTarget() {
  if (!MP.deathInfo || !MP.deathInfo.killerId) return null;
  const e = entity(MP.deathInfo.killerId);
  return e && e.pos ? e : null;
}
// ground warnings (bombardment, wall breaker, cataclysm)
const warns = [];
const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
function showWarn(w) {
  const g = new THREE.RingGeometry(w.r * 0.94, w.r, 64); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, warnMat.clone()); m.position.set(w.x, w.y + 0.3, w.z); m.renderOrder = 5; scene.add(m);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(w.r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.08, depthWrite: false })); fill.position.copy(m.position); scene.add(fill);
  warns.push({ m, fill, t: w.t, T: w.t, w });
  const P = G.player, d = Math.hypot(P.pos.x - w.x, P.pos.z - w.z);
  if (!G.localTitan && d < w.r + 40 && MP.api) MP.api.bigMsg(w.label || 'DANGER', d < w.r ? 'GET CLEAR!' : 'Stay out of the circle', '#ff6a50', Math.min(3, w.t));
  if (w.big) Sfx.siren();
}
function updateWarns(dt) {
  for (let i = warns.length - 1; i >= 0; i--) {
    const W_ = warns[i]; W_.t -= dt;
    const p = 0.5 + 0.5 * Math.sin(G.time * (6 + (1 - W_.t / W_.T) * 20));
    W_.m.material.opacity = 0.25 + 0.5 * p; W_.fill.material.opacity = 0.05 + 0.12 * (1 - W_.t / W_.T);
    if (W_.t <= 0) { scene.remove(W_.m); scene.remove(W_.fill); warns.splice(i, 1); }
  }
}
function clearWarns() { for (const W_ of warns) { scene.remove(W_.m); scene.remove(W_.fill); } warns.length = 0; }
// end screen: podium + awards
function showEnd(m) {
  if (MP.match) MP.match.phase = 'over';
  const myTeam = MP.me.team, won = m.winner === myTeam;
  const sorted = [...m.roster].sort((a, b) => b.score - a.score);
  const best = (f, min = 1) => { const p = [...m.roster].sort((a, b) => (b[f] || 0) - (a[f] || 0))[0]; return p && (p[f] || 0) >= min ? p : null; };
  const awards = [
    ['MVP', sorted[0], sorted[0] ? sorted[0].score.toLocaleString() + ' pts' : ''],
    ['Top slayer', best('k'), (p) => p.k + ' kills'],
    ['Best streak', best('best', 3), (p) => p.best + ' in a row'],
    ['Fastest nape cut', best('fastest', 30), (p) => Math.round(p.fastest) + ' km/h'],
    ['Limb surgeon', best('limbs', 3), (p) => p.limbs + ' limbs'],
    ['Bullet dancer', best('deflects', 1), (p) => p.deflects + ' deflects']
  ].filter(a => a[1]).map(([t, p, v]) => `<div class="aw"><div class="awt">${t}</div><div class="awn">${esc(p.name)}</div><div class="awv">${typeof v === 'function' ? v(p) : v}</div></div>`).join('');
  const title = m.winner === 'draw' ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
  $('mpend').innerHTML = `<div class="panel wide"><h1 class="${won ? 'win' : 'lose'}">${title}</h1><div class="sub">${esc((FACTIONS[m.winner] || { name: '' }).name)} ${m.winner === 'draw' ? '' : 'win'} · ${esc(m.why)}</div>
    <div class="podium">${sorted.slice(0, 3).map((p, i) => `<div class="pod p${i + 1}"><div class="pn">${esc(p.name)}</div><div class="ps">${p.score.toLocaleString()}</div><div class="pb">${i + 1}</div></div>`).join('')}</div>
    <div class="awards">${awards}</div>
    <div class="brow">${isHost() ? '<button class="btn primary" id="mp-rematch">Back to lobby</button>' : '<div class="sub">Waiting for the host…</div>'}<button class="btn" id="mp-leave2">Leave</button></div></div>`;
  $('mpend').classList.add('show');
  if (MP.api) MP.api.endPlay();
  Sfx.fanfare(); Music.target = 0.25;
  const rb = $('mp-rematch'); if (rb) rb.onclick = () => { Sfx.ui(); MP.net.broadcast({ t: 'lobbyBack' }); backToLobby(); };
  $('mp-leave2').onclick = () => { Sfx.ui(); leaveMatch(); };
}


/* ======================================================================== chat */
// In a match, Enter opens a chat line without pausing: you keep flying and aiming, only the keys go to
// the text box. Tab switches All / Team, Enter sends, Esc closes. In the lobby and on the end screen the
// box stays open. The host rate-limits, cleans and routes every line (team lines only reach your side).
// /mute name and /unmute name hide a player for you; the pause menu can turn chat off.
const CHAT = { open: false, team: false, closedAt: 0, muted: new Set(), off: false, draft: '', hist: [] };
try { CHAT.off = localStorage.getItem('ts_chat_off') === '1'; } catch (e) { /* ignore */ }
const SLURS = /\b(n[i1!]gg+(?:a|ah|er|uh)s?|f[a@]gg?(?:ot)?s?|r[e3]t[a@]rd(?:s|ed)?|k[i1]kes?|ch[i1]nks?|sp[i1]cs?|tr[a@]nn(?:y|ies))\b/gi;
function chatClean(t) {
  return String(t || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120).replace(SLURS, m => '*'.repeat(m.length));
}
const chatPlaying = () => !!(MP.active && MP.api && MP.api.gameState && MP.api.gameState() === 'play');
const chatOn = () => !!(MP.net && MP.net.mode !== 'offline');
G.chatBusy = () => CHAT.open || performance.now() - CHAT.closedAt < 600;
// host: check and route one line
function hostSay(m, from) {
  const p = player(MP.shortOf.get(from)); if (!p || p.bot) return;
  const text = chatClean(m.text); if (!text) return;
  const now = performance.now() / 1000;
  p.chatT = (p.chatT || []).filter(t => now - t < 30);
  if (p.chatT.filter(t => now - t < 5).length >= 3 || p.chatT.length >= 10 || (text === p.chatLast && now - p.chatLastT < 15)) {
    MP.net.toPeer(from, { t: 'chat', sys: 'Slow down: you are sending messages too fast.' }); return;
  }
  p.chatT.push(now); p.chatLast = text; p.chatLastT = now;
  const msg = { t: 'chat', id: p.id, name: p.name, side: p.team, team: !!m.team, text };
  if (!msg.team) { CHAT.hist.push(msg); if (CHAT.hist.length > 12) CHAT.hist.shift(); }
  for (const q of MP.roster) {
    if (q.bot || (msg.team && q.team !== p.team)) continue;
    const tp = MP.peerOf.get(q.id); if (tp) MP.net.toPeer(tp, msg);
  }
}
function showChat(m) {
  if (!m.sys && (CHAT.off || CHAT.muted.has(String(m.name).toLowerCase()))) return;
  const log = $('chatlog'); if (!log) return;
  const el = document.createElement('div'); el.className = 'cl' + (m.sys ? ' sys' : '');
  if (m.sys) el.textContent = m.sys;
  else el.innerHTML = `${m.team ? '<span class="ct">[TEAM]</span> ' : ''}<b style="color:${(FACTIONS[m.side] || {}).color || '#ddd'}">${esc(m.name)}</b>: ${esc(m.text)}`;
  log.append(el); while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  setTimeout(() => el.classList.add('old'), 10000);
}
function chatSend(raw) {
  const text = String(raw || '').trim(); if (!text || !chatOn()) return;
  const cmd = text.match(/^\/(mute|unmute)\s+(.+)$/i);
  if (cmd) {
    const want = cmd[2].trim().toLowerCase(), p = MP.roster.find(q => !q.bot && q.id !== MP.me.id && q.name.toLowerCase().startsWith(want));
    const name = p ? p.name : cmd[2].trim();
    if (cmd[1].toLowerCase() === 'mute') CHAT.muted.add(name.toLowerCase()); else CHAT.muted.delete(name.toLowerCase());
    showChat({ sys: cmd[1].toLowerCase() === 'mute' ? `Muted ${name}. You won't see their messages. /unmute ${name} to undo.` : `Unmuted ${name}.` });
    return;
  }
  if (/^\/(help|\?|commands)$/i.test(text)) { showChat({ sys: 'Enter: chat. Tab: switch All / Team. /mute name, /unmute name. Turn chat off in the Esc menu.' }); return; }
  if (CHAT.off) { showChat({ sys: 'Chat is off. Turn it back on in the Esc menu.' }); return; }
  MP.net.toHost({ t: 'say', text: text.slice(0, 120), team: CHAT.team });
}
function chatLabel() {
  const ch = $('chatch'); if (!ch) return;
  ch.textContent = CHAT.team ? 'TEAM' : 'ALL'; ch.classList.toggle('team', CHAT.team);
  $('chatin').placeholder = TOUCH.on ? 'Say something · tap ' + (CHAT.team ? 'TEAM' : 'ALL') + ' to switch' : chatPlaying() ? 'Say something · Tab: All / Team · Enter: send · Esc: close' : 'Press Enter to chat · Tab: All / Team';
}
// where the box sits: a panel in the lobby, bottom-left over the match HUD and the end screen
function chatPlace() {
  const box = $('chat'); if (!box) return;
  const on = chatOn();
  box.style.display = on ? '' : 'none';
  $('lb-chatp').style.display = on ? '' : 'none';
  $('lb-row2').classList.toggle('three', on);
  if (!on) { if (CHAT.open) { CHAT.open = false; CHAT.closedAt = performance.now(); } return; }
  const inLobby = $('lobby').classList.contains('show'), ended = $('mpend').classList.contains('show');
  const slot = inLobby ? $('lb-chat') : document.body;
  if (box.parentNode !== slot) slot.append(box);
  const typing = inLobby || ended || CHAT.open;
  box.classList.toggle('inlobby', inLobby); box.classList.toggle('full', typing); box.classList.toggle('typing', typing);
  // sit just above the health panel (scout or titan), whatever its height
  let bottom = '', top = '';
  box.classList.toggle('tt', !inLobby && TOUCH.on);
  if (!inLobby && TOUCH.on) {
    const v = ended ? null : G.localTitan ? document.querySelector('.tside') : document.querySelector('#hud .bl');
    const r = v && v.getClientRects().length ? v.getBoundingClientRect() : null;
    top = (CHAT.open || !r ? 6 : Math.round(r.bottom + 6)) + 'px'; bottom = 'auto';
  } else if (!inLobby) {
    const panel = ended ? null : G.localTitan ? document.querySelector('.tside') : document.querySelector('#hud .bl');
    const r = panel && panel.getClientRects().length ? panel.getBoundingClientRect() : null;
    bottom = (r && r.height ? Math.round(innerHeight - r.top + 10) : 22) + 'px';
  }
  if (box.style.bottom !== bottom) box.style.bottom = bottom;
  if (box.style.top !== top) box.style.top = top;
}
function chatOpen(team) {
  CHAT.open = true; if (team !== undefined) CHAT.team = !!team; chatLabel();
  if (MP.api.releaseInput) MP.api.releaseInput();
  chatPlace();
  const inp = $('chatin'); if (CHAT.draft) inp.value = CHAT.draft; inp.focus();
}
function chatClose(relock) {
  const inp = $('chatin');
  CHAT.open = false; CHAT.closedAt = performance.now(); CHAT.draft = inp.value;
  inp.blur(); chatPlace();
  if (relock && MP.api.relock) MP.api.relock();
  setTimeout(() => { if (chatPlaying() && !TOUCH.on && !document.pointerLockElement && MP.api.toast) MP.api.toast('Click to keep playing', 1.6); }, 150);
}
function chatClear() { const log = $('chatlog'); if (log) log.innerHTML = ''; CHAT.hist = []; CHAT.open = false; CHAT.draft = ''; }
function initChat() {
  const inp = $('chatin');
  chatLabel();
  $('chatch').onclick = () => { CHAT.team = !CHAT.team; chatLabel(); inp.focus(); };
  inp.addEventListener('blur', () => { if (CHAT.open && chatPlaying()) { CHAT.open = false; CHAT.closedAt = performance.now(); CHAT.draft = inp.value; chatPlace(); } });
  $('chaton').checked = !CHAT.off;
  $('chaton').onchange = (e) => { CHAT.off = !e.target.checked; try { localStorage.setItem('ts_chat_off', CHAT.off ? '1' : '0'); } catch (er) { /* ignore */ } $('chat').classList.toggle('muted', CHAT.off); };
  $('chat').classList.toggle('muted', CHAT.off);
  // capture phase, so the game never sees keys typed into the box
  window.addEventListener('keydown', (e) => {
    if (!chatOn()) return;
    const focused = document.activeElement === inp;
    if (focused) {
      e.stopImmediatePropagation();
      if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) { CHAT.team = !CHAT.team; chatLabel(); } return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter') { e.preventDefault(); chatSend(inp.value); inp.value = ''; CHAT.draft = ''; if (chatPlaying()) chatClose(true); return; }
      if (e.code === 'Escape') { if (chatPlaying()) chatClose(false); else inp.blur(); }
      return;
    }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !/INPUT|TEXTAREA|SELECT|BUTTON/.test((document.activeElement && document.activeElement.tagName) || '')) {
      const where = chatPlaying() || $('lobby').classList.contains('show') || $('mpend').classList.contains('show');
      if (where) { e.preventDefault(); e.stopImmediatePropagation(); chatOpen(e.shiftKey ? true : undefined); }
    }
  }, true);
  // phone buttons act on pointerdown and keep the focus, or the blur would hide them before the click lands
  $('chatsend').addEventListener('pointerdown', (e) => { e.preventDefault(); chatSend(inp.value); inp.value = ''; CHAT.draft = ''; if (chatPlaying()) chatClose(true); });
  $('chatx').addEventListener('pointerdown', (e) => { e.preventDefault(); if (chatPlaying()) chatClose(false); else inp.blur(); });
  G.chatOpen = () => { if (chatOn()) chatOpen(); };
  G.chatAvail = chatOn;
  setInterval(chatPlace, 250);
}

/* ======================================================================== menu wiring */
export function initMP(api) {
  MP.api = api;
  initChat();
  const saved = JSON.parse(localStorage.getItem('ts_mp_me') || '{}');
  Object.assign(MP.me, { name: saved.name || 'Scout ' + makeCode(3), team: saved.team || 'corps', char: CHARACTERS[saved.char] ? saved.char : 'leroy', shifter: saved.shifter || 'beast' });
  $('mp-name').value = MP.me.name;
  const nameIn = (v) => { MP.me.name = (v || '').trim().slice(0, 16) || MP.me.name; localStorage.setItem('ts_mp_me', JSON.stringify({ name: MP.me.name, team: MP.me.team, char: MP.me.char, shifter: MP.me.shifter })); };
  $('mp-name').onchange = (e) => nameIn(e.target.value);
  $('lb-name').onchange = (e) => { nameIn(e.target.value); sendPick(); };
  const local = new URLSearchParams(location.search).get('net') === 'local';
  $('mp-host').onclick = () => { Sfx.init(); Sfx.ui(); nameIn($('mp-name').value); $('mp-err').textContent = 'Opening a room…'; hostRoom(local ? 'local' : 'peer'); };
  $('mp-quick').onclick = () => { Sfx.init(); Sfx.ui(); nameIn($('mp-name').value); quickPlay(); };
  $('mp-refresh').onclick = () => { Sfx.ui(); renderWorlds(); };
  $('mp-worlds').addEventListener('click', (e) => { const b = e.target.closest('[data-world]'); if (!b || b.disabled) return; Sfx.ui(); nameIn($('mp-name').value); $('mp-err').textContent = 'Connecting…'; joinRoom(b.dataset.world, 'peer', true); });
  detect().then(ok => {
    $('mp-quick').style.display = ok ? '' : 'none'; $('mp-lobbies').style.display = ok ? '' : 'none';
    if (!ok) return;
    sessionStart(MP.me.name);
    // poll only while someone is looking: the lobby list on the MP screen, the live count on the title screen
    setInterval(() => { if ($('mpmenu').classList.contains('show') && !document.hidden) renderWorlds(); }, 5000);
    setInterval(() => { if (!document.hidden) titleCount(); }, 20000);
    titleCount();
    new MutationObserver(() => { if ($('mpmenu').classList.contains('show')) renderWorlds(); }).observe($('mpmenu'), { attributes: true, attributeFilter: ['class'] });
  });
  $('mp-practice').onclick = () => { Sfx.init(); Sfx.ui(); nameIn($('mp-name').value); $('mp-err').textContent = ''; hostRoom('offline'); };
  $('mp-join').onclick = () => { Sfx.init(); Sfx.ui(); nameIn($('mp-name').value); const c = $('mp-code').value; if (!c.trim()) { $('mp-err').textContent = 'Enter a room code'; return; } $('mp-err').textContent = 'Connecting…'; joinRoom(c, local ? 'local' : 'peer'); };
  $('mp-back').onclick = () => { Sfx.ui(); api.showScreen('title'); };
  $('lobby').addEventListener('click', lobbyClick);
  $('lb-start').onclick = () => { Sfx.init(); Sfx.ui(); hostStart(); };
  $('lb-leave').onclick = () => { Sfx.ui(); leaveMatch(); };
  $('lb-link').onclick = () => { const u = location.origin + location.pathname + '?join=' + MP.net.code; navigator.clipboard && navigator.clipboard.writeText(u); $('lb-link').textContent = 'Link copied'; setTimeout(() => $('lb-link').textContent = 'Copy invite link', 1500); };
  const q = new URLSearchParams(location.search);
  if (q.get('join')) { $('mp-code').value = q.get('join'); }
}

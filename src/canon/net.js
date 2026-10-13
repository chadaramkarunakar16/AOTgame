/* =========================================================================
   Networking: a host-authoritative star. One player hosts (their browser runs
   the bots, the AI titans and the match); everyone else connects to the host.
   Transports:
   - PeerJS (WebRTC data channels, public signalling) · real games over the internet
   - BroadcastChannel · several tabs of the same browser (local testing, ?net=local)
   - Offline · practice against bots, no network at all
   Messages are plain JSON objects with a `t` type field.
   ========================================================================= */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(n = 5) { let s = ''; for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
const PEER_PREFIX = 'tsg-mp-';
// ?relay=1 forces TURN relays (to test the fallback path players behind strict NATs get)
const RELAY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('relay');
let ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
// add TURN relays from the site's /api/ice (Twilio) when the backend is there
let iceLoaded = null;
export function loadIce() {
  if (iceLoaded) return iceLoaded;
  const online = location.protocol === 'https:' || /^874\d$/.test(location.port);
  iceLoaded = !online ? Promise.resolve() : fetch('/api/ice', { cache: 'no-store' }).then(r => r.ok ? r.json() : { ice: [] }).then(j => { if (j.ice && j.ice.length) ICE = ICE.concat(j.ice.filter(x => String(x.urls).startsWith('turn'))); }).catch(() => {});
  return iceLoaded;
}

export class Net {
  constructor() {
    this.mode = 'offline'; this.isHost = true; this.id = 'host'; this.code = '';
    this.peers = new Map();          // host: peerId -> { send(msg), ping }
    this.handlers = new Map(); this.onPeerLeave = null; this.onPeerJoin = null; this.onHostLost = null;
    this.stats = { up: 0, down: 0, bytesUp: 0, bytesDown: 0 }; this.measure = false;
  }
  _count(dir, m) { this.stats[dir]++; if (this.measure) this.stats[dir === 'up' ? 'bytesUp' : 'bytesDown'] += JSON.stringify(m).length; }
  on(type, fn) { this.handlers.set(type, fn); }
  dispatch(msg, from) {
    this._count('down', msg);
    const h = this.handlers.get(msg.t);
    if (h) { try { h(msg, from); } catch (e) { console.error('net handler', msg.t, e); } }
  }
  // ---------------------------------------------------------------- send
  // fast = the unordered snapshot channel (falls back to the reliable one)
  toHost(msg, fast) { if (this.isHost) { this.dispatch(msg, this.id); return; } this._count('up', msg); const f = fast && this._sendHostFast; (f || this._sendHost) && (f || this._sendHost)(msg); }
  toPeer(id, msg, fast) { if (id === this.id) { this.dispatch(msg, this.id); return; } const p = this.peers.get(id); if (p && p.send) { this._count('up', msg); (fast && p.fast ? p.fast : p.send)(msg); } }
  broadcast(msg, except, fast) { for (const [id, p] of this.peers) if (id !== except && p.send) { this._count('up', msg); (fast && p.fast ? p.fast : p.send)(msg); } }
  // ---------------------------------------------------------------- offline
  offline() { this.mode = 'offline'; this.isHost = true; this.id = 'host'; this.code = 'SOLO'; return Promise.resolve(this.code); }
  // ---------------------------------------------------------------- BroadcastChannel (same-browser tabs)
  localHost(code) {
    this.mode = 'local'; this.isHost = true; this.id = 'h' + makeCode(4); this.code = code || makeCode();
    const ch = this.bc = new BroadcastChannel('tsg-' + this.code);
    ch.onmessage = (e) => {
      const d = e.data;
      if (d.kind === 'find') { ch.postMessage({ kind: 'announce', host: this.id }); return; }
      if (d.to !== this.id) return;
      if (d.kind === 'hello') {
        const pid = d.from;
        this.peers.set(pid, { send: (m) => ch.postMessage({ to: pid, from: this.id, kind: 'msg', m }) });
        ch.postMessage({ to: pid, from: this.id, kind: 'welcome' });
        if (this.onPeerJoin) this.onPeerJoin(pid);
      } else if (d.kind === 'bye') { this.peers.delete(d.from); if (this.onPeerLeave) this.onPeerLeave(d.from); }
      else if (d.kind === 'msg') this.dispatch(d.m, d.from);
    };
    ch.postMessage({ kind: 'announce', host: this.id });
    this.hostId = this.id;
    window.addEventListener('beforeunload', () => { for (const id of this.peers.keys()) ch.postMessage({ to: id, from: this.id, kind: 'bye' }); });
    return Promise.resolve(this.code);
  }
  localJoin(code) {
    this.mode = 'local'; this.isHost = false; this.id = 'c' + makeCode(4); this.code = code;
    const ch = this.bc = new BroadcastChannel('tsg-' + code);
    return new Promise((resolve, reject) => {
      let host = null;
      const to = setTimeout(() => reject(new Error('No game with that code in this browser')), 4000);
      ch.onmessage = (e) => {
        const d = e.data;
        if (d.kind === 'announce' && !host) { ch.postMessage({ to: d.host, from: this.id, kind: 'hello' }); return; }
        if (d.to !== this.id) return;
        if (d.kind === 'welcome') { host = d.from; this.hostId = host; clearTimeout(to); this._sendHost = (m) => ch.postMessage({ to: host, from: this.id, kind: 'msg', m }); resolve(code); }
        else if (d.kind === 'msg') this.dispatch(d.m, host);
        else if (d.kind === 'bye') { if (this.onHostLost) this.onHostLost(); }
      };
      ch.postMessage({ kind: 'find' });
      // ask the host to announce itself
      const ping = setInterval(() => { if (host) clearInterval(ping); else ch.postMessage({ kind: 'find' }); }, 300);
      // hosts answer "find" with an announce
    });
  }
  // ---------------------------------------------------------------- PeerJS (internet)
  async peerHost(code) {
    await loadIce();
    this.mode = 'peer'; this.isHost = true; this.code = code || makeCode();
    return new Promise((resolve, reject) => {
      if (!window.Peer) { reject(new Error('Networking library failed to load')); return; }
      const peer = this.peer = new window.Peer(PEER_PREFIX + this.code, { config: { iceServers: ICE, iceTransportPolicy: RELAY ? 'relay' : 'all' }, debug: 0 });
      peer.on('open', (id) => { this.id = id; this.hostId = id; resolve(this.code); });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id') { peer.destroy(); this.peerHost(makeCode()).then(resolve, reject); }
        else if (!this.id || this.id === 'host') reject(new Error('Could not open a room: ' + e.type));
        else console.warn('peer error', e.type);
      });
      peer.on('connection', (conn) => this._adopt(conn));
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    });
  }
  _adopt(conn) {
    const fast = conn.label === 'snap';
    conn.on('open', () => {
      const pid = conn.peer;
      const e = this.peers.get(pid) || {};
      if (fast) { e.fast = (m) => { if (conn.open) conn.send(m); }; this.peers.set(pid, e); return; }
      e.conn = conn; e.send = (m) => { if (conn.open) conn.send(m); };
      this.peers.set(pid, e);
      if (this.onPeerJoin) this.onPeerJoin(pid);
    });
    conn.on('data', (m) => this.dispatch(m, conn.peer));
    if (fast) return;
    const gone = () => { if (this.peers.has(conn.peer)) { this.peers.delete(conn.peer); if (this.onPeerLeave) this.onPeerLeave(conn.peer); } };
    conn.on('close', gone); conn.on('error', gone);
  }
  async peerJoin(code) {
    await loadIce();
    this.mode = 'peer'; this.isHost = false; this.code = code;
    return new Promise((resolve, reject) => {
      if (!window.Peer) { reject(new Error('Networking library failed to load')); return; }
      const peer = this.peer = new window.Peer(undefined, { config: { iceServers: ICE, iceTransportPolicy: RELAY ? 'relay' : 'all' }, debug: 0 });
      const to = setTimeout(() => reject(new Error('Could not reach that room. Check the code, or the host may be behind a strict firewall.')), 15000);
      peer.on('open', (id) => {
        this.id = id;
        const conn = this.conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          clearTimeout(to); this.hostId = conn.peer; this._sendHost = (m) => { if (conn.open) conn.send(m); };
          // second, unordered channel for 20 Hz snapshots so one lost packet doesn't stall the rest
          const fc = peer.connect(PEER_PREFIX + code, { reliable: false, serialization: 'json', label: 'snap' });
          fc.on('open', () => { this._sendHostFast = (m) => { if (fc.open) fc.send(m); }; });
          fc.on('data', (m) => this.dispatch(m, conn.peer));
          resolve(code);
        });
        conn.on('data', (m) => this.dispatch(m, conn.peer));
        conn.on('close', () => { if (this.onHostLost) this.onHostLost(); });
        conn.on('error', () => { if (this.onHostLost) this.onHostLost(); });
      });
      peer.on('error', (e) => { clearTimeout(to); reject(new Error(e.type === 'peer-unavailable' ? 'No room with that code.' : 'Network error: ' + e.type)); });
    });
  }
  close() {
    try { if (this.bc) { for (const id of this.peers.keys()) this.bc.postMessage({ to: id, from: this.id, kind: 'bye' }); this.bc.close(); } } catch (e) { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
    this.peers.clear(); this.handlers.clear(); this._sendHost = null;
  }
}

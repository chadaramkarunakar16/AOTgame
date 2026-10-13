/* =========================================================================
   Compact wire format for snapshots: positional arrays instead of keyed
   objects, quantised numbers. A scout is ~25 numbers, a titan ~30.
   encode(state object) -> array; decode(array) -> the same state object shape
   the entity classes already understand (netApply).
   ========================================================================= */
const q = (v, d) => Math.round(v * d) / d;
const Q2 = (v) => q(v, 100), Q1 = (v) => q(v, 10);

export function encScout(o) {
  const a = o.a;
  return [0, o.id, Q2(o.p[0]), Q2(o.p[1]), Q2(o.p[2]), Q1(o.v[0]), Q1(o.v[1]), Q1(o.v[2]), Q2(o.y), Q2(o.pi), o.f, o.hp,
    a[0], Q1(a[1]), Q1(a[2]), Q1(a[3]), a[4], Q1(a[5]), Q1(a[6]), Q1(a[7]),
    Q2(o.sl), Q2(o.sp), o.ss, Q2(o.sw), o.sh, Q2(o.am || 0), o.g || 0, Q1(o.dt || 0), o.dr || 0];
}
export function decScout(r) {
  return { k: 's', id: r[1], p: [r[2], r[3], r[4]], v: [r[5], r[6], r[7]], y: r[8], pi: r[9], f: r[10], hp: r[11],
    a: [r[12], r[13], r[14], r[15], r[16], r[17], r[18], r[19]], sl: r[20], sp: r[21], ss: r[22], sw: r[23], sh: r[24], am: r[25], g: r[26] || null, dt: r[27], dr: r[28] };
}
const STATES = ['walk', 'chase', 'windup', 'strike', 'lunge', 'recover', 'holding', 'crippled', 'rise', 'leap', 'stagger', 'charge', 'dying', 'dissolve'];
const ATKS = [null, 'swipe', 'grab', 'stomp', 'bite'];
export function encTitan(o) {
  const r = [1, o.id, o.ty, Q2(o.p[0]), Q2(o.p[1]), Q2(o.p[2]), Q2(o.y), STATES.indexOf(o.s), Q2(o.st), ATKS.indexOf(o.a), o.as, o.n, Q2(o.wd),
    Q1(o.d[0]), Q1(o.d[1]), Q1(o.d[2]), Q1(o.al), o.h || 0, o.hs, o.tg || 0, o.lw || 0, o.nh, Q1(o.ng), o.gs || -1, Q1(o.hd), Q2(o.sk), Q2(o.rp),
    o.ga ? Q1(o.ga[0]) : 0, o.ga ? Q1(o.ga[1]) : 0, o.ga ? Q1(o.ga[2]) : 0, o.ga ? 1 : 0, o.x || 0, o.b || 0, o.hp ?? 0];
  return r;
}
export function decTitan(r) {
  const o = { k: 't', id: r[1], ty: r[2], p: [r[3], r[4], r[5]], y: r[6], s: STATES[r[7]] || 'walk', st: r[8], a: ATKS[r[9]] || null, as: r[10], n: r[11], wd: r[12],
    d: [r[13], r[14], r[15]], al: r[16], h: r[17] || null, hs: r[18], tg: r[19] || null, lw: r[20], nh: r[21], ng: r[22], gs: r[23], hd: r[24], sk: r[25], rp: r[26] };
  if (r[30]) o.ga = [r[27], r[28], r[29]];
  if (r[31]) o.x = r[31];
  if (r[32]) o.b = r[32];
  o.hp = r[33];
  return o;
}
export function enc(o) { return o.k === 's' ? encScout(o) : encTitan(o); }
export function dec(r) { return r[0] === 0 ? decScout(r) : decTitan(r); }

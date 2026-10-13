/* =========================================================================
   Interior Squad pistols. Bullets are fast (110 m/s) but visible, and a Survey
   Corps scout who slashes just as one arrives deflects it.
   Every client simulates every bullet; hits and deflections are decided by the
   client that owns the scout being shot (victim side).
   ========================================================================= */
import { THREE, scene, camera, getBlock, SOLID, B } from './engine.js';
import { G } from './state.js';
import { Sfx } from './audio.js';
import { sparkBurst, steam } from './fx.js';

export const GUN = { speed: 110, dmg: 30, life: 1.4, reload: 1.6, cd: 0.28, hitR: 0.9, parryR: 1.9 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const tracerGeo = new THREE.BoxGeometry(0.07, 0.07, 3.2); tracerGeo.translate(0, 0, -1.6);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const flashMat = new THREE.SpriteMaterial({ color: 0xffd080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
let seq = 0;

export const bullets = [];
// a slash is "active" for parrying from the moment it starts until shortly after the swing
export function parryActive(sc) { return (sc.slashT >= 0 && sc.slashT < 0.3) || (sc.spinT >= 0 && sc.spinT < 0.6); }

export function spawnBullet(b) {
  const m = new THREE.Mesh(tracerGeo, tracerMat); m.renderOrder = 7; scene.add(m);
  const o = { id: b.id || ('b' + (++seq) + Math.random().toString(36).slice(2, 4)), pos: new THREE.Vector3(b.p[0], b.p[1], b.p[2]), vel: new THREE.Vector3(b.v[0], b.v[1], b.v[2]), by: b.by, team: b.team, life: GUN.life, m, mine: !!b.mine, deflected: !!b.deflected, hitIds: new Set(b.skip ? [b.skip] : []) };
  m.position.copy(o.pos); m.lookAt(_a.copy(o.pos).add(o.vel));
  bullets.push(o);
  // muzzle flash + sound
  if (!b.deflected) {
    const f = new THREE.Sprite(flashMat.clone()); f.position.copy(o.pos); f.scale.setScalar(1.4); scene.add(f);
    setTimeout(() => { scene.remove(f); f.material.dispose(); }, 60);
    const d = o.pos.distanceTo(camera.position);
    Sfx.gunshot(0, Math.max(0.15, 1 - d / 140));
    steam.spawn(o.pos.x, o.pos.y, o.pos.z, 0, 0.5, 0, 0.8, 0.4, 1.4, 0.8, 0.8, 0.8, 0.4, -0.3, 1);
  }
  return o;
}
export function removeBullet(id) { const i = bullets.findIndex(b => b.id === id); if (i >= 0) { scene.remove(bullets[i].m); bullets.splice(i, 1); } }
export function clearBullets() { for (const b of bullets) scene.remove(b.m); bullets.length = 0; }

// distance from point p to segment a-b
function segDist(p, a, b) { const ab = _c.subVectors(b, a), t = Math.max(0, Math.min(1, _b.subVectors(p, a).dot(ab) / Math.max(1e-6, ab.lengthSq()))); return _b.copy(a).addScaledVector(ab, t).distanceTo(p); }

export function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const o = bullets[i]; o.life -= dt;
    const from = _a.copy(o.pos);
    o.vel.y -= 4 * dt;
    o.pos.addScaledVector(o.vel, dt);
    o.m.position.copy(o.pos); o.m.lookAt(_c.copy(o.pos).add(o.vel));
    let dead = o.life <= 0;
    // whiz past the camera
    if (!o.whizzed && segDist(camera.position, from, o.pos) < 3.5 && o.by !== (G.player && G.player.id)) { o.whizzed = true; Sfx.whiz(0); }
    // local scouts: deflect or take the hit
    if (!dead) for (const sc of G.scouts) {
      if (!sc.local || !sc.alive || sc.id === o.by || o.hitIds.has(sc.id) || sc.hidden) continue;
      if (G.hostile && !G.hostile(sc, { team: o.team, id: o.by })) continue;
      const ch = _b.copy(sc.pos); ch.y += 1.0;
      const d = segDist(ch.clone(), from, o.pos);
      if (d < GUN.parryR && sc.faction === 'corps' && parryActive(sc)) {
        // deflect: send it back roughly where it came from
        o.hitIds.add(sc.id);
        const back = o.vel.clone().negate().normalize().add(_c.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.3) * 0.2, (Math.random() - 0.5) * 0.25)).normalize().multiplyScalar(o.vel.length() * 0.9);
        const nb = { id: o.id + 'd', p: [ch.x, ch.y, ch.z], v: [back.x, back.y, back.z], by: sc.id, team: sc.team, deflected: true, skip: sc.id, mine: true };
        sparkBurst(ch, 26, 14, [1, 0.95, 0.7], 0.25); Sfx.deflect();
        if (G.hooks.bulletDeflected) G.hooks.bulletDeflected(sc, o, nb);
        dead = true;
        break;
      }
      if (d < GUN.hitR) {
        o.hitIds.add(sc.id);
        const kb = o.vel.clone().setY(0).normalize().multiplyScalar(4);
        Sfx.bulletHit(); sparkBurst(ch, 8, 6, [1, 0.5, 0.3], 0.15);
        if (G.hooks.hurtScout) G.hooks.hurtScout(sc, GUN.dmg, kb, o.by, o.deflected ? 'Hit by a deflected bullet' : 'Shot');
        dead = true; break;
      }
    }
    // blocks
    if (!dead) {
      const steps = Math.ceil(from.distanceTo(o.pos) / 0.8);
      for (let s = 1; s <= steps; s++) {
        _c.lerpVectors(from, o.pos, s / steps);
        const id = getBlock(Math.floor(_c.x), Math.floor(_c.y), Math.floor(_c.z));
        if (id && SOLID[id] && id !== B.WATER) { sparkBurst(_c, 6, 5, [1, 0.8, 0.5], 0.12); dead = true; break; }
      }
    }
    // titans just spark
    if (!dead) for (const t of G.titans) {
      if (!t.alive || t.pos.distanceTo(o.pos) > t.h * 1.2) continue;
      if (o.pos.distanceTo(t.chest(_c)) < t.h * 0.3) { sparkBurst(o.pos, 6, 5, [1, 0.6, 0.4], 0.12); t.flash = 0.6; dead = true; break; }
    }
    if (dead) { scene.remove(o.m); bullets.splice(i, 1); }
  }
}

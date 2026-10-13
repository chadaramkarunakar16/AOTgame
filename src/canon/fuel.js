/* =========================================================================
   Fuel drops: gas canister crates scattered across the map. Fly through one to
   refuel without going back to a depot. Single player spawns them locally;
   in multiplayer the host owns the list and confirms every pickup.
   ========================================================================= */
import { THREE, scene, camera, getBlock, SOLID } from './engine.js';
import { G } from './state.js';

const canGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.5, 10);
const capGeo = new THREE.CylinderGeometry(0.3, 0.42, 0.3, 10);
const crateGeo = new THREE.BoxGeometry(1.7, 0.5, 1.2);
const canMat = new THREE.MeshLambertMaterial({ color: 0xd8e6f0, emissive: 0x2a5070 });
const bandMat = new THREE.MeshLambertMaterial({ color: 0x4fb8ff, emissive: 0x1a6aa8 });
const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6438 });
const beamGeo = new THREE.CylinderGeometry(0.55, 0.55, 26, 10, 1, true);
const beamMat = new THREE.MeshBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const ringGeo = new THREE.RingGeometry(1.6, 2.0, 28); ringGeo.rotateX(-Math.PI / 2);

export const FUEL = { GAS: 60, BLADES: 2, HP: 15, RADIUS: 3.6 };

export class FuelDrops {
  constructor() { this.list = []; this.spT = 2; this.nextId = 1; }
  add(id, x, y, z) {
    if (this.list.some(d => d.id === id)) return;
    const g = new THREE.Group(); g.position.set(x, y, z);
    const crate = new THREE.Mesh(crateGeo, crateMat); crate.position.y = 0.25; g.add(crate);
    const spin = new THREE.Group(); spin.position.y = 1.5; g.add(spin);
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(canGeo, canMat); c.position.x = s * 0.48; spin.add(c);
      const cap = new THREE.Mesh(capGeo, bandMat); cap.position.set(s * 0.48, 0.88, 0); spin.add(cap);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.22, 10), bandMat); band.position.set(s * 0.48, 0, 0); spin.add(band);
    }
    const beam = new THREE.Mesh(beamGeo, beamMat.clone()); beam.position.y = 13; g.add(beam);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.06; g.add(ring);
    scene.add(g);
    this.list.push({ id, x, y, z, g, spin, beam, ring, t: Math.random() * 6, pending: false });
  }
  remove(id) {
    const i = this.list.findIndex(d => d.id === id); if (i < 0) return null;
    const d = this.list[i]; scene.remove(d.g); this.list.splice(i, 1); return d;
  }
  clear() { for (const d of this.list) scene.remove(d.g); this.list.length = 0; }
  // visuals + "am I touching one" for the local scout; returns the drop touched (or null)
  update(dt, pos, canTake, rMul = 1) {
    let touched = null;
    for (const d of this.list) {
      d.t += dt;
      d.spin.rotation.y += dt * 1.6; d.spin.position.y = 1.5 + Math.sin(d.t * 2.2) * 0.25;
      const cd = Math.hypot(camera.position.x - d.x, camera.position.z - d.z);
      d.beam.material.opacity = 0.2 * Math.max(0, Math.min(1, (cd - 3) / 14));
      d.ring.material.opacity = 0.35 + 0.25 * Math.sin(d.t * 4);
      if (canTake && pos && !d.pending) {
        const dx = pos.x - d.x, dz = pos.z - d.z, dy = pos.y + 0.9 - (d.y + 1.4);
        const R = FUEL.RADIUS * rMul;
        if (dx * dx + dz * dz < R * R && Math.abs(dy) < 3.4 * rMul) touched = d;
      }
    }
    return touched;
  }
}

// find a standable surface (top solid block + 1) at x,z, or null when the column isn't loaded / is water
export function surfaceAt(x, z) {
  x = Math.floor(x); z = Math.floor(z);
  for (let y = 120; y > 2; y--) {
    const id = getBlock(x, y, z);
    if (!id) continue;
    if (!SOLID[id]) return null;      // water, plants on top etc.
    if (getBlock(x, y + 1, z) || getBlock(x, y + 2, z)) return null;
    return y + 1;
  }
  return null;
}

// pick a random drop spot: rooftops, pillar tops and field ground inside the arena ring
export function randomDropSpot(cx, cz, rMin, rMax, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
    const x = Math.floor(cx + Math.cos(a) * r) + 0.5, z = Math.floor(cz + Math.sin(a) * r) + 0.5;
    const y = surfaceAt(x, z);
    if (y === null) continue;
    if (G.fuel && G.fuel.list.some(d => Math.hypot(d.x - x, d.z - z) < 22)) continue;
    return { x, y, z };
  }
  return null;
}

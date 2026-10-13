/* =========================================================================
   Scout Military Steed: Procedural Voxel Horse, Riding & Cavalry Combat
   ========================================================================= */
import { THREE, scene, SOLID, getBlock } from './engine.js';
import { Skin, boxGeo } from './models.js';
import { Sfx } from './audio.js';
import { dust, makeShadow, placeShadow, addShake } from './fx.js';
import { G } from './state.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V(), _u = V(), _w = V();
const groundH = (x, z) => (typeof window !== 'undefined' && window.groundH) ? (window.groundH(Math.floor(x), Math.floor(z)) + 1) : ((typeof globalThis !== 'undefined' && globalThis.groundH) ? (globalThis.groundH(Math.floor(x), Math.floor(z)) + 1) : 47);

export function getSurfaceY(x, z, currentY = 120) {
  const gh = groundH(x, z);
  if (getBlock && SOLID) {
    const startY = Math.min(120, Math.max(Math.ceil(currentY) + 2, gh + 1));
    for (let y = startY; y >= gh; y--) {
      const b = getBlock(Math.floor(x), y, Math.floor(z));
      if (SOLID[b]) return y + 1;
    }
  }
  return gh;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const lam = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));

/* -------------------------------------------------------------------------
   Procedural Voxel Horse Builder
   ------------------------------------------------------------------------- */
export function buildHorse(opts = {}) {
  const coat = opts.coat || [88, 52, 30];      // dark bay scout steed
  const maneCol = opts.mane || [26, 18, 14];   // dark black mane
  const saddleCol = [48, 32, 20];              // leather saddle
  const blanketCol = [32, 92, 54];             // Scout Regiment green saddlecloth
  const hoofCol = [24, 20, 18];                // iron shoes / dark hooves

  const sk = new Skin(128, 64);
  const bodyBox = sk.box(10, 10, 22);
  const neckBox = sk.box(4, 12, 6);
  const headBox = sk.box(5, 5, 10);
  const legBox = sk.box(3, 14, 3);
  const tailBox = sk.box(2, 10, 2);

  // coat texture with natural shading
  sk.allFaces(bodyBox, coat, 0.08, (k, i, j, w, h) => {
    // green military saddle blanket
    if (j >= 4 && j <= 16 && (k === 'top' || (k === 'left' && j < 12) || (k === 'right' && j < 12))) {
      return blanketCol;
    }
    // leather saddle on top
    if (k === 'top' && j >= 7 && j <= 13 && i >= 1 && i <= 8) {
      return saddleCol;
    }
    return null;
  });

  sk.allFaces(neckBox, coat, 0.06);
  // mane along the back of neck
  sk.fill(neckBox.back, maneCol, 0.1);

  sk.allFaces(headBox, coat, 0.06, (k, i, j, w, h) => {
    // white star / blaze on horse forehead
    if (k === 'top' && j >= 1 && j <= 4 && i === 2) return [240, 240, 240];
    // leather bridle straps
    if (j === 3 || j === 7) return [42, 26, 16];
    return null;
  });

  // legs with dark hooves at bottom
  sk.allFaces(legBox, coat, 0.06, (k, i, j) => {
    if (j >= 11) return hoofCol;
    if (j === 10) return [240, 240, 240]; // white fetlock mark
    return null;
  });

  sk.allFaces(tailBox, maneCol, 0.1);

  const tex = sk.texture();
  const mat = new THREE.MeshLambertMaterial({ map: tex });

  const root = new THREE.Group();
  const body = mesh(root, boxGeo(sk, bodyBox), mat, 0, 15, 0);

  // neck and head
  const neckPivot = pivot(body, 0, 4, 10);
  mesh(neckPivot, boxGeo(sk, neckBox), mat, 0, 6, 0);
  neckPivot.rotation.x = -0.45; // angle forward

  const headPivot = pivot(neckPivot, 0, 11, 0);
  mesh(headPivot, boxGeo(sk, headBox), mat, 0, 2, 4);
  headPivot.rotation.x = 0.55; // level head

  // ears
  const earMat = lam(0x422618);
  mesh(headPivot, new THREE.BoxGeometry(1.2, 2.8, 1.2), earMat, -1.8, 5.2, 1);
  mesh(headPivot, new THREE.BoxGeometry(1.2, 2.8, 1.2), earMat, 1.8, 5.2, 1);

  // stirrups & saddle pommel
  const stirrupMat = lam(0x3a3835);
  mesh(body, new THREE.BoxGeometry(10.6, 2.2, 7), lam(0x362215), 0, 5.5, -1); // saddle seat
  mesh(body, new THREE.BoxGeometry(0.6, 6, 0.6), stirrupMat, -5.5, 0, -1);   // left stirrup strap
  mesh(body, new THREE.BoxGeometry(0.6, 6, 0.6), stirrupMat, 5.5, 0, -1);    // right stirrup strap
  mesh(body, new THREE.BoxGeometry(1.4, 0.6, 1.8), stirrupMat, -5.5, -3, -1); // left iron stirrup
  mesh(body, new THREE.BoxGeometry(1.4, 0.6, 1.8), stirrupMat, 5.5, -3, -1);  // right iron stirrup

  // 4 Legs
  const legFL = pivot(body, -3.8, -4, 8);
  mesh(legFL, boxGeo(sk, legBox), mat, 0, -7, 0);

  const legFR = pivot(body, 3.8, -4, 8);
  mesh(legFR, boxGeo(sk, legBox), mat, 0, -7, 0);

  const legBL = pivot(body, -3.8, -4, -8);
  mesh(legBL, boxGeo(sk, legBox), mat, 0, -7, 0);

  const legBR = pivot(body, 3.8, -4, -8);
  mesh(legBR, boxGeo(sk, legBox), mat, 0, -7, 0);

  // tail
  const tailPivot = pivot(body, 0, 3, -11);
  mesh(tailPivot, boxGeo(sk, tailBox), mat, 0, -5, -1);
  tailPivot.rotation.x = 0.25;

  root.scale.setScalar(1.8 / 32);

  return {
    root, body, neckPivot, headPivot,
    legFL, legFR, legBL, legBR, tailPivot,
    mat
  };
}

/* -------------------------------------------------------------------------
   Horse Entity Class
   ------------------------------------------------------------------------- */
export class Horse {
  constructor(x, z, opts = {}) {
    const startY = opts.y !== undefined ? opts.y : getSurfaceY(x, z);
    this.pos = V(x, startY, z);
    this.vel = V(0, 0, 0);
    this.yaw = opts.yaw || 0;
    this.pitch = 0;
    this.mounted = false;
    this.gallopPh = 0;
    this.stepDist = 0;
    this.onGround = true;
    this.jumpCD = 0;
    this.removed = false;
    this.model = buildHorse(opts);
    this.shadow = makeShadow();
    scene.add(this.model.root);
    this.updateVisuals(0);
  }

  isPlayerNear(P, maxDist = 6.0) {
    if (!P || !P.pos) return false;
    return this.pos.distanceTo(P.pos) <= maxDist;
  }

  mount() {
    this.mounted = true;
    G.player.mounted = true;
    if (window.toast) window.toast('MOUNTED SCOUT HORSE · [H] to Dismount', 2.0);
  }

  dismount() {
    this.mounted = false;
    G.player.mounted = false;
    if (window.toast) window.toast('DISMOUNTED · [H] to Mount Horse', 1.5);
  }

  remove() {
    this.removed = true;
    scene.remove(this.model.root);
    if (this.shadow) scene.remove(this.shadow);
    if (this.mounted) this.dismount();
  }

  update(dt, P, input = {}) {
    if (this.removed) return;
    this.jumpCD = Math.max(0, this.jumpCD - dt);

    if (this.mounted) {
      // Rider drives the horse
      const mv = input.mv || { x: input.mx || 0, y: -(input.my || 0) };
      const fwd = mv.y || 0; // W is +1 (forward), S is -1 (reverse)
      const str = mv.x || 0; // D is +1 (right), A is -1 (left)

      // Turn horse smoothly towards camera yaw when steering/moving
      if (Math.abs(fwd) > 0.05 || Math.abs(str) > 0.05) {
        let wantYaw = P.yaw;
        if (str !== 0 && fwd === 0) wantYaw += (str > 0 ? -1 : 1) * Math.PI / 2;
        else if (str !== 0 && fwd !== 0) wantYaw += (str > 0 ? -1 : 1) * 0.45 * Math.sign(fwd);
        if (fwd < 0) wantYaw += Math.PI;

        let diff = wantYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * Math.min(1, dt * 10);
      }

      // Speed: Gallop speed 20 m/s, sprint boost 28 m/s (cavalry charge!)
      const sprint = input.sprint || input.boost;
      const targetSpeed = fwd > 0 ? (sprint ? 28 : 20) : (fwd < 0 ? -7 : (Math.abs(str) > 0.1 ? 12 : 0));

      const horseFwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const curSpeed = this.vel.dot(horseFwd);
      const accel = (fwd !== 0 || str !== 0) ? 36 : 24;
      const newSpeed = curSpeed + (targetSpeed - curSpeed) * Math.min(1, dt * accel);

      this.vel.x = horseFwd.x * newSpeed;
      this.vel.z = horseFwd.z * newSpeed;

      // Horse jump (Space)
      if (input.jump && this.onGround && this.jumpCD <= 0) {
        this.vel.y = 12.0;
        this.onGround = false;
        this.jumpCD = 0.35;
        Sfx.jump();
        dust(this.pos, 10, 1.2);
      }

      // Slicing from horseback (F)
      if (input.slash) {
        if (P.slashCD <= 0 && window.__game && window.__game.P) {
          // delegate slash to player
        }
      }

      // If player fires anchors or boosts high into air, auto-dismount into 3DMG flight!
      if (P.anchors && P.anchors.some(a => a.state === 'attached')) {
        this.dismount();
        P.vel.y += 6; // leap off the saddle
        return;
      }
    } else {
      // Unmounted: decelerate to stop
      this.vel.x *= Math.exp(-8 * dt);
      this.vel.z *= Math.exp(-8 * dt);
    }

    // Gravity
    this.vel.y -= 28 * dt;

    // Horizontal Movement with Solid Block Collision
    const stepX = this.vel.x * dt;
    const stepZ = this.vel.z * dt;
    const curSpeed = Math.hypot(this.vel.x, this.vel.z);

    const horseSolid = (x, y, z) => !!SOLID[getBlock(Math.floor(x), Math.floor(y), Math.floor(z))];
    const collidesAt = (x, y, z) => {
      const hw = 0.55;
      for (const dy of [0.3, 1.2, 1.9]) {
        for (const dx of [-hw, hw]) {
          for (const dz of [-hw, hw]) {
            if (horseSolid(x + dx, y + dy, z + dz)) return true;
          }
        }
      }
      return false;
    };

    // X Axis collision
    if (stepX !== 0) {
      const nextX = this.pos.x + stepX;
      if (!collidesAt(nextX, this.pos.y, this.pos.z)) {
        this.pos.x = nextX;
      } else if (!collidesAt(nextX, this.pos.y + 1.1, this.pos.z)) {
        // Step up 1-block terrain slope
        this.pos.x = nextX;
        this.pos.y += 1.05;
      } else {
        // Hard collision against solid obstacle or wall -> REBOUND & BOUNCE BACK!
        const sign = Math.sign(stepX) || 1;
        this.pos.x -= sign * 0.45; // push clear of wall voxel
        this.vel.x = -sign * Math.max(5, Math.min(14, curSpeed * 0.55)); // bounce back!
        if (curSpeed > 9) {
          addShake(0.35);
          dust(this.pos, 16, 2.0);
          if (Sfx.crash) Sfx.crash(1.0);
          const dmg = Math.round((curSpeed - 9) * 1.4);
          if (dmg > 0 && this.mounted && P) {
            P.hp = Math.max(1, P.hp - dmg);
            if (window.toast) window.toast(`REBOUND! Wall collision -${dmg} HP`, 1.5);
          }
        }
      }
    }

    // Z Axis collision
    if (stepZ !== 0) {
      const nextZ = this.pos.z + stepZ;
      if (!collidesAt(this.pos.x, this.pos.y, nextZ)) {
        this.pos.z = nextZ;
      } else if (!collidesAt(this.pos.x, this.pos.y + 1.1, nextZ)) {
        // Step up 1-block terrain slope
        this.pos.z = nextZ;
        this.pos.y += 1.05;
      } else {
        // Hard collision against solid obstacle or wall -> REBOUND & BOUNCE BACK!
        const sign = Math.sign(stepZ) || 1;
        this.pos.z -= sign * 0.45; // push clear of wall voxel
        this.vel.z = -sign * Math.max(5, Math.min(14, curSpeed * 0.55)); // bounce back!
        if (curSpeed > 9) {
          addShake(0.35);
          dust(this.pos, 16, 2.0);
          if (Sfx.crash) Sfx.crash(1.0);
          const dmg = Math.round((curSpeed - 9) * 1.4);
          if (dmg > 0 && this.mounted && P) {
            P.hp = Math.max(1, P.hp - dmg);
            if (window.toast) window.toast(`REBOUND! Wall collision -${dmg} HP`, 1.5);
          }
        }
      }
    }

    this.pos.y += this.vel.y * dt;

    const gh = getSurfaceY(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= gh) {
      this.pos.y = gh;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    if (this.grabbedBy) {
      if (this.mounted) this.dismount();
      return;
    }

    // Keep player locked onto saddle if mounted
    if (this.mounted && P) {
      P.pos.set(this.pos.x, this.pos.y + 0.35, this.pos.z);
      P.vel.copy(this.vel);
      P.onGround = this.onGround;
    }

    this.updateVisuals(dt);
  }

  updateVisuals(dt) {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw + Math.PI; // Face straight ahead in travel direction!

    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 1 && this.onGround) {
      this.gallopPh += speed * dt * 0.95;
      this.stepDist += speed * dt;

      // 4-beat galloping sound & dust
      if (this.stepDist > 3.2) {
        this.stepDist = 0;
        if (Sfx.hoofstep) Sfx.hoofstep(Math.min(1, speed / 16));
        dust(this.pos, 4, 0.6);
      }

      // Gallop animation
      const g = this.gallopPh;
      m.legFL.rotation.x = Math.sin(g) * 0.75;
      m.legFR.rotation.x = Math.sin(g + 1.4) * 0.75;
      m.legBL.rotation.x = Math.sin(g + 2.8) * 0.85;
      m.legBR.rotation.x = Math.sin(g + 4.2) * 0.85;

      m.body.rotation.x = Math.sin(g * 2) * 0.08;
      m.neckPivot.rotation.x = -0.45 + Math.sin(g * 2) * 0.06;
      m.headPivot.rotation.x = 0.55 - Math.sin(g * 2) * 0.08;
      m.tailPivot.rotation.x = 0.25 + Math.sin(g * 2) * 0.15;
    } else {
      // Idle standing
      const idle = Math.sin(G.time * 2);
      m.legFL.rotation.x = 0;
      m.legFR.rotation.x = 0;
      m.legBL.rotation.x = 0;
      m.legBR.rotation.x = 0;
      m.body.rotation.x = 0;
      m.neckPivot.rotation.x = -0.45 + idle * 0.02;
      m.headPivot.rotation.x = 0.55 + idle * 0.03;
      m.tailPivot.rotation.z = Math.sin(G.time * 3) * 0.12;
    }

    if (this.shadow) {
      placeShadow(this.shadow, this.pos.x, this.pos.y, this.pos.z, 1.4, 25);
    }
  }
}

/* -------------------------------------------------------------------------
   Horse Management API
   ------------------------------------------------------------------------- */
export let activeHorse = null;

export function getActiveHorse() {
  return activeHorse;
}

export function spawnHorse(x, z, opts = {}) {
  if (activeHorse) {
    activeHorse.remove();
  }
  // Ensure horse spawns in free open space, never embedded inside a wall or obstacle!
  const isSolid = (px, py, pz) => SOLID && SOLID[getBlock(Math.floor(px), Math.floor(py), Math.floor(pz))];
  const reqY = opts.y !== undefined ? opts.y : 120;
  let surfaceY = getSurfaceY(x, z, reqY);
  let safeX = x, safeZ = z;
  if (isSolid(safeX, surfaceY, safeZ)) {
    for (let rad = 1; rad <= 6; rad++) {
      let found = false;
      for (const [ox, oz] of [[rad, 0], [-rad, 0], [0, rad], [0, -rad]]) {
        const sy = getSurfaceY(x + ox, z + oz, reqY);
        if (!isSolid(x + ox, sy, z + oz)) {
          safeX = x + ox; safeZ = z + oz; surfaceY = sy; found = true; break;
        }
      }
      if (found) break;
    }
  }
  opts.y = surfaceY;
  activeHorse = new Horse(safeX, safeZ, opts);
  G.horse = activeHorse;
  return activeHorse;
}

export function mountPlayerHorse() {
  if (!activeHorse) return false;
  activeHorse.mount();
  return true;
}

export function dismountPlayerHorse() {
  if (activeHorse && activeHorse.mounted) {
    activeHorse.dismount();
    return true;
  }
  return false;
}

export function whistleHorse(P) {
  if (!P || !P.pos) return;

  // If already mounted, pressing H dismounts!
  if (activeHorse && activeHorse.mounted) {
    activeHorse.dismount();
    return;
  }

  if (activeHorse && activeHorse.isPlayerNear(P, 6.0)) {
    activeHorse.mount();
    return;
  }

  const fwd = -Math.sin(P.yaw), fzd = -Math.cos(P.yaw);
  const rightX = Math.cos(P.yaw), rightZ = -Math.sin(P.yaw);
  const targetX = P.pos.x + rightX * 2.2 + fwd * 1.5;
  const targetZ = P.pos.z + rightZ * 2.2 + fzd * 1.5;
  const surfaceY = getSurfaceY(targetX, targetZ, P.pos.y);

  if (!activeHorse) {
    activeHorse = spawnHorse(targetX, targetZ, { yaw: P.yaw, y: surfaceY });
    activeHorse.pos.y = surfaceY;
    return;
  }

  activeHorse.pos.set(targetX, surfaceY, targetZ);
  activeHorse.vel.set(0, 0, 0);
  activeHorse.yaw = P.yaw;
  activeHorse.onGround = true;
}

export function clearHorses() {
  if (activeHorse) {
    activeHorse.remove();
    activeHorse = null;
    G.horse = null;
  }
}

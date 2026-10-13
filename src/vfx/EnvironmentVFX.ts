import * as THREE from 'three';

/**
 * Environmental Particle VFX System
 * 
 * Manages three distinct particle emitters:
 * 1. Titan Footstep Dust: Procedural dust clouds kicked up when Titans walk
 * 2. Grapple Impact Debris: Stone/concrete chips burst when player hooks into surfaces
 * 3. Ambient Dust Motes: Floating atmospheric dust particles in alleyways
 * 
 * All particle pools are pre-allocated to avoid GC pressure.
 * Uses THREE.Points with per-particle attribute updates for GPU-efficient rendering.
 */

interface DustParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  opacity: number;
}

interface DebrisParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
}

export class EnvironmentVFX {
  public group: THREE.Group;

  // ─── Dust Cloud System ───────────────────────────────
  private dustPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dustSizes: Float32Array;
  private dustOpacities: Float32Array;
  private activeDust: DustParticle[] = [];
  private maxDustParticles: number = 200;

  // ─── Grapple Impact Debris System ────────────────────
  private debrisPoints: THREE.Points;
  private debrisPositions: Float32Array;
  private debrisSizes: Float32Array;
  private activeDebris: DebrisParticle[] = [];
  private maxDebrisParticles: number = 120;

  // ─── Ambient Floating Dust Motes ─────────────────────
  private ambientPoints: THREE.Points;
  private ambientPositions: Float32Array;
  private ambientCount: number = 80;
  private ambientTime: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Environment_VFX';

    // ═══ Dust Clouds (Titan Footsteps + Player Landings) ═══
    this.dustPositions = new Float32Array(this.maxDustParticles * 3);
    this.dustSizes = new Float32Array(this.maxDustParticles);
    this.dustOpacities = new Float32Array(this.maxDustParticles);

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    dustGeo.setAttribute('size', new THREE.BufferAttribute(this.dustSizes, 1));

    const dustMat = new THREE.PointsMaterial({
      color: 0xb8a896,
      size: 2.5,
      transparent: true,
      opacity: 0.5,
      blending: THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.group.add(this.dustPoints);

    // ═══ Grapple Impact Debris (Stone Chips) ═══
    this.debrisPositions = new Float32Array(this.maxDebrisParticles * 3);
    this.debrisSizes = new Float32Array(this.maxDebrisParticles);

    const debrisGeo = new THREE.BufferGeometry();
    debrisGeo.setAttribute('position', new THREE.BufferAttribute(this.debrisPositions, 3));

    const debrisMat = new THREE.PointsMaterial({
      color: 0x9a8e7a,
      size: 0.6,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.debrisPoints = new THREE.Points(debrisGeo, debrisMat);
    this.group.add(this.debrisPoints);

    // ═══ Ambient Floating Dust Motes ═══
    this.ambientPositions = new Float32Array(this.ambientCount * 3);
    for (let i = 0; i < this.ambientCount; i++) {
      const idx = i * 3;
      this.ambientPositions[idx] = (Math.random() - 0.5) * 80;
      this.ambientPositions[idx + 1] = 1.0 + Math.random() * 12;
      this.ambientPositions[idx + 2] = (Math.random() - 0.5) * 80;
    }

    const ambientGeo = new THREE.BufferGeometry();
    ambientGeo.setAttribute('position', new THREE.BufferAttribute(this.ambientPositions, 3));

    const ambientMat = new THREE.PointsMaterial({
      color: 0xeee8d5,
      size: 0.2,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.ambientPoints = new THREE.Points(ambientGeo, ambientMat);
    this.group.add(this.ambientPoints);
  }

  /**
   * Spawn a dust cloud at ground level (Titan footstep or player hard landing)
   */
  public spawnDustCloud(position: THREE.Vector3, intensity: number = 1.0): void {
    const count = Math.floor(15 * intensity);
    for (let i = 0; i < count; i++) {
      if (this.activeDust.length >= this.maxDustParticles) break;

      this.activeDust.push({
        position: new THREE.Vector3(
          position.x + (Math.random() - 0.5) * 3.5 * intensity,
          position.y + Math.random() * 0.5,
          position.z + (Math.random() - 0.5) * 3.5 * intensity
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4.0 * intensity,
          1.5 + Math.random() * 3.5 * intensity,
          (Math.random() - 0.5) * 4.0 * intensity
        ),
        life: 0,
        maxLife: 1.2 + Math.random() * 1.5,
        size: 1.5 + Math.random() * 2.5 * intensity,
        opacity: 0.45 + Math.random() * 0.25
      });
    }
  }

  /**
   * Spawn debris/stone chips when grapple hook impacts a surface
   */
  public spawnGrappleDebris(position: THREE.Vector3, surfaceNormal: THREE.Vector3): void {
    const count = 8;
    for (let i = 0; i < count; i++) {
      if (this.activeDebris.length >= this.maxDebrisParticles) break;

      // Debris flies outward from the surface along the normal + random scatter
      const vel = surfaceNormal.clone()
        .multiplyScalar(2.0 + Math.random() * 3.5)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 4.0,
          Math.random() * 3.0,
          (Math.random() - 0.5) * 4.0
        ));

      this.activeDebris.push({
        position: position.clone().addScaledVector(surfaceNormal, 0.1),
        velocity: vel,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.5,
        gravity: -15.0
      });
    }

    // Also spawn a small dust puff at impact site
    this.spawnDustCloud(position, 0.5);
  }

  /**
   * Update all particle systems. Call once per frame.
   */
  public update(playerPosition: THREE.Vector3, dt: number): void {
    this.updateDust(dt);
    this.updateDebris(dt);
    this.updateAmbient(playerPosition, dt);
  }

  private updateDust(dt: number): void {
    // Simulate
    for (let i = this.activeDust.length - 1; i >= 0; i--) {
      const p = this.activeDust[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.activeDust.splice(i, 1);
        continue;
      }

      p.position.addScaledVector(p.velocity, dt);
      // Buoyancy + drag
      p.velocity.y += 0.8 * dt;
      p.velocity.multiplyScalar(1.0 - 1.5 * dt);
      p.opacity = (1.0 - p.life / p.maxLife) * 0.5;
    }

    // Write to GPU buffers
    for (let i = 0; i < this.maxDustParticles; i++) {
      const idx = i * 3;
      if (i < this.activeDust.length) {
        const p = this.activeDust[i];
        this.dustPositions[idx] = p.position.x;
        this.dustPositions[idx + 1] = p.position.y;
        this.dustPositions[idx + 2] = p.position.z;
        this.dustSizes[i] = p.size;
      } else {
        this.dustPositions[idx + 1] = -9999;
        this.dustSizes[i] = 0;
      }
    }

    this.dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  private updateDebris(dt: number): void {
    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const p = this.activeDebris[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.activeDebris.splice(i, 1);
        continue;
      }

      p.position.addScaledVector(p.velocity, dt);
      p.velocity.y += p.gravity * dt;
    }

    for (let i = 0; i < this.maxDebrisParticles; i++) {
      const idx = i * 3;
      if (i < this.activeDebris.length) {
        const p = this.activeDebris[i];
        this.debrisPositions[idx] = p.position.x;
        this.debrisPositions[idx + 1] = p.position.y;
        this.debrisPositions[idx + 2] = p.position.z;
      } else {
        this.debrisPositions[idx + 1] = -9999;
      }
    }

    this.debrisPoints.geometry.attributes.position.needsUpdate = true;
  }

  private updateAmbient(playerPos: THREE.Vector3, dt: number): void {
    this.ambientTime += dt;

    for (let i = 0; i < this.ambientCount; i++) {
      const idx = i * 3;
      // Gentle floating drift
      this.ambientPositions[idx] += Math.sin(this.ambientTime * 0.3 + i * 1.7) * 0.02;
      this.ambientPositions[idx + 1] += Math.sin(this.ambientTime * 0.5 + i * 2.3) * 0.01;
      this.ambientPositions[idx + 2] += Math.cos(this.ambientTime * 0.4 + i * 1.1) * 0.02;

      // Re-center around player (particle wrapping)
      const dx = this.ambientPositions[idx] - playerPos.x;
      const dz = this.ambientPositions[idx + 2] - playerPos.z;
      if (Math.abs(dx) > 40) {
        this.ambientPositions[idx] = playerPos.x + (Math.random() - 0.5) * 60;
        this.ambientPositions[idx + 1] = 1.0 + Math.random() * 12;
        this.ambientPositions[idx + 2] = playerPos.z + (Math.random() - 0.5) * 60;
      } else if (Math.abs(dz) > 40) {
        this.ambientPositions[idx] = playerPos.x + (Math.random() - 0.5) * 60;
        this.ambientPositions[idx + 1] = 1.0 + Math.random() * 12;
        this.ambientPositions[idx + 2] = playerPos.z + (Math.random() - 0.5) * 60;
      }
    }

    this.ambientPoints.geometry.attributes.position.needsUpdate = true;
  }
}

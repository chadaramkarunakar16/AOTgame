import * as THREE from 'three';

export interface SteamParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
}

export class BladeSlashVFX {
  public group: THREE.Group;
  private steamPoints: THREE.Points;
  private steamPositions: Float32Array;
  private steamOpacities: Float32Array;
  private maxSteamParticles: number = 600; // Large dense smoke volume
  private activeSteam: SteamParticle[] = [];

  // Hit-stop / slow-motion effect state
  public isHitStopping: boolean = false;
  private hitStopTimer: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Combat_VFX';

    // Dense smoke particles for dissolving defeated titans
    this.steamPositions = new Float32Array(this.maxSteamParticles * 3);
    this.steamOpacities = new Float32Array(this.maxSteamParticles);

    const steamGeo = new THREE.BufferGeometry();
    steamGeo.setAttribute('position', new THREE.BufferAttribute(this.steamPositions, 3));
    steamGeo.setAttribute('opacity', new THREE.BufferAttribute(this.steamOpacities, 1));

    const steamMat = new THREE.PointsMaterial({
      color: 0xf8f8f8,
      size: 4.5,
      transparent: true,
      opacity: 0.85,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    this.steamPoints = new THREE.Points(steamGeo, steamMat);
    this.group.add(this.steamPoints);
  }

  /**
   * Spawn dense billowing white smoke clouds at titan's position when killed
   */
  public spawnTitanSteam(position: THREE.Vector3, height: number = 12, count: number = 220): void {
    for (let i = 0; i < count; i++) {
      if (this.activeSteam.length >= this.maxSteamParticles) break;

      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 5.0,
        Math.random() * height * 0.9,
        (Math.random() - 0.5) * 5.0
      );

      this.activeSteam.push({
        position: position.clone().add(offset),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4.2,
          4.0 + Math.random() * 6.5,
          (Math.random() - 0.5) * 4.2
        ),
        size: 3.5 + Math.random() * 4.5,
        opacity: 0.9,
        life: 0,
        maxLife: 2.8 + Math.random() * 2.2
      });
    }
  }

  /**
   * Spawn localized high-pressure steam jet directly at the nape severed wound
   */
  public spawnWoundSiteSteam(woundPos: THREE.Vector3, normalDir: THREE.Vector3 = new THREE.Vector3(0, 1, 0)): void {
    const count = 35;
    for (let i = 0; i < count; i++) {
      if (this.activeSteam.length >= this.maxSteamParticles) break;

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        Math.random() * 0.8,
        (Math.random() - 0.5) * 1.2
      );

      const jetVel = normalDir.clone()
        .multiplyScalar(4.5 + Math.random() * 3.5)
        .add(spread.multiplyScalar(2.0));

      this.activeSteam.push({
        position: woundPos.clone().add(spread),
        velocity: jetVel,
        size: 1.2 + Math.random() * 1.8,
        opacity: 0.95,
        life: 0,
        maxLife: 1.6 + Math.random() * 1.2
      });
    }
  }

  /**
   * Trigger the satisfying hit-stop micro-pause
   */
  public triggerHitStop(durationMs: number = 75): void {
    this.isHitStopping = true;
    this.hitStopTimer = durationMs / 1000;
  }

  public update(dt: number): void {
    // Process hit-stop
    if (this.isHitStopping) {
      this.hitStopTimer -= dt;
      if (this.hitStopTimer <= 0) {
        this.isHitStopping = false;
      }
    }

    // Update steam particles
    for (let i = this.activeSteam.length - 1; i >= 0; i--) {
      const p = this.activeSteam[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.activeSteam.splice(i, 1);
        continue;
      }

      p.position.addScaledVector(p.velocity, dt);
      p.velocity.y += 0.5 * dt; // Upward thermal buoyancy
      p.opacity = (1 - p.life / p.maxLife) * 0.75;
    }

    // Update geometry attributes
    for (let i = 0; i < this.maxSteamParticles; i++) {
      const idx = i * 3;
      if (i < this.activeSteam.length) {
        const p = this.activeSteam[i];
        this.steamPositions[idx] = p.position.x;
        this.steamPositions[idx + 1] = p.position.y;
        this.steamPositions[idx + 2] = p.position.z;
        this.steamOpacities[i] = p.opacity;
      } else {
        this.steamPositions[idx + 1] = -9999;
        this.steamOpacities[i] = 0;
      }
    }

    this.steamPoints.geometry.attributes.position.needsUpdate = true;
  }
}

import * as THREE from 'three';

export class SpeedLinesVFX {
  public points: THREE.Points;
  private particleCount: number = 250;
  private positions: Float32Array;
  private camera: THREE.Camera;
  private maxDistance: number = 35;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.positions = new Float32Array(this.particleCount * 3);

    for (let i = 0; i < this.particleCount; i++) {
      this.resetParticle(i, true);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.12,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geo, mat);
  }

  private resetParticle(i: number, randomDist: boolean = false): void {
    const idx = i * 3;
    // Spawn around camera frustum perimeter
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + Math.random() * 12;
    const dist = randomDist ? Math.random() * this.maxDistance : this.maxDistance;

    // Relative to camera space initially
    this.positions[idx] = Math.cos(angle) * radius;
    this.positions[idx + 1] = Math.sin(angle) * radius;
    this.positions[idx + 2] = -dist;
  }

  public update(speed: number, playerVelocity: THREE.Vector3, dt: number): void {
    const mat = this.points.material as THREE.PointsMaterial;

    // Show speed lines only at high speeds (> 14 m/s ~ 50 km/h)
    const threshold = 14;
    if (speed < threshold) {
      mat.opacity = Math.max(0, mat.opacity - dt * 3);
      this.points.visible = mat.opacity > 0.01;
      return;
    }

    this.points.visible = true;
    const targetOpacity = Math.min((speed - threshold) / 25, 0.7);
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, dt * 6);

    // Lock points object to camera transform
    this.points.position.copy(this.camera.position);
    this.points.quaternion.copy(this.camera.quaternion);

    const streamSpeed = (speed * 1.8) * dt;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      this.positions[idx + 2] += streamSpeed;

      // Wrap around once passed camera
      if (this.positions[idx + 2] > 2) {
        this.resetParticle(i, false);
      }
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

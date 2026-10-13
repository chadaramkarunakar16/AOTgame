import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export enum CameraMode {
  FIRST_PERSON,
  THIRD_PERSON
}

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  public mode: CameraMode = CameraMode.THIRD_PERSON;

  public yaw: number = Math.PI;
  public pitch: number = 0;

  private targetYaw: number = Math.PI;
  private targetPitch: number = 0;

  private baseFov: number = 68;
  private maxFov: number = 96;
  private currentFov: number = 68;

  private shakeTrauma: number = 0;
  private thirdPersonDistance: number = 4.0;
  private thirdPersonHeight: number = 1.7;
  private currentCamPos: THREE.Vector3 = new THREE.Vector3();

  private physics?: PhysicsWorld;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.fov = this.baseFov;
  }

  public setPhysics(physics: PhysicsWorld): void {
    this.physics = physics;
  }

  public toggleMode(): void {
    this.mode =
      this.mode === CameraMode.FIRST_PERSON
        ? CameraMode.THIRD_PERSON
        : CameraMode.FIRST_PERSON;
  }

  public handleMouseLook(deltaX: number, deltaY: number, sensitivity: number = 0.0022): void {
    this.targetYaw -= deltaX * sensitivity;
    this.targetPitch -= deltaY * sensitivity;

    const maxPitch = (Math.PI / 2) * 0.95;
    this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
  }

  public addTrauma(amount: number): void {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + amount);
  }

  public update(
    playerPos: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    dt: number
  ): void {
    // 1. Butter-smooth rotation interpolation
    const rotSmoothFactor = 1.0 - Math.exp(-28 * dt);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, rotSmoothFactor);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, rotSmoothFactor);

    const speed = playerVelocity.length();

    // 2. Smooth FOV expansion (clean, gradual speed sense without jarring distortion)
    const targetFov = THREE.MathUtils.clamp(
      this.baseFov + (speed / 38) * (this.maxFov - this.baseFov),
      this.baseFov,
      this.maxFov
    );
    const fovSmooth = 1.0 - Math.exp(-6 * dt);
    this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, fovSmooth);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    // 3. Camera Orientation (STRICTLY LEVEL: roll = 0 for clean, stable horizon)
    const lookQuat = new THREE.Quaternion();
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    lookQuat.setFromEuler(euler);

    // 4. Shake trauma decay
    const shakeOffset = new THREE.Vector3();
    if (this.shakeTrauma > 0.001) {
      const shakeMag = this.shakeTrauma * this.shakeTrauma * 0.35;
      const t = Date.now() * 0.04;
      shakeOffset.set(
        Math.sin(t * 1.3) * shakeMag,
        Math.cos(t * 1.7) * shakeMag,
        Math.sin(t * 2.1) * shakeMag * 0.4
      );
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 3.0);
    }

    // 5. Position Camera
    const eyePos = playerPos.clone().add(new THREE.Vector3(0, 1.55, 0));

    if (this.mode === CameraMode.FIRST_PERSON) {
      this.camera.position.copy(eyePos).add(shakeOffset);
      this.camera.quaternion.copy(lookQuat);
      this.currentCamPos.copy(this.camera.position);
    } else {
      // Third Person Chase Cam with building obstacle collision prevention
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(lookQuat);
      const camPivot = eyePos.clone().add(new THREE.Vector3(0, this.thirdPersonHeight * 0.3, 0));

      let targetDistance = this.thirdPersonDistance;

      // Obstacle detection: Raycast back from pivot to camera target to prevent clipping into walls
      if (this.physics) {
        const backRay = new THREE.Ray(camPivot, forward.clone().negate());
        const hit = this.physics.raycast(backRay, this.thirdPersonDistance + 0.3);
        if (hit && hit.distance > 0.6) {
          targetDistance = Math.max(0.7, hit.distance - 0.35);
        }
      }

      const desiredCamPos = camPivot.clone()
        .addScaledVector(forward, -targetDistance)
        .add(shakeOffset);

      if (this.currentCamPos.lengthSq() === 0) {
        this.currentCamPos.copy(desiredCamPos);
      }

      // Smooth camera position damping
      const posSmooth = 1.0 - Math.exp(-24 * dt);
      this.currentCamPos.lerp(desiredCamPos, posSmooth);

      this.camera.position.copy(this.currentCamPos);
      this.camera.quaternion.copy(lookQuat);
    }
  }

  public getForwardVector(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
  }
}

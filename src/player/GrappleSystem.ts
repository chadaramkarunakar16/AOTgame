import * as THREE from 'three';
import { PhysicsWorld, RaycastHit } from '../physics/PhysicsWorld';
import { AudioManager } from '../engine/AudioManager';
import { CableVFX } from '../vfx/CableVFX';

export interface HookInstance {
  active: boolean;
  anchorPoint: THREE.Vector3;
  ropeLength: number;
  initialDistance: number;
  reelSpeed: number;
}

export class GrappleSystem {
  public leftHook: HookInstance = {
    active: false,
    anchorPoint: new THREE.Vector3(),
    ropeLength: 0,
    initialDistance: 0,
    reelSpeed: 30.0 // Smooth, responsive reel speed
  };

  public rightHook: HookInstance = {
    active: false,
    anchorPoint: new THREE.Vector3(),
    ropeLength: 0,
    initialDistance: 0,
    reelSpeed: 30.0
  };

  public maxRange: number = 110.0; // Generous anchor range for high mobility
  public minRopeLength: number = 3.5;

  // Gas resources
  public gasAmount: number = 100.0;
  public maxGas: number = 100.0;
  public gasBurnRate: number = 18.0; // Gas per second when boosting
  public gasRegenRate: number = 7.0;  // Gas per second on ground
  public landingCushionGasCost: number = 12.0; // Gas consumed to safely absorb a high-speed landing

  private physics: PhysicsWorld;
  private audio: AudioManager;
  public cableVfx: CableVFX;
  public onGrappleImpact?: (point: THREE.Vector3, normal: THREE.Vector3) => void;

  // Cached vector math
  private toAnchor = new THREE.Vector3();
  private hookDir = new THREE.Vector3();

  constructor(physics: PhysicsWorld, audio: AudioManager, cableVfx: CableVFX) {
    this.physics = physics;
    this.audio = audio;
    this.cableVfx = cableVfx;
  }

  /**
   * Check if a valid anchor point is currently targeted by player crosshair
   */
  public queryTarget(origin: THREE.Vector3, direction: THREE.Vector3): RaycastHit | null {
    const ray = new THREE.Ray(origin, direction);
    return this.physics.raycast(ray, this.maxRange);
  }

  /**
   * Fire or release left hook
   */
  public setLeftHook(
    trigger: boolean,
    origin: THREE.Vector3,
    lookDir: THREE.Vector3,
    launcherPos: THREE.Vector3
  ): void {
    if (trigger && !this.leftHook.active) {
      const sideOffset = new THREE.Vector3(-0.05, 0, 0).applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), lookDir)
      );
      this.hookDir.copy(lookDir).add(sideOffset).normalize();

      const hit = this.queryTarget(origin, this.hookDir) || this.queryTarget(origin, lookDir);
      if (hit) {
        this.leftHook.active = true;
        this.leftHook.anchorPoint.copy(hit.point);
        const dist = launcherPos.distanceTo(hit.point);
        this.leftHook.initialDistance = dist;
        this.leftHook.ropeLength = dist;

        this.audio.playHookShoot();
        this.audio.playHookLatch();
        if (this.onGrappleImpact) {
          this.onGrappleImpact(hit.point, hit.normal);
        }
      }
    } else if (!trigger && this.leftHook.active) {
      this.leftHook.active = false;
    }
  }

  /**
   * Fire or release right hook
   */
  public setRightHook(
    trigger: boolean,
    origin: THREE.Vector3,
    lookDir: THREE.Vector3,
    launcherPos: THREE.Vector3
  ): void {
    if (trigger && !this.rightHook.active) {
      const sideOffset = new THREE.Vector3(0.05, 0, 0).applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), lookDir)
      );
      this.hookDir.copy(lookDir).add(sideOffset).normalize();

      const hit = this.queryTarget(origin, this.hookDir) || this.queryTarget(origin, lookDir);
      if (hit) {
        this.rightHook.active = true;
        this.rightHook.anchorPoint.copy(hit.point);
        const dist = launcherPos.distanceTo(hit.point);
        this.rightHook.initialDistance = dist;
        this.rightHook.ropeLength = dist;

        this.audio.playHookShoot();
        this.audio.playHookLatch();
        if (this.onGrappleImpact) {
          this.onGrappleImpact(hit.point, hit.normal);
        }
      }
    } else if (!trigger && this.rightHook.active) {
      this.rightHook.active = false;
    }
  }

  /**
   * Execute a landing gas cushion retro-burst to nullify fall damage
   */
  public cushionLanding(): boolean {
    if (this.gasAmount >= 6.0) {
      this.gasAmount = Math.max(0, this.gasAmount - this.landingCushionGasCost);
      this.audio.playLandingCushion();
      return true; // Successfully cushioned with gas!
    }
    return false; // Not enough gas, take damage!
  }

  /**
   * Physics step for Spider-Man 1 style pendulum swinging:
   * Conserves momentum along the swing arc, allows swinging left or right (A/D lateral steering),
   * converts downward fall velocity into forward curve speed, and enables full pendulum trajectory carving.
   */
  public updatePhysics(
    playerPos: THREE.Vector3,
    velocity: THREE.Vector3,
    lookDir: THREE.Vector3,
    moveInput: THREE.Vector3,
    leftLauncherPos: THREE.Vector3,
    rightLauncherPos: THREE.Vector3,
    isReeling: boolean,
    isBoosting: boolean,
    isGrounded: boolean,
    dt: number
  ): void {
    const hasGas = this.gasAmount > 0;
    const canBoost = isBoosting && hasGas;

    // 1. Clean sound and gas propulsion
    this.audio.setGasActive(canBoost);

    if (canBoost) {
      this.gasAmount = Math.max(0, this.gasAmount - this.gasBurnRate * dt);
      // Clean forward and upward thruster boost
      const boostForce = 58.0;
      const boostVec = lookDir.clone().normalize();
      boostVec.y = Math.max(boostVec.y, 0.28); // Upward lift
      velocity.addScaledVector(boostVec, boostForce * dt);
    } else if (isGrounded && this.gasAmount < this.maxGas) {
      this.gasAmount = Math.min(this.maxGas, this.gasAmount + this.gasRegenRate * dt);
    }

    // 2. Spider-Man 1 Pendulum Arc Physics with Lateral Swing Steering
    const activeHooks = [
      { hook: this.leftHook, launcher: leftLauncherPos, side: 'left' as const },
      { hook: this.rightHook, launcher: rightLauncherPos, side: 'right' as const }
    ];

    for (const item of activeHooks) {
      const { hook, launcher, side } = item;
      if (!hook.active) {
        this.cableVfx.updateCable(side, false, launcher, null);
        continue;
      }

      // Update 3D wire visuals
      this.cableVfx.updateCable(side, true, launcher, hook.anchorPoint);

      this.toAnchor.subVectors(hook.anchorPoint, launcher);
      const currentDist = this.toAnchor.length();

      if (currentDist <= 0.001) continue;

      const unitToAnchor = this.toAnchor.clone().divideScalar(currentDist);

      // Fast reel-in with Space
      if (isReeling) {
        hook.ropeLength = Math.max(this.minRopeLength, hook.ropeLength - hook.reelSpeed * dt);
        velocity.addScaledVector(unitToAnchor, 36.0 * dt);
      }

      // Taut swing curve constraint
      if (currentDist >= hook.ropeLength) {
        // Enforce cable constraint: remove velocity pointing away from anchor
        const radialVel = velocity.dot(unitToAnchor);
        if (radialVel < 0) {
          velocity.addScaledVector(unitToAnchor, -radialVel);
        }

        // SPIDER-MAN STYLE PENDULUM CURVE PHYSICS:
        // Converts falling momentum into a powerful forward & lateral swing arc
        const speedSq = velocity.lengthSq();
        const centripetalAcc = speedSq / Math.max(hook.ropeLength, 3.5);
        velocity.addScaledVector(unitToAnchor, centripetalAcc * dt * 0.98);

        // Compute swing arc coordinate frame
        const upVec = new THREE.Vector3(0, 1, 0);
        // Lateral swing axis (perpendicular to cable and world up)
        const lateralAxis = new THREE.Vector3().crossVectors(unitToAnchor, upVec).normalize();
        // Forward swing tangent along arc path
        const forwardTangent = new THREE.Vector3().crossVectors(lateralAxis, unitToAnchor).normalize();
        if (forwardTangent.dot(velocity) < 0) forwardTangent.negate();

        const isBelowAnchor = launcher.y < hook.anchorPoint.y;
        if (isBelowAnchor) {
          // Dynamic pendulum drive: maximum kinetic pump at bottom of swing
          const bottomFactor = Math.max(0, 1.0 - Math.abs(unitToAnchor.y));
          const swingDrive = 32.0 * bottomFactor;
          velocity.addScaledVector(forwardTangent, swingDrive * dt);

          // Spider-Man apex lift: upward fling as the player rises out of the arc
          if (unitToAnchor.y > 0.05 && velocity.y < 8.0) {
            velocity.y += (18.0 + (isReeling ? 14.0 : 0.0)) * dt;
          }
        }

        // SPIDER-MAN LATERAL CURVE SWINGING (LEFT / RIGHT STEERING & BANKING):
        // When clicking/pressing Left (A) or Right (D), carve deep curved sweeps along the lateral axis!
        if (moveInput.lengthSq() > 0.01) {
          // If input has a lateral component relative to look/arc, steer aggressively
          const lateralInput = moveInput.dot(lateralAxis);
          // Apply strong lateral centripetal curve force (Spider-Man web swing banking)
          velocity.addScaledVector(lateralAxis, lateralInput * 38.0 * dt);

          // Forward/backward drive from W/S during swing
          const tangentInput = moveInput.dot(forwardTangent);
          velocity.addScaledVector(forwardTangent, tangentInput * 24.0 * dt);

          // Direct player steering input
          velocity.addScaledVector(moveInput, 20.0 * dt);
        }

        // Camera heading influence: smoothly bends the swing trajectory in the direction you look!
        const flatLook = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();
        if (flatLook.lengthSq() > 0) {
          velocity.addScaledVector(flatLook, 16.0 * dt);
        }
      }
    }
  }

  public resetHooks(): void {
    this.leftHook.active = false;
    this.rightHook.active = false;
    this.gasAmount = this.maxGas;
    this.audio.setGasActive(false);
  }

  public isAnyHookActive(): boolean {
    return this.leftHook.active || this.rightHook.active;
  }
}

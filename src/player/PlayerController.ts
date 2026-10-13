import * as THREE from 'three';
import { InputManager } from '../engine/InputManager';
import { PhysicsWorld, CollisionResult } from '../physics/PhysicsWorld';
import { AudioManager } from '../engine/AudioManager';
import { GrappleSystem } from './GrappleSystem';
import { CameraController, CameraMode } from './CameraController';
import { PlayerModel } from './PlayerModel';

export class PlayerController {
  public position: THREE.Vector3 = new THREE.Vector3(0, 56.5, -165);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  // Player physical dimensions
  public radius: number = 0.55;
  public height: number = 1.85;

  // State
  public isGrounded: boolean = false;
  public health: number = 500.0;
  public maxHealth: number = 500.0;
  public isDead: boolean = false;
  public isLandingHazardous: boolean = false; // Flag for HUD prompt

  // Blade Durability & Inventory
  public bladeDurability: number = 100.0; // 0 to 100
  public maxBladeDurability: number = 100.0;
  public spareBlades: number = 8; // Spare pairs of blades
  public maxSpareBlades: number = 8;
  public isBladeBroken: boolean = false;

  // Ground Movement constants
  private walkSpeed: number = 9.0;
  private sprintSpeed: number = 15.0;
  private groundFriction: number = 14.0; // Responsive, smooth deceleration
  private jumpForce: number = 11.5;

  // Air Movement constants
  private airControlAccel: number = 16.0;
  private airDrag: number = 0.08; // Minimal drag to preserve momentum smoothly

  // Spawn position on top of the stone fortress wall battlement (matching reference image!)
  private spawnPosition: THREE.Vector3 = new THREE.Vector3(0, 56.5, -165);

  // References
  public cameraController: CameraController;
  public grappleSystem: GrappleSystem;
  public playerModel: PlayerModel;
  private physics: PhysicsWorld;
  private audio: AudioManager;

  // Callbacks for HUD feedback
  public onTakeDamage?: (amount: number, newHealth: number) => void;
  public onCushionedLanding?: () => void;
  public onHardLanding?: (pos: THREE.Vector3, intensity: number) => void;
  public onBladeStateChanged?: (durability: number, spareCount: number, isBroken: boolean) => void;

  constructor(
    cameraController: CameraController,
    grappleSystem: GrappleSystem,
    playerModel: PlayerModel,
    physics: PhysicsWorld,
    audio: AudioManager
  ) {
    this.cameraController = cameraController;
    this.grappleSystem = grappleSystem;
    this.playerModel = playerModel;
    this.physics = physics;
    this.audio = audio;
  }

  public update(inputs: InputManager, dt: number): void {
    if (this.isDead) {
      if (inputs.state.reset) {
        this.respawn();
      }
      return;
    }

    if (inputs.state.reset) {
      this.respawn();
      return;
    }

    // Toggle 1st / 3rd Person View
    if (inputs.state.toggleView) {
      this.cameraController.toggleMode();
      this.playerModel.setVisible(this.cameraController.mode === CameraMode.THIRD_PERSON);
    }

    // Mouse look
    this.cameraController.handleMouseLook(inputs.state.mouseDeltaX, inputs.state.mouseDeltaY);

    const forwardDir = this.cameraController.getForwardVector();
    const yaw = this.cameraController.yaw;

    // True forward and right vectors aligned with camera view:
    // In Three.js standard coordinates, look direction at yaw=0 is (0, 0, -1).
    // forwardDir = (-sin(yaw), 0, -cos(yaw)).
    // Pressing 'W' (forward) adds forwardDir, 'S' (backward) subtracts forwardDir.
    const flatForward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
    const flatRight = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

    // Directional movement input
    const moveInput = new THREE.Vector3();
    if (inputs.state.forward) moveInput.add(flatForward);
    if (inputs.state.backward) moveInput.sub(flatForward);
    if (inputs.state.right) moveInput.add(flatRight);
    if (inputs.state.left) moveInput.sub(flatRight);

    if (moveInput.lengthSq() > 0) {
      moveInput.normalize();
    }

    // 1. Process Grappling Hook Triggers
    const eyePos = this.position.clone().add(new THREE.Vector3(0, 1.55, 0));
    this.grappleSystem.setLeftHook(
      inputs.state.hookLeft,
      eyePos,
      forwardDir,
      this.playerModel.leftLauncherPos
    );
    this.grappleSystem.setRightHook(
      inputs.state.hookRight,
      eyePos,
      forwardDir,
      this.playerModel.rightLauncherPos
    );

    // 2. Smooth, Natural Locomotion Physics
    if (this.isGrounded) {
      const targetSpeed = inputs.state.boost ? this.sprintSpeed : this.walkSpeed;
      const desiredVelX = moveInput.x * targetSpeed;
      const desiredVelZ = moveInput.z * targetSpeed;

      // Exponential smoothing for natural, silky smooth acceleration/stopping
      const groundSmooth = 1.0 - Math.exp(-this.groundFriction * dt);
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, desiredVelX, groundSmooth);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, desiredVelZ, groundSmooth);

      // Jump
      if (inputs.state.jump) {
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.audio.playJump();
      }
    } else {
      // Airborne movement: Gravity + air strafing
      this.velocity.y += this.physics.gravity * dt;

      // Air strafing impulse without cancelling grapple momentum
      if (moveInput.lengthSq() > 0) {
        this.velocity.x += moveInput.x * this.airControlAccel * dt;
        this.velocity.z += moveInput.z * this.airControlAccel * dt;
      }

      // Very light aerodynamic drag
      this.velocity.x -= this.velocity.x * this.airDrag * dt;
      this.velocity.z -= this.velocity.z * this.airDrag * dt;
    }

    // 3. Grapple System Physics & Cable Tension (Reel cable without using gas!)
    // When hooks are attached, player can reel cable with Space, Shift, or C to roll down and pull themselves in!
    const isReeling = (inputs.state.reel || (inputs.state.jump && !this.isGrounded));
    const isBoosting = inputs.state.boost && !this.grappleSystem.isAnyHookActive(); // Shift on ground / free-fall boosts; when hooked, Shift reels!

    this.grappleSystem.updatePhysics(
      this.position,
      this.velocity,
      forwardDir,
      moveInput,
      this.playerModel.leftLauncherPos,
      this.playerModel.rightLauncherPos,
      isReeling,
      isBoosting,
      this.isGrounded,
      dt
    );

    // Swap Blades (R key)
    if (inputs.state.swapBlades) {
      this.swapBlades();
    }

    // Hazard check: Are we falling fast enough to get hurt if we don't burst gas?
    this.isLandingHazardous = !this.isGrounded && (this.velocity.y < -this.physics.safeImpactSpeed || this.velocity.length() > this.physics.safeImpactSpeed + 5);

    // 4. Resolve World Collisions & Impact Deceleration
    const collisionResult: CollisionResult = this.physics.resolveMovement(
      this.position,
      this.velocity,
      this.radius,
      this.height,
      dt
    );

    this.isGrounded = collisionResult.isGrounded;

    // 5. Landing / Impact Damage Resolution with Gas Cushion
    if (collisionResult.impactVelocity > this.physics.safeImpactSpeed) {
      // Player collided at high velocity! Check if gas burst was active to cushion landing
      const isBurstingGas = inputs.state.boost;

      if (isBurstingGas && this.grappleSystem.cushionLanding()) {
        // Successfully cushioned landing using gas!
        // Negate impact damage completely (0 HP loss)!
        this.velocity.y = 0;
        this.cameraController.addTrauma(0.15); // Gentle landing rumble
        if (this.onCushionedLanding) {
          this.onCushionedLanding();
        }
        if (this.onHardLanding) {
          this.onHardLanding(this.position, 1.2);
        }
      } else {
        // Player did NOT burst gas: gentle moderate damage, never kills directly!
        const excessSpeed = collisionResult.impactVelocity - this.physics.safeImpactSpeed;
        const damage = Math.min(30, Math.max(6, Math.floor(excessSpeed * 0.9)));
        this.applyDamage(damage, Math.min(0.3, excessSpeed / 40.0));
        if (this.onHardLanding) {
          this.onHardLanding(this.position, Math.min(1.6, excessSpeed / 12.0));
        }
      }
    }

    // Active Brake Thrusters (G key from reference image!)
    if (inputs.state.brake) {
      this.velocity.multiplyScalar(0.92);
      if (this.velocity.y < -4.0) {
        this.velocity.y *= 0.86;
      }
    }

    // 6. Update Character Model and Camera
    const isHooked = this.grappleSystem.isAnyHookActive();
    const isThrusterActive = (inputs.state.boost || inputs.state.jump) && this.grappleSystem.gasAmount > 0;
    this.playerModel.update(this.position, yaw, this.velocity, this.isGrounded, isHooked, dt, isThrusterActive);
    this.cameraController.update(this.position, this.velocity, dt);

    // Modulate wind speed audio
    this.audio.updateWindSpeed(this.velocity.length());
  }

  public get yaw(): number {
    return this.cameraController.yaw;
  }

  public applyDamage(amount: number, severity: number): void {
    if (this.isDead) return;

    this.health = Math.max(0, this.health - amount);
    this.audio.playImpact(severity);
    this.cameraController.addTrauma(Math.min(1.0, severity * 0.75));

    if (this.onTakeDamage) {
      this.onTakeDamage(amount, this.health);
    }

    if (this.health <= 0) {
      this.isDead = true;
      setTimeout(() => {
        this.respawn();
      }, 2000);
    }
  }

  public respawn(): void {
    this.position.copy(this.spawnPosition);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.isDead = false;
    this.grappleSystem.resetHooks();
    this.bladeDurability = this.maxBladeDurability;
    this.spareBlades = this.maxSpareBlades;
    this.isBladeBroken = false;
    this.playerModel.setBladesBroken(false);
    if (this.onTakeDamage) {
      this.onTakeDamage(0, this.health);
    }
    if (this.onBladeStateChanged) {
      this.onBladeStateChanged(this.bladeDurability, this.spareBlades, this.isBladeBroken);
    }
  }

  /**
   * Consume blade durability on strike.
   * If durability hits 0, blades break with snap sound effect!
   */
  public useBladeDurability(amount: number = 20.0): boolean {
    if (this.isBladeBroken) return false;

    this.bladeDurability = Math.max(0, this.bladeDurability - amount);
    if (this.bladeDurability <= 0) {
      this.isBladeBroken = true;
      this.playerModel.setBladesBroken(true);
      this.audio.playBladeSnap();
      this.cameraController.addTrauma(0.35);
    }

    if (this.onBladeStateChanged) {
      this.onBladeStateChanged(this.bladeDurability, this.spareBlades, this.isBladeBroken);
    }
    return !this.isBladeBroken;
  }

  /**
   * Eject broken blades and reload fresh pair from side scabbards
   */
  public swapBlades(): boolean {
    if (this.spareBlades <= 0) return false;
    if (this.bladeDurability >= this.maxBladeDurability && !this.isBladeBroken) return false;

    this.spareBlades--;
    this.bladeDurability = this.maxBladeDurability;
    this.isBladeBroken = false;
    this.playerModel.setBladesBroken(false);
    this.audio.playBladeReload();

    if (this.onBladeStateChanged) {
      this.onBladeStateChanged(this.bladeDurability, this.spareBlades, this.isBladeBroken);
    }
    return true;
  }

  /**
   * Refill knives / spare blades at resupply depot
   */
  public refillBlades(amount: number = 8): void {
    this.spareBlades = Math.min(this.maxSpareBlades, this.spareBlades + amount);
    if (this.isBladeBroken) {
      this.swapBlades();
    } else if (this.onBladeStateChanged) {
      this.onBladeStateChanged(this.bladeDurability, this.spareBlades, this.isBladeBroken);
    }
  }

  /**
   * Full stock replenish: Heals HP to 100%, refuels gas tank, sharpens & restocks blades
   */
  public fullRefillAndHeal(): void {
    this.health = this.maxHealth;
    this.bladeDurability = this.maxBladeDurability;
    this.spareBlades = this.maxSpareBlades;
    this.isBladeBroken = false;
    this.playerModel.setBladesBroken(false);
    this.grappleSystem.gasAmount = this.grappleSystem.maxGas;

    if (this.onTakeDamage) {
      this.onTakeDamage(0, this.health);
    }
    if (this.onBladeStateChanged) {
      this.onBladeStateChanged(this.bladeDurability, this.spareBlades, this.isBladeBroken);
    }
  }
}

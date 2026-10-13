import * as THREE from 'three';
import { AudioManager } from '../engine/AudioManager';
import { CelShadingHelper } from '../materials/CelShadingHelper';
import { VoxelTextureAtlas } from '../materials/VoxelTextureAtlas';

export enum TitanState {
  WANDERING,
  CHASING,
  ATTACKING,
  DYING,
  DEAD
}

export class Titan {
  public id: string;
  public group: THREE.Group;
  public state: TitanState = TitanState.WANDERING;

  // Dimensions & Scale Variations
  public position: THREE.Vector3 = new THREE.Vector3();
  public rotationY: number = 0;
  public baseHeight: number = 12.0;
  public height: number = 12.0;
  public scaleFactor: THREE.Vector3 = new THREE.Vector3(1, 1, 1);
  public speed: number = 3.6;
  public detectRadius: number = 44.0;
  public attackRadius: number = 5.5;
  public boundingBox: THREE.Box3 = new THREE.Box3();

  // Precise Nape Hitbox
  public napeWorldPos: THREE.Vector3 = new THREE.Vector3();
  public napeBox: THREE.Box3 = new THREE.Box3();
  private napeMarker: THREE.Mesh;

  // Rigging parts for lumbering animation
  private torso: THREE.Mesh;
  private headGroup: THREE.Group;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;

  // Limb Severance & Rapid Regeneration (Attack on Titan biology!)
  public leftArmSevered: boolean = false;
  public rightArmSevered: boolean = false;
  public leftLegSevered: boolean = false;
  public rightLegSevered: boolean = false;
  private leftArmRegenTimer: number = 0;
  private rightArmRegenTimer: number = 0;
  private leftLegRegenTimer: number = 0;
  private rightLegRegenTimer: number = 0;
  public isRegenerating: boolean = false;

  // Animation cycle & Patrol
  private walkTime: number = Math.random() * 10;
  private patrolTarget: THREE.Vector3 = new THREE.Vector3();
  private patrolTimer: number = 0;
  private deathTimer: number = 0;
  private lastFootstep: number = 0;
  private attackCooldown: number = 0;

  // Minecraft Hurt Red Tint & Death Evaporation VFX
  private hurtTimer: number = 0;
  private allMeshes: THREE.Mesh[] = [];

  private audio: AudioManager;
  public onFootstep?: (pos: THREE.Vector3) => void;
  public onRegenSteam?: (pos: THREE.Vector3) => void;

  constructor(id: string, initialPos: THREE.Vector3, audio: AudioManager, heightScale: number = 1.0, speedScale: number = 1.0) {
    this.id = id;
    this.position.copy(initialPos);
    this.rotationY = Math.random() * Math.PI * 2;
    this.audio = audio;

    // Titan Classes: Small (3-7m fast scout), Medium (8-14m regular), Large (15-22m towering slow giant)
    const sY = heightScale;
    const sX = (heightScale >= 1.3 ? 1.25 : (heightScale <= 0.7 ? 0.75 : 1.0)) * (0.9 + Math.random() * 0.2);
    const sZ = (heightScale >= 1.3 ? 1.25 : (heightScale <= 0.7 ? 0.75 : 1.0)) * (0.9 + Math.random() * 0.2);
    this.scaleFactor.set(sX, sY, sZ);
    this.height = this.baseHeight * sY;

    // Small Titans are agile & fast, Giant Titans are slow & heavy
    this.speed = (3.2 * speedScale) / Math.sqrt(Math.max(0.6, heightScale));

    this.group = new THREE.Group();
    this.group.name = `Titan_${id}`;
    this.group.scale.copy(this.scaleFactor);

    // 1. Authentic Minecraft Voxel Mob Textures & Materials
    const faceTex = VoxelTextureAtlas.getMinecraftTitanFaceTexture();
    const bodyTex = VoxelTextureAtlas.getMinecraftTitanBodyTexture();
    const limbTex = VoxelTextureAtlas.getMinecraftTitanLimbTexture();
    const napeTex = VoxelTextureAtlas.getMinecraftTitanNapeTexture();
    const hairTex = VoxelTextureAtlas.getMinecraftTitanHairTexture();

    const fleshMat = new THREE.MeshLambertMaterial({ map: limbTex });
    const bodyMat = new THREE.MeshLambertMaterial({ map: bodyTex });
    const hairMat = new THREE.MeshLambertMaterial({ map: hairTex });
    const napeMuscleMat = new THREE.MeshLambertMaterial({ map: napeTex });

    // Head Materials: [+X, -X, +Y (hair), -Y (flesh), +Z (face), -Z (back hair)]
    const headFaceMat = new THREE.MeshLambertMaterial({ map: faceTex });
    const headMaterials = [hairMat, hairMat, hairMat, fleshMat, headFaceMat, hairMat];

    // 2. Rectangular Minecraft Mob Chest & Torso
    const torsoGeo = new THREE.BoxGeometry(3.6, 5.0, 2.4);
    this.torso = new THREE.Mesh(torsoGeo, bodyMat);
    this.torso.position.y = 7.5;
    this.group.add(this.torso);

    // 3. Uncanny Blocky Head with Wide Sinister Grin
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 10.8, 0.2);

    const headGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const headMesh = new THREE.Mesh(headGeo, headMaterials);
    this.headGroup.add(headMesh);

    // Disheveled messy hair block cap
    const hairGeo = new THREE.BoxGeometry(2.3, 0.8, 2.3);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 0.9, -0.05);
    this.headGroup.add(hair);

    this.group.add(this.headGroup);

    // 4. Exposed Crimson Nape Muscle Weak-Point (Back of Neck at -Z)
    const napeGeo = new THREE.BoxGeometry(1.1, 0.8, 0.45);
    this.napeMarker = new THREE.Mesh(napeGeo, napeMuscleMat);
    this.napeMarker.position.set(0, 10.4, -0.9);
    this.group.add(this.napeMarker);

    // 5. Exaggerated, Disproportionately Long Arms
    const armLength = 5.6 * (1.0 + Math.random() * 0.25);
    const armGeo = new THREE.BoxGeometry(0.9, armLength, 0.9);
    this.leftArm = new THREE.Mesh(armGeo, fleshMat);
    this.leftArm.position.set(-2.4, 7.2, 0);
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, fleshMat);
    this.rightArm.position.set(2.4, 7.2, 0);
    this.group.add(this.rightArm);

    // 6. Lumbering Stomping Legs
    const legGeo = new THREE.BoxGeometry(1.2, 5.5, 1.2);
    this.leftLeg = new THREE.Mesh(legGeo, fleshMat);
    this.leftLeg.position.set(-1.1, 2.75, 0);
    this.group.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, fleshMat);
    this.rightLeg.position.set(1.1, 2.75, 0);
    this.group.add(this.rightLeg);

    // Collect all meshes for hurt red flash & death smoke evaporation
    this.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        this.allMeshes.push(obj as THREE.Mesh);
      }
    });

    this.pickNewPatrolPoint();
    this.updateNapeAndBounds();
  }

  /**
   * Triggers Minecraft-style red damage flash when struck
   */
  public triggerHurtFlash(duration: number = 0.35): void {
    this.hurtTimer = duration;
    this.applyHurtTint(true);
  }

  private applyHurtTint(isHurt: boolean, redIntensity: number = 0.85): void {
    for (const mesh of this.allMeshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if ((m as THREE.MeshLambertMaterial).color) {
          if (isHurt) {
            (m as THREE.MeshLambertMaterial).color.setRGB(1.0, 1.0 - redIntensity * 0.8, 1.0 - redIntensity * 0.8);
          } else {
            (m as THREE.MeshLambertMaterial).color.setRGB(1.0, 1.0, 1.0);
          }
        }
      }
    }
  }

  private pickNewPatrolPoint(): void {
    const wanderRadius = 45;
    this.patrolTarget.set(
      this.position.x + (Math.random() - 0.5) * wanderRadius * 2,
      0,
      this.position.z + (Math.random() - 0.5) * wanderRadius * 2
    );
    this.patrolTimer = 6.0 + Math.random() * 5.0;
  }

  /**
   * Recalculates precise world-space nape bounding box and titan body bounds
   */
  public updateNapeAndBounds(): void {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;

    // Transformed Nape position in world space
    const localNape = new THREE.Vector3(0, 10.4 * this.scaleFactor.y, -0.9 * this.scaleFactor.z);
    localNape.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);
    this.napeWorldPos.copy(this.position).add(localNape);

    // Precise Nape Hitbox
    const napeHalfSize = new THREE.Vector3(0.7 * this.scaleFactor.x, 0.6 * this.scaleFactor.y, 0.6 * this.scaleFactor.z);
    this.napeBox.min.copy(this.napeWorldPos).sub(napeHalfSize);
    this.napeBox.max.copy(this.napeWorldPos).add(napeHalfSize);

    // Broadphase Titan Body Box
    const radius = 2.6 * this.scaleFactor.x;
    this.boundingBox.min.set(this.position.x - radius, this.position.y, this.position.z - radius);
    this.boundingBox.max.set(this.position.x + radius, this.position.y + this.height, this.position.z + radius);
  }

  /**
   * Checks if player strike hits the nape at sufficient velocity from the rear/flank
   */
  public checkNapeStrike(playerPos: THREE.Vector3, playerVelocity: THREE.Vector3): boolean {
    if (this.state === TitanState.DYING || this.state === TitanState.DEAD) {
      return false;
    }

    const distToNape = playerPos.distanceTo(this.napeWorldPos);
    if (distToNape > 2.0 && !this.napeBox.containsPoint(playerPos)) {
      return false;
    }

    // Velocity threshold
    const strikeSpeed = playerVelocity.length();
    if (strikeSpeed < 12.5) {
      return false;
    }

    // Directional check: rear strike
    const forwardX = -Math.sin(this.rotationY);
    const forwardZ = -Math.cos(this.rotationY);
    const titanForward = new THREE.Vector3(forwardX, 0, forwardZ);

    const toPlayer = playerPos.clone().sub(this.position).normalize();
    const dot = toPlayer.dot(titanForward);

    if (dot > 0.28) {
      return false;
    }

    return true;
  }

  public kill(): void {
    this.state = TitanState.DYING;
    this.deathTimer = 1.6; // 1.6s red flash & death smoke before disappearing
    this.applyHurtTint(true, 1.0);
  }

  /**
   * Chop off a Titan body part (Arm or Leg).
   * Titans do NOT die from body attacks—they immediately start rapidly regenerating!
   * If legs are chopped, the Titan collapses onto its knees / ground and cannot stand until regenerated!
   */
  public severBodyPart(part: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'): void {
    const armRegenDuration = 6.0;  // Hands take 6 seconds to regenerate
    const legRegenDuration = 8.5;  // Legs take 8.5 seconds to regenerate
    if (part === 'leftArm') {
      this.leftArmSevered = true;
      this.leftArmRegenTimer = armRegenDuration;
      this.leftArm.scale.set(0.08, 0.08, 0.08);
    } else if (part === 'rightArm') {
      this.rightArmSevered = true;
      this.rightArmRegenTimer = armRegenDuration;
      this.rightArm.scale.set(0.08, 0.08, 0.08);
    } else if (part === 'leftLeg') {
      this.leftLegSevered = true;
      this.leftLegRegenTimer = legRegenDuration;
      this.leftLeg.scale.set(0.08, 0.08, 0.08);
    } else if (part === 'rightLeg') {
      this.rightLegSevered = true;
      this.rightLegRegenTimer = legRegenDuration;
      this.rightLeg.scale.set(0.08, 0.08, 0.08);
    }

    if (this.onRegenSteam) {
      this.onRegenSteam(this.position.clone().add(new THREE.Vector3(0, this.height * 0.5, 0)));
    }
  }

  /**
   * Update AI, lumbering gait, uncanny posture, and limb regeneration with kneeling collapse physics
   */
  public update(playerPos: THREE.Vector3, dt: number): { playerDamaged: boolean; damage: number } {
    if (this.state === TitanState.DEAD) {
      return { playerDamaged: false, damage: 0 };
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // Update Minecraft damage hurt red flash
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      if (this.hurtTimer <= 0) {
        this.applyHurtTint(false);
      }
    }

    // Limb Regeneration Physics:
    // If player chopped arms or legs, limbs regrow gradually accompanied by steam
    this.isRegenerating = false;
    if (this.leftArmSevered) {
      this.leftArmRegenTimer -= dt;
      this.isRegenerating = true;
      const progress = Math.max(0, 1.0 - this.leftArmRegenTimer / 6.0);
      const sc = 0.08 + progress * 0.92;
      this.leftArm.scale.set(sc, sc, sc);
      if (this.leftArmRegenTimer <= 0) {
        this.leftArmSevered = false;
        this.leftArm.scale.set(1, 1, 1);
      }
    }
    if (this.rightArmSevered) {
      this.rightArmRegenTimer -= dt;
      this.isRegenerating = true;
      const progress = Math.max(0, 1.0 - this.rightArmRegenTimer / 6.0);
      const sc = 0.08 + progress * 0.92;
      this.rightArm.scale.set(sc, sc, sc);
      if (this.rightArmRegenTimer <= 0) {
        this.rightArmSevered = false;
        this.rightArm.scale.set(1, 1, 1);
      }
    }
    if (this.leftLegSevered) {
      this.leftLegRegenTimer -= dt;
      this.isRegenerating = true;
      const progress = Math.max(0, 1.0 - this.leftLegRegenTimer / 8.5);
      const sc = 0.08 + progress * 0.92;
      this.leftLeg.scale.set(sc, sc, sc);
      if (this.leftLegRegenTimer <= 0) {
        this.leftLegSevered = false;
        this.leftLeg.scale.set(1, 1, 1);
      }
    }
    if (this.rightLegSevered) {
      this.rightLegRegenTimer -= dt;
      this.isRegenerating = true;
      const progress = Math.max(0, 1.0 - this.rightLegRegenTimer / 8.5);
      const sc = 0.08 + progress * 0.92;
      this.rightLeg.scale.set(sc, sc, sc);
      if (this.rightLegRegenTimer <= 0) {
        this.rightLegSevered = false;
        this.rightLeg.scale.set(1, 1, 1);
      }
    }

    // 1. Dying State (Becomes red, emits billowing death smoke, and disappears!)
    if (this.state === TitanState.DYING) {
      this.deathTimer -= dt;
      this.applyHurtTint(true, 0.95); // Deep red Minecraft death tint!

      this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, 0.7, dt * 5);
      this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, 0.9, dt * 5);
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0.8, dt * 5);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0.8, dt * 5);
      this.position.y = THREE.MathUtils.lerp(this.position.y, -2.5, dt * 3);
      this.group.position.copy(this.position);

      // Continuous evaporating death steam
      if (this.onRegenSteam && Math.random() > 0.4) {
        this.onRegenSteam(this.position.clone().add(new THREE.Vector3(0, this.height * 0.4, 0)));
      }

      if (this.deathTimer <= 0) {
        this.state = TitanState.DEAD;
        this.group.visible = false;
        this.napeMarker.visible = false;
      }
      return { playerDamaged: false, damage: 0 };
    }

    // LEGS SEVERED: COLLAPSE TO KNEES / GROUND!
    // The Titan cannot stand, walk, or run until BOTH legs are fully regenerated!
    const isGroundedLegless = this.leftLegSevered || this.rightLegSevered;
    if (isGroundedLegless) {
      // Slump downward onto knees
      const targetY = -2.6 * this.scaleFactor.y;
      this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, dt * 4.5);
      this.group.position.copy(this.position);

      // Kneeling posture
      this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, 0.55, dt * 4);
      this.torso.rotation.z = THREE.MathUtils.lerp(this.torso.rotation.z, (this.leftLegSevered ? -0.25 : 0.25), dt * 4);
      this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, 0.4, dt * 4);
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 1.2, dt * 4);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 1.2, dt * 4);

      // Flail arms on the ground if not severed
      if (!this.leftArmSevered) this.leftArm.rotation.x = Math.sin(Date.now() * 0.005) * 0.3 + 0.6;
      if (!this.rightArmSevered) this.rightArm.rotation.x = -Math.sin(Date.now() * 0.005) * 0.3 + 0.6;

      this.updateNapeAndBounds();
      return { playerDamaged: false, damage: 0 };
    } else {
      // Restore standing height as legs regenerate
      this.position.y = THREE.MathUtils.lerp(this.position.y, 0, dt * 3.5);
      this.group.position.copy(this.position);
    }

    // 2. AI Decision Tree (Only active when legs are intact)
    const distToPlayer = this.position.distanceTo(playerPos);
    let moveTarget = this.patrolTarget;

    if (distToPlayer < this.detectRadius) {
      if (this.state !== TitanState.CHASING && this.state !== TitanState.ATTACKING) {
        this.audio.playTitanRoar();
      }
      this.state = TitanState.CHASING;
      moveTarget = playerPos;
    } else {
      this.state = TitanState.WANDERING;
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0 || this.position.distanceTo(this.patrolTarget) < 3.0) {
        this.pickNewPatrolPoint();
      }
    }

    // 3. Movement & Rotation toward target
    const dx = moveTarget.x - this.position.x;
    const dz = moveTarget.z - this.position.z;
    const targetAngle = Math.atan2(dx, dz);

    let angleDiff = targetAngle - this.rotationY;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.rotationY += angleDiff * Math.min(1.0, dt * 2.2);

    const currentSpeed = this.state === TitanState.CHASING ? this.speed * 1.3 : this.speed;
    const moveX = Math.sin(this.rotationY) * currentSpeed * dt;
    const moveZ = Math.cos(this.rotationY) * currentSpeed * dt;
    this.position.x += moveX;
    this.position.z += moveZ;

    // 4. Grotesque Lumbering Walk Animation
    this.walkTime += dt * (currentSpeed * 1.1);
    const legAngle = Math.sin(this.walkTime) * 0.58;
    const armAngle = -legAngle * 0.72;

    this.leftLeg.rotation.x = legAngle;
    this.rightLeg.rotation.x = -legAngle;
    this.leftArm.rotation.x = armAngle;
    this.rightArm.rotation.x = -armAngle;

    // Unsettling hunched forward sway and head twitch
    this.torso.rotation.z = Math.sin(this.walkTime) * 0.07;
    this.torso.rotation.x = 0.15 + Math.sin(this.walkTime * 2) * 0.04;
    this.headGroup.rotation.y = Math.sin(this.walkTime * 0.5) * 0.14;

    // Pulsating nape weak-point indicator
    const pulse = 0.8 + Math.sin(Date.now() * 0.008) * 0.2;
    (this.napeMarker.material as THREE.MeshBasicMaterial).color.setRGB(pulse, 0.1, 0.1);

    // Footstep stomps & ground dust clouds
    const footstepPhase = Math.sin(this.walkTime);
    if ((footstepPhase > 0.95 || footstepPhase < -0.95) && Date.now() - this.lastFootstep > 450) {
      this.lastFootstep = Date.now();
      if (distToPlayer < 50) {
        this.audio.playTitanStomp();
      }
      if (this.onFootstep) {
        // Position at feet
        const footPos = this.position.clone();
        footPos.x += (footstepPhase > 0 ? 1.1 : -1.1) * this.scaleFactor.x;
        this.onFootstep(footPos);
      }
    }

    this.updateNapeAndBounds();

    // 5. Titan Swat Attack
    let playerDamaged = false;
    let damage = 0;

    if (distToPlayer < this.attackRadius * this.scaleFactor.x && this.attackCooldown <= 0) {
      const forwardX = Math.sin(this.rotationY);
      const forwardZ = Math.cos(this.rotationY);
      const toPlayer = playerPos.clone().sub(this.position).normalize();
      const dot = toPlayer.dot(new THREE.Vector3(forwardX, 0, forwardZ));

      if (dot > 0.05 && playerPos.y < this.height * 0.85) {
        playerDamaged = true;
        damage = 38.0;
        this.attackCooldown = 1.8;
        this.rightArm.rotation.x = 1.3;
      }
    }

    return { playerDamaged, damage };
  }
}

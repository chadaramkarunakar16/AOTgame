import * as THREE from 'three';
import { CelShadingHelper } from '../materials/CelShadingHelper';
import { VoxelTextureAtlas } from '../materials/VoxelTextureAtlas';

/**
 * Authentic Minecraft Survey Corps Scout Character Rig
 * Built with canonical Minecraft Steve/Alex proportions (0.5m head, 0.5x0.72x0.25m torso,
 * 0.24x0.72x0.24m limbs) and authentic pixel-art UV-mapped Scout uniform textures.
 * Front faces -Z (camera forward direction), back faces +Z (chase camera view).
 */
export class PlayerModel {
  public mesh: THREE.Group;
  public leftLauncherPos: THREE.Vector3 = new THREE.Vector3();
  public rightLauncherPos: THREE.Vector3 = new THREE.Vector3();

  private capeGroup: THREE.Group;
  private headMesh: THREE.Mesh;
  private torsoMesh: THREE.Mesh;
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private leftGasPlume: THREE.Mesh;
  private rightGasPlume: THREE.Mesh;

  private walkCycle: number = 0;
  private isSlashing: boolean = false;
  private isAirSlash: boolean = false;
  private slashTimer: number = 0;
  private slashDuration: number = 0.35;

  private leftBlade: THREE.Mesh;
  private rightBlade: THREE.Mesh;

  constructor() {
    this.mesh = new THREE.Group();
    this.mesh.name = 'Minecraft_Survey_Corps_Scout';

    const wingsTexture = CelShadingHelper.getWingsOfFreedomTexture();

    // ─── 1. AUTHENTIC MINECRAFT PIXEL TEXTURES & MATERIALS ───
    const faceTex = VoxelTextureAtlas.getScoutFaceTexture();
    const hairTex = VoxelTextureAtlas.getScoutHairTexture();
    const torsoFrontTex = VoxelTextureAtlas.getScoutTorsoFrontTexture();
    const torsoBackTex = VoxelTextureAtlas.getScoutTorsoBackTexture();
    const armTex = VoxelTextureAtlas.getScoutArmTexture();
    const legTex = VoxelTextureAtlas.getScoutLegTexture();
    const capeTex = VoxelTextureAtlas.getScoutCapeTexture();

    // Head Materials: [+X (right), -X (left), +Y (top), -Y (bottom), +Z (back hair), -Z (front face)]
    const hairMat = new THREE.MeshLambertMaterial({ map: hairTex });
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTex });
    const skinNeckMat = new THREE.MeshLambertMaterial({ color: 0xffcfab });
    const headMaterials = [hairMat, hairMat, hairMat, skinNeckMat, hairMat, faceMat];

    // Torso Materials: [+X (right), -X (left), +Y (top), -Y (bottom), +Z (back jacket), -Z (front chest)]
    const jacketSideMat = new THREE.MeshLambertMaterial({ color: 0x8a5c34 });
    const collarMat = new THREE.MeshLambertMaterial({ color: 0x3a271b });
    const beltMat = new THREE.MeshLambertMaterial({ color: 0x3a2416 });
    const torsoFrontMat = new THREE.MeshLambertMaterial({ map: torsoFrontTex });
    const torsoBackMat = new THREE.MeshLambertMaterial({ map: torsoBackTex });
    const torsoMaterials = [jacketSideMat, jacketSideMat, collarMat, beltMat, torsoBackMat, torsoFrontMat];

    // Limb Materials
    const armMat = new THREE.MeshLambertMaterial({ map: armTex });
    const legMat = new THREE.MeshLambertMaterial({ map: legTex });
    const capeMat = new THREE.MeshLambertMaterial({ map: capeTex });

    // ODM Gear & Blade Materials
    const odmMetalMat = new THREE.MeshLambertMaterial({ color: 0x8294a6 });
    const gasCanisterMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });

    // ─── 2. CANONICAL MINECRAFT TORSO (0.50 x 0.72 x 0.25 m) ───
    const torsoGeo = new THREE.BoxGeometry(0.50, 0.72, 0.25);
    this.torsoMesh = new THREE.Mesh(torsoGeo, torsoMaterials);
    this.torsoMesh.position.y = 1.08;
    this.mesh.add(this.torsoMesh);

    // ─── 3. CANONICAL MINECRAFT HEAD (0.48 x 0.48 x 0.48 m cube) ───
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    this.headMesh = new THREE.Mesh(headGeo, headMaterials);
    this.headMesh.position.y = 1.68;
    this.mesh.add(this.headMesh);

    // ─── 4. EMERALD GREEN SCOUT CAPE WITH WINGS OF FREEDOM SHIELD (On Back at +Z) ───
    this.capeGroup = new THREE.Group();
    this.capeGroup.position.set(0, 1.42, 0.13); // Back of torso

    const capeGeo = new THREE.BoxGeometry(0.52, 0.84, 0.04);
    const capeCloth = new THREE.Mesh(capeGeo, capeMat);
    capeCloth.position.set(0, -0.42, 0.02);
    this.capeGroup.add(capeCloth);

    // Wings of Freedom Pixel-Art Shield Emblem on Cape Back (facing +Z toward chase camera)
    const capeEmblemGeo = new THREE.PlaneGeometry(0.38, 0.44);
    const capeEmblemMat = new THREE.MeshBasicMaterial({
      map: wingsTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    const capeEmblem = new THREE.Mesh(capeEmblemGeo, capeEmblemMat);
    capeEmblem.position.set(0, -0.42, 0.045);
    this.capeGroup.add(capeEmblem);

    this.mesh.add(this.capeGroup);

    // ─── 5. SURVEY CORPS ODM GEAR (Scabbards & Twin Gas Cylinders on Hips) ───
    const scabbardGeo = new THREE.BoxGeometry(0.12, 0.22, 0.65);
    const leftScabbard = new THREE.Mesh(scabbardGeo, odmMetalMat);
    leftScabbard.position.set(-0.33, 0.78, 0.0);
    this.mesh.add(leftScabbard);

    const rightScabbard = new THREE.Mesh(scabbardGeo, odmMetalMat);
    rightScabbard.position.set(0.33, 0.78, 0.0);
    this.mesh.add(rightScabbard);

    // Dual Gas Cylinders on top of each scabbard
    const gasGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.54, 8);
    gasGeo.rotateX(Math.PI / 2);
    const leftGas = new THREE.Mesh(gasGeo, gasCanisterMat);
    leftGas.position.set(-0.33, 0.92, 0.0);
    this.mesh.add(leftGas);

    const rightGas = new THREE.Mesh(gasGeo, gasCanisterMat);
    rightGas.position.set(0.33, 0.92, 0.0);
    this.mesh.add(rightGas);

    // Cyan Gas Thruster Jets (Shooting backwards toward +Z behind hips)
    const plumeGeo = new THREE.CylinderGeometry(0.02, 0.16, 2.8, 8);
    plumeGeo.rotateX(Math.PI / 2);
    const plumeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85
    });

    this.leftGasPlume = new THREE.Mesh(plumeGeo, plumeMat);
    this.leftGasPlume.position.set(-0.33, 0.88, 1.55);
    this.leftGasPlume.visible = false;
    this.mesh.add(this.leftGasPlume);

    this.rightGasPlume = new THREE.Mesh(plumeGeo, plumeMat);
    this.rightGasPlume.position.set(0.33, 0.88, 1.55);
    this.rightGasPlume.visible = false;
    this.mesh.add(this.rightGasPlume);

    // ─── 6. CANONICAL MINECRAFT ARMS & BLADES (0.24 x 0.72 x 0.24 m) ───
    const armGeo = new THREE.BoxGeometry(0.24, 0.72, 0.24);
    const bladeGeo = new THREE.BoxGeometry(0.04, 0.03, 0.92);

    // Left Arm (Pivot at shoulder x=-0.37, y=1.34)
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.37, 1.34, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.y = -0.36;
    this.leftArm.add(leftArmMesh);

    // Blades held pointing down and forward (-Z)
    this.leftBlade = new THREE.Mesh(bladeGeo, bladeMat);
    this.leftBlade.position.set(0, -0.66, -0.35);
    this.leftArm.add(this.leftBlade);
    this.mesh.add(this.leftArm);

    // Right Arm (Pivot at shoulder x=0.37, y=1.34)
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.37, 1.34, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.y = -0.36;
    this.rightArm.add(rightArmMesh);

    this.rightBlade = new THREE.Mesh(bladeGeo, bladeMat);
    this.rightBlade.position.set(0, -0.66, -0.35);
    this.rightArm.add(this.rightBlade);
    this.mesh.add(this.rightArm);

    // ─── 7. CANONICAL MINECRAFT LEGS (0.24 x 0.72 x 0.24 m) ───
    const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.24);

    // Left Leg (Pivot at hip x=-0.13, y=0.72)
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.13, 0.72, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.y = -0.36;
    this.leftLeg.add(leftLegMesh);
    this.mesh.add(this.leftLeg);

    // Right Leg (Pivot at hip x=0.13, y=0.72)
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.13, 0.72, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.y = -0.36;
    this.rightLeg.add(rightLegMesh);
    this.mesh.add(this.rightLeg);
  }

  public triggerSlashAnimation(isAirborne: boolean = false): void {
    this.isSlashing = true;
    this.isAirSlash = isAirborne;
    this.slashTimer = this.slashDuration;
  }

  public update(
    playerPos: THREE.Vector3,
    playerYaw: number,
    velocity: THREE.Vector3,
    isGrounded: boolean,
    isHooked: boolean,
    dt: number,
    isBoosting: boolean = false
  ): void {
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const totalSpeed = velocity.length();

    // Gas thrusters plume
    if (isBoosting) {
      this.leftGasPlume.visible = true;
      this.rightGasPlume.visible = true;
      const pulseScale = 1.0 + Math.sin(Date.now() * 0.05) * 0.3;
      this.leftGasPlume.scale.set(pulseScale, pulseScale, pulseScale);
      this.rightGasPlume.scale.set(pulseScale, pulseScale, pulseScale);
    } else {
      this.leftGasPlume.visible = false;
      this.rightGasPlume.visible = false;
    }

    // Dynamic horizontal flight pitch when soaring through air
    if (!isGrounded && totalSpeed > 7.0) {
      const flightPitch = Math.min(0.55, (totalSpeed / 32) * 0.55);
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, flightPitch, dt * 8);
    } else {
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, dt * 10);
    }
    this.mesh.rotation.z = 0.0;

    // ─── LEVI HORIZONTAL BEYBLADE ROTATIONAL SLICE ───
    if (this.isSlashing && this.isAirSlash) {
      const spinProgress = 1.0 - (this.slashTimer / this.slashDuration);
      const spinAngle = spinProgress * Math.PI * 4.0;
      this.mesh.rotation.y = playerYaw + spinAngle;
    } else {
      this.mesh.rotation.y = playerYaw;
    }

    // Ground locomotion bobbing
    let bodyBobY = 0;
    if (isGrounded && horizontalSpeed > 0.5) {
      bodyBobY = Math.abs(Math.sin(this.walkCycle * 2)) * 0.05;
    }
    this.mesh.position.set(playerPos.x, playerPos.y + bodyBobY, playerPos.z);

    // Cape flutter in wind (flutters backward towards +Z)
    const flutter = Math.sin(Date.now() * 0.018) * 0.16 + (totalSpeed / 28) * 0.65;
    this.capeGroup.rotation.x = Math.min(flutter, 1.15);

    // ─── COMBAT SLASHING vs NATURAL MINECRAFT LOCOMOTION ───
    if (this.isSlashing) {
      this.slashTimer -= dt;
      if (this.slashTimer <= 0) {
        this.isSlashing = false;
      }
      const progress = 1.0 - (this.slashTimer / this.slashDuration);

      if (this.isAirSlash) {
        // Levi Beyblade Slice: Arms point straight outward horizontally!
        this.rightArm.rotation.set(0, 0, -1.55);
        this.leftArm.rotation.set(0, 0, 1.55);
        this.leftLeg.rotation.set(0, 0, 0);
        this.rightLeg.rotation.set(0, 0, 0);
      } else {
        // Ground synchronized downward X cross-slash
        const swingAngle = Math.sin(progress * Math.PI) * 2.2;
        this.rightArm.rotation.x = -0.5 + swingAngle;
        this.rightArm.rotation.z = -0.3 - swingAngle * 0.4;
        this.leftArm.rotation.x = -0.5 + swingAngle;
        this.leftArm.rotation.z = 0.3 + swingAngle * 0.4;
      }
    } else if (isGrounded && horizontalSpeed > 0.4) {
      // Classic Minecraft Leg & Arm Scissoring Strides
      const gaitFrequency = horizontalSpeed > 13 ? 2.4 : 1.9;
      this.walkCycle += dt * horizontalSpeed * gaitFrequency;

      const legAngle = Math.sin(this.walkCycle) * 0.72;
      const armAngle = -legAngle * 0.75;

      this.leftLeg.rotation.x = legAngle;
      this.rightLeg.rotation.x = -legAngle;
      this.leftLeg.rotation.z = 0;
      this.rightLeg.rotation.z = 0;

      this.leftArm.rotation.x = armAngle;
      this.rightArm.rotation.x = -armAngle;
      this.leftArm.rotation.z = 0.08;
      this.rightArm.rotation.z = -0.08;
    } else if (isGrounded) {
      // Relaxed Idle Breathing
      const breath = Math.sin(Date.now() * 0.003) * 0.03;
      this.leftLeg.rotation.set(0, 0, 0);
      this.rightLeg.rotation.set(0, 0, 0);

      this.leftArm.rotation.set(breath, 0, 0.06);
      this.rightArm.rotation.set(breath, 0, -0.06);
    } else {
      // Dynamic Flight Pose: Arms angled forward holding blade triggers
      this.leftLeg.rotation.set(0.18, 0, 0.04);
      this.rightLeg.rotation.set(0.18, 0, -0.04);

      this.leftArm.rotation.set(-0.45, 0, 0.16);
      this.rightArm.rotation.set(-0.45, 0, -0.16);
    }

    // Hip hook launcher world coords (firing forward towards -Z in local coords)
    const leftOffset = new THREE.Vector3(-0.33, 0.78, -0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
    this.leftLauncherPos.copy(playerPos).add(leftOffset);

    const rightOffset = new THREE.Vector3(0.33, 0.78, -0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
    this.rightLauncherPos.copy(playerPos).add(rightOffset);
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  /**
   * Visually scale down blades to broken stumps when blade breaks
   */
  public setBladesBroken(isBroken: boolean): void {
    const scaleZ = isBroken ? 0.22 : 1.0;
    const posZ = isBroken ? -0.12 : -0.35;
    this.leftBlade.scale.set(1.0, 1.0, scaleZ);
    this.leftBlade.position.z = posZ;
    this.rightBlade.scale.set(1.0, 1.0, scaleZ);
    this.rightBlade.position.z = posZ;
  }
}

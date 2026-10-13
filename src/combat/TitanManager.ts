import * as THREE from 'three';
import { Titan, TitanState } from './Titan';
import { BladeSlashVFX } from './BladeSlashVFX';
import { AudioManager } from '../engine/AudioManager';
import { CameraController } from '../player/CameraController';
import { PlayerController } from '../player/PlayerController';

export class TitanManager {
  public titans: Titan[] = [];
  public group: THREE.Group;
  public killCount: number = 0;
  public isApproachSlowMo: boolean = false;

  private scene: THREE.Scene;
  private audio: AudioManager;
  private cameraController: CameraController;
  public bladeVfx: BladeSlashVFX;

  public onTitanKilled?: (titan: Titan, totalKills: number) => void;

  constructor(
    scene: THREE.Scene,
    audio: AudioManager,
    cameraController: CameraController,
    bladeVfx: BladeSlashVFX
  ) {
    this.scene = scene;
    this.audio = audio;
    this.cameraController = cameraController;
    this.bladeVfx = bladeVfx;

    this.group = new THREE.Group();
    this.group.name = 'Titans_Group';
    this.scene.add(this.group);
  }

  /**
   * Spawn initial pack of Titans across the city district with diverse sizes and speeds:
   * - Small (3-7m fast scout titans): quick runners
   * - Medium (9-14m regular class titans): balanced
   * - Large / Colossal (16-22m towering giants): heavy, massive stride
   */
  public spawnTitans(count: number = 7, onFootstep?: (pos: THREE.Vector3) => void): void {
    const spawnPoints = [
      new THREE.Vector3(45, 0, 45),
      new THREE.Vector3(-55, 0, 50),
      new THREE.Vector3(60, 0, -60),
      new THREE.Vector3(-65, 0, -55),
      new THREE.Vector3(0, 0, 85),
      new THREE.Vector3(85, 0, 0),
      new THREE.Vector3(-90, 0, 0),
      new THREE.Vector3(0, 0, -90)
    ];

    // Varied height and speed profiles
    const sizeProfiles = [
      { heightScale: 0.65, speedScale: 1.55 },  // Small fast crawler/scout
      { heightScale: 0.75, speedScale: 1.35 },  // Small runner
      { heightScale: 1.0,  speedScale: 1.05 },  // Medium regular
      { heightScale: 1.15, speedScale: 0.95 },  // Medium lumberer
      { heightScale: 1.45, speedScale: 0.80 },  // Big heavy titan
      { heightScale: 1.75, speedScale: 0.65 },  // Towering large titan
      { heightScale: 1.05, speedScale: 1.0 }   // Medium regular
    ];

    for (let i = 0; i < Math.min(count, spawnPoints.length); i++) {
      const prof = sizeProfiles[i % sizeProfiles.length];
      const titan = new Titan(`T_${i + 1}`, spawnPoints[i], this.audio, prof.heightScale, prof.speedScale);
      if (onFootstep) {
        titan.onFootstep = onFootstep;
      }
      this.titans.push(titan);
      this.group.add(titan.group);
    }
  }

  /**
   * Performance LOD: dynamically cull rendering of distant Titans (> 160m)
   */
  public updateLOD(cameraPos: THREE.Vector3): void {
    const cullDistSq = 165 * 165;
    for (const titan of this.titans) {
      if (titan.state === TitanState.DEAD) continue;
      const distSq = titan.position.distanceToSquared(cameraPos);
      titan.group.visible = distSq < cullDistSq;
    }
  }

  /**
   * Main combat and AI loop
   */
  public update(player: PlayerController, dt: number, isManualSlash: boolean = false): void {
    const playerPos = player.position;
    const playerVel = player.velocity;

    let activeCount = 0;
    this.isApproachSlowMo = false;

    for (const titan of this.titans) {
      if (titan.state === TitanState.DEAD) continue;
      activeCount++;

      // Check distance and angle to nape
      const distToNape = playerPos.distanceTo(titan.napeWorldPos);
      const heightDiffToNeck = Math.abs(playerPos.y - titan.napeWorldPos.y);

      // Titan forward direction vector
      const forwardX = Math.sin(titan.rotationY);
      const forwardZ = Math.cos(titan.rotationY);
      const titanForward = new THREE.Vector3(forwardX, 0, forwardZ);

      // Vector from Titan center to Player (horizontal)
      const toPlayer = new THREE.Vector3(playerPos.x - titan.position.x, 0, playerPos.z - titan.position.z).normalize();
      const dotFront = toPlayer.dot(titanForward); // <= 0.25 is rear/flank (nape side)

      const isAtNeckHeight = heightDiffToNeck <= 4.2;
      const isBehindOrFlank = dotFront <= 0.40;
      // Perfect shot alignment: player is flying towards or lined up behind the nape within 9.0 meters
      const isNearNapeApproach = distToNape <= 9.0 && isAtNeckHeight && isBehindOrFlank;

      // When the player is approaching or lining up the perfect shot before cutting the nape,
      // engage dramatic anime slow motion so player sees the nape slice unfold in real time!
      if (isNearNapeApproach) {
        this.isApproachSlowMo = true;
      }

      // 1. Check Player Blade Nape Strike:
      // STRICT RULE: ONLY slicing near the back of the neck (Nape) kills the Titan!
      const isInNapeCutRange = distToNape <= 5.8 || titan.napeBox.distanceToPoint(playerPos) <= 2.8;

      const isManualNeckHit = isManualSlash && isAtNeckHeight && (dotFront <= 0.30) && isInNapeCutRange && !player.isBladeBroken;
      const isFlightNeckHit = titan.checkNapeStrike(playerPos, playerVel) && !player.isBladeBroken;

      if (isManualNeckHit || isFlightNeckHit) {
        player.useBladeDurability(25.0); // Severing tough nape tissue consumes blade durability!
        this.executeNapeKill(titan, player);
        continue;
      }

      // 1B. Check Non-Nape Body Slashing (Chop off limbs, but Titan rapidly regenerates!):
      if (isManualSlash && !player.isBladeBroken) {
        const distToCenter = playerPos.distanceTo(titan.position);
        if (distToCenter < 6.8) {
          // Player hit the Titan's body/limbs! Turns red upon impact!
          titan.triggerHurtFlash(0.4);
          player.useBladeDurability(20.0); // Blunting / breaking blades against tough Titan bone!
          this.cameraController.addTrauma(0.35);

          // Sever limb based on height and relative side
          if (playerPos.y > titan.position.y + 6.0) {
            // High altitude: arm strike
            if (playerPos.x < titan.position.x) {
              titan.severBodyPart('leftArm');
            } else {
              titan.severBodyPart('rightArm');
            }
          } else {
            // Low altitude: leg strike (causes collapse to knees!)
            if (playerPos.x < titan.position.x) {
              titan.severBodyPart('leftLeg');
            } else {
              titan.severBodyPart('rightLeg');
            }
          }

          // Billowing rapid regeneration steam jet from wound
          this.bladeVfx.spawnWoundSiteSteam(playerPos);
          this.audio.playBladeSlash();
          this.audio.playSteamHiss();
        }
      }

      // 2. Update Titan AI & Lumbering Animations
      const result = titan.update(playerPos, dt);

      // 3. Handle Titan Attack on Player
      if (result.playerDamaged && !player.isDead) {
        player.applyDamage(result.damage, 0.75);

        // Knockback player away from titan
        const knockbackDir = playerPos.clone().sub(titan.position).normalize();
        knockbackDir.y = 0.35;
        player.velocity.addScaledVector(knockbackDir, 24.0);
        this.cameraController.addTrauma(0.65);
      }
    }

    // Auto-replenish titans if all are eliminated
    if (activeCount === 0 && this.titans.length > 0) {
      setTimeout(() => {
        this.respawnWave();
      }, 3500);
    }
  }

  private executeNapeKill(titan: Titan, player: PlayerController): void {
    titan.kill();
    this.killCount++;

    // 1. Crisp Anime Hit-Stop (80ms impact lock, not dragging out after kill)
    this.bladeVfx.triggerHitStop(80);

    // 2. Billowing Steam VFX
    this.bladeVfx.spawnTitanSteam(titan.position, titan.height);

    // 3. Audio kill feedback
    this.audio.playNapeKill();
    this.audio.playSteamHiss();

    // 4. Screen trauma & speed boost reward (ODM momentum kick!)
    this.cameraController.addTrauma(0.85);

    // Slingshot velocity boost through the kill
    const forwardImpulse = player.velocity.clone().normalize();
    if (forwardImpulse.lengthSq() > 0) {
      player.velocity.addScaledVector(forwardImpulse, 12.0);
    }

    // High-pressure steam jet directly shooting out from severed nape wound
    this.bladeVfx.spawnWoundSiteSteam(titan.napeWorldPos, new THREE.Vector3(0, 1, -0.4).normalize());

    if (this.onTitanKilled) {
      this.onTitanKilled(titan, this.killCount);
    }
  }

  private respawnWave(): void {
    // Clean up old meshes
    for (const titan of this.titans) {
      this.group.remove(titan.group);
    }
    this.titans = [];
    this.spawnTitans(6);
  }

  /**
   * Check if player crosshairs are aimed near any titan's nape
   */
  public queryNapeTarget(origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    const ray = new THREE.Ray(origin, direction);
    for (const titan of this.titans) {
      if (titan.state === TitanState.DYING || titan.state === TitanState.DEAD) continue;
      if (ray.distanceToPoint(titan.napeWorldPos) < 2.5) {
        return true;
      }
    }
    return false;
  }
}

import * as THREE from 'three';
import { SceneManager } from './engine/SceneManager';
import { InputManager } from './engine/InputManager';
import { AudioManager } from './engine/AudioManager';
import { WorldGenerator } from './world/WorldGenerator';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { CableVFX } from './vfx/CableVFX';
import { SpeedLinesVFX } from './vfx/SpeedLinesVFX';
import { SlashArcVFX } from './vfx/SlashArcVFX';
import { EnvironmentVFX } from './vfx/EnvironmentVFX';
import { PlayerModel } from './player/PlayerModel';
import { CameraController } from './player/CameraController';
import { GrappleSystem } from './player/GrappleSystem';
import { PlayerController } from './player/PlayerController';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { TargetingOverlay } from './combat/TargetingOverlay';
import { TutorialManager, GameMode } from './game/TutorialManager';
import { LocalMockNetworkAdapter } from './network/NetworkAdapter';
import { BladeSlashVFX } from './combat/BladeSlashVFX';
import { TitanManager } from './combat/TitanManager';
import { TitanState } from './combat/Titan';
import { VoxelClouds } from './vfx/VoxelClouds';

class GameEngine {
  private sceneManager: SceneManager;
  private inputManager: InputManager;
  private audioManager: AudioManager;
  private worldGen: WorldGenerator;
  private physicsWorld: PhysicsWorld;

  private cableVfx: CableVFX;
  private speedLinesVfx: SpeedLinesVFX;
  private bladeSlashVfx: BladeSlashVFX;
  private slashArcVfx: SlashArcVFX;
  private envVfx: EnvironmentVFX;
  private voxelClouds: VoxelClouds;
  private titanManager: TitanManager;

  private playerModel: PlayerModel;
  private cameraController: CameraController;
  private grappleSystem: GrappleSystem;
  private playerController: PlayerController;
  private hud: HUD;
  private minimap: Minimap;
  private targetingOverlay: TargetingOverlay;
  private tutorialManager: TutorialManager;
  private networkAdapter: LocalMockNetworkAdapter;

  private rescuedCount: number = 0;
  private clock: THREE.Clock;
  private isRunning: boolean = false;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Game canvas element not found');

    // 1. Core Systems & Rendering Pipeline
    this.sceneManager = new SceneManager(canvas);
    this.inputManager = new InputManager(canvas);
    this.audioManager = new AudioManager();

    // 2. World & Physics
    this.worldGen = new WorldGenerator();
    this.worldGen.generate(42);
    this.sceneManager.scene.add(this.worldGen.worldGroup);

    this.physicsWorld = new PhysicsWorld(this.worldGen.collisionBoxes);

    // 3. VFX & Atmospheric Particle Systems
    this.cableVfx = new CableVFX();
    this.sceneManager.scene.add(this.cableVfx.group);

    this.speedLinesVfx = new SpeedLinesVFX(this.sceneManager.camera);
    this.sceneManager.scene.add(this.speedLinesVfx.points);

    this.bladeSlashVfx = new BladeSlashVFX();
    this.sceneManager.scene.add(this.bladeSlashVfx.group);

    this.slashArcVfx = new SlashArcVFX();
    this.sceneManager.scene.add(this.slashArcVfx.mesh);

    this.envVfx = new EnvironmentVFX();
    this.sceneManager.scene.add(this.envVfx.group);

    // 3B. 3D Volumetric Voxel Clouds (Matching reference screenshots!)
    this.voxelClouds = new VoxelClouds();
    this.sceneManager.scene.add(this.voxelClouds.group);

    // 4. Player & Rigging
    this.playerModel = new PlayerModel();
    this.sceneManager.scene.add(this.playerModel.mesh);

    this.cameraController = new CameraController(this.sceneManager.camera);
    this.cameraController.setPhysics(this.physicsWorld);
    this.grappleSystem = new GrappleSystem(this.physicsWorld, this.audioManager, this.cableVfx);

    // Hook grapple impact debris & dust callback
    this.grappleSystem.onGrappleImpact = (point, normal) => {
      this.envVfx.spawnGrappleDebris(point, normal);
    };

    this.playerController = new PlayerController(
      this.cameraController,
      this.grappleSystem,
      this.playerModel,
      this.physicsWorld,
      this.audioManager
    );

    // Hook landing dust clouds
    this.playerController.onHardLanding = (pos, intensity) => {
      this.envVfx.spawnDustCloud(pos, intensity);
    };

    // 5. Combat & Titan NPCs
    this.titanManager = new TitanManager(
      this.sceneManager.scene,
      this.audioManager,
      this.cameraController,
      this.bladeSlashVfx
    );
    this.titanManager.spawnTitans(7, (footPos) => {
      this.envVfx.spawnDustCloud(footPos, 0.85);
    });

    // 6. UI, Minimap, Targeting, Tutorial & Network
    this.hud = new HUD(this.playerController, this.grappleSystem);
    this.minimap = new Minimap();
    this.targetingOverlay = new TargetingOverlay();
    this.tutorialManager = new TutorialManager();

    this.networkAdapter = new LocalMockNetworkAdapter();
    this.networkAdapter.connect();

    // Wire up kill event callback to HUD & Speedline Slash Arc
    this.titanManager.onTitanKilled = (titan, killCount) => {
      this.hud.triggerKillEffect(killCount);

      // Trigger cinematic speed-line blade slash arc across the severed nape
      const forward = this.cameraController.getForwardVector();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      this.slashArcVfx.triggerSlash(titan.napeWorldPos, forward, right);
      this.audioManager.playBladeSlash();
    };

    // Tutorial step notifications
    this.tutorialManager.onStepChanged = (step) => {
      this.hud.setDialogue('CAPT. ISOLDE MARR', step.dialogue);
      this.hud.setHeader(
        step.title,
        step.instruction,
        this.rescuedCount,
        this.worldGen.civilians.length - this.rescuedCount,
        this.titanManager.killCount
      );
    };

    this.tutorialManager.onTutorialCompleted = () => {
      this.hud.setDialogue(
        'CAPT. ISOLDE MARR',
        'Exceptional work Cadet! You have mastered ODM flight, the Levi spin slice, and combat recovery. You are now promoted to Expedition Duty.'
      );
      this.hud.setHeader('EXPEDITION DUTY', 'Free Roam Unlocked — Defend Wall Maria', 0, 5, this.titanManager.killCount);
      setTimeout(() => {
        this.tutorialManager.setMode(GameMode.MAIN_GAME);
      }, 4000);
    };

    this.clock = new THREE.Clock();

    this.setupInteractions();
  }

  private setupInteractions(): void {
    const btnTutorial = document.getElementById('btn-mode-tutorial');
    const btnRoam = document.getElementById('btn-mode-roam');

    const startMode = (mode: GameMode) => {
      this.audioManager.init();
      this.tutorialManager.setMode(mode);
      if (mode === GameMode.TUTORIAL) {
        // Spawn inside the dedicated Training Practice Arena (from reference screenshot media_1791815456526_64068547.jpg)
        this.playerController.position.set(35, 1.5, -40);
        this.playerController.velocity.set(0, 0, 0);
        this.cameraController.yaw = 0;
        this.cameraController.pitch = 0;
      } else if (mode === GameMode.MAIN_GAME) {
        // Spawn atop Wall Maria fortress battlements (from reference screenshot media_1791815411137_cb546580.png)
        this.playerController.position.set(0, 56.5, -165);
        this.playerController.velocity.set(0, 0, 0);
        this.cameraController.yaw = Math.PI; // Face outwards toward the district
        this.cameraController.pitch = 0;
        this.hud.setDialogue(
          'CAPT. ISOLDE MARR',
          'Five civilians on the western rooftops. Fly to them and press E to light their flares. Titans are hunting them — draw them off or cut them down.'
        );
        this.hud.setHeader(
          'SEARCH & RESCUE',
          'Rescue the stranded civilians',
          this.rescuedCount,
          this.worldGen.civilians.length - this.rescuedCount,
          this.titanManager.killCount
        );
      }
      this.inputManager.requestPointerLock();
    };

    if (btnTutorial) {
      btnTutorial.addEventListener('click', (e) => {
        e.stopPropagation();
        startMode(GameMode.TUTORIAL);
      });
    }

    if (btnRoam) {
      btnRoam.addEventListener('click', (e) => {
        e.stopPropagation();
        startMode(GameMode.MAIN_GAME);
      });
    }

    this.inputManager.onLockChange((locked: boolean) => {
      if (locked) {
        this.hud.hideModal();
      } else {
        this.hud.showModal();
      }
    });
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const rawDelta = this.clock.getDelta();
    // Clamp delta to prevent tunneling during lag spikes
    let dt = Math.min(rawDelta, 0.05);

    // Visceral Anime Slow-Motion Time Dilation:
    // Triggers when almost cutting the nape area (approaching the neck from behind)
    // and during micro hit-stop impact!
    if (this.titanManager.isApproachSlowMo) {
      dt *= 0.28; // Cinematic 3.5x slow-motion when almost cutting the nape!
    } else if (this.bladeSlashVfx.isHitStopping) {
      dt *= 0.20; // Crisp impact hit-stop
    }

    if (this.inputManager.isLocked) {
      this.playerController.update(this.inputManager, dt);

      // Check view toggle (1st person vs 3rd person)
      if (this.inputManager.state.toggleView) {
        this.cameraController.toggleMode();
      }

      // Check reset
      if (this.inputManager.state.reset) {
        this.playerController.respawn();
      }
    }

    // Dynamic grapple targets: allow hooking directly onto Titans!
    this.physicsWorld.dynamicBoxes = this.titanManager.titans
      .filter(t => t.state !== TitanState.DEAD)
      .map(t => t.boundingBox);

    // Combat: Manual Slash Button (F key, X key, or middle click)
    const isManualSlash = this.inputManager.state.slash;
    if (isManualSlash) {
      if (this.playerController.isBladeBroken) {
        // Dull clink sound if blade is broken, reminding player to press R to swap!
        this.audioManager.playImpact(0.2);
      } else {
        // 1. Slash movement animation: Ground cross-cut vs Levi-style airborne 360 spin!
        const isAirborne = !this.playerController.isGrounded;
        this.playerModel.triggerSlashAnimation(isAirborne);

        // 2. Crisp, synchronized metallic slice sound
        this.audioManager.playBladeSlash();

        // 3. Visual blade slash speed-line arc ribbon in front of player
        const forward = this.cameraController.getForwardVector();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const strikeCenter = this.playerController.position.clone().add(forward.clone().multiplyScalar(isAirborne ? 0.0 : 1.8)).add(new THREE.Vector3(0, 1.4, 0));
        this.slashArcVfx.triggerSlash(strikeCenter, forward, right, isAirborne);
      }
    }

    // Combat & Titan AI update
    this.titanManager.update(this.playerController, dt, isManualSlash);
    this.bladeSlashVfx.update(dt);
    this.slashArcVfx.update(dt);

    // Update Environmental VFX & 3D Voxel Clouds
    this.envVfx.update(this.playerController.position, dt);
    this.voxelClouds.update(dt);

    // Performance LOD: distance-based culling for Titans
    this.titanManager.updateLOD(this.sceneManager.camera.position);

    // Reticle Target & Nape Lock-on Verification
    const forwardDir = this.cameraController.getForwardVector();
    const eyePos = this.playerController.position.clone().add(new THREE.Vector3(0, 1.55, 0));
    const hit = this.grappleSystem.queryTarget(eyePos, forwardDir);
    const hasTarget = hit !== null;

    // 5. Gas, Health & Blade Resupply Receiver (Blue vertical light beams)
    // Touching or flying through immediately restores 100% full stock!
    const playerPos = this.playerController.position;
    for (const station of this.worldGen.refillStations) {
      if (playerPos.distanceTo(station.position) < station.radius) {
        const needsRefill = (
          this.playerController.health < this.playerController.maxHealth ||
          this.grappleSystem.gasAmount < this.grappleSystem.maxGas ||
          this.playerController.spareBlades < this.playerController.maxSpareBlades ||
          this.playerController.bladeDurability < this.playerController.maxBladeDurability ||
          this.playerController.isBladeBroken
        );

        if (needsRefill) {
          this.playerController.fullRefillAndHeal();
          this.audioManager.playBladeReload();
          this.envVfx.spawnDustCloud(station.position, 2.5);
          this.hud.setHeader(
            'SUPPLY RECEIVER CLAIMED',
            '100% Health, Gas & Blades Restored to Full Stock!',
            this.rescuedCount,
            this.worldGen.civilians.length - this.rescuedCount,
            this.titanManager.killCount
          );
        }
      }
    }

    // 6. Civilian Rooftop Rescue Interaction (E key)
    if (this.inputManager.state.interact) {
      for (const civ of this.worldGen.civilians) {
        if (!civ.rescued && playerPos.distanceTo(civ.position) < 6.5) {
          civ.rescued = true;
          this.rescuedCount++;
          this.envVfx.spawnDustCloud(civ.position, 1.8);
          this.audioManager.playImpact(0.4);
          this.hud.setHeader(
            'SEARCH & RESCUE',
            'Civilian rescued! Flared for recovery.',
            this.rescuedCount,
            this.worldGen.civilians.length - this.rescuedCount,
            this.titanManager.killCount
          );
        }
      }
    }

    // 7. Tutorial Progression Update
    this.tutorialManager.update(
      dt,
      this.playerController,
      this.grappleSystem,
      this.inputManager,
      this.titanManager.titans
    );

    // 8. On-Screen 3D Target Distance Overlays (Project Titan Nape distance, Civilian markers, etc.)
    const { closestNapeDist, closestNapeInRange } = this.targetingOverlay.update(
      this.sceneManager.camera,
      playerPos,
      this.titanManager.titans,
      this.worldGen.civilians,
      this.worldGen.refillStations.map(s => s.position)
    );

    // 9. Update Speedometer & Circular Minimap
    const speed = this.playerController.velocity.length();
    this.speedLinesVfx.update(speed, this.playerController.velocity, dt);

    this.minimap.update(
      playerPos,
      this.playerController.yaw,
      speed,
      this.titanManager.titans,
      this.worldGen.civilians,
      this.worldGen.refillStations.map(s => s.position)
    );

    // 10. Update HUD (Live Nape distance, health, gas, landing brake warnings)
    this.hud.update(hasTarget, closestNapeDist, closestNapeInRange, this.inputManager.state.brake);

    // Render Scene
    this.sceneManager.render();

    // Reset per-frame input accumulators
    this.inputManager.endFrame();
  };
}

window.addEventListener('DOMContentLoaded', () => {
  const engine = new GameEngine();
  engine.start();
});

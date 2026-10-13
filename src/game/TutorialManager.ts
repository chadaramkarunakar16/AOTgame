import * as THREE from 'three';
import { PlayerController } from '../player/PlayerController';
import { GrappleSystem } from '../player/GrappleSystem';
import { InputManager } from '../engine/InputManager';
import { Titan, TitanState } from '../combat/Titan';

export enum GameMode {
  TUTORIAL = 'TUTORIAL',
  MAIN_GAME = 'MAIN_GAME'
}

export interface TutorialStep {
  id: number;
  title: string;
  instruction: string;
  dialogue: string;
  isCompleted: boolean;
}

export class TutorialManager {
  public currentMode: GameMode = GameMode.MAIN_GAME;
  public currentStepIndex: number = 0;
  public steps: TutorialStep[] = [
    {
      id: 0,
      title: '1. CADET GROUND STRIDE',
      instruction: 'Walk across the training courtyard using [W][A][S][D]',
      dialogue: 'Welcome Cadet. Before tackling Titans, master your footing. Move across the courtyard.',
      isCompleted: false
    },
    {
      id: 1,
      title: '2. RECON SCOUTING',
      instruction: 'Move your mouse to look around at the district structures',
      dialogue: 'Maintain 360-degree situational awareness. Scan the towers and skyline with your eyes.',
      isCompleted: false
    },
    {
      id: 2,
      title: '3. DEPLOY ODM HOOKS',
      instruction: 'Aim at the wooden watchtower and fire cables [LMB / RMB]',
      dialogue: 'Aim your reticle at the central wooden watchtower. Hold Left or Right Mouse to anchor your cables.',
      isCompleted: false
    },
    {
      id: 3,
      title: '4. LATERAL SPIDER-MAN SWING',
      instruction: 'While hooked, hold [A] or [D] to steer and curve your swing in an arc',
      dialogue: 'Do not fly in a straight line or Titans will snatch you! Press A or D while swinging to curve around obstacles.',
      isCompleted: false
    },
    {
      id: 4,
      title: '5. GAS PROPULSION BOOST',
      instruction: 'Hold [SPACE] or [SHIFT] to ignite gas thrusters and reel in with high speed',
      dialogue: 'Fire your compressed gas thrusters! Press Space or Shift to accelerate through the air.',
      isCompleted: false
    },
    {
      id: 5,
      title: '6. LEVI AIRBORNE 360 SPIN CUT',
      instruction: 'While airborne, press [F] or [X] to execute Levi’s rotational 360 spin attack',
      dialogue: 'Captain Levi’s signature technique: launch into the air and press F to perform a devastating 360-degree rotational spin slice!',
      isCompleted: false
    },
    {
      id: 6,
      title: '7. SLAY THE TRAINING TITAN',
      instruction: 'Approach the dummy Titan’s nape. Watch the distance marker drop below 7.5m, then press [F] to cut!',
      dialogue: 'Target the red nape marker! When the distance indicator flashes SLICE RANGE (<7.5m), press F to sever the nape!',
      isCompleted: false
    },
    {
      id: 7,
      title: '8. RESUPPLY AT GAS DEPOT',
      instruction: 'Fly into any blue vertical light beam to replenish your gas canisters',
      dialogue: 'Cables and thrusters consume gas rapidly. Fly into the vertical blue light beam to refill your tanks.',
      isCompleted: false
    }
  ];

  // Tracking metrics
  private walkedDistance: number = 0;
  private lookedAngle: number = 0;
  private prevYaw: number = 0;
  private prevPos: THREE.Vector3 = new THREE.Vector3();
  private hasInitializedPos: boolean = false;

  public onStepChanged?: (step: TutorialStep) => void;
  public onTutorialCompleted?: () => void;

  constructor() {}

  public setMode(mode: GameMode): void {
    this.currentMode = mode;
    this.currentStepIndex = 0;
    this.steps.forEach(s => (s.isCompleted = false));
    this.walkedDistance = 0;
    this.hasInitializedPos = false;

    if (this.currentMode === GameMode.TUTORIAL && this.onStepChanged) {
      this.onStepChanged(this.steps[0]);
    }
  }

  public getCurrentStep(): TutorialStep | null {
    if (this.currentMode !== GameMode.TUTORIAL) return null;
    return this.steps[this.currentStepIndex] || null;
  }

  public update(
    dt: number,
    player: PlayerController,
    grapple: GrappleSystem,
    input: InputManager,
    titans: Titan[]
  ): void {
    if (this.currentMode !== GameMode.TUTORIAL) return;
    if (this.currentStepIndex >= this.steps.length) return;

    const cur = this.steps[this.currentStepIndex];
    if (!this.hasInitializedPos) {
      this.prevPos.copy(player.position);
      this.prevYaw = player.yaw;
      this.hasInitializedPos = true;
    }

    let completedCurrent = false;

    switch (cur.id) {
      case 0: {
        // Walk distance check
        const d = player.position.distanceTo(this.prevPos);
        this.prevPos.copy(player.position);
        if (player.isGrounded) {
          this.walkedDistance += d;
        }
        if (this.walkedDistance > 12.0) {
          completedCurrent = true;
        }
        break;
      }
      case 1: {
        // Look angle check
        const deltaYaw = Math.abs(player.yaw - this.prevYaw);
        this.prevYaw = player.yaw;
        this.lookedAngle += deltaYaw;
        if (this.lookedAngle > 3.5) {
          completedCurrent = true;
        }
        break;
      }
      case 2: {
        // Deployed grapple hooks
        if (grapple.leftHook.active || grapple.rightHook.active) {
          completedCurrent = true;
        }
        break;
      }
      case 3: {
        // Lateral swing steering with A or D while hooked
        if ((grapple.leftHook.active || grapple.rightHook.active) && (input.state.left || input.state.right)) {
          completedCurrent = true;
        }
        break;
      }
      case 4: {
        // Gas propulsion boost
        if (input.state.boost || input.state.jump) {
          completedCurrent = true;
        }
        break;
      }
      case 5: {
        // Levi airborne 360 spin cut
        if (!player.isGrounded && input.state.slash) {
          completedCurrent = true;
        }
        break;
      }
      case 6: {
        // Check if any training titan died or nape hit
        const killedAny = titans.some(t => t.state === TitanState.DYING || t.state === TitanState.DEAD);
        if (killedAny) {
          completedCurrent = true;
        }
        break;
      }
      case 7: {
        // Gas refill check
        if (grapple.gasAmount >= grapple.maxGas * 0.98) {
          completedCurrent = true;
        }
        break;
      }
    }

    if (completedCurrent) {
      cur.isCompleted = true;
      this.currentStepIndex++;

      if (this.currentStepIndex < this.steps.length) {
        if (this.onStepChanged) {
          this.onStepChanged(this.steps[this.currentStepIndex]);
        }
      } else {
        if (this.onTutorialCompleted) {
          this.onTutorialCompleted();
        }
      }
    }
  }
}

import { PlayerController } from '../player/PlayerController';
import { GrappleSystem } from '../player/GrappleSystem';

export class HUD {
  private healthBar: HTMLElement;
  private gasBar: HTMLElement;
  private healthValNum: HTMLElement | null;
  private gasValNum: HTMLElement | null;
  private scoreVal: HTMLElement | null;
  private reticle: HTMLElement;
  private leftIndicator: HTMLElement;
  private rightIndicator: HTMLElement;
  private damageVignette: HTMLElement;
  private modalOverlay: HTMLElement;
  private cushionPrompt: HTMLElement;
  private cushionToast: HTMLElement;
  private killCountValue: HTMLElement;
  private killBanner: HTMLElement;
  private killFlash: HTMLElement;
  private deathOverlay: HTMLElement;
  private targetLabel: HTMLElement | null;
  private brakePrompt: HTMLElement | null;
  private bladeBar: HTMLElement | null;
  private bladeValNum: HTMLElement | null;
  private bladesMetaText: HTMLElement | null;

  private dialogueSpeaker: HTMLElement | null;
  private dialogueText: HTMLElement | null;
  private roamTitle: HTMLElement | null;
  private roamSub: HTMLElement | null;
  private civRescuedVal: HTMLElement | null;
  private civRemainVal: HTMLElement | null;

  private player: PlayerController;
  private grapple: GrappleSystem;
  private toastTimeout: number | null = null;
  private bannerTimeout: number | null = null;
  private currentScore: number = 0;

  constructor(player: PlayerController, grapple: GrappleSystem) {
    this.player = player;
    this.grapple = grapple;

    this.healthBar = document.getElementById('health-bar')!;
    this.gasBar = document.getElementById('gas-bar')!;
    this.healthValNum = document.getElementById('health-val-num');
    this.gasValNum = document.getElementById('gas-val-num');
    this.scoreVal = document.getElementById('score-val');
    this.reticle = document.getElementById('reticle')!;
    this.leftIndicator = document.getElementById('hook-indicator-left')!;
    this.rightIndicator = document.getElementById('hook-indicator-right')!;
    this.damageVignette = document.getElementById('damage-vignette')!;
    this.modalOverlay = document.getElementById('modal-overlay')!;
    this.cushionPrompt = document.getElementById('cushion-prompt')!;
    this.cushionToast = document.getElementById('cushion-toast')!;
    this.killCountValue = document.getElementById('kill-count-value')!;
    this.killBanner = document.getElementById('kill-banner')!;
    this.killFlash = document.getElementById('kill-flash')!;
    this.deathOverlay = document.getElementById('death-overlay')!;
    this.targetLabel = document.getElementById('target-label');
    this.brakePrompt = document.getElementById('brake-prompt');
    this.bladeBar = document.getElementById('blade-bar');
    this.bladeValNum = document.getElementById('blade-val-num');
    this.bladesMetaText = document.getElementById('blades-meta-text');

    this.dialogueSpeaker = document.getElementById('dialogue-speaker');
    this.dialogueText = document.getElementById('dialogue-text');
    this.roamTitle = document.getElementById('roam-title');
    this.roamSub = document.getElementById('roam-sub');
    this.civRescuedVal = document.getElementById('civ-rescued-val');
    this.civRemainVal = document.getElementById('civ-remain-val');

    this.player.onTakeDamage = (_amount, _health) => {
      this.flashDamage();
    };

    this.player.onCushionedLanding = () => {
      this.showCushionToast();
    };
  }

  public hideModal(): void {
    this.modalOverlay.classList.add('hidden');
  }

  public showModal(): void {
    this.modalOverlay.classList.remove('hidden');
  }

  public setDialogue(speaker: string, text: string): void {
    if (this.dialogueSpeaker) this.dialogueSpeaker.textContent = speaker;
    if (this.dialogueText) this.dialogueText.textContent = text;
  }

  public setHeader(title: string, subtitle: string, rescued: number, remaining: number, slain: number): void {
    if (this.roamTitle) this.roamTitle.textContent = title;
    if (this.roamSub) this.roamSub.textContent = subtitle;
    if (this.civRescuedVal) this.civRescuedVal.textContent = `${rescued}`;
    if (this.civRemainVal) this.civRemainVal.textContent = `${remaining}`;
    if (this.killCountValue) this.killCountValue.textContent = `${slain}`;
  }

  public flashDamage(): void {
    this.damageVignette.classList.add('flashing');
    setTimeout(() => {
      this.damageVignette.classList.remove('flashing');
    }, 180);
  }

  public showCushionToast(): void {
    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
    }
    this.cushionToast.classList.remove('hidden');
    this.toastTimeout = window.setTimeout(() => {
      this.cushionToast.classList.add('hidden');
    }, 1400);
  }

  /**
   * Visceral Kill effect: Full-screen flash, banner popup, score increment
   */
  public triggerKillEffect(killCount: number): void {
    // 1. Update Kill Counter & Score (+1000 per titan)
    if (this.killCountValue) this.killCountValue.textContent = `${killCount}`;
    this.currentScore += 1000;
    if (this.scoreVal) {
      this.scoreVal.textContent = `${this.currentScore}`;
    }

    // 2. Full-Screen Kill Flash
    this.killFlash.classList.add('flashing');
    setTimeout(() => {
      this.killFlash.classList.remove('flashing');
    }, 120);

    // 3. Kill Banner
    if (this.bannerTimeout) {
      window.clearTimeout(this.bannerTimeout);
    }
    this.killBanner.classList.remove('hidden');
    this.bannerTimeout = window.setTimeout(() => {
      this.killBanner.classList.add('hidden');
    }, 1800);
  }

  public update(
    hasTarget: boolean,
    closestNapeDist: number = 9999,
    isNapeInRange: boolean = false,
    isBraking: boolean = false
  ): void {
    // 1. Health & Gas bars
    const hpPct = Math.round(Math.max(0, (this.player.health / this.player.maxHealth) * 100));
    this.healthBar.style.width = `${hpPct}%`;
    if (this.healthValNum) this.healthValNum.textContent = `${hpPct}%`;

    const gasPct = Math.round(Math.max(0, (this.grapple.gasAmount / this.grapple.maxGas) * 100));
    this.gasBar.style.width = `${gasPct}%`;
    if (this.gasValNum) this.gasValNum.textContent = `${gasPct}%`;

    // Blade Durability & Storage
    const bladePct = Math.round(Math.max(0, this.player.bladeDurability));
    if (this.bladeBar) {
      this.bladeBar.style.width = `${bladePct}%`;
      if (this.player.isBladeBroken) {
        this.bladeBar.style.background = '#ef4444';
      } else if (bladePct < 30) {
        this.bladeBar.style.background = '#f59e0b';
      } else {
        this.bladeBar.style.background = 'linear-gradient(90deg, #38bdf8, #818cf8)';
      }
    }
    if (this.bladeValNum) {
      this.bladeValNum.textContent = this.player.isBladeBroken ? 'BROKEN!' : `${bladePct}%`;
      this.bladeValNum.style.color = this.player.isBladeBroken ? '#ef4444' : (bladePct < 30 ? '#f59e0b' : '#38bdf8');
    }
    if (this.bladesMetaText) {
      this.bladesMetaText.innerHTML = `×${this.player.spareBlades} <span style="font-size: 10px; color: #94a3b8; font-weight: normal;">${this.player.isBladeBroken ? 'BROKEN! PRESS R TO RELOAD' : 'SPARE KNIVES · R TO RELOAD'}</span>`;
    }

    // 2. Reticle and Hook Indicators
    if (this.grapple.leftHook.active) {
      this.leftIndicator.className = 'hook-indicator active';
    } else if (hasTarget) {
      this.leftIndicator.className = 'hook-indicator targeted';
    } else {
      this.leftIndicator.className = 'hook-indicator';
    }

    if (this.grapple.rightHook.active) {
      this.rightIndicator.className = 'hook-indicator active';
    } else if (hasTarget) {
      this.rightIndicator.className = 'hook-indicator targeted';
    } else {
      this.rightIndicator.className = 'hook-indicator';
    }

    // 3. Distance to cut Titan Nape in Central Crosshair Reticle
    if (closestNapeDist < 85) {
      if (this.targetLabel) {
        this.targetLabel.classList.remove('hidden');
        if (isNapeInRange) {
          this.targetLabel.className = 'target-name-banner in-range';
          this.targetLabel.textContent = `⚔️ SLICE RANGE [ ${closestNapeDist.toFixed(1)} m ] — PRESS F!`;
          this.reticle.style.borderColor = '#facc15';
          this.reticle.style.boxShadow = '0 0 16px #facc15';
          this.reticle.style.transform = 'scale(1.5)';
        } else {
          this.targetLabel.className = 'target-name-banner';
          this.targetLabel.textContent = `🎯 TITAN NAPE [ ${closestNapeDist.toFixed(1)} m ]`;
          this.reticle.style.borderColor = '#ff2222';
          this.reticle.style.boxShadow = '0 0 10px #ff2222';
          this.reticle.style.transform = 'scale(1.3)';
        }
      }
    } else if (hasTarget) {
      this.reticle.style.borderColor = '#00ffaa';
      this.reticle.style.boxShadow = 'none';
      this.reticle.style.transform = 'scale(1.25)';
      if (this.targetLabel) {
        this.targetLabel.classList.add('hidden');
      }
    } else {
      this.reticle.style.borderColor = 'rgba(255, 255, 255, 0.85)';
      this.reticle.style.boxShadow = 'none';
      this.reticle.style.transform = 'scale(1.0)';
      if (this.targetLabel) {
        this.targetLabel.classList.add('hidden');
      }
    }

    // 4. Brake Prompt (HOLD G TO BRAKE from reference image!)
    if (this.brakePrompt) {
      if (this.player.isLandingHazardous || isBraking) {
        this.brakePrompt.classList.remove('hidden');
      } else {
        this.brakePrompt.classList.add('hidden');
      }
    }

    // 5. Gas Cushion Landing Prompt
    if (this.player.isLandingHazardous && this.grapple.gasAmount >= 6.0) {
      this.cushionPrompt.classList.remove('hidden');
    } else {
      this.cushionPrompt.classList.add('hidden');
    }

    // 6. Death Screen Overlay
    if (this.player.isDead) {
      this.deathOverlay.classList.remove('hidden');
    } else {
      this.deathOverlay.classList.add('hidden');
    }
  }
}

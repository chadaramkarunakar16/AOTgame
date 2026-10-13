/**
 * Procedural Web Audio API sound generator for ODM movement effects.
 * Pre-allocates buffers and uses smooth gain ramps for zero-lag, zero-garbage performance.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  // Continuous sound nodes
  private windGain: GainNode | null = null;
  private gasGain: GainNode | null = null;
  private gasFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // Initialized on user interaction
  }

  public init(): void {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.generateSharedNoiseBuffer();
      this.setupWindAmbience();
      this.setupGasThrusterLoop();
    } catch {
      // Audio not supported
    }
  }

  private generateSharedNoiseBuffer(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  private setupWindAmbience(): void {
    if (!this.ctx || !this.noiseBuffer) return;

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = this.noiseBuffer;
    whiteNoise.loop = true;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 450;
    bandpass.Q.value = 1.2;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;

    whiteNoise.connect(bandpass);
    bandpass.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);

    whiteNoise.start();
  }

  private setupGasThrusterLoop(): void {
    if (!this.ctx || !this.noiseBuffer) return;

    const gasNoise = this.ctx.createBufferSource();
    gasNoise.buffer = this.noiseBuffer;
    gasNoise.loop = true;

    this.gasFilter = this.ctx.createBiquadFilter();
    this.gasFilter.type = 'bandpass';
    this.gasFilter.frequency.value = 950;
    this.gasFilter.Q.value = 1.5;

    this.gasGain = this.ctx.createGain();
    this.gasGain.gain.value = 0.0;

    gasNoise.connect(this.gasFilter);
    this.gasFilter.connect(this.gasGain);
    this.gasGain.connect(this.ctx.destination);

    gasNoise.start();
  }

  /**
   * Smoothly control continuous gas thruster volume without recreating audio nodes
   */
  public setGasActive(active: boolean): void {
    if (!this.ctx || !this.gasGain || this.isMuted) return;
    const targetGain = active ? 0.32 : 0.0;
    this.gasGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
  }

  /**
   * Modulate wind audio based on player velocity (m/s)
   */
  public updateWindSpeed(speed: number): void {
    if (!this.ctx || !this.windGain || this.isMuted) return;
    const normalized = Math.min(Math.max((speed - 12) / 45, 0), 1);
    this.windGain.gain.setTargetAtTime(normalized * 0.28, this.ctx.currentTime, 0.1);
  }

  /**
   * Sound when grapple hook fires out
   */
  public playHookShoot(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Sound when hook latches into brick/stone
   */
  public playHookLatch(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Powerful pneumatic blast when using gas burst to cushion landing safely
   */
  public playLandingCushion(): void {
    if (!this.ctx || !this.noiseBuffer || this.isMuted) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(350, now + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.25);
  }

  /**
   * Heavy impact thud when hitting obstacles or ground without gas cushion
   */
  public playImpact(severity: number): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);

    const volume = Math.min(Math.max(severity * 0.5, 0.25), 0.75);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Ground jump sound
   */
  public playJump(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  /**
   * Clean, crisp metallic blade slash sound (perfectly synced with sword swing)
   */
  public playBladeSlash(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // High-speed air whoosh
    const whoosh = this.ctx.createBufferSource();
    if (this.noiseBuffer) {
      whoosh.buffer = this.noiseBuffer;
      const whooshFilter = this.ctx.createBiquadFilter();
      whooshFilter.type = 'bandpass';
      whooshFilter.frequency.setValueAtTime(1400, now);
      whooshFilter.frequency.exponentialRampToValueAtTime(450, now + 0.12);
      whooshFilter.Q.value = 2.0;

      const whooshGain = this.ctx.createGain();
      whooshGain.gain.setValueAtTime(0.28, now);
      whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      whoosh.connect(whooshFilter);
      whooshFilter.connect(whooshGain);
      whooshGain.connect(this.ctx.destination);
      whoosh.start(now);
      whoosh.stop(now + 0.14);
    }

    // Crisp steel blade chime
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1850, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Visceral, clean nape slice impact:
   * Razor blade cut + flesh severance sub-thud + rewarding hit feedback
   */
  public playNapeKill(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 1. Razor steel cut
    const cutOsc = this.ctx.createOscillator();
    const cutGain = this.ctx.createGain();
    cutOsc.type = 'sawtooth';
    cutOsc.frequency.setValueAtTime(2400, now);
    cutOsc.frequency.exponentialRampToValueAtTime(420, now + 0.12);
    cutGain.gain.setValueAtTime(0.45, now);
    cutGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    cutOsc.connect(cutGain);
    cutGain.connect(this.ctx.destination);
    cutOsc.start(now);
    cutOsc.stop(now + 0.15);

    // 2. Punchy flesh impact sub-thud
    const bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(140, now);
    bassOsc.frequency.exponentialRampToValueAtTime(45, now + 0.22);
    bassGain.gain.setValueAtTime(0.6, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    bassOsc.connect(bassGain);
    bassGain.connect(this.ctx.destination);
    bassOsc.start(now);
    bassOsc.stop(now + 0.26);
  }

  /**
   * Deep rumbling Titan roar
   */
  public playTitanRoar(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.linearRampToValueAtTime(140, now + 0.4);
    osc.frequency.exponentialRampToValueAtTime(50, now + 1.2);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 1.3);
  }

  /**
   * Heavy titan footstep stomp
   */
  public playTitanStomp(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.22);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  /**
   * Evaporating titan steam sizzle
   */
  public playSteamHiss(): void {
    if (!this.ctx || !this.noiseBuffer || this.isMuted) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 1.85);
  }

  /**
   * Sound when ultrahard steel blade snaps and breaks
   */
  public playBladeSnap(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.16);

    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Sound when drawing fresh blades from side scabbards
   */
  public playBladeReload(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.2);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
  }

  /**
   * Mechanical cable winch reel sound
   */
  public playCableReel(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.linearRampToValueAtTime(780, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }
}

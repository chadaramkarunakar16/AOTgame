export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  boost: boolean;
  reel: boolean;
  swapBlades: boolean;
  hookLeft: boolean;
  hookRight: boolean;
  slash: boolean;
  brake: boolean;
  interact: boolean;
  scoreboard: boolean;
  toggleView: boolean;
  toggleMap: boolean;
  reset: boolean;
  mouseDeltaX: number;
  mouseDeltaY: number;
}

export class InputManager {
  public state: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    boost: false,
    reel: false,
    swapBlades: false,
    hookLeft: false,
    hookRight: false,
    slash: false,
    brake: false,
    interact: false,
    scoreboard: false,
    toggleView: false,
    toggleMap: false,
    reset: false,
    mouseDeltaX: 0,
    mouseDeltaY: 0
  };

  public isLocked: boolean = false;
  private canvas: HTMLCanvasElement;
  private onLockChangeCallbacks: ((locked: boolean) => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initEventListeners();
  }

  public onLockChange(callback: (locked: boolean) => void): void {
    this.onLockChangeCallbacks.push(callback);
  }

  public requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }

  private initEventListeners(): void {
    // Pointer lock change
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
      for (const cb of this.onLockChangeCallbacks) {
        cb(this.isLocked);
      }
    });

    // Mouse movement
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isLocked) return;
      this.state.mouseDeltaX += e.movementX;
      this.state.mouseDeltaY += e.movementY;
    });

    // Mouse down / up (Left Click = Left Hook, Right Click = Right Hook, Middle Click = Slash)
    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.isLocked) return;
      if (e.button === 0) {
        this.state.hookLeft = true;
      } else if (e.button === 2) {
        this.state.hookRight = true;
      } else if (e.button === 1) {
        this.state.slash = true; // Middle click slash
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (!this.isLocked) return;
      if (e.button === 0) {
        this.state.hookLeft = false;
      } else if (e.button === 2) {
        this.state.hookRight = false;
      }
    });

    // Context menu prevention
    window.addEventListener('contextmenu', (e: MouseEvent) => {
      if (this.isLocked) {
        e.preventDefault();
      }
    });

    // Keyboard controls
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.handleKey(e.code, true);
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.handleKey(e.code, false);
    });
  }

  private handleKey(code: string, isDown: boolean): void {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.state.forward = isDown;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.state.backward = isDown;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.state.left = isDown;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.state.right = isDown;
        break;
      case 'Space':
        this.state.jump = isDown;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.state.boost = isDown;
        this.state.reel = isDown; // Shift reels the cable without using gas!
        break;
      case 'KeyC':
        this.state.reel = isDown; // Dedicated manual cable reel key
        break;
      case 'KeyQ':
        this.state.hookLeft = isDown;
        break;
      case 'KeyE':
        this.state.interact = isDown;
        this.state.hookRight = isDown;
        break;
      case 'KeyG':
        this.state.brake = isDown;
        break;
      case 'Tab':
        this.state.scoreboard = isDown;
        break;
      case 'KeyV':
        if (isDown) this.state.toggleView = true;
        break;
      case 'KeyM':
        if (isDown) this.state.toggleMap = true;
        break;
      case 'KeyF':
      case 'KeyX':
        if (isDown) this.state.slash = true;
        break;
      case 'KeyR':
        if (isDown) this.state.swapBlades = true;
        break;
    }
  }

  /**
   * Reset per-frame input deltas and single-press triggers
   */
  public endFrame(): void {
    this.state.mouseDeltaX = 0;
    this.state.mouseDeltaY = 0;
    this.state.slash = false;
    this.state.toggleView = false;
    this.state.toggleMap = false;
    this.state.swapBlades = false;
    this.state.reset = false;
  }
}

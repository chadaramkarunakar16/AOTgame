import * as THREE from 'three';
import { Titan, TitanState } from '../combat/Titan';

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private speedLabel: HTMLElement;

  public isExpanded: boolean = false;
  private mapRadius: number = 110; // Map radius in pixels (Doubled from 70!)
  private worldScale: number = 0.85; // Increased scale for clearer district detail

  constructor() {
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'minimap-canvas';
      this.canvas.width = 240;
      this.canvas.height = 240;
      document.body.appendChild(this.canvas);
    } else {
      this.canvas.width = 240;
      this.canvas.height = 240;
    }
    this.ctx = this.canvas.getContext('2d')!;

    let sp = document.getElementById('minimap-speed');
    if (!sp) {
      sp = document.createElement('div');
      sp.id = 'minimap-speed';
      sp.textContent = '0 km/h';
      document.body.appendChild(sp);
    }
    this.speedLabel = sp;
  }

  public toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
    const container = document.getElementById('minimap-container');
    const tacticalModal = document.getElementById('tactical-map-modal');
    if (container) {
      if (this.isExpanded) {
        container.classList.add('fullscreen-tactical');
        this.canvas.width = 460;
        this.canvas.height = 460;
        if (tacticalModal) tacticalModal.classList.remove('hidden');
      } else {
        container.classList.remove('fullscreen-tactical');
        this.canvas.width = 240;
        this.canvas.height = 240;
        if (tacticalModal) tacticalModal.classList.add('hidden');
      }
    }
  }

  public update(
    playerPos: THREE.Vector3,
    playerYaw: number,
    playerSpeedMs: number,
    titans: Titan[],
    civilians: { position: THREE.Vector3; rescued: boolean }[],
    refillStations: THREE.Vector3[]
  ): void {
    const ctx = this.ctx;
    const size = this.canvas.width;
    const center = size / 2;
    const radius = center - 4;

    ctx.clearRect(0, 0, size, size);

    // 1. Clip to circular compass frame
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();

    // Background terrain color
    ctx.fillStyle = '#4c8a2b';
    ctx.fillRect(0, 0, size, size);

    // Transform world to player-centric rotated view
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-playerYaw); // Map rotates with player heading, or north up: rotate by -playerYaw for compass style

    // Draw courtyard dirt area
    const pX = -playerPos.x * this.worldScale;
    const pZ = -playerPos.z * this.worldScale;

    ctx.fillStyle = '#a17c4b';
    ctx.fillRect(pX - 25, pZ - 25, 50, 50);

    // Draw central watchtower
    ctx.fillStyle = '#5c3d1e';
    ctx.fillRect(pX - 5, pZ - 5, 10, 10);

    // Draw distant outer wall lines
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 4;
    const wallD = 165 * this.worldScale;
    ctx.strokeRect(pX - wallD, pZ - wallD, wallD * 2, wallD * 2);

    // Draw Resupply Depots (Red Beacon dots with glowing halos on the map)
    ctx.fillStyle = '#ef4444';
    for (const r of refillStations) {
      const rx = (r.x - playerPos.x) * this.worldScale;
      const rz = (r.z - playerPos.z) * this.worldScale;
      ctx.beginPath();
      ctx.arc(rx, rz, 4.0, 0, Math.PI * 2);
      ctx.fill();

      // Outer red pulse ring
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rx, rz, 6.0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw Civilians & Items as Red Color Marks (Matching user request!)
    for (const civ of civilians) {
      if (civ.rescued) continue;
      const cx = (civ.position.x - playerPos.x) * this.worldScale;
      const cz = (civ.position.z - playerPos.z) * this.worldScale;

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cz, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw Titans (Red Threat dots scaled proportionally to Titan size!)
    for (const t of titans) {
      if (t.state === TitanState.DEAD) continue;
      const tx = (t.position.x - playerPos.x) * this.worldScale;
      const tz = (t.position.z - playerPos.z) * this.worldScale;

      // Scale map dot radius by Titan height/scale factor (Big titans = big dots, small titans = small dots!)
      const dotRadius = Math.max(3.2, 5.0 * t.scaleFactor.y);

      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(tx, tz, dotRadius, 0, Math.PI * 2);
      ctx.fill();

      // Yellow Nape indicator behind titan
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(tx, tz + dotRadius * 0.65, Math.max(1.5, dotRadius * 0.38), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore(); // Restore player-centric world transform

    // Draw Player Arrow at exact center (Scout insignia white arrow)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center, center - 7);
    ctx.lineTo(center - 5, center + 6);
    ctx.lineTo(center, center + 3);
    ctx.lineTo(center + 5, center + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore(); // Restore clip

    // Circular Border Ring
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Outer subtle gold trim
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, radius - 2, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Update Speedometer Readout (km/h) underneath the minimap
    const speedKmh = Math.round(playerSpeedMs * 3.6);
    this.speedLabel.textContent = `${speedKmh} km/h`;
  }
}

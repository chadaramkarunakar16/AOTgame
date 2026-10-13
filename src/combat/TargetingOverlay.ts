import * as THREE from 'three';
import { Titan, TitanState } from './Titan';

export interface WorldTarget {
  id: string;
  position: THREE.Vector3;
  type: 'nape' | 'civilian' | 'refill';
  label: string;
  sublabel?: string;
  inRange: boolean;
  distance: number;
  screenX: number;
  screenY: number;
  visible: boolean;
}

export class TargetingOverlay {
  private container: HTMLElement;
  private elements: Map<string, HTMLElement> = new Map();
  private tempVec: THREE.Vector3 = new THREE.Vector3();

  constructor() {
    let el = document.getElementById('targeting-overlay-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'targeting-overlay-container';
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.pointerEvents = 'none';
      el.style.overflow = 'hidden';
      el.style.zIndex = '35';
      document.body.appendChild(el);
    }
    this.container = el;
  }

  /**
   * Update all on-screen 3D world target projections:
   * - Titan nape distance (turns flashing red when <= 7.5m)
   * - Civilian rescue beacons (green diamond with distance)
   * - Refill depots (cyan diamond with distance)
   */
  public update(
    camera: THREE.Camera,
    playerPos: THREE.Vector3,
    titans: Titan[],
    civilians: { id: string; position: THREE.Vector3; rescued: boolean }[],
    refillDepots: THREE.Vector3[]
  ): { closestNapeDist: number; closestNapeInRange: boolean } {
    const activeIds = new Set<string>();
    let closestNapeDist = 9999;
    let closestNapeInRange = false;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 1. Process Titan Napes
    for (const titan of titans) {
      if (titan.state === TitanState.DYING || titan.state === TitanState.DEAD) continue;

      const napePos = titan.napeWorldPos;
      const dist = playerPos.distanceTo(napePos);

      // Only show markers for titans within 110 meters
      if (dist > 110) continue;

      const heightDiff = Math.abs(playerPos.y - napePos.y);
      const inRange = dist <= 5.2 && heightDiff <= 3.2;

      if (dist < closestNapeDist) {
        closestNapeDist = dist;
        closestNapeInRange = inRange;
      }

      const id = `titan-nape-${titan.id}`;
      activeIds.add(id);

      this.tempVec.copy(napePos);
      this.tempVec.project(camera);

      // Check if target is in front of camera
      const isVisible = this.tempVec.z > 0 && this.tempVec.z < 1.0;
      const screenX = (this.tempVec.x * 0.5 + 0.5) * width;
      const screenY = (-(this.tempVec.y * 0.5) + 0.5) * height;

      this.renderMarker(id, {
        type: 'nape',
        label: inRange ? '⚔️ SLICE NAPE!' : 'TITAN NAPE',
        sublabel: inRange ? `[ ${dist.toFixed(1)} m ] PRESS F` : `${dist.toFixed(1)} m`,
        distance: dist,
        inRange,
        screenX,
        screenY,
        visible: isVisible && screenX > 20 && screenX < width - 20 && screenY > 20 && screenY < height - 20
      });
    }

    // 2. Process Civilians
    for (const civ of civilians) {
      if (civ.rescued) continue;

      const dist = playerPos.distanceTo(civ.position);
      if (dist > 140) continue;

      const id = `civ-${civ.id}`;
      activeIds.add(id);

      this.tempVec.copy(civ.position).add(new THREE.Vector3(0, 1.8, 0));
      this.tempVec.project(camera);

      const isVisible = this.tempVec.z > 0 && this.tempVec.z < 1.0;
      const screenX = (this.tempVec.x * 0.5 + 0.5) * width;
      const screenY = (-(this.tempVec.y * 0.5) + 0.5) * height;

      const inRange = dist <= 5.0;
      this.renderMarker(id, {
        type: 'civilian',
        label: inRange ? 'RESCUE' : 'CIVILIAN',
        sublabel: inRange ? 'PRESS E' : `${Math.round(dist)} m`,
        distance: dist,
        inRange,
        screenX,
        screenY,
        visible: isVisible && screenX > 20 && screenX < width - 20 && screenY > 20 && screenY < height - 20
      });
    }

    // Clean up markers that are no longer active
    for (const [id, el] of this.elements.entries()) {
      if (!activeIds.has(id)) {
        el.remove();
        this.elements.delete(id);
      }
    }

    return { closestNapeDist, closestNapeInRange };
  }

  private renderMarker(
    id: string,
    data: {
      type: 'nape' | 'civilian' | 'refill';
      label: string;
      sublabel: string;
      distance: number;
      inRange: boolean;
      screenX: number;
      screenY: number;
      visible: boolean;
    }
  ): void {
    let el = this.elements.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'target-distance-marker';
      this.container.appendChild(el);
      this.elements.set(id, el);
    }

    if (!data.visible) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'flex';
    el.style.left = `${data.screenX}px`;
    el.style.top = `${data.screenY}px`;

    if (data.type === 'nape') {
      if (data.inRange) {
        el.className = 'target-distance-marker nape in-range';
        el.innerHTML = `
          <div class="marker-diamond nape-glow">⚔️</div>
          <div class="marker-title-nape-kill">${data.label}</div>
          <div class="marker-dist-nape-kill">${data.sublabel}</div>
        `;
      } else {
        el.className = 'target-distance-marker nape';
        el.innerHTML = `
          <div class="marker-diamond nape-diamond">◆</div>
          <div class="marker-title-nape">${data.label}</div>
          <div class="marker-dist-nape">${data.sublabel}</div>
        `;
      }
    } else if (data.type === 'civilian') {
      el.className = `target-distance-marker civilian ${data.inRange ? 'in-range' : ''}`;
      el.innerHTML = `
        <div class="marker-diamond civ-diamond">◆</div>
        <div class="marker-title-civ">${data.label}</div>
        <div class="marker-dist-civ">${data.sublabel}</div>
      `;
    }
  }

  public clear(): void {
    for (const el of this.elements.values()) {
      el.remove();
    }
    this.elements.clear();
  }
}

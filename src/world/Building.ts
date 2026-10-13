import * as THREE from 'three';

export type BlockType = 'stoneBrick' | 'woodPlank' | 'woodLog' | 'leaves' | 'hayBale' | 'redRoof' | 'blueRoof' | 'cobblestone' | 'grass' | 'dirt';

export interface BlockData {
  box: THREE.Box3;
  position: THREE.Vector3;
  size: THREE.Vector3;
  color: THREE.Color;
  blockType?: BlockType;
}

export class Building {
  public boundingBox: THREE.Box3;
  public blocks: BlockData[] = [];

  constructor() {
    this.boundingBox = new THREE.Box3();
  }

  public addBlock(pos: THREE.Vector3, size: THREE.Vector3, color: THREE.Color, blockType: BlockType = 'stoneBrick'): void {
    const min = new THREE.Vector3(pos.x - size.x / 2, pos.y - size.y / 2, pos.z - size.z / 2);
    const max = new THREE.Vector3(pos.x + size.x / 2, pos.y + size.y / 2, pos.z + size.z / 2);
    const box = new THREE.Box3(min, max);

    this.blocks.push({
      box,
      position: pos.clone(),
      size: size.clone(),
      color,
      blockType
    });

    this.boundingBox.union(box);
  }
}

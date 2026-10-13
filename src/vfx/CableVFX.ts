import * as THREE from 'three';

export class CableVFX {
  public group: THREE.Group;
  private leftLine: THREE.Line;
  private rightLine: THREE.Line;
  private leftAnchorMesh: THREE.Mesh;
  private rightAnchorMesh: THREE.Mesh;

  private leftPositions: Float32Array;
  private rightPositions: Float32Array;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ODM_Cable_VFX';

    // Cable material (sharp steel wire matching anime ODM cables)
    const cableMat = new THREE.LineBasicMaterial({
      color: 0xcccccc,
      linewidth: 2
    });

    // Anchor pin mesh (subtle dark steel piton head)
    const anchorGeo = new THREE.BoxGeometry(0.12, 0.12, 0.18);
    const anchorMat = new THREE.MeshLambertMaterial({ color: 0x475569 });

    this.leftAnchorMesh = new THREE.Mesh(anchorGeo, anchorMat);
    this.rightAnchorMesh = new THREE.Mesh(anchorGeo, anchorMat);
    this.leftAnchorMesh.visible = false;
    this.rightAnchorMesh.visible = false;
    this.group.add(this.leftAnchorMesh);
    this.group.add(this.rightAnchorMesh);

    // Left cable geometry (2 points)
    this.leftPositions = new Float32Array(6);
    const leftGeo = new THREE.BufferGeometry();
    leftGeo.setAttribute('position', new THREE.BufferAttribute(this.leftPositions, 3));
    this.leftLine = new THREE.Line(leftGeo, cableMat);
    this.leftLine.visible = false;
    this.group.add(this.leftLine);

    // Right cable geometry (2 points)
    this.rightPositions = new Float32Array(6);
    const rightGeo = new THREE.BufferGeometry();
    rightGeo.setAttribute('position', new THREE.BufferAttribute(this.rightPositions, 3));
    this.rightLine = new THREE.Line(rightGeo, cableMat);
    this.rightLine.visible = false;
    this.group.add(this.rightLine);
  }

  public updateCable(
    side: 'left' | 'right',
    isActive: boolean,
    startPos: THREE.Vector3,
    anchorPos: THREE.Vector3 | null
  ): void {
    const isLeft = side === 'left';
    const line = isLeft ? this.leftLine : this.rightLine;
    const anchorMesh = isLeft ? this.leftAnchorMesh : this.rightAnchorMesh;
    const positions = isLeft ? this.leftPositions : this.rightPositions;

    if (!isActive || !anchorPos) {
      line.visible = false;
      anchorMesh.visible = false;
      return;
    }

    line.visible = true;
    anchorMesh.visible = true;
    anchorMesh.position.copy(anchorPos);

    // Set points
    positions[0] = startPos.x;
    positions[1] = startPos.y;
    positions[2] = startPos.z;

    positions[3] = anchorPos.x;
    positions[4] = anchorPos.y;
    positions[5] = anchorPos.z;

    line.geometry.attributes.position.needsUpdate = true;
  }
}

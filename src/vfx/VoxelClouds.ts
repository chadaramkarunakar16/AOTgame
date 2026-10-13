import * as THREE from 'three';

/**
 * 3D Volumetric Voxel Clouds floating overhead across the sky
 * Directly matching the reference images (media_1791815411137_cb546580.png and media_1791815456526_64068547.jpg)
 */
export class VoxelClouds {
  public group: THREE.Group;
  private clouds: { mesh: THREE.Mesh; speed: number; x: number; z: number }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Voxel_Clouds_Layer';

    const cloudTopMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.92
    });

    const cloudBottomMat = new THREE.MeshBasicMaterial({
      color: 0xc8d8e8, // Soft atmospheric light-blue under-cloud shadow
      transparent: true,
      opacity: 0.92
    });

    // Cloud materials for box faces: top is white, bottom is shaded, sides are soft white
    const materials = [
      cloudTopMat,    // right
      cloudTopMat,    // left
      cloudTopMat,    // top (crisp white)
      cloudBottomMat, // bottom (under-shadow)
      cloudTopMat,    // front
      cloudTopMat     // back
    ];

    // Procedural cluster of large flat Minecraft / AOT voxel clouds
    const cloudCount = 28;
    const altitude = 115.0;

    for (let i = 0; i < cloudCount; i++) {
      const width = 35 + Math.random() * 45;
      const height = 4.5 + Math.random() * 2.5;
      const depth = 25 + Math.random() * 35;

      const geo = new THREE.BoxGeometry(width, height, depth);
      const mesh = new THREE.Mesh(geo, materials);

      const x = (Math.random() - 0.5) * 600;
      const y = altitude + (Math.random() - 0.5) * 12;
      const z = (Math.random() - 0.5) * 600;

      mesh.position.set(x, y, z);
      this.group.add(mesh);

      this.clouds.push({
        mesh,
        speed: 1.8 + Math.random() * 1.5,
        x,
        z
      });
    }
  }

  public update(dt: number): void {
    const driftSpeed = 3.2;
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * driftSpeed * dt;
      // Wrap around world bounds
      if (c.mesh.position.x > 350) {
        c.mesh.position.x = -350;
      }
    }
  }
}

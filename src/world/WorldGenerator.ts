import * as THREE from 'three';
import { Building, BlockData, BlockType } from './Building';
import { CelShadingHelper } from '../materials/CelShadingHelper';
import { VoxelTextureAtlas } from '../materials/VoxelTextureAtlas';

export interface RefillStation {
  position: THREE.Vector3;
  radius: number;
}

export class WorldGenerator {
  public buildings: Building[] = [];
  public collisionBoxes: THREE.Box3[] = [];
  public worldGroup: THREE.Group;
  public groundMesh: THREE.Mesh;
  public refillStations: RefillStation[] = [];
  public civilians: { id: string; position: THREE.Vector3; rescued: boolean }[] = [];

  private blockSize: number = 4;

  constructor() {
    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'Reference_AOT_World';

    // Base ground plane: Vibrant lush pixelated grass as in screenshot
    const grassTopTex = VoxelTextureAtlas.getGrassTopTexture();
    grassTopTex.repeat.set(160, 160);

    const groundGeo = new THREE.PlaneGeometry(650, 650);
    // Minecraft grass_block_top is a grayscale colormap in vanilla, tinted with plains grass biome green (0x79c05a / 0x6eb834)
    const groundMat = new THREE.MeshLambertMaterial({
      map: grassTopTex,
      color: new THREE.Color(0x6eb834)
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = 0;
    this.worldGroup.add(this.groundMesh);

    // Ground collision plane: y = 0
    const groundBox = new THREE.Box3(
      new THREE.Vector3(-325, -10, -325),
      new THREE.Vector3(325, 0, 325)
    );
    this.collisionBoxes.push(groundBox);
  }

  /**
   * Generates world 100% matching the user reference screenshot:
   * 1. Central tall wooden watchtower (multi-story with 4 vertical legs, crossbeams, lookout deck)
   * 2. Giant forest trees with massive blocky trunks and high canopy platforms in the background
   * 3. Stepped voxel grass terrain plateaus with dirt edges
   * 4. Golden wheat haybale stacks on the left
   * 5. Red poppy and yellow dandelion flower sprigs scattered across the grass
   * 6. Gas refill beacons (blue vertical light beams)
   * 7. Distant stone wall fortifications
   */
  public generate(seed: number = 1337): void {
    let s = seed;
    const random = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    const allBlocks: BlockData[] = [];

    // 1. Natural Stepped Voxel Grass Terraces (Exact stepped Minecraft grass blocks in screenshot media_1791805975216_24bee3d1.jpg)
    const createVoxelTerrace = (cx: number, cz: number, width: number, depth: number, height: number = 2.0) => {
      const b = new Building();
      b.addBlock(
        new THREE.Vector3(cx, height / 2, cz),
        new THREE.Vector3(width, height, depth),
        new THREE.Color(0xffffff),
        'grass'
      );
      this.buildings.push(b);
      for (const blk of b.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    };

    // Authentic stepped foreground & background voxel plateaus from reference screenshot:
    createVoxelTerrace(-14, 12, 16, 22, 2.0);
    createVoxelTerrace(-18, 12, 10, 16, 4.0);
    createVoxelTerrace(18, 26, 20, 24, 2.0);
    createVoxelTerrace(22, 28, 14, 18, 4.0);
    createVoxelTerrace(-45, -35, 34, 30, 2.0);
    createVoxelTerrace(-45, -35, 24, 20, 4.0);
    createVoxelTerrace(-45, -35, 14, 12, 6.0);
    createVoxelTerrace(55, 45, 36, 32, 2.0);
    createVoxelTerrace(55, 45, 26, 24, 4.0);
    createVoxelTerrace(55, 45, 16, 14, 6.0);
    createVoxelTerrace(-70, 75, 42, 38, 2.0);
    createVoxelTerrace(-70, 75, 28, 26, 4.0);
    createVoxelTerrace(85, -65, 38, 36, 2.0);
    createVoxelTerrace(85, -65, 24, 22, 4.0);

    // 2. TOWERING WOODEN WATCHTOWER (Exact Central Structure in Screenshot!)
    const createWatchtower = (tx: number, tz: number, height: number = 28) => {
      const b = new Building();
      const legSize = 1.6;
      const spacing = 3.8;

      // 4 Heavy vertical timber corner legs
      const legPositions = [
        [-spacing, -spacing],
        [spacing, -spacing],
        [-spacing, spacing],
        [spacing, spacing]
      ];

      for (const [lx, lz] of legPositions) {
        b.addBlock(
          new THREE.Vector3(tx + lx, height / 2, tz + lz),
          new THREE.Vector3(legSize, height, legSize),
          new THREE.Color(0xffffff),
          'woodLog'
        );
      }

      // Horizontal crossbeams connecting the legs at multiple heights
      for (let y = 5; y < height; y += 5.5) {
        b.addBlock(
          new THREE.Vector3(tx, y, tz - spacing),
          new THREE.Vector3(spacing * 2 + legSize, 1.1, 1.1),
          new THREE.Color(0xffffff),
          'woodPlank'
        );
        b.addBlock(
          new THREE.Vector3(tx, y, tz + spacing),
          new THREE.Vector3(spacing * 2 + legSize, 1.1, 1.1),
          new THREE.Color(0xffffff),
          'woodPlank'
        );
        b.addBlock(
          new THREE.Vector3(tx - spacing, y, tz),
          new THREE.Vector3(1.1, 1.1, spacing * 2 + legSize),
          new THREE.Color(0xffffff),
          'woodPlank'
        );
        b.addBlock(
          new THREE.Vector3(tx + spacing, y, tz),
          new THREE.Vector3(1.1, 1.1, spacing * 2 + legSize),
          new THREE.Color(0xffffff),
          'woodPlank'
        );
      }

      // Observation Platform Deck
      const deckSize = spacing * 2 + 3.2;
      b.addBlock(
        new THREE.Vector3(tx, height, tz),
        new THREE.Vector3(deckSize, 1.2, deckSize),
        new THREE.Color(0xffffff),
        'woodPlank'
      );

      // Deck Guard Rails
      b.addBlock(
        new THREE.Vector3(tx, height + 1.2, tz - deckSize / 2),
        new THREE.Vector3(deckSize, 1.2, 0.5),
        new THREE.Color(0xffffff),
        'woodPlank'
      );
      b.addBlock(
        new THREE.Vector3(tx, height + 1.2, tz + deckSize / 2),
        new THREE.Vector3(deckSize, 1.2, 0.5),
        new THREE.Color(0xffffff),
        'woodPlank'
      );
      b.addBlock(
        new THREE.Vector3(tx - deckSize / 2, height + 1.2, tz),
        new THREE.Vector3(0.5, 1.2, deckSize),
        new THREE.Color(0xffffff),
        'woodPlank'
      );
      b.addBlock(
        new THREE.Vector3(tx + deckSize / 2, height + 1.2, tz),
        new THREE.Vector3(0.5, 1.2, deckSize),
        new THREE.Color(0xffffff),
        'woodPlank'
      );

      // Tower Shelter Roof
      const roofH = height + 5.5;
      b.addBlock(
        new THREE.Vector3(tx, roofH, tz),
        new THREE.Vector3(deckSize + 1.2, 1.1, deckSize + 1.2),
        new THREE.Color(0xffffff),
        'woodPlank'
      );

      this.buildings.push(b);
      for (const blk of b.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    };

    // Central watchtower positioned directly ahead of spawn (just like in the reference screenshot!)
    createWatchtower(0, 18, 24);
    createWatchtower(-48, -45, 26);
    createWatchtower(55, -40, 28);
    createWatchtower(72, 70, 30);
    createWatchtower(-68, 50, 26);

    // 3. COLOSSAL GIANT FOREST TREES (Authentic Minecraft Branching Trees from reference image!)
    const createGiantTree = (tx: number, tz: number, height: number = 48) => {
      const b = new Building();
      const trunkW = 3.6;

      // 1. Root flare base
      b.addBlock(new THREE.Vector3(tx, 2.0, tz), new THREE.Vector3(trunkW + 2.0, 4.0, trunkW + 2.0), new THREE.Color(0xffffff), 'woodLog');

      // 2. Colossal vertical timber log trunk
      b.addBlock(new THREE.Vector3(tx, height / 2, tz), new THREE.Vector3(trunkW, height, trunkW), new THREE.Color(0xffffff), 'woodLog');

      // 3. Mid-height Scout Lookout Platform Deck with Railings (Wrap-around deck)
      const deckY = height * 0.52;
      const deckW = trunkW + 4.8;
      b.addBlock(new THREE.Vector3(tx, deckY, tz), new THREE.Vector3(deckW, 1.2, deckW), new THREE.Color(0xffffff), 'woodPlank');
      // Deck outer railings
      b.addBlock(new THREE.Vector3(tx, deckY + 1.1, tz - deckW / 2 + 0.3), new THREE.Vector3(deckW, 1.0, 0.6), new THREE.Color(0xffffff), 'woodPlank');
      b.addBlock(new THREE.Vector3(tx, deckY + 1.1, tz + deckW / 2 - 0.3), new THREE.Vector3(deckW, 1.0, 0.6), new THREE.Color(0xffffff), 'woodPlank');
      b.addBlock(new THREE.Vector3(tx - deckW / 2 + 0.3, deckY + 1.1, tz), new THREE.Vector3(0.6, 1.0, deckW), new THREE.Color(0xffffff), 'woodPlank');
      b.addBlock(new THREE.Vector3(tx + deckW / 2 - 0.3, deckY + 1.1, tz), new THREE.Vector3(0.6, 1.0, deckW), new THREE.Color(0xffffff), 'woodPlank');

      // 4. Branching Horizontal Timber Limbs & Clustered Canopies
      const branches = [
        { dx: -6.5, dz: 0, dy: height * 0.72, len: 7.0 },
        { dx: 6.5, dz: 0, dy: height * 0.76, len: 7.0 },
        { dx: 0, dz: -6.5, dy: height * 0.82, len: 7.0 },
        { dx: 0, dz: 6.5, dy: height * 0.85, len: 7.0 }
      ];

      for (const br of branches) {
        const isX = br.dx !== 0;
        const lx = tx + br.dx / 2;
        const lz = tz + br.dz / 2;
        const sizeX = isX ? br.len : 1.8;
        const sizeZ = isX ? 1.8 : br.len;
        b.addBlock(new THREE.Vector3(lx, br.dy, lz), new THREE.Vector3(sizeX, 1.8, sizeZ), new THREE.Color(0xffffff), 'woodLog');

        // Stepped cubic leaf cluster on branch tip
        const bx = tx + br.dx;
        const bz = tz + br.dz;
        b.addBlock(new THREE.Vector3(bx, br.dy + 1.5, bz), new THREE.Vector3(8.0, 2.5, 8.0), new THREE.Color(0xffffff), 'leaves');
        b.addBlock(new THREE.Vector3(bx, br.dy + 3.2, bz), new THREE.Vector3(5.5, 2.0, 5.5), new THREE.Color(0xffffff), 'leaves');
      }

      // 5. Grand Summit Canopy (Stepped, tiered Minecraft leaf crown)
      const topY = height;
      b.addBlock(new THREE.Vector3(tx, topY + 1.5, tz), new THREE.Vector3(18.0, 3.0, 18.0), new THREE.Color(0xffffff), 'leaves');
      b.addBlock(new THREE.Vector3(tx, topY + 4.5, tz), new THREE.Vector3(14.0, 3.0, 14.0), new THREE.Color(0xffffff), 'leaves');
      b.addBlock(new THREE.Vector3(tx, topY + 7.5, tz), new THREE.Vector3(9.0, 3.0, 9.0), new THREE.Color(0xffffff), 'leaves');
      b.addBlock(new THREE.Vector3(tx, topY + 9.5, tz), new THREE.Vector3(4.5, 2.0, 4.5), new THREE.Color(0xffffff), 'leaves');

      this.buildings.push(b);
      for (const blk of b.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    };

    // Giant forest trees encircling the district (just like the Titan Forest!)
    createGiantTree(-28, -65, 48);
    createGiantTree(32, -80, 50);
    createGiantTree(-90, -25, 44);
    createGiantTree(-105, 35, 46);
    createGiantTree(100, 15, 46);
    createGiantTree(75, -105, 52);
    createGiantTree(-20, 85, 48);
    createGiantTree(-70, -110, 50);
    createGiantTree(50, 95, 46);

    // 3B. CANONICAL MINECRAFT PLAINS OAK TREES (Scattered across the field and town)
    const createMinecraftOakTree = (ox: number, oz: number, treeH: number = 7.0) => {
      const b = new Building();
      const trunkW = 1.4;

      // 1x1 Oak log trunk
      b.addBlock(new THREE.Vector3(ox, treeH / 2, oz), new THREE.Vector3(trunkW, treeH, trunkW), new THREE.Color(0xffffff), 'woodLog');

      // 4-tier canonical Minecraft leaf canopy
      b.addBlock(new THREE.Vector3(ox, treeH - 1.2, oz), new THREE.Vector3(5.6, 1.4, 5.6), new THREE.Color(0xffffff), 'leaves');
      b.addBlock(new THREE.Vector3(ox, treeH + 0.2, oz), new THREE.Vector3(5.6, 1.4, 5.6), new THREE.Color(0xffffff), 'leaves');
      b.addBlock(new THREE.Vector3(ox, treeH + 1.6, oz), new THREE.Vector3(3.6, 1.4, 3.6), new THREE.Color(0xffffff), 'leaves');
      b.addBlock(new THREE.Vector3(ox, treeH + 2.8, oz), new THREE.Vector3(2.0, 1.2, 2.0), new THREE.Color(0xffffff), 'leaves');

      this.buildings.push(b);
      for (const blk of b.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    };

    const oakTreePositions = [
      [-12, -25], [18, -35], [-35, -15], [25, 10], [-15, 45],
      [12, 60], [-42, 65], [45, 45], [-55, 5], [58, -15],
      [-8, -85], [14, -115], [-60, -75], [62, -65], [-30, -125],
      [35, 120], [-65, 110], [70, 75], [-15, -45], [8, -15],
      [-25, 20], [32, 25], [-50, -45], [52, -45], [-80, -50],
      [85, -60], [-75, 80], [60, -95]
    ];
    for (const [ox, oz] of oakTreePositions) {
      createMinecraftOakTree(ox, oz, 6.0 + Math.random() * 2.5);
    }

    // 3C. WINDING COBBLESTONE & DIRT PATHWAYS (From reference screenshots!)
    const createPathSegment = (px: number, pz: number, pw: number, pd: number, isCobble: boolean = true) => {
      const b = new Building();
      b.addBlock(
        new THREE.Vector3(px, 0.2, pz),
        new THREE.Vector3(pw, 0.4, pd),
        new THREE.Color(0xffffff),
        isCobble ? 'cobblestone' : 'dirt'
      );
      this.buildings.push(b);
      for (const blk of b.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    };

    // Central road from Wall Gate (z: -160) towards Central Watchtower (z: 18)
    for (let z = -155; z <= 25; z += 8) {
      createPathSegment(0, z, 5.0, 8.2, true);
    }
    // Branch road to Training Arena
    for (let x = 0; x <= 35; x += 6) {
      createPathSegment(x, -40, 6.2, 4.5, false);
    }
    // Branch road to Medieval Town
    for (let x = 0; x <= 80; x += 7) {
      createPathSegment(x, -15, 7.2, 4.5, true);
    }

    // 4. GOLDEN WHEAT HAYBALES (Left side of reference image!)
    const createHayBale = (hx: number, hz: number) => {
      const b = new Building();
      b.addBlock(
        new THREE.Vector3(hx, 1.5, hz),
        new THREE.Vector3(3.2, 3.0, 3.2),
        new THREE.Color(0xffffff),
        'hayBale'
      );
      this.buildings.push(b);
      for (const blk of b.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    };

    createHayBale(-18, 14);
    createHayBale(-15, 15);
    createHayBale(-16, 18);
    createHayBale(22, 28);
    createHayBale(25, 29);

    // 5. DISTANT STONE WALL FORTIFICATIONS & BATTLEMETS (from reference image media_1791815411137_cb546580.png!)
    const wallHeight = 55.0;
    const wallDist = 165.0;
    const wallThickness = 12.0;

    const createWallSegment = (pos: THREE.Vector3, size: THREE.Vector3) => {
      const b = new Building();
      b.addBlock(pos, size, new THREE.Color(0xffffff), 'stoneBrick');

      // Parapet walkway floor
      const walkwaySize = size.clone();
      walkwaySize.y = 1.6;
      b.addBlock(new THREE.Vector3(pos.x, wallHeight + 0.8, pos.z), walkwaySize, new THREE.Color(0xffffff), 'cobblestone');

      // Outer crenellation teeth (castellated blocks)
      const isEastWest = size.x > size.z;
      const step = 6.0;
      if (isEastWest) {
        for (let x = -size.x / 2 + 3; x <= size.x / 2 - 3; x += step) {
          b.addBlock(
            new THREE.Vector3(pos.x + x, wallHeight + 2.2, pos.z + size.z / 2 - 0.6),
            new THREE.Vector3(3.2, 2.0, 1.2),
            new THREE.Color(0xffffff),
            'stoneBrick'
          );
          b.addBlock(
            new THREE.Vector3(pos.x + x, wallHeight + 2.2, pos.z - size.z / 2 + 0.6),
            new THREE.Vector3(3.2, 2.0, 1.2),
            new THREE.Color(0xffffff),
            'stoneBrick'
          );
        }
      }

      this.buildings.push(b);
      for (const blk of b.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    };

    createWallSegment(new THREE.Vector3(0, wallHeight / 2, -wallDist), new THREE.Vector3(wallDist * 2 + wallThickness, wallHeight, wallThickness));
    createWallSegment(new THREE.Vector3(0, wallHeight / 2, wallDist), new THREE.Vector3(wallDist * 2 + wallThickness, wallHeight, wallThickness));
    createWallSegment(new THREE.Vector3(wallDist, wallHeight / 2, 0), new THREE.Vector3(wallThickness, wallHeight, wallDist * 2));
    createWallSegment(new THREE.Vector3(-wallDist, wallHeight / 2, 0), new THREE.Vector3(wallThickness, wallHeight, wallDist * 2));

    // 5B. STONE WATCHTOWERS WITH CONICAL RED TILED ROOFS (Exact structures from both reference screenshots!)
    const createStoneTower = (tx: number, tz: number, towerH: number = 68.0) => {
      const b = new Building();
      const towerW = 9.0;

      // Heavy grey stone masonry shaft
      b.addBlock(
        new THREE.Vector3(tx, towerH / 2, tz),
        new THREE.Vector3(towerW, towerH, towerW),
        new THREE.Color(0xffffff),
        'stoneBrick'
      );

      // Observation deck platform with corbel overhang
      const deckW = towerW + 2.4;
      b.addBlock(
        new THREE.Vector3(tx, towerH + 1.0, tz),
        new THREE.Vector3(deckW, 2.0, deckW),
        new THREE.Color(0xffffff),
        'cobblestone'
      );

      // Conical / Pyramidal Terracotta RED Tiled Roof (Prominent in screenshots!)
      const roofLevels = 6;
      for (let lvl = 0; lvl < roofLevels; lvl++) {
        const rw = deckW * (1.0 - lvl * 0.16);
        const rh = 1.8;
        const ry = towerH + 2.0 + lvl * rh + rh / 2;
        b.addBlock(
          new THREE.Vector3(tx, ry, tz),
          new THREE.Vector3(rw, rh, rw),
          new THREE.Color(0xffffff),
          'redRoof'
        );
      }

      // Spire tip on top of the red roof
      b.addBlock(
        new THREE.Vector3(tx, towerH + 13.5, tz),
        new THREE.Vector3(0.8, 3.2, 0.8),
        new THREE.Color(0xffffff),
        'stoneBrick'
      );

      this.buildings.push(b);
      for (const blk of b.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    };

    // Strategic Red-Roofed Watchtowers matching the skyline in reference screenshots
    createStoneTower(-25, -165, 68);
    createStoneTower(25, -165, 68);
    createStoneTower(-165, -165, 72);
    createStoneTower(165, -165, 72);
    createStoneTower(75, -85, 60);
    createStoneTower(-85, 45, 62);
    createStoneTower(110, 80, 60);

    // 5C. SURVEY CORPS GREEN TAPESTRY BANNERS ON STONE WALLS (From reference image!)
    const bannerTex = CelShadingHelper.getScoutBannerTexture();
    const bannerMat = new THREE.MeshLambertMaterial({ map: bannerTex, side: THREE.DoubleSide });
    const bannerGeo = new THREE.PlaneGeometry(3.6, 12.0);

    const bannerPositions = [
      new THREE.Vector3(-15, 45, -158.9),
      new THREE.Vector3(15, 45, -158.9),
      new THREE.Vector3(-45, 45, -158.9),
      new THREE.Vector3(45, 45, -158.9)
    ];

    for (const bPos of bannerPositions) {
      const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
      bannerMesh.position.copy(bPos);
      this.worldGroup.add(bannerMesh);
    }

    // 6. GAS REFILL RESUPPLY DEPOTS WITH BLUE VERTICAL LIGHT BEAMS
    const createRefillDepot = (rx: number, ry: number, rz: number) => {
      const depotGroup = new THREE.Group();
      depotGroup.position.set(rx, ry, rz);

      // Wooden support rack
      const tableGeo = new THREE.BoxGeometry(3.6, 1.0, 2.0);
      const tableMat = new THREE.MeshLambertMaterial({ color: 0x4a321d });
      const table = new THREE.Mesh(tableGeo, tableMat);
      table.position.y = 0.5;
      depotGroup.add(table);

      // Compressed Gas Tanks (Cyan canisters)
      const tankGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.4, 12);
      const tankMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
      for (let i = -1.2; i <= 1.2; i += 0.6) {
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(i, 1.7, 0);
        depotGroup.add(tank);
      }

      // Vertical Blue Gas Light Beam (Explicitly highlighted in reference: "Blue beams mark fuel canisters")
      const beaconGeo = new THREE.CylinderGeometry(0.18, 0.18, 45.0, 8);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.65
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.y = 22.5;
      depotGroup.add(beacon);

      // Glowing blue ground halo
      const ringGeo = new THREE.RingGeometry(1.6, 2.4, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      depotGroup.add(ring);

      this.worldGroup.add(depotGroup);
      this.refillStations.push({
        position: new THREE.Vector3(rx, ry, rz),
        radius: 5.0
      });

      this.collisionBoxes.push(
        new THREE.Box3(
          new THREE.Vector3(rx - 1.8, ry, rz - 1.0),
          new THREE.Vector3(rx + 1.8, ry + 1.2, rz + 1.0)
        )
      );
    };

    // Strategic Gas Refill Depots
    createRefillDepot(-10, 0, 8);
    createRefillDepot(40, 0, 35);
    createRefillDepot(-45, 0, -40);
    createRefillDepot(0, 0, -75);
    createRefillDepot(0, 55.0, -165);

    // 7. TRAINING PRACTICE ARENA (From reference image media_1791815456526_64068547.jpg!)
    // Dirt courtyard with 4 tall wooden practice grappling poles and surrounding fence
    const arenaX = 35;
    const arenaZ = -40;
    const arenaSize = 36;

    // Dirt arena floor
    const arenaFloor = new Building();
    arenaFloor.addBlock(
      new THREE.Vector3(arenaX, 0.4, arenaZ),
      new THREE.Vector3(arenaSize, 0.8, arenaSize),
      new THREE.Color(0xffffff),
      'dirt'
    );
    this.buildings.push(arenaFloor);
    for (const blk of arenaFloor.blocks) {
      allBlocks.push(blk);
      this.collisionBoxes.push(blk.box);
    }

    // Timber perimeter fence around training arena
    const halfA = arenaSize / 2;
    const fenceH = 1.4;
    const addArenaFence = (fx: number, fz: number, fw: number, fd: number) => {
      const fb = new Building();
      fb.addBlock(new THREE.Vector3(fx, fenceH / 2, fz), new THREE.Vector3(fw, fenceH, fd), new THREE.Color(0xffffff), 'woodPlank');
      this.buildings.push(fb);
      for (const blk of fb.blocks) { allBlocks.push(blk); this.collisionBoxes.push(blk.box); }
    };
    addArenaFence(arenaX, arenaZ - halfA, arenaSize, 1.0);
    addArenaFence(arenaX, arenaZ + halfA, arenaSize, 1.0);
    addArenaFence(arenaX - halfA, arenaZ, 1.0, arenaSize);
    addArenaFence(arenaX + halfA, arenaZ, 1.0, arenaSize);

    // 4 Tall practice timber poles inside the arena
    const poleOffsets = [
      [-10, -10],
      [10, -10],
      [-10, 10],
      [10, 10]
    ];
    for (const [px, pz] of poleOffsets) {
      const pole = new Building();
      const poleH = 26.0;
      pole.addBlock(
        new THREE.Vector3(arenaX + px, poleH / 2, arenaZ + pz),
        new THREE.Vector3(2.2, poleH, 2.2),
        new THREE.Color(0xffffff),
        'woodLog'
      );
      this.buildings.push(pole);
      for (const blk of pole.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    }

    // 8. 5 CIVILIAN ROOFTOP RESCUE SPOTS (From reference image media_1791815411137_cb546580.png!)
    const civilianSpots = [
      { id: '1', x: -55, z: -25, h: 18 },
      { id: '2', x: -75, z: 25, h: 22 },
      { id: '3', x: 70, z: 35, h: 20 },
      { id: '4', x: -25, z: 75, h: 24 },
      { id: '5', x: 55, z: -75, h: 19 }
    ];

    for (const spot of civilianSpots) {
      // Build rooftop house for civilian to stand upon
      const house = new Building();
      house.addBlock(
        new THREE.Vector3(spot.x, spot.h / 2, spot.z),
        new THREE.Vector3(14, spot.h, 14),
        new THREE.Color(0xffffff),
        'stoneBrick'
      );
      // Rooftop rim
      house.addBlock(
        new THREE.Vector3(spot.x, spot.h + 0.6, spot.z),
        new THREE.Vector3(14.8, 1.2, 14.8),
        new THREE.Color(0xffffff),
        'blueRoof'
      );
      this.buildings.push(house);
      for (const blk of house.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }

      // Add civilian standing on rooftop
      this.civilians.push({
        id: spot.id,
        position: new THREE.Vector3(spot.x, spot.h + 1.2, spot.z),
        rescued: false
      });

      // Authentic Minecraft Voxel Civilian Human Model
      const civGroup = new THREE.Group();
      civGroup.position.set(spot.x, spot.h + 0.6, spot.z);
      civGroup.name = `Civilian_NPC_${spot.id}`;

      // Clothes / skin materials
      const skinMat = new THREE.MeshLambertMaterial({ color: 0xffcfab });
      const tunicMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 }); // Blue civilian tunic
      const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1e3a8a }); // Navy trousers
      const hairMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });

      // Head (0.6 x 0.6 x 0.6)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), skinMat);
      head.position.y = 1.7;
      civGroup.add(head);

      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.3, 0.64), hairMat);
      hair.position.y = 1.9;
      civGroup.add(hair);

      // Torso (0.6 x 0.75 x 0.35)
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.35), tunicMat);
      torso.position.y = 1.05;
      civGroup.add(torso);

      // Arms (0.22 x 0.75 x 0.22)
      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), tunicMat);
      leftArm.position.set(-0.42, 1.05, 0);
      civGroup.add(leftArm);

      const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), tunicMat);
      rightArm.position.set(0.42, 1.05, 0);
      civGroup.add(rightArm);

      // Legs (0.28 x 0.75 x 0.28)
      const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.26), pantsMat);
      leftLeg.position.set(-0.16, 0.375, 0);
      civGroup.add(leftLeg);

      const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.26), pantsMat);
      rightLeg.position.set(0.16, 0.375, 0);
      civGroup.add(rightLeg);

      // Emergency distress flare beacon (Green vertical beacon beam as in reference image)
      const flareBeacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 35, 8),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.6 })
      );
      flareBeacon.position.y = 17.5;
      civGroup.add(flareBeacon);

      this.worldGroup.add(civGroup);
    }

    // 8B. CLUSTERED MEDIEVAL TOWN HOUSES (From reference image media_1791815456526_64068547.jpg!)
    const townHousePositions = [
      { x: 80, z: -15, w: 12, d: 10, h: 14, roof: 'redRoof' as BlockType },
      { x: 95, z: -18, w: 10, d: 12, h: 16, roof: 'blueRoof' as BlockType },
      { x: 110, z: -20, w: 14, d: 12, h: 18, roof: 'redRoof' as BlockType },
      { x: 85, z: 8, w: 11, d: 11, h: 15, roof: 'blueRoof' as BlockType },
      { x: 102, z: 12, w: 12, d: 10, h: 17, roof: 'redRoof' as BlockType },
      { x: 120, z: 5, w: 13, d: 12, h: 15, roof: 'blueRoof' as BlockType }
    ];

    for (const th of townHousePositions) {
      const thb = new Building();
      // Stone foundation / ground floor
      thb.addBlock(
        new THREE.Vector3(th.x, th.h * 0.3, th.z),
        new THREE.Vector3(th.w, th.h * 0.6, th.d),
        new THREE.Color(0xffffff),
        'stoneBrick'
      );
      // Half-timber upper floor
      thb.addBlock(
        new THREE.Vector3(th.x, th.h * 0.8, th.z),
        new THREE.Vector3(th.w + 0.4, th.h * 0.4, th.d + 0.4),
        new THREE.Color(0xffffff),
        'woodPlank'
      );
      // Pitched shingle roof
      thb.addBlock(
        new THREE.Vector3(th.x, th.h + 1.5, th.z),
        new THREE.Vector3(th.w + 1.2, 3.0, th.d + 1.2),
        new THREE.Color(0xffffff),
        th.roof
      );
      this.buildings.push(thb);
      for (const blk of thb.blocks) {
        allBlocks.push(blk);
        this.collisionBoxes.push(blk.box);
      }
    }

    // 9. SCATTERED POPPY FLOWERS & DANDELIONS (Exact feature from screenshot foreground!)
    this.createVegetationSprites();

    // 10. High-Performance InstancedMesh Rendering
    this.createInstancedMeshes(allBlocks);
  }

  /**
   * Scattered red poppy flowers, dandelions, and tall grass sprigs
   * Uses authentic Minecraft cross-plane geometry (2 intersecting quads at 45 degrees)
   */
  private createVegetationSprites(): void {
    const flowerCount = 180;
    const flowerGeo = new THREE.PlaneGeometry(1.2, 1.4);

    const redTex = VoxelTextureAtlas.getPoppyTexture();
    const yelTex = VoxelTextureAtlas.getDandelionTexture();

    const redMat = new THREE.MeshLambertMaterial({
      map: redTex,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide
    });
    const yelMat = new THREE.MeshLambertMaterial({
      map: yelTex,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide
    });

    const flowerGroup = new THREE.Group();
    flowerGroup.name = 'Field_Flowers';

    for (let i = 0; i < flowerCount; i++) {
      const isRed = Math.random() > 0.45;
      const mat = isRed ? redMat : yelMat;

      // Create crossed quad for authentic Minecraft 3D flower look
      const plantSubGroup = new THREE.Group();
      const plane1 = new THREE.Mesh(flowerGeo, mat);
      const plane2 = new THREE.Mesh(flowerGeo, mat);
      plane1.rotation.y = Math.PI / 4;
      plane2.rotation.y = -Math.PI / 4;
      plantSubGroup.add(plane1);
      plantSubGroup.add(plane2);

      const angle = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 95;
      plantSubGroup.position.set(Math.cos(angle) * dist, 0.7, Math.sin(angle) * dist);
      plantSubGroup.rotation.y = Math.random() * Math.PI;

      flowerGroup.add(plantSubGroup);
    }

    this.worldGroup.add(flowerGroup);
  }

  private createInstancedMeshes(blocks: BlockData[]): void {
    if (blocks.length === 0) return;

    // Group blocks by blockType
    const grouped = new Map<BlockType, BlockData[]>();
    for (const b of blocks) {
      const type = b.blockType || 'stoneBrick';
      if (!grouped.has(type)) {
        grouped.set(type, []);
      }
      grouped.get(type)!.push(b);
    }

    const baseGeo = new THREE.BoxGeometry(1, 1, 1);

    const stoneTex = VoxelTextureAtlas.getStoneBrickTexture();
    const cobbleTex = VoxelTextureAtlas.getCobblestoneTexture();
    const plankTex = VoxelTextureAtlas.getWoodPlankTexture();
    const logTex = VoxelTextureAtlas.getWoodLogTexture();
    const leavesTex = VoxelTextureAtlas.getLeavesTexture();
    const hayTex = VoxelTextureAtlas.getHayBaleTexture();
    const redRoofTex = VoxelTextureAtlas.getRedRoofTexture();
    const blueRoofTex = VoxelTextureAtlas.getBlueRoofTexture();
    const dirtTex = VoxelTextureAtlas.getDirtTexture();
    const grassTopTex = VoxelTextureAtlas.getGrassTopTexture();
    const grassSideTex = VoxelTextureAtlas.getGrassSideTexture();

    const getMaterialForType = (type: BlockType): THREE.Material | THREE.Material[] => {
      switch (type) {
        case 'stoneBrick':
          return new THREE.MeshLambertMaterial({ map: stoneTex });
        case 'cobblestone':
          return new THREE.MeshLambertMaterial({ map: cobbleTex });
        case 'woodPlank':
          return new THREE.MeshLambertMaterial({ map: plankTex });
        case 'woodLog':
          return new THREE.MeshLambertMaterial({ map: logTex });
        case 'leaves':
          return new THREE.MeshLambertMaterial({ map: leavesTex, transparent: true, alphaTest: 0.2 });
        case 'hayBale':
          return new THREE.MeshLambertMaterial({ map: hayTex });
        case 'redRoof':
          return new THREE.MeshLambertMaterial({ map: redRoofTex });
        case 'blueRoof':
          return new THREE.MeshLambertMaterial({ map: blueRoofTex });
        case 'dirt':
          return new THREE.MeshLambertMaterial({ map: dirtTex });
        case 'grass': {
          const side = new THREE.MeshLambertMaterial({ map: grassSideTex });
          const top = new THREE.MeshLambertMaterial({ map: grassTopTex, color: new THREE.Color(0x6eb834) });
          const bottom = new THREE.MeshLambertMaterial({ map: dirtTex });
          return [side, side, top, bottom, side, side];
        }
        default:
          return new THREE.MeshLambertMaterial({ map: stoneTex });
      }
    };

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();

    grouped.forEach((typeBlocks, type) => {
      const mat = getMaterialForType(type);
      const instMesh = new THREE.InstancedMesh(baseGeo, mat, typeBlocks.length);
      instMesh.name = `Instanced_${type}`;

      for (let i = 0; i < typeBlocks.length; i++) {
        const b = typeBlocks[i];
        position.copy(b.position);
        scale.copy(b.size);
        matrix.compose(position, rotation, scale);
        instMesh.setMatrixAt(i, matrix);
      }

      instMesh.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(instMesh);
    });
  }
}


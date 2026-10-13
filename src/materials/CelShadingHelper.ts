import * as THREE from 'three';

/**
 * Cel-Shading and Anime Procedural Texture Helper
 * Generates 3-tone toon lighting ramps and anime emblems without external image assets.
 */
export class CelShadingHelper {
  private static gradientMap: THREE.DataTexture | null = null;
  private static wingsEmblemTexture: THREE.CanvasTexture | null = null;
  private static titanFaceTexture: THREE.CanvasTexture | null = null;
  private static wallStoneTexture: THREE.CanvasTexture | null = null;
  private static timberWallTexture: THREE.CanvasTexture | null = null;
  private static roofTileTexture: THREE.CanvasTexture | null = null;

  // Minecraft / Roam Blocky Textures matching user reference
  private static grassTopTexture: THREE.CanvasTexture | null = null;
  private static grassSideTexture: THREE.CanvasTexture | null = null;
  private static dirtTexture: THREE.CanvasTexture | null = null;
  private static woodLogTexture: THREE.CanvasTexture | null = null;
  private static woodPlankTexture: THREE.CanvasTexture | null = null;
  private static foliageTexture: THREE.CanvasTexture | null = null;
  private static flowerTexture: THREE.CanvasTexture | null = null;

  /**
   * Vibrant, lush voxel grass top texture (pixelated 16x16 / 32x32 style)
   */
  public static getGrassTopTexture(): THREE.CanvasTexture {
    if (this.grassTopTexture) return this.grassTopTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Base vibrant AOT lush green (matching reference image foreground)
    ctx.fillStyle = '#65a832';
    ctx.fillRect(0, 0, 64, 64);

    // Pixelated anime grass clusters
    const greens = ['#72bd38', '#59992b', '#7ec93e', '#4c8524', '#68ad33'];
    for (let x = 0; x < 64; x += 4) {
      for (let y = 0; y < 64; y += 4) {
        if (Math.random() > 0.35) {
          ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.grassTopTexture = tex;
    return this.grassTopTexture;
  }

  /**
   * Minecraft-style grass side with rich dirt brown bottom and dripping green grass fringe
   */
  public static getGrassSideTexture(): THREE.CanvasTexture {
    if (this.grassSideTexture) return this.grassSideTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Rich earthy brown dirt base (matching reference image)
    ctx.fillStyle = '#6a4729';
    ctx.fillRect(0, 0, 64, 64);

    // Earthy dirt speckles
    const dirts = ['#5c3d23', '#77502f', '#4f331b', '#845934'];
    for (let x = 0; x < 64; x += 4) {
      for (let y = 0; y < 64; y += 4) {
        if (Math.random() > 0.45) {
          ctx.fillStyle = dirts[Math.floor(Math.random() * dirts.length)];
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    // Top grass layer with dripping overhangs
    ctx.fillStyle = '#65a832';
    ctx.fillRect(0, 0, 64, 16);
    for (let x = 0; x < 64; x += 4) {
      const drop = Math.floor(Math.random() * 4) * 4;
      ctx.fillRect(x, 16, 4, drop);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.grassSideTexture = tex;
    return this.grassSideTexture;
  }

  /**
   * Natural brown wood log/bark texture for watchtowers and trees
   */
  public static getWoodLogTexture(): THREE.CanvasTexture {
    if (this.woodLogTexture) return this.woodLogTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Rich dark oak timber brown
    ctx.fillStyle = '#4a2f18';
    ctx.fillRect(0, 0, 64, 64);

    // Deep wood grain ridges
    const barks = ['#3d2511', '#5c3b1e', '#321c0b', '#4e311a'];
    for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = barks[Math.floor(Math.random() * barks.length)];
      ctx.fillRect(x, 0, 4, 64);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = barks[Math.floor(Math.random() * barks.length)];
      ctx.fillRect(Math.floor(Math.random() * 16) * 4, Math.floor(Math.random() * 16) * 4, 4, 8);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.woodLogTexture = tex;
    return this.woodLogTexture;
  }

  /**
   * Wood plank texture for watchtower floors, roofs and beams
   */
  public static getWoodPlankTexture(): THREE.CanvasTexture {
    if (this.woodPlankTexture) return this.woodPlankTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Medium warm oak timber planks
    ctx.fillStyle = '#7a5229';
    ctx.fillRect(0, 0, 64, 64);

    // Plank seams
    ctx.fillStyle = '#4a3015';
    for (let y = 0; y < 64; y += 16) {
      ctx.fillRect(0, y, 64, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.woodPlankTexture = tex;
    return this.woodPlankTexture;
  }

  /**
   * Blocky tree foliage / leaf cluster texture
   */
  public static getFoliageTexture(): THREE.CanvasTexture {
    if (this.foliageTexture) return this.foliageTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Lush deep forest canopy green
    ctx.fillStyle = '#2d6a1e';
    ctx.fillRect(0, 0, 64, 64);

    const leafGreens = ['#388225', '#245617', '#42962c', '#1b4010', '#307320'];
    for (let x = 0; x < 64; x += 4) {
      for (let y = 0; y < 64; y += 4) {
        if (Math.random() > 0.35) {
          ctx.fillStyle = leafGreens[Math.floor(Math.random() * leafGreens.length)];
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    this.foliageTexture = tex;
    return this.foliageTexture;
  }

  /**
   * Generates a 3-step discrete quantized luminance ramp for MeshToonMaterial.
   * Produces authentic hand-drawn anime shadow terminators.
   */
  public static getToonGradientMap(): THREE.DataTexture {
    if (this.gradientMap) return this.gradientMap;

    const colors = new Uint8Array(3);
    colors[0] = 70;  // Deep anime shadow tone
    colors[1] = 175; // Midtone
    colors[2] = 255; // Highlight

    const texture = new THREE.DataTexture(colors, 3, 1, THREE.RedFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    this.gradientMap = texture;

    return this.gradientMap;
  }

  /**
   * Procedurally paints the iconic Survey Corps 'Wings of Freedom' crest:
   * Dark grey/gold shield outline containing overlapping blue and white feathered wings.
   */
  public static getWingsOfFreedomTexture(): THREE.CanvasTexture {
    if (this.wingsEmblemTexture) return this.wingsEmblemTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, 256, 256);

    // Shield base
    ctx.beginPath();
    ctx.moveTo(128, 20);
    ctx.lineTo(210, 50);
    ctx.lineTo(200, 160);
    ctx.lineTo(128, 230);
    ctx.lineTo(56, 160);
    ctx.lineTo(46, 50);
    ctx.closePath();
    ctx.fillStyle = '#22272e';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#c4a747'; // Gold trim
    ctx.stroke();

    // Inner shield fill
    ctx.beginPath();
    ctx.moveTo(128, 30);
    ctx.lineTo(198, 56);
    ctx.lineTo(190, 155);
    ctx.lineTo(128, 218);
    ctx.lineTo(66, 155);
    ctx.lineTo(58, 56);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();

    // Left Wing (Midnight Navy Blue feathers)
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.moveTo(125, 45);
    ctx.bezierCurveTo(75, 70, 70, 140, 95, 175);
    ctx.lineTo(125, 140);
    ctx.closePath();
    ctx.fill();

    // Individual blue feather vanes
    ctx.fillStyle = '#172554';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(85 + i * 10, 80 + i * 20, 28, 10, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Right Wing (Crisp White / Silver feathers overlapping)
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(131, 45);
    ctx.bezierCurveTo(181, 70, 186, 140, 161, 175);
    ctx.lineTo(131, 140);
    ctx.closePath();
    ctx.fill();

    // Feather vanes outline
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(171 - i * 10, 80 + i * 20, 28, 10, 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    this.wingsEmblemTexture = texture;
    return this.wingsEmblemTexture;
  }

  /**
   * Procedural uncanny dead-eyed Titan face:
   * Manic wide unblinking eyes, hollow black pupils, and skinless-edged grinning mouth.
   */
  public static getTitanFaceTexture(): THREE.CanvasTexture {
    if (this.titanFaceTexture) return this.titanFaceTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Fleshy anime base
    ctx.fillStyle = '#dfb594';
    ctx.fillRect(0, 0, 256, 256);

    // Cheekbone hollows / gaunt shadows
    ctx.fillStyle = '#b78362';
    ctx.beginPath();
    ctx.ellipse(45, 140, 25, 45, 0.2, 0, Math.PI * 2);
    ctx.ellipse(211, 140, 25, 45, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Giant unblinking wide eyes
    const drawEye = (x: number, y: number) => {
      // Eye socket shadow
      ctx.fillStyle = '#7a4e38';
      ctx.beginPath();
      ctx.ellipse(x, y, 38, 28, 0, 0, Math.PI * 2);
      ctx.fill();

      // White sclera
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(x, y, 32, 22, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dead pinpoint black pupil
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();

      // Bloodshot capillaries
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 28, y);
      ctx.lineTo(x - 14, y);
      ctx.moveTo(x + 28, y);
      ctx.lineTo(x + 14, y);
      ctx.stroke();
    };

    drawEye(75, 90);
    drawEye(181, 90);

    // Monolithic grotesque grinning mouth
    ctx.fillStyle = '#450a0a'; // Dark mouth cavern
    ctx.beginPath();
    ctx.ellipse(128, 195, 75, 35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rows of blocky human teeth
    ctx.fillStyle = '#f1f5f9';
    const toothCount = 10;
    const toothW = 12;
    for (let i = 0; i < toothCount; i++) {
      const tx = 68 + i * 13;
      // Top teeth
      ctx.fillRect(tx, 172, toothW - 2, 14);
      // Bottom teeth
      ctx.fillRect(tx + 2, 202, toothW - 2, 14);
    }

    // Bold anime ink outlines around lips
    ctx.strokeStyle = '#1e1b18';
    ctx.lineWidth = 4;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    this.titanFaceTexture = texture;
    return this.titanFaceTexture;
  }

  /**
   * Weathered Wall Maria stone block texture with deep mortar crevices
   */
  public static getWallStoneTexture(): THREE.CanvasTexture {
    if (this.wallStoneTexture) return this.wallStoneTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#949599';
    ctx.fillRect(0, 0, 256, 256);

    // Stone blocks with dark ink mortar lines
    ctx.strokeStyle = '#474a51';
    ctx.lineWidth = 5;

    const rows = 8;
    const rowH = 256 / rows;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * rowH);
      ctx.lineTo(256, r * rowH);
      ctx.stroke();

      const offset = (r % 2) * 32;
      for (let c = 0; c < 5; c++) {
        const x = (c * 64 + offset) % 256;
        ctx.beginPath();
        ctx.moveTo(x, r * rowH);
        ctx.lineTo(x, (r + 1) * rowH);
        ctx.stroke();
      }
    }

    // Weathered water streaks / stains
    ctx.fillStyle = 'rgba(40, 45, 55, 0.15)';
    ctx.fillRect(30, 0, 25, 256);
    ctx.fillRect(150, 0, 40, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 20);
    this.wallStoneTexture = texture;
    return this.wallStoneTexture;
  }

  /**
   * Shiganshina European half-timbered plaster wall with dark wooden crossbeams
   */
  public static getTimberWallTexture(): THREE.CanvasTexture {
    if (this.timberWallTexture) return this.timberWallTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Stucco / Plaster wall
    ctx.fillStyle = '#dfd5c6';
    ctx.fillRect(0, 0, 128, 128);

    // Dark timber beam outlines
    ctx.fillStyle = '#422818';
    // Border frame
    ctx.fillRect(0, 0, 128, 10);
    ctx.fillRect(0, 118, 128, 10);
    ctx.fillRect(0, 0, 10, 128);
    ctx.fillRect(118, 0, 10, 128);

    // Diagonal timber support
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(118, 118);
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#422818';
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.timberWallTexture = texture;
    return this.timberWallTexture;
  }

  /**
   * Survey Corps Wall Tapestry Banner (Emerald green with white Wings of Freedom emblem)
   * As seen hanging on the stone fortress walls in the reference image!
   */
  public static getScoutBannerTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;

    // Emerald Green Banner Fabric
    ctx.fillStyle = '#1b4d2e';
    ctx.fillRect(0, 0, 64, 160);

    // Golden border trim
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 58, 154);

    // Repeated small white wings icons down the banner
    ctx.fillStyle = '#f8fafc';
    for (let y = 16; y < 150; y += 22) {
      // White shield silhouette
      ctx.beginPath();
      ctx.moveTo(32, y);
      ctx.lineTo(44, y + 4);
      ctx.lineTo(40, y + 14);
      ctx.lineTo(32, y + 18);
      ctx.lineTo(24, y + 14);
      ctx.lineTo(20, y + 4);
      ctx.closePath();
      ctx.fill();

      // Wing feathers
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(26, y + 5, 5, 7);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(33, y + 5, 5, 7);
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  /**
   * Terracotta Red Roof Tile Texture (from reference watchtowers and houses)
   */
  public static getRedRoofTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#a84232';
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = '#75281d';
    ctx.lineWidth = 3;
    for (let y = 0; y <= 128; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y);
      ctx.stroke();

      const offset = (y % 32 === 0) ? 0 : 16;
      for (let x = offset; x <= 128; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  }
}

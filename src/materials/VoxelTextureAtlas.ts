import * as THREE from 'three';

/**
 * Authentic 16x16 Pixel-Art Texture Generator for Voxel AOT Game
 * Emulates the iconic Minecraft / Roam block textures with NearestFilter for razor-sharp pixel fidelity.
 */
export class VoxelTextureAtlas {
  private static stoneBrickTexture: THREE.CanvasTexture | null = null;
  private static cobblestoneTexture: THREE.CanvasTexture | null = null;
  private static woodPlankTexture: THREE.CanvasTexture | null = null;
  private static woodLogTexture: THREE.CanvasTexture | null = null;
  private static redRoofTexture: THREE.CanvasTexture | null = null;
  private static grassTopTexture: THREE.CanvasTexture | null = null;
  private static dirtTexture: THREE.CanvasTexture | null = null;
  private static scoutSkinTexture: THREE.CanvasTexture | null = null;

  /**
   * Helper to create a crisp 16x16 pixel-art texture with NearestFilter
   */
  private static createPixelTexture(
    width: number,
    height: number,
    drawFn: (ctx: CanvasRenderingContext2D) => void
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    drawFn(ctx);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private static loader = new THREE.TextureLoader();

  private static loadMinecraftTexture(
    url: string,
    fallbackFn?: () => THREE.CanvasTexture,
    repeatX: number = 1,
    repeatY: number = 1
  ): THREE.Texture {
    const tex = this.loader.load(
      url,
      (t) => {
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeatX, repeatY);
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
      }
    );
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 16x16 Stone Bricks Texture (Minecraft fortress walls & battlements)
   */
  public static getStoneBrickTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/stone_bricks.png', undefined, 4, 4);
  }

  /**
   * 16x16 Cobblestone Texture (Battlement walkways & roadways)
   */
  public static getCobblestoneTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/cobblestone.png', undefined, 2, 2);
  }

  /**
   * 16x16 Oak Planks Texture (Watchtower floors & crossbeams)
   */
  public static getWoodPlankTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/oak_planks.png');
  }

  /**
   * 16x16 Oak Log Bark Texture (Minecraft style)
   */
  public static getWoodLogTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/oak_log.png');
  }

  /**
   * 16x16 Oak Leaves Texture (Minecraft foliage)
   */
  public static getLeavesTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/oak_leaves.png');
  }

  /**
   * 16x16 Hay Bale Texture (Minecraft golden wheat bundle)
   */
  public static getHayBaleTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/hay_block_side.png');
  }

  public static getHayBaleTopTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/hay_block_top.png');
  }

  /**
   * 16x16 Terracotta Red Roof Tiles Texture (Towers & roofs from reference image)
   */
  public static getRedRoofTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/red_terracotta.png', undefined, 2, 2);
  }

  /**
   * 16x16 Dark Blue Slate Roof Texture (Town rooftops from reference image)
   */
  public static getBlueRoofTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/deepslate_tiles.png', undefined, 2, 2);
  }

  /**
   * 16x16 Rich Earth Dirt Texture (Minecraft soil)
   */
  public static getDirtTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/dirt.png');
  }

  /**
   * 16x16 Vibrant Minecraft Grass Block Top Texture
   */
  public static getGrassTopTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/grass_block_top.png');
  }

  /**
   * 16x16 Minecraft Grass Block Side Texture (Dirt base with green grass fringe)
   */
  public static getGrassSideTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/grass_block_side.png');
  }

  /**
   * 16x16 Minecraft Poppy Flower Texture
   */
  public static getPoppyTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/poppy.png');
  }

  /**
   * 16x16 Minecraft Dandelion Flower Texture
   */
  public static getDandelionTexture(): THREE.Texture {
    return this.loadMinecraftTexture('/textures/minecraft/dandelion.png');
  }

  /**
   * 64x64 Dedicated Pixel-Art Survey Corps Scout Skin
   * Faithfully draws the pixelated hair, eyes, scout uniform, leather harness, and riding boots.
   */
  public static getScoutSkinTexture(): THREE.CanvasTexture {
    if (this.scoutSkinTexture) return this.scoutSkinTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Fill transparent base
    ctx.clearRect(0, 0, 64, 64);

    // 1. HEAD (x: 0..32, y: 0..16)
    // Skin tone
    ctx.fillStyle = '#ffcfab';
    ctx.fillRect(8, 8, 8, 8); // Face front

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 12, 2, 2);
    ctx.fillRect(13, 12, 2, 2);
    ctx.fillStyle = '#2d4a6e'; // Navy/grey eyes
    ctx.fillRect(10, 12, 1, 2);
    ctx.fillRect(14, 12, 1, 2);

    // Hair (Dark brown parted scout hair)
    ctx.fillStyle = '#3a271b';
    ctx.fillRect(8, 0, 8, 8);   // Head top
    ctx.fillRect(8, 8, 8, 3);   // Front bangs
    ctx.fillRect(0, 8, 8, 8);   // Right hair
    ctx.fillRect(16, 8, 8, 8);  // Left hair
    ctx.fillRect(24, 8, 8, 8);  // Back hair

    // 2. TORSO (x: 16..40, y: 16..32)
    // Scout Jacket Brown
    ctx.fillStyle = '#8a5c34';
    ctx.fillRect(20, 20, 8, 12); // Front torso
    ctx.fillRect(32, 20, 8, 12); // Back torso

    // Inner White Shirt & Dark Collar
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(22, 20, 4, 4);
    ctx.fillStyle = '#3f2917';
    ctx.fillRect(21, 20, 1, 5);
    ctx.fillRect(26, 20, 1, 5);

    // Dark Leather Harness Webbing Straps (Front X cross)
    ctx.fillStyle = '#2d1c0f';
    ctx.fillRect(20, 24, 8, 1);
    ctx.fillRect(21, 22, 1, 8);
    ctx.fillRect(26, 22, 1, 8);

    // Silver 3D Maneuver Belt Buckle
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(23, 28, 2, 2);

    // Back Torso Wings of Freedom Shield Emblem (High-Resolution Pixel Art!)
    ctx.fillStyle = '#1e3a8a'; // Blue wing
    ctx.fillRect(34, 22, 2, 5);
    ctx.fillRect(33, 24, 2, 4);
    ctx.fillStyle = '#f8fafc'; // White wing
    ctx.fillRect(36, 22, 2, 5);
    ctx.fillRect(37, 24, 2, 4);
    ctx.fillStyle = '#b45309'; // Shield outline
    ctx.strokeRect(33.5, 21.5, 5, 7);

    // 3. ARMS (x: 40..56, y: 16..32)
    // Jacket Sleeves
    ctx.fillStyle = '#8a5c34';
    ctx.fillRect(44, 20, 4, 9);
    ctx.fillRect(52, 20, 4, 9);
    // Hands (skin)
    ctx.fillStyle = '#ffcfab';
    ctx.fillRect(44, 29, 4, 3);
    ctx.fillRect(52, 29, 4, 3);

    // 4. LEGS (x: 0..16, y: 16..32)
    // Crisp White Scout Trousers
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(4, 20, 4, 6);
    ctx.fillRect(12, 20, 4, 6);
    // Dark Brown Riding Boots with Cuffs
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(4, 26, 4, 6);
    ctx.fillRect(12, 26, 4, 6);
    // Boot cuff trim
    ctx.fillStyle = '#523420';
    ctx.fillRect(4, 26, 4, 1);
    ctx.fillRect(12, 26, 4, 1);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    this.scoutSkinTexture = tex;
    return this.scoutSkinTexture;
  }

  /**
   * 16x16 Minecraft Scout Face (eyes, bangs, mouth)
   */
  public static getScoutFaceTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      // Skin base
      ctx.fillStyle = '#ffcfab';
      ctx.fillRect(0, 0, 16, 16);
      // Dark brown hair bangs
      ctx.fillStyle = '#3a271b';
      ctx.fillRect(0, 0, 16, 5);
      ctx.fillRect(2, 5, 3, 2);
      ctx.fillRect(11, 5, 3, 2);
      // Eyebrows
      ctx.fillStyle = '#2b1b11';
      ctx.fillRect(2, 7, 4, 1);
      ctx.fillRect(10, 7, 4, 1);
      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(2, 8, 4, 3);
      ctx.fillRect(10, 8, 4, 3);
      ctx.fillStyle = '#2d4a6e'; // Navy/teal eyes
      ctx.fillRect(3, 8, 2, 3);
      ctx.fillRect(11, 8, 2, 3);
      ctx.fillStyle = '#0f172a'; // Pupils
      ctx.fillRect(3, 9, 1, 2);
      ctx.fillRect(11, 9, 1, 2);
      // Mouth
      ctx.fillStyle = '#c27b68';
      ctx.fillRect(6, 13, 4, 1);
    });
  }

  /**
   * 16x16 Minecraft Scout Hair (Top, Back, Sides)
   */
  public static getScoutHairTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      const tones = ['#3a271b', '#322115', '#452f20', '#2b1b11'];
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          ctx.fillStyle = tones[(x * 7 + y * 13) % tones.length];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });
  }

  /**
   * 16x16 Minecraft Scout Torso Front (Jacket, straps, shirt, belt)
   */
  public static getScoutTorsoFrontTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      // Brown Scout Jacket
      ctx.fillStyle = '#8a5c34';
      ctx.fillRect(0, 0, 16, 16);
      // Inner white shirt
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(5, 0, 6, 6);
      // Dark cravat / collar
      ctx.fillStyle = '#3a271b';
      ctx.fillRect(6, 2, 4, 3);
      // Harness leather cross straps
      ctx.fillStyle = '#2d1c0f';
      ctx.fillRect(3, 0, 2, 14);
      ctx.fillRect(11, 0, 2, 14);
      ctx.fillRect(0, 7, 16, 2);
      // Silver waist belt
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(0, 13, 16, 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6, 13, 4, 3);
    });
  }

  /**
   * 16x16 Minecraft Scout Torso Back (Jacket with harness straps)
   */
  public static getScoutTorsoBackTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      ctx.fillStyle = '#8a5c34';
      ctx.fillRect(0, 0, 16, 16);
      // Leather back harness straps
      ctx.fillStyle = '#2d1c0f';
      ctx.fillRect(3, 0, 2, 14);
      ctx.fillRect(11, 0, 2, 14);
      ctx.fillRect(0, 8, 16, 2);
      // Belt
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(0, 13, 16, 3);
    });
  }

  /**
   * 16x16 Minecraft Scout Arm (Jacket sleeve + skin hand)
   */
  public static getScoutArmTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      // Jacket sleeve
      ctx.fillStyle = '#8a5c34';
      ctx.fillRect(0, 0, 16, 12);
      // Sleeve cuff
      ctx.fillStyle = '#5c3a1e';
      ctx.fillRect(0, 11, 16, 1);
      // Hand skin
      ctx.fillStyle = '#ffcfab';
      ctx.fillRect(0, 12, 16, 4);
    });
  }

  /**
   * 16x16 Minecraft Scout Leg (White pants + dark riding boots)
   */
  public static getScoutLegTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      // Crisp white scout pants
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, 16, 8);
      // Pants shading
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 6, 16, 2);
      // Dark brown riding boots
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(0, 8, 16, 8);
      // Boot strap / buckle
      ctx.fillStyle = '#523420';
      ctx.fillRect(0, 8, 16, 1);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(7, 8, 2, 1);
    });
  }

  /**
   * 16x16 Emerald Green Scout Cape
   */
  public static getScoutCapeTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      const greens = ['#1b5e20', '#154e1a', '#226b28', '#1a541e'];
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          ctx.fillStyle = greens[(x * 7 + y * 11) % greens.length];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });
  }

  /**
   * 32x32 Authentic Minecraft Titan Face (Uncanny staring eyes & wide toothy grin)
   */
  public static getMinecraftTitanFaceTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(32, 32, (ctx) => {
      // Pale eerie Titan flesh base
      const tones = ['#e6dacb', '#ddd1c2', '#eee0d2', '#d5c8b7'];
      for (let x = 0; x < 32; x++) {
        for (let y = 0; y < 32; y++) {
          ctx.fillStyle = tones[(x * 7 + y * 13) % tones.length];
          ctx.fillRect(x, y, 1, 1);
        }
      }

      // Dirty messy hair bangs hanging on forehead (y: 0..8)
      ctx.fillStyle = '#2d1b11';
      ctx.fillRect(0, 0, 32, 5);
      for (let x = 2; x < 30; x += 4) {
        ctx.fillRect(x, 5, 2, 3);
        ctx.fillRect(x + 1, 5, 2, 4);
      }

      // Uncanny wide staring eyes (sockets at y: 10..15)
      // Socket shadow
      ctx.fillStyle = '#9c8875';
      ctx.fillRect(4, 9, 8, 6);
      ctx.fillRect(20, 9, 8, 6);

      // Sclera (White of eye)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(5, 10, 6, 4);
      ctx.fillRect(21, 10, 6, 4);

      // Red capillaries / eye strain
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(5, 11, 1, 2);
      ctx.fillRect(26, 11, 1, 2);

      // Black dead pinpoint pupils
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(7, 11, 2, 2);
      ctx.fillRect(23, 11, 2, 2);

      // Dark nostrils
      ctx.fillStyle = '#7a6755';
      ctx.fillRect(14, 17, 1, 2);
      ctx.fillRect(17, 17, 1, 2);

      // Wide manic grinning mouth cavern (y: 20..29)
      ctx.fillStyle = '#3f1010';
      ctx.fillRect(4, 20, 24, 9);
      ctx.fillRect(6, 19, 20, 1);
      ctx.fillRect(6, 29, 20, 1);

      // Upper and lower row of blocky white human teeth
      ctx.fillStyle = '#f8fafc';
      for (let x = 6; x < 26; x += 3) {
        ctx.fillRect(x, 21, 2, 3); // top tooth
        ctx.fillRect(x, 25, 2, 3); // bottom tooth
      }

      // Cheek lines / eerie hollow contours
      ctx.fillStyle = '#ab9784';
      ctx.fillRect(2, 16, 2, 8);
      ctx.fillRect(28, 16, 2, 8);
    });
  }

  /**
   * 16x16 Minecraft Titan Body Texture (Pale fleshy chest with pixel muscle lines)
   */
  public static getMinecraftTitanBodyTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      const tones = ['#e6dacb', '#ddd1c2', '#eee0d2', '#d5c8b7'];
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          ctx.fillStyle = tones[(x * 5 + y * 9) % tones.length];
          ctx.fillRect(x, y, 1, 1);
        }
      }
      // Pectoral / rib definition lines
      ctx.fillStyle = '#ab9784';
      ctx.fillRect(2, 4, 5, 1);
      ctx.fillRect(9, 4, 5, 1);
      ctx.fillRect(7, 3, 2, 10); // Sternum line
      ctx.fillRect(3, 8, 4, 1);
      ctx.fillRect(9, 8, 4, 1);
      ctx.fillRect(4, 11, 3, 1);
      ctx.fillRect(9, 11, 3, 1);
    });
  }

  /**
   * 16x16 Minecraft Titan Limb Texture
   */
  public static getMinecraftTitanLimbTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      const tones = ['#e6dacb', '#ddd1c2', '#d5c8b7', '#eee0d2'];
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          ctx.fillStyle = tones[(x * 11 + y * 7) % tones.length];
          ctx.fillRect(x, y, 1, 1);
        }
      }
      // Subtle muscle contour
      ctx.fillStyle = '#bfae9c';
      ctx.fillRect(4, 0, 1, 16);
      ctx.fillRect(11, 0, 1, 16);
    });
  }

  /**
   * 16x16 Minecraft Titan Exposed Nape Muscle Texture (Raw crimson meat fibers)
   */
  public static getMinecraftTitanNapeTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      const reds = ['#dc2626', '#b91c1c', '#ef4444', '#991b1b', '#7f1d1d'];
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          ctx.fillStyle = reds[(x * 13 + y * 17) % reds.length];
          ctx.fillRect(x, y, 1, 1);
        }
      }
      // Dark muscle seam grooves
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(0, 5, 16, 1);
      ctx.fillRect(0, 10, 16, 1);
      ctx.fillRect(7, 0, 2, 16);
    });
  }

  /**
   * 16x16 Minecraft Titan Hair Texture
   */
  public static getMinecraftTitanHairTexture(): THREE.CanvasTexture {
    return this.createPixelTexture(16, 16, (ctx) => {
      const hairs = ['#2d1b11', '#23140c', '#382215', '#1a0d07'];
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          ctx.fillStyle = hairs[(x * 7 + y * 11) % hairs.length];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });
  }
}

import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
const B = window.B, CS = window.CS, CH = window.CH;

/* =========================================================================
   Block definitions
   ========================================================================= */
const T = { // atlas tile indices
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, LOG_SIDE: 6, LOG_TOP: 7, LEAVES: 8, PLANKS: 9,
  COBBLE: 10, GLASS: 11, BRICK: 12, SNOW: 13, SNOW_SIDE: 14, COAL: 15, IRON: 16, GOLD: 17, DIAMOND: 18,
  BEDROCK: 19, CACTUS_SIDE: 20, CACTUS_TOP: 21, SANDSTONE_SIDE: 22, SANDSTONE_TOP: 23, GRAVEL: 24,
  SPRUCE_LOG: 25, SPRUCE_LEAVES: 26, TALLGRASS: 27, ROSE: 28, DANDELION: 29, ICE: 30, SPRUCE_TOP: 31,
  STONEBRICK: 32, PLASTER: 33, TIMBER: 34, ROOF_RED: 35, ROOF_SLATE: 36, CANOPY: 37, CANOPY_LIGHT: 38, BARK: 39, BARK_TOP: 40,
  PATH: 41, BANNER: 42, CRATE_SIDE: 43, CRATE_TOP: 44, MOSSY: 45, HAY_SIDE: 46, HAY_TOP: 47, IRONBARS: 48, DIRT_PATH: 49, WINDOW: 50, DIRT_PATH_SIDE: 51
};
const BLOCKS = [];
function def(id, name, tiles, opts = {}) {
  const [top, bottom, side] = Array.isArray(tiles) ? tiles : [tiles, tiles, tiles];
  BLOCKS[id] = Object.assign({ id, name, top, bottom, side, solid: true, opaque: true, cross: false, hard: 1, snd: 'stone' }, opts);
}
def(B.AIR, 'Air', 0, { solid: false, opaque: false, hard: 0 });
def(B.GRASS, 'Grass Block', [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], { hard: 0.55, snd: 'grass' });
def(B.DIRT, 'Dirt', T.DIRT, { hard: 0.5, snd: 'dirt' });
def(B.STONE, 'Stone', T.STONE, { hard: 1.1 });
def(B.SAND, 'Sand', T.SAND, { hard: 0.45, snd: 'sand' });
def(B.WATER, 'Water', 0, { solid: false, opaque: false, hard: -1, snd: 'water' });
def(B.LOG, 'Oak Log', [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE], { hard: 0.9, snd: 'wood' });
def(B.LEAVES, 'Oak Leaves', T.LEAVES, { opaque: false, hard: 0.2, snd: 'leaves' });
def(B.PLANKS, 'Oak Planks', T.PLANKS, { hard: 0.8, snd: 'wood' });
def(B.COBBLE, 'Cobblestone', T.COBBLE, { hard: 1.2 });
def(B.GLASS, 'Glass', T.GLASS, { opaque: false, hard: 0.3, snd: 'glass' });
def(B.BRICK, 'Bricks', T.BRICK, { hard: 1.2 });
def(B.SNOW, 'Snowy Grass', [T.SNOW, T.DIRT, T.SNOW_SIDE], { hard: 0.5, snd: 'snow' });
def(B.COAL, 'Coal Ore', T.COAL, { hard: 1.4 });
def(B.IRON, 'Iron Ore', T.IRON, { hard: 1.5 });
def(B.GOLD, 'Gold Ore', T.GOLD, { hard: 1.6 });
def(B.DIAMOND, 'Diamond Ore', T.DIAMOND, { hard: 1.8 });
def(B.BEDROCK, 'Bedrock', T.BEDROCK, { hard: -1 });
def(B.CACTUS, 'Cactus', [T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE], { hard: 0.35, snd: 'leaves' });
def(B.SANDSTONE, 'Sandstone', [T.SANDSTONE_TOP, T.SANDSTONE_TOP, T.SANDSTONE_SIDE], { hard: 0.9 });
def(B.GRAVEL, 'Gravel', T.GRAVEL, { hard: 0.55, snd: 'sand' });
def(B.SPRUCE_LOG, 'Spruce Log', [T.SPRUCE_TOP, T.SPRUCE_TOP, T.SPRUCE_LOG], { hard: 0.9, snd: 'wood' });
def(B.SPRUCE_LEAVES, 'Spruce Leaves', T.SPRUCE_LEAVES, { opaque: false, hard: 0.2, snd: 'leaves' });
def(B.TALLGRASS, 'Tall Grass', T.TALLGRASS, { solid: false, opaque: false, cross: true, hard: 0, snd: 'grass' });
def(B.ROSE, 'Rose', T.ROSE, { solid: false, opaque: false, cross: true, hard: 0, snd: 'grass' });
def(B.DANDELION, 'Dandelion', T.DANDELION, { solid: false, opaque: false, cross: true, hard: 0, snd: 'grass' });
def(B.SNOW_BLOCK, 'Snow', T.SNOW, { hard: 0.35, snd: 'snow' });
def(B.ICE, 'Ice', T.ICE, { hard: 0.4, snd: 'glass' });
def(B.STONEBRICK, 'Stone Bricks', T.STONEBRICK, { hard: 1.3 });
def(B.PLASTER, 'Plaster', T.PLASTER, { hard: 0.6 });
def(B.TIMBER, 'Timber Beam', T.TIMBER, { hard: 0.8, snd: 'wood' });
def(B.ROOF_RED, 'Red Roof Tiles', T.ROOF_RED, { hard: 0.7 });
def(B.ROOF_SLATE, 'Slate Roof', T.ROOF_SLATE, { hard: 0.7 });
def(B.CANOPY, 'Giant Leaves', T.CANOPY, { hard: 0.3, snd: 'leaves' });
def(B.CANOPY_LIGHT, 'Giant Leaves', T.CANOPY_LIGHT, { hard: 0.3, snd: 'leaves' });
def(B.BARK, 'Giant Bark', [T.BARK_TOP, T.BARK_TOP, T.BARK], { hard: 1.2, snd: 'wood' });
def(B.PATH, 'Cobbled Street', T.PATH, { hard: 1.0 });
def(B.BANNER, 'Legion Banner', T.BANNER, { hard: 0.3, snd: 'leaves' });
def(B.CRATE, 'Supply Crate', [T.CRATE_TOP, T.CRATE_TOP, T.CRATE_SIDE], { hard: 0.6, snd: 'wood' });
def(B.MOSSY, 'Mossy Stone Bricks', T.MOSSY, { hard: 1.3 });
def(B.HAY, 'Hay Bale', [T.HAY_TOP, T.HAY_TOP, T.HAY_SIDE], { hard: 0.4, snd: 'grass' });
def(B.IRONBARS, 'Portcullis', T.IRONBARS, { opaque: false, hard: 2 });
def(B.DIRT_PATH, 'Dirt Road', [T.DIRT_PATH, T.DIRT, T.DIRT_PATH_SIDE], { hard: 0.5, snd: 'dirt' });
def(B.WINDOW, 'Window', T.WINDOW, { hard: 0.4, snd: 'glass' });

const NB = 256;
const OPAQUE = new Uint8Array(NB), SOLID = new Uint8Array(NB), CROSS = new Uint8Array(NB), AOCC = new Uint8Array(NB), LIGHTBLOCK = new Uint8Array(NB);
const TILE_FACE = new Int16Array(NB * 6);
BLOCKS.forEach(b => {
  OPAQUE[b.id] = b.opaque ? 1 : 0; SOLID[b.id] = b.solid ? 1 : 0; CROSS[b.id] = b.cross ? 1 : 0;
  AOCC[b.id] = (b.opaque || b.id === B.LEAVES || b.id === B.SPRUCE_LEAVES) ? 1 : 0;
  LIGHTBLOCK[b.id] = (b.opaque || b.id === B.WATER) ? 1 : 0;
  for (let f = 0; f < 6; f++) TILE_FACE[b.id * 6 + f] = f === 2 ? b.bottom : f === 3 ? b.top : b.side;
});

const HOTBAR = [B.STONEBRICK, B.PLASTER, B.PLANKS, B.TIMBER, B.ROOF_RED, B.COBBLE, B.GLASS, B.LOG, B.CANOPY];
let selSlot = 0;

/* =========================================================================
   Procedural textures
   ========================================================================= */
const ATLAS_N = 16, TS = 16;
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = atlasCanvas.height = ATLAS_N * TS;
const actx = atlasCanvas.getContext('2d');
const tileAvg = [];
(function buildAtlas() {
  const img = actx.createImageData(ATLAS_N * TS, ATLAS_N * TS);
  const D = img.data;
  let rs = 1337;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  let cur = 0;
  const px = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    const i = (((Math.floor(cur / ATLAS_N) * TS + y) * ATLAS_N * TS) + (cur % ATLAS_N) * TS + x) * 4;
    D[i] = Math.max(0, Math.min(255, r)); D[i + 1] = Math.max(0, Math.min(255, g)); D[i + 2] = Math.max(0, Math.min(255, b)); D[i + 3] = a;
  };
  const get = (x, y) => { const i = (((Math.floor(cur / ATLAS_N) * TS + y) * ATLAS_N * TS) + (cur % ATLAS_N) * TS + x) * 4; return [D[i], D[i + 1], D[i + 2], D[i + 3]]; };
  const noisy = (c, v) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const f = 1 + (rnd() - 0.5) * v; px(x, y, c[0] * f, c[1] * f, c[2] * f); } };
  const specks = (c, n, v = 0.2) => { for (let i = 0; i < n; i++) { const f = 1 + (rnd() - 0.5) * v; px(Math.floor(rnd() * TS), Math.floor(rnd() * TS), c[0] * f, c[1] * f, c[2] * f); } };
  const tile = (i, fn) => { cur = i; fn(); };
  const dirt = () => { noisy([134, 96, 67], 0.35); specks([100, 70, 48], 22); specks([160, 120, 90], 10); };
  const stone = () => { noisy([127, 127, 127], 0.16); for (let i = 0; i < 7; i++) { const x = Math.floor(rnd() * 14), y = Math.floor(rnd() * 15); const l = 2 + Math.floor(rnd() * 3); for (let k = 0; k < l; k++) px(x + k, y, 105, 105, 105); } specks([150, 150, 150], 12, 0.1); };
  const ore = (c) => { stone(); for (let i = 0; i < 4; i++) { const cx = 2 + Math.floor(rnd() * 11), cy = 2 + Math.floor(rnd() * 11); for (let k = 0; k < 5; k++) { const x = cx + Math.floor(rnd() * 3) - 1, y = cy + Math.floor(rnd() * 3) - 1; const f = 0.8 + rnd() * 0.4; px(x, y, c[0] * f, c[1] * f, c[2] * f); } } };
  tile(T.GRASS_TOP, () => { noisy([96, 160, 56], 0.28); specks([70, 125, 40], 30); specks([125, 190, 80], 14); });
  tile(T.DIRT, dirt);
  tile(T.GRASS_SIDE, () => { dirt(); for (let x = 0; x < TS; x++) { const d = 3 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.25 ? 1 : 0); for (let y = 0; y < d; y++) { const f = 1 + (rnd() - 0.5) * 0.28; px(x, y, 96 * f, 160 * f, 56 * f); } } });
  tile(T.STONE, stone);
  tile(T.SAND, () => { noisy([219, 205, 160], 0.1); specks([196, 180, 135], 20, 0.1); specks([235, 225, 185], 10, 0.05); });
  tile(T.LOG_SIDE, () => { for (let x = 0; x < TS; x++) { const base = (x % 4 === 0) ? 0.75 : 1; for (let y = 0; y < TS; y++) { const f = base * (1 + (rnd() - 0.5) * 0.2); px(x, y, 104 * f, 82 * f, 51 * f); } } });
  tile(T.LOG_TOP, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); const f = 1 + (rnd() - 0.5) * 0.1; if (d > 6.5) px(x, y, 104 * f, 82 * f, 51 * f); else { const ring = Math.floor(d) % 2 ? 0.85 : 1; px(x, y, 184 * ring * f, 148 * ring * f, 92 * ring * f); } } });
  const leaves = (c) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const r = rnd(); if (r < 0.16) px(x, y, 0, 0, 0, 0); else { const f = 0.65 + rnd() * 0.5; px(x, y, c[0] * f, c[1] * f, c[2] * f); } } };
  tile(T.LEAVES, () => leaves([62, 138, 40]));
  tile(T.SPRUCE_LEAVES, () => leaves([48, 96, 62]));
  tile(T.PLANKS, () => { for (let y = 0; y < TS; y++) { const row = Math.floor(y / 4); for (let x = 0; x < TS; x++) { let f = 1 + (rnd() - 0.5) * 0.12; if (y % 4 === 3) f = 0.68; const seam = (row % 2 ? 4 : 11); if (x === seam && y % 4 !== 3) f = 0.75; px(x, y, 168 * f, 135 * f, 82 * f); } } });
  tile(T.COBBLE, () => {
    const pts = []; for (let i = 0; i < 11; i++) pts.push([rnd() * 16, rnd() * 16, 0.75 + rnd() * 0.45]);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (const p of pts) for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) { const d = (x - p[0] - ox) ** 2 + (y - p[1] - oy) ** 2; if (d < d1) { d2 = d1; d1 = d; best = p[2]; } else if (d < d2) d2 = d; }
      const edge = Math.sqrt(d2) - Math.sqrt(d1) < 1.1; const f = (edge ? 0.55 : best) * (1 + (rnd() - 0.5) * 0.12);
      px(x, y, 122 * f, 122 * f, 122 * f);
    }
  });
  tile(T.GLASS, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const edge = x === 0 || y === 0 || x === 15 || y === 15; const streak = (x + y === 10 || x + y === 11 || x + y === 22) && x > 1 && y > 1 && x < 14 && y < 14; if (edge) px(x, y, 200, 225, 235); else if (streak) px(x, y, 235, 248, 255); else px(x, y, 0, 0, 0, 0); } });
  tile(T.BRICK, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const row = Math.floor(y / 4); const off = row % 2 ? 4 : 0; const mortar = y % 4 === 3 || (x + off) % 8 === 7; const f = 1 + (rnd() - 0.5) * 0.18; if (mortar) px(x, y, 175 * f, 168 * f, 160 * f); else px(x, y, 150 * f, 74 * f, 58 * f); } });
  tile(T.SNOW, () => { noisy([240, 248, 252], 0.05); specks([220, 232, 245], 14, 0.04); });
  tile(T.SNOW_SIDE, () => { dirt(); for (let x = 0; x < TS; x++) { const d = 3 + (rnd() < 0.5 ? 1 : 0); for (let y = 0; y < d; y++) px(x, y, 240, 248, 252); } });
  tile(T.COAL, () => ore([30, 30, 30]));
  tile(T.IRON, () => ore([214, 172, 140]));
  tile(T.GOLD, () => ore([252, 222, 60]));
  tile(T.DIAMOND, () => ore([95, 235, 225]));
  tile(T.BEDROCK, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const r = rnd(); const v = r < 0.33 ? 40 : r < 0.66 ? 85 : 130; px(x, y, v, v, v); } });
  tile(T.CACTUS_SIDE, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { let f = (x % 4 === 1) ? 0.75 : 1; f *= 1 + (rnd() - 0.5) * 0.12; px(x, y, 78 * f, 140 * f, 52 * f); } for (let i = 0; i < 10; i++) px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 20, 20, 20); });
  tile(T.CACTUS_TOP, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); const f = (d > 6.5 ? 0.75 : d > 4 ? 1 : 1.12) * (1 + (rnd() - 0.5) * 0.1); px(x, y, 82 * f, 145 * f, 56 * f); } });
  tile(T.SANDSTONE_SIDE, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const band = y < 3 ? 1.05 : y === 3 || y === 11 ? 0.82 : 0.95; const f = band * (1 + (rnd() - 0.5) * 0.06); px(x, y, 216 * f, 200 * f, 150 * f); } });
  tile(T.SANDSTONE_TOP, () => { noisy([218, 204, 154], 0.06); });
  tile(T.GRAVEL, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const r = rnd(); const v = r < 0.3 ? 95 : r < 0.6 ? 130 : r < 0.85 ? 150 : 175; px(x, y, v + 6, v, v - 6); } });
  tile(T.SPRUCE_LOG, () => { for (let x = 0; x < TS; x++) { const base = (x % 3 === 0) ? 0.72 : 1; for (let y = 0; y < TS; y++) { const f = base * (1 + (rnd() - 0.5) * 0.2); px(x, y, 72 * f, 52 * f, 32 * f); } } });
  tile(T.SPRUCE_TOP, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); const f = 1 + (rnd() - 0.5) * 0.1; if (d > 6.5) px(x, y, 72 * f, 52 * f, 32 * f); else { const ring = Math.floor(d) % 2 ? 0.85 : 1; px(x, y, 150 * ring * f, 112 * ring * f, 70 * ring * f); } } });
  tile(T.TALLGRASS, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(x, y, 0, 0, 0, 0); for (let b = 0; b < 9; b++) { let x = 1 + Math.floor(rnd() * 14); const h = 6 + Math.floor(rnd() * 9); for (let k = 0; k < h; k++) { const f = 0.7 + k / h * 0.5; px(x, 15 - k, 80 * f, 150 * f, 48 * f); if (rnd() < 0.15) x += rnd() < 0.5 ? -1 : 1; } } });
  const flower = (c) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(x, y, 0, 0, 0, 0); for (let y = 7; y < 16; y++) px(7, y, 60, 130, 40); px(8, 11, 60, 130, 40); px(6, 13, 60, 130, 40); px(9, 10, 70, 140, 45); for (let y = 3; y < 8; y++) for (let x = 5; x < 10; x++) { if ((x === 5 || x === 9) && (y === 3 || y === 7)) continue; const f = 0.8 + rnd() * 0.3; px(x, y, c[0] * f, c[1] * f, c[2] * f); } px(7, 5, 255, 230, 80); };
  tile(T.ROSE, () => flower([210, 30, 40]));
  tile(T.DANDELION, () => flower([250, 215, 40]));
  tile(T.ICE, () => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const f = 1 + (rnd() - 0.5) * 0.05 + (x + y) * 0.004; px(x, y, 168 * f, 204 * f, 250 * f); }
    for (let i = 0; i < 3; i++) { let x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16); for (let k = 0; k < 9; k++) { px(x, y, 235, 246, 255); if (rnd() < 0.5) x += rnd() < 0.5 ? 1 : -1; else y += 1; } }
    for (let i = 0; i < 4; i++) px(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 250, 252, 255);
  });

  // ---- Titan Siege tiles ----
  const bricks = (base, mortar, rows, mossy) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const row = Math.floor(y / 4); const off = row % 2 ? 4 : 0; const m = y % 4 === 3 || (x + off) % 8 === 7; let f = 1 + (rnd() - 0.5) * 0.16; let c = m ? mortar : base; if (!m && ((x + off) % 8 === 0 || y % 4 === 0)) f *= 1.08; if (mossy && rnd() < (y > 9 ? 0.45 : 0.18)) c = [76, 112, 52]; px(x, y, c[0] * f, c[1] * f, c[2] * f); } };
  tile(T.STONEBRICK, () => bricks([132, 132, 138], [92, 92, 98], 4, false));
  tile(T.MOSSY, () => bricks([126, 128, 124], [86, 90, 84], 4, true));
  tile(T.PLASTER, () => { noisy([226, 216, 192], 0.07); specks([205, 192, 165], 14, 0.06); specks([240, 232, 214], 8, 0.04); });
  tile(T.TIMBER, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const g = (y * 3 + Math.floor(x / 5)) % 7 === 0 ? 0.78 : 1; const f = g * (1 + (rnd() - 0.5) * 0.14); const e = (x === 0 || x === 15 || y === 0 || y === 15) ? 0.75 : 1; px(x, y, 84 * f * e, 56 * f * e, 36 * f * e); } });
  const roof = (c) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const row = Math.floor(y / 4), off = row % 2 ? 2 : 0; const edge = y % 4 === 3; const sc = (x + off) % 4 === 0; let f = (edge ? 0.62 : sc ? 0.82 : 1) * (1 + (rnd() - 0.5) * 0.12); if (y % 4 === 0) f *= 1.12; px(x, y, c[0] * f, c[1] * f, c[2] * f); } };
  tile(T.ROOF_RED, () => roof([176, 74, 52]));
  tile(T.ROOF_SLATE, () => roof([76, 92, 122]));
  const canopy = (c) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const r = rnd(); const f = r < 0.12 ? 0.6 : r < 0.3 ? 0.8 : r > 0.92 ? 1.25 : 1; px(x, y, c[0] * f, c[1] * f, c[2] * f); } for (let i = 0; i < 6; i++) { const x = Math.floor(rnd() * 15), y = Math.floor(rnd() * 15); px(x, y, c[0] * 1.35, c[1] * 1.3, c[2] * 1.2); px(x + 1, y, c[0] * 1.2, c[1] * 1.2, c[2] * 1.1); } };
  tile(T.CANOPY, () => canopy([52, 112, 44]));
  tile(T.CANOPY_LIGHT, () => canopy([78, 138, 52]));
  tile(T.BARK, () => { for (let x = 0; x < TS; x++) { const base = (x % 5 === 0) ? 0.7 : (x % 5 === 2 ? 1.1 : 1); for (let y = 0; y < TS; y++) { const f = base * (1 + (rnd() - 0.5) * 0.24) * ((y + x * 3) % 9 === 0 ? 0.8 : 1); px(x, y, 98 * f, 72 * f, 50 * f); } } });
  tile(T.BARK_TOP, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = Math.hypot(x - 7.5, y - 7.5); const ring = Math.floor(d * 1.3) % 2 ? 0.86 : 1; const f = ring * (1 + (rnd() - 0.5) * 0.1); px(x, y, 170 * f, 132 * f, 86 * f); } });
  tile(T.PATH, () => {
    const pts = []; for (let i = 0; i < 9; i++) pts.push([rnd() * 16, rnd() * 16, 0.8 + rnd() * 0.35]);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (const p of pts) for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) { const d = (x - p[0] - ox) ** 2 + (y - p[1] - oy) ** 2; if (d < d1) { d2 = d1; d1 = d; best = p[2]; } else if (d < d2) d2 = d; }
      const edge = Math.sqrt(d2) - Math.sqrt(d1) < 1.2; const f = (edge ? 0.62 : best) * (1 + (rnd() - 0.5) * 0.1);
      px(x, y, 150 * f, 140 * f, 124 * f);
    }
  });
  tile(T.BANNER, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const f = 1 + (rnd() - 0.5) * 0.08; const fold = x % 4 === 0 ? 0.85 : 1; px(x, y, 34 * f * fold, 104 * f * fold, 58 * f * fold); }
    // white tree emblem
    for (let y = 4; y < 14; y++) px(7, y, 236, 232, 210); for (let y = 4; y < 14; y++) px(8, y, 236, 232, 210);
    [[5, 5], [10, 5], [4, 7], [11, 7], [5, 9], [10, 9], [6, 4], [9, 4], [6, 6], [9, 6], [6, 8], [9, 8], [7, 2], [8, 2], [7, 3], [8, 3], [6, 13], [9, 13]].forEach(([x, y]) => px(x, y, 236, 232, 210));
    for (let x = 0; x < TS; x++) { px(x, 0, 200, 170, 60); px(x, 15, 200, 170, 60); } });
  tile(T.CRATE_SIDE, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const fr = x < 2 || x > 13 || y < 2 || y > 13; const diag = Math.abs(x - y) < 1.5; const f = (fr || diag ? 0.72 : 1) * (1 + (rnd() - 0.5) * 0.12); px(x, y, 176 * f, 132 * f, 74 * f); } for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) if ((x - 5) % 5 === 0 || (y - 5) % 5 === 0) px(x, y, 60, 140, 70); });
  tile(T.CRATE_TOP, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const fr = x < 2 || x > 13 || y < 2 || y > 13; const f = (fr ? 0.72 : (y % 4 === 0 ? 0.85 : 1)) * (1 + (rnd() - 0.5) * 0.12); px(x, y, 176 * f, 132 * f, 74 * f); } });
  tile(T.HAY_SIDE, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const band = y === 3 || y === 12 ? 0.6 : 1; const f = band * (1 + (rnd() - 0.5) * 0.3); px(x, y, 200 * f, 168 * f, 64 * f); } });
  tile(T.HAY_TOP, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); const f = (d > 6.5 ? 0.75 : 1) * (1 + (rnd() - 0.5) * 0.3); px(x, y, 196 * f, 160 * f, 60 * f); } });
  tile(T.IRONBARS, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const bar = x % 4 === 1 || x % 4 === 2 || y === 0 || y === 7; if (bar) { const f = (x % 4 === 1 ? 1.1 : 0.85) * (1 + (rnd() - 0.5) * 0.1); px(x, y, 80 * f, 82 * f, 88 * f); } else px(x, y, 0, 0, 0, 0); } });
  tile(T.DIRT_PATH, () => { noisy([150, 118, 76], 0.22); specks([120, 92, 60], 20); specks([176, 146, 100], 12); });
  tile(T.DIRT_PATH_SIDE, () => { dirt(); for (let x = 0; x < TS; x++) { const d = 2 + (rnd() < 0.5 ? 1 : 0); for (let y = 0; y < d; y++) px(x, y, 150, 118, 76); } });
  tile(T.WINDOW, () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const fr = x < 2 || x > 13 || y < 2 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8; const f = 1 + (rnd() - 0.5) * 0.1; if (fr) px(x, y, 92 * f, 64 * f, 40 * f); else { const gl = (x + y) % 9 < 2 ? 1.6 : 1; px(x, y, 46 * f * gl, 62 * f * gl, 84 * f * gl); } } });
  actx.putImageData(img, 0, 0);
  for (let i = 0; i < ATLAS_N * ATLAS_N; i++) {
    cur = i; let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const c = get(x, y); if (c[3] > 0) { r += c[0]; g += c[1]; b += c[2]; n++; } }
    tileAvg[i] = n ? [r / n / 255, g / n / 255, b / n / 255] : [1, 1, 1];
  }
})();
const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false;

function makeCanvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// water texture: tileable, made from summed sines so it wraps
const waterTex = makeCanvasTex(32, 32, (g) => {
  const img = g.createImageData(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const a = Math.PI * 2 / 32;
    const v = Math.sin(x * a * 2 + Math.sin(y * a * 3) * 1.5) * 0.5 + Math.sin(y * a * 2 + Math.cos(x * a) * 2) * 0.5;
    const hi = v > 0.62 ? 1 : 0;
    const f = 0.88 + v * 0.1;
    const i = (y * 32 + x) * 4;
    img.data[i] = hi ? 120 : 44 * f; img.data[i + 1] = hi ? 175 : 104 * f; img.data[i + 2] = hi ? 245 : 212 * f; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}, true);
// crack overlay: 10 frames side by side
const crackTex = makeCanvasTex(160, 16, (g) => {
  let s = 99; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const segs = [];
  for (let k = 0; k < 7; k++) { let x = 8, y = 8; const ang = r() * Math.PI * 2; for (let i = 0; i < 9; i++) { const a = ang + (r() - 0.5) * 1.6; const nx = x + Math.cos(a) * 1.4, ny = y + Math.sin(a) * 1.4; segs.push([x, y, nx, ny, i]); x = nx; y = ny; } }
  for (let f = 0; f < 10; f++) {
    const lim = (f + 1) * 0.9;
    for (const sgm of segs) {
      if (sgm[4] > lim) continue;
      const steps = 4;
      for (let t = 0; t <= steps; t++) {
        const x = Math.floor(sgm[0] + (sgm[2] - sgm[0]) * t / steps), y = Math.floor(sgm[1] + (sgm[3] - sgm[1]) * t / steps);
        if (x < 0 || y < 0 || x > 15 || y > 15) continue;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(f * 16 + x, y, 1, 1);
      }
    }
  }
});
crackTex.repeat.set(0.1, 1);

/* =========================================================================
   Renderer, scene, camera
   ========================================================================= */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 1200);
camera.rotation.order = 'YXZ';
// three.js fov is vertical, so a phone held upright would see a ~36° sliver of the world. On tall screens
// widen the vertical fov until the horizontal view is ~80% of the design angle (soft-capped near 100°).
// Every camera.fov the game sets stays the design value; only the projection uses the fitted one.
const baseProj = THREE.PerspectiveCamera.prototype.updateProjectionMatrix;
camera.updateProjectionMatrix = function () {
  const f = this.fov;
  if (this.aspect < 1) {
    const h = f * 0.8 * Math.PI / 180;
    let v = 2 * Math.atan(Math.tan(h / 2) / this.aspect) * 180 / Math.PI;
    if (v > 96) v = 96 + (v - 96) * 0.35;
    this.fov = Math.max(f, Math.min(118, v));
  }
  this.userData.fov = this.fov;
  baseProj.call(this);
  this.fov = f;
};
scene.add(camera);
scene.fog = new THREE.Fog(0x9fc8ff, 60, 100);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const matOpaque = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });
const waterUniforms = { uTime: { value: 0 } };
const matWater = new THREE.MeshBasicMaterial({ map: waterTex, vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
matWater.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = waterUniforms.uTime;
  sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
    vec3 transformed = vec3(position);
    float fy = fract(transformed.y);
    if (abs(fy - 0.875) < 0.01) {
      vec4 wp = modelMatrix * vec4(transformed, 1.0);
      transformed.y += sin(wp.x * 0.9 + uTime * 1.6) * 0.04 + cos(wp.z * 0.7 + uTime * 1.3) * 0.04 - 0.05;
    }`);
};

/* =========================================================================
   World storage
   ========================================================================= */
const chunks = new Map();
const edits = new Map(); // chunkKey -> Map(index -> id)
let RENDER_DIST = +(new URLSearchParams(location.search).get('rd') || 8);
export const view = { x: 0, z: 0 };
const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const bidx = (x, y, z) => (y << 8) | (z << 4) | x;

class Chunk {
  constructor(cx, cz) { this.cx = cx; this.cz = cz; this.key = ckey(cx, cz); this.blocks = null; this.biomes = null; this.hmap = null; this.maxY = 0; this.mesh = null; this.water = null; this.dirty = false; }
}
function getChunk(cx, cz) { return chunks.get(ckey(cx, cz)); }
function getBlock(x, y, z) {
  if (y < 0) return B.BEDROCK; if (y >= CH) return B.AIR;
  const c = chunks.get(ckey(x >> 4, z >> 4));
  if (!c || !c.blocks) return B.AIR;
  return c.blocks[bidx(x & 15, y, z & 15)];
}
function chunkReady(x, z) { const c = chunks.get(ckey(x >> 4, z >> 4)); return !!(c && c.blocks); }
function computeHmapColumn(c, x, z) {
  let y = Math.min(CH - 1, c.maxY);
  while (y >= 0 && !LIGHTBLOCK[c.blocks[bidx(x, y, z)]]) y--;
  c.hmap[z * 16 + x] = y;
}
function computeHmap(c) { c.hmap = new Int16Array(256); for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) computeHmapColumn(c, x, z); }
function surfaceY(x, z) { for (let y = CH - 1; y >= 0; y--) { const id = getBlock(x, y, z); if (SOLID[id] || id === B.WATER) return y; } return 0; }

// network / remote edits: recorded even when the chunk isn't loaded yet, applied on generation
function queueEdit(x, y, z, id) {
  if (y < 0 || y >= CH) return;
  const c = getChunk(x >> 4, z >> 4);
  if (c && c.blocks) { setBlock(x, y, z, id, true); return; }
  const k = ckey(x >> 4, z >> 4), i = bidx(x & 15, y, z & 15);
  let m = edits.get(k); if (!m) { m = new Map(); edits.set(k, m); }
  m.set(i, id);
}
// pinned region (multiplayer host): chunk data stays loaded in a square of radius pinR chunks around the origin
let pinR = 0, pinList = [];
function setPinned(r) {
  pinR = r; pinList = [];
  for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) pinList.push({ x, z, d: Math.hypot(x, z) });
  pinList.sort((a, b) => a.d - b.d);
}
const isPinned = (c) => pinR > 0 && Math.abs(c.cx) <= pinR && Math.abs(c.cz) <= pinR;
function pinnedProgress() { if (!pinR) return 1; let n = 0; for (const o of pinList) { const c = getChunk(o.x, o.z); if (c && c.blocks) n++; } return n / pinList.length; }
function setBlock(x, y, z, id, quiet) {
  if (y < 0 || y >= CH) return;
  const cx = x >> 4, cz = z >> 4, c = getChunk(cx, cz);
  if (!c || !c.blocks) return;
  const lx = x & 15, lz = z & 15, i = bidx(lx, y, lz);
  c.blocks[i] = id;
  let m = edits.get(c.key); if (!m) { m = new Map(); edits.set(c.key, m); }
  m.set(i, id);
  if (id && y > c.maxY) c.maxY = y;
  computeHmapColumn(c, lx, lz);
  c.dirty = true;
  const nx = lx === 0 ? -1 : lx === 15 ? 1 : 0, nz = lz === 0 ? -1 : lz === 15 ? 1 : 0;
  const mark = (a, b) => { const n = getChunk(cx + a, cz + b); if (n) n.dirty = true; };
  if (nx) mark(nx, 0); if (nz) mark(0, nz); if (nx && nz) mark(nx, nz);
  if (quiet) return;
  // rebuild immediately for responsiveness
  for (const k of [[0, 0], [nx, 0], [0, nz], [nx, nz]]) { const n = getChunk(cx + k[0], cz + k[1]); if (n && n.dirty && neighborsReady(n)) buildChunkMesh(n); }
}

/* ---- generation (Web Workers, fallback to main thread) ---- */
let seedStr = '', genId = 0;
let workers = [], pendingGen = 0;
const genQueue = [];
function setupWorkers() {
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker('gen.js');
      w.busy = 0;
      w.onmessage = (e) => { w.busy--; pendingGen--; onChunkData(e.data); };
      w.onerror = (e) => {
        console.warn('worker error, generating on main thread', e.message);
        workers = []; pendingGen = 0;
        for (const c of chunks.values()) if (!c.blocks) genQueue.push(c);
      };
      workers.push(w);
    }
  } catch (e) { workers = []; }
}
function startWorld(seed) {
  seedStr = seed;
  genId++;
  for (const c of chunks.values()) disposeChunkMeshes(c);
  chunks.clear(); edits.clear();
  const s = /^-?\d+$/.test(seed) ? (parseInt(seed, 10) >>> 0) : hashString(seed);
  initGen(s);
  for (const w of workers) w.postMessage({ type: 'init', seed: s });
  pendingGen = 0; for (const w of workers) w.busy = 0;
  buildClouds(true);
}
function requestGen(c) {
  if (workers.length) {
    let best = workers[0]; for (const w of workers) if (w.busy < best.busy) best = w;
    best.busy++; pendingGen++;
    best.postMessage({ type: 'gen', gid: genId, cx: c.cx, cz: c.cz });
  } else genQueue.push(c);
}
function onChunkData(d) {
  if (d.gid !== genId) return;
  const c = getChunk(d.cx, d.cz);
  if (!c || c.blocks) return;
  c.blocks = d.blocks; c.biomes = d.biomes; c.maxY = d.maxY;
  const m = edits.get(c.key);
  if (m) for (const [i, id] of m) { c.blocks[i] = id; if (id) c.maxY = Math.max(c.maxY, i >> 8); }
  computeHmap(c);
  c.dirty = true;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = getChunk(c.cx + dx, c.cz + dz); if (n && n.mesh) n.dirty = true; }
}
function neighborsReady(c) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = getChunk(c.cx + dx, c.cz + dz); if (!n || !n.blocks) return false; }
  return true;
}

/* =========================================================================
   Chunk meshing: one opaque mesh + one water mesh per chunk, hidden faces culled,
   per-vertex ambient occlusion and heightmap sky light.
   ========================================================================= */
const P = 18, PP = P * P;
const FACES = [
  { n: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]], shade: 0.62 },
  { n: [1, 0, 0], c: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]], shade: 0.62 },
  { n: [0, -1, 0], c: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], uv: [[1, 0], [0, 0], [1, 1], [0, 1]], shade: 0.5 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], uv: [[1, 1], [0, 1], [1, 0], [0, 0]], shade: 1.0 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]], shade: 0.8 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]], shade: 0.8 },
];
const pd = (dx, dy, dz) => dx + dz * P + dy * PP;
for (const f of FACES) {
  f.nOff = pd(f.n[0], f.n[1], f.n[2]);
  f.ao = f.c.map(c => {
    const t = [0, 1, 2].filter(a => f.n[a] === 0);
    const d1 = [0, 0, 0], d2 = [0, 0, 0];
    d1[t[0]] = c[t[0]] ? 1 : -1; d2[t[1]] = c[t[1]] ? 1 : -1;
    const s1 = pd(f.n[0] + d1[0], f.n[1] + d1[1], f.n[2] + d1[2]);
    const s2 = pd(f.n[0] + d2[0], f.n[1] + d2[1], f.n[2] + d2[2]);
    const cc = pd(f.n[0] + d1[0] + d2[0], f.n[1] + d1[1] + d2[1], f.n[2] + d1[2] + d2[2]);
    return [s1, s2, cc];
  });
}
const AO_CURVE = [0.45, 0.62, 0.8, 1.0];

class GeoBuilder {
  constructor() { this.cap = 0; this.grow(8192); }
  grow(nq) {
    const cap = Math.max(nq, this.cap * 2);
    const np = new Float32Array(cap * 12), nu = new Float32Array(cap * 8), nc = new Float32Array(cap * 12);
    if (this.pos) { np.set(this.pos); nu.set(this.uv); nc.set(this.col); }
    this.pos = np; this.uv = nu; this.col = nc; this.cap = cap;
    this.idx = new Uint32Array(cap * 6);
  }
  reset() { this.q = 0; }
  toGeometry() {
    if (!this.q) return null;
    const n = this.q, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 12), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 8), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 12), 3));
    const idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4, o = q * 6;
      if (this.flip[q]) { idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 3; idx[o + 3] = v; idx[o + 4] = v + 3; idx[o + 5] = v + 2; }
      else { idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v + 2; idx[o + 4] = v + 1; idx[o + 5] = v + 3; }
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
GeoBuilder.prototype.flip = null;
const gbO = new GeoBuilder(), gbW = new GeoBuilder();
gbO.flip = new Uint8Array(1 << 20); gbW.flip = new Uint8Array(1 << 20);

const pad = new Uint8Array(PP * CH);
const padL = new Float32Array(PP * (CH + 1));
const EPS = 0.0004, TU = 1 / ATLAS_N;

function buildChunkMesh(c) {
  c.dirty = false;
  let maxY = 0;
  // fill padded block array with this chunk and a 1-block border from the 8 neighbours
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = getChunk(c.cx + dx, c.cz + dz); maxY = Math.max(maxY, n.maxY);
  }
  const ymax = Math.min(CH - 1, maxY + 1);
  pad.fill(0, 0, PP * (ymax + 2 > CH ? CH : ymax + 2));
  const hm = new Int16Array(PP);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = getChunk(c.cx + dx, c.cz + dz), nb = n.blocks;
    const x0 = dx < 0 ? 15 : 0, x1 = dx > 0 ? 0 : 15, z0 = dz < 0 ? 15 : 0, z1 = dz > 0 ? 0 : 15;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = x + dx * 16 + 1, pz = z + dz * 16 + 1;
      hm[pz * P + px] = n.hmap[z * 16 + x];
      let pi = pz * P + px, bi = (z << 4) | x;
      for (let y = 0; y <= ymax; y++, pi += PP, bi += 256) pad[pi] = nb[bi];
    }
  }
  // sky light per padded cell: full above the column heightmap, fading below it
  for (let i = 0; i < PP; i++) {
    const h = hm[i];
    for (let y = 0; y <= ymax + 1; y++) {
      const d = h - y;
      padL[y * PP + i] = d < 0 ? 1 : Math.max(0.46, 0.9 - d * 0.03);
    }
  }
  gbO.reset(); gbW.reset();
  const ox = c.cx * 16, oz = c.cz * 16;
  for (let y = 0; y <= ymax; y++) {
    if (y >= CH) break;
    for (let z = 0; z < 16; z++) {
      let pi = (y * P + z + 1) * P + 1;
      for (let x = 0; x < 16; x++, pi++) {
        const id = pad[pi];
        if (!id) continue;
        if (id === B.WATER) { waterBlock(pi, x, y, z, ox, oz); continue; }
        if (CROSS[id]) { crossBlock(id, pi, x, y, z); continue; }
        for (let f = 0; f < 6; f++) {
          const F = FACES[f], ni = pi + F.nOff;
          const nid = (y === 0 && f === 2) ? B.STONE : (y === CH - 1 && f === 3) ? B.AIR : pad[ni];
          if (OPAQUE[nid]) continue;
          if (nid === id && (id === B.GLASS || id === B.ICE || id === B.IRONBARS)) continue;
          if (gbO.q >= gbO.cap) gbO.grow(gbO.cap * 2);
          const q = gbO.q++, P3 = q * 12, U2 = q * 8;
          const tile = TILE_FACE[id * 6 + f];
          const u0 = (tile % ATLAS_N) * TU, v0 = 1 - (Math.floor(tile / ATLAS_N) + 1) * TU;
          const aoV = [0, 0, 0, 0];
          for (let k = 0; k < 4; k++) {
            const cc = F.c[k];
            gbO.pos[P3 + k * 3] = x + cc[0]; gbO.pos[P3 + k * 3 + 1] = y + cc[1]; gbO.pos[P3 + k * 3 + 2] = z + cc[2];
            gbO.uv[U2 + k * 2] = u0 + (F.uv[k][0] ? TU - EPS : EPS);
            gbO.uv[U2 + k * 2 + 1] = v0 + (F.uv[k][1] ? TU - EPS : EPS);
            const a = F.ao[k];
            const s1 = AOCC[pad[pi + a[0]]], s2 = AOCC[pad[pi + a[1]]], co = AOCC[pad[pi + a[2]]];
            const ao = (s1 && s2) ? 0 : 3 - s1 - s2 - co;
            aoV[k] = ao;
            // smooth light: average sky light of the non-occluded cells around the vertex
            let L = padL[ni], n = 1;
            if (!s1) { L += padL[pi + a[0]]; n++; }
            if (!s2) { L += padL[pi + a[1]]; n++; }
            if (!co && !(s1 && s2)) { L += padL[pi + a[2]]; n++; }
            const br = F.shade * AO_CURVE[ao] * (L / n);
            gbO.col[P3 + k * 3] = br; gbO.col[P3 + k * 3 + 1] = br; gbO.col[P3 + k * 3 + 2] = br;
          }
          gbO.flip[q] = (aoV[0] + aoV[3] > aoV[1] + aoV[2]) ? 1 : 0;
        }
      }
    }
  }
  const go = gbO.toGeometry(), gw = gbW.toGeometry();
  disposeChunkMeshes(c);
  if (go) { c.mesh = new THREE.Mesh(go, matOpaque); placeMesh(c.mesh, c); }
  if (gw) { c.water = new THREE.Mesh(gw, matWater); c.water.renderOrder = 2; placeMesh(c.water, c); }
}
function placeMesh(m, c) { m.position.set(c.cx * 16, 0, c.cz * 16); m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); }
function disposeChunkMeshes(c) {
  if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
  if (c.water) { scene.remove(c.water); c.water.geometry.dispose(); c.water = null; }
}
const CROSS_Q = [
  [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.15, 1, 0.15], [0.85, 1, 0.85]],
  [[0.85, 0, 0.85], [0.15, 0, 0.15], [0.85, 1, 0.85], [0.15, 1, 0.15]],
  [[0.15, 0, 0.85], [0.85, 0, 0.15], [0.15, 1, 0.85], [0.85, 1, 0.15]],
  [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.85, 1, 0.15], [0.15, 1, 0.85]],
];
function crossBlock(id, pi, x, y, z) {
  const tile = TILE_FACE[id * 6], u0 = (tile % ATLAS_N) * TU, v0 = 1 - (Math.floor(tile / ATLAS_N) + 1) * TU;
  const br = padL[pi] * 0.95;
  for (const quad of CROSS_Q) {
    if (gbO.q >= gbO.cap) gbO.grow(gbO.cap * 2);
    const q = gbO.q++, P3 = q * 12, U2 = q * 8;
    for (let k = 0; k < 4; k++) {
      gbO.pos[P3 + k * 3] = x + quad[k][0]; gbO.pos[P3 + k * 3 + 1] = y + quad[k][1]; gbO.pos[P3 + k * 3 + 2] = z + quad[k][2];
      gbO.uv[U2 + k * 2] = u0 + ((k & 1) ? TU - EPS : EPS); gbO.uv[U2 + k * 2 + 1] = v0 + ((k & 2) ? TU - EPS : EPS);
      const b = br * (k & 2 ? 1 : 0.8);
      gbO.col[P3 + k * 3] = b; gbO.col[P3 + k * 3 + 1] = b; gbO.col[P3 + k * 3 + 2] = b;
    }
    gbO.flip[q] = 0;
  }
}
function waterBlock(pi, x, y, z, ox, oz) {
  const above = pad[pi + PP];
  const hgt = above === B.WATER ? 1 : 0.875;
  for (let f = 0; f < 6; f++) {
    const F = FACES[f], nid = pad[pi + F.nOff];
    if (nid === B.WATER) continue;
    if (f === 3) { if (above === B.WATER) continue; }
    else if (OPAQUE[nid] || (f === 2 && y === 0)) continue;
    if (gbW.q >= gbW.cap) gbW.grow(gbW.cap * 2);
    const q = gbW.q++, P3 = q * 12, U2 = q * 8;
    const L = padL[pi + F.nOff] * (f === 3 ? 1 : 0.8);
    for (let k = 0; k < 4; k++) {
      const cc = F.c[k];
      const vx = x + cc[0], vy = y + (cc[1] ? hgt : 0), vz = z + cc[2];
      gbW.pos[P3 + k * 3] = vx; gbW.pos[P3 + k * 3 + 1] = vy; gbW.pos[P3 + k * 3 + 2] = vz;
      const wu = F.n[0] ? vz + oz : vx + ox, wv = F.n[1] ? vz + oz : vy;
      gbW.uv[U2 + k * 2] = wu * 0.5; gbW.uv[U2 + k * 2 + 1] = wv * 0.5;
      gbW.col[P3 + k * 3] = L; gbW.col[P3 + k * 3 + 1] = L; gbW.col[P3 + k * 3 + 2] = L;
    }
    gbW.flip[q] = 0;
  }
}

/* ---- chunk streaming ---- */
let offsets = [];
function buildOffsets() {
  offsets = [];
  const R = RENDER_DIST + 2;
  for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) { const d = Math.hypot(x, z); if (d <= RENDER_DIST + 1.5) offsets.push({ x, z, d }); }
  offsets.sort((a, b) => a.d - b.d);
}
buildOffsets();
let unloadTimer = 0;
function updateChunks(budgetMs) {
  const t0 = performance.now();
  const pcx = Math.floor(view.x / 16), pcz = Math.floor(view.z / 16);
  const maxPending = workers.length * 3;
  for (const o of offsets) {
    if (workers.length && pendingGen >= maxPending) break;
    const k = ckey(pcx + o.x, pcz + o.z);
    if (!chunks.has(k)) { const c = new Chunk(pcx + o.x, pcz + o.z); chunks.set(k, c); requestGen(c); }
  }
  if (pinR) for (const o of pinList) {
    if (workers.length && pendingGen >= maxPending) break;
    const k = ckey(o.x, o.z);
    if (!chunks.has(k)) { const c = new Chunk(o.x, o.z); chunks.set(k, c); requestGen(c); }
  }
  // main-thread fallback generation
  while (genQueue.length && performance.now() - t0 < budgetMs * 0.5) {
    const c = genQueue.shift();
    if (chunks.get(c.key) !== c || c.blocks) continue;
    const r = generateChunk(c.cx, c.cz);
    onChunkData({ gid: genId, cx: c.cx, cz: c.cz, blocks: r.blocks, biomes: r.biomes, maxY: r.maxY });
  }
  for (const o of offsets) {
    if (o.d > RENDER_DIST) break;
    const c = getChunk(pcx + o.x, pcz + o.z);
    if (c && c.blocks && c.dirty && neighborsReady(c)) {
      buildChunkMesh(c);
      if (performance.now() - t0 > budgetMs) break;
    }
  }
  if (++unloadTimer > 30) {
    unloadTimer = 0;
    for (const [k, c] of chunks) {
      const d = Math.hypot(c.cx - pcx, c.cz - pcz);
      if (d > RENDER_DIST + 3.5) { disposeChunkMeshes(c); if (!isPinned(c)) chunks.delete(k); else c.dirty = true; }
      else if (d > RENDER_DIST + 1.5 && c.mesh) { disposeChunkMeshes(c); c.dirty = true; }
    }
  }
}

/* =========================================================================
   Sky: gradient dome, sun, moon, stars, clouds
   ========================================================================= */
const DAY_LEN = 600; // seconds for a full day
let dayTime = 0.03;
const sunDir = new THREE.Vector3();
const skyUniforms = {
  topColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() },
  sunsetColor: { value: new THREE.Color(1.0, 0.45, 0.2) }, sunDir: { value: sunDir }, sunsetAmt: { value: 0 }
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 topColor, horizonColor, sunsetColor, sunDir; uniform float sunsetAmt; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(horizonColor, topColor, smoothstep(-0.02, 0.45, h));
      float sd = max(dot(d, sunDir), 0.0);
      col = mix(col, sunsetColor, sunsetAmt * (0.25 + 0.75 * pow(sd, 4.0)) * (1.0 - smoothstep(0.0, 0.5, abs(h))));
      col += vec3(1.0, 0.9, 0.7) * pow(sd, 120.0) * 0.6 * (1.0 - sunsetAmt * 0.5);
      if (h < 0.0) col = mix(col, horizonColor * 0.75, smoothstep(0.0, -0.4, h));
      gl_FragColor = vec4(col, 1.0);
    }`
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

const sunTex = makeCanvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,180,0.9)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fffbe0'; g.fillRect(18, 18, 28, 28); g.fillStyle = '#fff3a0'; g.fillRect(22, 22, 20, 20);
});
const moonTex = makeCanvasTex(64, 64, (g) => {
  g.fillStyle = '#e4e8f0'; g.fillRect(20, 20, 24, 24); g.fillStyle = '#b8bfcc';
  [[24, 24, 5, 4], [34, 28, 6, 6], [26, 36, 4, 4], [38, 38, 3, 3]].forEach(r => g.fillRect(...r));
});
sunTex.minFilter = moonTex.minFilter = THREE.LinearFilter;
const sun = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
const moon = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false, depthWrite: false }));
sun.renderOrder = moon.renderOrder = -8; sun.frustumCulled = moon.frustumCulled = false;
scene.add(sun, moon);
const starGeo = new THREE.BufferGeometry();
{
  const n = 1600, p = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    p[i * 3] = r * Math.cos(a) * 800; p[i * 3 + 1] = u * 800; p[i * 3 + 2] = r * Math.sin(a) * 800;
    const b = 0.5 + Math.random() * 0.5; col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b * (0.9 + Math.random() * 0.2);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, fog: false, depthWrite: false }));
stars.renderOrder = -9; stars.frustumCulled = false; scene.add(stars);

// clouds: flat-shaded voxel layer that drifts and re-centres on the player
const CLOUD_Y = 136, CLOUD_CELL = 12, CLOUD_N = 44;
const cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, fog: false, depthWrite: false });
const cloudNoise = new Simplex(mulberry32(4242));
let cloudMesh = null, cloudCx = 1e9, cloudCz = 1e9, cloudDrift = 0;
function buildClouds(force) {
  const ci = Math.floor((view.x - cloudDrift) / CLOUD_CELL), cj = Math.floor(view.z / CLOUD_CELL);
  if (!force && ci === cloudCx && cj === cloudCz) return;
  cloudCx = ci; cloudCz = cj;
  const H = CLOUD_N / 2, has = (i, j) => (cloudNoise.noise2(i * 0.11, j * 0.11) * 0.7 + cloudNoise.noise2(i * 0.31, j * 0.31) * 0.3) > 0.18;
  const pos = [], col = [], idx = [];
  const quad = (v, shade, alpha) => { const b = pos.length / 3; for (const p of v) { pos.push(...p); col.push(shade, shade, shade, alpha); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  const th = 4;
  for (let j = cj - H; j < cj + H; j++) for (let i = ci - H; i < ci + H; i++) {
    if (!has(i, j)) continue;
    const dist = Math.hypot(i - ci, j - cj) / H; if (dist > 1) continue;
    const a = 1 - Math.max(0, (dist - 0.55) / 0.45);
    const x0 = i * CLOUD_CELL, x1 = x0 + CLOUD_CELL, z0 = j * CLOUD_CELL, z1 = z0 + CLOUD_CELL, y0 = 0, y1 = th;
    quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 1.0, a);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.72, a);
    if (!has(i - 1, j)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.86, a);
    if (!has(i + 1, j)) quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 0.86, a);
    if (!has(i, j - 1)) quad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], 0.8, a);
    if (!has(i, j + 1)) quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0.8, a);
  }
  if (cloudMesh) { scene.remove(cloudMesh); cloudMesh.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  cloudMesh = new THREE.Mesh(g, cloudMat); cloudMesh.frustumCulled = false; cloudMesh.renderOrder = 1;
  cloudMesh.material.side = THREE.DoubleSide;
  scene.add(cloudMesh);
}

const C_DAY_TOP = new THREE.Color(0.36, 0.58, 0.98), C_DAY_HOR = new THREE.Color(0.68, 0.82, 1.0);
const C_NIGHT_TOP = new THREE.Color(0.008, 0.012, 0.04), C_NIGHT_HOR = new THREE.Color(0.03, 0.04, 0.09);
const C_SUNSET = new THREE.Color(1.0, 0.5, 0.25);
const C_MOON = new THREE.Color(0.17, 0.2, 0.3), C_WHITE = new THREE.Color(1, 1, 1), C_SUNLIGHT = new THREE.Color(1, 0.8, 0.6);
const C_NIGHT_CLOUD = new THREE.Color(0.07, 0.08, 0.12);
const fogCol = new THREE.Color(), lightCol = new THREE.Color(1, 1, 1);
let daylight = 1, dayF = 1, sunsetF = 0, fastTime = false, timeFlow = 0.15;
const smooth = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
function updateSky(dt) {
  dayTime = (dayTime + dt * (fastTime ? 40 : timeFlow) / DAY_LEN) % 1;
  const ang = dayTime * Math.PI * 2;
  sunDir.set(Math.cos(ang), Math.sin(ang), 0.18).normalize();
  const s = sunDir.y;
  dayF = smooth(-0.18, 0.22, s);
  sunsetF = 1 - smooth(0.0, 0.3, Math.abs(s + 0.04));
  daylight = 0.2 + 0.8 * dayF;
  skyUniforms.topColor.value.copy(C_NIGHT_TOP).lerp(C_DAY_TOP, dayF);
  skyUniforms.horizonColor.value.copy(C_NIGHT_HOR).lerp(C_DAY_HOR, dayF);
  skyUniforms.sunsetAmt.value = sunsetF * 0.85;
  fogCol.copy(skyUniforms.horizonColor.value).lerp(C_SUNSET, sunsetF * 0.35);
  const cp = camera.position;
  sky.position.copy(cp); stars.position.copy(cp);
  sun.position.copy(cp).addScaledVector(sunDir, 700); sun.lookAt(cp);
  moon.position.copy(cp).addScaledVector(sunDir, -700); moon.lookAt(cp);
  stars.rotation.set(0.3, 0, ang);
  stars.material.opacity = Math.max(0, 1 - dayF * 1.4);
  stars.visible = stars.material.opacity > 0.01;
  lightCol.copy(C_MOON).lerp(C_WHITE, dayF).lerp(C_SUNLIGHT, sunsetF * 0.35);
  matOpaque.color.copy(lightCol);
  matWater.color.copy(lightCol).multiplyScalar(0.8).addScalar(0.12);
  cloudMat.color.copy(C_NIGHT_CLOUD).lerp(C_WHITE, dayF).lerp(C_SUNSET, sunsetF * 0.4);
  // clouds
  cloudDrift += dt * 1.6;
  buildClouds(false);
  if (cloudMesh) cloudMesh.position.set(cloudDrift, CLOUD_Y, 0);
}


/* ---- raycast (voxel DDA) ---- */
function raycast(o, d, maxD) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = d.x ? (d.x > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
  let ty = d.y ? (d.y > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
  let tz = d.z ? (d.z > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  while (t <= maxD) {
    const id = getBlock(x, y, z);
    if (id && id !== B.WATER) return { x, y, z, id, nx, ny, nz };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}



/* =========================================================================
   Exports
   ========================================================================= */
export function setDayTime(t, flow) { dayTime = t; if (flow !== undefined) timeFlow = flow; }
export function getDayTime() { return dayTime; }
export function setFastTime(v) { fastTime = v; }
export function setRenderDist(r) { RENDER_DIST = Math.max(3, Math.min(12, r)); buildOffsets(); }
export function getRenderDist() { return RENDER_DIST; }
export function getLight() { return { daylight, dayF, sunsetF }; }
export function meshedAround(r) {
  let ready = 0, total = 0; const pcx = Math.floor(view.x) >> 4, pcz = Math.floor(view.z) >> 4;
  for (const o of offsets) { if (o.d > r) break; total++; const ch = getChunk(pcx + o.x, pcz + o.z); if (ch && ch.mesh) ready++; }
  return total ? ready / total : 1;
}
export function countMeshed() { let m = 0; for (const ch of chunks.values()) if (ch.mesh || ch.water) m++; return m; }
export {
  THREE, B, BLOCKS, HOTBAR, OPAQUE, SOLID, CROSS, TILE_FACE, ATLAS_N, TS, atlasCanvas, tileAvg, atlasTex, makeCanvasTex,
  renderer, scene, camera, matOpaque, matWater, waterUniforms, waterTex, crackTex, chunks, getChunk, getBlock, setBlock, chunkReady,
  setupWorkers, startWorld, updateChunks, queueEdit, setPinned, pinnedProgress, buildChunkMesh, updateSky, sky, sun, moon, stars, fogCol, lightCol, skyUniforms, sunDir,
  raycast, surfaceY, ckey, smooth
};

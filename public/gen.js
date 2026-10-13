/* =====================================================================
   WALL MARIA: RECLAMATION — Procedural Voxel World Generator
   Custom Curved Semicircular Bastion Geometry & Voxel Engine.
   Shared by the main thread and Web Workers.
   ===================================================================== */
var CS = 16, CH = 128, SEA = 40;
var B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, PLANKS: 8, COBBLE: 9,
  GLASS: 10, BRICK: 11, SNOW: 12, COAL: 13, IRON: 14, GOLD: 15, DIAMOND: 16, BEDROCK: 17, CACTUS: 18,
  SANDSTONE: 19, GRAVEL: 20, SPRUCE_LOG: 21, SPRUCE_LEAVES: 22, TALLGRASS: 23, ROSE: 24, DANDELION: 25,
  SNOW_BLOCK: 26, ICE: 27,
  STONEBRICK: 28, PLASTER: 29, TIMBER: 30, ROOF_RED: 31, ROOF_SLATE: 32, CANOPY: 33, CANOPY_LIGHT: 34,
  BARK: 35, PATH: 36, BANNER: 37, CRATE: 38, MOSSY: 39, HAY: 40, IRONBARS: 41, DIRT_PATH: 42, WINDOW: 43
};
var BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAINS: 6, DISTRICT: 7 };
var BIOME_NAMES = ['Lake', 'Shore', 'Open Fields', 'Giant Forest', 'Desert', 'Snow', 'Mountains', 'Wall Maria — Shiganshina Sector'];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashString(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---- Simplex noise ---- */
var GRAD3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
var F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
function Simplex(rand) {
  var p = new Uint8Array(256), i;
  for (i = 0; i < 256; i++) p[i] = i;
  for (i = 255; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = p[i]; p[i] = p[j]; p[j] = t; }
  this.perm = new Uint8Array(512); this.pm = new Uint8Array(512);
  for (i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.pm[i] = (this.perm[i] % 12) * 3; }
  this.ox = rand() * 4096; this.oy = rand() * 4096; this.oz = rand() * 4096;
}
Simplex.prototype.noise2 = function (xin, yin) {
  var perm = this.perm, pm = this.pm, n0 = 0, n1 = 0, n2 = 0;
  var s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
  var t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
  var i1, j1; if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
  var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  var ii = i & 255, jj = j & 255, g;
  var t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) { g = pm[ii + perm[jj]]; t0 *= t0; n0 = t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0); }
  var t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) { g = pm[ii + i1 + perm[jj + j1]]; t1 *= t1; n1 = t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1); }
  var t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) { g = pm[ii + 1 + perm[jj + 1]]; t2 *= t2; n2 = t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2); }
  return 70 * (n0 + n1 + n2);
};
function fbm2(n, x, z, oct) {
  var a = 1, f = 1, s = 0, t = 0;
  x += n.ox; z += n.oy;
  for (var i = 0; i < oct; i++) { s += n.noise2(x * f, z * f) * a; t += a; a *= 0.5; f *= 2; }
  return s / t;
}
function hash2(x, z, s) {
  var h = (x * 374761393 + z * 668265263 + (s || 0) * 1013904223) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hash3(x, y, z, s) {
  var h = (x * 374761393 + y * 1442695040 + z * 668265263 + (s || 0) * 1013904223) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smoothstep(e0, e1, x) {
  var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* World State */
var G = {
  seed: 0,
  cont: null, det: null, moist: null, ridge: null
};
var TREE_CACHE = new Map();

function initGen(seed) {
  var s = (typeof seed === 'string') ? hashString(seed) : (seed || 1337);
  G.seed = s;
  var rng = mulberry32(s);
  G.cont = new Simplex(rng);
  G.det = new Simplex(rng);
  G.moist = new Simplex(rng);
  G.ridge = new Simplex(rng);
  TREE_CACHE.clear();
}

/* =====================================================================
   WORLD LAYOUT: WALL MARIA — SHIGANSHINA BASTION
   New Iconic Curved Horseshoe / Semicircular Bastion Geometry
   ===================================================================== */
var GROUND = 46;                 // District ground level (top block y)
var WALL_TOP = 76;               // 50-meter Colossal Wall Maria walkway (y=76)
var WALL_T = 7;                  // 7 blocks thick monolithic stone rampart
var INNER_Z = -55;               // Inner straight Wall Maria line
var CURVE_CZ = -10;              // Arc center Z for the curved outer wall
var CURVE_R = 94;                // Radius of the curved outer fortress wall
var GATE_HW = 7;                 // Smashed outer gate breach half-width
var DR = 84;                     // Wall Maria Outer Breach Boundary

// ---- SECOND CITY: WALL ROSE CITADEL (Northern Sanctuary Fortress) ----
var WALL_ROSE_Z = -105;          // Wall Rose southern fortress line
var WALL_ROSE_INNER_Z = -165;    // Wall Rose inner northern limit
var WALL_ROSE_TOP = 86;          // Highest peak of the walls (y=86)
var WALL_ROSE_HW = 110;          // Wall Rose half-width

// Bastion Towers along the curved perimeter & inner wall corners
var TOWERS = [];
(function () {
  // Corner Citadel Forts at inner wall junction (x = ±90, z = -55)
  TOWERS.push({ x: -90, z: INNER_Z, hw: 7, top: WALL_TOP + 8, roof: B.ROOF_SLATE, flat: false });
  TOWERS.push({ x: 90, z: INNER_Z, hw: 7, top: WALL_TOP + 8, roof: B.ROOF_SLATE, flat: false });
  // Inner Wall Central Gate Bastions (x = ±16, z = -55)
  TOWERS.push({ x: -16, z: INNER_Z, hw: 6, top: WALL_TOP + 4, roof: 0, flat: true });
  TOWERS.push({ x: 16, z: INNER_Z, hw: 6, top: WALL_TOP + 4, roof: 0, flat: true });

  // 6 Semicircular Bastions around the curved outer wall
  var angles = [0.38, 0.82, 1.25, 1.89, 2.32, 2.76]; // Radians in south semi-circle
  angles.forEach(function (ang) {
    var tx = Math.cos(ang) * (CURVE_R - 3.5);
    var tz = CURVE_CZ + Math.sin(ang) * (CURVE_R - 3.5);
    TOWERS.push({ x: Math.round(tx), z: Math.round(tz), hw: 5.5, top: WALL_TOP + 6, roof: B.ROOF_RED, flat: false });
  });

  // Wall Rose Soaring Bastion Towers (Northern High Citadel)
  TOWERS.push({ x: -105, z: WALL_ROSE_Z - 4, hw: 7.5, top: WALL_ROSE_TOP + 8, roof: B.ROOF_SLATE, flat: false });
  TOWERS.push({ x: 105, z: WALL_ROSE_Z - 4, hw: 7.5, top: WALL_ROSE_TOP + 8, roof: B.ROOF_SLATE, flat: false });
  TOWERS.push({ x: -20, z: WALL_ROSE_Z - 4, hw: 6.5, top: WALL_ROSE_TOP + 6, roof: 0, flat: true });
  TOWERS.push({ x: 20, z: WALL_ROSE_Z - 4, hw: 6.5, top: WALL_ROSE_TOP + 6, roof: 0, flat: true });
  TOWERS.push({ x: 0, z: WALL_ROSE_INNER_Z + 15, hw: 8.5, top: WALL_ROSE_TOP + 10, roof: B.ROOF_SLATE, flat: false }); // High Keep
})();

// Scout Training Yard in North-West district
var YARD = { x0: -75, x1: -32, z0: -48, z1: -16 };
var POLES = [
  [-62, -40, 24], [-45, -40, 22], [-62, -24, 25], [-45, -24, 20],
  [-53, -32, 30], [-36, -32, 18], [-70, -32, 22]
];

// Supply Depots across the territory
var SUPPLY = [
  { x: 0, z: -12, name: 'Grand Forum Supply Depot' },
  { x: 18, z: 80, wall: true, name: 'Outer Gate Wall Depot' },
  { x: 0, z: -140, name: 'Wall Rose Citadel Command Depot' },
  { x: -35, z: -130, name: 'Wall Rose Cavalry Stables' },
  { x: 0, z: -80, name: 'Grand Plains Frontier Depot' },
  { x: -140, z: 30, name: 'West Plains Cavalry Depot' },
  { x: 140, z: -25, name: 'East Field Scout Depot' },
  { x: -50, z: -30, name: 'Scout Regiment Yard Depot' }
];

/* ---- Wall & District Geometry Predicates ---- */
function wallDist(x, z) {
  if (z <= INNER_Z) {
    return Math.abs(z - INNER_Z);
  }
  return Math.sqrt(x * x + (z - CURVE_CZ) * (z - CURVE_CZ));
}

function inDistrict(x, z) {
  if (z < INNER_Z) return false;
  var d = Math.sqrt(x * x + (z - CURVE_CZ) * (z - CURVE_CZ));
  return d < CURVE_R;
}

function onWall(x, z) {
  // Inner straight wall: along z = INNER_Z between x = -92 and 92
  if (Math.abs(z - INNER_Z) <= Math.ceil(WALL_T / 2)) {
    if (Math.abs(x) <= 93) return true;
  }
  // Curved outer wall: along the semicircular arc
  if (z > INNER_Z - 2) {
    var d = Math.sqrt(x * x + (z - CURVE_CZ) * (z - CURVE_CZ));
    if (d >= CURVE_R - WALL_T && d <= CURVE_R) {
      // Breached South Gate opening at the bottom
      if (z > 78 && Math.abs(x) < GATE_HW) return false;
      return true;
    }
  }
  return false;
}

function onWallRose(x, z) {
  // Southern monolithic defensive line of Wall Rose
  if (Math.abs(x) <= WALL_ROSE_HW && z <= WALL_ROSE_Z && z >= WALL_ROSE_Z - 8) {
    if (Math.abs(x) <= 5.5) return false; // Monumental arched gateway for riders
    return true;
  }
  // Eastern and Western flanking ramparts
  if (z < WALL_ROSE_Z && z >= WALL_ROSE_INNER_Z && (Math.abs(x - WALL_ROSE_HW) <= 4 || Math.abs(x - (-WALL_ROSE_HW)) <= 4)) {
    return true;
  }
  // Northern Citadel Keep wall
  if (Math.abs(x) <= WALL_ROSE_HW && z <= WALL_ROSE_INNER_Z + 6 && z >= WALL_ROSE_INNER_Z) {
    return true;
  }
  return false;
}

function inWallRoseCity(x, z) {
  return Math.abs(x) < WALL_ROSE_HW && z < WALL_ROSE_Z - 8 && z > WALL_ROSE_INNER_Z + 6;
}

function isBreach(x, z) {
  if (z >= 76 && z <= 98 && Math.abs(x) <= GATE_HW + 3) return true;
  return false;
}

/* ---- Natural Canal River Geometry ---- */
function canalX(z) {
  // Graceful S-curve canal cutting through the eastern quarter
  return 34 + Math.sin(z * 0.045) * 8 + Math.cos(z * 0.02) * 4;
}
function isCanal(x, z) {
  if (!inDistrict(x, z) || onWall(x, z)) return false;
  var cx = canalX(z);
  return Math.abs(x - cx) <= 4.2;
}
function isBridge(x, z) {
  if (!isCanal(x, z)) return false;
  // Three wide arched stone bridges: North (z=-32), Center (z=2), South (z=48)
  return Math.abs(z - (-32)) <= 3.5 || Math.abs(z - 2) <= 4.5 || Math.abs(z - 48) <= 4.0;
}

/* ---- Center Sunken Forum & Street Network ---- */
function isForum(x, z) {
  // Open circular sunken amphitheater / forum at the city center (0, 0)
  return (x * x + z * z) <= 20 * 20;
}

function isStreet(x, z) {
  if (isBridge(x, z)) return true;
  if (isCanal(x, z)) return false;
  if (isForum(x, z)) return true;

  var d = Math.sqrt(x * x + (z - CURVE_CZ) * (z - CURVE_CZ));
  // Inner ring avenue running along the curved wall
  if (d >= CURVE_R - WALL_T - 9 && d <= CURVE_R - WALL_T - 2) return true;
  // Inner patrol road along northern straight wall
  if (z >= INNER_Z + 2 && z <= INNER_Z + 8 && Math.abs(x) < 85) return true;

  // Grand South Breach Boulevard heading to the outer gate
  if (Math.abs(x) <= 4.5 && z > 15) return true;
  // Grand North Citadel Boulevard
  if (Math.abs(x) <= 4.0 && z < -15 && z > INNER_Z) return true;
  // East-West Grand Cross Avenues
  if (Math.abs(z) <= 4.0 && Math.abs(x) > 15 && Math.abs(x) < 82) return true;

  // Diagonal Radial Boulevards (45 deg angles from center)
  var d1 = Math.abs(x - z), d2 = Math.abs(x + z);
  if ((d1 <= 3.0 || d2 <= 3.0) && (x * x + z * z) < 65 * 65) return true;

  return false;
}

function inYard(x, z) {
  return x >= YARD.x0 && x <= YARD.x1 && z >= YARD.z0 && z <= YARD.z1;
}

function towerAt(x, z) {
  for (var i = 0; i < TOWERS.length; i++) {
    var t = TOWERS[i], dx = Math.abs(x + 0.5 - t.x), dz = Math.abs(z + 0.5 - t.z);
    var reach = t.hw + (t.flat ? 0 : 1);
    if (dx < reach && dz < reach) return t;
  }
  return null;
}

/* ---- Procedural Building Lots ---- */
var LOT = 11, LOT_OFF = 550;
var HOUSE = { ok: false, u0: 0, u1: 0, v0: 0, v1: 0, top: 0, axisX: true, roof: 0, chimney: false, wallMat: 0 };
function lotArea(x, z) {
  return inDistrict(x, z) && !onWall(x, z) && !isStreet(x, z) && !inYard(x, z) && !isCanal(x, z);
}

function houseFor(li, lj) {
  var h1 = hash2(li, lj, 71), h2 = hash2(li, lj, 72), h3 = hash2(li, lj, 73), h4 = hash2(li, lj, 74);
  var bx = li * LOT - LOT_OFF, bz = lj * LOT - LOT_OFF;
  HOUSE.ok = false;
  if (h1 < 0.12) return HOUSE; // open courtyard / garden
  HOUSE.u0 = 1 + (h2 < 0.5 ? 0 : 1); HOUSE.u1 = LOT - 2 - (h3 < 0.5 ? 0 : 1);
  HOUSE.v0 = 1 + (h3 < 0.3 ? 1 : 0); HOUSE.v1 = LOT - 2 - (h2 < 0.7 ? 0 : 1);
  var xa = bx + HOUSE.u0 - 1, xb = bx + HOUSE.u1 + 1, za = bz + HOUSE.v0 - 1, zb = bz + HOUSE.v1 + 1;
  if (!lotArea(xa, za) || !lotArea(xb, za) || !lotArea(xa, zb) || !lotArea(xb, zb)) return HOUSE;
  if (!lotArea((xa + xb) >> 1, za) || !lotArea((xa + xb) >> 1, zb) || !lotArea(xa, (za + zb) >> 1) || !lotArea(xb, (za + zb) >> 1)) return HOUSE;

  // Stories: 2 to 5 stories
  var stories = 2 + Math.floor(h4 * 3);
  if (hash2(li, lj, 75) < 0.2) stories = 5 + Math.floor(hash2(li, lj, 76) * 2);
  HOUSE.top = GROUND + stories * 4;
  HOUSE.axisX = (HOUSE.u1 - HOUSE.u0) >= (HOUSE.v1 - HOUSE.v0);
  HOUSE.roof = hash2(li, lj, 77) < 0.65 ? B.ROOF_RED : B.ROOF_SLATE;
  HOUSE.chimney = hash2(li, lj, 78) < 0.45;
  HOUSE.wallMat = hash2(li, lj, 79) < 0.7 ? B.PLASTER : B.BRICK;
  HOUSE.ok = true;
  return HOUSE;
}

function houseRoofY(u, v) {
  var H = HOUSE, half, dist;
  if (H.axisX) { half = (H.v1 - H.v0) / 2 + 1; dist = Math.abs(v - (H.v0 + H.v1) / 2); }
  else { half = (H.u1 - H.u0) / 2 + 1; dist = Math.abs(u - (H.u0 + H.u1) / 2); }
  return H.top + 1 + Math.max(0, Math.floor(half - dist - 0.01));
}

/* ---- Terrain height ---- */
function groundH(x, z) {
  var ind = inDistrict(x, z);
  if (ind) {
    // Sunken Forum at center: gently steps down by 2 blocks
    if (isForum(x, z)) {
      var d2 = x * x + z * z;
      if (d2 < 12 * 12) return GROUND - 2;
      if (d2 < 18 * 18) return GROUND - 1;
      return GROUND;
    }
    // High Garrison Terrace in North-West
    if (x < -28 && z < -10 && !onWall(x, z)) {
      return GROUND + 2;
    }
    return GROUND;
  }

  // Outside terrain: rolling hills and mountain ridges
  var h = GROUND;
  var d = Math.sqrt(x * x + (z - CURVE_CZ) * (z - CURVE_CZ));
  var flat = smoothstep(CURVE_R + 8, CURVE_R + 55, d);
  if (flat > 0) {
    var hills = fbm2(G.cont, x * 0.0055, z * 0.0055, 4) * 11 + fbm2(G.det, x * 0.03, z * 0.03, 2) * 1.5;
    var road = Math.abs(x) < 20 && z > 0 ? 0.3 : 1;
    h += hills * flat * road;
  }
  var m = smoothstep(320, 460, d);
  if (m > 0) {
    var rid = 1 - Math.abs(fbm2(G.ridge, x * 0.009, z * 0.009, 4) * 1.6);
    if (rid < 0) rid = 0;
    h += m * (16 + rid * rid * 50);
  }
  h = Math.floor(h);
  if (h < 8) h = 8;
  if (h > CH - 12) h = CH - 12;
  return h;
}

function forestAt(x, z) {
  var d = Math.sqrt(x * x + (z - CURVE_CZ) * (z - CURVE_CZ));
  if (d < CURVE_R + 25) return 0;
  if (z > 80 && Math.abs(x) < 45) return 0; // Southern cavalry charge approach
  if (z < -90 && z > -340 && Math.abs(x) < 250) return 1; // Northern Great Forest of Giant Trees
  return fbm2(G.moist, x * 0.0042, z * 0.0042, 3) > 0.12 ? 1 : 0;
}

/* ---- Giant Trees (Forest of Giant Trees) ---- */
var TCELL = 30;
function giantTree(gx, gz) {
  var key = (gx + 5000) * 10000 + (gz + 5000);
  if (TREE_CACHE.has(key)) return TREE_CACHE.get(key);
  var t = null;
  var px = gx * TCELL + 5 + Math.floor(hash2(gx, gz, 41) * (TCELL - 10));
  var pz = gz * TCELL + 5 + Math.floor(hash2(gx, gz, 42) * (TCELL - 10));
  var f = forestAt(px, pz), d = Math.sqrt(px * px + (pz - CURVE_CZ) * (pz - CURVE_CZ));
  var p = f ? 0.86 : 0.05;
  if (d < CURVE_R + 24 || (pz > 80 && Math.abs(px) < 30)) p = 0;
  if (Math.sqrt(px * px + pz * pz) > 420) p = 0;
  if (hash2(gx, gz, 43) < p) {
    var base = groundH(px, pz);
    if (base > SEA) {
      var rt = 2.4 + hash2(gx, gz, 44) * 1.6;
      var th = Math.min(42 + Math.floor(hash2(gx, gz, 45) * 28), CH - 14 - base);
      var br = [], blobs = [];
      var nb = 4 + Math.floor(hash2(gx, gz, 46) * 4), a0 = hash2(gx, gz, 47) * 6.283;
      for (var i = 0; i < nb; i++) {
        var a = a0 + i * 2.39996 + (hash2(gx + i, gz, 48) - 0.5) * 0.6;
        var sy = base + th * (0.42 + 0.5 * i / nb) + hash2(gx, gz + i, 49) * 3;
        var len = 7 + hash2(gx + i, gz - i, 50) * 7, rise = 3 + hash2(gx - i, gz + i, 61) * 6;
        var ex = px + 0.5 + Math.cos(a) * len, ez = pz + 0.5 + Math.sin(a) * len, ey = sy + rise;
        br.push([px + 0.5, sy, pz + 0.5, ex, ey, ez, 1.4]);
        var rb = 4.4 + hash2(gx + i, gz + i, 62) * 2.6;
        blobs.push([ex, ey + 1.2, ez, rb, rb * 0.62, i & 1 ? B.CANOPY_LIGHT : B.CANOPY]);
      }
      for (var k = 0; k < 4; k++) {
        var ra = a0 + k * 1.5708 + 0.5;
        var rlen = 3.5 + hash2(gx + k, gz, 63) * 2.5;
        br.push([px + 0.5, base + 0.5, pz + 0.5, px + 0.5 + Math.cos(ra) * rlen, base + 0.2, pz + 0.5 + Math.sin(ra) * rlen, 0.9]);
      }
      blobs.push([px + 0.5, base + th + 1.5, pz + 0.5, 5.8, 4.2, B.CANOPY]);
      t = { x: px, z: pz, base: base, th: th, rt: rt, br: br, blobs: blobs };
    }
  }
  TREE_CACHE.set(key, t);
  return t;
}

/* ---- Outer Plains Structures ---- */
var WCELL = 42;
function watchtower(wx, wz) {
  var h = hash2(wx, wz, 91);
  if (h > 0.35) return null;
  var px = wx * WCELL + 6 + Math.floor(hash2(wx, wz, 92) * (WCELL - 12));
  var pz = wz * WCELL + 6 + Math.floor(hash2(wx, wz, 93) * (WCELL - 12));
  var d = Math.sqrt(px * px + (pz - CURVE_CZ) * (pz - CURVE_CZ));
  if (d < CURVE_R + 25) return null;
  var gh = groundH(px, pz);
  if (gh <= SEA) return null;
  return { x: px, z: pz, h: 14 + Math.floor(h * 12), ruin: h < 0.18 };
}

function outwork(gx, gz) { return null; }
function outworkAt(x, z) { return null; }

/* =====================================================================
   CHUNK GENERATION
   ===================================================================== */
function generateChunk(cx, cz) {
  var blocks = new Uint8Array(CS * CS * CH);
  var biomes = new Uint8Array(CS * CS);
  var x0 = cx * CS, z0 = cz * CS, x, y, z;
  for (z = 0; z < CS; z++) for (x = 0; x < CS; x++) {
    var wx = x0 + x, wz = z0 + z, base = (z << 4) | x;
    var h = groundH(wx, wz);
    var inside = inDistrict(wx, wz);
    var forest = forestAt(wx, wz);
    biomes[z * CS + x] = inside ? BIOME.DISTRICT : forest ? BIOME.FOREST : (h <= SEA ? BIOME.OCEAN : BIOME.PLAINS);
    var mtn = h > GROUND + 30;
    for (y = 0; y <= h; y++) {
      var id;
      if (y === 0) id = B.BEDROCK;
      else if (y < h - 3) id = B.STONE;
      else if (y < h) id = mtn ? B.STONE : B.DIRT;
      else id = mtn ? (h > GROUND + 58 ? B.SNOW_BLOCK : B.STONE) : (h <= SEA ? B.SAND : B.GRASS);
      blocks[(y << 8) | base] = id;
    }
    if (h < SEA) for (y = h + 1; y <= SEA; y++) blocks[(y << 8) | base] = B.WATER;

    var inRose = inWallRoseCity(wx, wz);
    var roseWall = onWallRose(wx, wz);
    if (inside || onWall(wx, wz) || isBreach(wx, wz) || inRose || roseWall) {
      districtColumn(blocks, base, wx, wz, h);
    } else {
      fieldColumn(blocks, base, wx, wz, h, forest);
    }
  }
  placeGiantTrees(blocks, x0, z0);
  placeSupply(blocks, x0, z0);
  var maxY = 0;
  for (var i = blocks.length - 1; i >= 0; i--) if (blocks[i]) { maxY = i >> 8; break; }
  return { blocks: blocks, biomes: biomes, maxY: maxY };
}

/* ---- District & Wall Column Generation ---- */
function districtColumn(bl, base, x, z, h) {
  var y;
  var t = towerAt(x, z);
  if (t) { towerColumn(bl, base, x, z, t); return; }

  // Smashed Outer Gate Breach with fallen rubble
  if (isBreach(x, z)) {
    var breachRubble = hash2(x, z, 81);
    var rH = GROUND + Math.floor(breachRubble * 7) + (Math.abs(x) > GATE_HW ? 6 : 0);
    for (y = GROUND; y <= rH; y++) {
      bl[(y << 8) | base] = (y % 2 === 0) ? B.COBBLE : B.STONEBRICK;
    }
    if (breachRubble < 0.25) bl[((rH + 1) << 8) | base] = B.TIMBER;
    return;
  }

  // Monolithic Wall Rose (Highest Peak Citadel)
  if (onWallRose(x, z)) {
    var roseTopY = WALL_ROSE_TOP;
    for (y = GROUND + 1; y <= roseTopY; y++) {
      var rBlk = (y % 3 === 0) ? B.STONEBRICK : B.STONE;
      if (hash3(x, y, z, 86) < 0.06) rBlk = B.COBBLE;
      bl[(y << 8) | base] = rBlk;
    }
    // High crenellations on Wall Rose Walkway
    if (((x + z) & 1) === 0) {
      bl[((roseTopY + 1) << 8) | base] = B.STONEBRICK;
    }
    return;
  }

  // Wall Rose Inner Citadel City (Sanctuary Fortress)
  if (inWallRoseCity(x, z)) {
    bl[(h << 8) | base] = B.COBBLE;
    if (Math.abs(x) <= 4.5) {
      bl[(h << 8) | base] = B.STONEBRICK; // Citadel Command Boulevard
      if (Math.abs(x) === 4 && (z % 12 === 0)) {
        bl[((h + 1) << 8) | base] = B.IRONBARS;
        bl[((h + 2) << 8) | base] = B.GOLD;
      }
    } else {
      var rli = Math.floor((x + 500) / 10), rlj = Math.floor((z + 500) / 10);
      var rSeed = hash2(rli, rlj, 88);
      if (rSeed > 0.25) {
        var rx = (x + 500) % 10, rz = (z + 500) % 10;
        if (rx >= 2 && rx <= 7 && rz >= 2 && rz <= 7) {
          var bHeight = GROUND + 5 + Math.floor(rSeed * 4);
          for (y = GROUND + 1; y <= bHeight; y++) {
            var isW = rx === 2 || rx === 7 || rz === 2 || rz === 7;
            bl[(y << 8) | base] = isW ? B.STONEBRICK : B.PLANKS;
          }
          bl[((bHeight + 1) << 8) | base] = B.ROOF_SLATE;
        }
      }
    }
    return;
  }

  // Colossal Monolithic Wall Maria
  if (onWall(x, z)) {
    var wallTopY = WALL_TOP;
    for (y = GROUND + 1; y <= wallTopY; y++) {
      var isEdge = false;
      // Edge battlements
      if (z <= INNER_Z + 1 || z >= INNER_Z + WALL_T - 1) isEdge = true;
      var d = Math.sqrt(x * x + (z - CURVE_CZ) * (z - CURVE_CZ));
      if (d <= CURVE_R - WALL_T + 1 || d >= CURVE_R - 1) isEdge = true;

      var blk = B.STONEBRICK;
      if (hash3(x, y, z, 82) < 0.08) blk = B.COBBLE;
      else if (hash3(x, y, z, 83) < 0.04) blk = B.MOSSY;
      bl[(y << 8) | base] = blk;
    }
    // Walkway parapet & crenellations on top
    var dWalk = Math.sqrt(x * x + (z - CURVE_CZ) * (z - CURVE_CZ));
    var isRampartEdge = (dWalk <= CURVE_R - WALL_T + 1) || (dWalk >= CURVE_R - 1) || Math.abs(z - INNER_Z) <= 1;
    if (isRampartEdge && ((x + z) & 1) === 0) {
      bl[((wallTopY + 1) << 8) | base] = B.STONEBRICK;
    }
    return;
  }

  // Canal River Bed & Water
  if (isCanal(x, z)) {
    if (isBridge(x, z)) {
      // Arched stone bridge
      for (y = GROUND; y <= GROUND + 2; y++) bl[(y << 8) | base] = B.COBBLE;
      bl[((GROUND + 3) << 8) | base] = B.STONEBRICK; // Bridge parapet
      return;
    }
    // Canal water with stone quays
    for (y = SEA + 1; y <= GROUND - 2; y++) bl[(y << 8) | base] = B.WATER;
    bl[((GROUND - 2) << 8) | base] = B.STONEBRICK;
    return;
  }

  // Sunken Forum at (0, 0)
  if (isForum(x, z)) {
    var dForum = Math.sqrt(x * x + z * z);
    if (dForum < 4.5) {
      // Central shallow reflecting pool
      bl[(h << 8) | base] = B.STONEBRICK;
      bl[((h + 1) << 8) | base] = B.WATER;
      if (dForum < 1.5) bl[((h + 2) << 8) | base] = B.STONEBRICK; // Center stone obelisk plinth
      return;
    }
    // Tiered concentric stone amphitheater
    bl[(h << 8) | base] = (Math.floor(dForum) % 3 === 0) ? B.STONEBRICK : B.COBBLE;
    return;
  }

  // City Streets & Boulevards
  if (isStreet(x, z)) {
    bl[(h << 8) | base] = hash2(x, z, 83) < 0.6 ? B.PATH : B.COBBLE;
    // Street lanterns along main avenue
    if (Math.abs(x) === 4 && (z % 14 === 0) && z > 0) {
      for (y = h + 1; y <= h + 3; y++) bl[(y << 8) | base] = B.IRONBARS;
      bl[((h + 4) << 8) | base] = B.GOLD;
    }
    return;
  }

  // Scout Practice & Stables Yard
  if (inYard(x, z)) {
    bl[(h << 8) | base] = B.DIRT_PATH;
    var isEdge = x === YARD.x0 || x === YARD.x1 || z === YARD.z0 || z === YARD.z1;
    if (isEdge) {
      bl[((h + 1) << 8) | base] = B.TIMBER;
      if (((x + z) & 3) === 0) bl[((h + 2) << 8) | base] = B.TIMBER;
    }
    // Stables in yard
    if (x >= YARD.x0 + 4 && x <= YARD.x0 + 16 && z >= YARD.z0 + 4 && z <= YARD.z0 + 20) {
      var sx = x - (YARD.x0 + 4), sz = z - (YARD.z0 + 4);
      if ((sx === 0 || sx === 12) && (sz % 4 === 0)) {
        for (y = h + 1; y <= h + 4; y++) bl[(y << 8) | base] = B.LOG;
      }
      if (sz % 4 === 0 && sx < 10) bl[((h + 1) << 8) | base] = B.TIMBER;
      if (sx >= 8 && sz % 4 === 2) bl[((h + 1) << 8) | base] = B.HAY;
      bl[((h + 5) << 8) | base] = B.PLANKS;
      return;
    }
    // High Tether Poles for grappling training
    for (var p = 0; p < POLES.length; p++) {
      var P = POLES[p];
      if (x >= P[0] && x <= P[0] + 1 && z >= P[1] && z <= P[1] + 1) {
        for (y = h + 1; y <= h + P[2]; y++) bl[(y << 8) | base] = B.LOG;
        bl[((h + P[2] + 1) << 8) | base] = B.PLANKS;
      }
    }
    return;
  }

  // Medieval Townhouses
  var li = Math.floor((x + LOT_OFF) / LOT), lj = Math.floor((z + LOT_OFF) / LOT);
  var u = x + LOT_OFF - li * LOT, v = z + LOT_OFF - lj * LOT;
  var H = houseFor(li, lj);
  bl[(h << 8) | base] = hash2(x, z, 84) < 0.5 ? B.PATH : B.GRAVEL;
  if (!H.ok) {
    bl[(h << 8) | base] = B.GRASS;
    if (u === 5 && v === 5) { for (y = h + 1; y <= h + 4; y++) bl[(y << 8) | base] = B.LOG; }
    else if (Math.abs(u - 5) <= 2 && Math.abs(v - 5) <= 2 && !(Math.abs(u - 5) === 2 && Math.abs(v - 5) === 2)) {
      for (y = h + 4; y <= h + 6; y++) bl[(y << 8) | base] = B.LEAVES;
    } else if (hash2(x, z, 85) < 0.2) bl[((h + 1) << 8) | base] = B.TALLGRASS;
    return;
  }

  var inWallHouse = u >= H.u0 && u <= H.u1 && v >= H.v0 && v <= H.v1;
  var inRoofHouse = u >= H.u0 - 1 && u <= H.u1 + 1 && v >= H.v0 - 1 && v <= H.v1 + 1;
  if (!inRoofHouse) return;

  var roofY = houseRoofY(u, v);
  if (inWallHouse) {
    var perim = u === H.u0 || u === H.u1 || v === H.v0 || v === H.v1;
    var corner = (u === H.u0 || u === H.u1) && (v === H.v0 || v === H.v1);
    var alongW = (u === H.u0 || u === H.u1) ? v : u;
    var front = v === H.v1 && u === ((H.u0 + H.u1) >> 1);
    for (y = h + 1; y <= H.top; y++) {
      var id;
      if (!perim) id = B.PLANKS;
      else {
        var ly = (y - h) % 4;
        if (corner) id = B.TIMBER;
        else if (ly === 0) id = B.TIMBER;
        else if (front && y <= h + 2) id = B.TIMBER;
        else if ((ly === 2 || ly === 3) && (alongW % 3) === 1) id = B.WINDOW;
        else id = H.wallMat;
      }
      bl[(y << 8) | base] = id;
    }
    var gable = H.axisX ? (u === H.u0 || u === H.u1) : (v === H.v0 || v === H.v1);
    for (y = H.top + 1; y < roofY; y++) bl[(y << 8) | base] = gable ? H.wallMat : B.PLANKS;
    bl[(roofY << 8) | base] = H.roof;
    if (H.chimney && u === H.u0 + 1 && v === H.v0 + 1) {
      for (y = roofY; y <= H.top + 3; y++) bl[(y << 8) | base] = B.COBBLE;
    }
  } else {
    bl[(roofY << 8) | base] = H.roof;
  }
}

function towerColumn(bl, base, x, z, t) {
  var dx = Math.abs(x + 0.5 - t.x), dz = Math.abs(z + 0.5 - t.z), cheb = Math.max(dx, dz), y;
  var edge = cheb > t.hw - 1;
  var overhang = cheb >= t.hw;
  if (!overhang) {
    for (y = GROUND + 1; y <= t.top; y++) {
      var id = B.STONEBRICK;
      if (edge) {
        var alongT = dx > dz ? z : x;
        if (((y - GROUND) % 6 === 3 || (y - GROUND) % 6 === 4) && ((alongT % 3) + 3) % 3 === 1 && y > GROUND + 6) id = B.WINDOW;
        else if (hash3(x, y, z, 86) < 0.08) id = B.MOSSY;
        if (((alongT % 6) + 6) % 6 === 0 && y > t.top - 12 && y < t.top - 2 && dx !== dz) id = B.BANNER;
      }
      bl[(y << 8) | base] = id;
    }
  }
  if (t.flat) {
    if (edge && !overhang) {
      var a2 = (dx > dz ? z : x);
      if ((((a2 % 3) + 3) % 3) !== 1) bl[((t.top + 1) << 8) | base] = B.STONEBRICK;
    }
  } else {
    var ry = t.top + 1 + Math.floor(t.hw - cheb + 0.5);
    for (y = t.top + 1; y <= ry; y++) bl[(y << 8) | base] = (y === ry || overhang) ? t.roof : B.PLANKS;
    if (overhang) { for (y = t.top + 1; y < ry; y++) bl[(y << 8) | base] = 0; }
  }
}

function fieldColumn(bl, base, x, z, h, forest) {
  var y;
  if (h <= SEA) return;

  // Scorched Battlefield outside Wall Maria South Gate
  if (z > 85 && z < 320 && Math.abs(x) < 140) {
    var road = Math.abs(x + 0.5) < 5.0;
    if (road) { bl[(h << 8) | base] = B.DIRT_PATH; return; }
    // Titan boulder impact craters from Beast Titan
    var inCrater = Math.hypot(x - 22, z - 130) < 8 || Math.hypot(x + 36, z - 180) < 10 || Math.hypot(x - 30, z - 225) < 12;
    if (inCrater) {
      bl[(h << 8) | base] = B.DIRT;
      if (hash2(x, z, 95) < 0.4) bl[((h + 1) << 8) | base] = B.COBBLE;
      return;
    }
  }

  var wt = watchtower(Math.floor(x / WCELL), Math.floor(z / WCELL));
  if (wt) {
    var dx = Math.abs(x - wt.x), dz = Math.abs(z - wt.z);
    if (dx <= 3 && dz <= 3) {
      var topW = h + wt.h;
      for (y = h + 1; y <= topW; y++) {
        var edgeW = dx === 3 || dz === 3;
        bl[(y << 8) | base] = edgeW ? (wt.ruin && hash3(x, y, z, 87) < 0.25 ? 0 : B.STONEBRICK) : (y % 5 === 0 ? B.PLANKS : 0);
      }
      if (!wt.ruin && dx <= 3 && dz <= 3) {
        bl[((topW + 1) << 8) | base] = B.PLANKS;
        if (dx === 3 || dz === 3) bl[((topW + 2) << 8) | base] = B.STONEBRICK;
      }
      return;
    }
  }

  // Flowers & vegetation
  var hv2 = hash2(x, z, 88);
  if (hv2 < 0.04) bl[((h + 1) << 8) | base] = B.ROSE;
  else if (hv2 < 0.08) bl[((h + 1) << 8) | base] = B.DANDELION;
  else if (hv2 < 0.3) bl[((h + 1) << 8) | base] = B.TALLGRASS;
}

function setB(bl, x0, z0, x, y, z, id, replace) {
  if (x < x0 || x >= x0 + CS || z < z0 || z >= z0 + CS || y <= 0 || y >= CH) return;
  var idx = (y << 8) | ((z - z0) << 4) | (x - x0);
  if (replace || !bl[idx]) bl[idx] = id;
}

function placeGiantTrees(bl, x0, z0) {
  var gx0 = Math.floor((x0 - 24) / TCELL), gx1 = Math.floor((x0 + CS + 24) / TCELL);
  var gz0 = Math.floor((z0 - 24) / TCELL), gz1 = Math.floor((z0 + CS + 24) / TCELL);
  for (var gz = gz0; gz <= gz1; gz++) for (var gx = gx0; gx <= gx1; gx++) {
    var t = giantTree(gx, gz);
    if (!t) continue;
    placeOneGiantTree(bl, x0, z0, t);
  }
}

function placeOneGiantTree(bl, x0, z0, t) {
  var i;
  for (var y = t.base; y <= t.base + t.th; y++) {
    var r = t.rt * (1 - (y - t.base) / t.th * 0.45);
    var r2 = r * r;
    var xmin = Math.floor(t.x - r), xmax = Math.ceil(t.x + r);
    var zmin = Math.floor(t.z - r), zmax = Math.ceil(t.z + r);
    for (var z = zmin; z <= zmax; z++) for (var x = xmin; x <= xmax; x++) {
      var dx = x + 0.5 - (t.x + 0.5), dz = z + 0.5 - (t.z + 0.5);
      if (dx * dx + dz * dz <= r2) setB(bl, x0, z0, x, y, z, B.BARK, false);
    }
  }
  for (i = 0; i < t.br.length; i++) {
    var b = t.br[i], len = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]), n = Math.ceil(len / 0.6);
    for (var s = 0; s <= n; s++) {
      var f = s / n, px = b[0] + (b[3] - b[0]) * f, py = b[1] + (b[4] - b[1]) * f, pz = b[2] + (b[5] - b[2]) * f;
      var rad = b[6] * (1 - f * 0.4);
      if (px + rad < x0 || px - rad > x0 + CS || pz + rad < z0 || pz - rad > z0 + CS) continue;
      var br2 = rad * rad;
      for (var zz = Math.floor(pz - rad); zz <= Math.floor(pz + rad); zz++)
        for (var yy = Math.floor(py - rad); yy <= Math.floor(py + rad); yy++)
          for (var xx = Math.floor(px - rad); xx <= Math.floor(px + rad); xx++) {
            var ex = xx + 0.5 - px, ey = yy + 0.5 - py, ez = zz + 0.5 - pz;
            if (ex * ex + ey * ey + ez * ez <= br2) setB(bl, x0, z0, xx, yy, zz, B.BARK, false);
          }
    }
  }
  for (i = 0; i < t.blobs.length; i++) {
    var c = t.blobs[i], rx = c[3], ry = c[4];
    var xa = Math.max(x0, Math.floor(c[0] - rx)), xb = Math.min(x0 + CS - 1, Math.floor(c[0] + rx));
    var za = Math.max(z0, Math.floor(c[2] - rx)), zb = Math.min(z0 + CS - 1, Math.floor(c[2] + rx));
    if (xa > xb || za > zb) continue;
    for (var bz = za; bz <= zb; bz++) for (var bx = xa; bx <= xb; bx++) for (var by = Math.floor(c[1] - ry); by <= Math.floor(c[1] + ry); by++) {
      var qx = (bx + 0.5 - c[0]) / rx, qy = (by + 0.5 - c[1]) / ry, qz = (bz + 0.5 - c[2]) / rx;
      var e = qx * qx + qy * qy + qz * qz;
      if (e < 1 - hash3(bx, by, bz, 93) * 0.32) setB(bl, x0, z0, bx, by, bz, c[5], false);
    }
  }
}

function supplyY(s) { return s.wall ? WALL_TOP : groundH(s.x, s.z); }
function placeSupply(bl, x0, z0) {
  for (var i = 0; i < SUPPLY.length; i++) {
    var s = SUPPLY[i];
    if (s.x + 3 < x0 || s.x - 3 > x0 + CS || s.z + 3 < z0 || s.z - 3 > z0 + CS) continue;
    var gy = supplyY(s);
    for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) {
      setB(bl, x0, z0, s.x + dx, gy, s.z + dz, B.PLANKS, true);
      for (var y = gy + 1; y <= gy + 4; y++) setB(bl, x0, z0, s.x + dx, y, s.z + dz, B.AIR, true);
    }
    setB(bl, x0, z0, s.x - 2, gy + 1, s.z - 2, B.CRATE, true);
    setB(bl, x0, z0, s.x - 1, gy + 1, s.z - 2, B.CRATE, true);
    setB(bl, x0, z0, s.x - 2, gy + 2, s.z - 2, B.CRATE, true);
    setB(bl, x0, z0, s.x + 2, gy + 1, s.z + 2, B.CRATE, true);
    setB(bl, x0, z0, s.x + 2, gy + 1, s.z - 2, B.HAY, true);
  }
}

/* ---- Minimap top-down color ---- */
function mapColor(x, z) {
  if (onWallRose(x, z)) return [200, 200, 210];
  if (inWallRoseCity(x, z)) return [155, 145, 130];
  if (z >= WALL_ROSE_Z && z <= INNER_Z && Math.abs(x) <= 4.0) return [170, 160, 145]; // Grand Highway
  if (inDistrict(x, z) || onWall(x, z)) {
    var t = towerAt(x, z);
    if (t) return t.flat ? [150, 150, 158] : t.roof === B.ROOF_SLATE ? [70, 86, 120] : [168, 70, 52];
    if (onWall(x, z)) return [180, 180, 186];
    if (isCanal(x, z)) return isBridge(x, z) ? [150, 140, 122] : [52, 98, 190];
    if (isForum(x, z)) return [170, 160, 145];
    if (isStreet(x, z)) return [150, 140, 122];
    if (inYard(x, z)) return [140, 112, 80];

    var li = Math.floor((x + LOT_OFF) / LOT), lj = Math.floor((z + LOT_OFF) / LOT);
    var u = x + LOT_OFF - li * LOT, v = z + LOT_OFF - lj * LOT, H = houseFor(li, lj);
    if (!H.ok) return [92, 150, 64];
    if (u >= H.u0 - 1 && u <= H.u1 + 1 && v >= H.v0 - 1 && v <= H.v1 + 1) {
      var ry = houseRoofY(u, v), sh = 0.75 + (ry - H.top) * 0.06;
      return H.roof === B.ROOF_RED ? [178 * sh, 72 * sh, 54 * sh] : [80 * sh, 96 * sh, 130 * sh];
    }
    return [132, 126, 112];
  }
  var h = groundH(x, z);
  if (h <= SEA) return [52, 98, 190];
  var gx = Math.floor(x / TCELL), gz = Math.floor(z / TCELL);
  for (var j = gz - 1; j <= gz + 1; j++) for (var i = gx - 1; i <= gx + 1; i++) {
    var tr = giantTree(i, j);
    if (!tr) continue;
    var dx = x - tr.x, dz = z - tr.z, d2 = dx * dx + dz * dz;
    if (d2 < tr.rt * tr.rt) return [96, 70, 44];
    if (d2 < 15 * 15) return [34, 92, 40];
  }
  var wt = watchtower(Math.floor(x / WCELL), Math.floor(z / WCELL));
  if (wt && Math.abs(x - wt.x) < 4 && Math.abs(z - wt.z) < 4) return [130, 130, 134];
  if (z > 85 && Math.abs(x + 0.5) < 4.5 && z < 320) return [150, 124, 86];
  var hs = (h - GROUND) * 2;
  if (h > GROUND + 30) return [128 + hs * 0.3, 128 + hs * 0.3, 132 + hs * 0.3];
  return forestAt(x, z) ? [62 + hs, 120 + hs, 52 + hs] : [100 + hs, 158 + hs, 70 + hs];
}

/* Worker entry point */
if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof importScripts === 'function') {
  self.onmessage = function (e) {
    var d = e.data;
    if (d.type === 'init') initGen(d.seed);
    else if (d.type === 'gen') {
      var r = generateChunk(d.cx, d.cz);
      self.postMessage({ type: 'chunk', gid: d.gid, cx: d.cx, cz: d.cz, blocks: r.blocks, biomes: r.biomes, maxY: r.maxY }, [r.blocks.buffer, r.biomes.buffer]);
    }
  };
}

/* Global & Browser Exports */
if (typeof globalThis !== 'undefined') {
  globalThis.initGen = initGen;
  globalThis.generateChunk = generateChunk;
  globalThis.groundH = groundH;
  globalThis.mapColor = mapColor;
  globalThis.outwork = outwork;
  globalThis.outworkAt = outworkAt;
  globalThis.B = B;
  globalThis.BIOME = BIOME;
  globalThis.supplyY = supplyY;
  globalThis.GROUND = GROUND;
  globalThis.WALL_TOP = WALL_TOP;
  globalThis.WALL_ROSE_TOP = WALL_ROSE_TOP;
  globalThis.DR = DR;
  globalThis.WALL_ROSE_Z = WALL_ROSE_Z;
  globalThis.WALL_MARIA_Z = WALL_MARIA_Z;
}
if (typeof window !== 'undefined') {
  window.initGen = initGen;
  window.generateChunk = generateChunk;
  window.groundH = groundH;
  window.mapColor = mapColor;
  window.outwork = outwork;
  window.outworkAt = outworkAt;
  window.B = B;
  window.BIOME = BIOME;
  window.supplyY = supplyY;
  window.GROUND = GROUND;
  window.WALL_TOP = WALL_TOP;
  window.WALL_ROSE_TOP = WALL_ROSE_TOP;
  window.DR = DR;
  window.WALL_ROSE_Z = WALL_ROSE_Z;
  window.WALL_MARIA_Z = WALL_MARIA_Z;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initGen: initGen, generateChunk: generateChunk, groundH: groundH, mapColor: mapColor, outwork: outwork, outworkAt: outworkAt, B: B, BIOME: BIOME, supplyY: supplyY, GROUND: GROUND, WALL_TOP: WALL_TOP, WALL_ROSE_TOP: WALL_ROSE_TOP, DR: DR, WALL_ROSE_Z: WALL_ROSE_Z, WALL_MARIA_Z: WALL_MARIA_Z };
}

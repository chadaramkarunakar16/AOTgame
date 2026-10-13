import fs from 'fs';
import path from 'path';
import https from 'https';

const outDir = path.resolve('public/textures/minecraft');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const baseUrl = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.4/assets/minecraft/textures/';

const textures = [
  { remote: 'block/stone_bricks.png', local: 'stone_bricks.png' },
  { remote: 'block/cobblestone.png', local: 'cobblestone.png' },
  { remote: 'block/oak_log.png', local: 'oak_log.png' },
  { remote: 'block/oak_log_top.png', local: 'oak_log_top.png' },
  { remote: 'block/oak_planks.png', local: 'oak_planks.png' },
  { remote: 'block/oak_leaves.png', local: 'oak_leaves.png' },
  { remote: 'block/dirt.png', local: 'dirt.png' },
  { remote: 'block/grass_block_top.png', local: 'grass_block_top.png' },
  { remote: 'block/grass_block_side.png', local: 'grass_block_side.png' },
  { remote: 'block/hay_block_side.png', local: 'hay_block_side.png' },
  { remote: 'block/hay_block_top.png', local: 'hay_block_top.png' },
  { remote: 'block/bricks.png', local: 'bricks.png' },
  { remote: 'block/terracotta.png', local: 'terracotta.png' },
  { remote: 'block/red_terracotta.png', local: 'red_terracotta.png' },
  { remote: 'block/deepslate_tiles.png', local: 'deepslate_tiles.png' },
  { remote: 'block/poppy.png', local: 'poppy.png' },
  { remote: 'block/dandelion.png', local: 'dandelion.png' },
  { remote: 'block/iron_bars.png', local: 'iron_bars.png' },
  { remote: 'item/iron_sword.png', local: 'iron_sword.png' }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to get ${url}: ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Downloading Minecraft canonical textures from mcasset.cloud / GitHub...');
  for (const t of textures) {
    const url = baseUrl + t.remote;
    const dest = path.join(outDir, t.local);
    try {
      await download(url, dest);
      console.log(`✓ Downloaded ${t.local}`);
    } catch (e) {
      console.error(`✗ Error downloading ${t.local}:`, e.message);
    }
  }
  console.log('Done downloading assets!');
}

run();

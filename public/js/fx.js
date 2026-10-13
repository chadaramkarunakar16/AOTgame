/* =========================================================================
   Effects: soft particles (steam, sparks, gas, dust), instanced debris,
   sword trails, cables, blob shadows, screen shake and speed lines.
   ========================================================================= */
import { THREE, scene, camera, renderer, getBlock, SOLID, makeCanvasTex, tileAvg, TILE_FACE, lightCol } from './engine.js';

const softTex = makeCanvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
softTex.magFilter = THREE.LinearFilter; softTex.minFilter = THREE.LinearFilter;
const sparkTex = makeCanvasTex(32, 32, (g) => {
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
});
sparkTex.magFilter = THREE.LinearFilter; sparkTex.minFilter = THREE.LinearFilter;

export const fxUniforms = { uScale: { value: 600 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 50 }, uFogFar: { value: 120 } };
class PointFX {
  constructor(max, additive, tex) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.base = new Float32Array(max * 4);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize);
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ map: { value: tex }, uAdd: { value: additive ? 1 : 0 } }, fxUniforms),
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vCol; varying float vFog; uniform float uScale, uFogNear, uFogFar;
        void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = min(size * uScale / max(0.1, -mv.z), 700.0); vFog = smoothstep(uFogNear, uFogFar, -mv.z); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uFogColor; uniform float uAdd; varying vec4 vCol; varying float vFog;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vCol.a; if (a < 0.004) discard;
          vec3 c = mix(vCol.rgb, uFogColor, uAdd > 0.5 ? 0.0 : vFog); gl_FragColor = vec4(c, a * (uAdd > 0.5 ? 1.0 - vFog : 1.0)); }`
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.base[i * 4] = r; this.base[i * 4 + 1] = g; this.base[i * 4 + 2] = b; this.base[i * 4 + 3] = a;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  kill(i) {
    const j = --this.n; if (i === j) return;
    const c3 = (arr) => { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; };
    c3(this.pos); c3(this.vel);
    for (let k = 0; k < 4; k++) this.base[i * 4 + k] = this.base[j * 4 + k];
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
  }
  update(dt, light) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); i--; continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      const fadeIn = Math.min(1, t * 8);
      const a = this.base[i * 4 + 3] * fadeIn * (1 - t) * (1 - t * 0.3);
      this.col[i * 4] = this.base[i * 4] * light; this.col[i * 4 + 1] = this.base[i * 4 + 1] * light; this.col[i * 4 + 2] = this.base[i * 4 + 2] * light; this.col[i * 4 + 3] = a;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}
export const steam = new PointFX(1800, false, softTex);
export const sparks = new PointFX(600, true, sparkTex);
export const puffs = new PointFX(500, false, softTex);

export function steamBurst(p, n = 20, spread = 2, size = 3, speed = 3, life = 2.4, heat = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = speed * (0.3 + Math.random());
    const c = 0.88 + Math.random() * 0.12;
    steam.spawn(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread,
      Math.cos(a) * r * s, Math.abs(u) * s * 0.6 + 1.5 * heat, Math.sin(a) * r * s,
      life * (0.6 + Math.random() * 0.6), size * (0.4 + Math.random() * 0.4), size * (1.4 + Math.random()), c, c, c * 1.02, 0.5 + Math.random() * 0.3, -1.2 * heat, 1.2);
  }
}
export function sparkBurst(p, n = 14, speed = 10, color = [1, 0.85, 0.5], size = 0.25) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = speed * (0.4 + Math.random());
    sparks.spawn(p.x, p.y, p.z, Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, 0.25 + Math.random() * 0.35, size, size * 0.3, color[0], color[1], color[2], 1, 14, 2);
  }
}
export function gasPuff(p, v, n = 2, size = 0.6) {
  for (let i = 0; i < n; i++) {
    puffs.spawn(p.x + (Math.random() - 0.5) * 0.3, p.y + (Math.random() - 0.5) * 0.3, p.z + (Math.random() - 0.5) * 0.3,
      v.x + (Math.random() - 0.5) * 1.5, v.y + (Math.random() - 0.5) * 1.5, v.z + (Math.random() - 0.5) * 1.5,
      0.5 + Math.random() * 0.4, size, size * 3.2, 0.92, 0.94, 0.96, 0.4, -0.5, 3);
  }
}
export function dust(p, n = 10, size = 1.5, color = [0.72, 0.66, 0.55], spread = 1.5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
    puffs.spawn(p.x + (Math.random() - 0.5) * spread, p.y + Math.random() * 0.5, p.z + (Math.random() - 0.5) * spread,
      Math.cos(a) * s, 0.8 + Math.random() * 1.5, Math.sin(a) * s, 1.0 + Math.random() * 0.8, size * 0.6, size * 2.4, color[0], color[1], color[2], 0.55, 0, 1.6);
  }
}

/* ---- instanced debris cubes ---- */
const DEB_MAX = 400;
const debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), DEB_MAX);
debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debMesh.count = 0; debMesh.frustumCulled = false;
debMesh.setColorAt(0, new THREE.Color(1, 1, 1));
scene.add(debMesh);
const debs = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();
export function debris(x, y, z, blockId, n = 4, speed = 6, size = 0.35) {
  const c = tileAvg[TILE_FACE[blockId * 6 + 1]] || [0.6, 0.6, 0.6];
  for (let i = 0; i < n && debs.length < DEB_MAX; i++) {
    debs.push({ p: new THREE.Vector3(x + Math.random(), y + Math.random(), z + Math.random()), v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.8 + 2, (Math.random() - 0.5) * speed),
      r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
      s: size * (0.5 + Math.random()), life: 1.5 + Math.random() * 1.5, col: [c[0], c[1], c[2]] });
  }
}
export function chunkDebris(p, color, n, speed, size) {
  for (let i = 0; i < n && debs.length < DEB_MAX; i++) {
    debs.push({ p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)), v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed),
      r: new THREE.Vector3(), w: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), s: size * (0.6 + Math.random() * 0.8), life: 2 + Math.random(), col: color });
  }
}
function updateDebris(dt) {
  let k = 0;
  for (let i = 0; i < debs.length; i++) {
    const d = debs[i];
    d.life -= dt;
    if (d.life <= 0) { debs[i] = debs[debs.length - 1]; debs.pop(); i--; continue; }
    d.v.y -= 24 * dt;
    const ny = d.p.y + d.v.y * dt;
    if (SOLID[getBlock(Math.floor(d.p.x), Math.floor(ny - d.s * 0.5), Math.floor(d.p.z))]) { d.v.y = -d.v.y * 0.3; d.v.x *= 0.7; d.v.z *= 0.7; d.w.multiplyScalar(0.7); } else d.p.y = ny;
    d.p.x += d.v.x * dt; d.p.z += d.v.z * dt;
    d.r.addScaledVector(d.w, dt);
    const sc = d.s * Math.min(1, d.life * 2);
    _m.compose(d.p, _q.setFromEuler(_e.set(d.r.x, d.r.y, d.r.z)), _s.set(sc, sc, sc));
    debMesh.setMatrixAt(k, _m); debMesh.setColorAt(k, _c.setRGB(d.col[0], d.col[1], d.col[2]));
    k++;
  }
  debMesh.count = k;
  debMesh.instanceMatrix.needsUpdate = true; if (debMesh.instanceColor) debMesh.instanceColor.needsUpdate = true;
}

/* ---- sword trails ---- */
const TRAIL_N = 14;
export class Trail {
  constructor(color) {
    this.pts = []; // {a: Vector3, b: Vector3, t}
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(TRAIL_N * 2 * 3); this.col = new Float32Array(TRAIL_N * 2 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.color = color;
    scene.add(this.mesh);
  }
  push(a, b, on) {
    this.pts.unshift({ a: a.clone(), b: b.clone(), on });
    if (this.pts.length > TRAIL_N) this.pts.pop();
    const g = this.mesh.geometry;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      this.pos.set([p.a.x, p.a.y, p.a.z], i * 6); this.pos.set([p.b.x, p.b.y, p.b.z], i * 6 + 3);
      const al = (p.on && i < this.pts.length) ? (1 - i / TRAIL_N) * 0.75 : 0;
      this.col.set([this.color[0], this.color[1], this.color[2], al * 0.15], i * 8);
      this.col.set([this.color[0], this.color[1], this.color[2], al], i * 8 + 4);
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}
export const trails = [new Trail([0.75, 0.9, 1]), new Trail([0.75, 0.9, 1])];

/* ---- cables (camera-facing ribbons with sag) ---- */
const CAB_N = 20;
export class Cable {
  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(CAB_N * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < CAB_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x9aa4b0, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    scene.add(this.mesh);
    this.hook = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), new THREE.MeshLambertMaterial({ color: 0xc8ccd4, emissive: 0x303438 }));
    this.hook.visible = false; scene.add(this.hook);
  }
  set(a, b, sag, time) {
    const cp = camera.position, dir = _t1.subVectors(b, a), len = dir.length();
    this.mesh.visible = true; this.hook.visible = true;
    for (let i = 0; i < CAB_N; i++) {
      const f = i / (CAB_N - 1);
      const p = _t2.copy(a).addScaledVector(dir, f);
      p.y -= Math.sin(f * Math.PI) * sag;
      if (sag > 0.01) { const w = Math.sin(f * Math.PI * 3 + time * 30) * sag * 0.15; p.x += w; p.z += w * 0.5; }
      const tang = _t3.copy(dir).normalize();
      const toCam = _t4.subVectors(cp, p);
      const dist = toCam.length();
      const side = _t5.crossVectors(tang, toCam).normalize().multiplyScalar(Math.max(0.025, dist * 0.0018));
      this.pos[i * 6] = p.x - side.x; this.pos[i * 6 + 1] = p.y - side.y; this.pos[i * 6 + 2] = p.z - side.z;
      this.pos[i * 6 + 3] = p.x + side.x; this.pos[i * 6 + 4] = p.y + side.y; this.pos[i * 6 + 5] = p.z + side.z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.hook.position.copy(b);
    if (len > 0.01) this.hook.quaternion.setFromUnitVectors(_up, _t3.copy(dir).normalize());
    void len;
  }
  hide() { this.mesh.visible = false; this.hook.visible = false; }
}
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _t4 = new THREE.Vector3(), _t5 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/* ---- blob shadows ---- */
const shadowTex = makeCanvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
shadowTex.magFilter = THREE.LinearFilter; shadowTex.minFilter = THREE.LinearFilter;
const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
export function makeShadow() {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.renderOrder = 4; scene.add(m); return m;
}
export function groundBelow(x, y, z, maxD = 48) {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let yy = Math.floor(y); yy > Math.floor(y) - maxD && yy > 0; yy--) if (SOLID[getBlock(bx, yy, bz)]) return yy + 1;
  return -1e9;
}
export function placeShadow(m, x, y, z, size, maxD = 48) {
  const gy = groundBelow(x, y + 0.2, z, maxD);
  if (gy < -1e8) { m.visible = false; return; }
  const h = y - gy;
  m.visible = true; m.position.set(x, gy + 0.02, z);
  const s = size * (1 + h * 0.03); m.scale.set(s, 1, s);
  m.material.opacity = Math.max(0, 1 - h / maxD);
}

/* ---- screen shake & speed lines ---- */
export const shake = { trauma: 0, x: 0, y: 0, roll: 0 };
export function addShake(a) { shake.trauma = Math.min(1, shake.trauma + a); }
const linesCanvas = document.getElementById('speedlines');
const lctx = linesCanvas ? linesCanvas.getContext('2d') : null;
// slash: { k: swing progress 0..1, side: ±1, power: 0..1, fp: bool } — a bright crescent sweeping across the view
export function drawSpeedLines(amount, flash, slash) {
  if (!lctx) return;
  const w = linesCanvas.width = Math.floor(window.innerWidth / 2), h = linesCanvas.height = Math.floor(window.innerHeight / 2);
  lctx.clearRect(0, 0, w, h);
  if (flash > 0) { lctx.fillStyle = `rgba(255,255,255,${flash})`; lctx.fillRect(0, 0, w, h); }
  if (slash && slash.k >= 0 && slash.k < 1) drawSlashStreak(w, h, slash);
  if (amount <= 0.01) return;
  const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
  const n = Math.floor(18 + amount * 50);
  lctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r0 = R * (0.5 + Math.random() * 0.45), len = R * (0.1 + amount * 0.35) * (0.5 + Math.random());
    const ca = Math.cos(a), sa = Math.sin(a);
    lctx.strokeStyle = `rgba(255,255,255,${(0.12 + Math.random() * 0.33) * amount})`;
    lctx.lineWidth = 0.6 + Math.random() * 1.6 * amount;
    lctx.beginPath(); lctx.moveTo(cx + ca * r0, cy + sa * r0); lctx.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len)); lctx.stroke();
  }
}

function drawSlashStreak(w, h, S) {
  const k = S.k, e = 1 - Math.pow(1 - Math.min(1, k * 1.4), 3);
  // a flat crescent across the middle of the view (the top of a big circle), swept left→right or right→left
  const R = h * (S.fp ? 0.8 : 0.7) * (0.92 + S.power * 0.12), cx = w * 0.5, cy = h * (S.fp ? 0.52 : 0.5) + R;
  const a0 = S.side > 0 ? Math.PI * 1.17 : Math.PI * 1.83, a1 = S.side > 0 ? Math.PI * 1.83 : Math.PI * 1.17;
  const end = a0 + (a1 - a0) * e, tail = a0 + (a1 - a0) * Math.max(0, e - 0.45);
  const fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
  lctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    lctx.strokeStyle = i === 0 ? `rgba(160,210,255,${0.25 * fade})` : i === 1 ? `rgba(220,240,255,${0.55 * fade})` : `rgba(255,255,255,${0.9 * fade})`;
    lctx.lineWidth = (i === 0 ? 22 : i === 1 ? 10 : 3.5) * (S.fp ? 1.3 : 0.8) * (0.8 + S.power * 0.4);
    lctx.beginPath(); lctx.arc(cx, cy, R * (1 - i * 0.012), Math.min(tail, end), Math.max(tail, end)); lctx.stroke();
  }
}

/* ---- 3D cut arcs at the point of contact ---- */
const arcs = [];
const arcGeo = new THREE.RingGeometry(0.78, 1, 28, 1, 0, Math.PI * 1.15);
export function cutArc(p, size = 2, color = 0xffffff, life = 0.32) {
  const m = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  m.position.copy(p); m.renderOrder = 28; m.lookAt(camera.position); m.rotateZ(Math.random() * Math.PI * 2);
  m.scale.setScalar(size * 0.6); scene.add(m);
  arcs.push({ m, t: 0, life, size });
}
function updateArcs(dt) {
  for (let i = arcs.length - 1; i >= 0; i--) {
    const a = arcs[i]; a.t += dt; const f = a.t / a.life;
    a.m.scale.setScalar(a.size * (0.6 + f * 0.7)); a.m.material.opacity = Math.max(0, 1 - f * f);
    a.m.rotateZ(dt * 9);
    if (f >= 1) { scene.remove(a.m); a.m.material.dispose(); arcs.splice(i, 1); }
  }
}

export function updateFX(dt, light) {
  updateArcs(dt);
  steam.update(dt, light); sparks.update(dt, 1); puffs.update(dt, light);
  updateDebris(dt);
  shake.trauma = Math.max(0, shake.trauma - dt * 1.6);
  const s = shake.trauma * shake.trauma, t = performance.now() * 0.001;
  shake.x = (Math.sin(t * 47) + Math.sin(t * 91) * 0.5) * s * 0.35;
  shake.y = (Math.sin(t * 53 + 1) + Math.sin(t * 79) * 0.5) * s * 0.35;
  shake.roll = Math.sin(t * 41 + 2) * s * 0.05;
  fxUniforms.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.userData.fov || camera.fov) * Math.PI / 360)) / renderer.getPixelRatio() * renderer.getPixelRatio();
}
export function clearFX() { steam.clear(); sparks.clear(); puffs.clear(); debs.length = 0; debMesh.count = 0; }
void lightCol;

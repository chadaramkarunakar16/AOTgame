import * as THREE from 'three';

/**
 * Procedural Dynamic Slash Arc Ribbon VFX
 * Renders high-speed transparent anime "speed-line" blade trails when attacking or slicing napes.
 */
export class SlashArcVFX {
  public mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private uvs: Float32Array;
  private opacities: Float32Array;
  private maxSegments: number = 32;
  private currentSegments: number = 0;
  private activeTime: number = 0;
  private isSlashing: boolean = false;
  private arcPoints: { top: THREE.Vector3; bottom: THREE.Vector3 }[] = [];

  constructor() {
    this.positions = new Float32Array(this.maxSegments * 2 * 3);
    this.uvs = new Float32Array(this.maxSegments * 2 * 2);
    this.opacities = new Float32Array(this.maxSegments * 2);

    const indices: number[] = [];
    for (let i = 0; i < this.maxSegments - 1; i++) {
      const p1 = i * 2;
      const p2 = i * 2 + 1;
      const p3 = (i + 1) * 2;
      const p4 = (i + 1) * 2 + 1;
      indices.push(p1, p2, p3);
      indices.push(p2, p4, p3);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    this.geometry.setIndex(indices);

    // Speed-line anime blade slash material
    const slashMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        colorCore: { value: new THREE.Color(0xffffff) },
        colorEdge: { value: new THREE.Color(0x38bdf8) }, // Cyan-blue speedline tint
        alpha: { value: 0.0 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 colorCore;
        uniform vec3 colorEdge;
        uniform float alpha;
        varying vec2 vUv;
        void main() {
          // Sharp anime speed-line gradient along ribbon length (vUv.x) and width (vUv.y)
          float headToTail = smoothstep(0.0, 0.4, vUv.x) * smoothstep(1.0, 0.6, vUv.x);
          float edgeFactor = 1.0 - abs(vUv.y - 0.5) * 2.0;
          float coreIntensity = pow(edgeFactor, 2.5);

          vec3 finalColor = mix(colorEdge, colorCore, coreIntensity * 0.85);
          float finalAlpha = alpha * headToTail * (0.35 + coreIntensity * 0.65);

          gl_FragColor = vec4(finalColor, finalAlpha);
        }
      `
    });

    this.mesh = new THREE.Mesh(this.geometry, slashMat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * Trigger an anime speedline slash arc around the player or nape
   */
  public triggerSlash(center: THREE.Vector3, forwardDir: THREE.Vector3, rightDir: THREE.Vector3, isAirborne: boolean = false): void {
    this.isSlashing = true;
    this.activeTime = 0.32; // 320ms duration
    this.arcPoints = [];

    const numPoints = 28;
    const upDir = new THREE.Vector3(0, 1, 0);

    if (isAirborne) {
      // 360-degree horizontal Beyblade disc ribbon around the player
      const radius = 2.6;
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / (numPoints - 1)) * Math.PI * 2.0;
        const planarOffset = new THREE.Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        );
        const basePos = center.clone().add(planarOffset);
        const topPos = basePos.clone().addScaledVector(upDir, 0.45);
        const bottomPos = basePos.clone().addScaledVector(upDir, -0.45);
        this.arcPoints.push({ top: topPos, bottom: bottomPos });
      }
    } else {
      const radius = 2.4;
      const startAngle = -Math.PI * 0.65;
      const endAngle = Math.PI * 0.55;
      const swingUp = new THREE.Vector3().crossVectors(rightDir, forwardDir).normalize();

      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const angle = startAngle + (endAngle - startAngle) * t;

        // Arc in the swing plane with downward diagonal angle
        const planarOffset = forwardDir.clone().multiplyScalar(Math.cos(angle) * radius)
          .add(rightDir.clone().multiplyScalar(Math.sin(angle) * radius));

        const tilt = Math.sin(angle) * 0.8;
        const basePos = center.clone().add(planarOffset).addScaledVector(swingUp, tilt);

        const topPos = basePos.clone().addScaledVector(swingUp, 0.6);
        const bottomPos = basePos.clone().addScaledVector(swingUp, -0.6);

        this.arcPoints.push({ top: topPos, bottom: bottomPos });
      }
    }

    this.updateGeometry();
    this.mesh.visible = true;
  }

  private updateGeometry(): void {
    const count = Math.min(this.arcPoints.length, this.maxSegments);
    for (let i = 0; i < count; i++) {
      const pt = this.arcPoints[i];
      const idx = i * 6;
      this.positions[idx] = pt.top.x;
      this.positions[idx + 1] = pt.top.y;
      this.positions[idx + 2] = pt.top.z;

      this.positions[idx + 3] = pt.bottom.x;
      this.positions[idx + 4] = pt.bottom.y;
      this.positions[idx + 5] = pt.bottom.z;

      const uvIdx = i * 4;
      const u = i / (count - 1);
      this.uvs[uvIdx] = u;
      this.uvs[uvIdx + 1] = 1.0;
      this.uvs[uvIdx + 2] = u;
      this.uvs[uvIdx + 3] = 0.0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
  }

  public update(dt: number): void {
    if (!this.isSlashing) return;

    this.activeTime -= dt;
    const mat = this.mesh.material as THREE.ShaderMaterial;

    if (this.activeTime <= 0) {
      this.isSlashing = false;
      this.mesh.visible = false;
      mat.uniforms.alpha.value = 0.0;
      return;
    }

    // Fade curve: crisp fast entrance, smooth speed-line dissolve
    const progress = 1.0 - (this.activeTime / 0.28);
    const alphaVal = Math.sin(progress * Math.PI) * 0.95;
    mat.uniforms.alpha.value = Math.max(0, alphaVal);
  }
}

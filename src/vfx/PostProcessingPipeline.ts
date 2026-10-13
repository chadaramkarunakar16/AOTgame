import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Cinematic Anime Post-Processing Pipeline
 * 
 * Layers:
 * 1. RenderPass → base scene render
 * 2. Custom Color Grading → desaturated, high-contrast bleak AOT palette
 * 3. Motion Blur → per-frame velocity-based directional blur during ODM
 * 4. Vignette → radial darkening to focus player attention
 * 5. OutputPass → final sRGB color-space conversion
 * 
 * All shaders are written inline to avoid external dependencies.
 * Performance budget: <0.5ms total at 1080p on mid-tier GPU.
 */

// ─── Custom Shader: Cinematic Color Grading ─────────────────────────────
const CinematicColorGradeShader = {
  uniforms: {
    'tDiffuse': { value: null as THREE.Texture | null },
    'saturation': { value: 0.78 },
    'contrast': { value: 1.18 },
    'brightness': { value: 0.01 },
    // Slightly cool, desaturated "bleak" AOT tint
    'tintColor': { value: new THREE.Vector3(0.95, 0.96, 1.02) }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float brightness;
    uniform vec3 tintColor;
    varying vec2 vUv;

    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);

      // 1. Desaturation toward grey (AOT's muted bleakness)
      float luminance = dot(texColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 graded = mix(vec3(luminance), texColor.rgb, saturation);

      // 2. Contrast enhancement (S-curve approximation)
      graded = (graded - 0.5) * contrast + 0.5 + brightness;

      // 3. Cool cinematic tint
      graded *= tintColor;

      // 4. Clamp to valid range
      graded = clamp(graded, 0.0, 1.0);

      gl_FragColor = vec4(graded, texColor.a);
    }
  `
};

// ─── Custom Shader: Directional Motion Blur ──────────────────────────────
const MotionBlurShader = {
  uniforms: {
    'tDiffuse': { value: null as THREE.Texture | null },
    'velocityFactor': { value: 0.0 },
    'direction': { value: new THREE.Vector2(0.0, 0.0) }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float velocityFactor;
    uniform vec2 direction;
    varying vec2 vUv;

    void main() {
      vec2 texelSize = direction * velocityFactor;

      vec4 color = vec4(0.0);
      // 5-tap directional blur (performance-conscious)
      color += texture2D(tDiffuse, vUv - texelSize * 2.0) * 0.06;
      color += texture2D(tDiffuse, vUv - texelSize) * 0.24;
      color += texture2D(tDiffuse, vUv) * 0.40;
      color += texture2D(tDiffuse, vUv + texelSize) * 0.24;
      color += texture2D(tDiffuse, vUv + texelSize * 2.0) * 0.06;

      gl_FragColor = color;
    }
  `
};

// ─── Custom Shader: Radial Vignette ──────────────────────────────────────
const VignetteShader = {
  uniforms: {
    'tDiffuse': { value: null as THREE.Texture | null },
    'darkness': { value: 0.55 },
    'offset': { value: 1.1 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    varying vec2 vUv;

    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);

      // Smooth radial falloff from center
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      vignette = clamp(vignette, 0.0, 1.0);
      vignette = smoothstep(0.0, 1.0, vignette);

      texColor.rgb *= mix(1.0 - darkness, 1.0, vignette);
      gl_FragColor = texColor;
    }
  `
};

export class PostProcessingPipeline {
  public composer: EffectComposer;

  private colorGradePass: ShaderPass;
  private motionBlurPass: ShaderPass;
  private vignettePass: ShaderPass;

  // Cached velocity direction for motion blur
  private blurDirection: THREE.Vector2 = new THREE.Vector2();
  private currentBlurFactor: number = 0.0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.composer = new EffectComposer(renderer);

    // 1. Base Scene Render
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // 2. Cinematic Color Grading (desaturated, high-contrast bleak palette)
    this.colorGradePass = new ShaderPass(CinematicColorGradeShader);
    this.composer.addPass(this.colorGradePass);

    // 3. Directional Motion Blur (subtle, only during high-speed ODM)
    this.motionBlurPass = new ShaderPass(MotionBlurShader);
    this.composer.addPass(this.motionBlurPass);

    // 4. Radial Vignette (subtle center-focus)
    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);

    // 5. Output Pass (proper sRGB color-space conversion)
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  /**
   * Updates motion blur intensity and direction based on player velocity.
   * Called each frame from the game loop.
   * 
   * @param speed - Player's current speed in m/s
   * @param velocity - Player's velocity vector
   * @param camera - Current camera for screen-space velocity projection
   */
  public updateMotionBlur(
    speed: number,
    velocity: THREE.Vector3,
    camera: THREE.Camera
  ): void {
    // Motion blur activates smoothly above 18 m/s (~65 km/h ODM speed)
    const threshold = 18.0;
    const maxBlur = 0.012; // Subtle enough to avoid nausea

    if (speed > threshold) {
      const targetFactor = Math.min((speed - threshold) / 35.0, 1.0) * maxBlur;
      this.currentBlurFactor += (targetFactor - this.currentBlurFactor) * 0.12;

      // Project velocity direction into screen space
      const screenVel = velocity.clone().applyQuaternion(camera.quaternion);
      this.blurDirection.set(screenVel.x, screenVel.y).normalize();

      // If direction is essentially zero (moving straight toward camera), use slight vertical bias
      if (this.blurDirection.lengthSq() < 0.001) {
        this.blurDirection.set(0.0, 1.0);
      }
    } else {
      this.currentBlurFactor *= 0.88; // Smooth fade out
    }

    this.motionBlurPass.uniforms['velocityFactor'].value = this.currentBlurFactor;
    this.motionBlurPass.uniforms['direction'].value.copy(this.blurDirection);
  }

  /**
   * Dynamically adjust vignette intensity (darker during combat / damage)
   */
  public setVignetteIntensity(darkness: number): void {
    this.vignettePass.uniforms['darkness'].value = darkness;
  }

  /**
   * Render the full post-processing pipeline
   */
  public render(): void {
    this.composer.render();
  }

  /**
   * Handle window resize
   */
  public setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }
}

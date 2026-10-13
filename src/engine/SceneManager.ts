import * as THREE from 'three';

/**
 * Atmospheric, crisp daytime voxel sky & lighting matching the reference screenshots:
 * - Gradient sky dome (deep blue zenith to bright cyan horizon)
 * - Voxel blocky sun in the sky
 * - Sharp directional sunlight for defined block faces
 */
export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public dirLight: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;
  public hemiLight: THREE.HemisphereLight;
  public skyDome: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

    // 1. Atmosphere: Authentic Attack On Titan sky dome (Sunlit anime cerulean zenith down to bright warm haze)
    const skyGeo = new THREE.SphereGeometry(750, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x3b82f6) },    // Vibrant anime sky blue
        bottomColor: { value: new THREE.Color(0xcbe3f7) }, // Warm sunny horizon haze
        offset: { value: 18 },
        exponent: { value: 0.7 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // Warm atmospheric horizon fog matching sunlit green & brown valley
    this.scene.fog = new THREE.Fog(0xcbe3f7, 180, 800);

    // 2. Voxel Sun (Bright sunbeam source)
    const sunGeo = new THREE.PlaneGeometry(42, 42);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfffaed,
      side: THREE.DoubleSide
    });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(220, 320, 180);
    sunMesh.lookAt(0, 0, 0);
    this.scene.add(sunMesh);

    // 3. Camera setup: 72 deg FOV for natural third person perspective
    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / window.innerHeight,
      0.1,
      1200
    );

    // 4. WebGL Renderer: Crisp pixel fidelity, sRGB color space
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;

    // 5. Lighting: Warm bright sunlight and lush green ground bounce matching reference image
    this.dirLight = new THREE.DirectionalLight(0xfffae0, 1.45);
    this.dirLight.position.set(130, 190, 85);
    this.scene.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight(0xbfe0ff, 0x4d7c2a, 0.95);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(0xfff7ed, 0.45);
    this.scene.add(this.ambientLight);

    this.initResizeListener();
  }

  private initResizeListener(): void {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

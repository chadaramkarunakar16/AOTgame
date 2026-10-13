# Attack on Titan (AOT) ODM Gear - 3D Movement Prototype

An extensible, high-performance 3D movement prototype featuring **Omni-Directional Mobility (ODM) grappling physics**, built with **Three.js**, **Vite**, and **TypeScript**.

---

## 🎮 Game Controls

| Control | Action |
| :--- | :--- |
| **W, A, S, D** | Ground Locomotion / Airborne Air-Strafing |
| **Left Click** / **Q** | Launch **Left Grapple Hook** |
| **Right Click** / **E** | Launch **Right Grapple Hook** |
| **Space** | Ground Jump / Airborne **Cable Reel-in** (Slingshot) |
| **Left Shift** | **Gas Thruster Burst** (Accelerate in air / **Cushion Landing**) |
| **High-Speed Fly-by** | **Sever Titan Nape** (Strike back of neck at > 45 km/h) |
| **Mouse Look** | Pitch and Yaw Camera Orbit / Grapple Aiming |
| **V** | Toggle **1st-Person** / **3rd-Person** Camera View |
| **R** | Respawn / Reset Position & Restock Gas |

> ⚔️ **The Nape Mechanic**:  
> Titans are 12-meter tall wanderers with a precise weak-point box on the back of their necks (`napeBox`). To defeat a Titan, you must swing around them and strike the nape from behind or above at **sufficient velocity** ($\ge 45\text{ km/h}$). Delivering a successful strike triggers an anime hit-stop micro-pause, billowing steam, screen shake, and a kill notification banner!

> 💡 **Gas Landing Cushion (Fall Damage Protection)**:  
> When falling or descending at high speed toward terrain, trigger or hold **Left Shift** to activate your ODM gas retro-thrusters. The gear will fire a pneumatic cushion burst, safely absorbing your impact velocity and **negating 100% of fall damage** at the cost of a small amount of gas.

### 🎨 Visual & Art Direction (Attack on Titan Overhaul)
- **Cel-Shading & Toon Shading**: Implemented quantized 3-step luminance ramps via `MeshToonMaterial` paired with hardware-accelerated inverted-hull black outlines (`BackSide`).
- **Shiganshina Architecture**: European half-timbered plaster facades, dark Bavarian crossbeams, steep-gabled terracotta roofs, and the towering 60m monolithic Wall Maria.
- **Survey Corps Uniform**: High-collared cropped bolero jacket, leather harness webbing, white cargo pants, tall riding boots, and emerald green cape with the procedurally embroidered **'Wings of Freedom'** shield crest.
- **Uncanny Titans**: Dead-eyed stare with pinpoint pupils, grotesque ear-to-ear manic grin, asymmetrical non-uniform scaling ($10\text{m}\text{--}17\text{m}$), and a pulsating crimson nape muscle slit.
- **Muted & Dramatic Atmosphere**: Desaturated overcast sky, dramatic directional sunlight with high-contrast anime cell shadows, and a tight $68^\circ$ ground FOV creating claustrophobic street canyons and immense Titan scale.

---

## 🏗️ Architecture & Project Structure

```
AOT Game/
├── index.html                   # Game viewport, combat HUD, kill flash & banners
├── package.json                 # Dependencies and build scripts
├── tsconfig.json                # TypeScript bundler configuration
└── src/
    ├── main.ts                  # Engine bootstrap, combat tick & lifecycle coordinator
    ├── materials/
    │   └── CelShadingHelper.ts  # 3-step toon ramps, Wings of Freedom crest & procedural textures
    ├── combat/
    │   ├── Titan.ts             # Uncanny Titan NPC, non-uniform scaling, dead-eyed face & nape hitbox
    │   ├── TitanManager.ts      # Multi-titan squad spawning, combat collision & kill tracker
    │   └── BladeSlashVFX.ts     # Billowing evaporating steam particles & anime hit-stop time dilation
    ├── engine/
    │   ├── SceneManager.ts      # Muted anime sky, high-contrast shadows & tone mapping
    │   ├── InputManager.ts      # Pointer lock, keyboard & mouse state dispatcher
    │   └── AudioManager.ts      # Procedural Web Audio API sound generator (no assets required)
    ├── world/
    │   ├── Building.ts          # Block building definitions and AABB generation
    │   └── WorldGenerator.ts    # Shiganshina district architecture & 60m monolithic Wall Maria
    ├── physics/
    │   └── PhysicsWorld.ts      # Swept AABB collision resolution, raycasting & impact damage
    ├── player/
    │   ├── PlayerController.ts  # Master player state, movement physics, fall damage & health
    │   ├── GrappleSystem.ts     # Dual hooks, tension constraint, reeling & momentum conservation
    │   ├── PlayerModel.ts       # Survey Corps uniform, Wings of Freedom crest, cape & ODM gear
    │   └── CameraController.ts  # 1st/3rd person chase camera, claustrophobic 68° FOV & screen trauma
    ├── ui/
    │   └── HUD.ts               # Health/Gas gauges, kill counter, speedo, crosshairs & kill banner
    ├── vfx/
    │   ├── CableVFX.ts          # High-tension steel wire and anchor marker rendering
    │   └── SpeedLinesVFX.ts     # High-velocity anime wind particles
    └── network/
        ├── NetworkTypes.ts      # Multiplayer state snapshot interfaces
        └── NetworkAdapter.ts    # Extensible adapter pattern (ready for WebSockets/WebRTC)
```
    │   ├── SceneManager.ts      # Three.js renderer, lighting, fog & shadow pipeline
    │   ├── InputManager.ts      # Pointer lock, keyboard & mouse state dispatcher
    │   └── AudioManager.ts      # Procedural Web Audio API sound generator (no assets required)
    ├── world/
    │   ├── Building.ts          # Block building definitions and AABB generation
    │   └── WorldGenerator.ts    # Procedural Minecraft-style block city & Wall Maria perimeter
    ├── physics/
    │   └── PhysicsWorld.ts      # Swept AABB collision resolution, raycasting & impact damage
    ├── player/
    │   ├── PlayerController.ts  # Master player state machine, velocity, fall damage & health
    │   ├── GrappleSystem.ts     # Dual hooks, tension constraint, reeling & momentum conservation
    │   ├── PlayerModel.ts       # Modular 3D Scout character (Khaki jacket, cape, ODM gear)
    │   └── CameraController.ts  # 1st/3rd person chase camera, dynamic FOV, banking roll & screen shake
    ├── ui/
    │   └── HUD.ts               # Health/Gas gauges, speedometer, crosshairs & damage vignette
    ├── vfx/
    │   ├── CableVFX.ts          # High-tension steel wire and anchor marker rendering
    │   └── SpeedLinesVFX.ts     # High-velocity anime wind particles
    └── network/
        ├── NetworkTypes.ts      # Multiplayer state snapshot interfaces (packets, transforms)
        └── NetworkAdapter.ts    # Extensible adapter pattern (ready for WebSockets/WebRTC)
```

---

## ⚡ Core Mechanics Deep-Dive

### 1. Dual Hook Grappling & Arc Swinging
- Each hook (`leftHook` and `rightHook`) operates independently.
- When latched, the cable applies a **tension constraint**:
  $$\text{radialVelocity} = \vec{v} \cdot \hat{u}_{\text{anchor}}$$
  If moving away from the anchor ($\text{radialVelocity} < 0$), that outward component is projected out from the velocity vector:
  $$\vec{v} \leftarrow \vec{v} - (\vec{v} \cdot \hat{u}_{\text{anchor}}) \hat{u}_{\text{anchor}}$$
  This maintains pure kinetic energy, allowing the player to naturally swing in an arc.

### 2. Slingshot Reeling & Gas Propulsion
- Holding **Space** while airborne shortens the cable's resting length while applying an inward reel impulse. Because angular velocity $\omega = v / r$, decreasing the radius $r$ rapidly catapults the player forward and upward.
- Holding **Left Shift** expends gas to fire high-pressure thrusters, enabling high-speed maneuvers through alleyways up to 100+ km/h.

### 3. Collision Resolution & Impact Damage
- `PhysicsWorld.resolveMovement()` uses multi-iteration swept AABB collision resolution:
  - Prevents passing through building walls or the ground.
  - Automatically slides along wall tangents.
  - Measures deceleration into hard surfaces. If the collision speed exceeds `safeImpactSpeed` (18 m/s ~ 65 km/h), the player takes scaled impact damage accompanied by screen shake, a red vignette flash, and impact SFX.

---

## 🔌 Future Expansion Guides

### Appending Multiplayer
1. Open [`src/network/NetworkAdapter.ts`](file:///b:/AI%20Builds/AOT%20Game/src/network/NetworkAdapter.ts).
2. Replace `LocalMockNetworkAdapter` with a `WebSocketNetworkAdapter` or `GeckosNetworkAdapter` (WebRTC UDP).
3. The `PlayerStatePacket` interface in [`src/network/NetworkTypes.ts`](file:///b:/AI%20Builds/AOT%20Game/src/network/NetworkTypes.ts) already packages position, velocity, look angles, and dual-hook latch coordinates.
4. Remote players can instantiate multiple instances of [`PlayerModel`](file:///b:/AI%20Builds/AOT%20Game/src/player/PlayerModel.ts) and [`CableVFX`](file:///b:/AI%20Builds/AOT%20Game/src/vfx/CableVFX.ts).

### Swapping Custom Character Models & Animations
- [`PlayerModel.ts`](file:///b:/AI%20Builds/AOT%20Game/src/player/PlayerModel.ts) is fully decoupled from the physics controller.
- To use a custom rigged model, load your `.gltf` / `.glb` model via `GLTFLoader` inside `PlayerModel.ts`, assign `leftLauncherPos` and `rightLauncherPos` to the hip/gear bone sockets, and play walking/swinging animation clips via `THREE.AnimationMixer`.

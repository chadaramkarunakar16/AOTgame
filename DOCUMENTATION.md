# Titan Siege: Full Architecture & Multiplayer Networking Documentation

This document provides a comprehensive breakdown of the **Titan Siege** system architecture, how the peer-to-peer (P2P) networking operates simultaneously with the game on a single server, how to share and play with friends for free, and why this entire stack costs **$0.00**.

---

## 1. How to Connect and Share with Your Friend

You **only need to run a single server** (your current Vite server or any static web host). You do **NOT** need to host a separate game server, database, or backend daemon.

### Scenario A: On the Same Local Network (Wi-Fi / LAN)
If you and your friend are connected to the same home or office Wi-Fi:
1. Keep your Vite dev server running:
   ```powershell
   npm run dev -- --host
   ```
2. Your local network URL is:
   ```text
   http://192.168.29.211:5173/
   ```
3. Have your friend open `http://192.168.29.211:5173/` on their computer, laptop, or mobile browser.
4. One player clicks **Multiplayer** → **Create a Lobby**. The game generates a **6-character Room Code** (e.g. `K9X2P4`).
5. The other player opens the same page, clicks **Multiplayer**, enters the code in **Join with a Code**, and clicks **Join**.
6. Both of you are now in the same room. Pick your character (Scout or Titan) and start the match.

---

### Scenario B: Over the Internet (Different Houses / Different Wi-Fi)

Because WebRTC requires both players to load the web assets, you have two 100% free options to share with friends across the world:

#### Option 1: Free Tunneling (Instant & Zero Setup)
Run a temporary, secure tunnel that gives you a public HTTPS URL directly to your machine:
- **Using Cloudflare Tunnel (Free, no account required)**:
  ```powershell
  # In PowerShell / Terminal:
  npx cloudflared tunnel --url http://localhost:5173
  ```
  It gives you a public link like `https://random-words.trycloudflare.com`. Send that link to your friend.
- **Using Ngrok**:
  ```powershell
  npx ngrok http 5173
  ```

#### Option 2: Free 24/7 Cloud Hosting (Netlify / Vercel / GitHub Pages)
This game has **zero backend code**; it is 100% static client-side JavaScript, WebGL, Web Workers, and WebRTC.
1. Run a production build:
   ```powershell
   npm run build
   ```
2. Drag and drop the generated `dist/` folder into [Netlify Drop](https://app.netlify.com/drop) or push to a GitHub repository connected to Vercel/Netlify.
3. You get a permanent custom link (like `your-aot-game.netlify.app`) that anyone in the world can play anytime for **$0/month forever**.

---

## 2. How the Networking & App Work at the Same Time

### The Single-Server P2P Architecture
In traditional multiplayer games, you typically need two separate servers:
1. A **Web Server** to serve the HTML/CSS/JS frontend.
2. A **Dedicated Game Server** (Node.js/C++/Go) running at 60 Hz to calculate game physics, positions, collisions, and state synchronization.

Titan Siege eliminates the second server entirely by using a **Host-Authoritative Peer-to-Peer (P2P) WebRTC Model**:

```mermaid
flowchart TD
    subgraph Signaling ["Free Public Signaling (PeerJS Cloud)"]
        S[PeerJS Cloud Relay]
    end

    subgraph HostPlayer ["Host Player Browser (Your PC)"]
        H_Web["Vite Web Server (localhost:5173)"]
        H_Sim["Physics Simulation & World Engine (60 FPS)"]
        H_P2P["PeerJS Host Client (WebRTC DataChannel)"]
    end

    subgraph GuestPlayer ["Guest Player Browser (Friend's PC)"]
        G_Client["Render Engine & Local Prediction"]
        G_P2P["PeerJS Guest Client (WebRTC DataChannel)"]
    end

    H_Web -.->|"Delivers Game Files via HTTP"| GuestPlayer
    H_P2P <-->|"1. Exchange SDP & ICE Candidates"| S
    G_P2P <-->|"1. Exchange SDP & ICE Candidates"| S
    H_P2P <===>|"2. Direct Encrypted P2P DataChannel (UDP, <30ms)"| G_P2P
```

### Step-by-Step Connection Flow:
1. **Asset Delivery**: Both players fetch the game files via normal HTTP (port 5173 or Netlify).
2. **Signaling (Handshake)**:
   - When the Host creates a lobby, `PeerJS` connects to the free public PeerJS cloud STUN server and registers a temporary room ID.
   - When the Guest enters the room code, the signaling server connects the two browsers.
3. **Direct P2P Link**:
   - Once connected, the signaling server steps aside.
   - All subsequent game data flows **directly between the two computers** through a WebRTC DataChannel (using UDP for near-instant latency).
4. **Host Authority**:
   - The Host player's machine acts as the authoritative physics server. It updates Titan AI routes, Titan attack collisions, and block destruction.
   - The Guest machine sends input packets (look angles, grapple triggers, slashes) and receives compressed binary delta updates (`wire.js`).

---

## 3. Why This Entire Stack Costs $0.00

| Component | Industry Cost | How Titan Siege Makes It $0.00 |
| :--- | :--- | :--- |
| **Game Server Compute** | $20–$150/mo (AWS EC2 / DigitalOcean) | **Zero**. The Host player's browser executes the physics loop. No cloud instances are running. |
| **Signaling & Matchmaking** | $10–$50/mo | **Zero**. Handled by public PeerJS cloud STUN nodes that broker WebRTC connections for free. |
| **Web Asset Hosting** | $0–$20/mo | **Zero**. Pure static client files; Netlify, Vercel, and GitHub Pages host these free of charge. |
| **Bandwidth** | $0.08/GB | **Zero**. Traffic flows peer-to-peer over UDP; neither you nor a server provider pays for cloud data transfer. |
| **3D Assets & Textures** | Hundreds of dollars in licensing | **Zero**. All textures and sounds are procedural or free community assets under fair-use homage/creative commons. |

---

## 4. Complete Codebase Structure & Element Breakdown

```
b:\AI Builds\AOT Game\
├── index.html                  # Master entry point, cinematic start screen, and HUD overlays
├── package.json                # Project dependencies (Three.js, Vite, TypeScript)
├── DOCUMENTATION.md            # Complete architectural guide
├── public/
│   ├── art/                    # Original high-res artwork (title.jpg, captain.jpg, m1-m5.jpg)
│   ├── gen.js                  # Multi-threaded Simplex Noise procedural voxel generator
│   └── textures/minecraft/     # Official Minecraft block textures (stone, dirt, grass, oak)
└── src/
    └── canon/                  # Canonical Titan Siege Engine Modules
        ├── engine.js           # Three.js WebGL renderer, chunk mesher, sky/sun/fog, raycasting
        ├── game.js             # Main orchestrator: Player mobility, camera, combat loop, HUD
        ├── titans.js           # Titan mobs: AI pathfinding, animations, limb severing, nape hitbox
        ├── models.js           # Voxel Scout character rigging, cloak, Wings of Freedom, ODM gear
        ├── fx.js               # VFX: Levi cut arcs, anime hit-stops, speed lines, evaporating steam
        ├── mp.js               # Multiplayer lobby state, character picker, team balance, delta sync
        ├── net.js              # WebRTC networking wrappers & PeerJS socket connections
        ├── wire.js             # High-efficiency binary serialization / packet compression
        ├── bots.js             # AI scout and titan bots that seamlessly fill empty multiplayer slots
        ├── shifters.js         # Piloted Titan gameplay (Armored, Attack, Colossal forms)
        ├── pilot.js            # Shifter cockpit HUD, ability cool-downs, and controls
        ├── missions.js         # Single-player & co-op campaigns (Gale Run, Search & Rescue, Boss)
        ├── audio.js            # Dynamic Web Audio synthesizer: wind whistling, ODM reels, roars, music
        ├── fuel.js             # Gas canister resupply beacons and fuel pickup physics
        ├── characters.js       # Scout character stats (Levi, Mikasa, Eren, Armin)
        └── touch.js            # Mobile touchscreen virtual joysticks & responsive HUD adapter
```

---

## 5. How Each Core Element Operates

### A. Procedural Voxel Engine (`gen.js` & `engine.js`)
- **Simplex Noise Terrain**: Rather than loading multi-gigabyte 3D mesh files, `gen.js` uses 2D/3D Simplex noise with fractional Brownian motion (`fbm2`) to carve rolling hills, stepped grass plateaus, and rivers mathematically at runtime.
- **Web Workers**: Voxel chunks (16×16×128 blocks) are generated on background threads (`Web Workers`) so the main thread never drops below 60 FPS during chunk loading.
- **Greedy Meshing & Texture Atlas**: Adjacent block faces are culled before rendering. All block textures are baked into an atlas canvas (`actx`) rendered with `NearestFilter` to achieve the authentic pixel-art aesthetic.

### B. ODM Gear & Spider-Man Curve Swing Physics (`game.js`)
- **Pendulum Arc Calculation**: Anchoring a cable applies a centripetal constraint:
  $$\vec{a}_{\text{centripetal}} = \frac{v^2}{r} \hat{u}_{\text{anchor}}$$
- **Lateral Curve Carving**: When swinging, holding `A` or `D` applies a lateral force perpendicular to the cable plane, curving your trajectory around watchtowers, buildings, and Titan limbs.
- **Gas Thrusters**: Holding `Space` or `Shift` fires compressed gas jets that accelerate the player forward while consuming tank fuel.

### C. Combat & The "Before-the-Cut" Time Dilation (`game.js` & `titans.js`)
- **Targeting Overlay**: Raycasts project forward from the camera. When looking near a Titan's neck, the gold **STRIKE** ring appears.
- **Cinematic Time Dilation**: As the player closes within 9 meters of the nape from the rear, time scales down to 0.25× (`slowT = 1.2`), giving the player cinematic reflex control before the blade makes contact.
- **Limb Severing & Kneeling**:
  - Slashing legs disables walking; the Titan falls to its knees and remains immobilized until its 8.5-second regeneration timer expires.
  - Slashing arms disables grabbing and swiping for 6.0 seconds.
- **Minecraft Damage Flash & Death Steam**:
  - Hitting a Titan tints all its mesh materials red (`triggerHurtFlash`).
  - Slicing the nape triggers an 80ms hit-stop, deep red fade, billowing steam plumes, and full mesh dissolution.

### D. Tactical Map & Minimap (`game.js` & `index.html`)
- **Real-Time Compass**: The circular minimap at the top right rotates with your heading.
- **Proportional Dot Sizing**:
  - **Large / Colossal Titans** appear as **large red threat dots**.
  - **Small Scout Titans** appear as **small red dots**.
  - Yellow nape markers display behind each Titan to show their facing direction.
- **Tactical Map Toggle**: Pressing **`M`** toggles the full district view showing all active Titans, gas depots, and civilian rooftop locations.

# 3D Interactive Virtual Sprig — Design Spec

- **Date:** 2026-06-19
- **Status:** Approved
- **Supersedes:** the flat 2D SVG virtual Sprig in `apps/web` (spec §4.4 of the 2026-06-16 design)

## Context

The current web GUI shows the Sprig as a flat 2D SVG with the screen on a `<canvas>`. The
user wants the polished, interactive **3D console** vibe of sprig.hackclub.com — a real 3D
Sprig you can orbit/zoom, with the live game playing on its screen and **clickable 3D
buttons that actually drive the running program**. The underlying device plumbing
(`SprigDevice` → 160×128 RGBA framebuffer + button input) is unchanged; only the GUI's
presentation/interaction layer is replaced.

## Goals

- Replace the 2D SVG with a **Three.js** 3D scene (vanilla Three.js — fits the no-framework Vite+TS app).
- **Procedural model** of the Sprig (no external asset/licensing): rounded green PCB body in the real ~2.15:1 proportions, glossy black screen bezel, 8 buttons in the exact WASD+IJKL diamond layout, gold "sprig" label.
- **Live screen**: the device's 160×128 framebuffer as a nearest-filtered `DataTexture`, updated every frame, mapped onto the screen plane — the real game/firmware plays on the 3D device.
- **Interactive** (core requirement): click the 3D buttons → raycast → same `device.pressButton()` the keyboard uses → program responds, screen updates; orbit/zoom (OrbitControls, damping, gentle auto-rotate that pauses on interaction); keyboard still works; buttons depress + glow on press.
- Professional polish: RoomEnvironment reflections, key+fill lighting, ACES tone mapping, soft contact shadow.

## Non-goals (now)

- Running the **chip backend (custom firmware)** in this 3D view — same texture+input path applies, but deferred because the ARM interpreter needs a Web Worker to stay smooth. The 3D view drives the **engine backend** (games), as the web app does today.
- Photoreal/GLTF model; native Tauri shell.

## Architecture

Single component swap in `apps/web`:

```
apps/web/src/
  virtual-sprig-3d.ts   NEW — Three.js scene: procedural model, live DataTexture screen,
                              lights/env, OrbitControls, raycast button input.
                              Exposes: { canvas/mount, updateScreen(fb), setActive(btn,on),
                              onPress(cb), dispose() } — same shape main.ts expects.
  virtual-sprig.ts      REMOVED (2D SVG version).
  main.ts               MODIFIED — mount the 3D component; per-frame: device.getFramebuffer()
                              → updateScreen(); route 3D button presses → device.pressButton().
  geometry.ts           KEPT — button identities/order reused; 3D positions live in the new file.
  games.ts, styles.css  KEPT.
public/sprig-chassis.svg REMOVED (no longer used).
```

Deps: add `three` + `@types/three`.

## Key technical decisions (from research)

- **Live screen:** `THREE.DataTexture` wrapping the framebuffer `Uint8ClampedArray` (zero-copy via a `Uint8Array` view); `NearestFilter` min/mag, no mipmaps, `colorSpace = SRGBColorSpace`, `needsUpdate = true` each frame; unlit/`MeshBasicMaterial` (or `toneMapped:false`) so game pixels stay exact. Fix orientation empirically (`flipY`/`repeat`).
- **Model:** `RoundedBoxGeometry` body + screen `PlaneGeometry` + `CylinderGeometry` buttons (named for raycasting), grouped at origin.
- **Renderer:** `WebGLRenderer({antialias,alpha})`, ACESFilmic tone mapping, PCFSoft shadows, pixelRatio capped at 2; `PMREMGenerator.fromScene(new RoomEnvironment())` → `scene.environment`.
- **Controls:** `OrbitControls` (damping 0.08, autoRotate ~0.6 paused on interaction, pan off, distance + polar limits).
- **Input:** `Raycaster` on the 8 named button meshes → `pressButton`; hover → pointer cursor + emissive; press → depress mesh + glow.
- **Loop:** `device.getFramebuffer()` → write into the texture buffer → `needsUpdate` → `controls.update()` → `renderer.render()` → rAF.

## Verification

- **Unit:** button-name/index mapping; a pure "copy framebuffer into texture buffer" helper.
- **Visual:** Playwright screenshot of the running app — a game playing on the rotated 3D model; simulate a button click (or key) and confirm the sprite/screen changes.

## Risks

- WebGL/Three.js perf — scene is tiny (one device, ~12 meshes) + 160×128 texture; trivially 60fps.
- Texture orientation/color — corrected empirically against a known frame; locked by the visual check.

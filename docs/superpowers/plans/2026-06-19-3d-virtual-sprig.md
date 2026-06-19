# 3D Interactive Virtual Sprig — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the flat 2D SVG virtual Sprig in `apps/web` with an interactive **Three.js 3D console** — the live screen plays on the 3D model and the 3D buttons actually drive the running game.

**Architecture:** Vanilla Three.js scene in a new `virtual-sprig-3d.ts`, mounted by `main.ts`. The procedural model reuses the real PCB proportions/button layout from `geometry.ts`. The device's 160×128 framebuffer is uploaded each frame as a `DataTexture`; clicking button meshes raycasts → the same `device.pressButton()` the keyboard uses.

**Tech Stack:** Three.js 0.184+ (`three` + `@types/three`, `three/addons/*`), Vite, TypeScript, `@sprigscope/core`.

## Global Constraints
- Vanilla TS, no framework (keep the existing Vite setup).
- Live screen = `DataTexture`, Nearest filter, `SRGBColorSpace`, unlit material (game pixels exact).
- Buttons drive the SAME `device.pressButton(btn)` path as the keyboard.
- Verify visually with a Playwright screenshot (Edge channel) + an interaction check.

## File Structure
- Create `apps/web/src/virtual-sprig-3d.ts` — the Three.js component (model, screen texture, lights, controls, raycast input).
- Modify `apps/web/src/main.ts` — mount the 3D component; per-frame `getFramebuffer()→updateScreen()→render()`; route presses.
- Modify `apps/web/src/styles.css` — add `.stage` sizing; drop `.board`/`.btn` rules.
- Modify `apps/web/src/geometry.ts` — export a small pure `boardFractionToLocal()` helper (unit-tested).
- Delete `apps/web/src/virtual-sprig.ts` and `apps/web/public/sprig-chassis.svg` (2D version).
- Modify `apps/web/package.json` — add `three`, `@types/three`.

---

### Task 1: Geometry helper + deps

**Files:**
- Modify: `apps/web/src/geometry.ts`
- Test: `apps/web/test/geometry.test.ts`

- [ ] **Step 1: Add deps**

Run: `npm install -w @sprigscope/web three && npm install -w @sprigscope/web -D @types/three`

- [ ] **Step 2: Add the failing test** (append to `apps/web/test/geometry.test.ts`)

```ts
import { boardFractionToLocal } from '../src/geometry';

describe('boardFractionToLocal', () => {
  it('maps board fractions (origin top-left) to centered local coords (y up)', () => {
    expect(boardFractionToLocal(0.5, 0.5, 10, 6)).toEqual({ x: 0, y: 0 });
    expect(boardFractionToLocal(1, 0, 10, 6)).toEqual({ x: 5, y: 3 });   // top-right
    expect(boardFractionToLocal(0, 1, 10, 6)).toEqual({ x: -5, y: -3 }); // bottom-left
  });
});
```

- [ ] **Step 3: Run it (fails — not exported)**

Run: `npm test -w @sprigscope/web`  → FAIL (boardFractionToLocal undefined)

- [ ] **Step 4: Implement** (append to `apps/web/src/geometry.ts`)

```ts
/** Map a board fraction (0..1, origin top-left) to model-local coords (origin center, +y up). */
export function boardFractionToLocal(fx: number, fy: number, bodyW: number, bodyH: number): { x: number; y: number } {
  return { x: (fx - 0.5) * bodyW, y: (0.5 - fy) * bodyH };
}
```

- [ ] **Step 5: Run it (passes)** — `npm test -w @sprigscope/web` → PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/geometry.ts apps/web/test/geometry.test.ts apps/web/package.json package-lock.json
git commit -m "feat(web): add three.js dep and board->local geometry helper"
```

---

### Task 2: The 3D virtual-Sprig component

**Files:**
- Create: `apps/web/src/virtual-sprig-3d.ts`

**Interfaces:**
- Produces: `mountVirtualSprig3D(parent: HTMLElement): VirtualSprig3D` where
  `VirtualSprig3D = { updateScreen(fb: Framebuffer): void; setActive(btn: Button, active: boolean): void; onPress(cb: (btn: Button) => void): void; render(): void; dispose(): void }`.
- Consumes: `BUTTONS`, `Button`, `Framebuffer` from `@sprigscope/core`; `SCREEN_RECT`, `BUTTON_POS`, `BUTTON_DIAMETER`, `BOARD_ASPECT`, `boardFractionToLocal` from `./geometry`.

- [ ] **Step 1: Write `apps/web/src/virtual-sprig-3d.ts`**

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BUTTONS, type Button, type Framebuffer } from '@sprigscope/core';
import { SCREEN_RECT, BUTTON_POS, BUTTON_DIAMETER, BOARD_ASPECT, boardFractionToLocal } from './geometry';

const SCREEN_W = 160, SCREEN_H = 128;
const BODY_W = 14;
const BODY_H = BODY_W / BOARD_ASPECT; // real Sprig proportions
const BODY_D = 0.7;
const FRONT = BODY_D / 2;

export interface VirtualSprig3D {
  updateScreen(fb: Framebuffer): void;
  setActive(btn: Button, active: boolean): void;
  onPress(cb: (btn: Button) => void): void;
  render(): void;
  dispose(): void;
}

function goldLabel(): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8c46a'; g.font = 'bold 72px Verdana, sans-serif'; g.textBaseline = 'top';
  g.fillText('sprig', 6, 6);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.set(3.2, 1.2, 1);
  return s;
}

export function mountVirtualSprig3D(parent: HTMLElement): VirtualSprig3D {
  const container = document.createElement('div');
  container.className = 'stage';
  parent.appendChild(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const size = () => ({ w: container.clientWidth || 800, h: container.clientHeight || 520 });
  let { w, h } = size();
  renderer.setSize(w, h);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  camera.position.set(0, 1.5, 22);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(6, 9, 7); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005;
  key.shadow.camera.near = 1; key.shadow.camera.far = 60;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.6); fill.position.set(-7, 2, -5); scene.add(fill);

  const sprig = new THREE.Group(); scene.add(sprig);

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 6, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1f8f4e, roughness: 0.6, metalness: 0.0 }),
  );
  body.castShadow = true; body.receiveShadow = true; sprig.add(body);

  // gold "sprig" label, top-left of the board
  const labelPos = boardFractionToLocal(0.16, 0.16, BODY_W, BODY_H);
  const label = goldLabel(); label.position.set(labelPos.x, labelPos.y, FRONT + 0.05); sprig.add(label);

  // screen geometry from the real screen rect
  const screenW = SCREEN_RECT.w * BODY_W, screenH = SCREEN_RECT.h * BODY_H;
  const sc = boardFractionToLocal(SCREEN_RECT.x + SCREEN_RECT.w / 2, SCREEN_RECT.y + SCREEN_RECT.h / 2, BODY_W, BODY_H);

  const bezel = new THREE.Mesh(
    new RoundedBoxGeometry(screenW + 0.7, screenH + 0.7, 0.22, 4, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.25, metalness: 0.1 }),
  );
  bezel.position.set(sc.x, sc.y, FRONT); bezel.castShadow = true; sprig.add(bezel);

  const texBuf = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  const screenTex = new THREE.DataTexture(texBuf, SCREEN_W, SCREEN_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  screenTex.magFilter = THREE.NearestFilter; screenTex.minFilter = THREE.NearestFilter;
  screenTex.generateMipmaps = false; screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.flipY = true; screenTex.needsUpdate = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(sc.x, sc.y, FRONT + 0.13); sprig.add(screen);

  const btnR = (BUTTON_DIAMETER * BODY_W) / 2;
  const btnGeo = new THREE.CylinderGeometry(btnR, btnR, 0.3, 32);
  const baseZ = FRONT + 0.15;
  const btnMeshes = new Map<Button, THREE.Mesh>();
  for (const b of BUTTONS) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.45, metalness: 0.0, emissive: 0x000000 });
    const m = new THREE.Mesh(btnGeo, mat);
    m.rotation.x = Math.PI / 2;
    const p = boardFractionToLocal(BUTTON_POS[b].x, BUTTON_POS[b].y, BODY_W, BODY_H);
    m.position.set(p.x, p.y, baseZ); m.castShadow = true; m.name = b;
    sprig.add(m); btnMeshes.set(b, m);
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -BODY_H / 2 - 1.4; ground.receiveShadow = true; scene.add(ground);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.7;
  controls.enablePan = false; controls.minDistance = 14; controls.maxDistance = 34;
  controls.minPolarAngle = Math.PI * 0.22; controls.maxPolarAngle = Math.PI * 0.62;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  function setActive(btn: Button, active: boolean) {
    const m = btnMeshes.get(btn); if (!m) return;
    (m.material as THREE.MeshStandardMaterial).emissive.setHex(active ? 0xffcf3a : 0x000000);
    m.position.z = baseZ - (active ? 0.06 : 0);
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const meshes = [...btnMeshes.values()];
  const pressCbs: ((b: Button) => void)[] = [];
  const pick = (e: PointerEvent): Button | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit ? (hit.object.name as Button) : null;
  };
  renderer.domElement.addEventListener('pointerdown', (e) => {
    const b = pick(e); if (b) { pressCbs.forEach((cb) => cb(b)); setActive(b, true); }
  });
  renderer.domElement.addEventListener('pointerup', () => BUTTONS.forEach((b) => setActive(b, false)));
  renderer.domElement.addEventListener('pointermove', (e) => { renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab'; });

  const onResize = () => { const s = size(); renderer.setSize(s.w, s.h); camera.aspect = s.w / s.h; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', onResize);

  return {
    updateScreen(fb) { texBuf.set(fb.data); screenTex.needsUpdate = true; },
    setActive,
    onPress(cb) { pressCbs.push(cb); },
    render() { controls.update(); renderer.render(scene, camera); },
    dispose() {
      window.removeEventListener('resize', onResize);
      controls.dispose(); renderer.dispose(); pmrem.dispose(); screenTex.dispose(); container.remove();
    },
  };
}
```

- [ ] **Step 2: Build to typecheck/compile**

Run: `npm run build -w @sprigscope/web`  → succeeds (no TS errors). Fix any type issues (e.g., wrap the texture array if TS complains: it won't here since `texBuf` is already `Uint8Array`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/virtual-sprig-3d.ts
git commit -m "feat(web): add Three.js 3D virtual Sprig component"
```

---

### Task 3: Wire it in, remove the 2D version, verify visually

**Files:**
- Modify: `apps/web/src/main.ts`, `apps/web/src/styles.css`
- Delete: `apps/web/src/virtual-sprig.ts`, `apps/web/public/sprig-chassis.svg`

- [ ] **Step 1: Update `apps/web/src/styles.css`** — replace the `.board`/`img.chassis`/`.screen`/`.btn` rules with:

```css
.stage { width: min(94vw, 900px); height: 540px; cursor: grab; touch-action: none; }
.stage canvas { display: block; width: 100%; height: 100%; border-radius: 12px; }
```

- [ ] **Step 2: Update `apps/web/src/main.ts`** — swap the mount + render loop:

Replace the `import { mountVirtualSprig } from './virtual-sprig';` line with
`import { mountVirtualSprig3D } from './virtual-sprig-3d';`

Replace `const vs = mountVirtualSprig(app); const ctx = vs.canvas.getContext('2d')!;` with
`const vs = mountVirtualSprig3D(app);`

Replace the render loop (the `const screen = new ImageData(...)` block and `frame()`) with:

```ts
function frame() {
  vs.updateScreen(device.getFramebuffer());
  vs.render();
  requestAnimationFrame(frame);
}
```

(Keep `vs.onPress((b) => device.pressButton(b));` and the keydown/keyup handlers calling `vs.setActive`.)

- [ ] **Step 3: Delete the 2D files**

Run: `rm apps/web/src/virtual-sprig.ts apps/web/public/sprig-chassis.svg`

- [ ] **Step 4: Build + run unit tests**

Run: `npm run build -w @sprigscope/web && npm test -w @sprigscope/web`  → both pass.

- [ ] **Step 5: Visual verification (Playwright + installed Edge)**

Start preview, screenshot via the Playwright MCP (or `scripts/screenshot.mjs` with a longer wait so the model renders), confirm: the green 3D Sprig with the live game on its screen, 8 buttons, lighting/shadow. Then simulate input (press a key/click) and confirm the on-screen sprite moves. Adjust `screenTex.flipY` / camera if orientation looks off.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/main.ts apps/web/src/styles.css
git commit -m "feat(web): switch the virtual Sprig to the 3D console"
```

## Self-Review notes
- **Spec coverage:** model (Task 2 body/bezel/buttons/label), live screen (DataTexture in Task 2), interactivity (raycast + setActive Task 2; wired Task 3), orbit/auto-rotate (controls Task 2), keyboard kept (Task 3). Verification = unit (geometry) + Playwright visual.
- **Orientation/color** are resolved empirically in Task 3 Step 5 (flipY/camera), as the spec notes.
- **Scope:** engine backend only (games), per spec non-goals; chip backend in 3D deferred.

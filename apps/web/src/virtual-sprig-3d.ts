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
  screenshot(): string;
  dispose(): void;
}

function goldLabel(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8c46a';
  g.font = 'bold 66px Verdana, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('sprig', 160, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // A board-mounted plane (rotates with the device) rather than a camera-facing sprite.
  return new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.05), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}

export function mountVirtualSprig3D(parent: HTMLElement): VirtualSprig3D {
  const container = document.createElement('div');
  container.className = 'stage';
  parent.appendChild(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const size = () => ({ w: container.clientWidth || 800, h: container.clientHeight || 520 });
  const { w, h } = size();
  renderer.setSize(w, h);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  camera.position.set(0, 1.5, 22);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(6, 9, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.6);
  fill.position.set(-7, 2, -5);
  scene.add(fill);

  const sprig = new THREE.Group();
  scene.add(sprig);

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 6, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1f8f4e, roughness: 0.6, metalness: 0.0 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  sprig.add(body);

  const labelPos = boardFractionToLocal(0.22, 0.17, BODY_W, BODY_H);
  const label = goldLabel();
  label.position.set(labelPos.x, labelPos.y, FRONT + 0.02);
  sprig.add(label);

  const screenW = SCREEN_RECT.w * BODY_W;
  const screenH = SCREEN_RECT.h * BODY_H;
  const sc = boardFractionToLocal(SCREEN_RECT.x + SCREEN_RECT.w / 2, SCREEN_RECT.y + SCREEN_RECT.h / 2, BODY_W, BODY_H);

  const bezel = new THREE.Mesh(
    new RoundedBoxGeometry(screenW + 0.7, screenH + 0.7, 0.22, 4, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.25, metalness: 0.1 }),
  );
  bezel.position.set(sc.x, sc.y, FRONT);
  bezel.castShadow = true;
  sprig.add(bezel);

  const texBuf = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  const screenTex = new THREE.DataTexture(texBuf, SCREEN_W, SCREEN_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  screenTex.magFilter = THREE.NearestFilter;
  screenTex.minFilter = THREE.NearestFilter;
  screenTex.generateMipmaps = false;
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.flipY = true;
  screenTex.needsUpdate = true;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(screenW, screenH),
    new THREE.MeshBasicMaterial({ map: screenTex }),
  );
  screen.position.set(sc.x, sc.y, FRONT + 0.13);
  sprig.add(screen);

  const btnR = (BUTTON_DIAMETER * BODY_W) / 2;
  const btnGeo = new THREE.CylinderGeometry(btnR, btnR, 0.3, 32);
  const baseZ = FRONT + 0.15;
  const btnMeshes = new Map<Button, THREE.Mesh>();
  for (const b of BUTTONS) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.45, metalness: 0.0, emissive: 0x000000 });
    const m = new THREE.Mesh(btnGeo, mat);
    m.rotation.x = Math.PI / 2;
    const p = boardFractionToLocal(BUTTON_POS[b].x, BUTTON_POS[b].y, BODY_W, BODY_H);
    m.position.set(p.x, p.y, baseZ);
    m.castShadow = true;
    m.name = b;
    sprig.add(m);
    btnMeshes.set(b, m);
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -BODY_H / 2 - 1.4;
  ground.receiveShadow = true;
  scene.add(ground);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 14;
  controls.maxDistance = 34;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.62;
  // Gentle front-facing idle sway until the user grabs it (never shows the blank back).
  let userInteracted = false;
  controls.addEventListener('start', () => { userInteracted = true; });

  function setActive(btn: Button, active: boolean): void {
    const m = btnMeshes.get(btn);
    if (!m) return;
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
    const b = pick(e);
    if (b) { pressCbs.forEach((cb) => cb(b)); setActive(b, true); }
  });
  renderer.domElement.addEventListener('pointerup', () => BUTTONS.forEach((b) => setActive(b, false)));
  renderer.domElement.addEventListener('pointermove', (e) => {
    renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab';
  });

  const onResize = (): void => {
    const s = size();
    renderer.setSize(s.w, s.h);
    camera.aspect = s.w / s.h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return {
    updateScreen(fb) { texBuf.set(fb.data); screenTex.needsUpdate = true; },
    setActive,
    onPress(cb) { pressCbs.push(cb); },
    render() {
      if (!userInteracted) sprig.rotation.y = Math.sin(performance.now() * 0.0006) * 0.35;
      controls.update();
      renderer.render(scene, camera);
    },
    screenshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    dispose() {
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      pmrem.dispose();
      screenTex.dispose();
      container.remove();
    },
  };
}

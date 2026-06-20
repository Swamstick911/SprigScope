import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BUTTONS, type Button, type Framebuffer } from '@sprigscope/core';

const SCREEN_W = 160, SCREEN_H = 128;
const MODEL_URL = import.meta.env.BASE_URL + 'sprig.glb';

/** Screen-space position (CSS px, relative to the stage) of a model component,
 *  plus whether it currently faces the camera. */
export interface Anchor { x: number; y: number; front: boolean; }

export interface VirtualSprig3D {
  updateScreen(fb: Framebuffer): void;
  setActive(btn: Button, active: boolean): void;
  onPress(cb: (btn: Button) => void): void;
  onReady(cb: () => void): void;
  render(): void;
  screenshot(): string;
  /** Project a named component ('screen', a button letter, or a model node name)
   *  to stage pixels so an overlay label can point at it. Null until loaded. */
  getAnchor(name: string): Anchor | null;
  /** Move the 3D stage into another container and refit (used to hand the model
   *  from the landing screen to the app without reloading it). */
  reparent(parent: HTMLElement): void;
  /** How much margin to leave around the model when framing (1 = tight). The
   *  landing uses a larger value so there's room for copy beside the device. */
  setFraming(margin: number): void;
  dispose(): void;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export function mountVirtualSprig3D(parent: HTMLElement): VirtualSprig3D {
  const container = document.createElement('div');
  container.className = 'stage';
  parent.appendChild(container);

  if (!webglAvailable()) {
    container.innerHTML =
      '<div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center;color:#8b97a8;font-size:14px;line-height:1.6">' +
      "This browser/GPU can't run WebGL, which the 3D Sprig needs.<br>Try a recent Chrome, Edge, Firefox, or Safari." +
      '</div>';
    const noop = () => {};
    return { updateScreen: noop, setActive: noop, onPress: noop, onReady: (cb) => cb(), render: noop, screenshot: () => '', getAnchor: () => null, reparent: noop, setFraming: noop, dispose: noop };
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const size = () => ({ w: container.clientWidth || 800, h: container.clientHeight || 520 });
  let { w, h } = size();
  renderer.setSize(w, h);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  scene.add(camera);

  // Lighting/environment matching the Sprig homepage (RoomEnvironment for glossy reflections).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.AmbientLight(0xfcf4d5, 1));
  const camLight = new THREE.DirectionalLight(0xd3b947, 0.4);
  camLight.position.set(0, 0, 1000);
  camera.add(camLight);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 0.5));

  // Live screen texture (the running game's framebuffer).
  const texBuf = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  const screenTex = new THREE.DataTexture(texBuf, SCREEN_W, SCREEN_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  screenTex.magFilter = THREE.NearestFilter;
  screenTex.minFilter = THREE.NearestFilter;
  screenTex.generateMipmaps = false;
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.flipY = false;
  screenTex.needsUpdate = true;

  const pivot = new THREE.Group();
  scene.add(pivot);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  let userInteracted = false;
  controls.addEventListener('start', () => { userInteracted = true; });

  // Fit the model within the viewport on whichever axis is tighter, so the wide
  // device still fills a tall/narrow phone screen. Recomputed on resize.
  let modelRadius = 0;
  let frameMargin = 1.05;
  const frameCamera = (): void => {
    if (!modelRadius) return;
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = (modelRadius / Math.sin(Math.min(vFov, hFov) / 2)) * frameMargin;
    camera.position.set(0, 0, dist);
    controls.target.set(0, 0, 0);
    controls.minDistance = dist * 0.5;
    controls.maxDistance = dist * 1.9;
    controls.update();
  };

  // Per-button meshes (model nodes are named W A S D I J K L) + original scales for press feedback.
  const btnNodes = new Map<Button, THREE.Object3D>();
  const btnScale = new Map<Button, number>();
  let glass: THREE.Mesh | null = null;
  let modelRoot: THREE.Object3D | null = null;
  let loaded = false;
  const readyCbs: (() => void)[] = [];

  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      modelRoot = model;
      model.rotation.x = Math.PI / 2;
      model.rotation.y = -Math.PI / 2;
      pivot.add(model);

      // Center the model in the pivot and frame the camera to fit.
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      modelRadius = box.getBoundingSphere(new THREE.Sphere()).radius;
      frameCamera();

      // Screen: the 'Screen' node's child with material 'Glow Glass'.
      const screen = model.getObjectByName('Screen');
      const found = screen?.children.find(
        (c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.Material).name === 'Glow Glass',
      ) as THREE.Mesh | undefined;
      if (found) {
        found.material = new THREE.MeshBasicMaterial({ map: screenTex, side: THREE.DoubleSide });
        glass = found;
      }

      // Buttons: nodes named W..L (uppercase).
      for (const b of BUTTONS) {
        const node = model.getObjectByName(b.toUpperCase());
        if (node) { btnNodes.set(b, node); btnScale.set(b, node.scale.x); }
      }
      // Invisible anchor points for components the model doesn't name, so labels
      // can still point at them. Local frame (from the named nodes): +x is down
      // the board, +z is left, +y is toward the front face. Front parts sit near
      // the button plane (y≈0.4); the Pico + buzzer live on the back (y≈-4).
      const anchor = (name: string, x: number, y: number, z: number): void => {
        const o = new THREE.Object3D();
        o.name = name;
        o.position.set(x, y, z);
        model.add(o);
      };
      anchor('power', 7.5, 0.4, -3.9); // front, top-right slide switch
      anchor('usbc', 7.2, 0.4, 0.0); // front, top edge centre (micro-USB)
      anchor('rp2040', 8.7, -0.75, 0.0); // back, centre (Raspberry Pi Pico)
      anchor('speaker', 10.0, -0.75, 2.4); // back buzzer (approx)

      loaded = true;
      readyCbs.forEach((cb) => cb());
    },
    undefined,
    (err) => { console.error('Failed to load Sprig model:', err); },
  );

  function setActive(btn: Button, active: boolean): void {
    const node = btnNodes.get(btn);
    if (!node) return;
    const s = btnScale.get(btn) ?? 1;
    node.scale.setScalar(active ? s * 0.85 : s);
  }

  // Raycast input on the button nodes.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pressCbs: ((b: Button) => void)[] = [];
  const pick = (e: PointerEvent): Button | null => {
    if (!loaded) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([...btnNodes.values()], true);
    if (!hits.length) return null;
    let o: THREE.Object3D | null = hits[0].object;
    while (o) {
      for (const [b, node] of btnNodes) if (node === o) return b;
      o = o.parent;
    }
    return null;
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
    const s = size(); w = s.w; h = s.h;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userInteracted) frameCamera();
  };
  window.addEventListener('resize', onResize);

  // Project a component to stage pixels + decide if it's on the face toward the
  // camera (so back-facing labels can hide). Compare camera-space depth to the
  // model centre: a point nearer the camera than the centre is on the front.
  const _wp = new THREE.Vector3();
  const _cn = new THREE.Vector3();
  const resolveNode = (name: string): THREE.Object3D | null => {
    if (name === 'screen') return glass;
    if (name.length === 1 && btnNodes.has(name as Button)) return btnNodes.get(name as Button) ?? null;
    return modelRoot ? modelRoot.getObjectByName(name) ?? null : null;
  };
  const getAnchor = (name: string): Anchor | null => {
    const node = resolveNode(name);
    if (!node || !loaded) return null;
    node.getWorldPosition(_wp);
    pivot.getWorldPosition(_cn);
    const front = _wp.clone().applyMatrix4(camera.matrixWorldInverse).z >=
      _cn.applyMatrix4(camera.matrixWorldInverse).z;
    _wp.project(camera);
    return { x: (_wp.x * 0.5 + 0.5) * w, y: (-_wp.y * 0.5 + 0.5) * h, front };
  };

  return {
    updateScreen(fb) { texBuf.set(fb.data); screenTex.needsUpdate = true; },
    setActive,
    onPress(cb) { pressCbs.push(cb); },
    onReady(cb) { if (loaded) cb(); else readyCbs.push(cb); },
    render() {
      if (loaded && !userInteracted) pivot.rotation.y = Math.sin(performance.now() * 0.0005) * 0.4;
      controls.update();
      renderer.render(scene, camera);
    },
    screenshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    getAnchor,
    reparent(newParent: HTMLElement) {
      frameMargin = 1.05; // the app stage wants the device to fill the frame
      newParent.appendChild(container);
      onResize();
      frameCamera();
    },
    setFraming(margin: number) {
      frameMargin = margin;
      frameCamera();
    },
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

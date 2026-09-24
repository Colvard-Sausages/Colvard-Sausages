// Entry point. Two modes from one build:
//   interactive (default): plays the flyover once, then hands over to orbit controls.
//   render (?render=1&format=9x16|4x5|og): no loop; the capture script drives frames
//   through window.__renderFrame and every moving thing is a pure function of t.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HAZE, buildSky, buildLights, buildTerrain, buildTrees, buildHills, buildHayBales } from './scene/world.js';
import { buildVendorTents, buildColvardTent } from './scene/tents.js';
import { buildGrill } from './scene/grill.js';
import { buildPeople } from './scene/figures.js';
import { buildCrowd } from './scene/crowd.js';
import { makeCameraPath, DURATION, FOV } from './scene/camera.js';
import { makeOverlay } from './scene/overlay.js';
import { loadLogo } from './scene/logo.js';

const FORMATS = {
  '9x16': [1080, 1920],
  '4x5': [1080, 1350],
  og: [1200, 630],
};

const params = new URLSearchParams(window.location.search);
const renderMode = params.get('render') === '1';
const format = FORMATS[params.get('format')] ? params.get('format') : '9x16';

let resolveReady;
let rejectReady;
window.__ready = new Promise((res, rej) => {
  resolveReady = res;
  rejectReady = rej;
});

async function init() {
  if (renderMode) {
    const [w, h] = FORMATS[format];
    document.body.classList.add('render');
    document.body.style.setProperty('--w', `${w}px`);
    document.body.style.setProperty('--h', `${h}px`);
  }

  await Promise.all([
    document.fonts.load('400 64px "Zilla Slab"'),
    document.fonts.load('700 64px "Zilla Slab"'),
    document.fonts.load('400 64px "Archivo"'),
    document.fonts.load('800 64px "Archivo"'),
  ]);
  await document.fonts.ready;
  const logo = await loadLogo();

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: renderMode,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  window.__glInfo = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE, 0.0034);

  const smallScreen = !renderMode && Math.min(window.innerWidth, window.innerHeight) < 700;
  buildSky(scene);
  const lights = buildLights(scene);
  const { curves } = buildTerrain(scene);
  buildHills(scene);
  buildTrees(scene);
  buildHayBales(scene);
  const { tents } = buildVendorTents(scene);
  buildColvardTent(scene, logo);
  const grill = buildGrill(scene);
  const people = buildPeople(scene);
  const crowd = buildCrowd(scene, curves, tents, 400);
  const crowdCount = smallScreen ? 200 : 400;

  const camera = new THREE.PerspectiveCamera(FOV[renderMode ? format : 'interactive'], 1, 0.1, 3000);
  const path = makeCameraPath();
  const overlay = makeOverlay(document.getElementById('overlay'), logo.url);

  function resize() {
    let w;
    let h;
    if (renderMode) {
      [w, h] = FORMATS[format];
      renderer.setPixelRatio(1);
    } else {
      w = stage.clientWidth;
      h = stage.clientHeight;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      // Portrait phones get a taller lens; landscape screens a slightly tighter one.
      camera.fov = w / h < 0.8 ? 50 : 42;
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    grill.setPixelScale(h * renderer.getPixelRatio(), camera.fov);
  }
  resize();

  function updateScene(t) {
    crowd.update(t, crowdCount);
    people.update(t);
    grill.update(t, camera);
  }

  function renderAt(t) {
    const { pos, target } = path.at(t);
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    lights.updateShadow(camera.position, target);
    updateScene(t);
    overlay.update(t);
    renderer.render(scene, camera);
  }

  if (renderMode) {
    window.__renderFrame = (frameIndex, fps) => {
      renderAt(frameIndex / fps);
      return true;
    };
    window.__renderTime = (t) => {
      renderAt(t);
      return true;
    };
    renderer.compile(scene, camera);
    renderAt(0);
    return;
  }

  // Interactive mode.
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 70;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.48;
  controls.target.set(-0.4, 1.2, 1.6);

  const info = document.getElementById('info');
  const replay = document.getElementById('replay');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let start = performance.now();
  let flying = !reduceMotion;
  if (!flying) start -= (DURATION + 1) * 1000;

  function handOver() {
    flying = false;
    const { pos } = path.final();
    camera.position.copy(pos);
    controls.target.set(-0.4, 1.2, 1.6);
    controls.enabled = true;
    controls.update();
    info.classList.add('show');
  }
  if (!flying) handOver();

  replay.addEventListener('click', () => {
    start = performance.now();
    flying = true;
    controls.enabled = false;
    info.classList.remove('show');
  });
  window.addEventListener('resize', resize);

  function loop() {
    const t = (performance.now() - start) / 1000;
    if (flying && t >= DURATION + 0.6) handOver();
    if (flying) {
      const { pos, target } = path.at(t);
      camera.position.copy(pos);
      camera.lookAt(target);
      lights.updateShadow(camera.position, target);
      overlay.update(t);
    } else {
      controls.update();
      lights.updateShadow(camera.position, controls.target);
      overlay.update(t, DURATION);
    }
    updateScene(t);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  document.getElementById('loading').classList.add('done');
  requestAnimationFrame(loop);
}

init().then(resolveReady, (err) => {
  console.error(err);
  rejectReady(err);
});

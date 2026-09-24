// The grill: firebox, glowing coals, sausages, pan of peppers and onions, smoke and embers.
// All motion is a pure function of t.
import * as THREE from 'three';
import { GRILL, SUN_DIR } from './layout.js';
import { makeRng, hash2, SEED, smoothstep } from './util.js';

function puffTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rng = makeRng(SEED + 55);
  const blobs = [];
  for (let i = 0; i < 14; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.28);
    blobs.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, rng.range(0.14, 0.3)]);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let d = 0;
      for (const [bx, by, br] of blobs) {
        const q = Math.hypot(u - bx, v - by) / br;
        d += Math.max(0, 1 - q * q) * 0.55;
      }
      const edge = 1 - smoothstep(0.3, 0.5, Math.hypot(u - 0.5, v - 0.5));
      const val = Math.min(1, d) * edge;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(val * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function sausageTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#8A4A26');
  grad.addColorStop(0.5, '#A4592C');
  grad.addColorStop(1, '#6E3419');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = 'rgba(35,15,8,0.75)';
  for (let x = 14; x < 128; x += 26) {
    g.save();
    g.translate(x, 32);
    g.rotate(0.5);
    g.fillRect(-3, -40, 6, 80);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SMOKE_COUNT = 170;
const SMOKE_LIFE = 5.5;
const EMBER_COUNT = 48;
const EMBER_LIFE = 1.4;

export function buildGrill(scene) {
  const group = new THREE.Group();
  group.position.set(GRILL.x, 0, GRILL.z);
  const steel = new THREE.MeshStandardMaterial({ color: '#1E1D1C', roughness: 0.55, metalness: 0.6 });
  const castIron = new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.7, metalness: 0.5 });
  const { w, d, top } = GRILL;
  const boxH = 0.34;
  const boxBottom = top - boxH;

  // Firebox: open-top steel box.
  const wall = (sx, sy, sz, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), steel);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  wall(w, 0.03, d, 0, boxBottom, 0);
  wall(w, boxH, 0.03, 0, boxBottom + boxH / 2, d / 2);
  wall(w, boxH, 0.03, 0, boxBottom + boxH / 2, -d / 2);
  wall(0.03, boxH, d, w / 2, boxBottom + boxH / 2, 0);
  wall(0.03, boxH, d, -w / 2, boxBottom + boxH / 2, 0);
  // Legs and a lower shelf with split hardwood.
  for (const [x, z] of [
    [-w / 2 + 0.05, d / 2 - 0.05],
    [w / 2 - 0.05, d / 2 - 0.05],
    [w / 2 - 0.05, -d / 2 + 0.05],
    [-w / 2 + 0.05, -d / 2 + 0.05],
  ]) {
    wall(0.04, boxBottom, 0.04, x, boxBottom / 2, z);
  }
  wall(w - 0.08, 0.02, d - 0.08, 0, 0.18, 0);
  const logMat = new THREE.MeshStandardMaterial({ color: '#4E3A28', roughness: 0.95 });
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, w * 0.7, 6), logMat);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.24 + (i > 2 ? 0.09 : 0), -0.18 + (i % 3) * 0.12 + (i > 2 ? 0.06 : 0));
    log.castShadow = true;
    group.add(log);
  }

  // Grate bars.
  const barGeo = new THREE.BoxGeometry(0.012, 0.015, d - 0.04);
  for (let x = -w / 2 + 0.04; x <= w / 2 - 0.03; x += 0.045) {
    const b = new THREE.Mesh(barGeo, castIron);
    b.position.set(x, top, 0);
    group.add(b);
  }
  for (const z of [-d / 2 + 0.03, 0, d / 2 - 0.03]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.02, 0.015), castIron);
    b.position.set(0, top - 0.005, z);
    group.add(b);
  }

  // Coals: instanced chunks whose glow flickers with t.
  const rng = makeRng(SEED + 61);
  const coalCount = 170;
  const coalGeo = new THREE.DodecahedronGeometry(1, 0);
  const coalMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  const coals = new THREE.InstancedMesh(coalGeo, coalMat, coalCount);
  const coalInfo = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < coalCount; i++) {
    const s = rng.range(0.022, 0.05);
    dummy.position.set(rng.range(-w / 2 + 0.06, w / 2 - 0.06), boxBottom + 0.03 + rng.range(0, 0.1), rng.range(-d / 2 + 0.06, d / 2 - 0.06));
    dummy.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
    dummy.scale.set(s, s * rng.range(0.6, 1), s);
    dummy.updateMatrix();
    coals.setMatrixAt(i, dummy.matrix);
    coalInfo.push({ heat: rng.range(0.2, 1), f: rng.range(1.5, 5), p: rng.range(0, 6.28) });
    coals.setColorAt(i, new THREE.Color(1, 0.4, 0.1));
  }
  group.add(coals);
  // Glow bed beneath the coals.
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.08, d - 0.08),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.42, 0.08) }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = boxBottom + 0.02;
  group.add(bed);

  // Sausages on the left two thirds of the grate.
  const sGeo = new THREE.CapsuleGeometry(0.021, 0.15, 4, 10);
  sGeo.rotateZ(Math.PI / 2);
  const sMat = new THREE.MeshStandardMaterial({ map: sausageTexture(), roughness: 0.42, metalness: 0.0 });
  const sausages = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      const m = new THREE.Mesh(sGeo, sMat);
      m.position.set(-w / 2 + 0.16 + col * 0.2 + rng.range(-0.015, 0.015), top + 0.028, -d / 2 + 0.1 + row * 0.105);
      m.rotation.y = rng.range(-0.12, 0.12);
      m.rotation.x = rng.range(0, 6.28);
      m.castShadow = true;
      group.add(m);
      sausages.push(m);
    }
  }

  // Cast-iron pan of peppers and onions on the right third.
  const pan = new THREE.Group();
  const panR = 0.17;
  const panBody = new THREE.Mesh(new THREE.CylinderGeometry(panR, panR * 0.92, 0.05, 28, 1, true), castIron);
  panBody.position.y = 0.025;
  const panBase = new THREE.Mesh(new THREE.CircleGeometry(panR * 0.92, 28), castIron);
  panBase.rotation.x = -Math.PI / 2;
  panBase.position.y = 0.004;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.035), castIron);
  handle.position.set(panR + 0.07, 0.035, 0);
  pan.add(panBody, panBase, handle);
  const vegColours = ['#B8321F', '#3F7A2B', '#D9A441', '#E9DDBF', '#E9DDBF', '#B8321F', '#E6D6AE'];
  const vegGeo = new THREE.BoxGeometry(0.06, 0.012, 0.014);
  const onionGeo = new THREE.TorusGeometry(0.03, 0.006, 4, 10, Math.PI);
  for (let i = 0; i < 70; i++) {
    const colr = rng.pick(vegColours);
    const onion = colr === '#E9DDBF' || colr === '#E6D6AE';
    const m = new THREE.Mesh(onion ? onionGeo : vegGeo, new THREE.MeshStandardMaterial({ color: colr, roughness: 0.45 }));
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * (panR - 0.03);
    m.position.set(Math.cos(a) * r, 0.015 + rng.range(0, 0.03), Math.sin(a) * r);
    m.rotation.set(onion ? -Math.PI / 2 + rng.range(-0.4, 0.4) : rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3));
    pan.add(m);
  }
  pan.position.set(w / 2 - 0.25, top + 0.012, 0.02);
  group.add(pan);

  // Warm light from the coals, flickering.
  const coalLight = new THREE.PointLight('#FF8A3A', 2.4, 4.5, 1.6);
  coalLight.position.set(0, top + 0.12, 0);
  group.add(coalLight);

  scene.add(group);

  // Smoke: camera-facing quads with forward scattering toward the low sun.
  const quad = new THREE.PlaneGeometry(1, 1);
  const smokeGeo = new THREE.InstancedBufferGeometry();
  smokeGeo.index = quad.index;
  smokeGeo.setAttribute('position', quad.attributes.position);
  smokeGeo.setAttribute('uv', quad.attributes.uv);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_COUNT * 3), 3);
  const iSize = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_COUNT), 1);
  const iAlpha = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_COUNT), 1);
  const iRot = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_COUNT), 1);
  const iWarm = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_COUNT), 1);
  for (const a of [iPos, iSize, iAlpha, iRot, iWarm]) a.setUsage(THREE.DynamicDrawUsage);
  smokeGeo.setAttribute('iPos', iPos);
  smokeGeo.setAttribute('iSize', iSize);
  smokeGeo.setAttribute('iAlpha', iAlpha);
  smokeGeo.setAttribute('iRot', iRot);
  smokeGeo.setAttribute('iWarm', iWarm);
  smokeGeo.instanceCount = SMOKE_COUNT;
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      puff: { value: puffTexture() },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: new THREE.Color('#FFC27A') },
      shade: { value: new THREE.Color('#5E6068') },
      emberColor: { value: new THREE.Color('#FF8A45') },
    },
    vertexShader: /* glsl */ `
      attribute vec3 iPos;
      attribute float iSize;
      attribute float iAlpha;
      attribute float iRot;
      attribute float iWarm;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vWarm;
      varying vec3 vWorld;
      void main() {
        vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
        float c = cos(iRot);
        float s = sin(iRot);
        mv.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSize;
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        vAlpha = iAlpha;
        vWarm = iWarm;
        vWorld = iPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D puff;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform vec3 shade;
      uniform vec3 emberColor;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vWarm;
      varying vec3 vWorld;
      void main() {
        float dens = texture2D(puff, vUv).r;
        vec3 v = normalize(vWorld - cameraPosition);
        float cosT = dot(v, sunDir);
        float g = 0.62;
        float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
        float lit = smoothstep(1.2, 2.6, vWorld.y) * 0.6 + 0.4;
        vec3 col = shade * 0.75 + sunColor * (0.06 + hg * 0.42) * lit;
        col = mix(col, emberColor, vWarm * 0.3);
        float a = dens * vAlpha;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const smoke = new THREE.Mesh(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  smoke.renderOrder = 5;
  scene.add(smoke);

  // Embers: small additive points rising from the coals.
  const eGeo = new THREE.BufferGeometry();
  const ePos = new THREE.BufferAttribute(new Float32Array(EMBER_COUNT * 3), 3);
  const eA = new THREE.BufferAttribute(new Float32Array(EMBER_COUNT), 1);
  ePos.setUsage(THREE.DynamicDrawUsage);
  eA.setUsage(THREE.DynamicDrawUsage);
  eGeo.setAttribute('position', ePos);
  eGeo.setAttribute('alpha', eA);
  const eMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { scale: { value: 900 } },
    vertexShader: /* glsl */ `
      attribute float alpha;
      uniform float scale;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, 0.018 * scale / -mv.z);
        gl_Position = projectionMatrix * mv;
        vA = alpha;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float f = smoothstep(0.5, 0.0, length(q));
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * 2.2 * f * vA, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const embers = new THREE.Points(eGeo, eMat);
  embers.frustumCulled = false;
  embers.renderOrder = 6;
  scene.add(embers);

  const cold = new THREE.Color(0.07, 0.05, 0.045);
  const hot = new THREE.Color(2.2, 0.62, 0.12);
  const tmpC = new THREE.Color();
  const order = new Array(SMOKE_COUNT).fill(0).map((_, i) => i);
  const px = new Float32Array(SMOKE_COUNT);
  const py = new Float32Array(SMOKE_COUNT);
  const pz = new Float32Array(SMOKE_COUNT);
  const ps = new Float32Array(SMOKE_COUNT);
  const pa = new Float32Array(SMOKE_COUNT);
  const pr = new Float32Array(SMOKE_COUNT);
  const pw = new Float32Array(SMOKE_COUNT);
  const depth = new Float32Array(SMOKE_COUNT);
  const wind = { x: -0.2, z: 0.16 };
  const srcX = GRILL.x - 0.1;
  const srcZ = GRILL.z;
  const srcY = top + 0.05;

  function update(t, camera) {
    // Coal flicker.
    for (let i = 0; i < coalCount; i++) {
      const c = coalInfo[i];
      const k = Math.max(0, Math.min(1, c.heat + 0.25 * Math.sin(t * c.f + c.p) + 0.1 * Math.sin(t * c.f * 2.3 + c.p * 1.7)));
      tmpC.copy(cold).lerp(hot, k * k);
      coals.setColorAt(i, tmpC);
    }
    coals.instanceColor.needsUpdate = true;
    coalLight.intensity = 2.3 + 0.35 * Math.sin(t * 7.1) + 0.2 * Math.sin(t * 13.3 + 1.2);

    // Sausages turn slowly, as if being rolled.
    for (let i = 0; i < sausages.length; i++) sausages[i].rotation.x = hash2(i, 3) * 6.28 + Math.floor((t + hash2(i, 5) * 9) / 4.5) * 1.1;

    // Smoke.
    const cam = camera.position;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const birth = (i / SMOKE_COUNT) * SMOKE_LIFE;
      const since = t + 30 - birth;
      const cycle = Math.floor(since / SMOKE_LIFE);
      const age = since - cycle * SMOKE_LIFE;
      const h1 = hash2(i, cycle);
      const h2 = hash2(i + 777, cycle);
      const h3 = hash2(i + 1555, cycle);
      const drift = Math.pow(age, 1.25);
      const sx = srcX + (h1 - 0.5) * GRILL.w * 0.8;
      const sz = srcZ + (h2 - 0.5) * GRILL.d * 0.7;
      const rise = age * 0.78 - age * age * 0.03;
      const turb = 0.08 * age + 0.05 * age * age;
      px[i] = sx + wind.x * drift + Math.sin(age * 1.3 + h3 * 6.28) * turb;
      py[i] = srcY + rise + Math.sin(age * 0.9 + h1 * 6.28) * 0.05 * age;
      pz[i] = sz + wind.z * drift + Math.cos(age * 1.1 + h2 * 6.28) * turb;
      ps[i] = 0.16 + age * 0.3 + h3 * 0.12;
      const fadeIn = smoothstep(0, 0.5, age);
      const fadeOut = 1 - smoothstep(SMOKE_LIFE * 0.25, SMOKE_LIFE, age);
      pa[i] = 0.24 * fadeIn * fadeOut * (0.5 + h2 * 0.9);
      pr[i] = h1 * 6.28 + age * (h3 - 0.5) * 0.6;
      pw[i] = 1 - smoothstep(0, 1.2, age);
      const dx = px[i] - cam.x;
      const dy = py[i] - cam.y;
      const dz = pz[i] - cam.z;
      depth[i] = dx * dx + dy * dy + dz * dz;
    }
    order.sort((a, b) => depth[b] - depth[a]);
    for (let j = 0; j < SMOKE_COUNT; j++) {
      const i = order[j];
      iPos.setXYZ(j, px[i], py[i], pz[i]);
      iSize.setX(j, ps[i]);
      iAlpha.setX(j, pa[i]);
      iRot.setX(j, pr[i]);
      iWarm.setX(j, pw[i]);
    }
    for (const a of [iPos, iSize, iAlpha, iRot, iWarm]) a.needsUpdate = true;

    // Embers.
    for (let i = 0; i < EMBER_COUNT; i++) {
      const birth = (i / EMBER_COUNT) * EMBER_LIFE;
      const since = t + 30 - birth;
      const cycle = Math.floor(since / EMBER_LIFE);
      const age = since - cycle * EMBER_LIFE;
      const h1 = hash2(i + 3000, cycle);
      const h2 = hash2(i + 4000, cycle);
      const x = GRILL.x + (h1 - 0.5) * GRILL.w * 0.8 + wind.x * age * 0.6 + Math.sin(age * 6 + h2 * 6) * 0.03;
      const y = srcY + age * (0.5 + h2 * 0.5);
      const z = GRILL.z + (h2 - 0.5) * GRILL.d * 0.7 + wind.z * age * 0.6;
      ePos.setXYZ(i, x, y, z);
      eA.setX(i, (1 - age / EMBER_LIFE) * (h1 > 0.35 ? 1 : 0));
    }
    ePos.needsUpdate = true;
    eA.needsUpdate = true;
  }

  function setPixelScale(heightPx, fovDeg) {
    eMat.uniforms.scale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  return { group, update, setPixelScale };
}

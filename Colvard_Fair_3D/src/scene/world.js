// Sky, lighting, terrain, treeline, hills and hay bales.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIELD, SUN_DIR, heightAt, pathCurves, tentLayout, insideAnyTent } from './layout.js';
import { makeRng, fbm, hash2, smoothstep, SEED } from './util.js';

export const HAZE = new THREE.Color('#E6BF8C');

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(1400, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizon: { value: new THREE.Color('#F2B574') },
      zenith: { value: new THREE.Color('#7FA2BA') },
      haze: { value: HAZE.clone() },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: new THREE.Color('#FFD9A0') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon;
      uniform vec3 zenith;
      uniform vec3 haze;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(smoothstep(0.0, 0.62, h), 0.8));
        col = mix(haze, col, smoothstep(-0.02, 0.09, d.y));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.8 + pow(s, 900.0) * 6.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

export function buildLights(scene) {
  const sun = new THREE.DirectionalLight('#FFBE73', 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight('#C9D6DE', '#6E5A3C', 1.35);
  scene.add(hemi);

  // Warm bounce from the sunlit field toward the camera side.
  const fill = new THREE.DirectionalLight('#FFD2A6', 0.55);
  fill.position.set(30, 18, 60);
  scene.add(fill);

  const tmp = new THREE.Vector3();
  const lightSpace = new THREE.Matrix4();
  // Fit the shadow frustum to the area the camera is looking at, snapped to texels.
  function updateShadow(camPos, target) {
    const dist = camPos.distanceTo(target);
    const half = THREE.MathUtils.clamp(dist * 0.75, 9, 130);
    const centre = tmp.copy(target);
    lightSpace.lookAt(SUN_DIR, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    const inv = lightSpace.clone().invert();
    centre.applyMatrix4(inv);
    const texel = (half * 2) / sun.shadow.mapSize.x;
    centre.x = Math.round(centre.x / texel) * texel;
    centre.y = Math.round(centre.y / texel) * texel;
    centre.applyMatrix4(lightSpace);
    sun.target.position.copy(centre);
    sun.position.copy(centre).addScaledVector(SUN_DIR, 250);
    const cam = sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.far = 520;
    cam.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
  }
  return { sun, hemi, fill, updateShadow };
}

// Tileable value noise for the grass detail texture.
function periodicNoise(x, y, period) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = (a) => ((a % period) + period) % period;
  const a = hash2(w(ix), w(iy));
  const b = hash2(w(ix + 1), w(iy));
  const c = hash2(w(ix), w(iy + 1));
  const d = hash2(w(ix + 1), w(iy + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function detailTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      n += periodicNoise(x / 32, y / 32, 8) * 0.35;
      n += periodicNoise(x / 8, y / 8, 32) * 0.35;
      n += periodicNoise(x / 2, y / 2, 128) * 0.3;
      const k = 0.78 + n * 0.44;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(k * 127);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const GROUND_REGION = { x0: -130, z0: -100, size: 260 };

function groundTexture(curves) {
  const size = 2048;
  const scale = size / GROUND_REGION.size;
  const toPx = (x, z) => [(x - GROUND_REGION.x0) * scale, (z - GROUND_REGION.z0) * scale];

  // Base grass variation from a low-res noise field, upscaled smoothly.
  const low = document.createElement('canvas');
  low.width = low.height = 256;
  const lg = low.getContext('2d');
  const li = lg.createImageData(256, 256);
  const grassA = [126, 142, 70];
  const grassB = [102, 123, 58];
  const grassDry = [160, 156, 88];
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const wx = GROUND_REGION.x0 + (x / 256) * GROUND_REGION.size;
      const wz = GROUND_REGION.z0 + (y / 256) * GROUND_REGION.size;
      const n = fbm(wx * 0.05, wz * 0.05, 4);
      const dry = smoothstep(0.55, 0.75, fbm(wx * 0.02 + 40, wz * 0.02, 3));
      const i = (y * 256 + x) * 4;
      for (let k = 0; k < 3; k++) {
        const base = grassA[k] + (grassB[k] - grassA[k]) * n;
        li.data[i + k] = base + (grassDry[k] - base) * dry * 0.7;
      }
      li.data[i + 3] = 255;
    }
  }
  lg.putImageData(li, 0, 0);

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(low, 0, 0, size, size);

  // Path mask: soft worn fringe plus a firmer trodden core.
  const mask = document.createElement('canvas');
  mask.width = mask.height = size;
  const mg = mask.getContext('2d');
  mg.lineCap = 'round';
  mg.lineJoin = 'round';
  const strokePaths = (widthMul, alpha, blur) => {
    mg.filter = `blur(${blur}px)`;
    mg.strokeStyle = `rgba(255,255,255,${alpha})`;
    for (const p of curves) {
      const pts = p.curve.getSpacedPoints(Math.ceil(p.length / 1.0));
      mg.lineWidth = p.w * widthMul * scale;
      mg.beginPath();
      pts.forEach((pt, i) => {
        const [px, pz] = toPx(pt.x, pt.z);
        if (i === 0) mg.moveTo(px, pz);
        else mg.lineTo(px, pz);
      });
      mg.stroke();
    }
  };
  strokePaths(1.5, 0.45, 10);
  strokePaths(1.0, 0.85, 4);
  strokePaths(0.6, 1.0, 2);
  // Worn apron in front of the Colvard tent where the queue stands.
  mg.filter = 'blur(12px)';
  mg.fillStyle = 'rgba(255,255,255,0.55)';
  mg.beginPath();
  const [ax, az] = toPx(3.0, 6.5);
  mg.ellipse(ax, az, 7 * scale, 3.4 * scale, 0, 0, Math.PI * 2);
  mg.fill();
  mg.filter = 'none';

  // Dirt layer with speckle, cut out by the mask.
  const dirt = document.createElement('canvas');
  dirt.width = dirt.height = size;
  const dg = dirt.getContext('2d');
  dg.fillStyle = '#9A8262';
  dg.fillRect(0, 0, size, size);
  const rng = makeRng(SEED + 99);
  for (let i = 0; i < 26000; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = rng.range(0.6, 2.6);
    const l = rng.range(-26, 22);
    dg.fillStyle = `rgba(${l > 0 ? 190 : 70},${l > 0 ? 170 : 55},${l > 0 ? 135 : 38},${Math.abs(l) / 90})`;
    dg.beginPath();
    dg.arc(x, y, r, 0, Math.PI * 2);
    dg.fill();
  }
  dg.globalCompositeOperation = 'destination-in';
  dg.drawImage(mask, 0, 0);
  g.drawImage(dirt, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function buildTerrain(scene) {
  const curves = pathCurves();
  const size = 760;
  const seg = 300;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + FIELD.cx;
    const z = pos.getZ(i) + FIELD.cz;
    pos.setXYZ(i, x, heightAt(x, z), z);
    uv.setXY(
      i,
      (x - GROUND_REGION.x0) / GROUND_REGION.size,
      1 - (z - GROUND_REGION.z0) / GROUND_REGION.size,
    );
  }
  geo.computeVertexNormals();

  const map = groundTexture(curves);
  map.flipY = true;
  const detail = detailTexture();
  const mat = new THREE.MeshLambertMaterial({ map });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vGroundXZ;\nuniform sampler2D detailMap;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 det = texture2D(detailMap, vGroundXZ * 0.31).rgb * 2.0;
        vec3 det2 = texture2D(detailMap, vGroundXZ * 0.047 + 0.37).rgb * 2.0;
        diffuseColor.rgb *= mix(vec3(1.0), det * det2, 0.85);`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, curves };
}

function lumpyCrown(rng, blobs, detail) {
  const parts = [];
  for (let i = 0; i < blobs; i++) {
    const r = i === 0 ? 1 : rng.range(0.55, 0.8);
    const g = new THREE.IcosahedronGeometry(r, detail);
    const a = rng.range(0, Math.PI * 2);
    const off = i === 0 ? 0 : rng.range(0.45, 0.7);
    g.translate(Math.cos(a) * off, i === 0 ? 0 : rng.range(-0.35, 0.45), Math.sin(a) * off);
    parts.push(g);
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  const pos = merged.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + (fbm(x * 2.1 + 3, z * 2.1 + y * 1.7, 2) - 0.5) * 0.35;
    pos.setXYZ(i, x * n, y * n * 0.92, z * n);
  }
  merged.computeVertexNormals();
  // Soften normals toward a sphere so crowns read as foliage masses, not facets.
  const nrm = merged.attributes.normal;
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < nrm.count; i++) {
    v.fromBufferAttribute(nrm, i);
    s.fromBufferAttribute(pos, i).normalize();
    v.lerp(s, 0.82).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return merged;
}

function spruceGeometry() {
  const parts = [];
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers;
    const r = 1 - k * 0.72;
    const h = 0.42;
    const g = new THREE.ConeGeometry(r, h, 9, 1, true);
    g.translate(0, 0.2 + k * 0.72 + h / 2, 0);
    parts.push(g.toNonIndexed());
  }
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

export function buildTrees(scene) {
  const rng = makeRng(SEED + 3);
  const tents = tentLayout();
  const deciduous = [];
  const spruce = [];
  const birch = [];
  let tries = 0;
  while (deciduous.length + spruce.length + birch.length < 2600 && tries < 40000) {
    tries++;
    const a = rng.range(0, Math.PI * 2);
    const r = FIELD.radius + 6 + Math.pow(rng.next(), 0.8) * 85;
    const x = FIELD.cx + Math.cos(a) * r * 1.08;
    const z = FIELD.cz + Math.sin(a) * r;
    if (insideAnyTent(x, z, tents, 4)) continue;
    // Thin out the inner edge irregularly so the treeline is not a perfect circle.
    const edge = fbm(x * 0.03, z * 0.03, 3);
    if (r < FIELD.radius + 20 && edge < 0.5) continue;
    const kind = rng.next();
    const item = { x, z, y: heightAt(x, z), s: rng.range(0.8, 1.25), rot: rng.range(0, 6.28) };
    if (kind < 0.26) spruce.push(item);
    else if (kind < 0.38) birch.push(item);
    else deciduous.push(item);
  }

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const greens = ['#4E6B35', '#5B7A3C', '#46613A', '#6A8440', '#56703A'];
  const autumn = ['#C8642B', '#B24A26', '#D9A441', '#C9853A', '#A7A447'];

  const crownGeo = lumpyCrown(makeRng(SEED + 11), 6, 1);
  const crownMat = new THREE.MeshLambertMaterial({ color: '#FFFFFF' });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, deciduous.length + birch.length);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#FFFFFF' });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, deciduous.length + birch.length + spruce.length);

  let ci = 0;
  let ti = 0;
  const place = (list, isBirch) => {
    for (const t of list) {
      const height = (isBirch ? 13 : 15) * t.s;
      const crownR = (isBirch ? 3.0 : 5.0) * t.s;
      const trunkH = height * (isBirch ? 0.36 : 0.26);
      dummy.position.set(t.x, t.y - 0.3, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(isBirch ? 0.9 : 1.6, trunkH + 0.3, isBirch ? 0.9 : 1.6);
      dummy.updateMatrix();
      trunks.setMatrixAt(ti, dummy.matrix);
      trunks.setColorAt(ti, col.set(isBirch ? '#E3DED2' : '#4A3B2E'));
      ti++;
      dummy.position.set(t.x, t.y + trunkH + crownR * 0.75, t.z);
      dummy.scale.set(crownR, crownR * (isBirch ? 1.35 : 1.1), crownR);
      dummy.updateMatrix();
      crowns.setMatrixAt(ci, dummy.matrix);
      const patch = fbm(t.x * 0.045 + 5, t.z * 0.045 + 9, 3);
      let hex;
      if (isBirch) hex = patch > 0.55 || rng.chance(0.35) ? '#D9A441' : '#7E9442';
      else if (patch > 0.6 || rng.chance(0.12)) hex = rng.pick(autumn);
      else hex = rng.pick(greens);
      col.set(hex);
      col.offsetHSL(0, rng.range(-0.04, 0.04), rng.range(-0.04, 0.04));
      crowns.setColorAt(ci, col);
      ci++;
    }
  };
  place(deciduous, false);
  place(birch, true);

  const spruceGeo = spruceGeometry();
  const spruceMat = new THREE.MeshLambertMaterial({ color: '#FFFFFF' });
  const spruces = new THREE.InstancedMesh(spruceGeo, spruceMat, spruce.length);
  spruce.forEach((t, i) => {
    const h = 17 * t.s;
    dummy.position.set(t.x, t.y - 0.3, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.set(h * 0.26, h, h * 0.26);
    dummy.updateMatrix();
    spruces.setMatrixAt(i, dummy.matrix);
    col.set('#2E4638').offsetHSL(0, rng.range(-0.03, 0.03), rng.range(-0.03, 0.05));
    spruces.setColorAt(i, col);
    dummy.scale.set(1.3, h * 0.25, 1.3);
    dummy.updateMatrix();
    trunks.setMatrixAt(ti, dummy.matrix);
    trunks.setColorAt(ti, col.set('#3E3128'));
    ti++;
  });

  for (const m of [crowns, trunks, spruces]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m);
  }

  // A few specimen trees inside the field for depth near the tents.
  return { crowns, trunks, spruces, count: ci + spruce.length };
}

export function buildHills(scene) {
  const rng = makeRng(SEED + 21);
  const geo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: '#4F6A4C' });
  const group = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const r = rng.range(290, 380);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(FIELD.cx + Math.cos(a) * r, -6, FIELD.cz + Math.sin(a) * r);
    m.scale.set(rng.range(90, 150), rng.range(28, 55), rng.range(60, 100));
    m.rotation.y = rng.range(0, 6);
    group.add(m);
  }
  scene.add(group);
  return group;
}

export function buildHayBales(scene) {
  const rng = makeRng(SEED + 31);
  const tents = tentLayout();
  const round = new THREE.CylinderGeometry(0.72, 0.72, 1.2, 20, 1);
  round.rotateZ(Math.PI / 2);
  const roundMat = new THREE.MeshLambertMaterial({ color: '#C8A65C' });
  const square = new THREE.BoxGeometry(0.95, 0.42, 0.46);
  const squareMat = new THREE.MeshLambertMaterial({ color: '#D3B46B' });
  const spots = [];
  // Round bales on the field margins.
  for (let i = 0; i < 70 && spots.length < 22; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(60, 92);
    const x = FIELD.cx + Math.cos(a) * r;
    const z = FIELD.cz + Math.sin(a) * r;
    if (insideAnyTent(x, z, tents, 3)) continue;
    spots.push({ x, z, kind: 'round', rot: rng.range(0, 6.28) });
  }
  // Small square bales used as seating near the tents.
  const seats = [
    [-5.2, 5.2, 0.3],
    [-5.3, 6.1, 0.2],
    [-12.5, 7.4, 1.4],
    [13.8, 6.6, -0.3],
    [5.6, 17.5, 0.1],
    [-6.8, 21.5, 1.57],
    [6.6, 36, 1.57],
    [-6.5, 44, 1.5],
  ];
  for (const [x, z, rot] of seats) spots.push({ x, z, kind: 'square', rot });
  const rMesh = new THREE.InstancedMesh(round, roundMat, spots.filter((s) => s.kind === 'round').length);
  const sMesh = new THREE.InstancedMesh(square, squareMat, spots.filter((s) => s.kind === 'square').length);
  const dummy = new THREE.Object3D();
  let ri = 0;
  let si = 0;
  for (const s of spots) {
    const y = heightAt(s.x, s.z);
    dummy.rotation.set(0, s.rot, 0);
    if (s.kind === 'round') {
      dummy.position.set(s.x, y + 0.68, s.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      rMesh.setMatrixAt(ri++, dummy.matrix);
    } else {
      dummy.position.set(s.x, y + 0.21, s.z);
      dummy.updateMatrix();
      sMesh.setMatrixAt(si++, dummy.matrix);
    }
  }
  for (const m of [rMesh, sMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
}

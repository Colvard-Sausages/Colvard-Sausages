// Instanced low-detail crowd: walkers on the paths, standing groups, and browsers at tents.
// One merged figure geometry; per-vertex part ids pick per-instance clothing colours,
// and legs and arms swing in the vertex shader from a single time uniform.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, insideAnyTent, distanceToPaths, FIELD } from './layout.js';
import { makeRng, pingPong, SEED } from './util.js';

// Part ids: 0 shoes, 1 legs, 2 shirt, 3 skin, 4 hair, 5 hat, 6 backpack.
// Limb ids: 0 none, 1 leg, 2 arm.
function figureGeometry() {
  const parts = [];
  const add = (geo, part, limb = 0, side = 0) => {
    const g = geo.toNonIndexed();
    const n = g.attributes.position.count;
    const info = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) info.set([part, limb, side], i * 3);
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  // Normalised to 1.0 tall, facing +Z.
  for (const s of [-1, 1]) {
    const leg = new THREE.CapsuleGeometry(0.04, 0.4, 2, 6);
    leg.translate(s * 0.05, 0.27, 0);
    add(leg, 1, 1, s);
    const shoe = new THREE.BoxGeometry(0.055, 0.04, 0.13);
    shoe.translate(s * 0.05, 0.02, 0.025);
    add(shoe, 0, 1, s);
    const arm = new THREE.CapsuleGeometry(0.028, 0.3, 2, 6);
    arm.translate(s * 0.118, 0.64, 0);
    add(arm, 2, 2, s);
    const hand = new THREE.SphereGeometry(0.026, 6, 4);
    hand.translate(s * 0.118, 0.46, 0);
    add(hand, 3, 2, s);
  }
  const pelvis = new THREE.SphereGeometry(0.09, 8, 6);
  pelvis.scale(1, 0.6, 0.72);
  pelvis.translate(0, 0.52, 0);
  add(pelvis, 1);
  const torso = new THREE.CapsuleGeometry(0.09, 0.2, 3, 8);
  torso.scale(1.05, 1, 0.64);
  torso.translate(0, 0.7, 0);
  add(torso, 2);
  const head = new THREE.SphereGeometry(0.058, 10, 8);
  head.scale(0.92, 1.08, 1);
  head.translate(0, 0.925, 0);
  add(head, 3);
  const hair = new THREE.SphereGeometry(0.062, 10, 6, 0, Math.PI * 2, 0, 1.7);
  hair.scale(0.95, 1.08, 1.04);
  hair.rotateX(-0.25);
  hair.translate(0, 0.93, -0.006);
  add(hair, 4);
  const hat = new THREE.SphereGeometry(0.066, 10, 6, 0, Math.PI * 2, 0, 1.4);
  hat.scale(0.97, 1.1, 1.05);
  hat.translate(0, 0.935, -0.003);
  add(hat, 5);
  const pack = new THREE.BoxGeometry(0.15, 0.2, 0.08);
  pack.translate(0, 0.72, -0.1);
  add(pack, 6);
  const merged = mergeGeometries(parts);
  merged.computeBoundingSphere();
  return merged;
}

const SHIRTS = ['#6E7045', '#A2502E', '#2F3E5C', '#E4DCC8', '#8C8C88', '#7A3A2E', '#4F6B57', '#C9A25A', '#9B2A22', '#5B4B6E', '#A8B7C2', '#B8643A', '#3D5A6C', '#D9C9A8', '#6B6F72'];
const BRIGHT = ['#C8642B', '#D9A441', '#B83A3A', '#3F7FA8', '#7A9A3A', '#C45A8A'];
const PANTS = ['#2F3542', '#4A4A42', '#6B5A45', '#3A4658', '#2B2B2B', '#5E6B4B', '#7A6A55'];
const SKIN = ['#E8C3A5', '#D9A988', '#C68E6A', '#A56D4C', '#7C4F36', '#F0CDB2', '#E2B592'];
const HAIR = ['#3B2A1E', '#5A3F2A', '#1F1A17', '#8A6A45', '#B4916A', '#9A9690', '#6A3A22', '#2A2522'];
const HATS = ['#B54A2A', '#2E4638', '#D9A441', '#34435E', '#8C8C88', '#6E7045', '#9B2A22', '#E4DCC8'];
const PACKS = ['#3E5A46', '#6B4A30', '#34435E', '#8E4B40', '#595959'];

export function buildCrowd(scene, curves, tents, total = 400) {
  const rng = makeRng(SEED + 5);
  const agents = [];
  const walkers = Math.round(total * 0.46);
  const groups = Math.round(total * 0.28);
  const browsers = total - walkers - groups;

  const pathWeights = curves.map((c) => c.length * (c.id === 'approach' || c.id === 'front' ? 2.2 : 1));
  const wsum = pathWeights.reduce((a, b) => a + b, 0);
  const pickPath = () => {
    let r = rng.next() * wsum;
    for (let i = 0; i < curves.length; i++) {
      r -= pathWeights[i];
      if (r <= 0) return curves[i];
    }
    return curves[0];
  };

  const baseAgent = () => {
    const child = rng.chance(0.1);
    return {
      height: child ? rng.range(0.95, 1.3) : rng.gauss(1.72, 0.08),
      build: child ? 0.95 : rng.range(0.88, 1.2),
      shirt: rng.chance(0.14) ? rng.pick(BRIGHT) : rng.pick(SHIRTS),
      pants: rng.pick(PANTS),
      skin: rng.pick(SKIN),
      hair: rng.pick(HAIR),
      hat: rng.chance(0.24) ? rng.pick(HATS) : null,
      pack: !child && rng.chance(0.14) ? rng.pick(PACKS) : null,
      phase: rng.range(0, Math.PI * 2),
    };
  };

  for (let i = 0; i < walkers; i++) {
    const path = pickPath();
    const a = baseAgent();
    a.kind = 'walk';
    a.path = path;
    a.speed = rng.range(0.9, 1.45) * (a.height < 1.35 ? 0.9 : 1);
    a.dir = rng.chance(0.5) ? 1 : -1;
    const margin = Math.min(22, path.length * 0.3);
    a.s0 = rng.range(margin, path.length - margin);
    a.lateral = rng.range(-0.42, 0.42) * path.w;
    agents.push(a);
  }

  let placed = 0;
  let guard = 0;
  while (placed < groups && guard++ < 5000) {
    const gx = FIELD.cx + rng.range(-70, 70);
    const gz = FIELD.cz + rng.range(-38, 75);
    const pd = distanceToPaths(gx, gz, curves);
    if (pd.d < pd.w / 2 + 1.2 || pd.d > 14) continue;
    if (insideAnyTent(gx, gz, tents, 1.5)) continue;
    const n = Math.min(groups - placed, rng.int(2, 5));
    for (let j = 0; j < n; j++) {
      const ang = (j / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const r = rng.range(0.45, 0.8);
      const a = baseAgent();
      a.kind = 'stand';
      a.x = gx + Math.cos(ang) * r;
      a.z = gz + Math.sin(ang) * r;
      a.face = Math.atan2(gx - a.x, gz - a.z) + rng.range(-0.3, 0.3);
      agents.push(a);
      placed++;
    }
  }

  // Browsers in front of vendor tents.
  guard = 0;
  let b = 0;
  while (b < browsers && guard++ < 5000) {
    const t = rng.pick(tents);
    const lx = rng.range(-t.w / 2 + 0.3, t.w / 2 - 0.3);
    const lz = t.d / 2 + rng.range(0.5, 1.6);
    const c = Math.cos(t.rot);
    const s = Math.sin(t.rot);
    const x = t.x + lx * c + lz * s;
    const z = t.z - lx * s + lz * c;
    if (insideAnyTent(x, z, tents, 0.25)) continue;
    const a = baseAgent();
    a.kind = 'stand';
    a.x = x;
    a.z = z;
    a.face = t.rot + Math.PI + rng.range(-0.4, 0.4);
    agents.push(a);
    b++;
  }

  // Shuffle so that reducing the count on small screens keeps a mix of walkers and standers.
  for (let i = agents.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [agents[i], agents[j]] = [agents[j], agents[i]];
  }

  const geo = figureGeometry();
  const count = agents.length;
  const attr = (size) => new THREE.InstancedBufferAttribute(new Float32Array(count * size), size);
  const iShirt = attr(3);
  const iPants = attr(3);
  const iSkin = attr(3);
  const iHair = attr(3);
  const iHat = attr(4);
  const iPack = attr(4);
  const iWalk = attr(3); // amplitude, phase, cadence
  const col = new THREE.Color();
  agents.forEach((a, i) => {
    col.set(a.shirt).toArray(iShirt.array, i * 3);
    col.set(a.pants).toArray(iPants.array, i * 3);
    col.set(a.skin).toArray(iSkin.array, i * 3);
    col.set(a.hair).toArray(iHair.array, i * 3);
    col.set(a.hat || '#000000').toArray(iHat.array, i * 4);
    iHat.array[i * 4 + 3] = a.hat ? 1 : 0;
    col.set(a.pack || '#000000').toArray(iPack.array, i * 4);
    iPack.array[i * 4 + 3] = a.pack ? 1 : 0;
    iWalk.array[i * 3] = a.kind === 'walk' ? 1 : 0;
    iWalk.array[i * 3 + 1] = a.phase;
    iWalk.array[i * 3 + 2] = a.kind === 'walk' ? (a.speed / (a.height * 0.72)) * Math.PI : 0.8;
  });
  geo.setAttribute('iShirt', iShirt);
  geo.setAttribute('iPants', iPants);
  geo.setAttribute('iSkin', iSkin);
  geo.setAttribute('iHair', iHair);
  geo.setAttribute('iHat', iHat);
  geo.setAttribute('iPack', iPack);
  geo.setAttribute('iWalk', iWalk);

  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshLambertMaterial({ color: '#FFFFFF' });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute vec3 aInfo;
        attribute vec3 iShirt;
        attribute vec3 iPants;
        attribute vec3 iSkin;
        attribute vec3 iHair;
        attribute vec4 iHat;
        attribute vec4 iPack;
        attribute vec3 iWalk;
        varying vec3 vPartColor;
        vec3 rotX(vec3 p, vec3 pivot, float a) {
          vec3 q = p - pivot;
          float c = cos(a);
          float s = sin(a);
          return vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c) + pivot;
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float aPart = aInfo.x;
        float aLimb = aInfo.y;
        float aSide = aInfo.z;
        float swing = sin(uTime * iWalk.z + iWalk.y);
        float idle = (1.0 - iWalk.x) * 0.03 * sin(uTime * 0.7 + iWalk.y);
        if (aLimb > 0.5 && aLimb < 1.5) {
          transformed = rotX(transformed, vec3(0.0, 0.52, 0.0), 0.42 * iWalk.x * swing * aSide);
        } else if (aLimb > 1.5) {
          transformed = rotX(transformed, vec3(0.0, 0.78, 0.0), -0.35 * iWalk.x * swing * aSide);
        }
        if (transformed.y > 0.5) transformed.x += idle * (transformed.y - 0.5);
        transformed.y += iWalk.x * 0.012 * abs(swing);
        vec3 pc = iShirt;
        if (aPart < 0.5) pc = vec3(0.035, 0.03, 0.028);
        else if (aPart < 1.5) pc = iPants;
        else if (aPart < 2.5) pc = iShirt;
        else if (aPart < 3.5) pc = iSkin;
        else if (aPart < 4.5) pc = iHair;
        else if (aPart < 5.5) { pc = iHat.rgb; if (iHat.w < 0.5) transformed = vec3(0.0, 0.7, 0.0); }
        else { pc = iPack.rgb; if (iPack.w < 0.5) transformed = vec3(0.0, 0.7, 0.0); }
        vPartColor = pc;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPartColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPartColor;');
  };

  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const p = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const tan = new THREE.Vector3();

  function walkerPos(a, t, out) {
    const len = a.path.length;
    const s = pingPong(a.s0 + a.dir * a.speed * t, len);
    const u = s / len;
    a.path.curve.getPointAt(Math.min(1, Math.max(0, u)), out);
    a.path.curve.getTangentAt(Math.min(1, Math.max(0, u)), tan);
    out.x += -tan.z * a.lateral;
    out.z += tan.x * a.lateral;
    return out;
  }

  function update(t, visibleCount = count) {
    uniforms.uTime.value = t;
    mesh.count = Math.min(count, visibleCount);
    for (let i = 0; i < mesh.count; i++) {
      const a = agents[i];
      let x;
      let z;
      let face;
      if (a.kind === 'walk') {
        walkerPos(a, t, p);
        walkerPos(a, t + 0.05, p2);
        x = p.x;
        z = p.z;
        face = Math.atan2(p2.x - p.x, p2.z - p.z);
      } else {
        x = a.x;
        z = a.z;
        face = a.face + 0.15 * Math.sin(t * 0.21 + a.phase);
      }
      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.set(0, face, 0);
      dummy.scale.set(a.height * a.build, a.height, a.height * a.build);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, count };
}

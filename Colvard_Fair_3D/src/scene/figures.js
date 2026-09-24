// Stylised articulated figures for the family at the grill and the queue.
// No faces or likenesses: simple rounded forms with clothing colour and hair only.
import * as THREE from 'three';
import { COUNTER, GRILL } from './layout.js';
import { makeRng, SEED, smoothstep } from './util.js';

function checkTexture(a, b, cells = 4, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, size, size);
  const cell = size / cells;
  g.fillStyle = b;
  g.globalAlpha = 0.62;
  for (let i = 0; i < cells; i += 2) {
    g.fillRect(i * cell, 0, cell, size);
    g.fillRect(0, i * cell, size, cell);
  }
  g.globalAlpha = 0.5;
  for (let i = 0; i < cells; i += 2) for (let j = 0; j < cells; j += 2) g.fillRect(i * cell, j * cell, cell, cell);
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

const matCache = new Map();
function mat(spec) {
  if (spec instanceof THREE.Material) return spec;
  if (!matCache.has(spec)) matCache.set(spec, new THREE.MeshStandardMaterial({ color: spec, roughness: 0.88 }));
  return matCache.get(spec);
}

function mesh(geo, m, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat(m));
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

export function makeFigure(o) {
  const H = o.height || 1.75;
  const k = H / 1.75;
  const b = o.build || 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(k);
  root.add(body);

  const hipY = 0.9;
  const waistY = 0.98;
  const hips = new THREE.Group();
  hips.position.y = hipY;
  body.add(hips);
  const pelvis = mesh(new THREE.SphereGeometry(0.16, 14, 10), o.pants, hips, 0, 0.03, 0);
  pelvis.scale.set(1.0 * b, 0.62, 0.7);

  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.085 * b, 0, 0);
    hips.add(pivot);
    const leg = mesh(new THREE.CapsuleGeometry(0.068 * b, 0.7, 4, 10), o.pants, pivot, 0, -0.41, 0);
    leg.scale.set(1, 1, 1);
    mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), o.shoes || '#2F2A26', pivot, 0, -0.865, 0.045);
    legs.push(pivot);
  }

  const torso = new THREE.Group();
  torso.position.y = waistY;
  body.add(torso);
  const chest = mesh(torsoGeometry(), o.shirt, torso, 0, -0.06, 0);
  chest.scale.set(b, 1, 0.66);
  for (const side of [-1, 1]) {
    const delt = mesh(new THREE.SphereGeometry(0.06 * b, 12, 8), o.shirt, torso, side * 0.185 * b, 0.43, 0);
    delt.scale.set(1, 0.9, 1);
  }
  if (o.apron) {
    const apron = mesh(new THREE.BoxGeometry(0.33 * b, 0.66, 0.015), o.apron, torso, 0, 0.02, 0.105);
    apron.rotation.x = 0.04;
    const strap = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.012), o.apron, torso, -0.08, 0.42, 0.085);
    strap.rotation.z = 0.35;
    const strap2 = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.012), o.apron, torso, 0.08, 0.42, 0.085);
    strap2.rotation.z = -0.35;
  }
  mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), o.skin, torso, 0, 0.53, 0);

  const head = new THREE.Group();
  head.position.set(0, 0.58, 0);
  torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.095, 20, 16), o.skin, head, 0, 0.1, 0);
  skull.scale.set(0.9, 1.1, 1);
  const jaw = mesh(new THREE.SphereGeometry(0.07, 14, 10), o.skin, head, 0, 0.045, 0.02);
  jaw.scale.set(0.95, 0.9, 1);
  for (const side of [-1, 1]) mesh(new THREE.SphereGeometry(0.018, 8, 6), o.skin, head, side * 0.086, 0.09, -0.005);
  const hair = o.hair || { color: '#4A3526', style: 'short' };
  if (hair.style !== 'none') {
    const cap = mesh(
      new THREE.SphereGeometry(0.104, 20, 12, 0, Math.PI * 2, 0, hair.style === 'long' ? 2.0 : 1.6),
      hair.color,
      head,
      0,
      0.118,
      -0.014,
    );
    cap.scale.set(0.95, 1.08, 1.04);
    cap.rotation.x = -0.42;
    if (hair.style === 'ponytail') {
      const tail = mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), hair.color, head, 0, 0.06, -0.12);
      tail.rotation.x = 0.35;
    }
    if (hair.style === 'bun') mesh(new THREE.SphereGeometry(0.045, 10, 8), hair.color, head, 0, 0.19, -0.08);
    if (hair.style === 'long') {
      const back = mesh(new THREE.BoxGeometry(0.19, 0.2, 0.05), hair.color, head, 0, 0.0, -0.08);
      back.rotation.x = 0.1;
    }
  }
  if (o.hat === 'beanie') {
    const bn = mesh(new THREE.SphereGeometry(0.113, 16, 10, 0, Math.PI * 2, 0, 1.45), o.hatColour || '#B54A2A', head, 0, 0.12, -0.005);
    bn.scale.set(0.97, 1.12, 1.05);
  } else if (o.hat === 'cap') {
    const c = mesh(new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, 1.35), o.hatColour || '#2E4638', head, 0, 0.12, -0.005);
    c.scale.set(0.97, 1.0, 1.05);
    mesh(new THREE.BoxGeometry(0.16, 0.012, 0.09), o.hatColour || '#2E4638', head, 0, 0.14, 0.12);
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2 * b, 0.44, 0);
    torso.add(shoulder);
    mesh(new THREE.CapsuleGeometry(0.047 * b, 0.22, 4, 10), o.shirt, shoulder, 0, -0.14, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    mesh(new THREE.CapsuleGeometry(0.04 * b, 0.2, 4, 10), o.sleeve || o.shirt, elbow, 0, -0.12, 0);
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    elbow.add(hand);
    const palm = mesh(new THREE.SphereGeometry(0.036, 10, 8), o.skin, hand, 0, -0.01, 0);
    palm.scale.set(0.8, 1.25, 0.6);
    arms.push({ shoulder, elbow, hand });
  }
  return {
    root,
    hips,
    torso,
    head,
    legs,
    // Figures face +Z, so their right hand is on the -X side.
    armL: arms[1],
    armR: arms[0],
  };
}

// Torso profile from hips to neck, revolved and flattened front to back.
let torsoGeo = null;
function torsoGeometry() {
  if (torsoGeo) return torsoGeo;
  const prof = [
    [0.0, 0.0],
    [0.15, 0.0],
    [0.158, 0.08],
    [0.148, 0.2],
    [0.16, 0.32],
    [0.19, 0.42],
    [0.185, 0.48],
    [0.13, 0.54],
    [0.06, 0.58],
    [0.0, 0.59],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  torsoGeo = new THREE.LatheGeometry(prof, 20);
  torsoGeo.computeVertexNormals();
  return torsoGeo;
}

const SKIN = ['#E8C3A5', '#D9A988', '#C68E6A', '#A56D4C', '#7C4F36', '#F0CDB2', '#E2B592'];

function tongs() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#B9B6B0', metalness: 0.8, roughness: 0.35 });
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.36, 0.006), m);
    arm.position.set(s * 0.012, -0.16, 0);
    arm.rotation.z = s * 0.04;
    g.add(arm);
  }
  return g;
}

function servingBoat() {
  const g = new THREE.Group();
  const boat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.1), new THREE.MeshStandardMaterial({ color: '#F4EFE6', roughness: 0.9 }));
  g.add(boat);
  const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), new THREE.MeshStandardMaterial({ color: '#D39A55', roughness: 0.8 }));
  bun.rotation.z = Math.PI / 2;
  bun.position.y = 0.04;
  g.add(bun);
  const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.15, 4, 8), new THREE.MeshStandardMaterial({ color: '#8A4526', roughness: 0.45 }));
  s.rotation.z = Math.PI / 2;
  s.position.y = 0.07;
  g.add(s);
  return g;
}

export function buildPeople(scene) {
  const group = new THREE.Group();
  const flannel = new THREE.MeshStandardMaterial({ map: checkTexture('#9B2A22', '#141111'), roughness: 0.92 });
  const greenCheck = new THREE.MeshStandardMaterial({ map: checkTexture('#3E5A46', '#1C2620', 6), roughness: 0.92 });
  const apron = '#B89A72';

  // Carter at the grill: tall, red hair, buffalo-check flannel, tongs.
  const carter = makeFigure({
    height: 1.88,
    build: 1.06,
    shirt: flannel,
    pants: '#2E3440',
    skin: '#EBC7AE',
    hair: { color: '#A2461F', style: 'short' },
    shoes: '#3A2A1E',
  });
  carter.root.position.set(GRILL.x + 0.05, 0, GRILL.z - 0.66);
  const t1 = tongs();
  t1.rotation.x = -1.2;
  carter.armR.hand.add(t1);
  group.add(carter.root);

  // Mother, plating at the counter.
  const mother = makeFigure({
    height: 1.63,
    build: 1.02,
    shirt: '#6F7760',
    pants: '#3B3A3A',
    skin: '#EBC7AE',
    hair: { color: '#B9B3AA', style: 'bun' },
    apron,
  });
  mother.root.position.set(COUNTER.x0 + 0.48, 0, COUNTER.z - 0.72);
  group.add(mother.root);

  // Sister, serving across the counter.
  const sister = makeFigure({
    height: 1.68,
    build: 0.95,
    shirt: greenCheck,
    pants: '#3A4658',
    skin: '#EBC7AE',
    hair: { color: '#8A3E1E', style: 'ponytail' },
    apron,
  });
  sister.root.position.set(COUNTER.x1 - 0.6, 0, COUNTER.z - 0.7);
  const boat = servingBoat();
  boat.position.set(0, -0.03, 0.08);
  sister.armR.hand.add(boat);
  group.add(sister.root);

  // Queue of customers curving from the counter toward the path.
  const rng = makeRng(SEED + 81);
  const shirts = ['#6E7045', '#A2502E', '#2F3E5C', '#E4DCC8', '#8C8C88', '#7A3A2E', '#4F6B57', '#C9A25A', '#5B4B6E', '#A8B7C2'];
  const pantsC = ['#2F3542', '#4A4A42', '#6B5A45', '#3A4658', '#2B2B2B', '#5E6B4B'];
  const hairC = ['#3B2A1E', '#5A3F2A', '#1F1A17', '#8A6A45', '#B4916A', '#9A9690', '#6A3A22'];
  const qPts = [
    [COUNTER.x1 - 0.6, 3.25],
    [2.35, 4.05],
    [2.75, 4.85],
    [3.35, 5.55],
    [4.05, 6.1],
    [4.85, 6.6],
    [5.65, 7.0],
    [6.5, 7.3],
    [7.35, 7.55],
    [8.2, 7.7],
    [9.0, 7.95],
  ];
  const queue = [];
  qPts.forEach(([x, z], i) => {
    const child = i === 5;
    const plaid = rng.chance(0.25);
    const f = makeFigure({
      height: child ? 1.2 : rng.range(1.58, 1.9),
      build: rng.range(0.9, 1.15),
      shirt: plaid ? new THREE.MeshStandardMaterial({ map: checkTexture(rng.pick(['#9B2A22', '#2F4A6E', '#4F6B57']), '#15130F', 4), roughness: 0.92 }) : rng.pick(shirts),
      pants: rng.pick(pantsC),
      skin: rng.pick(SKIN),
      hair: { color: rng.pick(hairC), style: rng.pick(['short', 'short', 'long', 'ponytail', 'bun']) },
      hat: rng.chance(0.3) ? rng.pick(['beanie', 'cap']) : null,
      hatColour: rng.pick(['#B54A2A', '#2E4638', '#D9A441', '#34435E', '#8C8C88']),
    });
    const next = qPts[Math.max(0, i - 1)];
    const face = i === 0 ? Math.PI : Math.atan2(next[0] - x, next[1] - z);
    f.root.position.set(x + rng.range(-0.1, 0.1), 0, z + rng.range(-0.1, 0.1));
    f.root.rotation.y = face + rng.range(-0.3, 0.3) * (i === 0 ? 0 : 1);
    f.phase = rng.range(0, 6.28);
    f.rate = rng.range(0.45, 0.8);
    group.add(f.root);
    queue.push(f);
  });

  scene.add(group);

  function relaxArms(f, amt = 0) {
    f.armL.shoulder.rotation.set(-0.05 - amt, 0, 0.08);
    f.armR.shoulder.rotation.set(-0.05 - amt, 0, -0.08);
    f.armL.elbow.rotation.x = -0.2;
    f.armR.elbow.rotation.x = -0.2;
  }

  function update(t) {
    const TAU = Math.PI * 2;
    // Carter: turning sausages with tongs, looking down at the grate.
    {
      const p = (t / 2.3) * TAU;
      carter.torso.rotation.x = 0.16 + 0.03 * Math.sin(p);
      carter.torso.rotation.y = 0.12 * Math.sin(p * 0.5);
      carter.head.rotation.x = 0.42;
      carter.armR.shoulder.rotation.set(-0.95 + 0.22 * Math.sin(p), 0.1 * Math.sin(p * 0.5), -0.12);
      carter.armR.elbow.rotation.x = -0.75 + 0.3 * Math.sin(p + 1.1);
      carter.armR.hand.rotation.x = 0.5;
      carter.armL.shoulder.rotation.set(-0.55, 0, 0.18);
      carter.armL.elbow.rotation.x = -1.1;
      carter.hips.position.x = 0.02 * Math.sin(p * 0.25);
    }
    // Mother: plating, both hands working at counter height.
    {
      const p = (t / 1.9) * TAU;
      mother.torso.rotation.x = 0.2;
      mother.head.rotation.x = 0.45 + 0.05 * Math.sin(p * 0.5);
      mother.armR.shoulder.rotation.set(-0.72 + 0.12 * Math.sin(p), 0, -0.1);
      mother.armR.elbow.rotation.x = -0.95 + 0.15 * Math.sin(p + 0.8);
      mother.armL.shoulder.rotation.set(-0.7 + 0.1 * Math.sin(p + 2.2), 0, 0.12);
      mother.armL.elbow.rotation.x = -1.0 + 0.12 * Math.sin(p + 3);
      mother.root.rotation.y = 0.15 * Math.sin(p * 0.3);
    }
    // Sister and the first customer: handing food across, a 4.5 s loop.
    {
      const cyc = (t % 4.5) / 4.5;
      const reach = smoothstep(0.15, 0.4, cyc) * (1 - smoothstep(0.62, 0.85, cyc));
      sister.torso.rotation.x = 0.05 + reach * 0.14;
      sister.head.rotation.x = 0.15;
      sister.armR.shoulder.rotation.set(-0.45 - reach * 0.85, 0, -0.08);
      sister.armR.elbow.rotation.x = -1.25 + reach * 1.0;
      sister.armR.hand.rotation.x = 1.2 - reach * 0.9;
      sister.armL.shoulder.rotation.set(-0.15, 0, 0.12);
      sister.armL.elbow.rotation.x = -0.4;
      const c0 = queue[0];
      c0.armR.shoulder.rotation.set(-0.3 - reach * 0.75, 0, -0.08);
      c0.armR.elbow.rotation.x = -0.5 + reach * 0.35;
      c0.armL.shoulder.rotation.set(-0.05, 0, 0.08);
      c0.armL.elbow.rotation.x = -0.2;
      c0.torso.rotation.x = reach * 0.06;
    }
    // Queue: small weight shifts and the odd glance around.
    for (let i = 1; i < queue.length; i++) {
      const f = queue[i];
      const s = Math.sin(t * f.rate + f.phase);
      f.hips.position.x = 0.025 * s;
      f.torso.rotation.z = -0.03 * s;
      f.torso.rotation.y = 0.12 * Math.sin(t * f.rate * 0.37 + f.phase * 2);
      f.head.rotation.y = 0.35 * Math.sin(t * f.rate * 0.23 + f.phase);
      f.legs[0].rotation.z = 0.03 * s;
      f.legs[1].rotation.z = 0.03 * s;
      relaxArms(f, i % 3 === 0 ? 0.35 : 0);
      if (i % 3 === 0) {
        f.armR.elbow.rotation.x = -1.3;
        f.armL.elbow.rotation.x = -1.3;
      }
    }
  }
  return { group, update };
}

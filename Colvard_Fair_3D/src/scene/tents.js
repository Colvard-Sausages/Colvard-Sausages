// Vendor tents and the Colvard tent with its valance logo, banner, lights and props.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLVARD, GRILL, COUNTER, heightAt, tentLayout } from './layout.js';
import { logoPanel } from './logo.js';
import { makeRng, SEED } from './util.js';

const CANVAS = '#F2EEE4';

// Hip roof over a w x d rectangle with the ridge along the longer axis.
function hipRoofGeometry(w, d, eave, peak, overhang = 0.12) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const e = eave - overhang * 0.35;
  const long = Math.max(w, d);
  const short = Math.min(w, d);
  const ridge = (long - short) / 2;
  const alongX = w >= d;
  const r0 = alongX ? [-ridge, peak, 0] : [0, peak, -ridge];
  const r1 = alongX ? [ridge, peak, 0] : [0, peak, ridge];
  const c = [
    [-hw, e, hd],
    [hw, e, hd],
    [hw, e, -hd],
    [-hw, e, -hd],
  ];
  const tris = [];
  const push = (...pts) => pts.forEach((p) => tris.push(...p));
  if (alongX) {
    push(c[0], c[1], r1, c[0], r1, r0); // front
    push(c[2], c[3], r0, c[2], r0, r1); // back
    push(c[1], c[2], r1); // right
    push(c[3], c[0], r0); // left
  } else {
    push(c[0], c[1], r1); // front
    push(c[2], c[3], r0); // back
    push(c[1], c[2], r0, c[1], r0, r1); // right
    push(c[3], c[0], r1, c[3], r1, r0); // left
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return g;
}

function legGeometry(w, d, eave) {
  const parts = [];
  const pts = [
    [-w / 2, d / 2],
    [w / 2, d / 2],
    [w / 2, -d / 2],
    [-w / 2, -d / 2],
  ];
  for (const [x, z] of pts) {
    const g = new THREE.CylinderGeometry(0.03, 0.03, eave + 0.4, 6);
    g.translate(x, (eave + 0.4) / 2 - 0.4, z);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function valanceGeometry(w, d, eave, depth) {
  const parts = [];
  const add = (len, x, z, rotY) => {
    const g = new THREE.PlaneGeometry(len, depth);
    g.rotateY(rotY);
    g.translate(x, eave - depth / 2, z);
    parts.push(g);
  };
  add(w, 0, d / 2 + 0.005, 0);
  add(w, 0, -d / 2 - 0.005, Math.PI);
  add(d, w / 2 + 0.005, 0, Math.PI / 2);
  add(d, -w / 2 - 0.005, 0, -Math.PI / 2);
  return mergeGeometries(parts);
}

// Generic goods on vendor tables: small coloured boxes and crates, no text.
function goodsFor(rng, w) {
  const group = new THREE.Group();
  const tableTop = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.7, 0.05, 0.7),
    new THREE.MeshLambertMaterial({ color: rng.pick(['#7B5B3E', '#EDE7DA', '#6F7E5C', '#A3563F']) }),
  );
  tableTop.position.y = 0.76;
  tableTop.castShadow = true;
  group.add(tableTop);
  const cloth = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.7, 0.72, 0.02),
    tableTop.material,
  );
  cloth.position.set(0, 0.38, 0.35);
  group.add(cloth);
  const palette = ['#C8642B', '#D9A441', '#8FB0C4', '#9B2A22', '#EDE7DA', '#5E7B4B', '#7A4E8C', '#C9B28A'];
  const n = Math.floor(w * 3);
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.1, 0.26);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, rng.range(0.08, 0.3), s),
      new THREE.MeshLambertMaterial({ color: rng.pick(palette) }),
    );
    m.position.set(rng.range(-w * 0.32, w * 0.32), 0.78 + m.geometry.parameters.height / 2, rng.range(-0.25, 0.25));
    group.add(m);
  }
  return group;
}

function vendorTent(t) {
  const rng = makeRng(t.seed);
  const group = new THREE.Group();
  const canopy = t.style === 'canopy';
  const eave = canopy ? 2.2 : 2.35;
  const peak = canopy ? eave + 0.55 : eave + Math.min(t.w, t.d) * 0.28;
  const fabric = new THREE.MeshLambertMaterial({ color: t.colour, side: THREE.DoubleSide, emissive: t.colour, emissiveIntensity: 0.14 });
  const roof = new THREE.Mesh(hipRoofGeometry(t.w, t.d, eave, peak), fabric);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  const val = new THREE.Mesh(valanceGeometry(t.w, t.d, eave, canopy ? 0.22 : 0.3), fabric);
  val.castShadow = true;
  group.add(val);
  const legs = new THREE.Mesh(
    legGeometry(t.w, t.d, eave),
    new THREE.MeshLambertMaterial({ color: canopy ? '#5A5A58' : '#DAD6CC' }),
  );
  legs.castShadow = true;
  group.add(legs);
  if (t.backWall) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(t.w, eave), fabric);
    wall.position.set(0, eave / 2, -t.d / 2);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }
  const goods = goodsFor(rng, t.w);
  goods.position.z = t.d / 2 - 0.9;
  group.add(goods);
  if (t.d > 4 && rng.chance(0.6)) {
    const back = goodsFor(rng, t.w * 0.8);
    back.position.z = -t.d / 2 + 0.8;
    back.rotation.y = Math.PI;
    group.add(back);
  }
  group.position.set(t.x, heightAt(t.x, t.z), t.z);
  group.rotation.y = t.rot;
  return group;
}

export function buildVendorTents(scene) {
  const tents = tentLayout();
  const group = new THREE.Group();
  for (const t of tents) group.add(vendorTent(t));
  scene.add(group);
  return { group, tents };
}

function woodTexture(seed, light = '#A67C52', dark = '#7A5636') {
  const rng = makeRng(seed);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = light;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = dark;
    g.globalAlpha = rng.range(0.05, 0.25);
    g.lineWidth = rng.range(0.5, 2.5);
    const y = rng.range(0, 256);
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + rng.range(-6, 6), 170, y + rng.range(-6, 6), 256, y + rng.range(-4, 4));
    g.stroke();
  }
  g.globalAlpha = 1;
  // Plank seams.
  g.fillStyle = 'rgba(40,25,15,0.55)';
  for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function chalkboardTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 700;
  const g = c.getContext('2d');
  g.fillStyle = '#6B4A2E';
  g.fillRect(0, 0, 512, 700);
  g.fillStyle = '#2B302C';
  g.fillRect(28, 28, 456, 644);
  const grad = g.createRadialGradient(256, 330, 40, 256, 330, 420);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = grad;
  g.fillRect(28, 28, 456, 644);
  g.fillStyle = '#EDEAE0';
  g.textAlign = 'center';
  g.font = '700 104px "Zilla Slab"';
  g.fillText('Colvard', 256, 290);
  g.font = '400 84px "Zilla Slab"';
  g.fillText('Sausages', 256, 400);
  g.strokeStyle = 'rgba(237,234,224,0.8)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(130, 450);
  g.lineTo(382, 450);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildColvardTent(scene, logo) {
  const group = new THREE.Group();
  const { size, eave, peak, valanceDepth } = COLVARD;
  const half = size / 2;
  const fabric = new THREE.MeshStandardMaterial({
    color: CANVAS,
    roughness: 0.95,
    side: THREE.DoubleSide,
    emissive: '#FFD39A',
    emissiveIntensity: 0.3,
  });

  const roof = new THREE.Mesh(hipRoofGeometry(size, size, eave, peak, 0.15), fabric);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const legs = new THREE.Mesh(legGeometry(size, size, eave), new THREE.MeshStandardMaterial({ color: '#D8D4CA', roughness: 0.6, metalness: 0.2 }));
  legs.castShadow = true;
  group.add(legs);

  // Frame rails along the eaves.
  const railMat = legs.material;
  for (const [len, x, z, ry] of [
    [size, 0, half, 0],
    [size, 0, -half, 0],
    [size, half, 0, Math.PI / 2],
    [size, -half, 0, Math.PI / 2],
  ]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), railMat);
    r.rotation.z = Math.PI / 2;
    r.rotation.y = ry;
    r.position.set(x, eave - 0.02, z);
    group.add(r);
  }

  const back = new THREE.Mesh(new THREE.PlaneGeometry(size, eave), fabric);
  back.position.set(0, eave / 2, -half);
  back.castShadow = true;
  back.receiveShadow = true;
  group.add(back);

  // Side and back valances, plain.
  const plain = new THREE.Mesh(valanceGeometry(size, size, eave, 0.3), fabric);
  group.add(plain);

  // Front valance with the logo, drawn onto canvas-coloured cloth.
  // Scalloped bottom edge with a flannel-red trim so the strip reads against the roof behind it.
  const vw = 4096;
  const vh = Math.round((vw * valanceDepth) / size);
  const vCanvas = document.createElement('canvas');
  vCanvas.width = vw;
  vCanvas.height = vh;
  const vg = vCanvas.getContext('2d');
  const scallops = 16;
  const sr = vw / scallops / 2;
  const body = vh - sr * 0.55;
  vg.fillStyle = '#9B2A22';
  vg.fillRect(0, 0, vw, body);
  for (let i = 0; i < scallops; i++) {
    vg.beginPath();
    vg.ellipse(sr + i * sr * 2, body - 1, sr, sr * 0.55, 0, 0, Math.PI);
    vg.fill();
  }
  vg.fillStyle = CANVAS;
  vg.fillRect(0, 0, vw, body - vh * 0.09);
  for (let i = 0; i < scallops; i++) {
    vg.beginPath();
    vg.ellipse(sr + i * sr * 2, body - vh * 0.09 - 1, sr, sr * 0.55 - vh * 0.09, 0, 0, Math.PI);
    vg.fill();
  }
  vg.fillStyle = 'rgba(60,40,20,0.08)';
  vg.fillRect(0, 0, vw, vh * 0.05);
  const logoH = body - vh * 0.09;
  const panelW = Math.round(vw * 0.56);
  const panel = logoPanel(logo, panelW, Math.round(logoH), { pad: 0.045 });
  vg.drawImage(panel, (vw - panelW) / 2, 0);
  const vTex = new THREE.CanvasTexture(vCanvas);
  vTex.colorSpace = THREE.SRGBColorSpace;
  vTex.anisotropy = 16;
  const frontVal = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 0.02, valanceDepth),
    new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5, emissive: '#FFFFFF', emissiveMap: vTex, emissiveIntensity: 0.1 }),
  );
  frontVal.position.set(0, eave - valanceDepth / 2, half + 0.02);
  frontVal.castShadow = true;
  group.add(frontVal);

  // Banner on the back wall behind the grill.
  const bannerW = 2.0;
  const bannerH = Math.min(0.85, bannerW / logo.aspect + 0.12);
  const bCanvas = logoPanel(logo, 1024, Math.round((1024 * bannerH) / bannerW), { background: '#F6F1E6', pad: 0.06 });
  const bTex = new THREE.CanvasTexture(bCanvas);
  bTex.colorSpace = THREE.SRGBColorSpace;
  bTex.anisotropy = 16;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(bannerW, bannerH),
    new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.9, emissive: '#FFFFFF', emissiveMap: bTex, emissiveIntensity: 0.18 }),
  );
  // Low enough on the back wall to read below the valance and string lights in the close shot.
  const bannerY = 1.3;
  banner.position.set(0.0, bannerY, -half + 0.04);
  banner.receiveShadow = true;
  group.add(banner);
  const cordMat = new THREE.MeshBasicMaterial({ color: '#3A2C22' });
  for (const dx of [-bannerW / 2 + 0.08, bannerW / 2 - 0.08]) {
    const cordLen = eave - (bannerY + bannerH / 2);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, cordLen, 4), cordMat);
    cord.position.set(banner.position.x + dx, eave - cordLen / 2, -half + 0.05);
    group.add(cord);
  }

  // String lights in shallow swags along the bottom of the front valance.
  const bulbs = [];
  const bulbGeo = new THREE.SphereGeometry(0.035, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.55, 0.7) });
  const wirePts = [];
  const swags = 3;
  const perSwag = 9;
  const y0 = eave - valanceDepth - 0.02;
  for (let s = 0; s < swags; s++) {
    for (let i = 0; i <= perSwag; i++) {
      if (s > 0 && i === 0) continue;
      const k = i / perSwag;
      const x = -half + (s + k) * (size / swags);
      const y = y0 - Math.sin(k * Math.PI) * 0.13;
      wirePts.push(new THREE.Vector3(x, y, half + 0.05));
      if (i % 2 === 1) {
        const b = new THREE.Mesh(bulbGeo, bulbMat);
        b.position.set(x, y - 0.05, half + 0.05);
        group.add(b);
        bulbs.push(b);
      }
    }
  }
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePts), 120, 0.006, 4, false),
    new THREE.MeshBasicMaterial({ color: '#2A2420' }),
  );
  group.add(wire);
  // Soft glow sprites around the bulbs.
  const glowTex = radialTexture();
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: '#FFB866',
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (const b of bulbs) {
    const s = new THREE.Sprite(glowMat);
    s.position.copy(b.position);
    s.scale.setScalar(0.32);
    group.add(s);
  }

  // Props.
  const woodTex = woodTexture(SEED + 41);
  const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
  const woodDark = new THREE.MeshStandardMaterial({ map: woodTexture(SEED + 42, '#8A6340', '#5E4128'), roughness: 0.9 });

  // Serving counter.
  const cw = COUNTER.x1 - COUNTER.x0;
  const counter = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.06, COUNTER.depth), wood);
  top.position.y = COUNTER.top - 0.03;
  counter.add(top);
  const front = new THREE.Mesh(new THREE.BoxGeometry(cw, COUNTER.top - 0.12, 0.03), woodDark);
  front.position.set(0, (COUNTER.top - 0.12) / 2 + 0.04, COUNTER.depth / 2 - 0.03);
  counter.add(front);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, COUNTER.top - 0.06, COUNTER.depth - 0.06), woodDark);
    side.position.set(sx * (cw / 2 - 0.05), (COUNTER.top - 0.06) / 2, 0);
    counter.add(side);
  }
  counter.position.set((COUNTER.x0 + COUNTER.x1) / 2, 0, COUNTER.z);
  counter.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  group.add(counter);

  // Counter items: paper boats, buns, mustard and ketchup bottles.
  const boatMat = new THREE.MeshStandardMaterial({ color: '#F4EFE6', roughness: 0.9 });
  const bunMat = new THREE.MeshStandardMaterial({ color: '#D39A55', roughness: 0.8 });
  for (let i = 0; i < 5; i++) {
    const boat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.1), boatMat);
    boat.position.set(COUNTER.x0 + 0.35 + i * 0.05, COUNTER.top + 0.025 + i * 0.012, COUNTER.z - 0.15);
    group.add(boat);
  }
  const bunGeo = new THREE.CapsuleGeometry(0.035, 0.12, 4, 8);
  bunGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const bun = new THREE.Mesh(bunGeo, bunMat);
    bun.position.set(COUNTER.x0 + 0.95 + (i % 3) * 0.17, COUNTER.top + 0.035 + Math.floor(i / 3) * 0.06, COUNTER.z - 0.2 + (i % 2) * 0.08);
    group.add(bun);
  }
  const bottle = (color, x) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
    b.position.set(x, COUNTER.top + 0.1, COUNTER.z + 0.18);
    group.add(b);
  };
  bottle('#D8A11C', COUNTER.x1 - 0.35);
  bottle('#A3261E', COUNTER.x1 - 0.25);
  bottle('#D8A11C', COUNTER.x0 + 1.6);

  // Back prep table.
  const prep = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.7), wood);
  prep.position.set(1.4, 0.87, -2.4);
  prep.castShadow = true;
  group.add(prep);
  for (const [x, z] of [
    [0.4, -2.1],
    [2.4, -2.1],
    [0.4, -2.7],
    [2.4, -2.7],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.84, 0.06), woodDark);
    leg.position.set(x, 0.42, z);
    group.add(leg);
  }

  // Wooden crates.
  const crateGeo = new THREE.BoxGeometry(0.55, 0.36, 0.4);
  const crates = [
    [2.55, 0.18, -1.3, 0.1],
    [2.55, 0.54, -1.3, -0.05],
    [2.35, 0.18, -0.75, 0.3],
    [-2.6, 0.18, -2.4, 0.0],
    [-2.3, 0.18, 0.4, 0.4],
  ];
  for (const [x, y, z, r] of crates) {
    const c = new THREE.Mesh(crateGeo, wood);
    c.position.set(x, y, z);
    c.rotation.y = r;
    c.castShadow = true;
    c.receiveShadow = true;
    group.add(c);
  }

  // Cooler.
  const cooler = new THREE.Group();
  const cBody = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 0.45), new THREE.MeshStandardMaterial({ color: '#5E7F7A', roughness: 0.55 }));
  cBody.position.y = 0.21;
  const cLid = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.07, 0.47), new THREE.MeshStandardMaterial({ color: '#EDEBE4', roughness: 0.5 }));
  cLid.position.y = 0.455;
  cooler.add(cBody, cLid);
  cooler.position.set(-2.45, 0, -1.2);
  cooler.rotation.y = 0.25;
  cooler.traverse((m) => m.isMesh && (m.castShadow = true));
  group.add(cooler);

  // Chalkboard easel out front, angled toward the path.
  const easel = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.85), new THREE.MeshStandardMaterial({ map: chalkboardTexture(), roughness: 0.95 }));
  board.position.set(0, 1.05, 0.02);
  board.rotation.x = -0.12;
  easel.add(board);
  const legMat = woodDark;
  for (const [x, rz] of [
    [-0.26, 0.08],
    [0.26, -0.08],
  ]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.55, 0.03), legMat);
    l.position.set(x, 0.76, 0.05);
    l.rotation.set(-0.12, 0, rz);
    easel.add(l);
  }
  const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.5, 0.03), legMat);
  backLeg.position.set(0, 0.72, -0.18);
  backLeg.rotation.x = 0.28;
  easel.add(backLeg);
  easel.position.set(-3.7, 0, 4.4);
  easel.rotation.y = 0.35;
  easel.traverse((m) => m.isMesh && (m.castShadow = true));
  group.add(easel);

  scene.add(group);
  return { group, bulbs };
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

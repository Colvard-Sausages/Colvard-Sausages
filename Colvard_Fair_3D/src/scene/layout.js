// Fairground layout: terrain height, paths, tent placements and key positions.
// Units are metres. The Colvard tent sits at the origin with its open front facing +Z.
import * as THREE from 'three';
import { fbm, makeRng, smoothstep, SEED } from './util.js';

export const FIELD = { cx: 0, cz: 30, radius: 96 };

// Low sun behind and to the left of the Colvard tent (camera looks toward -Z).
export const SUN_DIR = new THREE.Vector3(-0.62, 0.24, -0.75).normalize();

export const COLVARD = {
  size: 6.1,
  eave: 2.7,
  peak: 4.3,
  valanceDepth: 0.56,
};

export const GRILL = { x: -1.2, z: 3.3, top: 0.9, w: 1.3, d: 0.62 };
export const COUNTER = { x0: 0.1, x1: 2.9, z: 2.35, depth: 0.72, top: 0.9 };

export function heightAt(x, z) {
  const d = Math.hypot(x - FIELD.cx, z - FIELD.cz);
  const gentle = (fbm(x * 0.021 + 7.1, z * 0.021 + 3.3, 3) - 0.5) * 1.1;
  const outer = smoothstep(72, 170, d);
  const hills = 3.5 + (fbm(x * 0.009 + 11.2, z * 0.009 + 5.7, 3) - 0.5) * 22;
  let h = gentle + outer * hills;
  // Keep the Colvard tent and its front apron dead flat.
  const dc = Math.hypot(x * 0.85, z - 2.5);
  h *= smoothstep(7, 20, dc);
  return h;
}

// Dirt paths as polylines (x, z) with a width in metres.
export const PATHS = [
  { id: 'approach', w: 3.4, pts: [[0, 11], [0.2, 30], [0.8, 55], [-0.5, 80], [-4, 104], [-10, 128]] },
  { id: 'front', w: 3.8, pts: [[-78, 12.5], [-45, 11.6], [-15, 11], [0, 11], [15, 11], [45, 10.6], [78, 12]] },
  { id: 'west', w: 2.9, pts: [[-78, 12.5], [-76, 36], [-66, 66], [-42, 90], [-12, 101], [-0.5, 102]] },
  { id: 'east', w: 2.9, pts: [[78, 12], [75, 40], [62, 70], [36, 92], [8, 101], [-0.5, 102]] },
  { id: 'mid', w: 2.7, pts: [[-75, 50], [-40, 55], [-12, 55.5], [0.6, 55], [14, 55.5], [44, 54], [74, 48]] },
  { id: 'backW', w: 2.4, pts: [[-45, 11.6], [-44, -8], [-38, -28], [-30, -46]] },
  { id: 'backE', w: 2.4, pts: [[45, 10.6], [46, -10], [52, -30]] },
];

export function pathCurves() {
  return PATHS.map((p) => {
    const curve = new THREE.CatmullRomCurve3(
      p.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      'centripetal',
    );
    curve.arcLengthDivisions = 400;
    return { ...p, curve, length: curve.getLength() };
  });
}

// Vendor tent placements. Each entry: centre, size, facing (radians about Y, 0 = front toward +Z).
export function tentLayout() {
  const rng = makeRng(SEED + 7);
  const colours = ['#F4F1EA', '#EFE6D2', '#F4F1EA', '#3C5A42', '#8E4B40', '#EDE3CC', '#F2EEE4'];
  const tents = [];
  const add = (x, z, w, d, rot, extra = {}) => {
    tents.push({
      x,
      z,
      w,
      d,
      rot,
      colour: extra.colour || rng.pick(colours),
      style: extra.style || (rng.chance(0.55) ? 'frame' : 'canopy'),
      backWall: extra.backWall ?? rng.chance(0.6),
      seed: Math.floor(rng.next() * 1e6),
    });
  };
  const sizes = [
    [3.05, 3.05],
    [6.1, 3.05],
    [3.05, 3.05],
    [6.1, 6.1],
    [4.6, 3.05],
  ];

  // Row sharing the front path with Colvard (north side), fronts facing +Z.
  for (const side of [-1, 1]) {
    let edge = 3.05 + rng.range(2.0, 3.2);
    for (let i = 0; i < 4; i++) {
      const [w, d] = rng.pick(sizes);
      const x = side * (edge + w / 2);
      add(x, 3.05 - d / 2 + rng.range(-0.6, 0.3), w, d, 0);
      edge += w + rng.range(2.2, 4.5);
    }
  }
  // Opposite row across the front path, facing -Z.
  for (const side of [-1, 1]) {
    let edge = 3.4 + rng.range(0.5, 1.5);
    for (let i = 0; i < 4; i++) {
      const [w, d] = rng.pick(sizes);
      const x = side * (edge + w / 2);
      add(x, 11 + 2.5 + d / 2 + rng.range(0, 0.6), w, d, Math.PI);
      edge += w + rng.range(2.4, 4.8);
    }
  }
  // Rows lining the approach path, facing the path.
  for (const side of [-1, 1]) {
    let z = 24 + rng.range(0, 3);
    for (let i = 0; i < 4; i++) {
      const [w, d] = rng.pick(sizes);
      // Tent width runs along the path (z), depth away from it (x).
      const x = side * (1.7 + 2.3 + d / 2 + rng.range(0, 0.8));
      add(x, z + w / 2, w, d, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      z += w + rng.range(4, 9);
      if (z > 50 && z < 60) z = 60; // leave the mid path crossing clear
    }
  }
  // A few along the mid path.
  for (const x of [-30, -19, 20, 32]) {
    const [w, d] = rng.pick(sizes);
    add(x, 55 - 2.3 - d / 2, w, d, 0);
  }
  return tents;
}

// Axis-aligned footprint test (with margin) used to keep people and props out of tents.
export function insideAnyTent(x, z, tents, margin = 0.6) {
  for (const t of tents) {
    const c = Math.cos(-t.rot);
    const s = Math.sin(-t.rot);
    const lx = (x - t.x) * c - (z - t.z) * s;
    const lz = (x - t.x) * s + (z - t.z) * c;
    if (Math.abs(lx) < t.w / 2 + margin && Math.abs(lz) < t.d / 2 + margin) return true;
  }
  // Colvard tent plus its queue and front apron.
  if (Math.abs(x) < 3.05 + margin && z > -3.05 - margin && z < 3.05 + margin) return true;
  if (x > -2.5 && x < 9.5 && z > 3 && z < 9.2) return true;
  return false;
}

export function distanceToPaths(x, z, curves) {
  let best = Infinity;
  let bestW = 3;
  for (const c of curves) {
    const pts = c.samples || (c.samples = c.curve.getSpacedPoints(Math.ceil(c.length / 1.5)));
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x;
      const az = pts[i].z;
      const bx = pts[i + 1].x;
      const bz = pts[i + 1].z;
      const vx = bx - ax;
      const vz = bz - az;
      const len2 = vx * vx + vz * vz;
      let k = ((x - ax) * vx + (z - az) * vz) / len2;
      k = Math.max(0, Math.min(1, k));
      const dx = x - (ax + vx * k);
      const dz = z - (az + vz * k);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) {
        best = d;
        bestW = c.w;
      }
    }
  }
  return { d: best, w: bestW };
}

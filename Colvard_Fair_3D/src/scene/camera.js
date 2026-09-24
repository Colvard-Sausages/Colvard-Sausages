// Camera flyover: a centripetal Catmull-Rom path whose arc length is driven by a
// monotone cubic of time, so motion eases in and out with continuous velocity.
import * as THREE from 'three';
import { monotoneCubic } from './util.js';

export const DURATION = 15;

const KEYS = [
  { t: 0.0, pos: [36, 47, 122], target: [0, 2.0, 4] },
  { t: 4.0, pos: [25, 32, 88], target: [0, 1.6, 4] },
  { t: 6.5, pos: [7, 9.5, 37], target: [-0.3, 1.8, 3.5] },
  { t: 8.0, pos: [0.6, 3.3, 12.6], target: [-0.4, 2.0, 2.8] },
  { t: 10.0, pos: [-0.5, 2.4, 9.3], target: [-0.7, 1.5, 2.6] },
  { t: 12.5, pos: [-0.75, 2.08, 7.55], target: [-0.76, 1.32, 2.4] },
  { t: 15.0, pos: [-0.7, 2.03, 7.25], target: [-0.73, 1.34, 2.4] },
];

// Per-format lens: vertical field of view in degrees.
export const FOV = { '9x16': 50, '4x5': 44, og: 36, interactive: 50 };

export function makeCameraPath() {
  const pts = KEYS.map((k) => new THREE.Vector3(...k.pos));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const div = (KEYS.length - 1) * 200;
  const lengths = curve.getLengths(div);
  const total = lengths[div];
  const sAt = KEYS.map((_, i) => lengths[i * 200] / total);
  const sOfT = monotoneCubic(
    KEYS.map((k) => k.t),
    sAt,
  );
  const tx = monotoneCubic(KEYS.map((k) => k.t), KEYS.map((k) => k.target[0]));
  const ty = monotoneCubic(KEYS.map((k) => k.t), KEYS.map((k) => k.target[1]));
  const tz = monotoneCubic(KEYS.map((k) => k.t), KEYS.map((k) => k.target[2]));

  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  function at(t) {
    const tc = Math.min(DURATION, Math.max(0, t));
    const s = Math.min(1, Math.max(0, sOfT(tc)));
    curve.getPointAt(s, pos);
    target.set(tx(tc), ty(tc), tz(tc));
    return { pos, target };
  }
  return { at, final: () => at(DURATION) };
}

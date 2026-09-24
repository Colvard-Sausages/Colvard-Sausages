// Timed overlay text. Opacity is computed from t on every frame; no CSS animation.
import { smoothstep } from './util.js';

export function makeOverlay(root, logoUrl) {
  const intro = root.querySelector('.intro');
  const bg = root.querySelector('.endcard-bg');
  const logo = root.querySelector('.endcard .logo');
  const h1 = root.querySelector('.endcard h1');
  const line = root.querySelector('.endcard .line');
  const dates = root.querySelector('.endcard .dates');
  logo.src = logoUrl;

  const fade = (t, a, b) => smoothstep(a, b, t);

  // hideAfter: in interactive mode the text clears once the flyover hands over control.
  function update(t, hideAfter = Infinity) {
    const out = Number.isFinite(hideAfter) ? 1 - smoothstep(hideAfter, hideAfter + 0.6, t) : 1;
    const introA = fade(t, 0.4, 0.85) * (1 - fade(t, 2.95, 3.4));
    intro.style.opacity = introA.toFixed(4);
    intro.style.transform = `translateY(${((1 - fade(t, 0.4, 1.2)) * 1.2).toFixed(3)}cqh)`;
    bg.style.opacity = (fade(t, 12.8, 13.3) * out).toFixed(4);
    const items = [
      [logo, 12.8, 13.15],
      [h1, 12.9, 13.28],
      [line, 13.0, 13.38],
      [dates, 13.05, 13.4],
    ];
    for (const [el, a, b] of items) {
      const k = fade(t, a, b);
      el.style.opacity = (k * out).toFixed(4);
      el.style.transform = `translateY(${((1 - k) * 0.8).toFixed(3)}cqh)`;
    }
  }
  return { update };
}

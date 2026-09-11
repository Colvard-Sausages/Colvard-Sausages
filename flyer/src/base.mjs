// Shared foundation for every direction and every output size.
// Colours and type come from brand.json; copy comes from content.json.

export const BLEED = 0.125; // inches, per side

// Canvas definitions. CSS px at 96/in for print sizes; native px for social.
export const SIZES = {
  poster:  { kind: 'print',  w: 11,   h: 17,   label: '11x17 poster' },
  handout: { kind: 'print',  w: 8.5,  h: 11,   label: '8.5x11 handout' },
  feed:    { kind: 'screen', w: 1080, h: 1350, label: 'Instagram feed' },
  story:   { kind: 'screen', w: 1080, h: 1920, label: 'Instagram story' },
};

// Trim box in CSS px, and the full bleed box the page is actually cut from.
export function box(size) {
  const s = SIZES[size];
  if (s.kind === 'screen') {
    return { trimW: s.w, trimH: s.h, pageW: s.w, pageH: s.h, bleed: 0, dpiScale: 1 };
  }
  const trimW = s.w * 96, trimH = s.h * 96;
  const bleed = BLEED * 96;
  return { trimW, trimH, pageW: trimW + bleed * 2, pageH: trimH + bleed * 2, bleed, dpiScale: 1 };
}

export const C = {
  charcoal: '#191212',   // brand, CMYK 68/69/66/82
  cream:    '#ECEAE3',   // brand, CMYK 6/5/9/0
  red:      '#A32E13',   // derived from sesame sriracha, darkened for 4.5:1 under cream
  redBright:'#DE5332',   // sesame sriracha as published
  gold:     '#C9982B',   // spicy fennel as published
  maple:    '#6E4520',   // derived from maple sage, darkened
  muted:    '#625D5A',   // sampled from the brand book's own caption type
};

export const PHOTOS = [
  'chorizo-link.png',
  'maple-sage-link.png',
  'sweet-italian-link.png',
  'spicy-fennel-link.png',
];

export function fontFace(dir) {
  return `
@font-face{font-family:'ColvardDisplay';src:url('${dir}/assets/fonts/archivo-var.woff2')format('woff2');
  font-weight:400 900;font-stretch:62% 125%;font-display:block}
@font-face{font-family:'ColvardBody';src:url('${dir}/assets/fonts/archivo-narrow-var.woff2')format('woff2');
  font-weight:400 700;font-display:block}`;
}

// Page/bleed scaffolding shared by every direction.
export function frameCss(size) {
  const b = box(size);
  const print = SIZES[size].kind === 'print';
  return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${b.pageW}px;height:${b.pageH}px;background:#fff}
${print ? `@page{size:${b.pageW / 96}in ${b.pageH / 96}in;margin:0}` : ''}
.page{position:relative;width:${b.pageW}px;height:${b.pageH}px;overflow:hidden;
  font-family:'ColvardBody',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
/* Art is laid out on the trim box; the bleed is filled by the ground colour only. */
.trim{position:absolute;left:${b.bleed}px;top:${b.bleed}px;width:${b.trimW}px;height:${b.trimH}px}
.disp{font-family:'ColvardDisplay',system-ui,sans-serif;text-transform:uppercase}
.ph-slot{display:flex;align-items:center;justify-content:center;text-align:center;
  border:2px dashed currentColor;opacity:.62;font-family:'ColvardBody';font-weight:700;
  letter-spacing:.08em;line-height:1.25}`;
}

// The hero. Four real Colvard packshots, overlapped and fanned so the group
// reads as quantity rather than as one pack. This is a STAND-IN for the
// photograph the brief calls for (18 lb, cases open, links visible), which
// does not exist in the Colvard library. See README.
const PACK_AR = 2000 / 2666; // source cutouts are all this ratio

export function hero(dir, { w, h, tilt = 1, shadow = true, fill = 0.94, n = PHOTOS.length }) {
  const pics = PHOTOS.slice(0, n);
  // Size each pack off the frame HEIGHT so the group always fills the well,
  // then space them so the group spans exactly the frame WIDTH.
  const scales = [0.93, 1.0, 0.97, 0.9];
  const wobble = [0.055, 0, 0.02, 0.075];       // vertical stagger, fraction of h
  const rot    = [-7, -2.5, 3, 9];
  const baseH  = h * fill;
  const widths = pics.map((_, i) => baseH * scales[i % 4] * PACK_AR);
  const wMax   = Math.max(...widths);
  const step   = pics.length > 1 ? (w - wMax) / (pics.length - 1) : 0;

  const items = pics.map((p, i) => {
    const ph = baseH * scales[i % 4], pw = widths[i];
    const left = i * step + (wMax - pw) / 2;
    const top  = (h - ph) / 2 + h * wobble[i % 4] - h * 0.03;
    const z    = i === 1 ? 4 : i === 2 ? 3 : i === 0 ? 2 : 1;
    return `<img class="pk" src="${dir}/assets/photo/${p}" style="
      left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;height:${ph.toFixed(1)}px;
      transform:rotate(${(rot[i % 4] * tilt).toFixed(1)}deg);z-index:${z}">`;
  }).join('');

  return `<div class="hero" style="width:${w}px;height:${h}px">${items}</div>
  <style>
    .hero{position:relative}
    .hero .pk{position:absolute;width:auto;
      ${shadow ? 'filter:drop-shadow(0 ' + (h * 0.014).toFixed(1) + 'px ' + (h * 0.026).toFixed(1) + 'px rgba(25,18,18,.32));' : ''}}
  </style>`;
}

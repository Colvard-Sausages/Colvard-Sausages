import { C, box, frameCss, fontFace, hero, SIZES } from './base.mjs';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function shell(dir, size, css, body, ground) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${fontFace(dir)}${frameCss(size)}
.page{background:${ground}}
${css}</style></head><body><div class="page">${body}</div></body></html>`;
}

const grangeSlot = (w, h, fs) => `<div class="ph-slot" style="width:${w}px;height:${h}px;font-size:${fs}px">
  HAMPDEN GRANGE<br>LOGO — FILE NEEDED</div>`;

const qrSlot = (s, fs, caption) => `<div class="qr">
  <div class="ph-slot" style="width:${s}px;height:${s}px;font-size:${fs}px">QR<br>PLACEHOLDER<br>RULES PAGE</div>
  <div class="qr-cap" style="font-size:${fs}px">${esc(caption)}</div></div>`;

const logo = (svg, w, color) =>
  `<div class="logo" style="width:${w}px;color:${color}">${svg}</div>`;

/* ─────────────────────────── A — BUTCHER PAPER ───────────────────────────
   Cream ground, product laid out as if on shop paper, headline set straight
   into the paper, price as a red stamp. Warmest, most "shop counter". */
export function directionA(ct, size, { dir, svg, variant = 'table' }) {
  const b = box(size), W = b.trimW, H = b.trimH;
  const u = W / 1056;                       // scale everything off the 11x17 trim
  const px = n => (n * u).toFixed(1) + 'px';
  const tall = H / W > 1.45;                // poster & story are tall; feed/handout squatter

  const css = `
.trim{display:flex;flex-direction:column;align-items:center;padding:${px(56)} ${px(52)} ${px(40)}}
.eyebrow{font-size:${px(19)};font-weight:700;letter-spacing:.24em;color:${C.red};
  display:flex;align-items:center;gap:${px(16)};width:100%;justify-content:center;
  text-transform:uppercase;white-space:nowrap}
.eyebrow:before,.eyebrow:after{content:"";height:${px(2)};background:${C.gold};flex:1}
.heroWrap{position:relative;flex:0 0 auto;margin-top:${px(tall ? 16 : 10)}}
.stamp{position:absolute;right:${px(-10)};bottom:${px(tall ? -92 : -74)};
  width:${px(236)};height:${px(236)};border-radius:50%;background:${C.red};color:${C.cream};
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  transform:rotate(-7deg);box-shadow:0 ${px(5)} ${px(14)} rgba(25,18,18,.3);z-index:9;
  border:${px(4)} solid ${C.cream}}
.stamp b{font-family:'ColvardDisplay';font-variation-settings:'wdth' 108,'wght' 900;
  font-size:${px(92)};line-height:.8;letter-spacing:-.01em}
.stamp i{font-style:normal;font-weight:700;font-size:${px(23)};letter-spacing:.2em;margin-top:${px(7)}}
h1{font-variation-settings:'wdth' ${tall ? 118 : 112},'wght' 900;font-size:${px(tall ? 158 : 134)};
  line-height:.84;letter-spacing:-.018em;color:${C.charcoal};text-align:center;margin-top:${px(tall ? 44 : 30)}}
.sub{font-size:${px(34)};font-weight:600;color:${C.charcoal};text-align:center;margin-top:${px(16)}}
.ladder{display:flex;width:100%;margin-top:${px(tall ? 30 : 20)};
  border-top:${px(3)} solid ${C.charcoal};border-bottom:${px(3)} solid ${C.charcoal}}
.rung{flex:1;padding:${px(16)} 0 ${px(14)};text-align:center;position:relative}
.rung+.rung{border-left:${px(2)} solid ${C.gold}}
.rung .n{font-family:'ColvardDisplay';font-variation-settings:'wdth' 104,'wght' 800;
  font-size:${px(58)};line-height:1;color:${C.charcoal}}
.rung .l{font-size:${px(20)};font-weight:600;letter-spacing:.12em;color:${C.muted};
  text-transform:uppercase;margin-top:${px(5)}}
.rung.best{background:${C.charcoal}}
.rung.best .n{color:${C.cream}} .rung.best .l{color:${C.gold}}
.flag{position:absolute;top:${px(-15)};left:50%;transform:translateX(-50%);
  background:${C.red};color:${C.cream};font-size:${px(15)};font-weight:700;letter-spacing:.16em;
  padding:${px(4)} ${px(12)};white-space:nowrap}
.scarce{margin-top:${px(16)};font-size:${px(26)};font-weight:700;letter-spacing:.2em;
  color:${C.red};text-transform:uppercase}
.howto{margin-top:${px(tall ? 26 : 16)};text-align:center}
.howto .buy{font-size:${px(30)};font-weight:700;color:${C.charcoal}}
.howto .drw{font-size:${px(30)};font-weight:700;color:${C.charcoal};margin-top:${px(6)}}
.howto .sec{font-size:${px(23)};font-weight:600;color:${C.muted};margin-top:${px(10)}}
.cause{margin-top:${px(tall ? 22 : 14)};background:${C.gold};color:${C.charcoal};
  font-size:${px(25)};font-weight:700;letter-spacing:.05em;padding:${px(10)} ${px(22)};
  text-transform:uppercase;text-align:center}
.evt{margin-top:${px(tall ? 22 : 14)};text-align:center;font-size:${px(24)};font-weight:600;
  color:${C.charcoal};line-height:1.35}
.evt b{font-weight:700}
.foot{margin-top:auto;width:100%;display:flex;align-items:flex-end;justify-content:space-between;
  gap:${px(20)};padding-top:${px(20)};border-top:${px(2)} solid ${C.gold}}
.foot .logo svg{width:100%;height:auto;display:block}
.fine{flex:1;font-size:${px(15)};line-height:1.4;color:${C.muted};text-align:center;padding-bottom:${px(4)}}
.qr{display:flex;flex-direction:column;align-items:center;gap:${px(5)};color:${C.charcoal}}
.qr-cap{font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.muted}}`;

  const body = `<div class="trim">
  <div class="eyebrow">${esc(ct.eyebrow)}</div>
  <div class="heroWrap">
    ${hero(dir, { w: W - 96 * u, h: (tall ? 462 : 340) * u })}
    <div class="stamp"><b>$2</b><i>A TICKET</i></div>
  </div>
  <h1>${ct.headline.map(esc).join('<br>')}</h1>
  <div class="sub">${esc(ct.subhead)}</div>
  <div class="ladder">${ct.price_ladder.map(r => `
    <div class="rung${r.best ? ' best' : ''}">${r.flag ? `<div class="flag">${esc(r.flag)}</div>` : ''}
      <div class="n">${esc(r.price)}</div><div class="l">${esc(r.label)}</div></div>`).join('')}
  </div>
  <div class="scarce">${esc(ct.scarcity)}</div>
  <div class="howto">
    <div class="buy">${esc(ct.buy[variant])}</div>
    <div class="drw">${esc(ct.draw)}</div>
    <div class="sec">${esc(ct.second_prize)}</div>
  </div>
  <div class="cause">${esc(ct.cause)}</div>
  <div class="evt"><b>${esc(ct.event.name)}</b><br>${esc(ct.event.venue)} · ${esc(ct.event.city)}<br>${esc(ct.event.dates)}</div>
  <div class="foot">
    <div style="display:flex;align-items:flex-end;gap:${px(18)}">
      ${logo(svg, 112 * u, C.charcoal)}
      ${grangeSlot(112 * u, 62 * u, 11 * u)}
    </div>
    <div class="fine">${esc(ct.footer)}</div>
    ${qrSlot(86 * u, 11 * u, ct.qr.caption)}
  </div>
</div>`;
  return shell(dir, size, css, body, C.cream);
}

/* ───────────────────────────── B — THE STACK ─────────────────────────────
   Charcoal ground, product on a cream shelf bleeding edge to edge, headline
   reversed and enormous. Built for distance: the loudest of the three. */
export function directionB(ct, size, { dir, svg, variant = 'table' }) {
  const b = box(size), W = b.trimW, H = b.trimH, BL = b.bleed;
  const u = W / 1056;
  const px = n => (n * u).toFixed(1) + 'px';
  const tall = H / W > 1.45;

  const css = `
.band{position:absolute;left:0;top:0;width:${b.pageW}px;height:${px(tall ? 408 : 330)};
  background:${C.cream};display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.band .hero{flex:0 0 auto;margin-bottom:${px(-8)}}
.bandRule{position:absolute;left:0;width:${b.pageW}px;height:${px(7)};background:${C.gold};
  top:${px(tall ? 408 : 330)}}
.eyebrow{position:absolute;left:0;top:${px(tall ? 426 : 348)};width:${b.pageW}px;text-align:center;
  font-size:${px(20)};font-weight:700;letter-spacing:.26em;color:${C.gold};text-transform:uppercase}
.body{position:absolute;left:${BL}px;top:${px(tall ? 476 : 388)};width:${W}px;height:${H - (tall ? 476 : 388) * u}px;
  padding:0 ${px(46)} ${px(34)};display:flex;flex-direction:column;align-items:center}
h1{font-variation-settings:'wdth' ${tall ? 122 : 114},'wght' 900;font-size:${px(tall ? 164 : 136)};
  line-height:.82;letter-spacing:-.022em;color:${C.cream};text-align:center}
.sub{font-size:${px(33)};font-weight:600;color:${C.cream};text-align:center;margin-top:${px(14)};opacity:.94}
.price{display:flex;align-items:baseline;justify-content:center;gap:${px(16)};margin-top:${px(tall ? 26 : 16)}}
.price .big{font-family:'ColvardDisplay';font-variation-settings:'wdth' 112,'wght' 900;
  font-size:${px(tall ? 118 : 100)};line-height:.86;color:${C.gold};letter-spacing:-.02em}
.price .cap{font-family:'ColvardDisplay';font-variation-settings:'wdth' 104,'wght' 800;
  font-size:${px(48)};color:${C.gold};letter-spacing:.02em}
.stubs{display:flex;gap:${px(12)};margin-top:${px(tall ? 24 : 14)};width:100%}
.stub{flex:1;background:${C.cream};color:${C.charcoal};text-align:center;
  padding:${px(14)} 0 ${px(12)};position:relative;border-radius:${px(4)}}
.stub.best{background:${C.gold}}
.stub .n{font-family:'ColvardDisplay';font-variation-settings:'wdth' 104,'wght' 800;font-size:${px(56)};line-height:1}
.stub .l{font-size:${px(19)};font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:${px(4)}}
.stub .flag{position:absolute;top:${px(-14)};left:50%;transform:translateX(-50%);background:${C.red};
  color:${C.cream};font-size:${px(15)};font-weight:700;letter-spacing:.16em;padding:${px(3)} ${px(11)};white-space:nowrap}
.scarce{margin-top:${px(14)};font-size:${px(27)};font-weight:700;letter-spacing:.2em;color:${C.gold};text-transform:uppercase}
.howto{margin-top:${px(tall ? 24 : 14)};text-align:center;color:${C.cream}}
.howto .buy,.howto .drw{font-size:${px(30)};font-weight:700}
.howto .drw{margin-top:${px(6)}}
.howto .sec{font-size:${px(23)};font-weight:600;margin-top:${px(9)};opacity:.82}
.cause{margin-top:${px(tall ? 20 : 12)};border:${px(3)} solid ${C.gold};color:${C.gold};
  font-size:${px(25)};font-weight:700;letter-spacing:.05em;padding:${px(9)} ${px(22)};text-transform:uppercase;text-align:center}
.evt{margin-top:${px(tall ? 20 : 12)};text-align:center;font-size:${px(24)};font-weight:600;color:${C.cream};line-height:1.35}
.foot{margin-top:auto;width:100%;display:flex;align-items:flex-end;justify-content:space-between;
  gap:${px(20)};padding-top:${px(18)};border-top:${px(2)} solid ${C.gold};color:${C.cream}}
.foot .logo svg{width:100%;height:auto;display:block}
.fine{flex:1;font-size:${px(15)};line-height:1.4;text-align:center;opacity:.78;padding-bottom:${px(4)}}
.qr{display:flex;flex-direction:column;align-items:center;gap:${px(5)}}
.qr-cap{font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:${px(11)};opacity:.8}`;

  const body = `
  <div class="band">${hero(dir, { w: W - 96 * u, h: (tall ? 398 : 322) * u, tilt: 0.75, fill: 1.0 })}</div>
  <div class="bandRule"></div>
  <div class="eyebrow">${esc(ct.eyebrow)}</div>
  <div class="body">
    <h1>${ct.headline.map(esc).join('<br>')}</h1>
    <div class="sub">${esc(ct.subhead)}</div>
    <div class="price"><span class="big">$2</span><span class="cap">A TICKET</span></div>
    <div class="stubs">${ct.price_ladder.map(r => `
      <div class="stub${r.best ? ' best' : ''}">${r.flag ? `<div class="flag">${esc(r.flag)}</div>` : ''}
        <div class="n">${esc(r.price)}</div><div class="l">${esc(r.label)}</div></div>`).join('')}
    </div>
    <div class="scarce">${esc(ct.scarcity)}</div>
    <div class="howto">
      <div class="buy">${esc(ct.buy[variant])}</div>
      <div class="drw">${esc(ct.draw)}</div>
      <div class="sec">${esc(ct.second_prize)}</div>
    </div>
    <div class="cause">${esc(ct.cause)}</div>
    <div class="evt"><b>${esc(ct.event.name)}</b><br>${esc(ct.event.venue)} · ${esc(ct.event.city)}<br>${esc(ct.event.dates)}</div>
    <div class="foot">
      <div style="display:flex;align-items:flex-end;gap:${px(18)}">
        ${logo(svg, 112 * u, C.cream)}
        ${grangeSlot(112 * u, 62 * u, 11 * u)}
      </div>
      <div class="fine">${esc(ct.footer)}</div>
      ${qrSlot(86 * u, 11 * u, ct.qr.caption)}
    </div>
  </div>`;
  return shell(dir, size, css, body, C.charcoal);
}

/* ─────────────────────────── C — COUNTER CARD ────────────────────────────
   Cream card inside a heavy charcoal frame, red scarcity band at the head,
   price ladder set as a shop price board with leaders. Most orderly. */
export function directionC(ct, size, { dir, svg, variant = 'table' }) {
  const b = box(size), W = b.trimW, H = b.trimH;
  const u = W / 1056;
  const px = n => (n * u).toFixed(1) + 'px';
  const tall = H / W > 1.45;

  const css = `
.trim{border:${px(16)} solid ${C.charcoal};display:flex;flex-direction:column;background:${C.cream}}
.scarceBand{background:${C.red};color:${C.cream};text-align:center;font-size:${px(27)};
  font-weight:700;letter-spacing:.24em;padding:${px(10)} 0;text-transform:uppercase}
.inner{flex:1;display:flex;flex-direction:column;align-items:center;padding:${px(24)} ${px(36)} ${px(20)};min-height:0}
.eyebrow{font-size:${px(19)};font-weight:700;letter-spacing:.22em;color:${C.muted};text-transform:uppercase}
.window{flex:0 0 auto;margin-top:${px(16)};width:100%;border:${px(3)} solid ${C.charcoal};background:${C.cream};
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  height:${px(tall ? 368 : 286)}}
h1{font-variation-settings:'wdth' ${tall ? 116 : 110},'wght' 900;font-size:${px(tall ? 144 : 122)};
  line-height:.86;letter-spacing:-.018em;color:${C.charcoal};text-align:center;margin-top:${px(16)}}
.rule{width:${px(240)};height:${px(4)};background:${C.gold};margin:${px(14)} 0 0}
.sub{font-size:${px(32)};font-weight:600;color:${C.charcoal};text-align:center;margin-top:${px(12)}}
.board{width:100%;margin-top:${px(tall ? 24 : 14)};background:${C.charcoal};color:${C.cream};
  padding:${px(18)} ${px(26)} ${px(20)}}
.board .hero{display:flex;align-items:baseline;justify-content:center;gap:${px(14)};
  padding-bottom:${px(12)};border-bottom:${px(2)} solid ${C.gold};position:relative}
.board .hero b{font-family:'ColvardDisplay';font-variation-settings:'wdth' 110,'wght' 900;
  font-size:${px(tall ? 104 : 88)};line-height:.9;color:${C.gold};letter-spacing:-.02em}
.board .hero i{font-style:normal;font-family:'ColvardDisplay';font-variation-settings:'wdth' 104,'wght' 800;
  font-size:${px(40)};color:${C.gold}}
.row{display:flex;align-items:baseline;gap:${px(10)};margin-top:${px(11)};font-size:${px(28)};font-weight:700}
.row .lead{flex:1;border-bottom:${px(2)} dotted rgba(236,234,227,.45);transform:translateY(${px(-6)})}
.row .amt{font-family:'ColvardDisplay';font-variation-settings:'wdth' 102,'wght' 800;font-size:${px(34)}}
.row.best .qty,.row.best .amt{color:${C.gold}}
.row .tag{background:${C.gold};color:${C.charcoal};font-size:${px(15)};letter-spacing:.14em;
  padding:${px(3)} ${px(9)};margin-left:${px(8)}}
.cols{width:100%;display:flex;gap:${px(26)};margin-top:${px(tall ? 22 : 14)}}
.col{flex:1}
.col.r{flex:0 0 ${px(300)};border-left:${px(2)} solid ${C.gold};padding-left:${px(22)}}
.k{font-size:${px(16)};font-weight:700;letter-spacing:.18em;color:${C.muted};text-transform:uppercase}
.v{font-size:${px(27)};font-weight:700;color:${C.charcoal};margin-top:${px(4)};line-height:1.28}
.v.sm{font-size:${px(22)};font-weight:600}
.blk+.blk{margin-top:${px(13)}}
.cause{width:100%;margin-top:${px(tall ? 20 : 12)};background:${C.gold};color:${C.charcoal};
  font-size:${px(24)};font-weight:700;letter-spacing:.05em;padding:${px(10)} ${px(20)};
  text-transform:uppercase;text-align:center}
.foot{margin-top:auto;width:100%;display:flex;align-items:flex-end;justify-content:space-between;
  gap:${px(18)};padding-top:${px(18)};border-top:${px(2)} solid ${C.charcoal}}
.foot .logo svg{width:100%;height:auto;display:block}
.fine{flex:1;font-size:${px(15)};line-height:1.4;color:${C.muted};text-align:center;padding-bottom:${px(4)}}
.qr{display:flex;flex-direction:column;align-items:center;gap:${px(5)};color:${C.charcoal}}
.qr-cap{font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:${px(11)};color:${C.muted}}`;

  const rows = ct.price_ladder.map(r => `
    <div class="row${r.best ? ' best' : ''}"><span class="qty">${esc(r.label)}</span>
      <span class="lead"></span><span class="amt">${esc(r.price)}</span>
      ${r.flag ? `<span class="tag">${esc(r.flag)}</span>` : ''}</div>`).join('');

  const body = `<div class="trim">
  <div class="scarceBand">${esc(ct.scarcity)}</div>
  <div class="inner">
    <div class="eyebrow">${esc(ct.eyebrow)}</div>
    <div class="window">${hero(dir, { w: W - 46 * u, h: (tall ? 368 : 286) * u, tilt: 0.6, shadow: false, fill: 1.0 })}</div>
    <h1>${ct.headline.map(esc).join('<br>')}</h1>
    <div class="rule"></div>
    <div class="sub">${esc(ct.subhead)}</div>
    <div class="board">
      <div class="hero"><b>$2</b><i>A TICKET</i></div>
      ${rows}
    </div>
    <div class="cols">
      <div class="col">
        <div class="blk"><div class="k">How to buy</div><div class="v">${esc(ct.buy[variant])}</div></div>
        <div class="blk"><div class="k">Drawing</div><div class="v">${esc(ct.draw)}</div></div>
        <div class="blk"><div class="k">Second prize</div><div class="v sm">${esc(ct.second_prize.replace(/^Second prize:\s*/i, ''))}</div></div>
      </div>
      <div class="col r">
        <div class="blk"><div class="k">Event</div>
          <div class="v sm">${esc(ct.event.name)}<br>${esc(ct.event.venue)}<br>${esc(ct.event.city)}<br>${esc(ct.event.dates)}</div></div>
      </div>
    </div>
    <div class="cause">${esc(ct.cause)}</div>
    <div class="foot">
      <div style="display:flex;align-items:flex-end;gap:${px(18)}">
        ${logo(svg, 108 * u, C.charcoal)}
        ${grangeSlot(108 * u, 54 * u, 10 * u)}
      </div>
      <div class="fine">${esc(ct.footer)}</div>
      ${qrSlot(84 * u, 11 * u, ct.qr.caption)}
    </div>
  </div>
</div>`;
  return shell(dir, size, css, body, C.charcoal);
}

export const DIRECTIONS = { A: directionA, B: directionB, C: directionC };
export const DIRECTION_NAMES = { A: 'Butcher Paper', B: 'The Stack', C: 'Counter Card' };

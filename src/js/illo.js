// ===== Иллюстрации техники: SVG в реальных пропорциях (единицы = см) и в цвете модели =====
const BODY = { w: '#eceef0', b: '#202226', s: '#c5cad0', x: '#b4bac0', g: '#585d65', e: '#e6dbc5', r: '#c4322f', l: '#3b74bf', n: '#4c9470',
  p: '#e5a8c2', y: '#e4b92f', k: '#b5763f', v: '#7a5bbd', f: '#34363b' };
const DARKS = new Set(['b', 'g', 'f', 'r', 'l', 'n', 'v', 'k']);
let ILLO_ID = 0;

function shade(hex, p) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = p < 0 ? 0 : 255, a = Math.abs(p);
  r = Math.round((t - r) * a + r); g = Math.round((t - g) * a + g); b = Math.round((t - b) * a + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Видимые размеры рисунка: для плоских вещей рисуем вид сверху в перспективе
const VIS = {
  hob: (w, h, d) => [w, (d || w * .9) * .55],
  scales: (w, h, d) => [w, (d || w) * .55],
  vacuum: (w, h, d, p) => p.specs.type === 'Робот' ? [w, w * .42] : [w, h],
  egrill: (w, h, d, p) => p.specs.type === 'Открытый' ? [w, Math.max(h, w * .3)] : [w, h],
  iron: (w, h, d) => [d || w * 2.2, h],          // утюг — вид сбоку
  hairdryer: (w, h, d) => [h * .95, h],           // фен — в профиль
  windowbot: (w, h, d) => [w, d || w * .5],       // мойщик — вид на рабочую сторону
};

// ---------- примитивы ----------
const R = (x, y, w, h, r, f, e = '') => `<rect x="${x}" y="${y}" width="${Math.max(w, 0)}" height="${Math.max(h, 0)}" rx="${r}" fill="${f}" ${e}/>`;
const Ci = (x, y, r, f, e = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${e}/>`;
const El = (x, y, rx, ry, f, e = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" ${e}/>`;
const Pa = (d, f, e = '') => `<path d="${d}" fill="${f}" ${e}/>`;
const Ln = (x1, y1, x2, y2, s, w, e = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s}" stroke-width="${w}" stroke-linecap="round" ${e}/>`;

// ---------- рисовальщики: (W, H, P, p) → svg; P — палитра ----------
const DRAW = {
  fridge(W, H, P, p) {
    const t = p.specs.type || 'Двухкамерный', r = W * .035;
    let s = R(0, 0, W, H * .975, r, P.b) + R(W * .06, H * .975, W * .08, H * .025, 0, P.d) + R(W * .86, H * .975, W * .08, H * .025, 0, P.d);
    const hv = (x, y, h) => R(x, y, W * .022, h, W * .011, P.h);
    if (t === 'Side-by-Side' || t === 'Многодверный') {
      s += R(W * .497, 0, W * .006, t === 'Многодверный' ? H * .55 : H * .975, 0, P.l);
      if (t === 'Многодверный') s += R(0, H * .55, W, H * .006, 0, P.l) + R(W * .497, H * .55, W * .006, H * .425, 0, P.l) + hv(W * .44, H * .62, H * .12) + hv(W * .535, H * .62, H * .12);
      s += hv(W * .44, H * .2, H * .25) + hv(W * .535, H * .2, H * .25) + R(W * .12, H * .14, W * .2, H * .07, W * .01, P.g);
    } else if (t === 'Однокамерный') {
      s += hv(W * .86, H * .1, H * .25);
    } else {
      s += R(0, H * .6, W, H * .007, 0, P.l) + hv(W * .86, H * .32, H * .2) + hv(W * .86, H * .63, H * .12);
      if (p.specs.display) s += R(W * .14, H * .09, W * .2, H * .045, W * .01, P.g) + R(W * .17, H * .105, W * .06, H * .012, 0, P.a);
    }
    return s + R(0, 0, W * .05, H * .975, 0, P.sh);
  },
  freezer(W, H, P, p) {
    if (p.specs.type === 'Ларь') return R(0, H * .18, W, H * .8, W * .02, P.b) + R(-W * .01, 0, W * 1.02, H * .17, W * .02, P.b) + R(0, H * .17, W, H * .012, 0, P.l)
      + R(W * .4, H * .2, W * .2, H * .05, W * .01, P.h) + R(W * .06, H * .3, W * .1, H * .04, W * .01, P.g);
    return R(0, 0, W, H * .97, W * .035, P.b) + R(W * .1, H * .97, W * .8, H * .03, 0, P.d) + R(W * .86, H * .1, W * .022, H * .22, W * .01, P.h)
      + R(W * .1, H * .06, W * .14, H * .03, W * .01, P.g) + R(0, 0, W * .05, H * .97, 0, P.sh);
  },
  wine(W, H, P) {
    let s = R(0, 0, W, H, W * .03, P.b) + R(W * .08, H * .05, W * .84, H * .82, W * .02, P.g);
    for (let y = H * .14; y < H * .82; y += H * .1) { s += R(W * .1, y, W * .8, H * .008, 0, P.l2);
      for (let x = W * .18; x < W * .88; x += W * .16) s += El(x, y - H * .025, W * .06, H * .022, '#5a1e24', 'opacity=".85"'); }
    return s + R(W * .08, H * .9, W * .84, H * .04, W * .01, P.d) + Ci(W * .85, H * .92, W * .015, P.a);
  },
  washer(W, H, P, p) {
    if (p.specs.type === 'Вертикальная') return R(0, 0, W, H, W * .04, P.b) + R(W * .04, H * .02, W * .92, H * .1, W * .03, P.d) + R(W * .1, H * .05, W * .3, H * .04, W * .01, P.g)
      + Ci(W * .78, H * .07, W * .06, P.h) + R(0, H * .14, W, H * .006, 0, P.l) + R(W * .3, H * .9, W * .4, H * .02, 0, P.l) + R(0, 0, W * .05, H, 0, P.sh);
    const cx = W / 2, cy = H * .57, rr = Math.min(W, H) * .32;
    return R(0, 0, W, H, W * .035, P.b) + R(0, H * .17, W, H * .006, 0, P.l) + R(W * .06, H * .05, W * .22, H * .07, W * .015, P.d)
      + R(W * .4, H * .055, W * .26, H * .06, W * .01, P.g) + R(W * .43, H * .075, W * .1, H * .02, 0, P.a) + Ci(W * .82, H * .085, H * .045, P.h)
      + Ci(cx, cy, rr, P.h) + Ci(cx, cy, rr * .82, P.d) + Ci(cx, cy, rr * .7, P.gl) + Pa(`M${cx - rr * .5},${cy - rr * .3} A${rr * .7},${rr * .7} 0 0 1 ${cx + rr * .2},${cy - rr * .62}`, 'none', `stroke="rgba(255,255,255,.35)" stroke-width="${rr * .05}"`)
      + R(W * .1, H * .93, W * .8, H * .006, 0, P.l) + R(0, 0, W * .05, H, 0, P.sh);
  },
  dishwasher(W, H, P, p) {
    const panel = p.specs.builtin ? P.f : P.b;
    return R(0, 0, W, H, W * .03, panel) + R(0, 0, W, H * .1, W * .03, p.specs.builtin ? P.st : P.d) + R(W * .55, H * .03, W * .3, H * .04, W * .01, P.g)
      + R(W * .58, H * .045, W * .1, H * .012, 0, P.a) + R(W * .2, H * .14, W * .6, H * .025, W * .01, P.h) + R(0, H * .1, W, H * .006, 0, P.l)
      + (p.specs.builtin ? '' : R(0, H * .93, W, H * .07, 0, P.d)) + R(0, 0, W * .05, H, 0, P.sh);
  },
  stove(W, H, P, p) {
    let s = R(0, H * .02, W, H * .98, W * .03, P.b) + R(-W * .01, 0, W * 1.02, H * .035, W * .01, P.d) + R(0, H * .04, W, H * .12, 0, P.b2);
    for (let i = 0; i < 4; i++) s += Ci(W * (.16 + i * .14), H * .1, H * .025, P.h) + Ln(W * (.16 + i * .14), H * .1, W * (.16 + i * .14), H * .08, P.d, H * .006);
    s += R(W * .76, H * .08, W * .16, H * .04, W * .01, P.g);
    s += R(W * .06, H * .2, W * .88, H * .6, W * .02, P.d) + R(W * .14, H * .3, W * .72, H * .38, W * .02, P.gl) + R(W * .1, H * .23, W * .8, H * .025, W * .01, P.h);
    return s + R(W * .06, H * .84, W * .88, H * .12, W * .02, P.b2) + R(0, 0, W * .05, H, 0, P.sh);
  },
  hob(W, H, P, p) {
    const sk = W * .08, n = p.specs.burners || 4, th = H * .07;
    let s = Pa(`M${sk},0 L${W - sk},0 L${W},${H - th} L0,${H - th}Z`, P.top) + R(0, H - th, W, th, 0, P.d);
    const pts = n === 2 ? [[.5, .3, .26], [.5, .68, .2]] : n === 3 ? [[.3, .32, .18], [.72, .32, .14], [.5, .7, .2]] : [[.28, .3, .16], [.72, .3, .13], [.28, .68, .2], [.72, .68, .16]];
    const gas = p.specs.type === 'Газовая';
    pts.forEach(([x, y, r]) => { const cx = W * x, cy = (H - th) * y, rx = W * r * .5, ry = (H - th) * r * .55;
      s += gas ? El(cx, cy, rx, ry, P.h) + El(cx, cy, rx * .55, ry * .55, P.d) + Ln(cx - rx, cy, cx + rx, cy, P.d, W * .006) + Ln(cx, cy - ry, cx, cy + ry, P.d, W * .006)
        : El(cx, cy, rx, ry, 'none', `stroke="${P.ring}" stroke-width="${W * .006}"`) + El(cx, cy, rx * .6, ry * .6, 'none', `stroke="${P.ring}" stroke-width="${W * .004}" opacity=".6"`); });
    return s + R(W * .38, (H - th) * .88, W * .24, (H - th) * .06, W * .01, P.ring, 'opacity=".5"');
  },
  oven(W, H, P) {
    let s = R(0, 0, W, H, W * .02, P.b) + R(0, 0, W, H * .15, 0, P.b2) + R(W * .38, H * .045, W * .24, H * .06, W * .01, P.g) + R(W * .42, H * .065, W * .08, H * .02, 0, P.a)
      + Ci(W * .15, H * .075, H * .045, P.h) + Ci(W * .85, H * .075, H * .045, P.h);
    return s + R(W * .06, H * .2, W * .88, H * .74, W * .02, P.d) + R(W * .13, H * .3, W * .74, H * .56, W * .02, P.gl) + R(W * .1, H * .23, W * .8, H * .03, W * .015, P.h);
  },
  hood(W, H, P, p) {
    const t = p.specs.type;
    if (t === 'Наклонная') return R(W * .05, 0, W * .9, H * .55, 0, P.b) + Pa(`M0,${H * .45} L${W},${H * .3} L${W},${H * .92} L0,${H}Z`, P.gl) + R(W * .8, H * .38, W * .08, H * .02, 0, P.a);
    if (t === 'Встраиваемая') return R(0, 0, W, H, W * .02, P.b) + R(W * .05, H * .7, W * .9, H * .3, 0, P.d) + R(W * .4, H * .78, W * .2, H * .12, W * .01, P.h);
    if (t === 'Островная') return R(W * .38, 0, W * .24, H * .7, 0, P.b) + R(0, H * .7, W, H * .3, W * .01, P.b2) + R(W * .05, H * .9, W * .9, H * .1, 0, P.d) + R(W * .8, H * .78, W * .08, H * .03, 0, P.a);
    return R(W * .36, 0, W * .28, H * .55, 0, P.b) + Pa(`M${W * .3},${H * .55} L${W * .7},${H * .55} L${W},${H * .9} L0,${H * .9}Z`, P.b2) + R(0, H * .9, W, H * .1, W * .01, P.d) + Ci(W * .85, H * .95, H * .025, P.a);
  },
  microwave(W, H, P, p) {
    const bi = p.specs.builtin;
    return R(0, 0, W, H, W * .03, P.b) + R(W * .05, H * .1, W * .62, H * .8, W * .02, P.d) + R(W * .09, H * .18, W * .54, H * .64, W * .02, P.gl)
      + R(W * .72, H * .12, W * .2, H * .14, W * .01, P.g) + R(W * .75, H * .17, W * .08, H * .04, 0, P.a)
      + (bi ? R(W * .74, H * .4, W * .16, H * .4, W * .01, P.d) : Ci(W * .82, H * .55, H * .1, P.h) + Ci(W * .82, H * .55, H * .07, P.b2)) + R(0, 0, W * .04, H, 0, P.sh);
  },
  tv(W, H, P) {
    const sh = H * .94;
    return R(W * .2, sh, W * .03, H * .06, 0, P.d) + R(W * .77, sh, W * .03, H * .06, 0, P.d) + R(0, 0, W, sh, W * .006, '#0b0c0e')
      + R(W * .008, W * .008, W - W * .016, sh - W * .016, 0, P.scr) + Pa(`M${W * .55},${W * .008} L${W * .8},${W * .008} L${W * .45},${sh - W * .008} L${W * .2},${sh - W * .008}Z`, 'rgba(255,255,255,.05)');
  },
  aircon(W, H, P) {
    return R(0, 0, W, H, H * .28, P.b) + Pa(`M${W * .03},${H * .72} Q${W / 2},${H * 1.02} ${W * .97},${H * .72} L${W * .97},${H * .78} Q${W / 2},${H * 1.06} ${W * .03},${H * .78}Z`, P.d)
      + R(W * .04, H * .2, W * .92, H * .008, 0, P.l) + Ci(W * .86, H * .45, H * .03, P.a) + R(W * .78, H * .42, W * .05, H * .06, H * .02, P.g) + R(0, 0, W, H * .12, H * .1, P.hi);
  },
  heater(W, H, P, p) {
    const t = p.specs.type;
    if (t === 'Масляный радиатор') { let s = ''; const n = 9, fw = W / n;
      for (let i = 0; i < n; i++) s += R(i * fw + fw * .1, H * .02, fw * .8, H * .86, fw * .35, P.b) + R(i * fw + fw * .1, H * .02, fw * .2, H * .86, fw * .1, P.sh);
      return s + R(W * .05, H * .45, W * .9, H * .05, 0, P.b2) + R(W * .05, H * .88, W * .05, H * .12, 0, P.d) + R(W * .9, H * .88, W * .05, H * .12, 0, P.d) + R(W * .82, H * .2, W * .1, H * .08, W * .02, P.d); }
    if (t === 'Тепловентилятор') { let s = R(0, 0, W, H, W * .12, P.b);
      for (let i = 1; i < 6; i++) s += Ci(W / 2, H * .45, W * .07 * i, 'none', `stroke="${P.d}" stroke-width="${W * .015}"`);
      return s + R(W * .3, H * .82, W * .4, H * .06, W * .02, P.g) + R(W * .35, H * .84, W * .1, H * .02, 0, P.a); }
    if (t === 'Инфракрасный') return R(0, 0, W, H, H * .1, P.b) + R(W * .04, H * .25, W * .92, H * .5, H * .05, '#ff6a2b', 'opacity=".85"') + R(W * .04, H * .25, W * .92, H * .2, H * .05, '#ffd18a', 'opacity=".5"');
    let s = R(0, 0, W, H * .88, W * .015, P.b) + R(W * .03, H * .05, W * .94, H * .1, 0, P.d);
    for (let x = W * .05; x < W * .95; x += W * .025) s += R(x, H * .06, W * .008, H * .08, 0, P.b2);
    return s + R(W * .75, H * .25, W * .18, H * .1, W * .01, P.g) + R(W * .78, H * .28, W * .06, H * .03, 0, P.a) + Pa(`M${W * .1},${H} L${W * .14},${H * .88} L${W * .18},${H}Z`, P.d) + Pa(`M${W * .82},${H} L${W * .86},${H * .88} L${W * .9},${H}Z`, P.d);
  },
  fan(W, H, P, p) {
    const t = p.specs.type;
    if (t === 'Колонный') { let s = R(W * .1, 0, W * .8, H * .9, W * .4, P.b); for (let y = H * .12; y < H * .75; y += H * .025) s += R(W * .22, y, W * .56, H * .008, 0, P.d);
      return s + El(W / 2, H * .95, W / 2, H * .05, P.b2) + Ci(W / 2, H * .05, W * .08, P.a); }
    if (t === 'Безлопастной') return Pa(`M${W * .5},0 C${W * 1.05},0 ${W * 1.05},${H * .62} ${W * .5},${H * .62} C${-W * .05},${H * .62} ${-W * .05},0 ${W * .5},0Z M${W * .5},${H * .06} C${W * .12},${H * .06} ${W * .12},${H * .56} ${W * .5},${H * .56} C${W * .88},${H * .56} ${W * .88},${H * .06} ${W * .5},${H * .06}Z`, P.b, 'fill-rule="evenodd"')
      + R(W * .2, H * .6, W * .6, H * .4, W * .25, P.b2) + Ci(W * .5, H * .85, W * .04, P.a);
    const r = W * .5, cy = r, standTop = r * 2;
    let s = Ci(W / 2, cy, r, P.d) + Ci(W / 2, cy, r * .92, P.gl);
    for (let i = 0; i < 3; i++) { const a = i * 2.094; s += El(W / 2 + Math.cos(a) * r * .45, cy + Math.sin(a) * r * .45, r * .42, r * .2, P.b, `transform="rotate(${a * 57.3} ${W / 2 + Math.cos(a) * r * .45} ${cy + Math.sin(a) * r * .45})" opacity=".9"`); }
    for (let i = 1; i < 5; i++) s += Ci(W / 2, cy, r * .22 * i, 'none', `stroke="${P.l2}" stroke-width="${W * .006}"`);
    s += Ci(W / 2, cy, r * .14, P.b2) + Ci(W / 2, cy, r * .05, P.a);
    return s + R(W * .47, standTop - r * .1, W * .06, H - standTop + r * .05, W * .02, P.b) + El(W / 2, H - H * .015, W * .35, H * .02, P.b2);
  },
  tower(W, H, P, p) {
    const hum = p.cat === 'humidifier';
    let s = R(0, 0, W, H, W * .2, P.b) + R(0, 0, W * .12, H, W * .06, P.sh);
    if (hum) s += R(W * .08, H * .45, W * .84, H * .4, W * .1, '#7fb6d8', 'opacity=".45"') + R(W * .08, H * .65, W * .84, H * .2, W * .1, '#5a9cc6', 'opacity=".5"')
      + Pa(`M${W * .45},${-H * .02} C${W * .3},${-H * .15} ${W * .6},${-H * .22} ${W * .45},${-H * .35}`, 'none', `stroke="${P.mist}" stroke-width="${W * .05}" opacity=".35" stroke-linecap="round"`);
    else for (let y = H * .5; y < H * .95; y += H * .03) s += R(W * .12, y, W * .76, H * .01, 0, P.d);
    for (let x = W * .2; x < W * .85; x += W * .1) s += R(x, H * .03, W * .03, H * .08, 0, P.d);
    return s + R(W * .3, H * .18, W * .4, H * .07, W * .02, P.g) + R(W * .35, H * .2, W * .12, H * .025, 0, P.a);
  },
  waterheater(W, H, P, p) {
    if (p.specs.type === 'Проточный') return R(0, 0, W, H, W * .08, P.b) + R(W * .25, H * .2, W * .5, H * .25, W * .04, P.g) + R(W * .3, H * .26, W * .18, H * .08, 0, P.a)
      + R(W * .3, H * .88, W * .06, H * .12, 0, P.h) + R(W * .64, H * .88, W * .06, H * .12, 0, P.h);
    const rr = p.specs.shape === 'Круглый' ? W * .48 : W * .14;
    return R(0, 0, W, H * .95, rr, P.b) + R(0, 0, W * .14, H * .95, W * .07, P.sh) + Ci(W / 2, H * .3, W * .12, P.g) + Ci(W / 2, H * .3, W * .03, P.a)
      + R(W * .32, H * .95, W * .06, H * .05, 0, P.h) + R(W * .62, H * .95, W * .06, H * .05, 0, P.h);
  },
  speaker(W, H, P, p) {
    let s = R(0, H * .04, W, H * .96, W * .12, P.b);
    for (let y = H * .15; y < H * .92; y += H * .06) for (let x = W * .1 + ((y / (H * .06)) % 2) * W * .04; x < W * .92; x += W * .08) s += Ci(x, y, W * .012, P.d, 'opacity=".55"');
    s += El(W / 2, H * .05, W * .5, H * .05, P.b2) + El(W / 2, H * .05, W * .38, H * .03, 'none', `stroke="${P.a}" stroke-width="${H * .012}"`);
    if (p.specs.screen) s += R(W * .3, H * .4, W * .4, H * .14, W * .03, '#0b0c0e') + R(W * .36, H * .44, W * .2, H * .05, 0, P.a, 'opacity=".9"');
    return s;
  },
  vacuum(W, H, P, p) {
    const t = p.specs.type;
    if (t === 'Робот') return El(W / 2, H * .62, W * .5, H * .36, P.b2) + El(W / 2, H * .48, W * .5, H * .36, P.b) + Ci(W * .5, H * .33, W * .1, P.d)
      + El(W * .5, H * .33, W * .1, H * .08, P.b2) + R(W * .05, H * .5, W * .9, H * .02, 0, P.l) + Ci(W * .6, H * .6, W * .015, P.a);
    if (t === 'Вертикальный') return R(W * .3, H * .12, W * .4, H * .2, W * .15, P.b) + Pa(`M${W * .55},0 L${W * .8},0 L${W * .8},${H * .2} L${W * .68},${H * .2}`, 'none', `stroke="${P.b2}" stroke-width="${W * .1}"`)
      + R(W * .32, H * .2, W * .2, H * .12, W * .06, '#9fb5c8', 'opacity=".6"') + R(W * .44, H * .3, W * .1, H * .62, W * .05, P.h) + R(W * .05, H * .92, W * .9, H * .08, W * .03, P.d) + Ci(W * .38, H * .14, W * .04, P.a);
    let s = R(W * .1, H * .25, W * .8, H * .65, W * .3, P.b) + R(W * .1, H * .25, W * .8, H * .2, W * .3, P.hi) + Ci(W * .25, H * .9, H * .1, P.d) + Ci(W * .75, H * .9, H * .1, P.d)
      + Pa(`M${W * .15},${H * .45} C${-W * .1},${H * .2} ${W * .2},0 ${W * .55},${H * .02}`, 'none', `stroke="${P.d}" stroke-width="${W * .05}" stroke-linecap="round"`);
    if (t === 'Моющий') s += R(W * .3, H * .5, W * .4, H * .25, W * .06, '#7fb6d8', 'opacity=".55"');
    return s + Ci(W * .68, H * .4, W * .04, P.a);
  },
  windowbot(W, H, P) {
    return R(0, 0, W, H, W * .2, P.b) + Ci(W * .3, H * .5, W * .22, P.d, 'opacity=".25"') + Ci(W * .7, H * .5, W * .22, P.d, 'opacity=".25"') + Ci(W * .5, H * .2, W * .04, P.a) + R(0, 0, W, H * .15, W * .1, P.hi);
  },
  kettle(W, H, P, p) {
    const glass = p.specs.body === 'Стекло', bf = glass ? 'rgba(170,200,220,.35)' : P.b;
    return R(W * .08, H * .9, W * .8, H * .1, W * .03, P.d) + Pa(`M${W * .18},${H * .14} L${W * .72},${H * .14} L${W * .78},${H * .9} L${W * .12},${H * .9}Z`, bf)
      + (glass ? Pa(`M${W * .15},${H * .45} L${W * .75},${H * .45} L${W * .78},${H * .9} L${W * .12},${H * .9}Z`, 'rgba(120,170,210,.45)') + R(W * .14, H * .14, W * .02, H * .76, 0, P.h) : R(W * .12, H * .14, W * .1, H * .76, 0, P.sh))
      + Pa(`M${W * .72},${H * .2} C${W * 1.02},${H * .2} ${W * 1.02},${H * .75} ${W * .76},${H * .75}`, 'none', `stroke="${glass ? P.d : P.b2}" stroke-width="${W * .07}"`)
      + Pa(`M${W * .2},${H * .2} L0,${H * .12} L${W * .03},${H * .08} L${W * .2},${H * .14}Z`, glass ? P.d : P.b2) + R(W * .2, H * .06, W * .5, H * .08, W * .03, glass ? P.d : P.b2) + Ci(W * .8, H * .82, W * .02, P.a);
  },
  coffee(W, H, P, p) {
    const t = p.specs.type;
    if (t === 'Рожковая') return R(0, 0, W, H, W * .06, P.b) + R(W * .1, H * .38, W * .8, H * .1, W * .04, P.d) + R(W * .3, H * .46, W * .4, H * .06, W * .02, P.h)
      + R(W * .65, H * .48, W * .45, H * .05, W * .02, P.d) + R(W * .3, H * .7, W * .3, H * .17, W * .03, '#f3efe8') + R(W * .1, H * .9, W * .8, H * .04, 0, P.d) + Ci(W * .5, H * .2, W * .1, P.g) + Ci(W * .5, H * .2, W * .03, P.a);
    if (t === 'Капельная') return R(0, 0, W, H * .3, W * .06, P.b) + R(W * .7, 0, W * .3, H, W * .06, P.b) + R(W * .05, H * .45, W * .6, H * .45, W * .1, 'rgba(170,200,220,.35)')
      + R(W * .05, H * .65, W * .6, H * .25, W * .08, '#3b2318') + R(0, H * .92, W, H * .08, W * .02, P.d) + Ci(W * .85, H * .2, W * .04, P.a);
    let s = R(0, H * .04, W, H * .96, W * .05, P.b) + R(W * .15, 0, W * .5, H * .06, W * .03, P.d) + R(W * .1, H * .15, W * .8, H * .12, W * .03, P.g) + R(W * .15, H * .19, W * .3, H * .03, 0, P.a)
      + R(W * .12, H * .35, W * .76, H * .5, W * .04, P.d) + R(W * .4, H * .38, W * .2, H * .08, W * .02, P.h) + R(W * .35, H * .64, W * .3, H * .17, W * .05, '#f3efe8') + R(W * .1, H * .86, W * .8, H * .03, 0, P.h);
    return s + R(0, H * .04, W * .06, H * .96, 0, P.sh);
  },
  toaster(W, H, P) {
    return R(0, H * .1, W, H * .86, W * .18, P.b) + R(W * .15, H * .06, W * .7, H * .08, W * .03, P.d) + R(W * .18, H * .09, W * .64, H * .02, 0, '#000') + R(W * .9, H * .35, W * .1, H * .12, W * .02, P.d)
      + R(W * .3, H * .6, W * .4, H * .1, W * .04, P.d) + Ci(W * .35, H * .65, H * .025, P.a) + R(W * .05, H * .96, W * .9, H * .04, 0, P.d) + R(0, H * .1, W * .12, H * .86, W * .06, P.sh);
  },
  cooker(W, H, P) {
    return El(W / 2, H * .22, W * .5, H * .2, P.b2) + R(0, H * .2, W, H * .76, W * .2, P.b) + R(W * .3, H * .5, W * .4, H * .25, W * .06, P.g) + R(W * .37, H * .56, W * .18, H * .06, 0, P.a)
      + R(W * .4, H * .02, W * .2, H * .06, W * .03, P.d) + R(0, H * .2, W * .1, H * .7, W * .05, P.sh) + R(W * .1, H * .96, W * .8, H * .04, 0, P.d);
  },
  airfryer(W, H, P) {
    return R(0, 0, W, H, W * .22, P.b) + R(W * .25, H * .07, W * .5, H * .1, W * .03, P.g) + R(W * .3, H * .1, W * .12, H * .03, 0, P.a) + R(W * .06, H * .32, W * .88, H * .6, W * .16, P.b2)
      + R(W * .3, H * .55, W * .4, H * .1, W * .05, P.d) + R(0, 0, W * .12, H, W * .06, P.sh);
  },
  breadmaker(W, H, P) {
    return R(0, 0, W, H, W * .08, P.b) + R(W * .06, H * .03, W * .88, H * .3, W * .06, P.b2) + R(W * .25, H * .08, W * .5, H * .18, W * .03, P.gl) + R(W * .1, H * .45, W * .8, H * .2, W * .03, P.g)
      + R(W * .15, H * .5, W * .3, H * .06, 0, P.a, 'opacity=".9"') + R(0, H * .36, W, H * .006, 0, P.l);
  },
  blender(W, H, P, p) {
    const t = p.specs.type;
    if (t === 'Погружной') return R(W * .2, 0, W * .6, H * .45, W * .3, P.b) + R(W * .35, H * .45, W * .3, H * .45, W * .1, P.h) + Pa(`M${W * .1},${H} L${W * .25},${H * .88} L${W * .75},${H * .88} L${W * .9},${H}Z`, P.h) + Ci(W * .5, H * .1, W * .1, P.a);
    if (t === 'Портативный') return R(W * .1, H * .25, W * .8, H * .55, W * .2, 'rgba(170,200,220,.4)') + R(W * .1, H * .45, W * .8, H * .35, W * .15, '#e58fb3', 'opacity=".6"') + R(W * .1, H * .78, W * .8, H * .22, W * .1, P.b) + R(W * .15, H * .1, W * .7, H * .15, W * .1, P.b) + Ci(W * .5, H * .89, W * .06, P.a);
    return Pa(`M${W * .15},${H * .05} L${W * .85},${H * .05} L${W * .75},${H * .65} L${W * .25},${H * .65}Z`, 'rgba(170,200,220,.35)') + R(W * .12, 0, W * .76, H * .06, W * .02, P.d)
      + Pa(`M${W * .2},${H * .4} L${W * .8},${H * .4} L${W * .75},${H * .65} L${W * .25},${H * .65}Z`, '#a8c66c', 'opacity=".6"') + Pa(`M${W * .15},${H * .66} L${W * .85},${H * .66} L${W * .95},${H} L${W * .05},${H}Z`, P.b) + Ci(W / 2, H * .83, W * .08, P.d) + Ci(W / 2, H * .83, W * .03, P.a);
  },
  mixer(W, H, P, p) {
    if (p.specs.type === 'Ручной') return Pa(`M${W * .05},${H * .55} C${W * .05},${H * .2} ${W * .3},${H * .15} ${W * .55},${H * .15} L${W * .95},${H * .15} L${W * .95},${H * .55}Z`, P.b)
      + Pa(`M${W * .55},${H * .15} C${W * .6},0 ${W * .9},0 ${W * .95},${H * .15}`, 'none', `stroke="${P.b}" stroke-width="${H * .07}"`) + R(W * .35, H * .55, W * .04, H * .4, 0, P.h) + R(W * .55, H * .55, W * .04, H * .4, 0, P.h) + Ci(W * .2, H * .35, H * .04, P.a);
    return R(W * .05, H * .9, W * .9, H * .1, W * .03, P.b) + R(W * .7, H * .25, W * .22, H * .67, W * .06, P.b) + R(W * .1, H * .05, W * .85, H * .25, H * .12, P.b) + R(W * .1, H * .05, W * .85, H * .08, H * .05, P.hi)
      + Pa(`M${W * .12},${H * .5} L${W * .62},${H * .5} C${W * .6},${H * .85} ${W * .14},${H * .85} ${W * .12},${H * .5}Z`, P.st) + R(W * .35, H * .3, W * .04, H * .25, 0, P.h) + Ci(W * .85, H * .4, W * .03, P.a);
  },
  grinder(W, H, P) {
    return R(W * .4, H * .35, W * .55, H * .6, W * .08, P.b) + R(W * .05, H * .3, W * .5, H * .22, W * .05, P.h) + R(0, H * .32, W * .06, H * .18, W * .02, P.h)
      + Pa(`M${W * .25},${H * .3} L${W * .3},0 L${W * .55},0 L${W * .5},${H * .3}Z`, P.st) + R(W * .4, H * .95, W * .55, H * .05, 0, P.d) + Ci(W * .78, H * .6, W * .04, P.a);
  },
  juicer(W, H, P, p) {
    if (p.specs.type === 'Цитрус-пресс') return Pa(`M${W * .5},${H * .05} L${W * .7},${H * .45} L${W * .3},${H * .45}Z`, P.d) + R(W * .05, H * .45, W * .9, H * .2, W * .1, 'rgba(240,180,60,.5)') + R(W * .1, H * .62, W * .8, H * .38, W * .1, P.b);
    return R(W * .3, 0, W * .3, H * .2, W * .05, P.d) + Pa(`M${W * .15},${H * .18} L${W * .75},${H * .18} L${W * .7},${H * .62} L${W * .2},${H * .62}Z`, 'rgba(170,200,220,.4)') + R(W * .05, H * .6, W * .8, H * .4, W * .1, P.b)
      + R(W * .78, H * .5, W * .2, H * .18, W * .05, 'rgba(240,160,60,.65)') + Ci(W * .45, H * .8, W * .05, P.a);
  },
  egrill(W, H, P, p) {
    if (p.specs.type === 'Открытый') return R(0, H * .4, W, H * .2, H * .05, P.b) + R(W * .05, H * .35, W * .9, H * .08, 0, P.d) + R(W * .05, H * .6, W * .08, H * .3, 0, P.d) + R(W * .87, H * .6, W * .08, H * .3, 0, P.d) + Ci(W * .85, H * .5, H * .04, P.a);
    return R(0, H * .5, W, H * .45, W * .06, P.b2) + Pa(`M0,${H * .5} L${W * .05},${H * .1} C${W * .3},0 ${W * .7},0 ${W * .95},${H * .1} L${W},${H * .5}Z`, P.b) + R(W * .3, H * .1, W * .4, H * .06, W * .03, P.d) + R(0, H * .5, W, H * .03, 0, P.d) + Ci(W * .5, H * .75, W * .03, P.a);
  },
  waterfilter(W, H, P, p) {
    if (p.specs.type === 'Кувшин') return Pa(`M${W * .1},${H * .1} L${W * .8},${H * .1} L${W * .75},${H} L${W * .15},${H}Z`, 'rgba(170,200,220,.4)') + Pa(`M${W * .13},${H * .55} L${W * .77},${H * .55} L${W * .75},${H} L${W * .15},${H}Z`, 'rgba(100,160,220,.5)')
      + R(W * .2, H * .12, W * .4, H * .35, W * .05, P.b, 'opacity=".9"') + R(W * .08, H * .02, W * .76, H * .1, W * .04, P.b) + Pa(`M${W * .8},${H * .2} C${W},${H * .25} ${W},${H * .7} ${W * .78},${H * .75}`, 'none', `stroke="${P.b}" stroke-width="${W * .06}"`);
    let s = R(0, 0, W, H * .12, 0, P.d); const n = p.specs.stages >= 5 ? 3 : 3, cw = W / n;
    for (let i = 0; i < n; i++) s += R(i * cw + cw * .1, H * .12, cw * .8, H * .85, cw * .25, P.b) + R(i * cw + cw * .1, H * .12, cw * .2, H * .85, cw * .1, P.sh);
    return s;
  },
  iron(W, H, P) {
    return Pa(`M0,${H * .85} L${W * .7},${H * .85} C${W * .95},${H * .85} ${W},${H * .7} ${W},${H * .6} L${W * .3},${H * .55} C${W * .1},${H * .55} 0,${H * .7} 0,${H * .85}Z`, P.b)
      + R(0, H * .85, W * .98, H * .15, H * .05, P.st) + Pa(`M${W * .2},${H * .55} C${W * .15},${H * .1} ${W * .5},0 ${W * .8},${H * .05} L${W * .75},${H * .6} L${W * .62},${H * .6} L${W * .66},${H * .18} C${W * .5},${H * .15} ${W * .35},${H * .25} ${W * .35},${H * .55}Z`, P.b2)
      + Ci(W * .5, H * .72, H * .05, P.a);
  },
  steamer(W, H, P, p) {
    if (p.specs.type === 'Напольный') return R(W * .1, H * .78, W * .8, H * .22, W * .1, P.b) + R(W * .48, H * .1, W * .04, H * .68, 0, P.h) + R(W * .25, H * .05, W * .5, H * .03, W * .01, P.h)
      + R(W * .2, H * .82, W * .3, H * .12, W * .03, 'rgba(120,170,210,.5)') + Pa(`M${W * .6},${H * .8} C${W * .9},${H * .6} ${W * .9},${H * .3} ${W * .55},${H * .2}`, 'none', `stroke="${P.d}" stroke-width="${W * .03}"`) + Ci(W * .7, H * .88, W * .04, P.a);
    return R(W * .1, H * .4, W * .8, H * .6, W * .2, P.b) + R(0, 0, W, H * .42, W * .25, P.b2) + R(W * .2, H * .6, W * .6, H * .25, W * .1, 'rgba(120,170,210,.5)') + Ci(W * .5, H * .5, W * .08, P.a);
  },
  sewing(W, H, P) {
    return R(0, H * .78, W, H * .22, W * .02, P.b) + R(W * .72, H * .15, W * .26, H * .65, W * .04, P.b) + R(W * .05, H * .08, W * .93, H * .22, W * .04, P.b)
      + R(W * .05, H * .3, W * .15, H * .28, W * .02, P.b2) + Ln(W * .12, H * .58, W * .12, H * .76, P.h, W * .008) + R(W * .78, H * .35, W * .14, H * .25, W * .02, P.g) + R(W * .8, H * .4, W * .06, H * .05, 0, P.a)
      + Ci(W * .99, H * .4, H * .1, P.d) + R(W * .3, H * .12, W * .35, H * .04, 0, P.l);
  },
  hairdryer(W, H, P) {
    return Ci(W * .3, H * .3, W * .3, P.b) + R(W * .3, H * .15, W * .7, H * .3, H * .08, P.b) + R(W * .9, H * .14, W * .1, H * .32, H * .03, P.d) + Ci(W * .3, H * .3, W * .2, P.d) + Ci(W * .3, H * .3, W * .12, P.b2)
      + R(W * .24, H * .45, W * .14, H * .55, W * .06, P.b) + Ci(W * .31, H * .62, W * .03, P.a);
  },
  wand(W, H, P) {
    return R(W * .15, 0, W * .7, H * .55, W * .3, P.b) + R(0, H * .1, W * .2, H * .35, W * .1, P.d, 'opacity=".5"') + R(W * .1, H * .55, W * .8, H * .45, W * .3, P.b2) + Ci(W * .5, H * .7, W * .12, P.a);
  },
  shaver(W, H, P, p) {
    const rot = p.specs.type === 'Роторная';
    return R(W * .1, H * .25, W * .8, H * .75, W * .35, P.b) + R(0, 0, W, H * .26, W * .2, P.d) + (rot ? Ci(W * .25, H * .12, W * .16, P.h) + Ci(W * .75, H * .12, W * .16, P.h) + Ci(W * .5, H * .06, W * .14, P.h)
      : R(W * .1, H * .04, W * .8, H * .16, W * .05, P.h)) + Ci(W * .5, H * .5, W * .1, P.a) + R(W * .1, H * .25, W * .15, H * .7, W * .07, P.sh);
  },
  trimmer(W, H, P) {
    return R(W * .15, H * .12, W * .7, H * .88, W * .35, P.b) + R(W * .05, 0, W * .9, H * .12, W * .04, P.h) + R(W * .1, H * .02, W * .8, H * .04, 0, P.d) + Ci(W * .5, H * .4, W * .12, P.a) + R(W * .15, H * .12, W * .15, H * .8, W * .07, P.sh);
  },
  toothbrush(W, H, P) {
    return R(W * .2, H * .32, W * .6, H * .68, W * .3, P.b) + R(W * .38, H * .08, W * .24, H * .26, W * .1, '#f2f2f2') + R(W * .3, 0, W * .4, H * .1, W * .1, '#f2f2f2') + R(W * .32, H * .01, W * .36, H * .06, 0, '#7bb4e0')
      + Ci(W * .5, H * .5, W * .14, P.a) + R(W * .2, H * .32, W * .15, H * .66, W * .07, P.sh);
  },
  scales(W, H, P) {
    const sk = W * .06, th = H * .1;
    return Pa(`M${sk},0 L${W - sk},0 L${W},${H - th} L0,${H - th}Z`, P.top) + R(0, H - th, W, th, W * .01, P.d) + R(W * .38, H * .12, W * .24, H * .14, W * .01, '#0b0c0e') + R(W * .41, H * .16, W * .14, H * .05, 0, P.a)
      + El(W * .3, H * .6, W * .1, H * .12, P.l, 'opacity=".5"') + El(W * .7, H * .6, W * .1, H * .12, P.l, 'opacity=".5"');
  },
};
const DRAW_MAP = { fridge: 'fridge', freezer: 'freezer', wine: 'wine', washer: 'washer', dryer: 'washer', iron: 'iron', steamer: 'steamer', sewing: 'sewing',
  dishwasher: 'dishwasher', stove: 'stove', hob: 'hob', oven: 'oven', hood: 'hood', microwave: 'microwave', multicooker: 'cooker', kettle: 'kettle', coffee: 'coffee',
  blender: 'blender', mixer: 'mixer', meatgrinder: 'grinder', toaster: 'toaster', breadmaker: 'breadmaker', airfryer: 'airfryer', juicer: 'juicer', foodproc: 'blender',
  egrill: 'egrill', waterfilter: 'waterfilter', vacuum: 'vacuum', windowbot: 'windowbot', aircon: 'aircon', heater: 'heater', fan: 'fan', humidifier: 'tower',
  purifier: 'tower', waterheater: 'waterheater', hairdryer: 'hairdryer', styler: 'wand', shaver: 'shaver', trimmer: 'trimmer', toothbrush: 'toothbrush', scales: 'scales',
  tv: 'tv', speaker: 'speaker' };

function palette(code, id) {
  const c = BODY[code] || BODY.s, dark = DARKS.has(code);
  const defs = `<defs>
    <linearGradient id="b${id}" x1="0" x2="1">${code === 'x' || code === 's' ? '<stop offset="0" stop-color="#e3e6e9"/><stop offset=".45" stop-color="#bfc5cb"/><stop offset=".6" stop-color="#d6dadd"/><stop offset="1" stop-color="#8e959c"/>'
      : `<stop offset="0" stop-color="${shade(c, .14)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -.22)}"/>`}</linearGradient>
    <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3f47"/><stop offset=".5" stop-color="#121418"/><stop offset="1" stop-color="#050607"/></linearGradient>
    <linearGradient id="s${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c2a3d"/><stop offset=".5" stop-color="#2b2140"/><stop offset="1" stop-color="#0e1420"/></linearGradient>
    <linearGradient id="t${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2d33"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient>
    <linearGradient id="st${id}" x1="0" x2="1"><stop offset="0" stop-color="#e3e6e9"/><stop offset=".5" stop-color="#a9b0b7"/><stop offset="1" stop-color="#cdd2d6"/></linearGradient></defs>`;
  return { defs, P: {
    b: `url(#b${id})`, b2: shade(c, dark ? .08 : -.08), d: dark ? '#0d0e10' : '#1b1c20', h: dark ? '#4a4e55' : shade(c, -.35), g: '#0b0c0e', gl: `url(#g${id})`, scr: `url(#s${id})`,
    top: `url(#t${id})`, l: dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.16)', l2: 'rgba(255,255,255,.18)', a: '#d9b27c', sh: 'rgba(255,255,255,.08)', hi: 'rgba(255,255,255,.12)',
    f: dark ? `url(#b${id})` : '#cfc6b8', st: `url(#st${id})`, ring: '#d9b27c', mist: dark ? '#9aa' : '#fff' } };
}

// Иллюстрация модели: opts.color — код цвета, opts.dims — выносные размеры, opts.bare — без тени
function illoParts(p, color) {
  const [w0, h0, d0] = [p.specs.width, p.specs.height, p.specs.depth];
  const w = +w0 || 50, h = +h0 || 50, d = +d0 || w;
  const [W, H] = (VIS[p.cat] || ((a, b) => [a, b]))(w, h, d, p);
  const id = ++ILLO_ID, code = color || (p.specs.colors || [])[0] || 's';
  const { defs, P } = palette(code, id);
  const fn = DRAW[DRAW_MAP[p.cat]] || DRAW.microwave;
  return { W, H, w, h, defs, body: fn(W, H, P, p) };
}
function illo(p, opts = {}) {
  const { W, H, w, h, defs, body } = illoParts(p, opts.color);
  const m = Math.max(W, H), pad = m * (opts.dims ? .2 : .1), fs = m * .055;
  let dim = '';
  const lw = W === w ? p.specs.width : W === +p.specs.depth ? p.specs.depth : null;
  if (opts.dims && p.specs.width) {
    const y = H + pad * .45, x = W + pad * .35, sw = m * .005, c = 'var(--acc)';
    if (lw) dim = Ln(0, y, W, y, c, sw) + Ln(0, y - fs * .3, 0, y + fs * .3, c, sw) + Ln(W, y - fs * .3, W, y + fs * .3, c, sw)
      + `<text x="${W / 2}" y="${y + fs * 1.15}" font-size="${fs}" text-anchor="middle" fill="var(--mut)" font-family="Jost,sans-serif" letter-spacing=".05em">${W === w ? '' : 'длина '}${num(lw)} см${W === w && p.specs.depth ? ' · глубина ' + num(p.specs.depth) + ' см' : ''}</text>`;
    if (H === h) dim += Ln(x, 0, x, H, c, sw) + Ln(x - fs * .3, 0, x + fs * .3, 0, c, sw) + Ln(x - fs * .3, H, x + fs * .3, H, c, sw)
      + `<text x="${x + fs * .5}" y="${H / 2}" font-size="${fs}" fill="var(--mut)" font-family="Jost,sans-serif" dominant-baseline="middle" letter-spacing=".05em" transform="rotate(90 ${x + fs * .5} ${H / 2})" text-anchor="middle">${num(p.specs.height)} см</text>`;
  }
  const vb = [-pad, -pad, W + pad * (opts.dims ? 2.2 : 2), H + pad * (opts.dims ? 2.4 : 2)].map(v => +v.toFixed(2)).join(' ');
  const shadow = `<ellipse cx="${W / 2}" cy="${H + m * .015}" rx="${W * .55}" ry="${m * .025}" fill="#000" opacity=".35" filter="blur(${m * .012}px)"/>`;
  const svg = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${defs}${opts.bare ? '' : shadow}${body}${dim}</svg>`;
  if (opts.dims || opts.flat) return `<span class="illo">${svg}</span>`;
  return `<span class="illo r3" data-r3="${p.id}" data-c="${opts.color || (p.specs.colors || [])[0] || 's'}">${svg}</span>`;
}

// Модели рядом в одном масштабе с линейкой
function scaleView(items) {
  const parts = items.map(p => illoParts(p));
  const maxH = Math.max(...parts.map(x => x.H)), gap = Math.max(...parts.map(x => x.W)) * .25;
  const step = maxH > 120 ? 50 : maxH > 40 ? 10 : 5, rulerW = maxH * .12, fs = maxH * .045;
  let x = rulerW + gap * .5, g = '', defs = '';
  const human = maxH > 80 ? 170 : 0, topH = Math.max(maxH, human);
  if (human) { const hw = 45; g += `<g opacity=".22" transform="translate(${x},${topH - 170})">${Ci(hw / 2, 11, 11, 'var(--tx)')}${R(hw * .2, 24, hw * .6, 70, 10, 'var(--tx)')}${R(hw * .24, 92, hw * .22, 78, 6, 'var(--tx)')}${R(hw * .54, 92, hw * .22, 78, 6, 'var(--tx)')}</g>
    <text x="${x + hw / 2}" y="${topH + fs * 1.6}" font-size="${fs * .9}" fill="var(--mut)" text-anchor="middle" font-family="Jost,sans-serif">рост 170</text>`; x += hw + gap; }
  parts.forEach((pp, i) => {
    defs += pp.defs;
    g += `<g transform="translate(${x},${topH - pp.H})">${pp.body}</g><text x="${x + pp.W / 2}" y="${topH + fs * 1.6}" font-size="${fs}" fill="var(--tx)" text-anchor="middle" font-family="Jost,sans-serif" letter-spacing=".04em">${esc(items[i].brand)}</text>
      <text x="${x + pp.W / 2}" y="${topH + fs * 2.8}" font-size="${fs * .85}" fill="var(--mut)" text-anchor="middle" font-family="Jost,sans-serif">${pp.w ? num(pp.w) + '×' + num(pp.h) + ' см' : ''}</text>`;
    x += pp.W + gap;
  });
  let ruler = Ln(rulerW * .6, 0, rulerW * .6, topH, 'var(--line)', topH * .004);
  for (let v = 0; v <= topH; v += step) ruler += Ln(rulerW * .4, topH - v, rulerW * .6, topH - v, 'var(--mut)', topH * .004) + Ln(rulerW * .6, topH - v, x, topH - v, 'var(--line)', topH * .002, 'stroke-dasharray="2 4" opacity=".6"')
    + `<text x="${rulerW * .3}" y="${topH - v}" font-size="${fs * .8}" fill="var(--mut)" text-anchor="end" dominant-baseline="middle" font-family="Jost,sans-serif">${v}</text>`;
  return `<svg class="scale" viewBox="${-rulerW * .2} ${-topH * .06} ${x + rulerW * .2} ${topH * 1.22}">${defs}${ruler}${g}</svg>`;
}

// ===== ТехноПодбор: реалистичная 3D-графика (three.js) =====
// Модели строятся процедурно по габаритам из характеристик (единицы — см).
// Фасады крупной техники — «наклейка», нарисованная теми же рисовальщиками DRAW, что и запасные SVG.
// Экспорт: window.R3 = { hydrate(root), viewer(el, p, color), scaleScene(items), ready }
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------- материалы ----------
const MAT = new Map();
function mat(key, make) { if (!MAT.has(key)) MAT.set(key, make()); return MAT.get(key); }
const phys = o => new THREE.MeshPhysicalMaterial(o);
const M = {
  body(code) {
    return mat('body' + code, () => {
      const hex = (typeof BODY !== 'undefined' && BODY[code]) || '#c5cad0';
      if (code === 'x') return phys({ color: '#d4d8dc', metalness: 1, roughness: .3, envMapIntensity: 1.1 });
      if (code === 's') return phys({ color: '#c9ced3', metalness: .85, roughness: .36 });
      if (code === 'k') return phys({ color: '#c58a55', metalness: .9, roughness: .3 });
      if (code === 'f') return phys({ color: '#d8cfc0', roughness: .7 });
      if (code === 'b' || code === 'g') return phys({ color: hex, roughness: .28, clearcoat: .8, clearcoatRoughness: .15 });
      return phys({ color: hex, roughness: .32, clearcoat: .6, clearcoatRoughness: .18 });
    });
  },
  dark: () => mat('dark', () => phys({ color: '#18191c', roughness: .45 })),
  rubber: () => mat('rub', () => phys({ color: '#101112', roughness: .9 })),
  bglass: () => mat('bgl', () => phys({ color: '#040506', roughness: .04, clearcoat: 1, clearcoatRoughness: .03, reflectivity: .9 })),
  glass: () => mat('gl', () => phys({ color: '#e6f2f8', roughness: .03, metalness: 0, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 })),
  water: () => mat('wat', () => phys({ color: '#6aa6cf', roughness: .1, transparent: true, opacity: .45, depthWrite: false })),
  chrome: () => mat('chr', () => phys({ color: '#eceef0', metalness: 1, roughness: .1 })),
  steel: () => mat('stl', () => phys({ color: '#cfd3d7', metalness: 1, roughness: .32 })),
  white: () => mat('wh', () => phys({ color: '#f3f3f1', roughness: .35, clearcoat: .4 })),
  accent: () => mat('acc', () => phys({ color: '#d9b27c', emissive: '#d9b27c', emissiveIntensity: .6, roughness: .4 })),
  screen: () => mat('scr', () => phys({ color: '#070809', roughness: .06, clearcoat: 1, emissive: '#0b1220', emissiveIntensity: .4 })),
  fabric: (code) => mat('fab' + code, () => phys({ color: (typeof BODY !== 'undefined' && BODY[code]) || '#555', roughness: 1, sheen: 1, sheenRoughness: .8, sheenColor: '#888' })),
  tint: (hex, o = .5) => mat('tint' + hex + o, () => phys({ color: hex, roughness: .15, transparent: true, opacity: o, depthWrite: false })),
  plain: (hex, r = .5) => mat('pl' + hex + r, () => phys({ color: hex, roughness: r })),
};

// ---------- примитивы (низ модели — y=0, фронт смотрит в +z) ----------
function add(g, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  o.castShadow = !m.transparent; o.receiveShadow = true; g.add(o); return o;
}
const rbox = (w, h, d, r) => { const mr = Math.min(w, h, d) / 2 - .01; return new RoundedBoxGeometry(w, h, d, 4, Math.max(.05, Math.min(r, mr))); };
const box = (g, w, h, d, m, x, y, z, r = .3) => add(g, rbox(w, h, d, r), m, x, y + h / 2, z);
const cyl = (g, rt, rb, h, m, x, y, z, seg = 48, rx = 0, rz = 0) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + (rx || rz ? 0 : h / 2), z, rx, 0, rz);
const lathe = (g, pts, m, x = 0, y = 0, z = 0, seg = 64) => add(g, new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(Math.max(r, .001), yy)), seg), m, x, y, z);
const sph = (g, r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = add(g, new THREE.SphereGeometry(r, 48, 32), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
const torus = (g, R, r, m, x, y, z, rx = 0, ry = 0, arc = TAU) => add(g, new THREE.TorusGeometry(R, r, 20, 64, arc), m, x, y, z, rx, ry, 0);
const tube = (g, pts, r, m) => add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r, 16), m);
function extrude(g, pts, depth, m, z = 0, bevel = .6) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(depth - bevel * 2, .1), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 24 });
  geo.translate(0, 0, -depth / 2 + bevel); return add(g, geo, m, 0, 0, z);
}
const plane = (g, w, h, m, x, y, z, rx = 0) => add(g, new THREE.PlaneGeometry(w, h), m, x, y, z, rx);

// ---------- «наклейка» фасада из рисовальщика DRAW ----------
const TEX = new Map();
function frontTexture(p, code, W, H) {
  const key = p.id + '|' + code + '|' + W + 'x' + H;
  if (TEX.has(key)) return TEX.get(key);
  const pr = new Promise(res => {
    const id = 'd' + Math.random().toString(36).slice(2, 8);
    const { defs, P } = palette(code, id);
    const T = 'rgba(0,0,0,0)';
    Object.assign(P, { b: T, sh: T, hi: T });
    const fn = DRAW[DRAW_MAP[p.cat]] || DRAW.microwave;
    let body = ''; try { body = fn(W, H, P, p); } catch (e) { console.warn(e); }
    const k = 1024 / Math.max(W, H), cw = Math.round(W * k), ch = Math.round(H * k);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${W} ${H}">${defs}${body}</svg>`;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(img, 0, 0, cw, ch);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t);
    };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  TEX.set(key, pr); return pr;
}
async function decal(g, p, code, W, H, z, y0 = 0, x0 = 0) {
  const t = await frontTexture(p, code, W, H); if (!t) return;
  const m = phys({ map: t, transparent: true, roughness: .35, clearcoat: .5, clearcoatRoughness: .2, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  const o = plane(g, W, H, m, x0, y0 + H / 2, z + .05); o.castShadow = false; o.renderOrder = 2;
}
// Текстура с рисунком на canvas (верх варочной, весы и т. п.)
function canvasTex(w, h, draw) {
  const k = 1024 / Math.max(w, h), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const x = c.getContext('2d'); x.scale(k, k); draw(x); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------- сборщики моделей ----------
const num0 = v => +v || 0;
function dimsOf(p) {
  const B = p.box || {}, w = num0(p.specs.width) || num0(B.w) || 50, h = num0(p.specs.height) || num0(B.h) || 50, d = num0(p.specs.depth) || num0(B.d) || Math.min(w, h) * .8;
  return { w, h, d };
}
// «Коробка с фасадом»: корпус + наклейка спереди
async function boxFront(g, p, code, w, h, d, r, extra) {
  const bm = M.body(code);
  box(g, w, h, d, bm, 0, 0, 0, r);
  await decal(g, p, code, w, h, d / 2);
  if (extra) await extra(bm);
}
const B = {
  async fridge(g, p, c, { w, h, d }) {
    const hb = h * .975;
    box(g, w, hb, d, M.body(c), 0, h - hb, 0, w * .03);
    [-.4, .4].forEach(k => cyl(g, w * .03, w * .03, h - hb, M.dark(), w * k, 0, d * .35));
    await decal(g, p, c, w, h, d / 2);
  },
  async freezer(g, p, c, { w, h, d }) {
    if (p.specs.type === 'Ларь') {
      box(g, w, h * .82, d, M.body(c), 0, 0, 0, 1.5); box(g, w * 1.01, h * .17, d * 1.01, M.body(c), 0, h * .83, 0, 1.5);
      return decal(g, p, c, w, h, d / 2 + .5);
    }
    box(g, w, h * .97, d, M.body(c), 0, h * .03, 0, w * .03); return decal(g, p, c, w, h, d / 2);
  },
  wine: (g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, 1.2),
  async washer(g, p, c, { w, h, d }) {
    await boxFront(g, p, c, w, h, d, w * .025);
    if (p.specs.type === 'Вертикальная') return;
    const rr = Math.min(w, h) * .32, cy = h - h * .57;
    torus(g, rr * .9, rr * .09, M.chrome(), 0, cy, d / 2 + rr * .05);
    sph(g, rr * .82, M.glass(), 0, cy, d / 2 - rr * .3, 1, 1, .45);
    torus(g, rr * .95, rr * .05, M.body(c), 0, cy, d / 2 + .1);
  },
  dishwasher: (g, p, c, s) => boxFront(g, p, p.specs.builtin ? 'f' : c, s.w, s.h, s.d, .8),
  async stove(g, p, c, { w, h, d }) {
    await boxFront(g, p, c, w, h * .98, d, 1);
    const gas = /газ/i.test(p.specs.hob || ''), top = h * .98;
    box(g, w * .98, 1.2, d * .9, gas ? M.steel() : M.bglass(), 0, top, -d * .03, .4);
    [[-.24, -.22, .1], [.24, -.22, .08], [-.24, .2, .08], [.24, .2, .1]].forEach(([x, z, r]) => {
      if (gas) { cyl(g, w * r * .55, w * r * .6, 1.2, M.dark(), w * x, top + 1.2, d * z); cyl(g, w * r * .3, w * r * .3, .8, M.dark(), w * x, top + 2.4, d * z);
        box(g, w * r * 2, .6, .8, M.dark(), w * x, top + 2.4, d * z, .2); box(g, .8, .6, w * r * 2, M.dark(), w * x, top + 2.4, d * z, .2); }
      else torus(g, w * r, .25, M.plain('#5b4a3a', .5), w * x, top + 1.25, d * z, Math.PI / 2);
    });
  },
  async hob(g, p, c, { w, h, d }) {
    const th = Math.max(h, 4), gas = p.specs.type === 'Газовая', n = p.specs.burners || 4;
    box(g, w * .96, th - 1, d * .96, M.dark(), 0, 0, 0, .3);
    const pts = n === 2 ? [[.5, .3, .26], [.5, .68, .2]] : n === 3 ? [[.3, .32, .18], [.72, .32, .14], [.5, .7, .2]] : [[.28, .3, .16], [.72, .3, .13], [.28, .68, .2], [.72, .68, .16]];
    const t = canvasTex(w, d, x => {
      x.fillStyle = gas ? '#c9ced3' : '#060708'; x.fillRect(0, 0, w, d);
      if (!gas) pts.forEach(([px, py, r]) => { x.strokeStyle = 'rgba(217,178,124,.8)'; x.lineWidth = .5; x.beginPath(); x.arc(w * px, d * py, w * r * .5, 0, TAU); x.stroke();
        x.globalAlpha = .45; x.beginPath(); x.arc(w * px, d * py, w * r * .3, 0, TAU); x.stroke(); x.globalAlpha = 1; });
      x.fillStyle = 'rgba(217,178,124,.6)'; x.fillRect(w * .4, d * .9, w * .2, d * .03);
    });
    const top = phys(gas ? { map: t, metalness: .9, roughness: .3 } : { map: t, roughness: .04, clearcoat: 1, clearcoatRoughness: .03 });
    box(g, w, 1, d, top, 0, th - 1, 0, .3);
    if (gas) pts.forEach(([px, py, r]) => { const x = w * (px - .5), z = d * (py - .5);
      cyl(g, w * r * .3, w * r * .32, 1.4, M.dark(), x, th, z); cyl(g, w * r * .18, w * r * .18, .6, M.dark(), x, th + 1.4, z);
      [0, Math.PI / 2].forEach(a => add(g, new THREE.BoxGeometry(w * r * 1.1, .7, .7), M.dark(), x, th + 2, z, 0, a, 0)); });
  },
  oven: (g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, .6),
  async hood(g, p, c, { w, h, d }) {
    const t = p.specs.type, bm = M.body(c);
    if (t === 'Встраиваемая') return boxFront(g, p, c, w, h, d, .5);
    if (t === 'Наклонная') {
      box(g, w * .9, h * .62, d * .4, bm, 0, h * .38, -d * .3, .6);
      const L = Math.hypot(h * .62, d * .7), a = Math.atan2(d * .7, h * .62);
      const o = add(g, rbox(w, L, 1.6, .4), M.bglass(), 0, h * .38 + h * .31, d * .1, 0); o.rotation.x = -a;
      box(g, w, h * .06, d * .9, M.dark(), 0, h * .32, 0, .4); return;
    }
    if (t === 'Островная') { box(g, w * .24, h * .7, w * .24, bm, 0, h * .3, 0, .4); box(g, w, h * .3, d, bm, 0, 0, 0, .8); return; }
    box(g, w * .28, h * .5, d * .35, bm, 0, h * .5, -d * .3, .4);
    extrude(g, [[-w * .2, h * .55], [w * .2, h * .55], [w * .5, h * .1], [-w * .5, h * .1]], d, bm, 0, .5);
    box(g, w, h * .1, d, M.body(c), 0, 0, 0, .5);
    cyl(g, .9, .9, .4, M.accent(), w * .35, h * .05, d / 2 + .1, 24, Math.PI / 2);
  },
  microwave: (g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, 1.2),
  async tv(g, p, c, { w, h, d }) {
    const sh = h * .94, th = Math.min(d, 4);
    box(g, w, sh, th, M.dark(), 0, h - sh, 0, .4);
    const scr = phys({ color: '#05070b', roughness: .05, clearcoat: 1, emissive: '#0d1626', emissiveIntensity: .35 });
    plane(g, w - 1.2, sh - 1.2, scr, 0, h - sh / 2, th / 2 + .02);
    [-.3, .3].forEach(k => { box(g, 1.2, h - sh + 1, 2, M.dark(), w * k, 0, 0, .2); box(g, 2, .8, Math.max(d, 18), M.dark(), w * k, 0, 0, .3); });
  },
  aircon: (g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, s.h * .28),
  async heater(g, p, c, { w, h, d }) {
    const t = p.specs.type, bm = M.body(c);
    if (t === 'Масляный радиатор') {
      const n = 9, fw = w / n;
      for (let i = 0; i < n; i++) box(g, fw * .78, h * .86, d * .9, bm, -w / 2 + fw * (i + .5), h * .12, 0, fw * .35);
      box(g, w * .9, h * .05, d * .4, bm, 0, h * .5, 0, .5);
      [-.4, .4].forEach(k => box(g, 3, h * .12, d * 1.3, M.dark(), w * k, 0, 0, .5));
      box(g, w * .1, h * .1, 2, M.dark(), w * .38, h * .7, d / 2 + .5, .3); return;
    }
    if (t === 'Тепловентилятор' || t === 'Инфракрасный') return boxFront(g, p, c, w, h, d, t === 'Тепловентилятор' ? w * .12 : h * .1);
    box(g, w, h * .88, d, bm, 0, h * .12, 0, 1); await decal(g, p, c, w, h, d / 2);
    [-.36, .36].forEach(k => box(g, 3, h * .13, d * 2.5, M.dark(), w * k, 0, 0, .5));
  },
  async fan(g, p, c, { w, h, d }) {
    const t = p.specs.type, bm = M.body(c);
    if (t === 'Колонный') {
      cyl(g, w * .4, w * .42, h * .9, bm, 0, h * .05, 0, 48); cyl(g, w * .5, w * .5, h * .05, M.dark(), 0, 0, 0);
      const grill = canvasTex(w, h, x => { x.fillStyle = 'rgba(0,0,0,0)'; for (let y = h * .12; y < h * .75; y += h * .025) { x.fillStyle = 'rgba(10,10,12,.85)'; x.fillRect(w * .25, y, w * .5, h * .009); } });
      const o = plane(g, w * .8, h * .9, phys({ map: grill, transparent: true, depthWrite: false }), 0, h * .5, w * .42 + .05); o.castShadow = false;
      cyl(g, w * .06, w * .06, .5, M.accent(), 0, h * .95, 0); return;
    }
    if (t === 'Безлопастной') {
      const R = w * .42, tb = w * .07, hr = h * .6, ring = torus(g, R, tb, bm, 0, h * .4 + hr / 2 - tb * .5, 0, 0, 0);
      ring.scale.set(1, (hr - tb * 2) / (2 * R), 1.6);
      cyl(g, w * .2, w * .24, h * .4, bm, 0, 0, 0, 48); cyl(g, w * .04, w * .04, .4, M.accent(), 0, h * .25, w * .23, 24, Math.PI / 2); return;
    }
    const r = w * .5, cy = h - r;
    torus(g, r * .96, .5, M.chrome(), 0, cy, 2, 0); torus(g, r * .96, .5, M.chrome(), 0, cy, -6, 0);
    for (let i = 1; i < 5; i++) torus(g, r * .22 * i, .15, M.chrome(), 0, cy, 2.3, 0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; tube(g, [V(0, cy, 2.3), V(Math.cos(a) * r * .5, cy + Math.sin(a) * r * .5, 1.5), V(Math.cos(a) * r * .96, cy + Math.sin(a) * r * .96, -2)], .12, M.chrome()); }
    for (let i = 0; i < 5; i++) { const b = sph(g, r * .4, phys({ color: '#9fb4c4', roughness: .2, transparent: true, opacity: .55, depthWrite: false }), 0, cy, -2, 1, .38, .06);
      b.rotation.z = i / 5 * TAU; b.geometry.translate(r * .4, 0, 0); }
    cyl(g, r * .16, r * .16, 3, bm, 0, cy, -1.5, 32, Math.PI / 2); cyl(g, r * .22, r * .26, 12, bm, 0, cy, -10, 32, Math.PI / 2);
    cyl(g, 1.3, 1.3, cy - r * .2, M.chrome(), 0, 1.5, -10); cyl(g, w * .32, w * .35, 3, bm, 0, 0, -10, 48);
  },
  tower: (g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, s.w * .2, async () => {
    if (p.cat === 'humidifier') { const m = phys({ color: '#eef6fb', roughness: 1, transparent: true, opacity: .18, depthWrite: false });
      for (let i = 0; i < 4; i++) sph(g, s.w * (.12 + i * .05), m, s.w * .02 * i, s.h + s.w * (.1 + i * .12), 0); }
  }),
  async waterheater(g, p, c, { w, h, d }) {
    if (p.specs.type !== 'Проточный' && p.specs.shape === 'Круглый') {
      cyl(g, w / 2, w / 2, h * .9, M.body(c), 0, h * .05, 0, 64); sph(g, w / 2, M.body(c), 0, h * .95, 0, 1, .1, 1); sph(g, w / 2, M.body(c), 0, h * .05, 0, 1, .1, 1);
      cyl(g, w * .12, w * .12, 1.2, M.dark(), 0, h * .7, w / 2, 48, Math.PI / 2); cyl(g, w * .03, w * .03, .4, M.accent(), 0, h * .7, w / 2 + .8, 24, Math.PI / 2);
      [-.15, .15].forEach(k => cyl(g, 1, 1, h * .05, M.chrome(), w * k, 0, 0, 24)); return;
    }
    return boxFront(g, p, c, w, h, d, p.specs.type === 'Проточный' ? w * .08 : w * .12);
  },
  async speaker(g, p, c, { w, h, d }) {
    const r = w / 2;
    cyl(g, r, r, h * .92, M.fabric(c), 0, 0, 0, 64); cyl(g, r * .98, r, h * .08, M.body(c === 'w' ? 'w' : c), 0, h * .92, 0, 64);
    torus(g, r * .7, .3, M.accent(), 0, h, 0, Math.PI / 2);
    if (p.specs.screen) { const o = plane(g, w * .5, h * .18, M.screen(), 0, h * .55, r + .1); }
  },
  async vacuum(g, p, c, { w, h, d }) {
    const t = p.specs.type, bm = M.body(c);
    if (t === 'Робот') {
      const r = w / 2; cyl(g, r, r * .98, h * .82, bm, 0, h * .06, 0, 72); cyl(g, r * .98, r * .98, h * .06, M.dark(), 0, 0, 0, 72);
      cyl(g, r * .97, r, .3, M.dark(), 0, h * .5, 0, 72); cyl(g, r * .16, r * .16, h * .18, M.dark(), 0, h * .88, -r * .3, 48);
      box(g, r * .9, h * .3, 2, M.bglass(), 0, h * .3, r * .9, .5); cyl(g, .6, .6, .2, M.accent(), r * .2, h * .88, r * .3, 16); return;
    }
    if (t === 'Вертикальный') {
      box(g, w * .9, h * .07, d * .55, M.dark(), 0, 0, d * .15, 1.5);
      cyl(g, 1.6, 1.6, h * .62, M.steel(), 0, h * .07, d * .05);
      cyl(g, w * .17, w * .17, h * .22, M.glass(), 0, h * .66, d * .05); cyl(g, w * .15, w * .15, h * .2, M.tint('#9fb5c8', .5), 0, h * .67, d * .05);
      box(g, w * .2, h * .12, w * .3, bm, 0, h * .86, d * .05, 2);
      tube(g, [V(0, h * .93, d * .05), V(0, h, -d * .1), V(0, h * .95, -d * .3), V(0, h * .88, -d * .2)], 1.5, bm); return;
    }
    const L = d || w * 1.3;
    box(g, w * .8, h * .6, L * .9, bm, 0, h * .05, 0, h * .25);
    box(g, w * .8, h * .1, L * .6, M.glass(), 0, h * .66, -L * .1, 2);
    [-1, 1].forEach(s => cyl(g, h * .17, h * .17, 3, M.dark(), s * w * .42, h * .17, -L * .2, 32, 0, Math.PI / 2));
    cyl(g, h * .05, h * .05, 2, M.dark(), 0, 0, L * .35);
    tube(g, [V(0, h * .45, L * .45), V(0, h * .9, L * .65), V(w * .2, h * 1.3, L * .5), V(w * .35, h * 1.5, L * .2)], 1.6, M.dark());
    cyl(g, w * .05, w * .05, 1, M.accent(), w * .22, h * .66, L * .2);
    if (t === 'Моющий') box(g, w * .5, h * .3, 2, M.water(), 0, h * .2, L * .45, .5);
  },
  async windowbot(g, p, c, { w, h, d }) { const H = d || w * .5, D = Math.max(h, 8); box(g, w, H, D, M.body(c), 0, 0, 0, w * .12);
    box(g, w * .96, H * .9, 1, M.rubber(), 0, H * .05, -D / 2, w * .1); plane(g, w * .5, H * .12, M.screen(), 0, H * .78, D / 2 + .05); cyl(g, 1, 1, .4, M.accent(), 0, H * .5, D / 2 + .1, 16, Math.PI / 2); },
  async kettle(g, p, c, { w, h, d }) {
    const glass = p.specs.body === 'Стекло', bm = M.body(c), r = w * .3, cx = -w * .02;
    cyl(g, r * 1.1, r * 1.12, h * .08, M.dark(), cx, 0, 0, 64);
    const prof = [[r * .98, h * .1], [r * 1.02, h * .3], [r * .95, h * .7], [r * .82, h * .88], [r * .78, h * .9]];
    lathe(g, prof, glass ? M.glass() : bm, cx);
    if (glass) { lathe(g, [[0.01, h * .1], [r * .96, h * .1], [r * .99, h * .3], [r * .96, h * .5], [.01, h * .5]], M.water(), cx);
      cyl(g, r * .1, r * .1, h * .8, bm, cx - r * .9, h * .1, 0, 16); }
    cyl(g, r * .8, r * .85, h * .07, glass ? M.dark() : bm, cx, h * .88, 0, 64); cyl(g, r * .2, r * .2, h * .04, M.dark(), cx, h * .95, 0, 32);
    tube(g, [V(cx + r * .8, h * .82, 0), V(cx + r * 1.6, h * .78, 0), V(cx + r * 1.65, h * .45, 0), V(cx + r * .95, h * .25, 0)], w * .05, glass ? M.dark() : bm);
    extrude(g, [[cx - r * .75, h * .78], [cx - r * 1.55, h * .9], [cx - r * 1.5, h * .95], [cx - r * .7, h * .88]], r * .5, glass ? M.dark() : bm, 0, .3);
    cyl(g, w * .015, w * .015, .4, M.accent(), cx + r * 1.2, h * .2, r * .5, 16, Math.PI / 2);
  },
  coffee: (g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, 1.2),
  toaster: (g, p, c, s) => boxFront(g, p, c, s.w, s.h * .96, s.d, s.w * .15, async () => {
    const n = p.specs.slots || 2; for (let i = 0; i < n; i++) box(g, s.w * .65, .3, 1.2, M.dark(), 0, s.h * .96, -s.d * .3 + i * s.d * .6 / Math.max(n - 1, 1), .1);
  }),
  async cooker(g, p, c, { w, h, d }) {
    const r = w / 2, bm = M.body(c);
    cyl(g, r * .95, r * .9, h * .75, bm, 0, h * .03, 0, 72); sph(g, r * .95, bm, 0, h * .78, 0, 1, .28, 1);
    cyl(g, r * .9, r * .9, h * .03, M.dark(), 0, 0, 0, 64); cyl(g, r * .1, r * .1, h * .05, M.dark(), 0, h * .98, -r * .2, 32);
    const pnl = plane(g, w * .38, h * .2, M.screen(), 0, h * .4, r * .93); pnl.rotation.x = -.05;
    plane(g, w * .14, h * .05, M.accent(), -w * .07, h * .44, r * .94);
  },
  airfryer: (g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, s.w * .2),
  breadmaker: (g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, 1.5),
  async blender(g, p, c, { w, h, d }) {
    const t = p.specs.type, bm = M.body(c);
    if (t === 'Погружной') {
      const r = w * .3; lathe(g, [[r * .6, h * .45], [r, h * .55], [r, h * .9], [r * .7, h]], bm);
      cyl(g, r * .35, r * .35, h * .4, M.steel(), 0, h * .08, 0, 32); lathe(g, [[r * .35, h * .12], [w * .45, 0], [w * .45, .01]], M.steel(), 0, 0, 0, 48);
      cyl(g, r * .3, r * .3, .4, M.accent(), 0, h * .8, r, 16, Math.PI / 2); return;
    }
    if (t === 'Портативный') {
      const r = w * .42; cyl(g, r, r, h * .22, bm, 0, 0, 0, 48); cyl(g, r * .98, r * .98, h * .55, M.glass(), 0, h * .22, 0, 48);
      cyl(g, r * .9, r * .9, h * .3, M.tint('#e58fb3', .65), 0, h * .22, 0, 48); cyl(g, r * .9, r, h * .15, bm, 0, h * .77, 0, 48);
      torus(g, r * .4, .5, bm, 0, h * .95, 0, 0); return;
    }
    const base = Math.min(w, d || w) * .5;
    lathe(g, [[base, 0], [base * 1.02, h * .05], [base * .9, h * .33], [base * .7, h * .34]], bm);
    lathe(g, [[base * .55, h * .34], [base * .75, h * .5], [base * .95, h * .93]], M.glass());
    lathe(g, [[.01, h * .38], [base * .6, h * .38], [base * .7, h * .48], [base * .8, h * .62], [.01, h * .62]], M.tint('#a8c66c', .55));
    cyl(g, base * .98, base * .96, h * .07, M.dark(), 0, h * .93, 0, 48);
    tube(g, [V(base * .8, h * .85, 0), V(base * 1.25, h * .8, 0), V(base * 1.2, h * .5, 0), V(base * .78, h * .45, 0)], base * .1, M.dark());
    cyl(g, base * .18, base * .18, 1.5, M.dark(), 0, h * .17, base * .95, 32, Math.PI / 2); cyl(g, base * .06, base * .06, .3, M.accent(), 0, h * .17, base * 1.05, 16, Math.PI / 2);
  },
  async mixer(g, p, c, { w, h, d }) {
    const bm = M.body(c);
    if (p.specs.type === 'Ручной') {
      extrude(g, [[-w * .45, h * .45], [-w * .45, h * .75], [-w * .1, h * .85], [w * .45, h * .85], [w * .45, h * .45]], d * .9, bm, 0, 2);
      tube(g, [V(-w * .1, h * .85, 0), V(0, h * 1.02, 0), V(w * .38, h * 1.02, 0), V(w * .45, h * .85, 0)], h * .05, bm);
      [-.08, .1].forEach(k => { cyl(g, .4, .4, h * .4, M.chrome(), w * k, h * .05, 0, 16);
        for (let i = 0; i < 4; i++) torus(g, h * .06, .2, M.chrome(), w * k, h * .1, 0, 0, i * Math.PI / 4); });
      return;
    }
    box(g, w * .9, h * .1, d * .9, bm, 0, 0, 0, 2); box(g, w * .22, h * .65, d * .5, bm, w * .32, h * .1, -d * .15, 3);
    box(g, w * .85, h * .25, d * .45, bm, w * .03, h * .7, -d * .1, h * .1);
    lathe(g, [[w * .12, h * .1], [w * .26, h * .25], [w * .3, h * .5], [w * .28, h * .52]], M.steel(), -w * .1, 0, 0);
    cyl(g, .6, .6, h * .25, M.chrome(), -w * .1, h * .45, 0, 16); cyl(g, 1, 1, .5, M.accent(), w * .35, h * .55, d * .1, 16, Math.PI / 2);
  },
  async grinder(g, p, c, { w, h, d }) {
    const bm = M.body(c);
    box(g, w * .55, h * .62, d * .8, bm, w * .2, 0, 0, 3);
    cyl(g, h * .12, h * .12, w * .5, M.steel(), -w * .2, h * .42, 0, 48, 0, Math.PI / 2);
    cyl(g, h * .13, h * .13, 1, M.dark(), -w * .45, h * .42, 0, 48, 0, Math.PI / 2);
    cyl(g, h * .07, h * .09, h * .18, M.steel(), -w * .15, h * .5, 0, 32);
    box(g, w * .3, 1.2, d * .5, M.steel(), -w * .15, h * .68, 0, .5);
    cyl(g, 1, 1, .4, M.accent(), w * .3, h * .35, d * .4, 16, Math.PI / 2);
  },
  async juicer(g, p, c, { w, h, d }) {
    const bm = M.body(c);
    if (p.specs.type === 'Цитрус-пресс') {
      cyl(g, w * .4, w * .45, h * .55, bm, 0, 0, 0, 64); lathe(g, [[w * .46, h * .55], [w * .48, h * .7], [w * .46, h * .72]], M.tint('#f0b43c', .5));
      lathe(g, [[w * .2, h * .6], [w * .12, h * .8], [.01, h * .98]], M.dark()); return;
    }
    box(g, w * .7, h * .4, d * .7, bm, -w * .05, 0, 0, 3);
    lathe(g, [[w * .3, h * .4], [w * .32, h * .62], [w * .34, h * .82]], M.glass(), -w * .05);
    cyl(g, w * .1, w * .1, h * .2, M.dark(), -w * .05, h * .8, 0, 32);
    box(g, w * .2, h * .2, w * .2, M.tint('#f0a03c', .6), w * .38, h * .35, 0, 2);
    cyl(g, 1, 1, .4, M.accent(), -w * .05, h * .2, d * .35, 16, Math.PI / 2);
  },
  async egrill(g, p, c, { w, h, d }) {
    const bm = M.body(c);
    if (p.specs.type === 'Открытый') {
      box(g, w, h * .2, d * .9, bm, 0, h * .4, 0, 1); box(g, w * .92, .6, d * .82, M.dark(), 0, h * .6, 0, .2);
      [[-.43, -.4], [.43, -.4], [-.43, .4], [.43, .4]].forEach(([x, z]) => cyl(g, .8, .8, h * .4, M.dark(), w * x, 0, d * z, 16)); return;
    }
    box(g, w, h * .48, d, M.body(c), 0, 0, 0, 2); box(g, w * .98, h * .48, d * .96, bm, 0, h * .5, -d * .01, h * .2);
    box(g, w * .4, h * .06, 3, M.dark(), 0, h * .8, d / 2 + 1, 1); cyl(g, .8, .8, .4, M.accent(), 0, h * .25, d / 2 + .3, 16, Math.PI / 2);
  },
  async waterfilter(g, p, c, { w, h, d }) {
    const bm = M.body(c);
    if (p.specs.type === 'Кувшин') {
      const r = (d || w) * .4;
      lathe(g, [[r * .95, 0], [r, h * .5], [r * 1.05, h * .88]], M.glass());
      lathe(g, [[.01, .3], [r * .93, .3], [r * .95, h * .45], [.01, h * .45]], M.water());
      cyl(g, r * .5, r * .5, h * .35, M.white(), 0, h * .5, 0, 32); cyl(g, r * 1.05, r * 1.05, h * .1, bm, 0, h * .88, 0, 64);
      tube(g, [V(-r * .95, h * .8, 0), V(-r * 1.6, h * .7, 0), V(-r * 1.6, h * .3, 0), V(-r * .98, h * .18, 0)], r * .12, bm); return;
    }
    box(g, w, h * .12, d * .6, M.dark(), 0, h * .88, 0, .8);
    for (let i = 0; i < 3; i++) cyl(g, w / 6 * .85, w / 6 * .85, h * .85, bm, -w / 3 + i * w / 3, 0, 0, 48);
  },
  async iron(g, p, c, { w, h, d }) {
    const L = d || w * 2.2, bm = M.body(c);
    const sole = [[0, 0], [L * .7, 0], [L * .98, h * .1], [L * .99, h * .15], [L * .7, h * .16], [0, h * .16]];
    extrude(g, sole.map(([x, y]) => [x - L / 2, y]), w * .95, M.steel(), 0, .3);
    extrude(g, [[0, h * .15], [L * .7, h * .15], [L, h * .38], [L * .3, h * .45], [0, h * .35]].map(([x, y]) => [x - L / 2, y]), w * .9, bm, 0, 1.5);
    extrude(g, [[L * .2, h * .4], [L * .15, h * .95], [L * .35, h], [L * .8, h * .93], [L * .75, h * .42], [L * .62, h * .42], [L * .66, h * .82], [L * .35, h * .85], [L * .35, h * .4]].map(([x, y]) => [x - L / 2, y]), w * .35, bm, 0, 1);
    sph(g, h * .05, M.accent(), 0, h * .28, w * .45);
  },
  async steamer(g, p, c, { w, h, d }) {
    const bm = M.body(c);
    if (p.specs.type === 'Напольный') {
      box(g, w * .8, h * .2, (d || w) * .7, bm, 0, 0, 0, 3); box(g, w * .3, h * .12, 1, M.water(), -w * .15, h * .03, (d || w) * .35, .4);
      cyl(g, .8, .8, h * .72, M.chrome(), 0, h * .2, -(d || w) * .2, 16); box(g, w * .55, 1.2, 1.2, M.chrome(), 0, h * .92, -(d || w) * .2, .4);
      tube(g, [V(w * .2, h * .15, 0), V(w * .5, h * .4, 5), V(w * .4, h * .7, 3), V(w * .15, h * .8, 0)], 1.2, M.dark()); return;
    }
    return boxFront(g, p, c, w, h, d, w * .2);
  },
  async sewing(g, p, c, { w, h, d }) {
    const bm = M.body(c);
    box(g, w, h * .22, d, bm, 0, 0, 0, 1.5); box(g, w * .26, h * .65, d * .8, bm, w * .37, h * .15, 0, 2);
    box(g, w * .93, h * .22, d * .7, bm, w * .02, h * .7, 0, 2); box(g, w * .15, h * .3, d * .5, bm, -w * .38, h * .45, 0, 1);
    cyl(g, .25, .25, h * .18, M.chrome(), -w * .38, h * .25, 0, 8);
    cyl(g, h * .1, h * .1, 2.5, M.dark(), w * .5, h * .58, 0, 48, 0, Math.PI / 2);
    plane(g, w * .14, h * .2, M.screen(), w * .37, h * .5, d * .4 + .05);
  },
  async hairdryer(g, p, c, { w, h, d }) {
    const bm = M.body(c), r = h * .16;
    cyl(g, r, r * .95, w * .7, bm, w * .05, h * .72, 0, 48, 0, Math.PI / 2);
    cyl(g, r * 1.2, r * 1.2, w * .25, bm, -w * .3, h * .72, 0, 48, 0, Math.PI / 2);
    cyl(g, r * .9, r * 1.2, .5, M.dark(), -w * .43, h * .72, 0, 48, 0, Math.PI / 2);
    cyl(g, r * .75, r * .9, w * .1, M.dark(), w * .45, h * .72, 0, 48, 0, Math.PI / 2);
    const hd = add(g, rbox(r * 1.3, h * .6, r * 1.3, r * .6), bm, -w * .12, h * .35, 0); hd.rotation.z = -.15;
    cyl(g, .6, .6, .4, M.accent(), -w * .1, h * .45, r * .66, 16, Math.PI / 2);
  },
  async wand(g, p, c, { w, h, d }) {
    const bm = M.body(c), r = Math.min(w, d || w) / 2;
    if (/выпрям/i.test(p.specs.type || '')) {
      [-1, 1].forEach(s => { box(g, w * .45, h * .95, (d || w) * .9, bm, s * w * .26, 0, 0, w * .2); box(g, w * .08, h * .4, (d || w) * .7, M.dark(), s * w * .03, h * .55, 0, .3); }); return;
    }
    cyl(g, r * .9, r, h * .45, bm, 0, 0, 0, 48); cyl(g, r * .6, r * .7, h * .5, M.dark(), 0, h * .45, 0, 48); sph(g, r * .6, M.dark(), 0, h * .95, 0, 1, .6, 1);
    cyl(g, .5, .5, .3, M.accent(), 0, h * .3, r, 16, Math.PI / 2);
  },
  async shaver(g, p, c, { w, h, d }) {
    const bm = M.body(c), dd = d || w * .6;
    box(g, w * .8, h * .72, dd, bm, 0, 0, 0, Math.min(w, dd) * .45);
    box(g, w * .95, h * .12, dd * .95, M.dark(), 0, h * .72, 0, Math.min(w, dd) * .3);
    if (p.specs.type === 'Роторная') [[-.27, -.12], [.27, -.12], [0, .18]].forEach(([x, z]) => cyl(g, w * .2, w * .2, h * .06, M.chrome(), w * x * .9, h * .84, dd * z, 48));
    else box(g, w * .85, h * .12, dd * .7, M.chrome(), 0, h * .86, 0, dd * .3);
    cyl(g, w * .08, w * .08, .4, M.accent(), 0, h * .45, dd / 2, 24, Math.PI / 2);
  },
  async trimmer(g, p, c, { w, h, d }) {
    const bm = M.body(c), dd = d || w * .7;
    box(g, w * .75, h * .88, dd, bm, 0, 0, 0, Math.min(w, dd) * .4);
    box(g, w * .95, h * .12, dd * .5, M.chrome(), 0, h * .88, 0, .4);
    cyl(g, w * .1, w * .1, .4, M.accent(), 0, h * .55, dd / 2, 24, Math.PI / 2);
  },
  async toothbrush(g, p, c, { w, h, d }) {
    const bm = M.body(c), r = w * .3;
    lathe(g, [[r * .9, 0], [r, h * .1], [r, h * .6], [r * .7, h * .68]], bm);
    lathe(g, [[r * .7, h * .68], [r * .4, h * .75], [r * .3, h * .9], [r * .32, h * .93]], M.white());
    box(g, r * .9, h * .07, r * 1.2, M.white(), 0, h * .92, r * .2, .4); box(g, r * .7, h * .05, r * .7, M.plain('#7bb4e0', .9), 0, h * .935, r * .7, .3);
    cyl(g, r * .25, r * .25, .3, M.accent(), 0, h * .4, r, 24, Math.PI / 2);
  },
  async scales(g, p, c, { w, h, d }) {
    const dd = d || w, th = Math.max(h, 2), bm = M.body(c);
    const t = canvasTex(w, dd, x => { x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, w, dd); x.fillStyle = '#060708'; x.fillRect(w * .36, dd * .1, w * .28, dd * .12);
      x.fillStyle = '#d9b27c'; x.font = `${dd * .07}px sans-serif`; x.fillText('72.4', w * .41, dd * .19); x.fillStyle = 'rgba(200,205,210,.35)';
      [.3, .7].forEach(px => { x.beginPath(); x.ellipse(w * px, dd * .6, w * .1, dd * .14, 0, 0, TAU); x.fill(); }); });
    box(g, w * .98, th * .6, dd * .98, M.dark(), 0, 0, 0, .3);
    box(g, w, th * .45, dd, phys({ color: c === 'b' ? '#0a0b0c' : (BODY[c] || '#fff'), roughness: .04, clearcoat: 1, transparent: c === 'w', opacity: c === 'w' ? .92 : 1 }), 0, th * .55, 0, dd * .05);
    const o = plane(g, w, dd, phys({ map: t, transparent: true, depthWrite: false }), 0, th + .03, 0, -Math.PI / 2); o.castShadow = false;
  },
};
const BUILD_MAP = { fridge: 'fridge', freezer: 'freezer', wine: 'wine', washer: 'washer', dryer: 'washer', iron: 'iron', steamer: 'steamer', sewing: 'sewing',
  dishwasher: 'dishwasher', stove: 'stove', hob: 'hob', oven: 'oven', hood: 'hood', microwave: 'microwave', multicooker: 'cooker', kettle: 'kettle', coffee: 'coffee',
  blender: 'blender', mixer: 'mixer', meatgrinder: 'grinder', toaster: 'toaster', breadmaker: 'breadmaker', airfryer: 'airfryer', juicer: 'juicer', foodproc: 'blender',
  egrill: 'egrill', waterfilter: 'waterfilter', vacuum: 'vacuum', windowbot: 'windowbot', aircon: 'aircon', heater: 'heater', fan: 'fan', humidifier: 'tower',
  purifier: 'tower', waterheater: 'waterheater', hairdryer: 'hairdryer', styler: 'wand', shaver: 'shaver', trimmer: 'trimmer', toothbrush: 'toothbrush', scales: 'scales',
  tv: 'tv', speaker: 'speaker' };

// ---------- предметы комплекта (наружный блок, база, кран, насадки…) ----------
const PB = {
  async out(g, p, c, { w, h, d }) {                       // наружный блок кондиционера
    const bm = M.plain('#e9ebec', .45);
    box(g, w, h * .94, d, bm, 0, h * .06, 0, .8);
    [-.38, .38].forEach(k => box(g, w * .08, h * .06, d * 1.15, M.dark(), w * k, 0, 0, .3));
    const R = Math.min(h * .4, w * .3), cx = -w * .14, cy = h * .53, fz = d / 2;
    cyl(g, R, R, 1, M.dark(), cx, cy, fz - .4, 64, Math.PI / 2);
    for (let i = 1; i <= 5; i++) torus(g, R * i / 5.2, .25, M.plain('#2b2d31', .5), cx, cy, fz + .2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; add(g, new THREE.BoxGeometry(R * 2, .4, .4), M.plain('#2b2d31', .5), cx, cy, fz + .25, 0, 0, a); }
    for (let i = 0; i < 4; i++) { const b = sph(g, R * .42, M.plain('#5a5f66', .4), cx, cy, fz - 1.2, 1, .32, .08); b.rotation.z = i / 4 * TAU; b.geometry.translate(R * .42, 0, 0); }
    for (let x = w * .2; x < w * .46; x += 1.6) box(g, .5, h * .7, 1, M.plain('#c9ccd0', .5), x, h * .18, fz, .1);
    cyl(g, 1.2, 1.2, 4, M.chrome(), w / 2 + 1.5, h * .2, d * .1, 24, 0, Math.PI / 2); cyl(g, .9, .9, 4, M.chrome(), w / 2 + 1.5, h * .3, d * .1, 24, 0, Math.PI / 2);
  },
  async station(g, p, c, { w, h, d }) {                   // станция самоочистки робота
    const bm = M.body(c);
    box(g, w, h, d * .55, bm, 0, 0, -d * .22, 2.5); box(g, w * .9, h * .08, d, M.dark(), 0, 0, 0, 1.2);
    box(g, w * .7, h * .3, 1, M.glass(), 0, h * .55, d * .06, .5); box(g, w * .66, h * .26, 1, M.tint('#8f9aa3', .5), 0, h * .57, d * .05, .5);
    cyl(g, 1, 1, .4, M.accent(), 0, h * .92, d * .06, 16, Math.PI / 2);
  },
  async base(g, p, c, { w, h, d }) {                      // зарядная база робота
    box(g, w, h, d * .5, M.body(c), 0, 0, -d * .25, 2); box(g, w * .9, 1, d, M.dark(), 0, 0, 0, .4);
    [-.2, .2].forEach(k => box(g, w * .12, 1, 1.5, M.chrome(), w * k, 1, d * .3, .2)); cyl(g, .5, .5, .3, M.accent(), 0, h * .7, 0.1, 16, Math.PI / 2);
  },
  async faucet(g, p, c, { w, h, d }) {                    // кран для фильтра
    cyl(g, w * .5, w * .55, h * .06, M.chrome(), 0, 0, 0, 48); cyl(g, w * .28, w * .3, h * .45, M.chrome(), 0, h * .06, 0, 48);
    tube(g, [V(0, h * .5, 0), V(0, h * .95, -d * .1), V(0, h * .98, d * .35), V(0, h * .75, d * .78)], w * .16, M.chrome());
    add(g, new THREE.BoxGeometry(w * .25, w * .25, d * .3), M.chrome(), 0, h * .48, d * .15, -.3, 0, 0);
  },
  async tank(g, p, c, { w, h, d }) {                      // накопительный бак обратного осмоса
    cyl(g, w / 2, w / 2, h * .82, M.plain('#eef0f2', .4), 0, h * .08, 0, 64); sph(g, w / 2, M.plain('#eef0f2', .4), 0, h * .9, 0, 1, .2, 1);
    cyl(g, w * .42, w * .46, h * .08, M.dark(), 0, 0, 0, 48); cyl(g, 1.2, 1.2, h * .06, M.plain('#3f7fd0', .4), 0, h * .96, 0, 24);
  },
  async charger(g, p, c, { w, h, d }) {                   // зарядная подставка щётки
    lathe(g, [[w * .5, 0], [w * .5, h * .6], [w * .38, h], [.01, h]], M.white()); cyl(g, w * .1, w * .1, h * .4, M.white(), 0, h, 0, 24);
    cyl(g, .4, .4, .2, M.accent(), 0, h * .4, w * .5, 16, Math.PI / 2);
  },
  async cleanst(g, p, c, { w, h, d }) {                   // станция очистки бритвы
    box(g, w, h * .55, d, M.dark(), 0, 0, 0, 2); box(g, w * .7, h * .3, d * .6, M.plain('#2a2d31', .4), 0, h * .55, -d * .1, 2);
    box(g, w * .5, h * .55, d * .3, M.dark(), 0, h * .45, -d * .35, 2); box(g, w * .4, 1, 1, M.tint('#7bb4e0', .7), 0, h * .25, d / 2, .3);
  },
  async attach(g, p, c, { w, h, d, n = 3 }) {             // насадки стайлера: ряд цилиндров
    const k = Math.min(n, 8), step = w / k;
    for (let i = 0; i < k; i++) { const x = -w / 2 + step * (i + .5), r = step * .3 * (i % 2 ? .8 : 1);
      cyl(g, r, r, h * (i % 3 === 2 ? .9 : 1), i % 2 ? M.body(c) : M.dark(), x, 0, 0, 32); cyl(g, r * 1.1, r * 1.1, h * .12, M.dark(), x, 0, 0, 32); }
  },
  async combs(g, p, c, { w, h, d, n = 3 }) {              // насадки-гребни машинки
    const k = Math.min(n, 10), step = w / k;
    for (let i = 0; i < k; i++) { const x = -w / 2 + step * (i + .5), hh = h * (.4 + .6 * i / Math.max(k - 1, 1));
      box(g, step * .8, hh, d, M.plain('#2a2c30', .6), x, 0, 0, .3); for (let j = 0; j < 4; j++) box(g, .25, hh * .3, d * .8, M.plain('#2a2c30', .6), x - step * .3 + j * step * .2, hh, 0, .1); }
  },
  async board(g, p, c, { w, h, d }) {                     // гладильная доска
    extrude(g, [[-w / 2, 0], [w * .3, 0], [w / 2, d * .5], [w * .3, d], [-w / 2, d]].map(([x, z]) => [x, z - d / 2]), 2.5, M.plain('#d8dde2', .8), 0, .6)
      .rotation.x = -Math.PI / 2;
    g.children.at(-1).position.y = h;
    [-1, 1].forEach(s => { const l = add(g, new THREE.BoxGeometry(2, h * 1.15, 2), M.chrome(), 0, h / 2, 0, 0, 0, s * .55); l.position.x = s * w * .05; });
    [-1, 1].forEach(s => box(g, w * .5, 1.5, 2.5, M.dark(), s * w * .28, 0, 0, .5));
  },
  async remote(g, p, c, { w, h, d }) {                    // пульт
    box(g, w, h, d, M.dark(), 0, 0, 0, Math.min(w, d) * .45);
    for (let r = 0; r < 6; r++) for (let k = 0; k < 3; k++) cyl(g, w * .1, w * .1, .4, r === 0 && k === 1 ? M.plain('#d3302f', .4) : M.plain('#3a3d42', .5), (k - 1) * w * .28, h * (.88 - r * .1), d / 2, 16, Math.PI / 2);
    cyl(g, w * .28, w * .28, .4, M.plain('#3a3d42', .5), 0, h * .3, d / 2, 32, Math.PI / 2);
  },
  async blenderjar(g, p, c, { w, h, d }) {                // чаша блендера комбайна
    lathe(g, [[w * .3, 0], [w * .38, h * .15], [w * .45, h * .9]], M.glass()); cyl(g, w * .46, w * .46, h * .08, M.dark(), 0, h * .9, 0, 48);
    cyl(g, w * .32, w * .32, h * .1, M.dark(), 0, 0, 0, 48);
  },
};
const partDims = pt => ({ w: +pt.w || 20, h: +pt.h || 20, d: +pt.d || 10, n: pt.n });

const MODELS = new Map();
// part: предмет комплекта из partsOf(p) — undefined/'main' = основное изделие, 'all' = весь комплект рядом
async function buildModel(p, code, part) {
  const pid = part && part.id || 'main';
  if (pid === 'all') return buildSet(p, code);
  const g = new THREE.Group(), s = pid === 'main' ? dimsOf(p) : partDims(part);
  const fn = pid === 'main' ? (B[BUILD_MAP[p.cat]] || ((g, p, c, s) => boxFront(g, p, c, s.w, s.h, s.d, 1))) : PB[pid];
  try { await fn(g, p, code, s); } catch (e) { console.warn('3D', p.id, pid, e); }
  // кондиционер висит на стене, но показываем его стоящим; всё ставим на «пол»
  const bb = new THREE.Box3().setFromObject(g); g.position.y -= bb.min.y;
  return g;
}
// Весь комплект: предметы рядом на одном «полу», в одном масштабе; у каждого — свои размеры
async function buildSet(p, code) {
  const set = new THREE.Group(), parts = (typeof partsOf === 'function' ? partsOf(p) : []).filter(x => x.id !== 'all');
  let x = 0; const items = [];
  for (const pt of parts) { const o = await buildModel(p, code, pt); const bb = new THREE.Box3().setFromObject(o), s = bb.getSize(V()); items.push([o, bb, s, pt]); }
  const gap = Math.max(...items.map(([, , s]) => s.x)) * .35 + 5;
  items.forEach(([o, bb, s, pt]) => { o.position.x = x - bb.min.x; o.position.z -= (bb.min.z + bb.max.z) / 2; o.userData.part = pt; set.add(o); x += s.x + gap; });
  set.children.forEach(o => o.position.x -= (x - gap) / 2);
  set.userData.isSet = true; return set;
}

// ---------- сцена и освещение ----------
let RND = null, ENV = null;
function renderer() {
  if (RND) return RND;
  RND = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  RND.setPixelRatio(1); RND.toneMapping = THREE.ACESFilmicToneMapping; RND.toneMappingExposure = 1.05;
  RND.outputColorSpace = THREE.SRGBColorSpace; RND.shadowMap.enabled = true; RND.shadowMap.type = THREE.PCFSoftShadowMap;
  ENV = new THREE.PMREMGenerator(RND).fromScene(new RoomEnvironment(), .04).texture;
  return RND;
}
function stage(obj, opts = {}) {
  const sc = new THREE.Scene(); sc.environment = ENV; sc.add(obj);
  const bb = new THREE.Box3().setFromObject(obj), size = bb.getSize(V()), ctr = bb.getCenter(V()), R = Math.max(size.x, size.y, size.z);
  const key = new THREE.DirectionalLight('#fff', 1.6); key.position.set(ctr.x - R * .8, R * 2.2, ctr.z + R * 1.4); key.target.position.copy(ctr);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -.0005; key.shadow.normalBias = .02;
  const sh = key.shadow.camera; sh.left = sh.bottom = -R * 1.2; sh.right = sh.top = R * 1.2; sh.near = .1; sh.far = R * 6;
  sc.add(key, key.target, new THREE.HemisphereLight('#ffffff', '#3a3a3a', .35));
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(R * 8, R * 8), new THREE.ShadowMaterial({ opacity: opts.shadow ?? .32 }));
  fl.rotation.x = -Math.PI / 2; fl.position.set(ctr.x, bb.min.y + .01, ctr.z); fl.receiveShadow = true; sc.add(fl);
  return { sc, bb, size, ctr, R };
}
function aimCamera(cam, st, yaw, pitch, fill) {
  const sphere = st.bb.getBoundingSphere(new THREE.Sphere());
  const fov = cam.fov * Math.PI / 180, fit = Math.min(1, cam.aspect);
  const dist = sphere.radius / Math.sin(Math.atan(Math.tan(fov / 2) * fit)) * fill;
  const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  cam.position.copy(sphere.center).addScaledVector(dir, dist); cam.near = dist / 50; cam.far = dist * 10; cam.lookAt(sphere.center); cam.updateProjectionMatrix();
  return sphere.center;
}

// ---------- миниатюры ----------
// Кэш миниатюр: не больше THUMB_MAX картинок (blob-ссылки), старые освобождаются — память не растёт при длинных списках
const THUMB = new Map(), SZ = 480, THUMB_MAX = 240;
let queue = Promise.resolve();
function touch(key) { const v = THUMB.get(key); THUMB.delete(key); THUMB.set(key, v); }
function evict() {
  while (THUMB.size > THUMB_MAX) { const [k, v] = THUMB.entries().next().value; THUMB.delete(k); v.then(u => u && u.startsWith('blob:') && setTimeout(() => URL.revokeObjectURL(u), 5000)); }
}
function thumb(p, code, alive) {
  const key = p.id + '|' + code;
  if (THUMB.has(key)) { touch(key); return THUMB.get(key); }
  const pr = queue = queue.then(async () => {
    if (alive && !alive()) { THUMB.delete(key); return null; }   // карточку уже прокрутили — не тратим время
    const r = renderer(); r.setSize(SZ, SZ, false);
    const obj = await buildModel(p, code), st = stage(obj);
    const cam = new THREE.PerspectiveCamera(26, 1, .1, 1000); aimCamera(cam, st, -.5, .2, 1.02);
    r.setClearColor(0, 0); r.render(st.sc, cam);
    const url = await new Promise(res => r.domElement.toBlob(b => res(b ? URL.createObjectURL(b) : r.domElement.toDataURL('image/png')), 'image/png'));
    obj.traverse(o => o.geometry && o.geometry.dispose());
    await new Promise(res => setTimeout(res, 0));
    return url;
  }).catch(e => { console.warn(e); return null; });
  THUMB.set(key, pr); evict(); return pr;
}
const IO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { IO.unobserve(e.target); fill(e.target); } }), { rootMargin: '300px' }) : null;
async function fill(el) {
  const p = typeof byId === 'function' && byId(el.dataset.r3); if (!p) return;
  const url = await thumb(p, el.dataset.c, () => el.isConnected);
  if (!url || !el.isConnected) return;
  const img = new Image(); img.alt = ''; img.decoding = 'async'; img.src = url; img.className = 'r3img';
  el.innerHTML = ''; el.appendChild(img); el.classList.add('done');
}
function hydrate(root = document) {
  root.querySelectorAll('.r3:not(.done):not(.obs)').forEach(el => { el.classList.add('obs'); const key = el.dataset.r3 + '|' + el.dataset.c;
    if (THUMB.has(key)) fill(el); else if (IO) IO.observe(el); else fill(el); });
}

// ---------- размерные линии в 3D: ширина, высота, глубина ----------
function label(text, R) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), fs = 64;
  x.font = `400 ${fs}px Jost, Inter, sans-serif`; const w = Math.ceil(x.measureText(text).width) + 40;
  c.width = w; c.height = fs + 30; x.font = `400 ${fs}px Jost, Inter, sans-serif`;
  x.fillStyle = 'rgba(12,12,13,.78)'; x.beginPath(); x.roundRect ? x.roundRect(0, 0, w, c.height, 12) : x.rect(0, 0, w, c.height); x.fill();
  x.fillStyle = '#e7c996'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(text, w / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  const k = R * .065; sp.scale.set(k * w / c.height, k, 1); sp.renderOrder = 10; return sp;
}
// sz — {width,height,depth} для подписей; Rref — общий масштаб подписей (для комплекта)
function dimLines(sz, obj, Rref) {
  if (obj.userData.isSet) { const all = new THREE.Group(), bbs = new THREE.Box3().setFromObject(obj).getSize(V()), R0 = Math.max(bbs.x, bbs.y, bbs.z) * .6;
    obj.updateMatrixWorld(true); obj.children.forEach(o => { const pt = o.userData.part; all.add(dimLines(pt.id === 'main' ? sz : { width: pt.w, height: pt.h, depth: pt.d }, o, R0)); }); return all; }
  obj.updateMatrixWorld(true);
  const g = new THREE.Group(), bb = new THREE.Box3().setFromObject(obj), s = bb.getSize(V()), R = Rref || Math.max(s.x, s.y, s.z);
  const off = R * .07, tick = R * .025, m = new THREE.LineBasicMaterial({ color: '#c9a26b', depthTest: false, transparent: true });
  const seg = (a, b) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), m); l.renderOrder = 9; g.add(l); };
  const dim = (a, b, n, text) => {            // a→b — размер, n — направление выноса засечек
    seg(a, b); seg(a.clone().addScaledVector(n, -tick), a.clone().addScaledVector(n, tick)); seg(b.clone().addScaledVector(n, -tick), b.clone().addScaledVector(n, tick));
    const sp = label(text, R); sp.position.copy(a).add(b).multiplyScalar(.5).addScaledVector(n, R * .06); g.add(sp);
  };
  const v = x => (+x ? String(x).replace('.', ',') + ' см' : '');
  const { min, max } = bb, sp = sz;
  if (v(sp.width)) dim(V(min.x, min.y + .2, max.z + off), V(max.x, min.y + .2, max.z + off), V(0, 0, 1), v(sp.width));
  // высота и глубина — на боковой стороне, которую видно с исходного ракурса камеры (слева)
  if (v(sp.height)) dim(V(min.x - off, min.y, max.z), V(min.x - off, max.y, max.z), V(-1, 0, 0), v(sp.height));
  if (v(sp.depth)) dim(V(min.x - off, min.y + .2, max.z), V(min.x - off, min.y + .2, min.z), V(-1, 0, 0), v(sp.depth));
  return g;
}

// ---------- интерактивный 3D-осмотр ----------
let LIVE = null, TOKEN = 0;
async function viewer(el, p, code, opts = {}) {
  const my = ++TOKEN;
  if (LIVE) LIVE.dispose();
  if (!ENV) renderer();
  const part = opts.part; let obj = await buildModel(p, code, part);
  const sz = !part || part.id === 'main' || part.id === 'all' ? p.specs : { width: part.w, height: part.h, depth: part.d };
  if (my !== TOKEN || !el.isConnected) return null;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture;
  el.innerHTML = ''; el.appendChild(r.domElement); r.domElement.className = 'r3view';
  const st = stage(obj, { shadow: .38 }); st.sc.environment = env;
  let dims = null; if (opts.dims) { dims = dimLines(sz, obj); st.sc.add(dims); }
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 5000);
  const ctl = new OrbitControls(cam, r.domElement);
  ctl.enableDamping = true; ctl.dampingFactor = .08; ctl.enablePan = false; ctl.autoRotate = !opts.dims; ctl.autoRotateSpeed = 1.6;
  ctl.minPolarAngle = .1; ctl.maxPolarAngle = Math.PI / 2 - .02;
  const size = () => { const w = el.clientWidth || 360, h = el.clientHeight || 360; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const aim = (yaw, pitch) => { size(); const c = aimCamera(cam, st, yaw, pitch, 1.08); ctl.target.copy(c); ctl.minDistance = st.R * .6; ctl.maxDistance = st.R * 4; ctl.update(); };
  if (opts.dims) { const sp = st.bb.getBoundingSphere(new THREE.Sphere()); st.bb.expandByScalar(sp.radius * .12); }
  aim(opts.dims ? -.62 : -.5, opts.dims ? .3 : .22);
  ctl.addEventListener('start', () => { ctl.autoRotate = false; });
  let run = true; const loop = () => { if (!run) return; ctl.update(); r.render(st.sc, cam); requestAnimationFrame(loop); }; loop();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(size) : null; ro && ro.observe(el);
  LIVE = {
    pid: p.id, color: code, dims: !!opts.dims, part: part ? part.id : 'main',
    async setColor(c2) { LIVE.color = c2; const o2 = await buildModel(p, c2, part); if (!run) return; st.sc.remove(obj); obj = o2; st.sc.add(obj); },
    setDims(on) { if (dims) { st.sc.remove(dims); dims = null; } if (on) { dims = dimLines(sz, obj); st.sc.add(dims); } LIVE.dims = !!on; },
    reset() { ctl.autoRotate = true; aim(-.5, .22); },
    view(name) { ctl.autoRotate = false; const yaw = { front: 0, side: -Math.PI / 2, top: 0 }[name] ?? -.5; aim(yaw, name === 'top' ? 1.45 : .1); },
    dispose() { run = false; ro && ro.disconnect(); ctl.dispose(); r.dispose(); r.forceContextLoss && r.forceContextLoss(); env.dispose(); if (r.domElement.parentNode) r.domElement.remove(); if (LIVE && LIVE.r === r) LIVE = null; },
    r,
  };
  return LIVE;
}

// ---------- модели рядом в одном масштабе ----------
async function scaleScene(items) {
  const g = new THREE.Group(), pos = [];
  let x = 0; const objs = [];
  for (const p of items) { const o = await buildModel(p, (p.specs.colors || [])[0] || 's'); const bb = new THREE.Box3().setFromObject(o), s = bb.getSize(V()); objs.push([o, bb, s]); }
  const gap = Math.max(...objs.map(([, , s]) => s.x)) * .28;
  objs.forEach(([o, bb, s]) => { o.position.x = x - bb.min.x; o.position.z = -(bb.min.z + bb.max.z) / 2; g.add(o); pos.push([x + s.x / 2, s]); x += s.x + gap; });
  g.position.x = -(x - gap) / 2;
  const st = stage(g, { shadow: .3 }), r = renderer();
  const W = 1200, aspect = 2.1, H = Math.round(W / aspect); r.setSize(W, H, false);
  const tw = st.size.x * 1.12, th = st.size.y * 1.25, hw = Math.max(tw, th * aspect) / 2, hh = hw / aspect;
  const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, .1, 5000), yaw = -.32, pitch = .16;
  const c = st.bb.getCenter(V()); c.y = st.size.y * .5;
  cam.position.copy(c).add(V(Math.sin(yaw) * 900, Math.sin(pitch) * 900, Math.cos(yaw) * 900)); cam.lookAt(c); cam.updateProjectionMatrix();
  r.setClearColor(0, 0); r.render(st.sc, cam);
  const labels = pos.map(([cx]) => { const v = V(cx + g.position.x, 0, 0).project(cam); return (v.x + 1) / 2; });
  const url = r.domElement.toDataURL('image/png');
  return { url, labels, ratio: aspect };
}

window.R3 = { hydrate, viewer, scaleScene, thumb, ready: true, live: () => LIVE, stop() { TOKEN++; LIVE && LIVE.dispose(); LIVE = null; } };
window.dispatchEvent(new Event('r3ready'));

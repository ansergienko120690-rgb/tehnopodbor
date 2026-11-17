// ===== ТехноПодбор: модель данных =====
// Каталог хранится в src/data/catalog.json (формат описан в его поле "note").
// При сборке он встраивается в страницу как <script type="application/json" id="tp-catalog">,
// поэтому приложение запускается сразу, без сети. Свежие данные подтягивает api.js (если доступна сеть).
// Цены поверх каталога — src/data/prices.json (обновляет tools/update_prices.mjs).

const readInline = id => { try { return JSON.parse(document.getElementById(id).textContent); } catch (e) { console.error('Нет встроенных данных', id, e); return null; } };
const CATALOG = readInline('tp-catalog');
const ENERGY = CATALOG.energy;
const COLORS = CATALOG.colors;
const GROUPS = CATALOG.groups;
const WIZARD = CATALOG.wizard;
const CATEGORIES = CATALOG.categories;
const COMMON_SPECS = CATALOG.commonSpecs;
const PRODUCTS = [];
const DATA_ERRORS = [];

// Разбор компактного формата: строки характеристик → объекты, строки товаров → PRODUCTS
function parseCatalog(categories) {
  const products = [], errors = [];
  categories.forEach(c => {
    if (!c.specsRaw) c.specsRaw = c.specs;            // исходный вид сохраняем — для повторного разбора
    let grp = 'Основные';
    c.specs = c.specsRaw.concat(COMMON_SPECS).reduce((acc, line) => {
      if (line[0] === '#') { grp = line.slice(1); return acc; }
      const [k, l, u = '', t = 'n', b = '-', f = ''] = line.split('|');
      const s = { k, l, u, t, b: b === '-' ? null : b, f: !!f, g: grp };
      if (c.dim && ['width', 'height', 'depth', 'weight'].includes(k)) s.l += ' (' + c.dim + ')';
      if (c.light && k === 'weight') s.b = 'l';
      acc.push(s); return acc;
    }, []);
    c.items.forEach((row, i) => {
      // Реальная модель: в конце строки — объект-паспорт { id, shop, url, reviews, at, note }
      const meta = row.length && row[row.length - 1] && typeof row[row.length - 1] === 'object' && !Array.isArray(row[row.length - 1]) ? row[row.length - 1] : null;
      const r = meta ? row.slice(0, -1) : row;
      if (r.length !== 4 + c.specs.length) errors.push(`${c.id} / ${r[0]} ${r[1]}: ожидалось ${4 + c.specs.length}, есть ${r.length}`);
      const specs = {};
      c.specs.forEach((s, j) => { let v = r[4 + j]; if (s.t === 'c' && typeof v === 'string') v = v.split(''); specs[s.k] = v; });
      products.push({ id: (meta && meta.id) || c.id + '-' + i, cat: c.id, brand: r[0], model: r[1], price: r[2], basePrice: r[2], rating: r[3], specs,
        real: !!meta, source: meta, demo: !meta });
    });
  });
  // Габариты для 3D: у товаров витрины (фиды) их обычно нет — берём типичный размер категории (c.box, иначе медиана),
  // в характеристиках они остаются пустыми.
  const med = a => { a = a.filter(v => +v > 0).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  categories.forEach(c => {
    const mine = products.filter(p => p.cat === c.id);
    const own = mine.filter(p => !(p.source && p.source.src === 'feed'));
    const b = c.box || {}, box = { w: b.w || med(own.map(p => p.specs.width)), h: b.h || med(own.map(p => p.specs.height)), d: b.d || med(own.map(p => p.specs.depth)) };
    mine.forEach(p => {
      const k = p.source && p.source.pkg;   // ≈ размер по упаковке (со страницы магазина), иначе типичный для категории
      p.box = k && k.w && k.h ? { w: k.w, h: k.h, d: k.d || box.d, approx: 'pkg' } : box;
      if (p.source && p.source.src === 'feed') p.feed = true;
    });
  });
  return { products, errors };
}
// Категории без товаров не показываем: появятся сами, когда товары придут из магазинов
function hideEmpty(categories, products) {
  for (let i = categories.length - 1; i >= 0; i--) if (!products.some(p => p.cat === categories[i].id)) categories.splice(i, 1);
}
(function init() {
  const { products, errors } = parseCatalog(CATEGORIES);
  PRODUCTS.push(...products); DATA_ERRORS.push(...errors);
  hideEmpty(CATEGORIES, PRODUCTS);
  if (DATA_ERRORS.length) console.error('Ошибки данных:', DATA_ERRORS);
})();

// ---------- Цены ----------
// prices.json: { updated, sources: [...], items: { "<id товара>": { price, shop, url, at } } }
const PRICES = { updated: null, sources: [], items: {} };
function applyPrices(p) {
  if (!p || !p.items) return 0;
  let n = 0;
  PRICES.updated = p.updated || null; PRICES.sources = p.sources || []; PRICES.items = p.items;
  PRODUCTS.forEach(x => {
    if (x.custom) return;
    const it = p.items[x.id];
    if (it && +it.price > 0) { x.price = +it.price; x.offer = it; x.demo = false; n++; }
    else { x.price = x.basePrice; x.offer = null; x.demo = !x.real; }
  });
  return n;
}
applyPrices(readInline('tp-prices'));

// Сборка ТехноПодбора из исходников: node tools/build.mjs
//   src/index.html        шаблон страницы (метки <!-- @styles --> и <!-- @scripts -->)
//   src/styles.css        все стили
//   src/data/*.json       каталог и цены (встраиваются в страницу и копируются в dist/data для API)
//   src/js/*.js           модули, порядок — ниже в ORDER
// Результат: dist/index.html (один самодостаточный файл: для claude.ai и GitHub Pages) и dist/data/*.json.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');
const ORDER = ['js/icons.js', 'js/data.js', 'js/api.js', 'js/app.js', 'js/illo.js', 'js/metrics.js'];

// 1. Проверка данных до сборки
const catalog = JSON.parse(rd('src/data/catalog.json'));
const prices = fs.existsSync(path.join(root, 'src/data/prices.json')) ? JSON.parse(rd('src/data/prices.json')) : { updated: null, sources: [], items: {} };
// Витрина из фидов магазинов (tools/import_feeds.mjs) — дописывается в конец категорий
const FEED = path.join(root, 'src/data/feed_items.json');
const feed = fs.existsSync(FEED) ? JSON.parse(fs.readFileSync(FEED, 'utf8')) : null;
let feedN = 0;
if (feed && feed.cats) catalog.categories.forEach(c => { const rows = feed.cats[c.id] || []; if (rows.length) { c.items = c.items.concat(rows); c.feed = rows.length; feedN += rows.length; } });
if (feed) catalog.feed = { updated: feed.updated, sources: feed.sources, count: feedN };
const errors = [];
const ids = new Set();
catalog.categories.forEach(c => {
  const n = c.specs.filter(s => s[0] !== '#').length + catalog.commonSpecs.filter(s => s[0] !== '#').length;
  c.items.forEach((row, i) => {
    const meta = row[row.length - 1] && typeof row[row.length - 1] === 'object' ? row[row.length - 1] : null;
    const r = meta ? row.slice(0, -1) : row, id = (meta && meta.id) || c.id + '-' + i;
    if (ids.has(id)) errors.push(`повтор ID ${id}`);
    ids.add(id);
    if (r.length !== 4 + n) errors.push(`${id} ${r[0]} ${r[1]}: полей ${r.length}, нужно ${4 + n}`);
    if (meta && !/^https:\/\//.test(meta.url || '')) errors.push(`${id}: у реальной модели нет ссылки на источник`);
  });
});
Object.keys(prices.items || {}).forEach(id => { if (!ids.has(id)) errors.push(`prices.json: нет товара ${id}`); });
if (errors.length) { console.error('Ошибки данных:\n' + errors.join('\n')); process.exit(1); }

// 2. Проверка синтаксиса модулей
for (const f of ORDER) new vm.Script(rd('src/' + f), { filename: f });

// 3. Сборка
// three.js: на сайте и в приложении — своя копия (dist/vendor/three), без зависимости от зарубежного CDN;
// под file:// и в песочнице claude.ai своя копия недоступна — там остаётся CDN.
const CDN_MAP = JSON.parse(rd('src/js/importmap.json'));
const THREE_SRC = path.join(root, 'node_modules/three');
const VENDOR = ['build/three.module.min.js', 'examples/jsm/geometries/RoundedBoxGeometry.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/environments/RoomEnvironment.js'];
const haveThree = VENDOR.every(f => fs.existsSync(path.join(THREE_SRC, f)));
const LOCAL_MAP = { imports: { three: './vendor/three/build/three.module.min.js', 'three/addons/': './vendor/three/examples/jsm/' } };
const importmapTag = haveThree
  ? `<script>(function () { var local = /^https?:$/.test(location.protocol) && !/claude|anthropic/.test(location.hostname);
  document.write('<script type="importmap">' + JSON.stringify(local ? ${JSON.stringify(LOCAL_MAP)} : ${JSON.stringify(CDN_MAP)}) + '<\\/script>'); })();</script>`
  : `<script type="importmap">${JSON.stringify(CDN_MAP)}</script>`;
const safeJSON = o => JSON.stringify(o).replace(/</g, '\\u003c');
const scripts = [
  `<script type="application/json" id="tp-catalog">${safeJSON(catalog)}</script>`,
  `<script type="application/json" id="tp-prices">${safeJSON(prices)}</script>`,
  `<script type="application/json" id="tp-config">${safeJSON(fs.existsSync(path.join(root, 'src/data/config.json')) ? JSON.parse(rd('src/data/config.json')) : {})}</script>`,
  ...ORDER.map(f => `<script>// ===== src/${f} =====\n${rd('src/' + f)}</script>`),
  `<script>render(); API.sync();</script>`,
  importmapTag,
  `<script type="module">// ===== src/js/r3d.js =====\n${rd('src/js/r3d.js')}</script>`,
].join('\n');
let html = rd('src/index.html');
if (!html.includes('<!-- @styles -->') || !html.includes('<!-- @scripts -->')) throw new Error('в шаблоне нет меток @styles/@scripts');
html = html.replace('<!-- @styles -->', () => `<style>\n${rd('src/styles.css')}</style>`).replace('<!-- @scripts -->', () => scripts);

fs.mkdirSync(path.join(root, 'dist/data'), { recursive: true });
if (haveThree) for (const f of VENDOR) { const to = path.join(root, 'dist/vendor/three', f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(THREE_SRC, f), to); }
else console.warn('node_modules/three нет — three.js будет грузиться с CDN (npm i --no-save three@0.160.0)');
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
fs.writeFileSync(path.join(root, 'dist/data/catalog.json'), JSON.stringify(catalog));
fs.writeFileSync(path.join(root, 'dist/data/prices.json'), JSON.stringify(prices, null, 1) + '\n');
const items = catalog.categories.reduce((a, c) => a + c.items.length, 0);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} КБ · ${catalog.categories.length} категорий · ${items} товаров (из них витрина магазинов ${feedN}) · цен из магазинов: ${Object.keys(prices.items || {}).length}`);

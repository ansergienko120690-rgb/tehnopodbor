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
const ORDER = ['js/icons.js', 'js/data.js', 'js/api.js', 'js/app.js', 'js/illo.js'];

// 1. Проверка данных до сборки
const catalog = JSON.parse(rd('src/data/catalog.json'));
const prices = fs.existsSync(path.join(root, 'src/data/prices.json')) ? JSON.parse(rd('src/data/prices.json')) : { updated: null, sources: [], items: {} };
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
const safeJSON = o => JSON.stringify(o).replace(/</g, '\\u003c');
const scripts = [
  `<script type="application/json" id="tp-catalog">${safeJSON(catalog)}</script>`,
  `<script type="application/json" id="tp-prices">${safeJSON(prices)}</script>`,
  ...ORDER.map(f => `<script>// ===== src/${f} =====\n${rd('src/' + f)}</script>`),
  `<script>render(); API.sync();</script>`,
  `<script type="importmap">${rd('src/js/importmap.json').trim()}</script>`,
  `<script type="module">// ===== src/js/r3d.js =====\n${rd('src/js/r3d.js')}</script>`,
].join('\n');
let html = rd('src/index.html');
if (!html.includes('<!-- @styles -->') || !html.includes('<!-- @scripts -->')) throw new Error('в шаблоне нет меток @styles/@scripts');
html = html.replace('<!-- @styles -->', () => `<style>\n${rd('src/styles.css')}</style>`).replace('<!-- @scripts -->', () => scripts);

fs.mkdirSync(path.join(root, 'dist/data'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
fs.copyFileSync(path.join(root, 'src/data/catalog.json'), path.join(root, 'dist/data/catalog.json'));
fs.writeFileSync(path.join(root, 'dist/data/prices.json'), JSON.stringify(prices, null, 1) + '\n');
const items = catalog.categories.reduce((a, c) => a + c.items.length, 0);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} КБ · ${catalog.categories.length} категорий · ${items} товаров · цен из магазинов: ${Object.keys(prices.items || {}).length}`);

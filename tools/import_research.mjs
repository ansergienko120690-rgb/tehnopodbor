// Перенос собранных реальных моделей в каталог: node tools/import_research.mjs research/rows.jsonl
// Каждая строка rows.jsonl: { cat, row:[бренд, модель, цена, рейтинг, ...характеристики], url, reviews, note? }
// Категории, для которых есть строки, ЗАМЕНЯЮТСЯ целиком реальными моделями.
// Цены дополнительно пишутся в src/data/prices.csv (их обновляет tools/update_prices.mjs).
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || 'research/rows.jsonl';
const at = process.argv[3] || new Date().toISOString().slice(0, 10);
const shopOf = u => /citilink/.test(u) ? 'Ситилинк' : /mvideo/.test(u) ? 'М.Видео' : /dns-shop/.test(u) ? 'DNS' : new URL(u).hostname;
const slug = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '-').replace(/^-|-$/g, '');
const rows = fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const catPath = path.join(root, 'src/data/catalog.json');
const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
const byCat = {};
rows.forEach(r => (byCat[r.cat] = byCat[r.cat] || []).push(r));
const csv = ['id;price;shop;url'];
for (const [id, list] of Object.entries(byCat)) {
  const c = cat.categories.find(x => x.id === id);
  if (!c) throw new Error('нет категории ' + id);
  c.items = list.map(r => {
    const meta = { id: `${id}-${slug(r.row[0] + ' ' + r.row[1])}`, shop: shopOf(r.url), url: r.url, reviews: r.reviews || 0, at };
    if (r.note) meta.note = r.note;
    csv.push([meta.id, r.row[2], meta.shop, r.url].join(';'));
    return [...r.row, meta];
  });
  c.real = true;
}
cat.version = (cat.version || 1) + 1;
cat.updated = new Date().toISOString();
// Запись в прежнем виде: всё с отступами, а каждый товар (и строки массивов) — одной строкой
const flat = [];
const tok = v => { flat.push(JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ').replace(/([\[{]) /g, '$1').replace(/ ([\]}])/g, '$1')); return `@@${flat.length - 1}@@`; };
const compact = JSON.parse(JSON.stringify(cat), function (k, v) { return Array.isArray(v) && !v.some(x => typeof x === 'string' && /^@@\d+@@$/.test(x)) && v.every(x => x === null || typeof x !== 'object' || (!Array.isArray(x))) && v.some(x => x === null || typeof x !== 'object') ? tok(v) : v; });
fs.writeFileSync(catPath, JSON.stringify(compact, null, 1).replace(/"@@(\d+)@@"/g, (_, i) => flat[i]) + '\n');
// prices.csv: заменить строки этих категорий, остальные сохранить
const csvPath = path.join(root, 'src/data/prices.csv');
const keep = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).slice(1).filter(l => l && !Object.keys(byCat).some(k => l.startsWith(k + '-'))) : [];
fs.writeFileSync(csvPath, [csv[0], ...keep, ...csv.slice(1)].join('\n') + '\n');
console.log(`Импортировано: ${rows.length} моделей в ${Object.keys(byCat).length} категориях; цен в prices.csv: ${csv.length - 1}`);

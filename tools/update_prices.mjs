// Посредник для живых цен: node tools/update_prices.mjs
// Запускается по расписанию в GitHub Actions (сервер не нужен). Собирает цены из источников,
// сопоставляет с товарами каталога и пишет src/data/prices.json — только если что-то изменилось.
//
// Источники (можно сочетать):
//   1. src/data/prices.csv — ручной прайс: id;price;shop;url   (id товара как в каталоге: fridge-0, tv-3 …)
//   2. YML/XML-фиды магазинов (формат Яндекс.Маркета, его дают партнёрские сети, например Admitad).
//      Адреса фидов — в переменной окружения PRICE_FEEDS (секрет репозитория), по одному в строке.
//      Товар фида сопоставляется с каталогом по «бренд + модель»; для нестандартных названий —
//      src/data/price_map.json: { "<id предложения в фиде или 'бренд модель'>": "<id товара>" }.
// При конфликте берётся самая низкая цена среди доступных предложений.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = f => path.join(root, 'src/data', f);
const catalog = JSON.parse(fs.readFileSync(P('catalog.json'), 'utf8'));
const old = fs.existsSync(P('prices.json')) ? JSON.parse(fs.readFileSync(P('prices.json'), 'utf8')) : { items: {} };
const map = fs.existsSync(P('price_map.json')) ? JSON.parse(fs.readFileSync(P('price_map.json'), 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
const index = new Map();
const idOf = (c, r, i) => { const m = r[r.length - 1]; return (m && typeof m === 'object' && m.id) || c.id + '-' + i; };
const byName = []; // для поиска по названию: бренд И модель должны встретиться в названии товара
catalog.categories.forEach(c => c.items.forEach((r, i) => { const id = idOf(c, r, i); index.set(norm(r[0] + r[1]), id); byName.push({ b: norm(r[0]), m: norm(r[1]), id }); }));
// Совпадение только по модели без бренда запрещено: «Pro», «Essential XL» встречаются у разных брендов.
const findByName = name => { const n = norm(name); const hits = byName.filter(x => x.m.length >= 4 && n.includes(x.b) && n.includes(x.m)); return hits.length === 1 ? hits[0].id : undefined; };
const ids = new Set(catalog.categories.flatMap(c => c.items.map((r, i) => idOf(c, r, i))));

const items = {}, sources = [], log = [];
function offer(id, o) {
  if (!id || !ids.has(id) || !(o.price > 0)) return false;
  if (!items[id] || o.price < items[id].price) items[id] = { price: Math.round(o.price), shop: o.shop || '', url: o.url || '', at: o.at || today };
  return true;
}

// 1. CSV
if (fs.existsSync(P('prices.csv'))) {
  const rows = fs.readFileSync(P('prices.csv'), 'utf8').split(/\r?\n/).slice(1).filter(l => l.trim() && !l.startsWith('#'));
  let n = 0;
  rows.forEach(l => { const [id, price, shop, url] = l.split(';').map(s => (s || '').trim()); if (offer(id, { price: +price.replace(/\s/g, '').replace(',', '.'), shop, url })) n++; else log.push('CSV: пропущено «' + l + '»'); });
  if (n) sources.push(`прайс CSV (${n})`);
}

// 2. YML-фиды
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim() : ''; };
const feeds = (process.env.PRICE_FEEDS || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
for (const url of feeds) {
  const host = (() => { try { return new URL(url).hostname; } catch { return 'фид'; } })();
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = await r.text();
    const shop = tag(tag(xml, 'shop'), 'name') || host;
    let n = 0, total = 0;
    for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
      total++;
      if (/available="false"/.test(m[1])) continue;
      const oid = (m[1].match(/id="([^"]+)"/) || [])[1], body = m[2];
      const vendor = tag(body, 'vendor'), model = tag(body, 'model'), name = tag(body, 'name');
      const id = map[oid] || map[`${vendor} ${model}`] || index.get(norm(vendor + model)) || findByName(`${vendor} ${name}`);
      if (offer(id, { price: +tag(body, 'price'), shop, url: tag(body, 'url') })) n++;
    }
    sources.push(`${shop} (${n} из ${total})`);
  } catch (e) { log.push(`Фид ${host}: ${e.message}`); }
}

// 3. Запись только при изменениях (иначе каждый запуск давал бы пустой коммит)
const strip = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k].price, o[k].shop, o[k].url]));
log.forEach(l => console.log('· ' + l));
if (!feeds.length && !fs.existsSync(P('prices.csv'))) console.log('Источников цен нет — prices.json не меняется.');
if (strip(items) === strip(old.items || {})) { console.log(`Цены без изменений (${Object.keys(items).length}).`); process.exit(0); }
fs.writeFileSync(P('prices.json'), JSON.stringify({ updated: new Date().toISOString(), sources, items }, null, 1) + '\n');
console.log(`prices.json обновлён: ${Object.keys(items).length} цен · ${sources.join(', ') || 'источники пусты'}`);

// Характеристики товаров витрины со страниц магазинов: node tools/fetch_specs.mjs
// Берёт ссылки на товары из src/data/feed_items.json (параметр ulp партнёрской ссылки),
// скачивает страницу и сохраняет таблицу «название → значение» в research/specs_cache.json.
// Каждую страницу читаем один раз (кэш), бережно: 3 потока, пауза между запросами, лимит за запуск.
// Сопоставление с нашими полями — в tools/import_feeds.mjs (можно улучшать без повторного скачивания).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FEED = path.join(root, 'src/data/feed_items.json');
const CACHE = path.join(root, 'research/specs_cache.json');
const LIMIT = +(process.env.SPECS_LIMIT || 1800), THREADS = 3, PAUSE = 400, REFRESH_DAYS = 90;
if (!fs.existsSync(FEED)) { console.log('Нет feed_items.json — нечего дополнять.'); process.exit(0); }
const feed = JSON.parse(fs.readFileSync(FEED, 'utf8'));
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);
const productUrl = u => { try { const x = new URL(u); return x.searchParams.get('ulp') || u; } catch { return null; } };

// Все страницы товаров витрины; сначала те, которых нет в кэше, затем устаревшие
const urls = [...new Set(Object.values(feed.cats).flat().map(r => productUrl(r[r.length - 1].url)).filter(Boolean))];
const old = d => (Date.now() - Date.parse(d || 0)) / 864e5 > REFRESH_DAYS;
const todo = urls.filter(u => !cache[u]).concat(urls.filter(u => cache[u] && old(cache[u].at))).slice(0, LIMIT);

const clean = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
function pairs(html) {
  const out = {};
  const put = (k, v) => { k = clean(k).replace(/[:：]\s*$/, ''); v = clean(v); if (k && v && k.length <= 80 && v.length <= 120 && !(k in out)) out[k] = v; };
  // таблицы <tr><td|th>название</td><td>значение</td></tr>
  for (const m of html.matchAll(/<tr\b[^>]*>\s*<t[dh]\b[^>]*>([\s\S]{1,300}?)<\/t[dh]>\s*<td\b[^>]*>([\s\S]{1,400}?)<\/td>\s*<\/tr>/gi)) put(m[1], m[2]);
  // списки <dt>…</dt><dd>…</dd>
  for (const m of html.matchAll(/<dt\b[^>]*>([\s\S]{1,300}?)<\/dt>\s*<dd\b[^>]*>([\s\S]{1,400}?)<\/dd>/gi)) put(m[1], m[2]);
  // xcom: <li class="card-tabs-props-list-item"><span>название</span><span>значение</span></li>
  for (const m of html.matchAll(/<li\b[^>]*props-list-item[^>]*>([\s\S]{1,800}?)<\/li>/gi)) {
    const parts = [...m[1].matchAll(/<(span|div|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(x => x[2]).filter(x => clean(x));
    if (parts.length >= 2) put(parts[0], parts[parts.length - 1]);
  }
  return out;
}
async function get(u) {
  const r = await fetch(u, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; TehnoPodbor/1.0; +https://ansergienko120690-rgb.github.io/tehnopodbor/)', 'accept-language': 'ru-RU,ru;q=0.9' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const head = buf.subarray(0, 3000).toString('latin1');
  const cs = ((r.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  return new TextDecoder(/1251/.test(cs) ? 'windows-1251' : 'utf-8').decode(buf);
}

let ok = 0, fail = 0, i = 0;
const errs = {};
async function worker() {
  while (i < todo.length) {
    const u = todo[i++];
    try { const p = pairs(await get(u)); cache[u] = { at: today, n: Object.keys(p).length, p }; ok++; }
    catch (e) { fail++; errs[e.message] = (errs[e.message] || 0) + 1; if (!cache[u]) cache[u] = { at: today, n: 0, p: {}, err: e.message }; }
    await new Promise(r => setTimeout(r, PAUSE));
  }
}
await Promise.all(Array.from({ length: THREADS }, worker));
fs.mkdirSync(path.dirname(CACHE), { recursive: true });
// сохраняем компактно: одна строка на товар
const keys = Object.keys(cache).sort();
fs.writeFileSync(CACHE, '{\n' + keys.map(k => JSON.stringify(k) + ':' + JSON.stringify(cache[k])).join(',\n') + '\n}\n');
const filled = keys.filter(k => cache[k].n > 3).length;
console.log(`Страницы товаров: скачано ${ok}, ошибок ${fail}${fail ? ' (' + Object.entries(errs).map(([k, n]) => k + ' ×' + n).join(', ') + ')' : ''} · в кэше ${keys.length}, с характеристиками ${filled} из ${urls.length} товаров витрины`);

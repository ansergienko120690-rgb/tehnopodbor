// Разведка фидов: что лежит у магазинов (рубрики, число товаров, характеристики, примеры).
// Запуск в CI (там есть секрет PRICE_FEEDS). Пишет dist/feed_survey.json — без ключей доступа.
// Дополнительные фиды той же учётки Admitad: tools/feeds.json → { "extra_feed_ids": ["26447", …] }
//   (ссылка строится из первой ссылки секрета заменой feed_id, ключ в файлы не попадает).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const secret = (process.env.PRICE_FEEDS || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
const cfgPath = path.join(root, 'tools/feeds.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
const urls = [...secret];
const tpl = secret.find(u => /feed_id=\d+/.test(u));
for (const id of cfg.extra_feed_ids || []) if (tpl && !urls.some(u => u.includes('feed_id=' + id + '&') || u.endsWith('feed_id=' + id))) urls.push(tpl.replace(/feed_id=\d+/, 'feed_id=' + id));

const un = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? un(m[1]) : ''; };
const out = { at: new Date().toISOString(), feeds: [] };

for (const url of urls) {
  const feedId = (url.match(/feed_id=(\d+)/) || [])[1] || '?';
  const rec = { feed_id: feedId };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = await r.text();
    rec.bytes = xml.length;
    rec.shop = tag(tag(xml, 'shop'), 'name');
    const cats = {};
    for (const m of xml.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>/g)) {
      const id = (m[1].match(/\bid="([^"]+)"/) || [])[1], parent = (m[1].match(/parentId="([^"]+)"/) || [])[1];
      cats[id] = { name: un(m[2]), parent };
    }
    const pathOf = id => { const p = []; let c = cats[id], g = 0; while (c && g++ < 10) { p.unshift(c.name); c = cats[c.parent]; } return p.join(' / ') || ('#' + id); };
    const by = {};
    let total = 0;
    for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
      total++;
      const b = m[2], cid = tag(b, 'categoryId'), p = pathOf(cid);
      const e = by[p] || (by[p] = { n: 0, avail: 0, params: {}, vendors: {}, samples: [] });
      e.n++; if (!/available="false"/.test(m[1])) e.avail++;
      const v = tag(b, 'vendor'); if (v) e.vendors[v] = (e.vendors[v] || 0) + 1;
      const params = {};
      for (const pm of b.matchAll(/<param\b[^>]*name="([^"]+)"([^>]*)>([\s\S]*?)<\/param>/g)) {
        const unit = (pm[2].match(/unit="([^"]+)"/) || [])[1];
        const k = un(pm[1]) + (unit ? ` [${unit}]` : '');
        e.params[k] = (e.params[k] || 0) + 1; params[k] = un(pm[3]).slice(0, 60);
      }
      if (e.samples.length < 3) e.samples.push({ name: tag(b, 'name').slice(0, 120), vendor: v, model: tag(b, 'model'), price: +tag(b, 'price'), oldprice: +tag(b, 'oldprice') || undefined, picture: !!tag(b, 'picture'), params });
    }
    rec.total = total;
    rec.categories = Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([p, e]) => ({
      path: p, n: e.n, avail: e.avail,
      vendors: Object.entries(e.vendors).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}:${n}`),
      params: Object.entries(e.params).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${k}:${n}`),
      samples: e.samples,
    }));
  } catch (e) { rec.error = e.message; }
  out.feeds.push(rec);
  console.log(`фид ${feedId}: ${rec.shop || ''} ${rec.total ?? ''} товаров, ${rec.categories?.length ?? 0} рубрик ${rec.error || ''}`);
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/feed_survey.json'), JSON.stringify(out));

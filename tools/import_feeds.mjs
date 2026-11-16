// Импорт ассортимента магазинов из фидов в «витрину» каталога: node tools/import_feeds.mjs
// Запускается в CI (секрет PRICE_FEEDS + tools/feeds.json → extra_feed_ids), пишет src/data/feed_items.json.
// Фиды Admitad почти не содержат характеристик: берём бренд, модель, цену, фото, ссылку, рубрику,
// а характеристики — только те, что однозначно читаются из названия и краткого описания.
// Чего нет — остаётся пустым (в карточке «—»), рейтинг не выдумываем.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = f => path.join(root, 'src/data', f);
const catalog = JSON.parse(fs.readFileSync(P('catalog.json'), 'utf8'));
const cfg = fs.existsSync(path.join(root, 'tools/feeds.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'tools/feeds.json'), 'utf8')) : {};
const secret = (process.env.PRICE_FEEDS || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
const urls = [...secret];
const tpl = secret.find(u => /feed_id=\d+/.test(u));
for (const id of cfg.extra_feed_ids || []) if (tpl && !urls.some(u => new RegExp('feed_id=' + id + '(&|$)').test(u))) urls.push(tpl.replace(/feed_id=\d+/, 'feed_id=' + id));
const today = new Date().toISOString().slice(0, 10);

// ---------- Рубрики магазинов → наши категории ----------
// p — регулярка по пути рубрики (последние звенья), n — по названию товара (необязательно), set — значения характеристик.
const RULES = [
  { cat: 'dryer', p: /Сушильные машины$/ },
  { cat: 'washer', p: /стиральные машины/i, set: n => ({ type: /вертикал/i.test(n) ? 'Вертикальная' : 'Фронтальная', dryer: /с сушкой/i.test(n) ? 1 : 0 }) },
  { cat: 'fridge', p: /холодильники$/i, set: n => ({ type: /side.?by.?side/i.test(n) ? 'Side-by-Side' : 'Двухкамерный', nofrost: /no ?frost/i.test(n) ? 1 : null, inverter: /инверт|inverter/i.test(n) ? 1 : null }) },
  { cat: 'dishwasher', p: /посудомоечн/i, set: (n, p) => ({ builtin: /встраиваем/i.test(p + ' ' + n) ? 1 : 0 }) },
  { cat: 'hob', p: /Варочные панели|газовые панели/i, set: (n, p) => ({ type: /газ/i.test(p + n) ? 'Газовая' : /индукц/i.test(n) ? 'Индукционная' : 'Электрическая' }) },
  { cat: 'oven', p: /Духовые шкафы/ },
  { cat: 'hood', p: /вытяжки$|Врезные блоки$/i, set: (n, p) => ({ type: /Врезн|встраив/i.test(p + n) ? 'Встраиваемая' : /наклон/i.test(n) ? 'Наклонная' : /остров/i.test(n) ? 'Островная' : 'Купольная' }) },
  { cat: 'microwave', p: /Микроволновые печи$/ },
  { cat: 'multicooker', p: /(^|\/ )Мультиварки$/ },
  { cat: 'kettle', p: /(^|\/ )Чайники$|Чайники и термосы$|Чайники \/ \d+ Вт$/, n: /чайник/i, set: n => ({ body: /стекл/i.test(n) ? 'Стекло' : /металл|нерж/i.test(n) ? 'Металл' : null }) },
  { cat: 'coffee', p: /Кофемашины$|Кофеварки$|Капсульные кофеварки$|Рожковые кофеварки$/, set: (n, p) => ({ type: /Капсул/i.test(p + n) ? 'Капсульная' : /Рожков/i.test(p + n) ? 'Рожковая' : /Кофемашин/i.test(p) ? 'Автоматическая' : 'Капельная' }) },
  { cat: 'blender', p: /Погружные блендеры$|Настольные блендеры$/, set: (n, p) => ({ type: /Погружн/.test(p) ? 'Погружной' : 'Стационарный' }) },
  { cat: 'mixer', p: /(^|\/ )Миксеры$/, set: n => ({ type: /планетар/i.test(n) ? 'Планетарный' : 'Ручной' }) },
  { cat: 'meatgrinder', p: /(^|\/ )Мясорубки$/ },
  { cat: 'toaster', p: /(^|\/ )Тостеры$/ },
  { cat: 'airfryer', p: /Аэрогрили$/ },
  { cat: 'juicer', p: /Соковыжималки$/, set: n => ({ type: /шнек/i.test(n) ? 'Шнековая' : /цитрус/i.test(n) ? 'Цитрус-пресс' : 'Центробежная' }) },
  { cat: 'foodproc', p: /Кухонные машины$|Кухонные комбайны$/ },
  { cat: 'egrill', p: /Грили электрические$|(^|\/ )Гриль$/, set: n => ({ type: /контакт/i.test(n) ? 'Контактный' : null }) },
  { cat: 'waterfilter', p: /Системы очистки воды$/, set: n => ({ type: /осмос/i.test(n) ? 'Обратный осмос' : /кувшин/i.test(n) ? 'Кувшин' : 'Под мойку' }) },
  { cat: 'vacuum', p: /(^|\/ )Пылесосы$|Портативные пылесосы$|Роботы-пылесосы$|Циклонные пылесосы$|Пылесосы с пылесборником$|Умные роботы-пылесосы$/,
    set: (n, p) => { const robot = /робот/i.test(p + n); return { type: robot ? 'Робот' : /моющ/i.test(n) ? 'Моющий' : /Портатив|вертикал|беспровод/i.test(p + n) ? 'Вертикальный' : 'Контейнерный', station: robot ? (/станци|base|station|plus|ultra/i.test(n) ? 1 : null) : null, wet: /влажн|моющ|mop/i.test(n) ? 1 : null }; } },
  { cat: 'windowbot', p: /мойщики окон$/i },
  { cat: 'aircon', p: /Бытовые сплит-системы$|Мобильные кондиционеры$|Оконные кондиционеры$/, set: (n, p, m) => aircon(n, m) },
  { cat: 'heater', p: /Радиаторы$|Конвекторы$|Инфракрасные обогреватели$|Масляные обогреватели$|Тепловентиляторы$|Керамические обогреватели|Керамические обогреватели \/ (Напольные|Настольные)$/,
    set: (n, p) => ({ type: /Инфракрас/i.test(p) ? 'Инфракрасный' : /Конвектор/i.test(p) ? 'Конвектор' : /Масл|Радиатор/i.test(p) ? 'Масляный радиатор' : 'Тепловентилятор' }) },
  { cat: 'fan', p: /(^|\/ )Вентиляторы$/, n: /вентилятор/i, x: /канальн|вытяжн|осев|радиальн|промышлен|крышн|вентиляторн|модул|шкаф|стойк|19"|полк|серверн|для корпус|кулер/i, set: n => ({ type: /безлопаст/i.test(n) ? 'Безлопастной' : /колонн/i.test(n) ? 'Колонный' : /настольн/i.test(n) ? 'Настольный' : /напольн/i.test(n) ? 'Напольный' : null }) },
  { cat: 'humidifier', p: /(^|\/ )Увлажнители$|Увлажнители воздуха бытовые$/, set: n => ({ type: /ультразвук/i.test(n) ? 'Ультразвуковой' : /традиц|мойк|испарит/i.test(n) ? 'Традиционный' : null }) },
  { cat: 'purifier', p: /Воздухоочистители$/ },
  { cat: 'waterheater', p: /Водонагреватели (накопительные|проточные)/, set: (n, p) => ({ type: /проточн/i.test(p) ? 'Проточный' : 'Накопительный' }) },
  { cat: 'hairdryer', p: /(^|\/ )Фены$|Фены-расчески$/ },
  { cat: 'styler', p: /Стайлеры$|Выпрямители$|Для локонов$/, set: (n, p) => ({ type: /Выпрямит/i.test(p + n) ? 'Выпрямитель' : /локон|плойк/i.test(p + n) ? 'Плойка' : /фен-?щ[её]тк|фен-расч/i.test(n) ? 'Фен-щётка' : 'Мультистайлер' }) },
  { cat: 'shaver', p: /(^|\/ )Бритвы$/, set: n => ({ type: /ротор/i.test(n) ? 'Роторная' : /сеточн/i.test(n) ? 'Сеточная' : null }) },
  { cat: 'trimmer', p: /(^|\/ )Триммеры$|Машинки для стрижки$/, set: (n, p) => ({ purpose: /Машинки/.test(p) ? 'Машинка для стрижки' : /бород/i.test(n) ? 'Борода' : 'Универсальный' }) },
  { cat: 'toothbrush', p: /зубные щетки$|Зубные щетки и ирригаторы$/i, n: /щ[её]тк/i, x: /ирригатор/i, set: n => ({ type: /звуков|sonic/i.test(n) ? 'Звуковая' : null }) },
  { cat: 'scales', p: /Весы напольные$|Умные весы$/, set: n => ({ type: /умн|smart/i.test(n) ? 'Умные' : 'Обычные' }) },
  { cat: 'tv', p: /Телевизоры и аксессуары \/ Телевизоры$|Умные устройства \/ Телевизоры$/, set: (n, p, m) => tv(n + ' ' + m) },
  { cat: 'iron', p: /(^|\/ )Утюги$|Парогенераторы$/ },
  { cat: 'steamer', p: /Отпариватели$/, set: n => ({ type: /ручн/i.test(n) ? 'Ручной' : /напольн|вертикал/i.test(n) ? 'Напольный' : null }) },
  { cat: 'speaker', p: /Умные колонки$/, set: n => ({ assistant: /алис|яндекс/i.test(n) ? 'Алиса' : /маруся|vk/i.test(n) ? 'Маруся' : /салют|sber/i.test(n) ? 'Салют' : null }) },
];
// Рубрики-«сборники» и не-товары: аксессуары, запчасти, комплектующие
const SKIP_PATH = /Аксессуар|Комплектующ|Запчаст|Расходн|Чаши для|Мульти-сплит|Полупромышлен/i;
const SKIP_NAME = /^(комплект|набор|станция|база)\s|пылесборник|антискалант|для мультиканальн|аксессуар|насадк|запчаст|сменн|чехол|кронштейн|крепление|пульт|мешк|кабель|картридж|комплект фильтров|фильтр для|набор щ[её]ток|щ[её]тки для|подставк|переходник|шланг/i;

// ---------- Характеристики из названия ----------
const num = s => +String(s).replace(/\s/g, '').replace(',', '.');
function aircon(n, m) {
  const o = { inverter: /инвертор|inverter|dc/i.test(n) ? 1 : 0, wifi: /wi-?fi/i.test(n) ? 1 : null };
  const b = (m + ' ' + n).match(/(?:^|[^\d])(07|09|12|18|24|30|36)(?=[A-Za-zА-Яа-я/\-_ ]|$)/);
  const KW = { '07': 2.1, '09': 2.6, '12': 3.5, '18': 5.3, '24': 7.0, '30': 8.8, '36': 10.5 };
  if (b && KW[b[1]]) { o.cool = KW[b[1]]; o.area = Math.round(KW[b[1]] * 10); }
  return o;
}
function tv(t) {
  const o = {};
  const d = t.match(/(\d{2,3})\s*(?:"|″|''|”|дюйм)/) || t.match(/\b(?:LED|OLED|QLED|QD-?Mini ?LED|Mini ?LED)\s*(\d{2,3})\b/i) || t.match(/^[A-Z]{0,3}(\d{2})[A-Z]/);
  if (d && +d[1] >= 19 && +d[1] <= 120) o.diag = +d[1];
  o.res = /8K/i.test(t) ? '8K' : /4K|UHD|3840/i.test(t) ? '4K' : /Full ?HD|FHD|1080/i.test(t) ? 'Full HD' : /\bHD\b|720/i.test(t) ? 'HD' : null;
  o.matrix = /OLED/i.test(t) && !/QLED/i.test(t) ? 'OLED' : /mini ?led/i.test(t) ? 'Mini-LED' : /QLED|QD/i.test(t) ? 'QLED' : /LED/i.test(t) ? 'LED' : null;
  const hz = t.match(/(\d{2,3})\s*(?:Hz|Гц)/i); if (hz) o.hz = +hz[1];
  o.os = /Google TV/i.test(t) ? 'Google TV' : /Android/i.test(t) ? 'Android TV' : /webOS/i.test(t) ? 'webOS' : /Tizen/i.test(t) ? 'Tizen' : /Салют/i.test(t) ? 'Салют ТВ' : /Яндекс|YaOS|Алис/i.test(t) ? 'Яндекс ТВ' : /VIDAA/i.test(t) ? 'VIDAA' : null;
  o.wifi = /Smart|Wi-?Fi|Google|Android|webOS|Tizen|Салют|Яндекс|VIDAA/i.test(t) ? 1 : null;
  return o;
}
// Общие числа с единицами → характеристика с такой же единицей в нашей категории
function byUnits(c, t) {
  const o = {};
  const E = '(?![а-яёa-z])', W = t.match(new RegExp('(\\d[\\d\\s]{1,5})\\s*Вт' + E, 'i')), KW = t.match(new RegExp('(\\d+(?:[.,]\\d+)?)\\s*кВт' + E, 'i'));
  const L = t.match(new RegExp('(\\d+(?:[.,]\\d+)?)\\s*л' + E, 'i')), ML = t.match(new RegExp('(\\d{2,4})\\s*мл' + E, 'i'));
  for (const s of c.specs) {
    if (s[0] === '#') continue;
    const [k, , u, ty] = s.split('|');
    if (ty !== 'n' || k in o) continue;
    if (u === 'Вт' && W && !('_w' in o)) { o[k] = num(W[1]); o._w = 1; }
    else if (u === 'Вт' && KW && !('_w' in o)) { o[k] = Math.round(num(KW[1]) * 1000); o._w = 1; }
    else if (u === 'кВт' && (KW || W) && !('_kw' in o)) { o[k] = KW ? num(KW[1]) : num(W[1]) / 1000; o._kw = 1; }
    else if (u === 'л' && L && !('_l' in o)) { o[k] = num(L[1]); o._l = 1; }
    else if (u === 'мл' && (ML || L) && !('_ml' in o)) { o[k] = ML ? num(ML[1]) : Math.round(num(L[1]) * 1000); o._ml = 1; }
  }
  for (const k of Object.keys(o)) if (k[0] === '_') delete o[k];
  return o;
}
function colorOf(t) {
  const c = [];
  if (/ч[её]рн|black|графит(?!ов)|темно-сер/i.test(t)) c.push(/графит/i.test(t) ? 'g' : 'b');
  if (/бел|white/i.test(t)) c.push('w');
  if (/нерж|inox|stainless|сталь/i.test(t)) c.push('x'); else if (/серебр|silver|сер(ый|ая|ое)/i.test(t)) c.push('s');
  if (/беж|кремов|ivory|молочн/i.test(t)) c.push('e');
  if (/красн|red\b/i.test(t)) c.push('r');
  if (/син|голуб|blue/i.test(t)) c.push('l');
  if (/зел[её]н|мятн|green/i.test(t)) c.push('n');
  if (/розов|pink/i.test(t)) c.push('p');
  if (/фиолет|лаванд|purple/i.test(t)) c.push('v');
  if (/медн|золот|бронз|copper|gold/i.test(t)) c.push('k');
  return [...new Set(c)].slice(0, 3).join('') || null;
}
// ---------- Бренд и модель ----------
const BRANDS = new Set(catalog.categories.flatMap(c => c.items.map(r => r[0])));
const nice = b => { b = (b || '').trim(); if (!b) return ''; if (b === b.toUpperCase() && b.length > 3 && /^[A-Z]/.test(b)) return b[0] + b.slice(1).toLowerCase(); return b; };
const SHOP_BRAND = [[/polaris/i, 'Polaris'], [/weissgauff/i, 'Weissgauff'], [/xiaomi/i, 'Xiaomi']];
function brandModel(name, vendor, model, alt, shop) {
  let brand = nice(vendor);
  const text = name + ' ' + (alt || '');
  if (!brand) { for (const b of BRANDS) if (new RegExp('(^|\\s)' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'i').test(text)) { brand = b; break; } }
  if (!brand) { const s = SHOP_BRAND.find(([re]) => re.test(shop)); if (s) brand = s[1]; }
  const first = w => ((w || '').trim().split(/\s+/)[0] || '').toLowerCase();
  const strip = (s, lead) => {
    s = (s || '').replace(/\s+/g, ' ').trim();
    const i = brand ? s.toLowerCase().indexOf(brand.toLowerCase()) : -1;
    if (i >= 0) s = s.slice(i + brand.length);
    else if (lead) s = s.replace(/^((?:[а-яё-]+|с|со|для|и)\s+)+/i, '');      // ведущие русские слова: «Робот-пылесос со станцией…»
    return s.replace(/^[\s,–-]+/, '').replace(/\s*,.*$/, '').trim();
  };
  // Ведущие русские слова убираем, только если это начало названия товара («Робот-пылесос…»), а не сама модель («Станция 3»)
  let m = model && model !== name ? strip(model, first(model) === first(name)) || model.trim() : strip(name, true);
  m = m.replace(/\s+(ч[её]рн|бел|сер|серебрист|красн|син|зел[её]н|беж|розов|золот|graphite|black|white|silver)[а-яё]*(\s.*)?$/i, '').trim();
  if ((!m || m.length < 2) && alt) m = strip(alt, true);
  m = m.replace(/\s*\((?:[^)]*)\)\s*$/, '');                               // «(синий)»
  m = m.replace(/\s+\d{7,}$/, '').slice(0, 48).trim();                     // хвост-артикул/штрихкод (номер модели вроде «0801» оставляем)
  return { brand: brand || '', model: m };
}
const normKey = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
const slug = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ---------- Разбор YML потоком (фид xcom ~200 МБ) ----------
const un = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&#039;/g, "'").trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? un(m[1]) : ''; };
async function* offersOf(url, info) {
  const r = await fetch(url, { signal: AbortSignal.timeout(600000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const dec = new TextDecoder(); let buf = '';
  const cats = info.cats;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    if (!info.shop) { const s = buf.match(/<shop>[\s\S]*?<name>([\s\S]*?)<\/name>/); if (s) info.shop = un(s[1]); }
    for (const m of buf.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>/g)) {
      const id = (m[1].match(/\bid="([^"]+)"/) || [])[1]; if (id && !cats[id]) cats[id] = { name: un(m[2]), parent: (m[1].match(/parentId="([^"]+)"/) || [])[1] };
    }
    const end = buf.lastIndexOf('</offer>');
    if (end < 0) { if (buf.length > 5e6 && !buf.includes('<offer')) buf = buf.slice(-2e5); continue; }
    const head = buf.slice(0, end + 8); buf = buf.slice(end + 8);
    for (const m of head.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) yield m;
  }
}

const hasSpec = (cat, k) => base[cat].specs.some(s => s.split('|')[0] === k);
const base = Object.fromEntries(catalog.categories.map(c => [c.id, c]));
const curated = new Set(catalog.categories.flatMap(c => c.items.map(r => normKey(r[0] + r[1]))));
const found = new Map(); const sources = [], log = [];
for (const url of urls) {
  const info = { cats: {}, shop: '' }; let total = 0, took = 0;
  try {
    const pathOf = id => { const p = []; let c = info.cats[id], g = 0; while (c && g++ < 10) { p.unshift(c.name); c = info.cats[c.parent]; } return p.join(' / '); };
    for await (const m of offersOf(url, info)) {
      total++;
      if (/available="false"/.test(m[1])) continue;
      const b = m[2], cpath = pathOf(tag(b, 'categoryId'));
      if (!cpath || SKIP_PATH.test(cpath.split(' / ').pop())) continue;   // только последнее звено: «Телевизоры и аксессуары / Телевизоры» — можно
      const name = tag(b, 'name'), rule = RULES.find(r => r.p.test(cpath) && (!r.n || r.n.test(name)) && !(r.x && r.x.test(name)));
      if (!rule || SKIP_NAME.test(name) || (rule.cat !== 'waterfilter' && /^фильтр/i.test(name))) continue;
      const price = +tag(b, 'price'); if (!(price > 0)) continue;
      const params = {}; for (const pm of b.matchAll(/<param\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/param>/g)) params[un(pm[1])] = un(pm[2]);
      const alt = params['Альтернативное название'] || '', mini = params.minidescription || '';
      const { brand, model } = brandModel(name, tag(b, 'vendor'), tag(b, 'model'), alt, info.shop);
      if (!brand || !model) continue;
      const key = rule.cat + ':' + normKey(brand + model);
      if (curated.has(normKey(brand + model))) continue;            // уже есть в каталоге с полными характеристиками
      const text = [name, alt, mini.replace(/(\d)([а-яё])/gi, '$1 $2')].join(' ');
      const offer = { shop: info.shop, price: Math.round(price), url: tag(b, 'url'), picture: tag(b, 'picture') };
      const prev = found.get(key);
      if (prev) { if (!prev.offers.some(o => o.url === offer.url)) prev.offers.push(offer); continue; }
      found.set(key, { cat: rule.cat, brand, model, name, specs: { ...byUnits(base[rule.cat], text), ...(hasSpec(rule.cat, 'wifi') && /wi-?fi|iq home|smart|умн/i.test(name) ? { wifi: 1 } : {}), ...(rule.set ? rule.set(text, cpath, tag(b, 'model')) : {}) }, colors: colorOf(name + ' ' + mini), offers: [offer] });
      took++;
    }
    sources.push(`${info.shop} (${took} новых из ${total})`);
  } catch (e) { log.push(`Фид ${(url.match(/feed_id=(\d+)/) || [])[1] || '?'}: ${e.message}`); }
}

// ---------- В строки каталога ----------
const cats = {};
const usedIds = new Set();
for (const it of found.values()) {
  const c = base[it.cat];
  const specKeys = c.specs.concat(catalog.commonSpecs).filter(s => s[0] !== '#').map(s => s.split('|')[0]);
  const vals = specKeys.map(k => k === 'colors' ? it.colors : (k in it.specs && it.specs[k] !== undefined ? it.specs[k] : null));
  it.offers.sort((a, b) => a.price - b.price);
  const best = it.offers[0];
  let id = 'f-' + it.cat + '-' + slug(it.brand + '-' + it.model); for (let i = 2; usedIds.has(id); i++) id = id.replace(/-\d+$/, '') + '-' + i;
  usedIds.add(id);
  const meta = { id, src: 'feed', shop: best.shop, url: best.url, at: today, picture: best.picture || undefined, title: it.name };
  if (it.offers.length > 1) meta.offers = it.offers.slice(0, 5).map(o => ({ shop: o.shop, price: o.price, url: o.url }));
  (cats[it.cat] = cats[it.cat] || []).push([it.brand, it.model, best.price, 0, ...vals, meta]);
}
// Страховка от аксессуаров, проскочивших по названию: цена ниже 10% медианы категории — не товар этой категории
let cheap = 0;
for (const k of Object.keys(cats)) { const pr = cats[k].map(r => r[2]).sort((a, b) => a - b), m = pr[pr.length >> 1]; const n0 = cats[k].length; cats[k] = cats[k].filter(r => r[2] >= m * 0.1); cheap += n0 - cats[k].length; }
if (cheap) log.push(`Отброшено как вероятные аксессуары (цена < 10% медианы категории): ${cheap}`);
for (const k of Object.keys(cats)) cats[k].sort((a, b) => a[0].localeCompare(b[0], 'ru') || a[2] - b[2]);
const n = Object.values(cats).reduce((a, r) => a + r.length, 0);
if (!urls.length) { console.log('Фидов нет — feed_items.json не меняется.'); process.exit(0); }
if (!n) { console.log('Из фидов ничего не взято — feed_items.json не меняется. ' + log.join('; ')); process.exit(0); }
const out = { updated: today, sources, count: n, cats };
const file = P('feed_items.json');
const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const strip = o => JSON.stringify(o && o.cats ? Object.fromEntries(Object.entries(o.cats).map(([k, rows]) => [k, rows.map(r => r.slice(0, -1).concat([{ ...r[r.length - 1], at: '' }]))])) : null);
if (old && strip(old) === strip(out)) console.log(`Витрина без изменений: ${n} товаров.`);
else { fs.writeFileSync(file, '{"updated":' + JSON.stringify(today) + ',"sources":' + JSON.stringify(sources) + ',"count":' + n + ',"cats":{\n' + Object.entries(cats).map(([k, rows]) => JSON.stringify(k) + ':[\n' + rows.map(r => ' ' + JSON.stringify(r)).join(',\n') + '\n]').join(',\n') + '\n}}\n'); console.log(`feed_items.json: ${n} товаров · ${Object.entries(cats).map(([k, r]) => k + ' ' + r.length).join(', ')} · ${sources.join(', ')}`); }
if (log.length) console.log(log.join('\n'));

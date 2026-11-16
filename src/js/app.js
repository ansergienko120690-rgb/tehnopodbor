// ===== ТехноПодбор v3 — логика приложения =====
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const num = v => String(v).replace('-', '−').replace('.', ',');
const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

const store = {
  get(k, d) { try { const v = localStorage.getItem('tp_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tp_' + k, JSON.stringify(v)); } catch {} },
};

const catById = id => CATEGORIES.find(c => c.id === id);
const S = {
  view: 'catalog',
  cat: catById(store.get('cat', 'fridge')) ? store.get('cat', 'fridge') : (catById('fridge') ? 'fridge' : CATEGORIES[0].id),
  theme: store.get('theme', 'dark'),
  q: '', sort: 'rating', maxPrice: null, brands: new Set(), colors: new Set(), sf: {},
  showFilters: false,
  compare: store.get('compare', []),
  favs: new Set(store.get('favs', [])),
  custom: store.get('custom', []),
  onlyDiff: false,
  detail: null,
  wiz: null,
};

const all = () => PRODUCTS.concat(S.custom);
const byId = id => all().find(p => p.id === id);
const inCat = cat => all().filter(p => p.cat === cat);
const topOf = cat => inCat(cat).slice().sort((a, b) => b.rating - a.rating)[0];  // для обложек — по рейтингу магазина, чтобы не прыгали
const save = () => { store.set('compare', S.compare); store.set('favs', [...S.favs]); store.set('custom', S.custom); store.set('cat', S.cat); store.set('theme', S.theme); };
S.compare = S.compare.filter(byId);

const swatch = code => COLORS[code] ? `<i class="sw" style="background:${COLORS[code][1]}" title="${COLORS[code][0]}"></i>` : '';
function fmt(spec, v) {
  if (empty(v)) return '<span class="na">—</span>';
  if (spec.t === 'b') return v ? '<span class="yes">Есть</span>' : '<span class="no">Нет</span>';
  if (spec.t === 'c') return `<span class="colors">${v.map(c => `<span>${swatch(c)}${COLORS[c] ? COLORS[c][0] : esc(c)}</span>`).join('')}</span>`;
  if (spec.t === 'n') return num(v) + (spec.u ? ' ' + spec.u : '');
  return esc(v);
}
const dims = p => !empty(p.specs.width) && !empty(p.specs.height) ? `${num(p.specs.width)}×${num(p.specs.height)}${empty(p.specs.depth) ? '' : '×' + num(p.specs.depth)} см` : '';

function norm(cat, spec, v) {
  if (empty(v) || !spec) return 0;
  if (spec.t === 'b') return v ? 1 : 0;
  if (spec.t === 'e') { const i = ENERGY.indexOf(v); return i < 0 ? 0 : 1 - i / (ENERGY.length - 1); }
  if (spec.t !== 'n') return 0;
  const vals = inCat(cat).map(p => p.specs[spec.k]).filter(x => typeof x === 'number');
  const mn = Math.min(...vals), mx = Math.max(...vals);
  if (mx === mn) return 1;
  const r = (v - mn) / (mx - mn);
  return spec.b === 'l' ? 1 - r : r;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  $('#theme').innerHTML = S.theme === 'dark' ? ICON.sun : ICON.moon;
  document.querySelector('meta[name=theme-color]').content = S.theme === 'dark' ? '#0c0c0d' : '#f2f1ed';
}

// ---------- Действия ----------
function toggleCompare(id) {
  const p = byId(id);
  if (S.compare.includes(id)) S.compare = S.compare.filter(x => x !== id);
  else {
    if (S.compare.length && byId(S.compare[0])?.cat !== p.cat) { S.compare = []; toast('Сравнение начато заново: другая категория'); }
    if (S.compare.length >= 4) { toast('Можно сравнить до 4 моделей'); return; }
    S.compare.push(id); toast('Добавлено в сравнение');
  }
  save(); render();
}
function toggleFav(id) { S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id); save(); render(); }
function setCat(id) { S.cat = id; S.brands.clear(); S.colors.clear(); S.sf = {}; S.maxPrice = null; S.q = ''; save(); }

// ---------- Карточка ----------
function keyLine(p) {
  const c = catById(p.cat);
  return c.specs.filter(s => s.g !== 'Габариты и цвет' && s.t !== 'e' && s.t !== 'b' && !empty(p.specs[s.k])).slice(0, 2)
    .map(s => s.t === 's' ? esc(p.specs[s.k]) : `${esc(s.l.toLowerCase())} ${fmt(s, p.specs[s.k])}`).join(' · ');
}
function card(p, extra = '', showCat = false) {
  const c = catById(p.cat), inC = S.compare.includes(p.id), fav = S.favs.has(p.id);
  return `<article class="card" data-open="${p.id}">
    <div class="stage">${illo(p)}
      <div class="ov l"><button class="ib ${inC ? 'on' : ''}" data-cmp="${p.id}" aria-label="Сравнить">${inC ? ICON.cmpOn : ICON.cmp}</button></div>
      <div class="ov r"><button class="ib fav ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${ICON.heart}</button></div>
    </div>
    <div class="info">
      <div class="brand">${showCat ? esc(c.name) + ' · ' : ''}${esc(p.brand)}${p.custom ? '<i class="tag">моя</i>' : ''}</div>
      <div class="model">${esc(p.model)}</div>
      <div class="key">${keyLine(p)}</div>
      ${extra}
      <div class="bot"><div><div class="price">${p.price ? rub(p.price) : '—'}</div>${ratingLine(p)}</div>
        <span class="dots">${(p.specs.colors || []).slice(0, 5).map(swatch).join('')}</span></div>
    </div>
  </article>`;
}

// ---------- Каталог ----------
function filtered() {
  const c = catById(S.cat), q = S.q.trim().toLowerCase();
  const list = inCat(S.cat).filter(p => {
    if (q && !(p.brand + ' ' + p.model).toLowerCase().includes(q)) return false;
    if (S.maxPrice && p.price > S.maxPrice) return false;
    if (S.brands.size && !S.brands.has(p.brand)) return false;
    if (S.colors.size && !(p.specs.colors || []).some(x => S.colors.has(x))) return false;
    for (const s of c.specs) {
      const f = S.sf[s.k]; if (!f) continue; const v = p.specs[s.k];
      if (s.t === 'n') {
        if (f.min !== undefined && f.min !== '' && !(v >= +f.min)) return false;
        if (f.max !== undefined && f.max !== '' && !(v <= +f.max)) return false;
      }
      if (s.t === 'b' && f.on && !v) return false;
      if (s.t === 's' && f.eq && v !== f.eq) return false;
    }
    return true;
  });
  const so = { rating: (a, b) => score(b).val - score(a).val || b.rating - a.rating || a.price - b.price, reviews: (a, b) => score(b).n - score(a).n || score(b).val - score(a).val, cheap: (a, b) => a.price - b.price, exp: (a, b) => b.price - a.price };
  return list.sort(so[S.sort]);
}

function viewCatalog() {
  const c = catById(S.cat), g = GROUPS.find(x => x.id === c.g), list = filtered(), items = inCat(S.cat);
  const brands = [...new Set(items.map(p => p.brand))].sort();
  const colors = Object.keys(COLORS).filter(k => items.some(p => (p.specs.colors || []).includes(k)));
  const prices = items.map(p => p.price).filter(Boolean);
  const step = Math.max(...prices) > 20000 ? 1000 : 100;
  const pMin = Math.floor(Math.min(...prices) / step) * step, pMax = Math.ceil(Math.max(...prices) / step) * step;
  const nf = Object.values(S.sf).filter(f => f && (f.on || f.eq || (f.min ?? '') !== '' || (f.max ?? '') !== '')).length + S.brands.size + S.colors.size + (S.maxPrice ? 1 : 0);
  let lastG = '';
  const sfHtml = c.specs.filter(s => s.f && s.t !== 'c').map(s => {
    const f = S.sf[s.k] || {};
    const head = s.g !== lastG ? `<div class="fgroup">${esc(lastG = s.g)}</div>` : '';
    if (s.t === 'n') return head + `<label class="fl">${esc(s.l)}${s.u ? ', ' + s.u : ''}<span class="row2">
      <input type="number" inputmode="decimal" placeholder="от" value="${f.min ?? ''}" data-sf="${s.k}" data-m="min">
      <input type="number" inputmode="decimal" placeholder="до" value="${f.max ?? ''}" data-sf="${s.k}" data-m="max"></span></label>`;
    if (s.t === 'b') return head + `<label class="chk"><input type="checkbox" ${f.on ? 'checked' : ''} data-sf="${s.k}" data-m="on"> ${esc(s.l)}</label>`;
    if (s.t === 's') { const opts = [...new Set(items.map(p => p.specs[s.k]).filter(v => !empty(v)))].sort();
      return head + `<label class="fl">${esc(s.l)}<select data-sf="${s.k}" data-m="eq"><option value="">Любой</option>${opts.map(o => `<option ${f.eq === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`; }
    return '';
  }).join('');
  const siblings = CATEGORIES.filter(x => x.g === c.g), hero = topOf(S.cat);

  return `
  <section class="hero">
    <button class="btn sm all" id="pickcat">Все категории</button>
    ${hero ? illo(hero) : ''}
    <div class="txt"><div class="cap">${esc(g.name)}</div><h1 id="pickcat2" style="font-size:min(36px, calc((min(50vw,410px) - 16px) / ${(Math.max(...c.name.split(' ').map(w => w.length)) * .98 + .8).toFixed(2)}))">${esc(c.name)}<span class="ch">▾</span></h1>
      <div class="sub">${items.length} моделей · от ${rub(Math.min(...prices))}${PRICES.updated && items.some(p => p.offer) ? ' · цены на ' + fmtDate(PRICES.updated) : ''}</div></div>
  </section>
  ${siblings.length > 1 ? `<div class="tabs">${siblings.map(x => `<button class="tab2 ${x.id === S.cat ? 'on' : ''}" data-cat="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
  <div class="searchbar">
    <input type="search" id="q" placeholder="Поиск по бренду или модели" value="${esc(S.q)}">
    <button class="btn sm ${S.showFilters ? 'primary' : ''}" id="tf">Фильтры${nf ? ' · ' + nf : ''}</button>
  </div>
  ${S.showFilters ? `<div class="filters">
    <label class="fl">Цена до: <b>${S.maxPrice ? rub(S.maxPrice) : 'любая'}</b>
      <input type="range" min="${pMin}" max="${pMax}" step="${step}" value="${S.maxPrice || pMax}" id="price"></label>
    <div class="fl">Бренд<div class="chips">${brands.map(b => `<button class="chip ${S.brands.has(b) ? 'on' : ''}" data-brand="${esc(b)}">${esc(b)}</button>`).join('')}</div></div>
    ${colors.length ? `<div class="fl">Цвет<div class="chips">${colors.map(k => `<button class="chip ${S.colors.has(k) ? 'on' : ''}" data-color="${k}">${swatch(k)} ${COLORS[k][0]}</button>`).join('')}</div></div>` : ''}
    ${sfHtml}
    <button class="btn" id="reset">Сбросить фильтры</button>
  </div>` : ''}
  <div class="listhead"><span class="cap">Найдено: ${list.length}</span>
    <select id="sort"><option value="rating" ${S.sort === 'rating' ? 'selected' : ''}>По рейтингу</option><option value="reviews" ${S.sort === 'reviews' ? 'selected' : ''}>По числу отзывов</option><option value="cheap" ${S.sort === 'cheap' ? 'selected' : ''}>Сначала дешёвые</option><option value="exp" ${S.sort === 'exp' ? 'selected' : ''}>Сначала дорогие</option></select></div>
  ${list.length ? vgrid(list, p => card(p)) : '<p class="empty">Ничего не нашлось. Ослабьте фильтры.</p>'}
  <div class="pad"><button class="btn full" id="addown">+ Добавить свою модель</button></div>`;
}

// ---------- Каталог-лист: все категории + поиск ----------
function tilesFor(cats, attr) {
  return `<div class="tiles">${cats.map(c => { const t = topOf(c.id);
    return `<button class="tile ${attr === 'pcat' && c.id === S.cat ? 'on' : ''}" data-${attr}="${c.id}"><div class="st">${t ? illo(t, { bare: 1 }) : ''}</div><span>${esc(c.name)}</span><small>${inCat(c.id).length} моделей</small></button>`; }).join('')}</div>`;
}
function pickerBody(q = '') {
  const ql = q.trim().toLowerCase();
  const cats = CATEGORIES.filter(c => !ql || c.name.toLowerCase().includes(ql));
  const prods = ql.length >= 2 ? all().filter(p => (p.brand + ' ' + p.model).toLowerCase().includes(ql)).slice(0, 15) : [];
  return (prods.length ? `<div class="pgroup"><div class="ph"><span class="cap">Модели</span></div>${prods.map(p => `<button class="prow" data-pprod="${p.id}"><span>${esc(p.brand)} ${esc(p.model)}</span><small>${esc(catById(p.cat).name)}</small></button>`).join('')}</div>` : '')
    + GROUPS.map(g => { const cs = cats.filter(c => c.g === g.id); return cs.length ? `<div class="pgroup"><div class="ph"><span class="cap">${esc(g.name)}</span></div>${tilesFor(cs, 'pcat')}</div>` : ''; }).join('')
    || '<p class="empty">Ничего не найдено</p>';
}
function openPicker() {
  openSheet(`<h2>Каталог</h2><div class="pad"><div class="searchbar" style="padding:8px 0"><input type="search" id="pq" placeholder="Категория, бренд или модель"></div><div id="pbody">${pickerBody()}</div></div>`);
}

// ---------- Сравнение ----------
function viewCompare() {
  const items = S.compare.map(byId).filter(Boolean);
  if (items.length < 2) return `<div class="empty-state"><h2>Сравнение</h2><p>Добавьте 2–4 модели одной категории значком ${ICON.cmp.replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px"')} на карточке.</p>
    ${items.length ? `<p>Сейчас выбрано: <b>${esc(items[0].brand + ' ' + items[0].model)}</b></p>` : ''}<button class="btn primary" data-go="catalog">Перейти в каталог</button></div>`;
  const c = catById(items[0].cat), n = items.length;
  const wins = items.map(() => 0);
  const G0 = 'Цена, рейтинг и отзывы';
  const rows = [{ l: 'Цена', get: p => p.price, f: v => v ? rub(v) : '—', better: 'l', g: G0 },
    { l: 'Рейтинг магазина', get: p => p.rating || null, f: v => v ? '★ ' + num(v) : '—', better: 'h', g: G0 },
    { l: 'Отзывы пользователей', get: p => score(p).n ? score(p).users : null, f: (v, p) => v ? `${stars(v)} ${num(v.toFixed(1))}<br><span class="na">${plural(score(p).n, 'отзыв', 'отзыва', 'отзывов')}</span>` : '<span class="na">пока нет</span>', better: 'h', g: G0, keep: 1 },
    { l: 'Сводный рейтинг', get: p => score(p).val || null, f: v => v ? '★ ' + num(v.toFixed(2)) : '—', better: 'h', g: G0 }]
    .concat(c.specs.map(s => ({ l: s.l, get: p => p.specs[s.k], f: v => fmt(s, v), better: s.b, spec: s, g: s.g })));
  let lastG = '', body = '';
  rows.forEach(r => {
    const vals = items.map(r.get);
    const same = vals.every(v => JSON.stringify(v ?? null) === JSON.stringify(vals[0] ?? null));
    if (S.onlyDiff && same) return;
    if (vals.every(empty) && !r.keep) return;
    let best = null;
    if (r.better && !same) {
      const score = v => r.spec ? norm(c.id, r.spec, v) : (r.better === 'h' ? v : -v);
      const sc = vals.map(v => empty(v) ? -Infinity : score(v));
      const m = Math.max(...sc); best = sc.map(x => x === m && x !== -Infinity);
      best.forEach((b, i) => b && wins[i]++);
    }
    const isNum = (r.spec ? r.spec.t === 'n' : true) && r.better, mx = Math.max(...vals.filter(v => typeof v === 'number').map(Math.abs));
    const bar = v => isNum && typeof v === 'number' && mx > 0 ? `<span class="bar"><i style="width:${Math.round(Math.abs(v) / mx * 100)}%"></i></span>` : '';
    if (r.g !== lastG) { lastG = r.g; body += `<tr class="grp"><th>${esc(r.g)}</th><td colspan="${n}"></td></tr>`; }
    body += `<tr class="${same ? 'same' : ''}"><th>${esc(r.l)}</th>${vals.map((v, i) => `<td class="${best && best[i] ? 'best' : ''}">${r.f(v, items[i])}${bar(v)}</td>`).join('')}</tr>`;
  });
  const tot = totals(items, c), topT = Math.max(...tot.map(t => t.total));
  return `<div class="cmp-head"><div><div class="cap">Сравнение</div><h2>${esc(c.name)}</h2></div>
    <label class="chk"><input type="checkbox" id="diff" ${S.onlyDiff ? 'checked' : ''}> Только различия</label></div>
  <div class="section" style="padding-top:14px"><div class="cap">Габариты в одном масштабе</div></div>
  <div class="vis" id="scalevis">${SC3.key === items.map(p => p.id).join() ? SC3.html : scaleView(items)}</div>
  <div class="section"><div class="cap">Характеристики</div></div>
  <div class="tablewrap" id="tw"><table class="cmp" style="--n:${n}">
    <thead><tr><th class="corner"><span class="cap">${n} модели</span></th>${items.map(p => `<th><div class="mini">${illo(p, { bare: 1 })}</div><div class="brand">${esc(p.brand)}</div><div class="model">${esc(p.model)}</div><div class="hp">${p.price ? rub(p.price) : ''}</div><button class="x" data-cmp="${p.id}" aria-label="Убрать">✕</button></th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th>Итоговая оценка</th>${tot.map((t, i) => `<td class="${t.total === topT ? 'win' : ''}"><span class="total">${t.total}<span class="na" style="font-size:12px">/100</span></span>${t.total === topT ? ' — лидер' : ''}<small>лучше по ${plural(wins[i], 'пункту', 'пунктам', 'пунктам')}</small></td>`).join('')}</tr></tfoot>
  </table></div>
  <p class="hint" style="margin-top:12px">Названия и модели закреплены — листайте таблицу в любую сторону. Подсвечено лучшее значение в строке; размеры, цвета и типы не оцениваются.</p>
  <p class="hint" style="margin-top:8px">Итоговая оценка: 40% — характеристики (относительно сравниваемых моделей), 40% — сводный рейтинг (магазин + отзывы пользователей; чем больше отзывов, тем сильнее их вес), 20% — цена.</p>
  <div class="pad"><button class="btn full" id="clrcmp">Очистить сравнение</button></div>`;
}

// ---------- Мастер подбора ----------
const BUDGETS = [3000, 10000, 30000, 50000, 80000, 150000];
function autoQuestions(c) {
  const qs = [];
  const typ = c.specs.find(s => s.t === 's' && s.f);
  if (typ) { const vals = [...new Set(inCat(c.id).map(p => p.specs[typ.k]).filter(v => !empty(v)))];
    if (vals.length > 1) qs.push({ q: typ.l + '?', o: vals.map(v => ({ l: v, c: { k: typ.k, eq: v } })).concat({ l: 'Не важно' }) }); }
  const pr = c.specs.filter(s => s.b && s.t !== 'c' && !['width', 'height', 'depth'].includes(s.k) && inCat(c.id).some(p => !empty(p.specs[s.k]))).slice(0, 8)
    .map(s => ({ l: s.t === 'b' ? s.l : s.k === 'weight' ? 'Лёгкий вес' : s.t === 'e' ? 'Экономия электроэнергии' : `${s.l} — ${s.b === 'h' ? 'побольше' : 'поменьше'}`, w: { [s.k]: 2 } }));
  if (pr.length) qs.push({ q: 'Что важнее всего?', multi: 1, o: pr });
  return qs;
}
function wizSteps(cat) {
  const prices = inCat(cat).map(p => p.price).filter(Boolean), mn = Math.min(...prices), mx = Math.max(...prices);
  const b = BUDGETS.filter(v => v > mn && v < mx);
  return [{ q: 'Бюджет', o: b.map(v => ({ l: 'До ' + rub(v), budget: v })).concat({ l: 'Не ограничен', budget: 0 }) }].concat(WIZARD[cat] || autoQuestions(catById(cat)));
}
function viewWizard() {
  const w = S.wiz;
  if (!w) return `<div class="wiz"><div class="cap" style="margin-top:22px">Подбор</div><h2 style="margin-top:4px">Что подбираем?</h2><p class="sub">Ответьте на пару вопросов — покажем три подходящие модели и объясним выбор.</p>
    ${GROUPS.map(g => `<div class="pgroup"><div class="ph"><span class="cap">${esc(g.name)}</span></div>${tilesFor(CATEGORIES.filter(c => c.g === g.id), 'wcat')}</div>`).join('')}</div>`;
  const steps = wizSteps(w.cat);
  if (w.step >= steps.length) return viewWizResult();
  const st = steps[w.step], ans = w.ans[w.step], c = catById(w.cat);
  return `<div class="wiz"><div class="wizcat"><div class="st">${illo(topOf(w.cat), { bare: 1 })}</div><div><div class="cap">${esc(c.name)}</div><div class="sub" style="margin:2px 0 0">Вопрос ${w.step + 1} из ${steps.length}</div></div></div>
    <div class="progress"><i style="width:${(w.step / steps.length) * 100}%"></i></div>
    <h2>${esc(st.q)}</h2>${st.multi ? '<p class="sub">Можно выбрать несколько</p>' : ''}
    <div class="opts">${st.o.map((o, i) => `<button class="opt ${(st.multi ? (ans || []).includes(i) : ans === i) ? 'on' : ''}" data-opt="${i}">${esc(o.l)}</button>`).join('')}</div>
    <div class="wiznav"><button class="btn" id="wback">Назад</button>${st.multi ? `<button class="btn primary" id="wnext">${(ans || []).length ? 'Показать результат' : 'Пропустить'}</button>` : ''}</div></div>`;
}
function wizScore() {
  const w = S.wiz, c = catById(w.cat), steps = wizSteps(w.cat);
  let budget = 0; const cons = [], weights = {};
  steps.forEach((st, i) => {
    const a = w.ans[i]; if (a === undefined) return;
    (Array.isArray(a) ? a : [a]).forEach(j => { const o = st.o[j];
      if (o.budget !== undefined) budget = o.budget;
      if (o.c) cons.push(o.c);
      if (o.w) Object.entries(o.w).forEach(([k, v]) => weights[k] = (weights[k] || 0) + v); });
  });
  const ok = (p, cn) => { const v = p.specs[cn.k];
    if (cn.min !== undefined && !(v >= cn.min)) return false; if (cn.max !== undefined && !(v <= cn.max)) return false;
    if (cn.eq !== undefined && v !== cn.eq) return false; if (cn.ne !== undefined && v === cn.ne) return false; return true; };
  const scored = inCat(w.cat).map(p => {
    const miss = cons.filter(cn => !ok(p, cn)).length + (budget && p.price > budget ? 1 : 0);
    let s = (score(p).val || 4) - 4; const pros = [], minus = []; if (score(p).n) pros.push(`Отзывы: ★ ${num(score(p).users.toFixed(1))} (${score(p).n})`);
    Object.entries(weights).forEach(([k, wt]) => { const sp = c.specs.find(x => x.k === k); if (!sp || empty(p.specs[k])) return;
      const n = norm(w.cat, sp, p.specs[k]); s += wt * n;
      if (n >= 0.6) pros.push(`${sp.l}: ${fmt(sp, p.specs[k])}`); else if (n <= 0.3) minus.push(`${sp.l}: ${fmt(sp, p.specs[k])}`); });
    if (budget) s += 0.8 * Math.max(0, 1 - p.price / budget);
    return { p, s: s - miss * 10, miss, pros, minus };
  }).sort((a, b) => b.s - a.s);
  return { list: scored.slice(0, 3), exact: scored.some(x => x.miss === 0) };
}
function viewWizResult() {
  const r = wizScore();
  return `<div class="wiz"><div class="cap" style="margin-top:22px">Результат подбора</div><h2 style="margin-top:4px">Вам подойдут</h2></div>
    ${r.exact ? '' : '<p class="warn">Точных совпадений нет — показываем ближайшие варианты. Попробуйте увеличить бюджет или смягчить условия.</p>'}
    <div class="grid">${r.list.map((x, i) => card(x.p, `<div class="why"><b>${i === 0 ? 'Лучший выбор' : 'Альтернатива'}</b>
      ${x.miss ? `<div class="minus">Совпадает не всё (${x.miss})</div>` : '<div class="plus">Подходит под все условия</div>'}
      ${x.pros.slice(0, 3).map(t => `<div class="plus">+ ${t}</div>`).join('')}${x.minus.slice(0, 2).map(t => `<div class="minus">− ${t}</div>`).join('')}</div>`)).join('')}</div>
    <div class="pad"><button class="btn primary full" id="wcmp">Сравнить эти модели</button><button class="btn full" id="wagain">Подобрать заново</button></div>`;
}

// ---------- Избранное ----------
function viewFavs() {
  const items = [...S.favs].map(byId).filter(Boolean);
  if (!items.length) return `<div class="empty-state"><h2>Избранное</h2><p>Нажмите ♡ на карточке, чтобы сохранить модель.</p><button class="btn primary" data-go="catalog">В каталог</button></div>`;
  return `<div class="wiz"><div class="cap" style="margin-top:22px">Сохранено</div><h2 style="margin:4px 0 16px">Избранное</h2></div>${vgrid(items, p => card(p, '', true))}`;
}

// ---------- Лист и карточка модели ----------
function openSheet(html) { window.R3 && R3.stop(); $('#sheet .body').innerHTML = html; $('#sheet').classList.add('on'); $('#sheet .panel').scrollTop = 0; document.body.classList.add('locked'); hydrateSoon(); }
function closeSheet() { $('#sheet').classList.remove('on'); document.body.classList.remove('locked'); S.detail = null; window.R3 && R3.stop(); }

function specTable(c, p) {
  let lastG = '', h = '';
  c.specs.forEach(s => {
    if (s.g !== lastG) { if (lastG) h += '</table>'; lastG = s.g; h += `<div class="ksec">${esc(s.g)}</div><table class="kv">`; }
    h += `<tr><th>${esc(s.l)}</th><td>${fmt(s, p.specs[s.k])}</td></tr>`;
  });
  return h + '</table>';
}
function detail(id, color) {
  const p = byId(id), c = catById(p.cat), cols = p.specs.colors || [], cur = color || cols[0];
  S.detail = { id, color: cur, mode: '3d', part: 'main' };
  openSheet(`<div class="pstage" id="pst"><div class="r3live" id="r3live">${illo(p, { color: cur, flat: 1 })}</div>
      <div class="vhint">Покрутите модель пальцем · двумя пальцами — приблизить</div>
      <div class="vtools"><button data-v="3d" class="on">3D</button><button data-v="front">Спереди</button><button data-v="side">Сбоку</button><button data-v="top">Сверху</button><button data-v="dims">Размеры</button></div></div>
    <div id="partsbar">${partsBar(p)}</div>
    ${p.source && p.source.picture ? `<div class="shopphoto"><img src="${esc(p.source.picture)}" alt="Фото товара из магазина" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"><span>Фото магазина</span></div>` : ''}
    ${cols.length ? `<div class="recolor">${cols.map(k => `<button class="${k === cur ? 'on' : ''}" data-recolor="${k}" data-pid="${p.id}" aria-label="${COLORS[k] ? COLORS[k][0] : k}">${swatch(k)}</button>`).join('')}</div><div class="recolor-l">${COLORS[cur] ? COLORS[cur][0] : ''}</div>` : ''}
    <div class="ptitle"><div class="brand">${esc(p.brand)} · ${esc(c.name)}</div><h2>${esc(p.model)}</h2>
      <span class="price">${p.price ? rub(p.price) : '—'}</span> ${ratingLine(p, 1)}
      ${dims(p) ? `<div class="sub" style="margin-top:6px">${dims(p)}${empty(p.specs.weight) ? '' : ' · ' + num(p.specs.weight) + ' кг'}</div>` : ''}</div>
    <div class="acts"><button class="btn primary" data-cmp="${p.id}" data-close>${S.compare.includes(p.id) ? 'Убрать из сравнения' : 'Сравнить'}</button>
      <button class="btn" data-fav="${p.id}" data-close>${S.favs.has(p.id) ? '♥ В избранном' : '♡ В избранное'}</button></div>
    <div class="pad">${specTable(c, p)}${partsOf(p).length > 1 ? `<div class="ksec">Комплект</div><table class="kv">${partsOf(p).filter(x => x.id !== 'all').map(x => `<tr><th>${esc(x.name)}${x.n ? ' ×' + x.n : ''}</th><td>${partSize(x) || '—'}</td></tr>`).join('')}</table>` : ''}
    <div id="revs">${reviewsBlock(p)}</div>
    ${priceSource(p)}
    ${shopLink(p) ? `<a class="btn full primary" target="_blank" rel="noopener" href="${esc(shopLink(p).url)}">Открыть в магазине${shopLink(p).shop ? ' «' + esc(shopLink(p).shop) + '»' : ''} ↗</a>` : ''}
    <a class="btn full" target="_blank" rel="noopener" href="https://market.yandex.ru/search?text=${encodeURIComponent(p.brand + ' ' + p.model)}">Найти цены на Яндекс Маркете ↗</a>
    ${p.custom ? `<button class="btn full danger" data-del="${p.id}">Удалить мою модель</button>` : ''}</div>`);
  REVF.open = false;
  if (window.R3) stageMode('3d');
}
function addForm() {
  const c = catById(S.cat); let lastG = '';
  openSheet(`<h2>Своя модель</h2><p class="sub pad" style="margin-top:6px">${esc(c.name)}. Перепишите характеристики из карточки магазина — модель появится в каталоге и сравнении.</p>
    <form id="ownf" class="form">
      <label class="fl">Бренд<input name="brand" required></label>
      <label class="fl">Модель<input name="model" required></label>
      <label class="fl">Цена, ₽<input name="price" type="number" inputmode="numeric"></label>
      ${c.specs.map(s => (s.g !== lastG ? `<div class="fgroup">${esc(lastG = s.g)}</div>` : '') + (
        s.t === 'b' ? `<label class="chk"><input type="checkbox" name="${s.k}"> ${esc(s.l)}</label>`
        : s.t === 'e' ? `<label class="fl">${esc(s.l)}<select name="${s.k}"><option value="">—</option>${ENERGY.map(e => `<option>${e}</option>`).join('')}</select></label>`
        : s.t === 'c' ? `<div class="fl">${esc(s.l)}<div class="chips">${Object.keys(COLORS).map(k => `<label class="chip cchk"><input type="checkbox" name="colors" value="${k}">${swatch(k)} ${COLORS[k][0]}</label>`).join('')}</div></div>`
        : `<label class="fl">${esc(s.l)}${s.u ? ', ' + s.u : ''}<input name="${s.k}" ${s.t === 'n' ? 'type="number" step="any" inputmode="decimal"' : ''}></label>`)).join('')}
      <button class="btn primary full">Сохранить</button></form>`);
}



// ---------- Виртуализация длинных списков ----------
// Если в списке больше VG_MIN карточек, в DOM держим только видимые строки (+ запас VG_BUF сверху и снизу),
// остальное заменяют пустые блоки нужной высоты. Высота строки одинакова (по самой высокой карточке),
// поэтому прокрутка не «прыгает». Миниатюры 3D рисуются только для видимых карточек.
const VG = { items: null, fn: null, cols: 0, rowH: 0, start: -1, end: -1 };
const VG_MIN = 36, VG_BUF = 3;
function vgrid(list, fn) {
  VG.start = VG.end = -1; VG.rowH = 0;
  if (list.length < VG_MIN) { VG.items = null; return `<div class="grid">${list.map(fn).join('')}</div>`; }
  VG.items = list; VG.fn = fn;
  return `<div class="grid vgrid" id="vgrid" data-n="${list.length}" ></div>`;
}
const vgCols = () => matchMedia('(min-width:640px)').matches ? 3 : 2;
function vgUpdate(force) {
  const el = $('#vgrid'); if (!el || !VG.items) return;
  const cols = vgCols(), rows = Math.ceil(VG.items.length / cols);
  if (cols !== VG.cols) { VG.cols = cols; VG.rowH = 0; force = true; }
  const rowH = VG.rowH || Math.round(el.clientWidth / cols + 140);
  const top = el.getBoundingClientRect().top + scrollY;
  const first = Math.max(0, Math.floor((scrollY - top) / rowH) - VG_BUF);
  const last = Math.min(rows, Math.max(first + 1, Math.ceil((scrollY + innerHeight - top) / rowH) + VG_BUF));
  if (!force && first === VG.start && last === VG.end) return;
  VG.start = first; VG.end = last;
  el.innerHTML = `<div class="vsp" style="height:${first * rowH - (first ? 1 : 0)}px"${first ? '' : ' hidden'}></div>`
    + VG.items.slice(first * cols, last * cols).map(VG.fn).join('')
    + `<div class="vsp" style="height:${(rows - last) * rowH - 1}px"${rows - last ? '' : ' hidden'}></div>`;
  if (!VG.rowH) {                       // первый показ: меряем самую высокую карточку и фиксируем высоту строки
    el.style.setProperty('--vrow', 'auto');
    const h = Math.max(...[...el.querySelectorAll('.card')].map(c => c.offsetHeight));
    if (h > 0) { VG.rowH = h + 1; el.style.setProperty('--vrow', h + 'px'); return vgUpdate(true); }
  }
  hydrateSoon();
}
let vgRaf = 0;
const vgOnScroll = () => { if (!VG.items || vgRaf) return; vgRaf = requestAnimationFrame(() => { vgRaf = 0; vgUpdate(); }); };
window.addEventListener('scroll', vgOnScroll, { passive: true });
window.addEventListener('resize', () => { if (VG.items) { VG.rowH = 0; vgUpdate(true); } });


// ---------- Комплект: из каких предметов состоит товар ----------
// Первый предмет — основное изделие (его размеры — ширина/высота/глубина из характеристик).
// Если предметов больше одного, в карточке появляется переключатель и вариант «Весь комплект».
const MAIN_NAME = { aircon: 'Внутренний блок', vacuum: 'Робот', waterfilter: 'Фильтр', toothbrush: 'Щётка', shaver: 'Бритва',
  styler: 'Стайлер', trimmer: 'Машинка', steamer: 'Отпариватель', tv: 'Телевизор', foodproc: 'Комбайн' };
function partsOf(p) {
  const s = p.specs, B = p.box || {}, P = [{ id: 'main', name: MAIN_NAME[p.cat] || 'Изделие', w: s.width || B.w, h: s.height || B.h, d: s.depth || B.d, approx: !s.width && !!B.w }];
  const add = (id, name, w, h, d, n) => P.push({ id, name, w, h, d, n });
  switch (p.cat) {
    case 'aircon': add('out', 'Наружный блок', s.ow || 70, s.oh || 55, s.od || 27); break;
    case 'vacuum': if (s.type === 'Робот') s.station ? add('station', 'Станция самоочистки', 34, 42, 40) : add('base', 'Зарядная база', 16, 9, 11); break;
    case 'waterfilter': if (s.type !== 'Кувшин') { add('faucet', 'Кран', 5, 32, 18); if (s.type === 'Обратный осмос') add('tank', 'Накопительный бак', 26, 36, 26); } break;
    case 'toothbrush': add('charger', 'Зарядная подставка', 6, 4.5, 6); break;
    case 'shaver': if (s.clean) add('cleanst', 'Станция очистки', 12, 16, 11); break;
    case 'styler': if ((s.attach || 0) > 1) add('attach', 'Насадки', Math.min(s.attach, 8) * 5, 16, 4, s.attach); break;
    case 'trimmer': if ((s.attach || 0) > 0) add('combs', 'Насадки', Math.min(s.attach, 10) * 4.5, 5, 3.5, s.attach); break;
    case 'steamer': if (s.board) add('board', 'Гладильная доска', 100, 88, 32); break;
    case 'tv': add('remote', 'Пульт', 4.5, 17, 2); break;
    case 'foodproc': if (s.blender) add('blenderjar', 'Чаша блендера', 15, 24, 15); break;
  }
  if (P.length > 1) P.push({ id: 'all', name: 'Весь комплект' });
  return P;
}
const partSize = pt => pt.w ? `${pt.approx ? '≈ ' : ''}${num(pt.w)}×${num(pt.h)}×${num(pt.d)} см${pt.approx ? ' (типичный размер)' : ''}` : '';
function partsBar(p) {
  const P = partsOf(p); if (P.length < 2) return '';
  const cur = S.detail ? S.detail.part : 'main', pt = P.find(x => x.id === cur) || P[0];
  return `<div class="parts" role="tablist" aria-label="Комплект">${P.map(x => `<button role="tab" class="${x.id === cur ? 'on' : ''}" data-part="${x.id}">${esc(x.name)}${x.n ? ' ×' + x.n : ''}</button>`).join('')}</div>
    <div class="parts-cap">${cur === 'all' ? 'Все предметы комплекта в одном масштабе' : esc(pt.name) + (partSize(pt) ? ' · ' + partSize(pt) : '')}</div>`;
}


// Откуда цена и характеристики: реальная модель (с паспортом) или витрина магазина
const fmtDate = d => { try { return new Date(d).toLocaleDateString('ru-RU'); } catch { return d; } };
const shopLink = p => (p.offer && p.offer.url) ? p.offer : (p.source && p.source.url) ? p.source : null;
function priceSource(p) {
  if (p.custom) return '';
  const S = p.source, o = p.offer, shop = (o && o.shop) || (S && S.shop) || '';
  const parts = [];
  if (p.feed) {
    parts.push(`Товар из каталога магазина «${esc(S.shop)}»${S.at ? ' на ' + fmtDate(S.at) : ''}. Магазин не передаёт характеристики — показаны только те, что указаны в названии${S.title ? ' («' + esc(S.title) + '»)' : ''}.`);
    if (S.offers && S.offers.length > 1) parts.push('Цены в магазинах: ' + S.offers.map(x => `«${esc(x.shop)}» ${rub(x.price)}`).join(', ') + '.');
    parts.push('Размеры 3D-модели — типичные для категории, не этой модели. Перед покупкой сверяйтесь с магазином.');
    return `<p class="sub" style="margin-top:16px">${parts.join(' ')}</p>`;
  }
  if (p.real) parts.push(`Реальная модель: характеристики${S.reviews ? ', оценка ★ ' + num(p.rating) + ' по ' + plural(S.reviews, 'отзыву', 'отзывам', 'отзывам') : ''} — с сайта магазина «${esc(S.shop)}»${S.at ? ' на ' + fmtDate(S.at) : ''}.`);
  if (o) parts.push(`Цена ${shop ? 'магазина «' + esc(shop) + '»' : 'из прайса'}${o.at ? ' на ' + fmtDate(o.at) : ''}.`);
  else if (p.real) parts.push(`Цена на ${fmtDate(S.at)}.`);
  if (S && S.note) parts.push(esc(S.note) + '.');
  parts.push('3D-модель построена по габаритам, детали упрощены. Перед покупкой сверяйтесь с магазином.');
  return `<p class="sub" style="margin-top:16px">${parts.join(' ')}</p>`;
}

// ---------- Сводный рейтинг ----------
// Рейтинг магазина считается как 5 «виртуальных» отзывов; реальные отзывы добавляются к нему.
// Так 1–2 отзыва сдвигают оценку немного, а 20 отзывов уже почти полностью определяют её.
const PRIOR = 5;
function score(p) {
  const rs = reviewsOf(p.id), n = rs.length, sum = rs.reduce((a, r) => a + r.stars, 0);
  const users = n ? sum / n : null, base = p.rating || 0;
  const val = base ? (base * PRIOR + sum) / (PRIOR + n) : (n ? users : 0);
  return { val, n, users, base };
}
const plural = (n, a, b, c) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c}`;
const stars = v => { const k = Math.round(v); return `<span class="stars">${'★'.repeat(k)}<span class="off">${'★'.repeat(5 - k)}</span></span>`; };
function ratingLine(p, big) {
  const s = score(p); if (!s.val) return '';
  return `<${big ? 'span' : 'div'} class="rating">${big ? '&nbsp;' : ''}★ ${num(s.val.toFixed(1))}${s.n ? ` · ${plural(s.n, 'отзыв', 'отзыва', 'отзывов')}` : ''}</${big ? 'span' : 'div'}>`;
}
// Итог сравнения 0–100
function totals(items, c) {
  const specs = c.specs.filter(s => s.b && ['n', 'b', 'e'].includes(s.t) && !['width', 'height', 'depth'].includes(s.k) && items.some(p => !empty(p.specs[s.k])));
  const rel = (vals) => { const mn = Math.min(...vals), mx = Math.max(...vals); return vals.map(v => mx === mn ? 1 : (v - mn) / (mx - mn)); };
  const specRel = items.map(() => []);
  specs.forEach(s => { const v = items.map(p => norm(c.id, s, p.specs[s.k])); if (new Set(v).size < 2) return; rel(v).forEach((x, i) => specRel[i].push(x)); });
  const price = rel(items.map(p => -(p.price || 0)));
  return items.map((p, i) => {
    const sp = specRel[i].length ? specRel[i].reduce((a, b) => a + b, 0) / specRel[i].length : .5;
    const rt = Math.max(0, Math.min(1, (score(p).val - 3) / 2));
    return { total: Math.round(100 * (.4 * sp + .4 * rt + .2 * price[i])), sp, rt };
  });
}

// ---------- Отзывы ----------
// Хранилище: общая база артефакта (db), документ reviews/<id пользователя> = { items: { <id модели>: отзыв } }.
// Без базы (открыто вне claude.ai) — только на этом устройстве (localStorage).
const RV = { state: 'init', all: {}, uid: null, db: null, user: null, owner: false, canWrite: true, names: {}, chain: Promise.resolve() };
const REVF = { open: false, stars: 0 };
const USAGE = ['Меньше месяца', 'До года', '1–3 года', 'Больше 3 лет'];
function reviewsOf(pid) {
  const out = [];
  Object.entries(RV.all).forEach(([uid, items]) => { const r = items && items[pid]; if (r && r.stars >= 1 && r.stars <= 5) out.push({ ...r, uid }); });
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}
const myKey = () => RV.state === 'local' ? 'local' : RV.uid;
const myReview = pid => { const k = myKey(); return k && RV.all[k] ? RV.all[k][pid] : null; };
function reviewsBlock(p) {
  const rs = reviewsOf(p.id), s = score(p), mine = myReview(p.id);
  const note = RV.state === 'local' ? '<div class="revnote">Отзывы сохраняются только на этом устройстве: приложение открыто вне claude.ai. Откройте его по ссылке claude.ai, чтобы отзывы видели все.</div>'
    : RV.state === 'init' || RV.state === 'loading' ? '<div class="revnote">Загружаем отзывы…</div>'
    : RV.state === 'slow' ? '<div class="revnote">Отзывы пока не загрузились — проверьте интернет.</div>'
    : RV.state === 'error' ? '<div class="revnote">Не удалось загрузить отзывы.</div>' : '';
  const form = REVF.open ? `<form id="revform" class="form" style="padding:0;margin:14px 0" data-pid="${p.id}">
      <div class="fl">Ваша оценка<div class="starpick">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-star="${i}" class="${i <= REVF.stars ? 'on' : ''}" aria-label="${i}">★</button>`).join('')}</div></div>
      <label class="fl">Сколько пользуетесь<select name="usage"><option value="">—</option>${USAGE.map(u => `<option ${mine?.usage === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label class="fl">Достоинства<textarea name="pros" maxlength="600">${esc(mine?.pros || '')}</textarea></label>
      <label class="fl">Недостатки<textarea name="cons" maxlength="600">${esc(mine?.cons || '')}</textarea></label>
      <label class="fl">Комментарий<textarea name="text" maxlength="1500">${esc(mine?.text || '')}</textarea></label>
      <div class="acts" style="padding:0"><button type="button" class="btn" data-revcancel>Отмена</button><button class="btn primary">${mine ? 'Сохранить' : 'Опубликовать'}</button></div></form>` : '';
  const canWrite = RV.state === 'local' || (RV.state === 'live' && RV.canWrite && RV.uid);
  const btn = REVF.open ? '' : canWrite ? `<button class="btn full" ${mine ? `data-revedit="${p.id}"` : `data-revnew="${p.id}"`}>${mine ? 'Изменить мой отзыв' : '+ Написать отзыв'}</button>`
    : RV.state === 'live' ? '<div class="revnote">Чтобы оставлять отзывы, владелец должен открыть вам доступ уровня «Участник» (Contributor) или выше.</div>' : '';
  const list = rs.map(r => `<div class="rev"><div class="who"><span><b>${esc(RV.names[r.uid] || (r.uid === RV.uid || r.uid === 'local' ? 'Вы' : 'Пользователь'))}</b>${r.usage ? ' · ' + esc(r.usage) : ''}</span><span>${r.at ? new Date(r.at).toLocaleDateString('ru-RU') : ''}</span></div>
      <div>${stars(r.stars)}</div>
      ${r.pros ? `<div><span class="pl">Достоинства:</span> ${esc(r.pros)}</div>` : ''}${r.cons ? `<div><span class="mn">Недостатки:</span> ${esc(r.cons)}</div>` : ''}${r.text ? `<div>${esc(r.text)}</div>` : ''}
      ${(r.uid === RV.uid || r.uid === 'local' || RV.owner) && RV.state !== 'loading' ? `<div><button class="lnk" data-revdel="${p.id}" data-uid="${esc(r.uid)}">Удалить</button></div>` : ''}</div>`).join('');
  return `<div class="revhead"><div class="ksec" style="margin:0">Отзывы</div><span class="cap">${plural(rs.length, 'отзыв', 'отзыва', 'отзывов')}</span></div>
    <div class="revsum"><div class="big">${s.val ? num(s.val.toFixed(1)) : '—'}</div><div><div>${s.val ? stars(s.val) : ''}</div>
      <div class="sub">Сводный рейтинг: магазин ${s.base ? '★ ' + num(s.base) : '—'}${s.n ? ` + отзывы ★ ${num(s.users.toFixed(1))}` : ''}</div></div></div>
    ${note}${list || (RV.state === 'live' || RV.state === 'local' ? '<div class="revnote">Отзывов пока нет — будьте первым.</div>' : '')}
    <div style="margin-top:12px">${form}${btn}</div>`;
}
function refreshReviews() {
  const el = $('#revs'); if (el && S.detail) {
    if (el.querySelector('#revform') && REVF.open && document.activeElement && el.contains(document.activeElement)) return; // не мешаем писать
    el.innerHTML = reviewsBlock(byId(S.detail.id));
  }
}
function refreshAll() {
  const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (!typing || document.activeElement.id === 'q') render();
  refreshReviews();
}
function localReviews() { return store.get('reviews_local', {}); }
function writeMine(items) {
  if (RV.state === 'local') { store.set('reviews_local', items); RV.all = { local: items }; refreshAll(); return Promise.resolve(); }
  RV.all = { ...RV.all, [RV.uid]: items };
  RV.chain = RV.chain.then(() => RV.db.doc('reviews/' + RV.uid).set({ items })).catch(e => {
    if (e && e.code === 'invalid_argument') { RV.canWrite = false; toast('Нет прав на запись отзывов'); } else toast('Не удалось сохранить отзыв');
  });
  refreshAll(); return RV.chain;
}
function submitReview(f) {
  const pid = f.dataset.pid; if (!REVF.stars) { toast('Поставьте оценку звёздами'); return; }
  const fd = new FormData(f), clip = (v, n) => String(v || '').trim().slice(0, n);
  const r = { stars: REVF.stars, usage: clip(fd.get('usage'), 40), pros: clip(fd.get('pros'), 600), cons: clip(fd.get('cons'), 600), text: clip(fd.get('text'), 1500), at: Date.now() };
  const key = RV.state === 'local' ? 'local' : RV.uid;
  const items = { ...(RV.all[key] || {}), [pid]: r };
  REVF.open = false; document.activeElement?.blur(); writeMine(items).then(() => toast('Отзыв сохранён'));
}
function deleteReview(pid, uid) {
  if (RV.state === 'local' || uid === RV.uid) { const key = RV.state === 'local' ? 'local' : RV.uid; const items = { ...(RV.all[key] || {}) }; delete items[pid]; writeMine(items); toast('Отзыв удалён'); return; }
  if (RV.owner && RV.db) { const items = { ...(RV.all[uid] || {}) }; delete items[pid]; RV.all = { ...RV.all, [uid]: items };
    RV.chain = RV.chain.then(() => RV.db.doc('reviews/' + uid).set({ items })).catch(() => toast('Не удалось удалить')); refreshAll(); toast('Отзыв удалён'); }
}
async function resolveNames() {
  if (!RV.user || !RV.user.profiles) return;
  const ids = Object.keys(RV.all).filter(id => !(id in RV.names)); if (!ids.length) return;
  try { const ps = await RV.user.profiles(ids); ids.forEach(id => { RV.names[id] = (ps && ps[id] && ps[id].name) || ''; }); refreshReviews(); } catch {}
}
async function initReviews() {
  const local = () => { RV.state = 'local'; RV.all = { local: localReviews() }; refreshAll(); };
  if (!window.claude || typeof window.claude.use !== 'function') return local();
  try {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!db) return local();
    RV.db = db; RV.user = user; RV.state = 'loading';
    try { RV.uid = user && user.id ? await user.id() : null; } catch {}
    try { RV.owner = user && user.isOwner ? !!(await user.isOwner()) : false; } catch {}
    try { const c = user && user.can ? await user.can('data.write') : null; RV.canWrite = c !== false; } catch {}
    const timer = setTimeout(() => { if (RV.state === 'loading') { RV.state = 'slow'; refreshReviews(); } }, 10000);
    db.collection('reviews').onSnapshot(snap => {
      if (!snap.metadata.fromCache) clearTimeout(timer);
      const all = {}; snap.docs.forEach(d => { const v = d.data(); if (v && v.items && typeof v.items === 'object') all[d.id] = v.items; });
      RV.all = all; RV.state = 'live'; resolveNames(); refreshAll();
    }, () => { clearTimeout(timer); RV.state = 'error'; refreshAll(); });
  } catch { local(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReviews); else setTimeout(initReviews, 0);

// ---------- 3D ----------
const SC3 = { key: '', html: '' };
let hydT = 0;
function hydrateSoon() { clearTimeout(hydT); hydT = setTimeout(() => window.R3 && R3.hydrate(document), 30); }
function stageMode(mode, rebuild) {
  const part = S.detail && partsOf(byId(S.detail.id)).find(x => x.id === S.detail.part);
  if (!S.detail) return; const p = byId(S.detail.id), el = $('#r3live'); if (!el) return;
  document.querySelectorAll('.vtools button').forEach(b => b.classList.toggle('on', b.dataset.v === mode || (mode !== 'dims' && b.dataset.v === '3d' && !['front', 'side', 'top'].includes(mode))));
  const hint = $('.vhint');
  if (mode === 'dims') {
    S.detail.mode = 'dims'; if (hint) hint.textContent = 'Ширина · высота · глубина — модель можно повернуть';
    if (window.R3) R3.viewer(el, p, S.detail.color, { dims: 1, part });
    else el.innerHTML = illo(p, { dims: 1, color: S.detail.color });
    return;
  }
  if (hint) hint.textContent = 'Покрутите модель пальцем · двумя пальцами — приблизить';
  if (!window.R3) { el.innerHTML = illo(p, { color: S.detail.color, flat: 1 }); return; }
  const live = R3.live && R3.live();
  if (!rebuild && S.detail.mode !== 'dims' && live && live.pid === p.id && !live.dims && live.part === (S.detail.part || 'main')) {
    if (live.color !== S.detail.color) live.setColor(S.detail.color);
    if (mode === '3d') live.reset(); else live.view(mode);
  } else R3.viewer(el, p, S.detail.color, { part }).then(v => { if (v && mode !== '3d') v.view(mode); });
  S.detail.mode = mode === 'dims' ? 'dims' : '3d';
}
function scale3d() {
  if (!window.R3 || S.view !== 'compare') return;
  const items = S.compare.map(byId).filter(Boolean); if (items.length < 2) return;
  const key = items.map(p => p.id).join(); if (SC3.key === key || SC3.busy === key) return;
  SC3.busy = key;
  R3.scaleScene(items).then(r => {
    SC3.busy = '';
    if (!r) return;
    SC3.key = key; SC3.html = `<div class="sc3"><img src="${r.url}" alt="Модели в одном масштабе"><div style="height:44px"></div>${items.map((p, i) => `<div class="lb" style="left:${(r.labels[i] * 100).toFixed(2)}%"><b>${esc(p.brand)}</b><span>${dims(p)}</span></div>`).join('')}</div>`;
    const el = $('#scalevis'); if (el && S.compare.map(byId).filter(Boolean).map(p => p.id).join() === key) el.innerHTML = SC3.html;
  });
}
window.addEventListener('r3ready', () => { hydrateSoon(); if (S.detail && S.detail.mode !== 'dims') stageMode('3d'); scale3d(); });

// ---------- Рендер ----------
function render() {
  applyTheme();
  const v = { catalog: viewCatalog, wizard: viewWizard, compare: viewCompare, favs: viewFavs }[S.view];
  const focusQ = document.activeElement?.id === 'q', pos = focusQ ? document.activeElement.selectionStart : 0;
  const tw = $('#tw'), scroll = tw ? [tw.scrollLeft, tw.scrollTop] : null;
  $('#main').innerHTML = v();
  if (focusQ) { const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }
  if (scroll && $('#tw')) [$('#tw').scrollLeft, $('#tw').scrollTop] = scroll;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.go === S.view));
  $('#cmpcount').textContent = S.compare.length || '';
  $('#cmpcount').hidden = !S.compare.length;
  const bar = $('#cmpbar');
  bar.hidden = !(S.view === 'catalog' && S.compare.length);
  bar.innerHTML = `<span>Сравнение: ${S.compare.length} из 4 · ${esc(catById(byId(S.compare[0])?.cat || S.cat).name)}</span><button class="btn primary sm" data-go="compare">Сравнить</button>`;
  if (VG.items) vgUpdate(true);
  hydrateSoon();
  if (S.view === 'compare') scale3d();
}
function go(view) { S.view = view; if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view); render(); window.scrollTo(0, 0); }

// ---------- События ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-open], [data-go], a, h1'); if (!t) return;
  const d = t.dataset;
  if (d.close !== undefined) closeSheet();
  if (d.recolor) { const p = byId(d.pid); S.detail.color = d.recolor; stageMode(S.detail.mode);
    document.querySelectorAll('.recolor button').forEach(b => b.classList.toggle('on', b === t)); $('.recolor-l').textContent = COLORS[d.recolor]?.[0] || ''; return; }
  if (d.v) { stageMode(d.v); return; }
  if (d.part) { S.detail.part = d.part; $('#partsbar').innerHTML = partsBar(byId(S.detail.id)); stageMode(S.detail.mode === 'dims' ? 'dims' : '3d', true); return; }
  if (d.star) { REVF.stars = +d.star; document.querySelectorAll('.starpick button').forEach(b => b.classList.toggle('on', +b.dataset.star <= REVF.stars)); return; }
  if (d.revedit) { REVF.open = true; REVF.stars = myReview(d.revedit)?.stars || 0; refreshReviews(); $('#revform textarea')?.focus(); return; }
  if (d.revdel) { deleteReview(d.revdel, d.uid); return; }
  if (d.revnew) { REVF.open = true; REVF.stars = 0; refreshReviews(); return; }
  if (d.revcancel !== undefined) { REVF.open = false; refreshReviews(); return; }
  if (d.fav) { e.stopPropagation(); toggleFav(d.fav); return; }
  if (d.cmp) { e.stopPropagation(); toggleCompare(d.cmp); return; }
  if (d.del) { S.custom = S.custom.filter(p => p.id !== d.del); S.compare = S.compare.filter(x => x !== d.del); S.favs.delete(d.del); save(); closeSheet(); render(); toast('Удалено'); return; }
  if (d.go) return go(d.go);
  if (d.open) return detail(d.open);
  if (d.cat) { setCat(d.cat); return render(); }
  if (d.pcat) { setCat(d.pcat); closeSheet(); return go('catalog'); }
  if (d.pprod) { const p = byId(d.pprod); setCat(p.cat); go('catalog'); return detail(p.id); }
  if (d.brand) { S.brands.has(d.brand) ? S.brands.delete(d.brand) : S.brands.add(d.brand); return render(); }
  if (d.color) { S.colors.has(d.color) ? S.colors.delete(d.color) : S.colors.add(d.color); return render(); }
  if (d.wcat) { S.wiz = { cat: d.wcat, step: 0, ans: [] }; render(); return window.scrollTo(0, 0); }
  if (d.opt !== undefined) {
    const w = S.wiz, st = wizSteps(w.cat)[w.step], i = +d.opt;
    if (st.multi) { const a = w.ans[w.step] || []; w.ans[w.step] = a.includes(i) ? a.filter(x => x !== i) : a.concat(i); }
    else { w.ans[w.step] = i; w.step++; }
    return render();
  }
  switch (t.id) {
    case 'theme': S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); return render();
    case 'pickcat': case 'pickcat2': return openPicker();
    case 'tf': S.showFilters = !S.showFilters; return render();
    case 'reset': S.brands.clear(); S.colors.clear(); S.sf = {}; S.maxPrice = null; return render();
    case 'clrcmp': S.compare = []; save(); return render();
    case 'addown': return addForm();
    case 'wback': if (S.wiz.step === 0) S.wiz = null; else S.wiz.step--; return render();
    case 'wnext': S.wiz.step++; render(); return window.scrollTo(0, 0);
    case 'wagain': S.wiz = null; return render();
    case 'wcmp': { const r = wizScore(); S.compare = r.list.map(x => x.p.id); save(); return go('compare'); }
    case 'sheetclose': return closeSheet();
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; render(); }
  if (t.id === 'pq') { $('#pbody').innerHTML = pickerBody(t.value); hydrateSoon(); }
  if (t.id === 'price') { S.maxPrice = +t.value >= +t.max ? null : +t.value; t.previousElementSibling.textContent = S.maxPrice ? rub(S.maxPrice) : 'любая'; }
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (t.id === 'price') render();
  if (t.id === 'sort') { S.sort = t.value; render(); }
  if (t.id === 'diff') { S.onlyDiff = t.checked; render(); }
  if (d.sf) { const f = S.sf[d.sf] = S.sf[d.sf] || {}; f[d.m] = t.type === 'checkbox' ? t.checked : t.value; render(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'revform') { e.preventDefault(); submitReview(e.target); return; }
  if (e.target.id !== 'ownf') return;
  e.preventDefault();
  const fd = new FormData(e.target), c = catById(S.cat), specs = {};
  c.specs.forEach(s => { const v = fd.get(s.k);
    specs[s.k] = s.t === 'b' ? (v ? 1 : 0) : s.t === 'c' ? fd.getAll('colors') : s.t === 'n' ? (v === '' || v === null ? null : +v) : (v || null); });
  S.custom.push({ id: 'own-' + Date.now(), cat: S.cat, brand: fd.get('brand').trim(), model: fd.get('model').trim(), price: +fd.get('price') || 0, rating: 0, specs, custom: true });
  save(); closeSheet(); render(); toast('Модель добавлена');
});
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

const VIEWS = ['catalog', 'wizard', 'compare', 'favs'];
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (VIEWS.includes(h)) { S.view = h; render(); } });
if (VIEWS.includes(location.hash.slice(1))) S.view = location.hash.slice(1);

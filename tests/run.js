// Автотесты ТехноПодбора: node tests/run.js [путь к index.html]
// Нужны: npm i playwright three@0.160.0 (three берётся локально вместо CDN), Chrome.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PAGE = path.resolve(process.argv[2] || path.join(__dirname, '../dist/index.html'));
const THREE_DIR = process.env.THREE_DIR || path.join(process.cwd(), 'node_modules/three/');
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const results = []; let failed = 0;
const ok = (name, cond, info = '') => { results.push(`${cond ? 'OK  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!cond) failed++; };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
  const errors = []; pg.on('pageerror', e => errors.push(e.message));
  await pg.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(THREE_DIR + r.request().url().match(/three@0\.160\.0\/(.*)/)[1]) }));
  await pg.route(/fonts\./, r => r.abort());
  await pg.goto('file://' + PAGE);
  await pg.waitForFunction(() => window.R3, null, { timeout: 30000 });
  ok('3D-модуль загрузился', true);

  // --- модульные проверки
  const u = await pg.evaluate(() => {
    const p = byId(inCat('fridge')[0].id);
    return {
      plural: [plural(1, 'отзыв', 'отзыва', 'отзывов'), plural(3, 'отзыв', 'отзыва', 'отзывов'), plural(11, 'отзыв', 'отзыва', 'отзывов'), plural(22, 'отзыв', 'отзыва', 'отзывов')],
      base: score(p),
      tot: totals([inCat('fridge')[0].id, inCat('fridge')[1].id, inCat('fridge')[2].id].map(byId), catById('fridge')).map(t => t.total),
      cats: CATEGORIES.length, prods: PRODUCTS.length, dataErr: DATA_ERRORS.length, radar: typeof radar,
    };
  });
  ok('Склонения', JSON.stringify(u.plural) === JSON.stringify(['1 отзыв', '3 отзыва', '11 отзывов', '22 отзыва']), u.plural.join(', '));
  ok('Сводный рейтинг без отзывов = рейтинг магазина', Math.abs(u.base.val - u.base.base) < 1e-9 && u.base.n === 0);
  ok('Итоговая оценка в пределах 0–100', u.tot.every(t => t >= 0 && t <= 100), u.tot.join(', '));
  ok('Данные без ошибок формата', u.dataErr === 0, `${u.cats} категорий, ${u.prods} моделей`);
  ok('Радар удалён', u.radar === 'undefined');

  // --- отзыв (локальный режим вне claude.ai) влияет на рейтинг
  await pg.evaluate(() => detail(inCat('fridge')[0].id)); await pg.waitForTimeout(1500);
  await pg.click('[data-revnew]'); await pg.click('[data-star="2"]'); await pg.fill('textarea[name=text]', 'Тест'); await pg.click('#revform button.primary'); await pg.waitForTimeout(500);
  const s2 = await pg.evaluate(() => score(byId(inCat('fridge')[0].id)));
  ok('Отзыв учитывается в рейтинге', s2.n === 1 && Math.abs(s2.val - (s2.base * 5 + 2) / 6) < 1e-9, `★ ${s2.val.toFixed(2)}`);
  ok('Кнопка «Изменить мой отзыв» после отзыва', await pg.locator('[data-revedit]').count() === 1);

  // --- 3D-осмотр и размеры
  ok('3D-осмотр: canvas в карточке', await pg.locator('#r3live canvas').count() === 1);
  await pg.click('[data-v="dims"]'); await pg.waitForTimeout(4000);
  ok('Размеры: 3D с размерными линиями', await pg.evaluate(() => { const l = R3.live(); return !!(l && l.dims); }));
  await pg.screenshot({ path: path.join(SHOTS, 'размеры.png'), clip: { x: 0, y: 0, width: 420, height: 470 } });
  await pg.click('[data-v="3d"]'); await pg.waitForTimeout(2500);
  ok('Возврат из размеров в 3D', await pg.evaluate(() => { const l = R3.live(); return !!(l && !l.dims); }));
  await pg.evaluate(() => closeSheet());
  ok('Закрытие карточки освобождает WebGL', await pg.evaluate(() => !R3.live()));

  // --- комплект: кондиционер (внутренний + наружный блок), робот-пылесос (база)
  await pg.evaluate(() => detail(inCat('aircon')[0].id)); await pg.waitForTimeout(3000);
  const parts = await pg.evaluate(() => [...document.querySelectorAll('#partsbar [data-part]')].map(b => b.textContent));
  ok('Кондиционер: переключатель блоков', parts.join('|') === 'Внутренний блок|Наружный блок|Весь комплект', parts.join(' | '));
  await pg.click('[data-part="out"]'); await pg.waitForTimeout(3500);
  ok('Наружный блок в 3D', await pg.evaluate(() => R3.live() && R3.live().part === 'out'));
  const capWant = await pg.evaluate(() => { const s = inCat('aircon')[0].specs; return `Наружный блок · ${num(s.ow)}×${num(s.oh)}×${num(s.od)} см`; });
  ok('Подпись размеров наружного блока', (await pg.textContent('.parts-cap')).includes(capWant), await pg.textContent('.parts-cap'));
  await pg.click('[data-v="dims"]'); await pg.waitForTimeout(3500);
  ok('Размеры наружного блока', await pg.evaluate(() => R3.live() && R3.live().part === 'out' && R3.live().dims));
  await pg.screenshot({ path: path.join(SHOTS, 'кондиционер_наружный_размеры.png'), clip: { x: 0, y: 0, width: 420, height: 560 } });
  await pg.click('[data-part="all"]'); await pg.waitForTimeout(4000);
  ok('Весь комплект с размерами', await pg.evaluate(() => R3.live() && R3.live().part === 'all' && R3.live().dims));
  await pg.screenshot({ path: path.join(SHOTS, 'кондиционер_комплект.png'), clip: { x: 0, y: 0, width: 420, height: 560 } });
  await pg.click('[data-v="3d"]'); await pg.click('[data-part="main"]'); await pg.waitForTimeout(3000);
  ok('Обратно на внутренний блок', await pg.evaluate(() => R3.live() && R3.live().part === 'main' && !R3.live().dims));
  ok('Комплект в характеристиках', (await pg.evaluate(() => document.body.innerText)).includes('КОМПЛЕКТ'));
  const single = await pg.evaluate(() => { closeSheet(); detail(inCat('fridge')[0].id); return document.querySelectorAll('#partsbar [data-part]').length; });
  ok('У одиночного товара переключателя нет', single === 0);
  const kits = await pg.evaluate(() => PRODUCTS.filter(p => partsOf(p).length > 1).length);
  ok('Товаров с комплектом', kits > 10, String(kits));
  await pg.evaluate(() => closeSheet());

  // --- сравнение
  await pg.evaluate(() => { S.compare = [inCat('washer')[0].id, inCat('washer')[1].id, inCat('washer')[2].id]; go('compare'); }); await pg.waitForTimeout(500);
  const cmp = await pg.evaluate(() => ({ foot: document.querySelector('.cmp tfoot th').textContent, rows: [...document.querySelectorAll('.cmp tbody th')].map(t => t.textContent) }));
  ok('Сравнение: итоговая оценка', cmp.foot === 'Итоговая оценка');
  ok('Сравнение: строки рейтинга и отзывов', ['Рейтинг магазина', 'Отзывы пользователей', 'Сводный рейтинг'].every(r => cmp.rows.includes(r)));
  ok('Сравнение: глубина в таблице', cmp.rows.some(r => r.startsWith('Глубина')));

  // --- виртуализация: 3000 моделей в одной категории
  await pg.evaluate(() => {
    const src = inCat('kettle');
    for (let i = 0; i < 3000; i++) { const p = src[i % src.length]; PRODUCTS.push({ ...p, feed: false, source: null, real: false, id: 'kettle-t' + i, model: 'Тест ' + String(i).padStart(4, '0'), price: 1000 + i, rating: 4 + (i % 10) / 10 }); }
    setCat('kettle'); S.sort = 'cheap'; go('catalog');
  });
  await pg.waitForTimeout(800);
  const v1 = await pg.evaluate(() => ({ cards: document.querySelectorAll('#vgrid .card').length, total: +document.querySelector('#vgrid').dataset.n, h: document.querySelector('#vgrid').offsetHeight, rowH: VG.rowH }));
  ok('Виртуализация включилась', v1.total > 3000 && v1.cards > 0 && v1.cards < 60, `в DOM ${v1.cards} из ${v1.total}`);
  ok('Высота списка соответствует всем строкам', Math.abs(v1.h - Math.ceil(v1.total / 2) * v1.rowH) < v1.rowH * 2, `${v1.h}px, строка ${v1.rowH}px`);
  const t0 = Date.now();
  await pg.evaluate(() => { const el = document.querySelector('#vgrid'); scrollTo(0, el.getBoundingClientRect().top + scrollY + el.offsetHeight / 2); });
  await pg.waitForTimeout(400);
  const v2 = await pg.evaluate(() => { const vis = [...document.querySelectorAll('#vgrid .card')].filter(c => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }); return { cards: document.querySelectorAll('#vgrid .card').length, first: vis[0] && vis[0].querySelector('.model').textContent, n: vis.length }; });
  ok('Прокрутка в середину показывает середину списка', v2.n > 0 && /Тест 1[45]\d\d/.test(v2.first || ''), `видно: ${v2.first}, в DOM ${v2.cards}, ${Date.now() - t0} мс`);
  await pg.screenshot({ path: path.join(SHOTS, 'виртуализация_середина.png') });
  await pg.evaluate(() => scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(400);
  const v3 = await pg.evaluate(() => [[...document.querySelectorAll('#vgrid .card .model')].map(m => m.textContent).slice(-1)[0], filtered().slice(-1)[0].model]);
  ok('Конец списка достижим', v3[0] === v3[1], v3[0]);
  await pg.fill('#q', 'Тест 01'); await pg.waitForTimeout(400);
  const v4 = await pg.evaluate(() => document.querySelectorAll('.grid .card').length);
  ok('Поиск по виртуальному списку', v4 > 0 && v4 <= 120, `${v4} карточек`);

  // --- v7: модули, данные из data.json, слой API
  const m = await pg.evaluate(() => ({
    mods: [typeof ICON, typeof parseCatalog, typeof API, typeof render, typeof illo].join(','),
    inline: !!document.getElementById('tp-catalog') && CATALOG.format, base: API.base,
    demo: byId(inCat('fridge')[0].id).demo,
  }));
  ok('Модули загружены по отдельности', !/undefined/.test(m.mods), m.mods);
  ok('Каталог взят из встроенного data.json', m.inline === 'tehnopodbor-catalog/1');
  ok('Под file:// сеть не используется', m.base === null);
  const ap = await pg.evaluate(() => { applyPrices({ updated: '2026-11-15T06:00:00Z', sources: ['test'], items: { [inCat('fridge')[0].id]: { price: 77777, shop: 'Тест-маркет', url: 'https://example.com/x', at: '2026-11-15' } } }); render(); detail(inCat('fridge')[0].id); const p = byId(inCat('fridge')[0].id); return { price: p.price, demo: p.demo, sheet: document.body.innerText.includes('Тест-маркет') }; });
  await pg.waitForTimeout(600);
  ok('Цена магазина применяется', ap.price === 77777 && ap.demo === false && ap.sheet, `${ap.price} ₽, демо: ${ap.demo}`);
  ok('Кнопка «Открыть в магазине»', await pg.evaluate(() => [...document.querySelectorAll('a')].some(a => /Открыть в магазине/.test(a.textContent) && a.href === 'https://example.com/x')));

  // --- v7: живое обновление цен по HTTP (как на GitHub Pages)
  const pg2 = await b.newPage();
  await pg2.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(THREE_DIR + r.request().url().match(/three@0\.160\.0\/(.*)/)[1]) }));
  await pg2.route(/fonts\./, r => r.abort());
  const DIST = path.dirname(PAGE);
  await pg2.route(/^http:\/\/tp\.test\//, r => {
    const u = new URL(r.request().url()).pathname;
    if (u === '/data/prices.json') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated: '2030-01-01T00:00:00Z', sources: ['ci'], items: { 'kettle-0': { price: 12345, shop: 'CI-шоп' } } }) });
    const f = path.join(DIST, u === '/' ? 'index.html' : u);
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: f.endsWith('.json') ? 'application/json' : 'text/html', body: fs.readFileSync(f) }) : r.fulfill({ status: 404 });
  });
  const err2 = []; pg2.on('pageerror', e => err2.push(e.message));
  await pg2.goto('http://tp.test/'); await pg2.waitForTimeout(2500);
  const live = await pg2.evaluate(() => ({ base: API.base, price: byId('kettle-0') && byId('kettle-0').price, st: API.state.prices }));
  ok('По HTTP цены подтягиваются из data/prices.json', live.price === 12345, `${live.base} → ${live.price} ₽ (${live.st})`);
  ok('Без ошибок JavaScript на HTTP-версии', err2.length === 0, err2.slice(0, 2).join(' | '));
  await pg2.close();

  // --- этап 2: реальные модели
  const rm = await pg.evaluate(() => { const R = PRODUCTS.filter(p => p.real && !p.feed); const cats = [...new Set(R.map(p => p.cat))]; const p = R.find(x => x.cat === 'aircon');
    closeSheet(); applyPrices(readInline('tp-prices')); detail(p.id); const txt = document.body.innerText;
    return { n: R.length, cats: cats.join(','), urls: R.every(x => /^https:/.test(x.source.url)), ids: new Set(R.map(x => x.id)).size === R.length,
      noDemo: R.every(x => !x.demo), priced: R.filter(x => x.offer).length, src: /Реальная модель/.test(txt) && /Ситилинк/.test(txt),
      link: [...document.querySelectorAll('a')].some(a => a.href === p.source.url) }; });
  ok('Реальные модели в 5 категориях', rm.n >= 25 && rm.cats.split(',').length === 5, `${rm.n} моделей: ${rm.cats}`);
  ok('У каждой реальной модели — ссылка на источник и свой ID', rm.urls && rm.ids);
  ok('Реальные модели не помечены как демо, у всех цена магазина', rm.noDemo && rm.priced === rm.n, `${rm.priced} из ${rm.n}`);
  ok('В карточке указан источник и есть ссылка на магазин', rm.src && rm.link);

  // --- витрина магазинов (фиды)
  const fd = await pg.evaluate(() => { const F = PRODUCTS.filter(p => p.feed); if (!F.length) return { n: 0 };
    const p = F[0]; closeSheet(); detail(p.id); const txt = document.body.innerText;
    return { n: F.length, priced: F.every(x => x.price > 0 && /^https:/.test(x.source.url)), noRating: F.every(x => !x.rating),
      box: F.every(x => x.box && x.box.w > 0 && x.box.h > 0), note: /Магазин не передаёт характеристики/.test(txt) && /типичные для категории/.test(txt),
      link: [...document.querySelectorAll('a')].some(a => a.href === p.source.url), dims: !/\d+×\d+ см/.test(document.querySelector('.ptitle').innerText) }; });
  if (fd.n) {
    ok('Витрина: у товаров из фидов цена и ссылка магазина', fd.priced, `${fd.n} товаров`);
    ok('Витрина: рейтинг не выдумывается, 3D — типичный размер категории', fd.noRating && fd.box);
    ok('Витрина: в карточке честная пометка и ссылка, без выдуманных габаритов', fd.note && fd.link && fd.dims);
  }
  ok('Без ошибок JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(results.join('\n')); console.log(`\nИтого: ${results.length - failed} из ${results.length} пройдено`);
  await b.close(); process.exit(failed ? 1 : 0);
})();

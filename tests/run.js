// Автотесты ТехноПодбора: node tests/run.js [путь к index.html]
// Нужны: npm i playwright three@0.160.0 (three берётся локально вместо CDN), Chrome.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PAGE = path.resolve(process.argv[2] || path.join(__dirname, '../index.html'));
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
    const p = byId('fridge-0');
    return {
      plural: [plural(1, 'отзыв', 'отзыва', 'отзывов'), plural(3, 'отзыв', 'отзыва', 'отзывов'), plural(11, 'отзыв', 'отзыва', 'отзывов'), plural(22, 'отзыв', 'отзыва', 'отзывов')],
      base: score(p),
      tot: totals(['fridge-0', 'fridge-1', 'fridge-2'].map(byId), catById('fridge')).map(t => t.total),
      cats: CATEGORIES.length, prods: PRODUCTS.length, dataErr: DATA_ERRORS.length, radar: typeof radar,
    };
  });
  ok('Склонения', JSON.stringify(u.plural) === JSON.stringify(['1 отзыв', '3 отзыва', '11 отзывов', '22 отзыва']), u.plural.join(', '));
  ok('Сводный рейтинг без отзывов = рейтинг магазина', Math.abs(u.base.val - u.base.base) < 1e-9 && u.base.n === 0);
  ok('Итоговая оценка в пределах 0–100', u.tot.every(t => t >= 0 && t <= 100), u.tot.join(', '));
  ok('Данные без ошибок формата', u.dataErr === 0, `${u.cats} категорий, ${u.prods} моделей`);
  ok('Радар удалён', u.radar === 'undefined');

  // --- отзыв (локальный режим вне claude.ai) влияет на рейтинг
  await pg.evaluate(() => detail('fridge-0')); await pg.waitForTimeout(1500);
  await pg.click('[data-revnew]'); await pg.click('[data-star="2"]'); await pg.fill('textarea[name=text]', 'Тест'); await pg.click('#revform button.primary'); await pg.waitForTimeout(500);
  const s2 = await pg.evaluate(() => score(byId('fridge-0')));
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
  await pg.evaluate(() => detail('aircon-0')); await pg.waitForTimeout(3000);
  const parts = await pg.evaluate(() => [...document.querySelectorAll('#partsbar [data-part]')].map(b => b.textContent));
  ok('Кондиционер: переключатель блоков', parts.join('|') === 'Внутренний блок|Наружный блок|Весь комплект', parts.join(' | '));
  await pg.click('[data-part="out"]'); await pg.waitForTimeout(3500);
  ok('Наружный блок в 3D', await pg.evaluate(() => R3.live() && R3.live().part === 'out'));
  ok('Подпись размеров наружного блока', /Наружный блок · 76,5×55×28,5 см/.test(await pg.textContent('.parts-cap')), await pg.textContent('.parts-cap'));
  await pg.click('[data-v="dims"]'); await pg.waitForTimeout(3500);
  ok('Размеры наружного блока', await pg.evaluate(() => R3.live() && R3.live().part === 'out' && R3.live().dims));
  await pg.screenshot({ path: path.join(SHOTS, 'кондиционер_наружный_размеры.png'), clip: { x: 0, y: 0, width: 420, height: 560 } });
  await pg.click('[data-part="all"]'); await pg.waitForTimeout(4000);
  ok('Весь комплект с размерами', await pg.evaluate(() => R3.live() && R3.live().part === 'all' && R3.live().dims));
  await pg.screenshot({ path: path.join(SHOTS, 'кондиционер_комплект.png'), clip: { x: 0, y: 0, width: 420, height: 560 } });
  await pg.click('[data-v="3d"]'); await pg.click('[data-part="main"]'); await pg.waitForTimeout(3000);
  ok('Обратно на внутренний блок', await pg.evaluate(() => R3.live() && R3.live().part === 'main' && !R3.live().dims));
  ok('Комплект в характеристиках', (await pg.evaluate(() => document.body.innerText)).includes('КОМПЛЕКТ'));
  const single = await pg.evaluate(() => { closeSheet(); detail('fridge-0'); return document.querySelectorAll('#partsbar [data-part]').length; });
  ok('У одиночного товара переключателя нет', single === 0);
  const kits = await pg.evaluate(() => PRODUCTS.filter(p => partsOf(p).length > 1).length);
  ok('Товаров с комплектом', kits > 10, String(kits));
  await pg.evaluate(() => closeSheet());

  // --- сравнение
  await pg.evaluate(() => { S.compare = ['washer-0', 'washer-1', 'washer-2']; go('compare'); }); await pg.waitForTimeout(500);
  const cmp = await pg.evaluate(() => ({ foot: document.querySelector('.cmp tfoot th').textContent, rows: [...document.querySelectorAll('.cmp tbody th')].map(t => t.textContent) }));
  ok('Сравнение: итоговая оценка', cmp.foot === 'Итоговая оценка');
  ok('Сравнение: строки рейтинга и отзывов', ['Рейтинг магазина', 'Отзывы пользователей', 'Сводный рейтинг'].every(r => cmp.rows.includes(r)));
  ok('Сравнение: глубина в таблице', cmp.rows.some(r => r.startsWith('Глубина')));

  // --- виртуализация: 3000 моделей в одной категории
  await pg.evaluate(() => {
    const src = inCat('kettle');
    for (let i = 0; i < 3000; i++) { const p = src[i % src.length]; PRODUCTS.push({ ...p, id: 'kettle-t' + i, model: 'Тест ' + String(i).padStart(4, '0'), price: 1000 + i, rating: 4 + (i % 10) / 10 }); }
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

  ok('Без ошибок JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(results.join('\n')); console.log(`\nИтого: ${results.length - failed} из ${results.length} пройдено`);
  await b.close(); process.exit(failed ? 1 : 0);
})();

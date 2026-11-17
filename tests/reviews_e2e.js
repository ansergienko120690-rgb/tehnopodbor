// Сквозной тест отзывов на сайте: приложение (dist) + настоящий код сервера отзывов (хранилище в памяти)
// + подменённый Яндекс ID. Сеть не нужна. Запуск: node tests/reviews_e2e.js [dist/index.html]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PAGE = path.resolve(process.argv[2] || path.join(__dirname, '../dist/index.html'));
const DIST = path.dirname(PAGE);
const THREE_DIR = process.env.THREE_DIR || path.join(process.cwd(), 'node_modules/three/');
process.env.ADMIN_IDS = '100';
const SRV = require('../server/reviews/index.js');
SRV.setStore(require('../server/reviews/store_mem.js').open());
const USERS = { tokAAAAAAAAAAAA: { id: '1', display_name: 'Анна' }, tokBBBBBBBBBBBB: { id: '2', display_name: 'Борис' }, tokADMINADMINAD: { id: '100', display_name: 'Модератор' } };
const fakeYa = async (u, o) => { const x = USERS[o.headers.Authorization.slice(6)]; return { ok: !!x, json: async () => x }; };
const CFG = { reviews: { api: 'http://api.test/fn', yandexClientId: 'test-client' } };
let LOGIN_AS = 'tokAAAAAAAAAAAA';

const results = []; let failed = 0;
const ok = (name, cond, info = '') => { results.push(`${cond ? 'OK  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!cond) failed++; };

async function wire(ctx) {
  await ctx.route(/fonts\./, r => r.abort());
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(THREE_DIR + r.request().url().match(/three@0\.160\.0\/(.*)/)[1]) }));
  await ctx.route(/^https:\/\/oauth\.yandex\.ru\/authorize/, r => {
    const u = new URL(r.request().url());
    return r.fulfill({ status: 302, headers: { Location: u.searchParams.get('redirect_uri') + '#access_token=' + LOGIN_AS + '&token_type=bearer' } });
  });
  await ctx.route(/^http:\/\/api\.test\//, async r => {
    const q = r.request(), u = new URL(q.url());
    const res = await SRV.handler({ httpMethod: q.method(), queryStringParameters: Object.fromEntries(u.searchParams), headers: { ...q.headers(), Authorization: q.headers().authorization }, body: q.postData() || '' }, {}, { fetch: fakeYa });
    return r.fulfill({ status: res.statusCode, headers: res.headers, body: res.body });
  });
  await ctx.route(/^http:\/\/tp\.test\//, r => {
    const u = new URL(r.request().url()).pathname, f = path.join(DIST, u === '/' ? 'index.html' : u);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404 });
    let body = fs.readFileSync(f);
    if (/\.html$/.test(f)) body = String(body).replace(/<script type="application\/json" id="tp-config">[^<]*<\/script>/, `<script type="application/json" id="tp-config">${JSON.stringify(CFG)}</script>`);
    return r.fulfill({ status: 200, contentType: f.endsWith('.js') ? 'application/javascript' : f.endsWith('.json') ? 'application/json' : 'text/html', body });
  });
}
const openCard = async (pg, pid) => { await pg.evaluate(id => detail(id), pid); await pg.waitForSelector('#revs'); };
const revText = pg => pg.$eval('#revs', e => e.innerText);
async function writeReview(pg, stars, text) {
  await pg.click('#revs [data-revnew], #revs [data-revedit]');
  await pg.click(`#revform [data-star="${stars}"]`);
  await pg.fill('#revform textarea[name="text"]', text);
  await pg.click('#revform button.primary');
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctxA = await b.newContext({ viewport: { width: 420, height: 860 } }); await wire(ctxA);
  const pg = await ctxA.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://tp.test/'); await pg.waitForFunction(() => typeof RV === 'object' && RV.state === 'live', null, { timeout: 15000 });
  const [p1, p2] = await pg.evaluate(() => PRODUCTS.filter(p => p.cat === 'tv').slice(0, 2).map(p => p.id));
  ok('Сайт работает с сервером отзывов', await pg.evaluate(() => RV.mode) === 'server');

  await openCard(pg, p1);
  ok('Без входа — кнопка «Войти через Яндекс ID»', /Войти через Яндекс ID/i.test(await revText(pg)));
  await pg.click('[data-yalogin]');
  await pg.waitForFunction(() => RV.uid === 'ya:1', null, { timeout: 10000 }).catch(() => {});
  ok('Вход через Яндекс ID (всплывающее окно)', /Вы вошли как Анна/.test(await revText(pg)), (await revText(pg)).slice(-80));

  await writeReview(pg, 5, 'Отличная картинка, звук нормальный');
  await pg.waitForFunction(() => !!(RV.all['ya:1'] || {})[PRODUCTS.find(p => p.cat === 'tv').id], null, { timeout: 10000 }).catch(() => {});
  let t = await revText(pg);
  ok('Чистый отзыв публикуется сразу и подписан именем', /Анна/.test(t) && /Отличная картинка/.test(t) && !/на проверке/.test(t));
  ok('Сводный рейтинг учитывает отзыв', await pg.evaluate(id => score(byId(id)).n, p1) === 1);

  await openCard(pg, p2);
  await writeReview(pg, 2, 'Дешевле на ozon.ru, звоните 8 921 123 45 67');
  await pg.waitForFunction(() => Object.keys(RV.status).length > 0, null, { timeout: 10000 }).catch(() => {});
  ok('Отзыв со ссылкой — «на проверке», виден только автору', /на проверке, видите только вы/.test(await revText(pg)));

  // второй пользователь
  const ctxB = await b.newContext({ viewport: { width: 420, height: 860 } }); await wire(ctxB);
  await ctxB.addInitScript(() => localStorage.setItem('tp_ya_token', JSON.stringify('tokBBBBBBBBBBBB')));
  const pb = await ctxB.newPage(); pb.on('pageerror', e => errs.push(e.message));
  await pb.goto('http://tp.test/'); await pb.waitForFunction(() => RV.state === 'live' && RV.uid === 'ya:2', null, { timeout: 15000 });
  await openCard(pb, p1);
  t = await revText(pb);
  ok('Другой пользователь видит опубликованный отзыв', /Анна/.test(t) && /Отличная картинка/.test(t));
  ok('…и может пожаловаться, но не удалить', /Пожаловаться/.test(t) && !/Удалить/.test(t));
  await openCard(pb, p2);
  ok('Отзыв на проверке другим не виден', !/ozon/.test(await revText(pb)));
  await openCard(pb, p1); await pb.click('[data-revrep]'); await pb.waitForTimeout(500);
  ok('Жалоба отправлена', /Жалоба отправлена/.test(await pb.evaluate(() => document.body.innerText)));

  // модератор
  const ctxM = await b.newContext(); await wire(ctxM);
  await ctxM.addInitScript(() => localStorage.setItem('tp_ya_token', JSON.stringify('tokADMINADMINAD')));
  const pm = await ctxM.newPage(); pm.on('pageerror', e => errs.push(e.message));
  await pm.goto('http://tp.test/moderation.html'); await pm.waitForSelector('.r', { timeout: 10000 }).catch(() => {});
  const mt = await pm.evaluate(() => document.body.innerText);
  ok('Страница модерации: отзыв на проверке с причиной', /ozon/.test(mt) && /Причина: ссылка, контакты/.test(mt), mt.slice(0, 120));
  ok('…и отзыв с жалобой', /жалоб: 1/.test(mt));

  await pm.click('.r:has-text("ozon") button.ok'); await pm.waitForTimeout(800);
  await pb.reload(); await pb.waitForFunction(() => RV.state === 'live', null, { timeout: 10000 }); await openCard(pb, p2);
  ok('После одобрения отзыв виден всем', /ozon/.test(await revText(pb)));
  const pu = await ctxB.newPage(); await pu.goto('http://tp.test/moderation.html'); await pu.waitForTimeout(1200);
  ok('Обычному пользователю модерация недоступна', /Нет доступа/.test(await pu.evaluate(() => document.body.innerText)));

  // выход
  await openCard(pg, p1); await pg.click('[data-yalogout]'); await pg.waitForTimeout(800);
  ok('Выход', /Войти через Яндекс ID/i.test(await revText(pg)) && await pg.evaluate(() => localStorage.getItem('tp_ya_token')) === 'null');
  ok('Без ошибок JavaScript', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(results.join('\n') + `\n\n${results.length - failed}/${results.length} проверок пройдено`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

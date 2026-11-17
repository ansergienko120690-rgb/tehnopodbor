// Автотесты сервера отзывов: node server/reviews/test.js (без сети и без YDB — хранилище в памяти)
'use strict';
const assert = require('assert');
process.env.ADMIN_IDS = '100';
const S = require('./index');
const { check } = require('./moderation');
S.setStore(require('./store_mem').open());

const USERS = { tokAAAAAAAAAAAA: { id: '1', display_name: 'Анна' }, tokBBBBBBBBBBBB: { id: '2', display_name: 'Борис' }, tokCCCCCCCCCCCC: { id: '3', login: 'vera' }, tokDDDDDDDDDDDD: { id: '4', display_name: 'Глеб' }, tokADMINADMINAD: { id: '100', display_name: 'Модератор' } };
const fakeFetch = async (url, o) => { const t = o.headers.Authorization.slice(6); const u = USERS[t]; return { ok: !!u, json: async () => u }; };
const call = async (method, a, body, tok) => {
  const r = await S.handler({ httpMethod: method, queryStringParameters: { a }, headers: tok ? { Authorization: 'OAuth ' + tok, Origin: 'https://x' } : {}, body: body ? JSON.stringify(body) : '' }, {}, { fetch: fakeFetch });
  return { code: r.statusCode, ...JSON.parse(r.body || '{}'), headers: r.headers };
};
let n = 0; const ok = (name, f) => f().then(() => { n++; console.log('✓', name); }).catch(e => { console.error('✗', name, e.message); process.exitCode = 1; });

(async () => {
  await ok('модерация: чистый отзыв публикуется, ссылки/контакты/мат — на проверку', async () => {
    assert.equal(check({ stars: 5, pros: 'Тихий, быстро сушит' }).status, 'ok');
    assert.equal(check({ stars: 5, text: 'Берите на shop.ru дешевле' }).status, 'pending');
    assert.equal(check({ stars: 5, text: 'купить тут магазин.рф' }).status, 'pending');
    assert.equal(check({ stars: 1, text: 'звоните +7 (921) 123-45-67' }).status, 'pending');
    assert.equal(check({ stars: 1, text: 'полная херня, а не бля техника' }).status, 'pending');
    assert.equal(check({ stars: 4, text: 'Употребляю ежедневно, сабля, корабль, хлебать' }).status, 'ok', 'обычные слова не должны ловиться');
    assert.ok(check({ stars: 0 }).error); assert.ok(check({ stars: 6 }).error); assert.ok(check({ stars: 2.5 }).error);
    assert.equal(check({ stars: 3, text: 'x'.repeat(5000) }).review.text.length, 1500);
  });
  await ok('без входа: список доступен, запись — 401', async () => {
    assert.equal((await call('GET', 'list')).code, 200);
    assert.equal((await call('POST', 'save', { pid: 'tv-1', stars: 5 })).code, 401);
    assert.equal((await call('POST', 'save', { pid: 'tv-1', stars: 5 }, 'tokWRONGWRONGW')).code, 401);
  });
  await ok('CORS: ответ на OPTIONS', async () => {
    const r = await S.handler({ httpMethod: 'OPTIONS', headers: { Origin: 'https://x' } }, {});
    assert.equal(r.statusCode, 204); assert.ok(r.headers['Access-Control-Allow-Origin']);
  });
  await ok('сохранение, правка, видимость в списке, имя из Яндекс ID', async () => {
    let r = await call('POST', 'save', { pid: 'tv-1', stars: 5, pros: 'Яркий экран', usage: 'До года' }, 'tokAAAAAAAAAAAA');
    assert.equal(r.code, 200); assert.equal(r.status, 'ok');
    r = await call('POST', 'save', { pid: 'tv-1', stars: 4, pros: 'Яркий экран', cons: 'Пульт неудобный' }, 'tokAAAAAAAAAAAA');
    const l = await call('GET', 'list');
    assert.equal(l.items.length, 1); assert.equal(l.items[0].stars, 4); assert.equal(l.items[0].name, 'Анна'); assert.equal(l.items[0].uid, 'ya:1');
    assert.equal(l.items[0].status, undefined, 'в публичном списке нет служебных полей');
    await call('POST', 'save', { pid: 'tv-1', stars: 3 }, 'tokCCCCCCCCCCCC');
    assert.equal((await call('GET', 'list')).items.find(x => x.uid === 'ya:3').name, 'vera');
  });
  await ok('неверные данные отклоняются', async () => {
    assert.equal((await call('POST', 'save', { pid: '../etc', stars: 5 }, 'tokAAAAAAAAAAAA')).code, 400);
    assert.equal((await call('POST', 'save', { pid: 'tv-1', stars: 9 }, 'tokAAAAAAAAAAAA')).code, 400);
    const r = await S.handler({ httpMethod: 'POST', queryStringParameters: { a: 'save' }, headers: { Authorization: 'OAuth tokAAAAAAAAAAAA' }, body: '{bad' }, {}, { fetch: fakeFetch });
    assert.equal(r.statusCode, 400);
  });
  await ok('отзыв со ссылкой не виден до проверки, автор видит его в «моих»', async () => {
    const r = await call('POST', 'save', { pid: 'tv-2', stars: 5, text: 'лучше на ozon.ru' }, 'tokBBBBBBBBBBBB');
    assert.equal(r.status, 'pending');
    assert.ok(!(await call('GET', 'list')).items.some(x => x.pid === 'tv-2'));
    const me = await call('GET', 'me', null, 'tokBBBBBBBBBBBB');
    assert.equal(me.items.find(x => x.pid === 'tv-2').status, 'pending'); assert.equal(me.admin, false);
  });
  await ok('модератор: очередь, публикация, отклонение; не-модератору — 403', async () => {
    assert.equal((await call('GET', 'queue', null, 'tokAAAAAAAAAAAA')).code, 403);
    assert.equal((await call('POST', 'mod', { pid: 'tv-2', uid: 'ya:2', ok: true }, 'tokAAAAAAAAAAAA')).code, 403);
    const q = await call('GET', 'queue', null, 'tokADMINADMINAD');
    assert.equal(q.items.length, 1); assert.equal(q.items[0].reason, 'ссылка');
    await call('POST', 'mod', { pid: 'tv-2', uid: 'ya:2', ok: true }, 'tokADMINADMINAD');
    assert.ok((await call('GET', 'list')).items.some(x => x.pid === 'tv-2'));
    await call('POST', 'mod', { pid: 'tv-2', uid: 'ya:2', ok: false }, 'tokADMINADMINAD');
    assert.ok(!(await call('GET', 'list')).items.some(x => x.pid === 'tv-2'));
    const again = await call('POST', 'save', { pid: 'tv-2', stars: 5, text: 'Нормальный' }, 'tokBBBBBBBBBBBB');
    assert.equal(again.status, 'pending', 'правка отклонённого — снова через модератора');
  });
  await ok('жалобы: повтор от того же человека не считается, 3 разных — скрывают', async () => {
    await call('POST', 'report', { pid: 'tv-1', uid: 'ya:1' }, 'tokBBBBBBBBBBBB');
    await call('POST', 'report', { pid: 'tv-1', uid: 'ya:1' }, 'tokBBBBBBBBBBBB');
    await call('POST', 'report', { pid: 'tv-1', uid: 'ya:1' }, 'tokAAAAAAAAAAAA'); // на себя — не считается
    assert.ok((await call('GET', 'list')).items.some(x => x.uid === 'ya:1'));
    await call('POST', 'report', { pid: 'tv-1', uid: 'ya:1' }, 'tokCCCCCCCCCCCC');
    await call('POST', 'report', { pid: 'tv-1', uid: 'ya:1' }, 'tokDDDDDDDDDDDD');
    assert.ok(!(await call('GET', 'list')).items.some(x => x.uid === 'ya:1'), 'скрыт после 3 жалоб');
    const q = await call('GET', 'queue', null, 'tokADMINADMINAD');
    assert.ok(q.items.some(x => x.uid === 'ya:1' && /жалобы/.test(x.reason)));
  });
  await ok('удаление: своё — да, чужое — нет, модератор — любое', async () => {
    assert.equal((await call('POST', 'del', { pid: 'tv-1', uid: 'ya:3' }, 'tokAAAAAAAAAAAA')).code, 403);
    assert.equal((await call('POST', 'del', { pid: 'tv-1' }, 'tokCCCCCCCCCCCC')).code, 200);
    assert.ok(!(await call('GET', 'list')).items.some(x => x.uid === 'ya:3'));
    assert.equal((await call('POST', 'del', { pid: 'tv-1', uid: 'ya:1' }, 'tokADMINADMINAD')).code, 200);
    assert.equal((await call('GET', 'me', null, 'tokAAAAAAAAAAAA')).items.length, 0);
  });
  await ok('лимит: не больше 30 отзывов в сутки', async () => {
    for (let i = 0; i < 30; i++) await call('POST', 'save', { pid: 'm-' + i, stars: 4 }, 'tokDDDDDDDDDDDD');
    assert.equal((await call('POST', 'save', { pid: 'm-31', stars: 4 }, 'tokDDDDDDDDDDDD')).code, 429);
  });
  await ok('неизвестное действие и неверный метод', async () => {
    assert.equal((await call('GET', 'zzz', null, 'tokAAAAAAAAAAAA')).code, 404);
    assert.equal((await call('GET', 'save', null, 'tokAAAAAAAAAAAA')).code, 405);
  });
  console.log(`\n${n} тестов пройдено`);
})();

// ТехноПодбор — сервер отзывов. Функция Yandex Cloud Functions (Node.js 22), база YDB serverless.
// Вызов: https://functions.yandexcloud.net/<id функции>?a=<действие>
//   GET  a=list            — опубликованные отзывы (без входа)
//   GET  a=me              — кто я, мои отзывы (в т.ч. на проверке), модератор ли я         [вход]
//   POST a=save            — {pid, stars, usage, pros, cons, text} — создать/изменить свой отзыв [вход]
//   POST a=del             — {pid[, uid]} — удалить свой (модератор — любой)                  [вход]
//   POST a=report          — {pid, uid} — пожаловаться; 3 жалобы скрывают отзыв до проверки   [вход]
//   GET  a=queue           — отзывы на проверке и с жалобами                                   [модератор]
//   POST a=mod             — {pid, uid, ok} — опубликовать или отклонить                       [модератор]
// Вход: заголовок «Authorization: OAuth <токен Яндекс ID>». Сервер проверяет токен в login.yandex.ru
// и хранит только id пользователя Яндекса и его публичное имя (display_name).
// Переменные окружения: YDB_ENDPOINT, YDB_DATABASE, ADMIN_IDS (id модераторов через запятую), ALLOW_ORIGIN.
'use strict';

const { check } = require('./moderation');

const PID = /^[\w.\-а-яё]{1,120}$/i;
const DAY_LIMIT = 30;           // не больше 30 сохранений отзывов в сутки от одного человека
const REPORTS_TO_HIDE = 3;
const LIST_TTL = 30 * 1000;     // список отзывов кэшируется в памяти функции на 30 с

let store = null;               // подставляется при первом вызове (YDB) или в тестах (память)
const setStore = s => { store = s; listCache = null; };
let listCache = null;
const tokenCache = new Map();   // токен → пользователь, 10 минут

async function yandexUser(token, fetchImpl = fetch) {
  const hit = tokenCache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const r = await fetchImpl('https://login.yandex.ru/info?format=json', { headers: { Authorization: 'OAuth ' + token } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || !j.id) return null;
  const user = { uid: 'ya:' + j.id, name: String(j.display_name || j.login || 'Пользователь').slice(0, 60) };
  if (tokenCache.size > 5000) tokenCache.clear();
  tokenCache.set(token, { user, until: Date.now() + 10 * 60 * 1000 });
  return user;
}

const admins = () => String(process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean).map(s => s.startsWith('ya:') ? s : 'ya:' + s);

function cors(origin) {
  const allow = String(process.env.ALLOW_ORIGIN || '*').split(',').map(s => s.trim());
  const o = allow.includes('*') ? '*' : allow.includes(origin) ? origin : allow[0];
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const reply = (code, data, h) => ({ statusCode: code, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h }, body: JSON.stringify(data) });

const pub = r => ({ pid: r.pid, uid: r.uid, name: r.name, stars: r.stars, usage: r.usage, pros: r.pros, cons: r.cons, text: r.text, at: r.at });

async function handler(event, context, deps = {}) {
  const h = cors((event.headers && (event.headers.Origin || event.headers.origin)) || '');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: h, body: '' };
  try {
    if (!store) setStore(await require('./store_ydb').open());
    const q = event.queryStringParameters || {};
    const a = q.a || '';
    let body = {};
    if (event.httpMethod === 'POST' && event.body) {
      const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
      if (raw.length > 20000) return reply(413, { error: 'Слишком большой запрос' }, h);
      try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Неверный формат' }, h); }
    }

    if (a === 'list' && event.httpMethod === 'GET') {
      if (!listCache || listCache.until < Date.now()) listCache = { until: Date.now() + LIST_TTL, items: (await store.published()).map(pub) };
      return reply(200, { items: listCache.items, at: Date.now() }, { ...h, 'Cache-Control': 'public, max-age=30' });
    }

    const auth = (event.headers && (event.headers.Authorization || event.headers.authorization)) || '';
    const m = /^OAuth\s+([\w.\-]{10,400})$/.exec(auth);
    const user = m ? await yandexUser(m[1], deps.fetch) : null;
    if (!user) return reply(401, { error: 'Нужно войти через Яндекс ID' }, h);
    const isAdmin = admins().includes(user.uid);
    const need = method => { if (event.httpMethod !== method) throw Object.assign(new Error('Метод не поддерживается'), { code: 405 }); };

    switch (a) {
      case 'me': {
        need('GET');
        const mine = await store.byUser(user.uid);
        return reply(200, { uid: user.uid, name: user.name, admin: isAdmin, items: mine.map(r => ({ ...pub(r), status: r.status })) }, h);
      }
      case 'save': {
        need('POST');
        if (!PID.test(String(body.pid || ''))) return reply(400, { error: 'Неизвестная модель' }, h);
        const c = check(body);
        if (c.error) return reply(400, { error: c.error }, h);
        if (await store.countSince(user.uid, Date.now() - 24 * 3600 * 1000) >= DAY_LIMIT) return reply(429, { error: 'Слишком много отзывов за сутки, попробуйте завтра' }, h);
        const old = await store.get(body.pid, user.uid);
        // отклонённый или скрытый по жалобам отзыв после правки снова идёт через модератора
        if (old && (old.status === 'rejected' || old.reports >= REPORTS_TO_HIDE) && c.status === 'ok') { c.status = 'pending'; c.reason = 'правка после ' + (old.status === 'rejected' ? 'отклонения' : 'жалоб'); }
        const rec = { pid: body.pid, uid: user.uid, name: user.name, ...c.review, at: Date.now(), status: c.status, reason: c.reason, reports: old ? old.reports : 0 };
        await store.put(rec);
        listCache = null;
        return reply(200, { ok: true, status: c.status, reason: c.reason }, h);
      }
      case 'del': {
        need('POST');
        const uid = body.uid && body.uid !== user.uid ? (isAdmin ? String(body.uid) : null) : user.uid;
        if (!uid) return reply(403, { error: 'Можно удалить только свой отзыв' }, h);
        await store.remove(String(body.pid || ''), uid);
        listCache = null;
        return reply(200, { ok: true }, h);
      }
      case 'report': {
        need('POST');
        const n = await store.report(String(body.pid || ''), String(body.uid || ''), user.uid);
        if (n >= REPORTS_TO_HIDE) { await store.setStatus(String(body.pid), String(body.uid), 'pending', 'жалобы: ' + n); listCache = null; }
        return reply(200, { ok: true }, h);
      }
      case 'queue': {
        need('GET');
        if (!isAdmin) return reply(403, { error: 'Только для модераторов' }, h);
        return reply(200, { items: (await store.queue()).map(r => ({ ...pub(r), status: r.status, reason: r.reason, reports: r.reports })) }, h);
      }
      case 'mod': {
        need('POST');
        if (!isAdmin) return reply(403, { error: 'Только для модераторов' }, h);
        if (body.ok) await store.setStatus(String(body.pid), String(body.uid), 'ok', 'проверен модератором', true);
        else await store.setStatus(String(body.pid), String(body.uid), 'rejected', String(body.reason || 'отклонён модератором').slice(0, 200));
        listCache = null;
        return reply(200, { ok: true }, h);
      }
      default: return reply(404, { error: 'Неизвестное действие' }, h);
    }
  } catch (e) {
    if (e && e.code === 405) return reply(405, { error: e.message }, h);
    console.error(e);
    return reply(500, { error: 'Ошибка сервера' }, h);
  }
}

module.exports = { handler, setStore, _yandexUser: yandexUser, _tokenCache: tokenCache };

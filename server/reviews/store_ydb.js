// Хранилище в YDB serverless (Yandex Cloud). Таблицы создаются сами при первом запуске.
// Доступ — через сервисный аккаунт функции (роль ydb.editor), ключи в коде не нужны.
'use strict';
const { Driver, getCredentialsFromEnv, TypedValues: V, TypedData, Types: T, Column, TableDescription } = require('ydb-sdk');

const COLS = 'pid, uid, name, stars, usage, pros, cons, text, at, status, reason, reports';
const num = v => (v == null ? 0 : typeof v === 'object' && v.toNumber ? v.toNumber() : Number(v));
const row = o => ({ pid: o.pid, uid: o.uid, name: o.name || '', stars: num(o.stars), usage: o.usage || '', pros: o.pros || '', cons: o.cons || '', text: o.text || '', at: num(o.at), status: o.status, reason: o.reason || '', reports: num(o.reports) });
const rows = res => (res.resultSets[0] ? TypedData.createNativeObjects(res.resultSets[0]) : []).map(row);
const O = t => T.optional(t);

async function ensureTables(driver) {
  await driver.tableClient.withSession(async s => {
    const exists = async name => { try { await s.describeTable(name); return true; } catch { return false; } };
    if (!(await exists('reviews'))) await s.createTable('reviews', new TableDescription()
      .withColumn(new Column('pid', O(T.UTF8))).withColumn(new Column('uid', O(T.UTF8))).withColumn(new Column('name', O(T.UTF8)))
      .withColumn(new Column('stars', O(T.UINT8))).withColumn(new Column('usage', O(T.UTF8))).withColumn(new Column('pros', O(T.UTF8)))
      .withColumn(new Column('cons', O(T.UTF8))).withColumn(new Column('text', O(T.UTF8))).withColumn(new Column('at', O(T.UINT64)))
      .withColumn(new Column('status', O(T.UTF8))).withColumn(new Column('reason', O(T.UTF8))).withColumn(new Column('reports', O(T.UINT32)))
      .withPrimaryKeys('pid', 'uid'));
    if (!(await exists('reports'))) await s.createTable('reports', new TableDescription()
      .withColumn(new Column('pid', O(T.UTF8))).withColumn(new Column('uid', O(T.UTF8))).withColumn(new Column('by', O(T.UTF8))).withColumn(new Column('at', O(T.UINT64)))
      .withPrimaryKeys('pid', 'uid', 'by'));
  });
}

async function open() {
  const connectionString = (process.env.YDB_ENDPOINT || 'grpcs://ydb.serverless.yandexcloud.net:2135') + '/?database=' + process.env.YDB_DATABASE;
  const driver = new Driver({ connectionString, authService: getCredentialsFromEnv() });
  if (!(await driver.ready(10000))) throw new Error('YDB недоступна');
  await ensureTables(driver);
  const q = (text, params) => driver.tableClient.withSessionRetry(s => s.executeQuery(text, params), 10000, 3);

  return {
    async published() {
      // данные отдаются порциями по 1000 строк — читаем, пока не кончатся
      const out = []; let lp = '', lu = '';
      for (;;) {
        const res = await q(`DECLARE $lp AS Utf8; DECLARE $lu AS Utf8;
          SELECT ${COLS} FROM reviews WHERE status = "ok"u AND (pid > $lp OR (pid = $lp AND uid > $lu)) ORDER BY pid, uid LIMIT 1000;`,
          { $lp: V.utf8(lp), $lu: V.utf8(lu) });
        const part = rows(res); out.push(...part);
        if (part.length < 1000) break;
        lp = part[part.length - 1].pid; lu = part[part.length - 1].uid;
      }
      return out.sort((a, b) => b.at - a.at);
    },
    async byUser(uid) {
      return rows(await q(`DECLARE $uid AS Utf8; SELECT ${COLS} FROM reviews WHERE uid = $uid LIMIT 1000;`, { $uid: V.utf8(uid) }));
    },
    async get(pid, uid) {
      return rows(await q(`DECLARE $pid AS Utf8; DECLARE $uid AS Utf8; SELECT ${COLS} FROM reviews WHERE pid = $pid AND uid = $uid;`, { $pid: V.utf8(pid), $uid: V.utf8(uid) }))[0] || null;
    },
    async countSince(uid, t) {
      const res = await q(`DECLARE $uid AS Utf8; DECLARE $t AS Uint64; SELECT COUNT(*) AS n FROM reviews WHERE uid = $uid AND at >= $t;`, { $uid: V.utf8(uid), $t: V.uint64(t) });
      return num(TypedData.createNativeObjects(res.resultSets[0])[0].n);
    },
    async put(r) {
      await q(`DECLARE $pid AS Utf8; DECLARE $uid AS Utf8; DECLARE $name AS Utf8; DECLARE $stars AS Uint8; DECLARE $usage AS Utf8;
        DECLARE $pros AS Utf8; DECLARE $cons AS Utf8; DECLARE $text AS Utf8; DECLARE $at AS Uint64; DECLARE $status AS Utf8; DECLARE $reason AS Utf8; DECLARE $reports AS Uint32;
        UPSERT INTO reviews (${COLS}) VALUES ($pid, $uid, $name, $stars, $usage, $pros, $cons, $text, $at, $status, $reason, $reports);`,
      { $pid: V.utf8(r.pid), $uid: V.utf8(r.uid), $name: V.utf8(r.name), $stars: V.uint8(r.stars), $usage: V.utf8(r.usage), $pros: V.utf8(r.pros), $cons: V.utf8(r.cons),
        $text: V.utf8(r.text), $at: V.uint64(r.at), $status: V.utf8(r.status), $reason: V.utf8(r.reason || ''), $reports: V.uint32(r.reports || 0) });
    },
    async remove(pid, uid) {
      await q(`DECLARE $pid AS Utf8; DECLARE $uid AS Utf8; DELETE FROM reviews WHERE pid = $pid AND uid = $uid; DELETE FROM reports WHERE pid = $pid AND uid = $uid;`, { $pid: V.utf8(pid), $uid: V.utf8(uid) });
    },
    async report(pid, uid, by) {
      if (by === uid) return 0;
      const P = { $pid: V.utf8(pid), $uid: V.utf8(uid), $by: V.utf8(by) };
      // сначала только чтение, потом только запись: YDB не даёт читать таблицу после записи в той же транзакции
      const res = await q(`DECLARE $pid AS Utf8; DECLARE $uid AS Utf8; DECLARE $by AS Utf8;
        SELECT reports FROM reviews WHERE pid = $pid AND uid = $uid;
        SELECT COUNT(*) AS n FROM reports WHERE pid = $pid AND uid = $uid AND by = $by;`, P);
      const r = TypedData.createNativeObjects(res.resultSets[0])[0];
      if (!r) return 0;
      const n = num(r.reports);
      if (num(TypedData.createNativeObjects(res.resultSets[1])[0].n) > 0) return n;
      await q(`DECLARE $pid AS Utf8; DECLARE $uid AS Utf8; DECLARE $by AS Utf8; DECLARE $at AS Uint64; DECLARE $n AS Uint32;
        UPSERT INTO reports (pid, uid, by, at) VALUES ($pid, $uid, $by, $at);
        UPSERT INTO reviews (pid, uid, reports) VALUES ($pid, $uid, $n);`, { ...P, $at: V.uint64(Date.now()), $n: V.uint32(n + 1) });
      return n + 1;
    },
    async setStatus(pid, uid, status, reason, resetReports) {
      await q(`DECLARE $pid AS Utf8; DECLARE $uid AS Utf8; DECLARE $status AS Utf8; DECLARE $reason AS Utf8; DECLARE $reset AS Bool;
        UPDATE reviews SET status = $status, reason = $reason, reports = IF($reset, 0u, reports ?? 0u) WHERE pid = $pid AND uid = $uid;`,
      { $pid: V.utf8(pid), $uid: V.utf8(uid), $status: V.utf8(status), $reason: V.utf8(reason || ''), $reset: V.bool(!!resetReports) });
    },
    async queue() {
      return rows(await q(`SELECT ${COLS} FROM reviews WHERE status = "pending"u OR (status = "ok"u AND reports > 0u) ORDER BY at LIMIT 500;`)).sort((a, b) => a.at - b.at);
    },
  };
}
module.exports = { open };

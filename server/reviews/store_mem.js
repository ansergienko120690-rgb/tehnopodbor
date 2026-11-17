// Хранилище в памяти — для автотестов (тот же интерфейс, что store_ydb.js).
'use strict';
function open() {
  const rows = new Map(), reports = new Set(), k = (p, u) => p + '\u0000' + u;
  return {
    async published() { return [...rows.values()].filter(r => r.status === 'ok').sort((a, b) => b.at - a.at); },
    async byUser(uid) { return [...rows.values()].filter(r => r.uid === uid); },
    async get(pid, uid) { const r = rows.get(k(pid, uid)); return r ? { ...r } : null; },
    async countSince(uid, t) { return [...rows.values()].filter(r => r.uid === uid && r.at >= t).length; },
    async put(r) { rows.set(k(r.pid, r.uid), { ...r }); },
    async remove(pid, uid) { rows.delete(k(pid, uid)); [...reports].filter(x => x.startsWith(k(pid, uid) + '\u0000')).forEach(x => reports.delete(x)); },
    async report(pid, uid, by) {
      const r = rows.get(k(pid, uid)); if (!r || by === uid) return 0;
      const key = k(pid, uid) + '\u0000' + by; if (!reports.has(key)) { reports.add(key); r.reports++; }
      return r.reports;
    },
    async setStatus(pid, uid, status, reason, resetReports) { const r = rows.get(k(pid, uid)); if (!r) return; r.status = status; r.reason = reason; if (resetReports) r.reports = 0; },
    async queue() { return [...rows.values()].filter(r => r.status === 'pending' || (r.status === 'ok' && r.reports > 0)).sort((a, b) => a.at - b.at); },
  };
}
module.exports = { open };

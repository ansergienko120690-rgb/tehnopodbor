// ---------- Аналитика и отчёты о сбоях (Яндекс Метрика) ----------
// Номер счётчика — в src/data/config.json → { "metrika": 12345678 }. Пока номера нет, ничего не отправляется.
// Работает только на сайте/в приложении (http/https), не под file:// и не в песочнице claude.ai.
// Что считаем: открытия разделов, категорий и карточек, переходы в магазины, сравнение, подбор, ошибки JavaScript.
// Персональные данные не собираем: только события и обезличенные параметры (категория, магазин, текст ошибки).
const METRICS = (() => {
  const cfg = readInline('tp-config') || {};
  const id = +cfg.metrika || 0;
  const on = !!id && /^https?:$/.test(location.protocol) && !/claude|anthropic|localhost|tp\.test/.test(location.hostname);
  const queue = [];
  let sent = 0;
  const ym = (...a) => { if (!on) return; if (window.ym) window.ym(id, ...a); else queue.push(a); };
  if (on) {
    // официальный код счётчика Метрики (асинхронный)
    (function (m, e, t, r, i, k, a) { m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date();
      k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a); })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(id, 'init', { clickmap: false, trackLinks: true, accurateTrackBounce: true, webvisor: false, defer: false });
    queue.splice(0).forEach(a => window.ym(id, ...a));
  }
  const goal = (name, params) => ym('reachGoal', name, params || {});
  // Ошибки JavaScript: не больше 10 за сеанс, без личных данных
  const err = (msg, src, line) => { if (sent >= 10) return; sent++; goal('js_error', { msg: String(msg || '').slice(0, 200), src: String(src || '').split('/').pop().slice(0, 80), line: line || 0, view: (typeof S !== 'undefined' && S.view) || '' }); };
  window.addEventListener('error', e => err(e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', e => err('promise: ' + ((e.reason && e.reason.message) || e.reason), '', 0));
  return { on, id, goal, err };
})();

// Подписка на действия приложения: оборачиваем глобальные функции, не меняя их поведения
(function hookMetrics() {
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = function (...a) { try { fn(...a); } catch (e) { } return orig.apply(this, a); }; };
  wrap('go', view => METRICS.goal('view_' + view));
  wrap('setCat', id => METRICS.goal('category', { cat: id }));
  wrap('detail', id => { const p = byId(id); METRICS.goal('product', p ? { cat: p.cat, brand: p.brand, feed: !!p.feed } : {}); });
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && /Открыть в магазине/.test(a.textContent)) METRICS.goal('shop_click', { shop: (a.textContent.match(/«([^»]+)»/) || [])[1] || '', host: (() => { try { return new URL(a.href).hostname; } catch { return ''; } })() });
    const c = e.target.closest && e.target.closest('[data-cmp]');
    if (c) METRICS.goal('compare_toggle');
  }, true);
})();

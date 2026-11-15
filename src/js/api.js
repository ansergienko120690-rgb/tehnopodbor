// ===== ТехноПодбор: слой работы с API =====
// Один вход для всех внешних данных. Сейчас «API» — это статические JSON, которые публикует
// GitHub Pages рядом с приложением (data/catalog.json, data/prices.json). Цены в prices.json
// по расписанию обновляет посредник — GitHub Actions (tools/update_prices.mjs), без своего сервера.
// Чтобы перейти на настоящий сервер, достаточно поменять API.base — остальной код не меняется.
//
// На claude.ai страница не может обращаться к другим сайтам: там используются данные,
// встроенные при сборке (каталог и цены на дату публикации).

const API = {
  base: (() => {
    try {
      const m = document.querySelector('meta[name="tp-api"]');
      if (m && m.content) return m.content.replace(/\/?$/, '/');
      return /^https?:$/.test(location.protocol) && !/claude/.test(location.hostname) ? new URL('data/', location.href).href : null;
    } catch { return null; }
  })(),
  timeout: 8000,
  state: { catalog: 'встроенный', prices: 'встроенные', error: null, checked: null },

  // GET с таймаутом, одной повторной попыткой и без кэша браузера
  async get(name, tries = 2) {
    if (!this.base) throw new Error('нет доступа к сети из этой страницы');
    let last;
    for (let i = 0; i < tries; i++) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), this.timeout);
      try {
        const r = await fetch(this.base + name + '?t=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) { last = e; if (i + 1 < tries) await new Promise(r => setTimeout(r, 800 + Math.random() * 700)); }
      finally { clearTimeout(t); }
    }
    throw last;
  },

  // Свежий каталог: подменяем, только если версия новее встроенной и формат тот же
  async refreshCatalog() {
    const c = await this.get('catalog.json');
    if (!c || c.format !== CATALOG.format || !(c.version > CATALOG.version)) return false;
    const { products, errors } = parseCatalog(c.categories);
    if (errors.length) { console.error('Новый каталог с ошибками, оставляю встроенный', errors); return false; }
    const custom = PRODUCTS.filter(p => p.custom);
    CATEGORIES.splice(0, CATEGORIES.length, ...c.categories);
    PRODUCTS.splice(0, PRODUCTS.length, ...products, ...custom);
    Object.assign(CATALOG, { version: c.version, updated: c.updated });
    this.state.catalog = 'с сервера, версия ' + c.version;
    return true;
  },

  async refreshPrices() {
    const p = await this.get('prices.json');
    if (!p || (PRICES.updated && p.updated && p.updated <= PRICES.updated)) return false;
    const n = applyPrices(p);
    this.state.prices = `с сервера: ${n} цен`;
    return true;
  },

  async sync() {
    if (!this.base) return;
    let changed = false;
    try { changed = (await this.refreshCatalog()) || changed; } catch (e) { this.state.error = e.message; }
    try { changed = (await this.refreshPrices()) || changed; } catch (e) { this.state.error = e.message; }
    this.state.checked = new Date();
    if (changed && typeof render === 'function') render();
  },
};

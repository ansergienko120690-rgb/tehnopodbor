const ICON = (() => {
  const s = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return {
    heart: s('<path d="M12 20s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 5.6 5.2 5.2 0 0 1 21.3 11C19 15.6 12 20 12 20z"/>'),
    cmp: s('<path d="M7 4v16M17 4v16M3 9h8M13 15h8"/>'),
    cmpOn: s('<path d="M5 12l4.5 4.5L19 7"/>'),
    sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: s('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  };
})();

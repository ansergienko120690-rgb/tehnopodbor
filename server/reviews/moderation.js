// Автомодерация отзывов: что публикуется сразу, что уходит на проверку, что не принимается.
'use strict';

const LIMITS = { usage: 40, pros: 600, cons: 600, text: 1500 };
const USAGE = ['Меньше месяца', 'До года', '1–3 года', 'Больше 3 лет'];

// Корни нецензурной лексики и оскорблений (проверка по словам, без учёта регистра и «ё»).
const BAD = [/(^|[^а-я])(х[уy][йеёяию]|пи[зс]д|[её]б[аеуы]|бля|муд[аио]|сук[аи]|п[ие]д[ао]р|гандон|шлю[хш])/i];
const LINK = /(https?:\/\/|www\.|(^|[^a-zа-яё0-9-])[a-zа-яё0-9-]+\.(ru|рф|com|net|org|su|info|biz|io|me|online|site|store|shop)(?![a-zа-яё0-9]))/i;
const CONTACT = /([\w.+-]+@[\w-]+\.[\w.]+)|((\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2})|(t\.me\/|telegram|whatsapp|ватсап|телеграм)/i;

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+\n/g, '\n').trim().slice(0, n);

// Проверяет и нормализует отзыв. Возвращает { error } или { review, status, reason }.
function check(input) {
  const stars = Number(input && input.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: 'Поставьте оценку от 1 до 5 звёзд' };
  const r = { stars, usage: clean(input.usage, LIMITS.usage), pros: clean(input.pros, LIMITS.pros), cons: clean(input.cons, LIMITS.cons), text: clean(input.text, LIMITS.text) };
  if (r.usage && !USAGE.includes(r.usage)) r.usage = '';
  const all = [r.pros, r.cons, r.text].join('\n');
  const norm = all.toLowerCase().replace(/ё/g, 'е');
  const reasons = [];
  if (LINK.test(all)) reasons.push('ссылка');
  if (CONTACT.test(all)) reasons.push('контакты');
  if (BAD.some(re => re.test(norm))) reasons.push('лексика');
  const letters = all.replace(/[^a-zа-яё]/gi, '');
  if (letters.length > 30 && letters.replace(/[^A-ZА-ЯЁ]/g, '').length / letters.length > 0.6) reasons.push('капс');
  if (/(.)\1{7,}/.test(all)) reasons.push('повторы');
  return { review: r, status: reasons.length ? 'pending' : 'ok', reason: reasons.join(', ') };
}

module.exports = { check, LIMITS, USAGE };

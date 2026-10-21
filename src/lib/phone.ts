/**
 * Маска телефона: +7 (916) 123-45-67.
 * Первая 8 или 7 заменяется на +7, принимается ровно 10 цифр, лишнее отбрасывается.
 */
/** 10 цифр номера без кода страны (или меньше, если номер введён не полностью) */
export function phoneDigits(raw: string): string {
  return maskPhone(raw).replace(/\D/g, '').slice(1);
}

export function formatPhone(d: string): string {
  if (!d) return '';
  let r = '+7 (' + d.slice(0, 3);
  if (d.length >= 3) r += ')';
  if (d.length > 3) r += ' ' + d.slice(3, 6);
  if (d.length > 6) r += '-' + d.slice(6, 8);
  if (d.length > 8) r += '-' + d.slice(8, 10);
  return r;
}

/** Функция из макета: форматирует значение поля с учётом предыдущего (для Backspace на разделителе). */
export function maskPhone(raw: string, prev = ''): string {
  let d = String(raw || '').replace(/\D/g, '');
  const pd = String(prev || '').replace(/\D/g, '');
  if (prev && String(raw).length < String(prev).length && d === pd) d = d.slice(0, -1);
  if (d[0] === '8' || d[0] === '7') d = d.slice(1);
  return formatPhone(d.slice(0, 10));
}

/** E.164 для сервера: +79161234567 или '' если цифр не 10 */
export function toE164(v: string): string {
  const d = phoneDigits(v);
  return d.length === 10 ? '+7' + d : '';
}

/** Позиция курсора после n-й цифры номера (без учёта ведущей 7 в «+7»). */
export function caretAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return formatted ? 4 : 0;
  let seen = 0;
  for (let i = 4; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return formatted.length;
}

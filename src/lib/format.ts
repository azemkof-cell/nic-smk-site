const NBSP = ' ';

/** Число с неразрывными пробелами разрядов: 270 000, 5,2 */
export function fmt(x: number): string {
  const frac = Math.round(x * 100) % 100 !== 0;
  return x
    .toLocaleString('ru-RU', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })
    .replace(/[\s ]/g, NBSP);
}

/** «270 000 ₽» с неразрывным пробелом перед знаком рубля */
export function rub(x: number, from = false): string {
  return (from ? 'от' + NBSP : '') + fmt(x) + NBSP + '₽';
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 10;
  const b = Math.abs(n) % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

export const months = (n: number) => n + NBSP + plural(n, 'месяц', 'месяца', 'месяцев');

/** Разбор числа из поля: «1 500,5» → 1500.5; пусто/ошибка/отрицательное → 0 */
export function num(x: unknown): number {
  const y = parseFloat(String(x ?? '').replace(',', '.').replace(/\s/g, ''));
  return isNaN(y) || y < 0 ? 0 : y;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

import { describe, expect, it } from 'vitest';
import { maskPhone, toE164, phoneDigits } from '../src/lib/phone';

describe('Маска телефона', () => {
  const ok = '+7 (916) 123-45-67';
  it.each(['89161234567', '9161234567', '+79161234567', '8(916)123-45-67', '+7 916 123 45 67', '79161234567'])('%s → %s', (raw) => {
    expect(maskPhone(raw)).toBe(ok);
  });
  it('лишние цифры отбрасываются', () => expect(maskPhone('891612345678899')).toBe(ok));
  it('E.164', () => expect(toE164(ok)).toBe('+79161234567'));
  it('неполный номер', () => {
    expect(toE164('+7 (916) 12')).toBe('');
    expect(phoneDigits('+7 (916) 12')).toBe('91612');
  });
  it('Backspace на разделителе удаляет цифру', () => {
    expect(maskPhone('+7 (916) 123-45-', '+7 (916) 123-45-6')).toBe('+7 (916) 123-45');
    expect(maskPhone('+7 (916', '+7 (916)')).toBe('+7 (91');
  });
  it('пустое поле', () => expect(maskPhone('')).toBe(''));
});

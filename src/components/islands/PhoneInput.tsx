import { useLayoutEffect, useRef } from 'preact/hooks';
import { caretAfterDigits, maskPhone } from '../../lib/phone';

interface Props {
  id: string;
  value: string;
  onValue: (v: string) => void;
  invalid?: boolean;
  describedBy?: string;
  class?: string;
  required?: boolean;
  style?: string;
}

/** Сколько цифр номера (без кода +7) стоит до позиции pos в строке raw */
function digitsBefore(raw: string, pos: number): number {
  const all = raw.replace(/\D/g, '');
  const dropFirst = all[0] === '7' || all[0] === '8';
  let n = raw.slice(0, pos).replace(/\D/g, '').length;
  if (dropFirst && n > 0) n -= 1;
  return n;
}

export default function PhoneInput(p: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && caret.current != null && document.activeElement === el) {
      el.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  });

  const apply = (raw: string, n: number) => {
    const next = maskPhone(raw);
    const el = ref.current!;
    el.value = next;
    caret.current = caretAfterDigits(next, n);
    el.setSelectionRange(caret.current, caret.current);
    p.onValue(next);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    const el = ev.currentTarget as HTMLInputElement;
    const s = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (s !== end) return;
    const v = el.value;
    if (ev.key === 'Backspace' && s > 0 && /\D/.test(v[s - 1])) {
      // Курсор за скобкой/дефисом/пробелом — удаляем ближайшую цифру слева
      let i = s - 1;
      while (i >= 0 && /\D/.test(v[i])) i--;
      ev.preventDefault();
      if (i < 3) return apply('', 0); // слева только «+7 (»
      const n = digitsBefore(v, i);
      apply(v.slice(0, i) + v.slice(i + 1), n);
    } else if (ev.key === 'Delete' && s < v.length && /\D/.test(v[s])) {
      let i = s;
      while (i < v.length && /\D/.test(v[i])) i++;
      ev.preventDefault();
      if (i >= v.length) return;
      const n = digitsBefore(v, s);
      apply(v.slice(0, i) + v.slice(i + 1), n);
    }
  };

  const onInput = (ev: Event) => {
    const el = ev.currentTarget as HTMLInputElement;
    const raw = el.value;
    const pos = el.selectionStart ?? raw.length;
    const r = raw.trim();
    if (r === '+') {
      // Начали вводить «+7…» — ждём следующую цифру
      p.onValue('+');
      return;
    }
    if (r === '+7' || r === '7' || r === '8') {
      // Первая 8 или 7 сразу превращается в «+7 (»
      el.value = '+7 (';
      caret.current = 4;
      p.onValue('+7 (');
      return;
    }
    apply(raw, digitsBefore(raw, pos));
  };

  return (
    <input
      ref={ref}
      id={p.id}
      name="phone"
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      maxLength={18}
      placeholder="+7 (___) ___-__-__"
      class={p.class || 'input'}
      style={p.style}
      value={p.value}
      required={p.required}
      aria-required={p.required ? 'true' : undefined}
      aria-invalid={p.invalid ? 'true' : undefined}
      aria-describedby={p.describedBy}
      onInput={onInput}
      onKeyDown={onKeyDown}
    />
  );
}

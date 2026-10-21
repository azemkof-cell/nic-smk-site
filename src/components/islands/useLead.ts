import { useRef, useState } from 'preact/hooks';
import { sendLead, type LeadPayload, type LeadResult } from '../../lib/client';
import { phoneDigits } from '../../lib/phone';

export type Status = 'idle' | 'sending' | 'sent' | 'error';

/** Общая логика отправки: антиспам-поля, состояние, ошибки */
export function useLead(source: LeadPayload['source']) {
  const startedAt = useRef(Date.now());
  const hp = useRef('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<LeadResult | null>(null);

  async function submit(p: Omit<LeadPayload, 'source' | 'startedAt' | 'hp'>) {
    setStatus('sending');
    const r = await sendLead({ ...p, source, startedAt: startedAt.current, hp: hp.current });
    setResult(r);
    setStatus(r.ok ? 'sent' : 'error');
    return r;
  }
  function reset() {
    startedAt.current = Date.now();
    setStatus('idle');
    setResult(null);
  }
  return { status, result, submit, reset, setHp: (v: string) => (hp.current = v) };
}

export const phoneOk = (v: string) => phoneDigits(v).length === 10;
export const PHONE_ERR = 'Введите 10 цифр номера';

/** Фокус на первое поле с ошибкой */
export function focusFirst(ids: (string | false | undefined | null)[]) {
  const id = ids.find(Boolean);
  if (id) setTimeout(() => document.getElementById(id as string)?.focus(), 0);
}

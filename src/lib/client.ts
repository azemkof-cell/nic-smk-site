/** Браузерные утилиты: отправка заявок, цели Метрики */
import { toE164 } from './phone';

declare global {
  interface Window {
    ym?: (...a: unknown[]) => void;
    __YM_ID?: number;
  }
}

export function goal(name: string, params?: Record<string, unknown>) {
  try {
    if (window.ym && window.__YM_ID) window.ym(window.__YM_ID, 'reachGoal', name, params);
  } catch {
    /* Метрика не обязательна */
  }
}

export const CONSENT_VERSION = '2026-10-21';

export interface LeadPayload {
  source: 'callback' | 'contacts' | 'package' | 'calculator' | 'rates';
  name?: string;
  phone: string;
  email?: string;
  org?: string;
  addr?: string;
  comment?: string;
  direction?: string;
  data?: Record<string, unknown>;
  startedAt: number;
  hp?: string;
}
export interface LeadResult {
  ok: boolean;
  kp?: { no: string; date: string; token: string };
  error?: string;
}

export async function sendLead(p: LeadPayload): Promise<LeadResult> {
  const body = { ...p, phone: toE164(p.phone), consent: true, consentVersion: CONSENT_VERSION, page: location.pathname };
  try {
    const res = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as LeadResult;
    if (!res.ok || !json.ok) return { ok: false, error: json.error || 'HTTP ' + res.status };
    goal('lead_' + p.source);
    return json;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* приватный режим */
  }
}

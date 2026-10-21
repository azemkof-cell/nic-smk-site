/**
 * Хранилище на диске (сервер в РФ, 152-ФЗ): сквозной счётчик КП, сформированные КП, журнал заявок.
 * Каталог задаётся DATA_DIR (по умолчанию ./storage).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Kp } from '../lib/kp';

const DIR = process.env.DATA_DIR || path.join(process.cwd(), 'storage');
fs.mkdirSync(path.join(DIR, 'kp'), { recursive: true });

let chain = Promise.resolve();
/** Последовательное выполнение, чтобы счётчик не выдал один номер дважды */
function serial<T>(fn: () => T): Promise<T> {
  const p = chain.then(fn);
  chain = p.then(() => undefined, () => undefined);
  return p;
}

export function nextKpSeq(): Promise<number> {
  return serial(() => {
    const f = path.join(DIR, 'kp-counter.json');
    let n = 0;
    try {
      n = JSON.parse(fs.readFileSync(f, 'utf8')).last || 0;
    } catch {
      /* первый запуск */
    }
    n += 1;
    fs.writeFileSync(f, JSON.stringify({ last: n }));
    return n;
  });
}

const safeNo = (no: string) => no.replace(/[^0-9A-Za-zА-Яа-я-]/g, '');

export function saveKp(kp: Kp): string {
  const token = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(DIR, 'kp', safeNo(kp.no) + '.json'), JSON.stringify({ token, kp }, null, 1));
  return token;
}

export function loadKp(no: string, token: string): Kp | null {
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(DIR, 'kp', safeNo(no) + '.json'), 'utf8'));
    const a = Buffer.from(String(rec.token));
    const b = Buffer.from(String(token || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? (rec.kp as Kp) : null;
  } catch {
    return null;
  }
}

export function logLead(rec: Record<string, unknown>) {
  fs.appendFileSync(path.join(DIR, 'leads.jsonl'), JSON.stringify(rec) + '\n');
}

/* Лимит: не больше N заявок с IP в час (в памяти процесса) */
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, max = Number(process.env.LEAD_LIMIT_PER_HOUR || 5)): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= max) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

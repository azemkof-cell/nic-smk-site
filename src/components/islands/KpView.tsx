import { useState } from 'preact/hooks';
import { goal } from '../../lib/client';
import { kpHtml, type Kp } from '../../lib/kp';

interface Props {
  kp: Kp;
  token?: string;
  serverOk: boolean;
  phone: string;
  backLabel: string;
  onBack: () => void;
}

/** Готовое КП: превью, PDF, печать, отправка на e-mail */
export default function KpView({ kp, token, serverOk, phone, backLabel, onBack }: Props) {
  const [email, setEmail] = useState(kp.lead.email || '');
  const [mail, setMail] = useState<'idle' | 'open' | 'sending' | 'sent' | 'error'>('idle');
  const pdfHref = token ? '/api/kp-pdf?no=' + encodeURIComponent(kp.no) + '&t=' + encodeURIComponent(token) : '';
  const telHref = 'tel:+' + phone.replace(/\D/g, '');

  async function sendMail(e: Event) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setMail('sending');
    try {
      const r = await fetch('/api/kp-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ no: kp.no, t: token, email }) });
      setMail(r.ok ? 'sent' : 'error');
    } catch {
      setMail('error');
    }
  }

  return (
    <div>
      <div class="kp-actions noprint">
        <button type="button" class="btn btn--outline btn--sm" onClick={onBack}>
          ← {backLabel}
        </button>
        <div class="kp-actions__r">
          {pdfHref && (
            <a class="btn btn--accent btn--sm" href={pdfHref} download={kp.no + '.pdf'} onClick={() => goal('kp_pdf')}>
              Скачать PDF
            </a>
          )}
          <button
            type="button"
            class="btn btn--outline btn--sm"
            onClick={() => {
              goal('kp_print');
              window.print();
            }}
          >
            Распечатать
          </button>
          {token && (
            <button type="button" class="btn btn--outline btn--sm" aria-expanded={mail !== 'idle'} onClick={() => setMail(mail === 'idle' ? 'open' : mail)}>
              Отправить на e-mail
            </button>
          )}
        </div>
      </div>
      {mail !== 'idle' && (
        <form class="card noprint" style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end" onSubmit={sendMail}>
          <div class="field" style="flex:1 1 260px">
            <label class="label" for="kp-email">E-mail для КП</label>
            <input id="kp-email" class="input" type="email" autoComplete="email" required value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} placeholder="name@company.ru" />
          </div>
          <button class="btn btn--dark" type="submit" disabled={mail === 'sending'}>
            {mail === 'sending' ? 'Отправляем…' : 'Отправить'}
          </button>
          {mail === 'sent' && (
            <p role="status" style="margin:0;flex-basis:100%;font-weight:700">
              Отправили КП {kp.no} на {email}.
            </p>
          )}
          {mail === 'error' && (
            <p role="alert" class="err" style="margin:0;flex-basis:100%">
              Не отправилось. Позвоните <a href={telHref}>{phone}</a>.
            </p>
          )}
        </form>
      )}
      {serverOk ? (
        <div class="kp-status noprint" role="status">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5C02B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="m5 12 5 5 9-10" /></svg>
          <span>Заявка принята, предложение {kp.no} у инженера. Перезвоним в рабочее время в течение 30 минут.</span>
        </div>
      ) : (
        <div class="kp-status kp-status--warn noprint" role="alert">
          <span>
            Предложение сформировано, но заявка не отправилась. Позвоните <a href={telHref}>{phone}</a> или сохраните КП и пришлите нам.
          </span>
        </div>
      )}
      <article class="kp" aria-label={'Коммерческое предложение ' + kp.no} dangerouslySetInnerHTML={{ __html: kpHtml(kp) }} />
    </div>
  );
}

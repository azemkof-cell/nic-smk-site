import { useState } from 'preact/hooks';
import Consent from './Consent';
import Honeypot from './Honeypot';
import PhoneInput from './PhoneInput';
import { focusFirst, phoneOk, PHONE_ERR, useLead } from './useLead';

const DIRECTIONS = ['Строительный контроль', 'Контроль прочности монолитных конструкций', 'Лабораторные испытания', 'Электролаборатория', 'Обследование здания', 'Комплекс работ'];

interface Props {
  source: 'callback' | 'contacts';
  dark?: boolean;
  title?: string;
  subtitle?: string;
  direction?: string;
  withEmail?: boolean;
  phone: string;
}

export default function CallbackForm({ source, dark, title, subtitle, direction, withEmail, phone }: Props) {
  const p = source; // префикс id
  const [f, setF] = useState({ name: '', phone: '', email: '', direction: direction || DIRECTIONS[0], comment: '' });
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const { status, submit, reset, setHp } = useLead(source);
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.currentTarget as HTMLInputElement).value });

  const phoneBad = tried && !phoneOk(f.phone);
  const consentBad = tried && !consent;
  const telHref = 'tel:+' + phone.replace(/\D/g, '');

  async function onSubmit(e: Event) {
    e.preventDefault();
    setTried(true);
    if (!phoneOk(f.phone) || !consent) {
      focusFirst([!phoneOk(f.phone) && p + '-phone', !consent && p + '-consent']);
      return;
    }
    await submit({ name: f.name, phone: f.phone, email: f.email, direction: f.direction, comment: f.comment });
  }

  if (status === 'sent') {
    return (
      <div class={'success' + (dark ? '' : ' card')} role="status" style={dark ? 'padding:24px 0' : 'padding:32px;border:0'}>
        <span class="success__icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#14171A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
        </span>
        <div style={dark ? "font-family:var(--f-display);font-size:26px;font-weight:600" : 'font-weight:800;font-size:22px'}>Заявка принята</div>
        <p style={'margin:0;color:' + (dark ? 'var(--on-ink)' : 'var(--text-2)')}>Перезвоним в рабочее время в течение 30 минут.</p>
        <button
          type="button"
          class={'btn btn--sm ' + (dark ? 'btn--ghost' : 'btn--outline')}
          onClick={() => {
            setF({ ...f, comment: '' });
            setTried(false);
            reset();
          }}
        >
          Отправить ещё одну
        </button>
      </div>
    );
  }

  return (
    <form class={dark ? 'dark' : 'card'} style={'display:flex;flex-direction:column;gap:14px;position:relative;' + (dark ? '' : 'padding:28px;border:0')} onSubmit={onSubmit} noValidate>
      {title && <h2 style="margin:0;font-family:var(--f-display);font-weight:600;font-size:26px;line-height:1.2">{title}</h2>}
      {subtitle && <p style={'margin:0 0 8px;color:' + (dark ? 'var(--on-ink)' : 'var(--muted)')}>{subtitle}</p>}
      <Honeypot onValue={setHp} />
      <div class="field">
        <label class="label" for={p + '-name'}>Имя</label>
        <input id={p + '-name'} class="input" type="text" autoComplete="name" placeholder="Как к вам обращаться" value={f.name} onInput={set('name')} />
      </div>
      <div class="field">
        <label class="label" for={p + '-phone'}>
          Телефон <span aria-hidden="true" style="color:var(--accent-ink)">*</span>
        </label>
        <PhoneInput id={p + '-phone'} value={f.phone} onValue={(v) => setF({ ...f, phone: v })} invalid={phoneBad} describedBy={phoneBad ? p + '-phone-err' : undefined} required />
        {phoneBad && (
          <div class="err" id={p + '-phone-err'} role="alert">
            {PHONE_ERR}
          </div>
        )}
      </div>
      {withEmail && (
        <div class="field">
          <label class="label" for={p + '-email'}>E-mail</label>
          <input id={p + '-email'} class="input" type="email" autoComplete="email" inputMode="email" placeholder="name@company.ru" value={f.email} onInput={set('email')} />
        </div>
      )}
      <div class="field">
        <label class="label" for={p + '-dir'}>Направление</label>
        <select id={p + '-dir'} class="select" value={f.direction} onChange={set('direction')}>
          {DIRECTIONS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>
      <div class="field">
        <label class="label" for={p + '-msg'}>{source === 'contacts' ? 'Сообщение' : 'Комментарий'}</label>
        <textarea id={p + '-msg'} class="textarea" rows={source === 'contacts' ? 4 : 3} placeholder="Адрес объекта, вид работ, сроки" value={f.comment} onInput={set('comment')} />
      </div>
      <Consent id={p + '-consent'} checked={consent} onChange={setConsent} invalid={consentBad} />
      {status === 'error' && (
        <div class="form-error" role="alert">
          Не отправилось. Позвоните <a href={telHref}>{phone}</a>. Введённые данные сохранены, можно попробовать ещё раз.
        </div>
      )}
      <button type="submit" class="btn btn--accent btn--lg btn--block" disabled={status === 'sending'} aria-busy={status === 'sending'}>
        {status === 'sending' ? 'Отправляем…' : 'Перезвоните мне'}
      </button>
    </form>
  );
}

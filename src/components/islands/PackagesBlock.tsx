import { useRef, useState } from 'preact/hooks';
import { goal } from '../../lib/client';
import { packages } from '../../lib/data';
import { fmt } from '../../lib/format';
import { clampMonths, kpFromPackage, localKpNumber, type Kp } from '../../lib/kp';
import Consent from './Consent';
import Honeypot from './Honeypot';
import KpView from './KpView';
import PhoneInput from './PhoneInput';
import { focusFirst, phoneOk, PHONE_ERR, useLead } from './useLead';

const P = packages.packages;
const F = packages.features;

const Check = () => (
  <span style="flex:none;width:20px;height:20px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;margin-top:1px">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#14171A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
  </span>
);
const Minus = () => (
  <span style="flex:none;width:20px;height:20px;border-radius:50%;border:1.5px solid currentColor;display:flex;align-items:center;justify-content:center;margin-top:1px">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
  </span>
);

export default function PackagesBlock({ phone, idPrefix = 'pk' }: { phone: string; idPrefix?: string }) {
  const [sel, setSel] = useState(P.find((p) => p.recommended)?.id || P[0].id);
  const [lead, setLead] = useState({ addr: '', months: '3', org: '', name: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [kp, setKp] = useState<{ kp: Kp; token?: string; ok: boolean } | null>(null);
  const { status, submit, setHp } = useLead('package');
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const kpRef = useRef<HTMLDivElement>(null);

  const cur = P.find((p) => p.id === sel)!;
  const m = clampMonths(lead.months);
  const id = (s: string) => idPrefix + '-' + s;
  const set = (k: keyof typeof lead) => (e: Event) => setLead({ ...lead, [k]: (e.currentTarget as HTMLInputElement).value });
  const setM = (n: number) => setLead({ ...lead, months: String(Math.min(36, Math.max(1, n))) });

  const bad = {
    addr: tried && !lead.addr.trim(),
    name: tried && !lead.name.trim(),
    phone: tried && !phoneOk(lead.phone),
    consent: tried && !consent,
  };

  function onKeyCards(e: KeyboardEvent, i: number) {
    const k = e.key;
    let n = -1;
    if (k === 'ArrowRight' || k === 'ArrowDown') n = (i + 1) % P.length;
    if (k === 'ArrowLeft' || k === 'ArrowUp') n = (i - 1 + P.length) % P.length;
    if (n >= 0) {
      e.preventDefault();
      setSel(P[n].id);
      cardRefs.current[n]?.focus();
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    setTried(true);
    const okAddr = !!lead.addr.trim(), okName = !!lead.name.trim(), okPhone = phoneOk(lead.phone);
    if (!okAddr || !okName || !okPhone || !consent) {
      focusFirst([!okAddr && id('addr'), !okName && id('name'), !okPhone && id('phone'), !consent && id('consent')]);
      return;
    }
    const l = { org: lead.org, name: lead.name, phone: lead.phone, addr: lead.addr };
    const r = await submit({ ...l, data: { pack: sel, months: m } });
    const k = kpFromPackage(sel, m, l, r.kp?.no || localKpNumber(), r.kp?.date);
    setKp({ kp: k, token: r.kp?.token, ok: r.ok });
    goal('kp_generated', { source: 'package' });
    setTimeout(() => kpRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  return (
    <div>
      <div class="section-head section-head--row" style="margin-bottom:28px">
        <div style="max-width:720px">
          <div class="eyebrow">Пакеты для строек с монолитом</div>
          <h2 class="h2 h2--sm" style="margin-top:10px">Фиксированная цена за объект в месяц</h2>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <span class="pill">За объект / месяц</span>
          <span class="pill">Без НДС</span>
          <a class="pill" href="/kalkulyator?type=asphalt">Дороги и благоустройство: калькулятор</a>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span style="flex:none;width:28px;height:28px;border-radius:50%;background:var(--ink);color:var(--accent);font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center">1</span>
        <span id={id('lbl')} style="font-weight:800;font-size:17px">Выберите пакет</span>
      </div>

      <div role="radiogroup" aria-labelledby={id('lbl')} class="pk-cards">
        {P.map((p, i) => {
          const on = p.id === sel;
          return (
            <button
              key={p.id}
              ref={(el) => { cardRefs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              class={'pk-card' + (on ? ' is-on' : '')}
              onClick={() => setSel(p.id)}
              onKeyDown={(e) => onKeyCards(e, i)}
            >
              <span class="pk-card__top">
                <span style="font-weight:800;font-size:21px">{p.name}</span>
                {p.recommended && <span class="pk-badge">РЕКОМЕНДУЕМ</span>}
              </span>
              <span class="pk-card__desc">{p.description}</span>
              <span style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
                <span class="pk-card__price">{fmt(p.price)}&nbsp;₽</span>
                <span class="pk-card__desc" style="font-weight:700">за объект / мес.</span>
              </span>
              <span class="pk-card__div" />
              <span style="display:flex;flex-direction:column;gap:10px;font-size:15px">
                {F.map((t) =>
                  p.includes.includes(t) ? (
                    <span key={t} style="display:flex;gap:10px;align-items:flex-start">
                      <Check />
                      <span style="font-weight:600">{t}</span>
                    </span>
                  ) : (
                    <span key={t} class="pk-off" style="display:flex;gap:10px;align-items:flex-start">
                      <Minus />
                      <span style="text-decoration:line-through">
                        <span class="sr-only">Не входит: </span>
                        {t}
                      </span>
                    </span>
                  ),
                )}
              </span>
              <span class="pk-card__mark" aria-hidden="true">
                {on ? '✓ Пакет выбран' : 'Нажмите, чтобы выбрать'}
              </span>
            </button>
          );
        })}
      </div>

      <div class="dark" style="margin-top:20px;background:var(--ink);color:#fff;border-radius:22px;padding:clamp(20px,3.5vw,36px)">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px">
          <span style="flex:none;width:28px;height:28px;border-radius:50%;background:var(--accent);color:var(--ink);font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center">2</span>
          <h3 style="margin:0;font-weight:800;font-size:19px;line-height:1.35">
            Получите предложение по пакету «{cur.name}»: {fmt(cur.price)}&nbsp;₽ за объект в месяц
          </h3>
        </div>
        <p style="margin:0 0 20px;color:var(--on-ink);font-size:15px">Укажите объект и контакты. Коммерческое предложение сформируется сразу, его можно сохранить в PDF.</p>
        <form class="pk-form" onSubmit={onSubmit} noValidate>
          <Honeypot onValue={setHp} />
          <div class="field">
            <label class="label" for={id('addr')}>
              Адрес объекта <span aria-hidden="true" style="color:var(--accent)">*</span>
            </label>
            <input id={id('addr')} class="input" type="text" placeholder="Город, улица, ЖК" value={lead.addr} onInput={set('addr')} aria-required="true" aria-invalid={bad.addr ? 'true' : undefined} />
          </div>
          <div class="field">
            <label class="label" for={id('months')}>
              Срок контроля, мес. <span aria-hidden="true" style="color:var(--accent)">*</span>
            </label>
            <div class="stepper">
              <button type="button" aria-label="Меньше месяцев" disabled={m <= 1} onClick={() => setM(m - 1)}>
                −
              </button>
              <input id={id('months')} type="text" inputMode="numeric" value={lead.months} onInput={(e) => setLead({ ...lead, months: (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 2) })} onBlur={() => setM(m)} aria-describedby={id('mhint')} />
              <button type="button" aria-label="Больше месяцев" disabled={m >= 36} onClick={() => setM(m + 1)}>
                +
              </button>
            </div>
            <span id={id('mhint')} class="sr-only">от 1 до 36 месяцев</span>
          </div>
          <div class="field">
            <label class="label" for={id('org')}>
              Организация <small style="color:var(--on-ink-2)">(необязательно)</small>
            </label>
            <input id={id('org')} class="input" type="text" autoComplete="organization" placeholder="ООО «Заказчик»" value={lead.org} onInput={set('org')} />
          </div>
          <div class="field">
            <label class="label" for={id('name')}>
              Контактное лицо <span aria-hidden="true" style="color:var(--accent)">*</span>
            </label>
            <input id={id('name')} class="input" type="text" autoComplete="name" placeholder="Имя и фамилия" value={lead.name} onInput={set('name')} aria-required="true" aria-invalid={bad.name ? 'true' : undefined} />
          </div>
          <div class="field">
            <label class="label" for={id('phone')}>
              Телефон <span aria-hidden="true" style="color:var(--accent)">*</span>
            </label>
            <PhoneInput id={id('phone')} value={lead.phone} onValue={(v) => setLead({ ...lead, phone: v })} invalid={bad.phone} required describedBy={bad.phone ? id('phone-err') : undefined} />
            {bad.phone && (
              <div class="err" id={id('phone-err')} role="alert">
                {PHONE_ERR}
              </div>
            )}
          </div>
          <div style="grid-column:1/-1">
            {(bad.addr || bad.name) && (
              <div class="err" role="alert" style="margin-bottom:10px">
                Заполните поля со звёздочкой: {[bad.addr && 'адрес объекта', bad.name && 'контактное лицо'].filter(Boolean).join(', ')}.
              </div>
            )}
            <Consent id={id('consent')} checked={consent} onChange={setConsent} invalid={bad.consent} />
          </div>
          <button type="submit" class="btn btn--accent btn--lg" style="grid-column:1/-1;font-size:17px" disabled={status === 'sending'} aria-busy={status === 'sending'}>
            {status === 'sending' ? (
              'Отправляем…'
            ) : (
              <span>
                Получить предложение · {fmt(cur.price * m)}&nbsp;₽ за {m}&nbsp;мес.
              </span>
            )}
          </button>
        </form>
        <p style="margin:16px 0 0;font-size:14px;color:var(--on-ink)">
          Для крупных объектов есть стационарный пост лаборатории на объекте: от {fmt(packages.stationaryPost.priceFrom)}&nbsp;₽/мес.
        </p>
      </div>

      {kp && (
        <div ref={kpRef} style="margin-top:24px;scroll-margin-top:90px">
          <KpView kp={kp.kp} token={kp.token} serverOk={kp.ok} phone={phone} backLabel="Выбрать другой пакет" onBack={() => setKp(null)} />
        </div>
      )}
    </div>
  );
}

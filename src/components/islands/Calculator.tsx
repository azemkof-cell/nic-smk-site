import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { compute, isVisible, TYPES, typeById, type Vals } from '../../lib/calc';
import { goal } from '../../lib/client';
import { fmt, num } from '../../lib/format';
import { kpFromCalc, localKpNumber, type Kp } from '../../lib/kp';
import Consent from './Consent';
import Honeypot from './Honeypot';
import KpView from './KpView';
import PhoneInput from './PhoneInput';
import { focusFirst, phoneOk, PHONE_ERR, useLead } from './useLead';

const Step = ({ n }: { n: number }) => (
  <span aria-hidden="true" style="flex:none;margin-top:1px;width:28px;height:28px;border-radius:50%;background:var(--ink);color:var(--accent);font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center">
    {n}
  </span>
);

function readUrl(): { type: string; vals: Vals } | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  const type = q.get('type');
  if (!type || !TYPES.some((t) => t.id === type)) return null;
  const vals: Vals = {};
  for (const f of typeById(type).fields) {
    const v = q.get(f.k);
    if (v == null || f.t === 'head') continue;
    vals[f.k] = f.t === 'check' ? v === '1' : v;
  }
  return { type, vals };
}

function writeUrl(type: string, vals: Vals) {
  const q = new URLSearchParams();
  q.set('type', type);
  const t = typeById(type);
  for (const f of t.fields) {
    if (f.t === 'head' || !(f.k in vals)) continue;
    const v = vals[f.k];
    if (f.t === 'check') q.set(f.k, v ? '1' : '0');
    else if (v !== '') q.set(f.k, String(v));
  }
  history.replaceState(null, '', location.pathname + '?' + q.toString());
}

export default function Calculator({ phone }: { phone: string }) {
  const [type, setType] = useState('sk');
  const [stored, setStored] = useState<Record<string, Vals>>({});
  const [lead, setLead] = useState({ addr: '', org: '', name: '', phone: '', email: '' });
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [kp, setKp] = useState<{ kp: Kp; token?: string; ok: boolean } | null>(null);
  const { status, submit, setHp } = useLead('calculator');
  const formRef = useRef<HTMLFormElement>(null);
  const ready = useRef(false);

  useEffect(() => {
    const u = readUrl();
    if (u) {
      setType(u.type);
      setStored({ [u.type]: u.vals });
    }
    ready.current = true;
  }, []);

  const res = useMemo(() => compute(type, stored[type] || {}), [type, stored]);
  const cur = res.type;
  const v = res.vals;

  useEffect(() => {
    if (ready.current) writeUrl(type, stored[type] || {});
  }, [type, stored]);

  const setV = (k: string, val: string | boolean) => setStored({ ...stored, [type]: { ...(stored[type] || {}), [k]: val } });
  const pick = (id: string) => {
    setType(id);
    goal('calc_type', { type: id });
  };

  const bad = {
    addr: tried && !lead.addr.trim(),
    name: tried && !lead.name.trim(),
    phone: tried && !phoneOk(lead.phone),
    consent: tried && !consent,
    lines: tried && res.lines.length === 0,
  };
  const setL = (k: keyof typeof lead) => (e: Event) => setLead({ ...lead, [k]: (e.currentTarget as HTMLInputElement).value });

  async function onSubmit(e: Event) {
    e.preventDefault();
    setTried(true);
    const ok = { lines: res.lines.length > 0, addr: !!lead.addr.trim(), name: !!lead.name.trim(), phone: phoneOk(lead.phone) };
    if (!ok.lines || !ok.addr || !ok.name || !ok.phone || !consent) {
      const firstReq = cur.fields.find((f) => f.t === 'num' && f.req && !num(v[f.k]));
      focusFirst([!ok.lines && firstReq && 'f-' + cur.id + '-' + firstReq.k, !ok.addr && 'k-addr', !ok.name && 'k-name', !ok.phone && 'k-phone', !consent && 'k-consent']);
      return;
    }
    const l = { addr: lead.addr, org: lead.org, name: lead.name, phone: lead.phone, email: lead.email };
    const r = await submit({ ...l, data: { type, vals: v } });
    const k = kpFromCalc(type, v, l, r.kp?.no || localKpNumber(), r.kp?.date);
    setKp({ kp: k, token: r.kp?.token, ok: r.ok });
    goal('kp_generated', { source: 'calculator' });
    window.scrollTo({ top: (document.getElementById('calc')?.offsetTop || 0) - 80 });
  }

  if (kp) {
    return (
      <div id="calc">
        <KpView kp={kp.kp} token={kp.token} serverOk={kp.ok} phone={phone} backLabel="Изменить расчёт" onBack={() => setKp(null)} />
      </div>
    );
  }

  const totalText = (res.hasFrom ? 'от ' : '') + fmt(res.total) + ' ₽';

  return (
    <div id="calc" class="calc has-dock">
      <div class="calc__main">
        <section class="card calc__card" aria-labelledby="st1">
          <div class="calc__step">
            <Step n={1} />
            <h2 id="st1">Что на объекте?</h2>
          </div>
          <div class="calc__types" role="group" aria-label="Тип работ">
            {TYPES.map((t) => (
              <button key={t.id} type="button" class="calc__type" aria-pressed={t.id === type} onClick={() => pick(t.id)}>
                <span lang="ru" class="calc__type-l">{t.label}</span>
                <span class="calc__type-s">{t.sub}</span>
              </button>
            ))}
          </div>
        </section>

        <section class="card calc__card" aria-labelledby="st2">
          <div class="calc__step" style="margin-bottom:6px">
            <Step n={2} />
            <h2 id="st2">Параметры: {cur.label}</h2>
          </div>
          <p style="margin:0 0 18px;color:var(--muted);font-size:14px">
            {cur.note}{' '}
            <span class="nowrap">
              <span style="color:var(--accent-ink);font-weight:800">*</span> нужно для расчёта.
            </span>
          </p>
          {cur.promo && (
            <div class="calc__promo">
              <div style="flex:1 1 380px;min-width:0">
                <div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:var(--accent)">РЕКОМЕНДУЕМ ДЛЯ МОНОЛИТА</div>
                <div style="margin-top:6px;font-weight:800;font-size:20px;line-height:1.3">Фиксированный тариф: от 75&nbsp;000&nbsp;₽ за объект в месяц</div>
                <p style="margin:8px 0 0;color:var(--on-ink);font-size:15px">
                  Расчёт по ГОСТ зависит от числа захваток, классов бетона и графика бетонирования, поэтому заранее его трудно оценить точно. С пакетом цена известна сразу: сплошной контроль прочности всех конструкций без пересчётов за каждое испытание.
                </p>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;flex:0 0 auto">
                <a href="/ceny" class="btn btn--accent">Выбрать пакет</a>
                <span style="font-size:13px;color:var(--on-ink-2);text-align:center">или посчитайте по ГОСТ ниже</span>
              </div>
            </div>
          )}
          <div class="calc__fields">
            {cur.fields
              .filter((f) => isVisible(f, v))
              .map((f) => {
                const fid = 'f-' + cur.id + '-' + f.k;
                const hint = f.hintFn ? f.hintFn(v) : f.hint || '';
                const wide = f.wide || f.t === 'check' || f.t === 'head';
                if (f.t === 'head')
                  return (
                    <div key={f.k} class="calc__head" style="grid-column:1/-1">
                      <h3>{f.label}</h3>
                      {hint && <p>{hint}</p>}
                    </div>
                  );
                if (f.t === 'num') {
                  const empty = !num(v[f.k]);
                  return (
                    <div key={f.k} class="calc__f" style={wide ? 'grid-column:1/-1' : ''}>
                      <label for={fid} class="calc__label">
                        <span>
                          {f.label}
                          {f.req && (
                            <span aria-hidden="true" style="color:var(--accent-ink);margin-left:3px">
                              *
                            </span>
                          )}
                        </span>
                      </label>
                      <div class={'calc__box' + (f.req && empty ? ' is-need' : '')}>
                        <input
                          id={fid}
                          class="pin"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={String(v[f.k] ?? '')}
                          placeholder={f.ph || (f.req ? 'Введите значение' : 'Если есть, укажите')}
                          aria-required={f.req ? 'true' : undefined}
                          aria-describedby={hint ? fid + '-h' : undefined}
                          onInput={(e) => setV(f.k, (e.currentTarget as HTMLInputElement).value.replace(/[^0-9.,\s]/g, '').replace(/\s/g, ''))}
                        />
                        <span class="calc__unit">{f.unit}</span>
                      </div>
                      {hint && (
                        <div id={fid + '-h'} class="calc__hint">
                          {hint}
                        </div>
                      )}
                    </div>
                  );
                }
                if (f.t === 'seg')
                  return (
                    <div key={f.k} class="calc__f" style={wide ? 'grid-column:1/-1' : ''} role="group" aria-labelledby={fid + '-l'}>
                      <div id={fid + '-l'} class="calc__label">
                        {f.label}
                      </div>
                      <div class="chips" style="gap:6px">
                        {f.opts.map((o) => (
                          <button key={o[0]} type="button" class="chip chip--sm calc__seg" aria-pressed={v[f.k] === o[0]} onClick={() => setV(f.k, o[0])}>
                            {o[1]}
                          </button>
                        ))}
                      </div>
                      {hint && <div class="calc__hint">{hint}</div>}
                    </div>
                  );
                const on = !!v[f.k];
                return (
                  <div key={f.k} style="grid-column:1/-1">
                    <button type="button" role="switch" aria-checked={on} class={'calc__check' + (on ? ' is-on' : '')} onClick={() => setV(f.k, !on)}>
                      <span class="calc__tick" aria-hidden="true">
                        {on && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5C02B" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg>
                        )}
                      </span>
                      {f.label}
                    </button>
                    {hint && <div class="calc__hint" style="padding-left:4px;color:#6B5300">{hint}</div>}
                  </div>
                );
              })}
          </div>
        </section>

        <section class="card calc__card" style="padding:0;overflow:hidden" aria-labelledby="st3" aria-live="polite">
          <div class="calc__step" style="padding:18px 22px;margin:0;border-bottom:1px solid var(--line-2)">
            <Step n={3} />
            <h2 id="st3">Состав испытаний по нормативам</h2>
          </div>
          {res.lines.length === 0 ? (
            <div style={'padding:28px 22px;' + (bad.lines ? 'color:var(--danger);font-weight:700' : 'color:var(--muted)')}>Введите параметры объекта (поля со * обязательны). Здесь появится состав испытаний и стоимость.</div>
          ) : (
            res.lines.map((l, i) => (
              <div key={i} class="calc__line">
                <div style="flex:999 1 320px;min-width:0">
                  <div style="font-weight:700;line-height:1.4">{l.name}</div>
                  <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;font-size:13px">
                    <span class="tag tag--rule">{l.rule}</span>
                    {l.norm && <span class="tag">{l.norm}</span>}
                  </div>
                </div>
                <div style="flex:1 0 auto;margin-left:auto;text-align:right">
                  <div style="font-size:13px;color:#6B7076;white-space:nowrap">
                    {fmt(l.qty)} {l.unit} × {l.from ? 'от ' : ''}
                    {fmt(l.price)}&nbsp;₽
                  </div>
                  <div style="font-weight:800;font-size:19px;white-space:nowrap">
                    {l.from ? 'от ' : ''}
                    {fmt(l.sum)}&nbsp;₽
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

        <div class="card" style="border-radius:18px;padding:20px 22px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--text-2)">
          <h2 style="margin:0;font-weight:800;font-size:15px;color:var(--ink)">Как считает калькулятор</h2>
          <span>Количество испытаний определяется по нормативам, указанным у каждой строки, стоимость считается по действующему прайс-листу. Цены без НДС.</span>
          <span>Расчёт предварительный: состав работ уточняется по проекту и фактическим условиям объекта и фиксируется в договоре. Информация не является публичной офертой.</span>
          <span>
            Нужно испытание, которого нет в калькуляторе? Смотрите <a href="/ceny/rascenki">единичные расценки</a>.
          </span>
        </div>
      </div>

      <aside class="calc__aside" aria-label="Итог расчёта">
        <div class="calc__sum">
          <div style="font-size:18px;font-weight:800">Итог расчёта</div>
          <div style="background:var(--ink-2);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:6px">
            <span style="font-size:13px;color:var(--on-ink-2)">Объект</span>
            <span style="font-weight:800">{cur.label}</span>
            <span style="font-size:14px;color:var(--on-ink)">{res.summary}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:12px;font-size:15px;color:var(--on-ink)">
            <span>Испытаний и работ</span>
            <span style="font-weight:800;color:#fff">{res.lines.length}</span>
          </div>
          <div style="border-top:1px solid var(--ink-line);padding-top:14px;display:flex;flex-direction:column;gap:2px" aria-live="polite">
            <span style="color:var(--on-ink)">Стоимость, без НДС</span>
            <span class="calc__total">{totalText}</span>
            {res.hasFrom && <span style="font-size:13px;color:var(--on-ink-2)">Есть позиции с ценой «от», итог ориентировочный.</span>}
          </div>
          <form ref={formRef} id="calc-form" class="calc__form" onSubmit={onSubmit} noValidate>
            <h2 style="margin:0;font-weight:800;font-size:16px">Коммерческое предложение на ваш объект</h2>
            <div style="font-size:13px;color:var(--muted);margin-top:-6px">Заполните данные, и КП сформируется сразу. Его можно сохранить в PDF.</div>
            <Honeypot onValue={setHp} />
            <div class="field">
              <label class="label" for="k-addr">
                Адрес или название объекта <span aria-hidden="true" style="color:var(--accent-ink)">*</span>
              </label>
              <input id="k-addr" class="input" type="text" placeholder="Город, улица или ЖК" value={lead.addr} onInput={setL('addr')} aria-required="true" aria-invalid={bad.addr ? 'true' : undefined} />
            </div>
            <div class="field">
              <label class="label" for="k-org">
                Организация <small>(необязательно)</small>
              </label>
              <input id="k-org" class="input" type="text" autoComplete="organization" placeholder="ООО «Заказчик»" value={lead.org} onInput={setL('org')} />
            </div>
            <div class="field">
              <label class="label" for="k-name">
                Контактное лицо <span aria-hidden="true" style="color:var(--accent-ink)">*</span>
              </label>
              <input id="k-name" class="input" type="text" autoComplete="name" placeholder="Имя и фамилия" value={lead.name} onInput={setL('name')} aria-required="true" aria-invalid={bad.name ? 'true' : undefined} />
            </div>
            <div class="field">
              <label class="label" for="k-phone">
                Телефон <span aria-hidden="true" style="color:var(--accent-ink)">*</span>
              </label>
              <PhoneInput id="k-phone" value={lead.phone} onValue={(p) => setLead({ ...lead, phone: p })} invalid={bad.phone} required describedBy={bad.phone ? 'k-phone-err' : undefined} />
              {bad.phone && (
                <div class="err" id="k-phone-err" role="alert">
                  {PHONE_ERR}
                </div>
              )}
            </div>
            <div class="field">
              <label class="label" for="k-email">
                E-mail <small>(пришлём КП)</small>
              </label>
              <input id="k-email" class="input" type="email" inputMode="email" autoComplete="email" placeholder="name@company.ru" value={lead.email} onInput={setL('email')} />
            </div>
            {(bad.addr || bad.name || bad.lines) && (
              <div class="err" role="alert">
                {bad.lines ? 'Введите параметры объекта на шаге 2. ' : ''}
                {bad.addr || bad.name ? 'Заполните поля со звёздочкой.' : ''}
              </div>
            )}
            <Consent id="k-consent" checked={consent} onChange={setConsent} invalid={bad.consent} />
            <button type="submit" class="btn btn--accent btn--block" disabled={status === 'sending'} aria-busy={status === 'sending'}>
              {status === 'sending' ? 'Отправляем…' : 'Получить предложение'}
            </button>
          </form>
          <div style="border-top:1px solid var(--ink-line);padding-top:14px;font-size:14px;color:var(--on-ink)">
            Вопросы по расчёту:{' '}
            <a href={'tel:+' + phone.replace(/\D/g, '')} style="color:#fff;font-weight:800;text-decoration:none">
              {phone}
            </a>
          </div>
        </div>
      </aside>

      <div class="dock" role="region" aria-label="Итог расчёта">
        <div style="display:flex;flex-direction:column;line-height:1.2;min-width:0">
          <span style="font-size:12px;color:var(--on-ink-2)">{res.lines.length ? 'Итого, без НДС' : 'Параметры ещё не указаны'}</span>
          <b>{totalText}</b>
        </div>
        <button type="button" class="btn btn--accent btn--sm" onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          Получить КП
        </button>
      </div>
    </div>
  );
}

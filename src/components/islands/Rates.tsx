import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { goal, save, store } from '../../lib/client';
import { rateSections, rateViews } from '../../lib/data';
import { fmt, plural } from '../../lib/format';
import { cartLines, kpFromRates, localKpNumber, type Cart, type Kp } from '../../lib/kp';
import Consent from './Consent';
import Honeypot from './Honeypot';
import KpView from './KpView';
import PhoneInput from './PhoneInput';
import { focusFirst, phoneOk, PHONE_ERR, useLead } from './useLead';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
const HAY = new Map(rateViews.map((r) => [r.id, norm(r.name + ' ' + r.norm + ' ' + r.code + ' ' + r.subsection)]));
const CART_KEY = 'nicsmk.rates.cart';
const positions = (n: number) => n + ' ' + plural(n, 'позиция', 'позиции', 'позиций');

export default function Rates({ phone }: { phone: string }) {
  const [q, setQ] = useState('');
  const [sec, setSec] = useState('all');
  const [cart, setCart] = useState<Cart>({});
  const [lead, setLead] = useState({ addr: '', name: '', phone: '', email: '' });
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [kp, setKp] = useState<{ kp: Kp; token?: string; ok: boolean } | null>(null);
  const { status, submit, setHp } = useLead('rates');
  const loaded = useRef(false);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const c = store<Cart>(CART_KEY, {});
    const valid: Cart = {};
    for (const k of Object.keys(c)) if (rateViews.some((r) => String(r.id) === k)) valid[k] = c[k];
    setCart(valid);
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) save(CART_KEY, cart);
  }, [cart]);

  const words = norm(q.trim()).split(/\s+/).filter(Boolean);
  const match = (id: number) => words.every((w) => HAY.get(id)!.includes(w));

  const view = useMemo(
    () =>
      rateSections
        .filter((s) => sec === 'all' || s.id === sec)
        .map((s) => ({ ...s, subs: s.subs.map((g) => ({ ...g, rows: g.rows.filter((r) => match(r.id)) })).filter((g) => g.rows.length) }))
        .filter((s) => s.subs.length),
    [q, sec],
  );
  const found = view.reduce((n, s) => n + s.subs.reduce((m, g) => m + g.rows.length, 0), 0);
  // счётчики чипов учитывают поиск
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const r of rateViews) if (match(r.id)) (c[r.section] = (c[r.section] || 0) + 1), c.all++;
    return c;
  }, [q]);

  const lines = cartLines(cart);
  const total = Math.round(lines.reduce((s, l) => s + l.sum, 0) * 100) / 100;
  const hasFrom = lines.some((l) => l.from);
  const totalText = (hasFrom ? 'от ' : '') + fmt(total) + ' ₽';

  const toggle = (id: number) => {
    const c = { ...cart };
    if (String(id) in c) delete c[String(id)];
    else c[String(id)] = '1';
    setCart(c);
  };
  const setQty = (id: number, v: string) => setCart({ ...cart, [String(id)]: v.replace(/[^0-9.,]/g, '').slice(0, 9) });
  const step = (id: number, d: number) => {
    const n = parseFloat(String(cart[String(id)]).replace(',', '.')) || 0;
    const next = d > 0 ? Math.floor(n) + 1 : Math.ceil(n) - 1;
    const c = { ...cart };
    if (next <= 0) delete c[String(id)];
    else c[String(id)] = String(next);
    setCart(c);
  };

  const bad = { addr: tried && !lead.addr.trim(), name: tried && !lead.name.trim(), phone: tried && !phoneOk(lead.phone), consent: tried && !consent };
  const setL = (k: keyof typeof lead) => (e: Event) => setLead({ ...lead, [k]: (e.currentTarget as HTMLInputElement).value });

  async function onSubmit(e: Event) {
    e.preventDefault();
    setTried(true);
    const ok = { addr: !!lead.addr.trim(), name: !!lead.name.trim(), phone: phoneOk(lead.phone) };
    if (!ok.addr || !ok.name || !ok.phone || !consent) {
      focusFirst([!ok.addr && 'r-addr', !ok.name && 'r-name', !ok.phone && 'r-phone', !consent && 'r-consent']);
      return;
    }
    const r = await submit({ ...lead, data: { cart } });
    setKp({ kp: kpFromRates(cart, lead, r.kp?.no || localKpNumber(), r.kp?.date), token: r.kp?.token, ok: r.ok });
    goal('kp_generated', { source: 'rates' });
    window.scrollTo({ top: (document.getElementById('rates')?.offsetTop || 0) - 80 });
  }

  if (kp) {
    return (
      <div id="rates">
        <KpView
          kp={kp.kp}
          token={kp.token}
          serverOk={kp.ok}
          phone={phone}
          backLabel="Вернуться к расценкам"
          onBack={() => {
            setKp(null);
            if (kp.ok) setCart({});
          }}
        />
      </div>
    );
  }

  return (
    <div id="rates" class="rt has-dock">
      <div class="rt__main">
        <div class="card" style="border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:14px">
          <label for="price-search" class="sr-only">
            Поиск по названию испытания или ГОСТу
          </label>
          <div class="rt__search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B6066" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input id="price-search" type="search" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} placeholder="Например: керн, осадка конуса, ГОСТ 10180, анкер" autoComplete="off" />
            {q && (
              <button type="button" class="rt__clear" onClick={() => setQ('')} aria-label="Очистить поиск">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14171A" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            )}
          </div>
          <div class="chips" style="gap:6px" role="group" aria-label="Разделы прайса">
            {[{ id: 'all', short: 'Все разделы' }, ...rateSections].map((s) => (
              <button key={s.id} type="button" class="chip chip--sm" aria-pressed={sec === s.id} onClick={() => setSec(s.id)}>
                {s.short} <span class="cnt">{counts[s.id] || 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div style="font-size:14px;color:var(--muted);padding:0 4px" aria-live="polite">
          Найдено позиций: <b style="color:var(--ink)">{found}</b>
        </div>
        {found === 0 && (
          <div style="background:#fff;border:1px dashed var(--line-3);border-radius:18px;padding:40px 24px;text-align:center">
            <div style="font-weight:800;font-size:18px">Ничего не нашли — позвоните</div>
            <p style="margin:8px 0 16px;color:var(--muted)">Попробуйте другое слово или позвоните нам — подберём испытание под задачу.</p>
            <a class="btn btn--dark btn--sm" href={'tel:+' + phone.replace(/\D/g, '')}>
              {phone}
            </a>
          </div>
        )}
        {view.map((s) => (
          <section key={s.id} class="rt__sec" aria-labelledby={'sec-' + s.id}>
            <div class="rt__sec-h">
              <span style="font-family:var(--f-display);font-size:14px;color:var(--accent)">{s.id}</span>
              <h2 id={'sec-' + s.id}>{s.title}</h2>
            </div>
            {s.subs.map((g) => (
              <div key={g.title}>
                {g.title && <h3 class="rt__sub">{g.title}</h3>}
                {g.rows.map((r) => {
                  const inCart = String(r.id) in cart;
                  return (
                    <div key={r.id} class="rt__row">
                      <div style="flex:999 1 300px;min-width:0;display:flex;gap:14px">
                        <span style="font-size:13px;color:#6B7076;font-weight:700;min-width:34px;padding-top:2px">{r.code}</span>
                        <div style="min-width:0">
                          <div style="font-weight:600;line-height:1.4">{r.name}</div>
                          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;font-size:13px">
                            {r.norm && <span class="tag">{r.norm}</span>}
                            <span class="tag">за {r.unit}</span>
                          </div>
                        </div>
                      </div>
                      <div style="flex:1 0 auto;display:flex;align-items:center;justify-content:flex-end;gap:14px;margin-left:auto">
                        <div style="text-align:right;white-space:nowrap">
                          {r.priceFrom && <span style="font-size:13px;color:#6B7076;font-weight:700;margin-right:4px">от</span>}
                          <span style="font-weight:800;font-size:20px">{fmt(r.price)}&nbsp;₽</span>
                        </div>
                        <button type="button" class={'rt__add' + (inCart ? ' is-on' : '')} aria-pressed={inCart} aria-label={(inCart ? 'Убрать из расчёта: ' : 'Добавить в расчёт: ') + r.name} onClick={() => toggle(r.id)}>
                          {inCart ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C02B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                          )}
                          <span aria-hidden="true">{inCart ? 'В расчёте' : 'В расчёт'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
        <div class="card" style="border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:8px;font-size:14px;color:var(--text-2)">
          <h2 style="margin:0;font-weight:800;font-size:16px;color:var(--ink)">Условия</h2>
          <span>Все цены указаны без НДС.</span>
          <span>Цена с пометкой «от» — минимальная; итоговая стоимость зависит от объёма работ и условий на объекте.</span>
          <span>Выезд специалиста оплачивается отдельно (раздел «Выезд специалиста»), в пределах Москвы и Московской области.</span>
          <span>Информация не является публичной офертой; цены без НДС; итоговая стоимость фиксируется в договоре.</span>
        </div>
      </div>

      <aside ref={asideRef} id="rates-cart" class="calc__aside" aria-label="Ваш расчёт">
        <div class="calc__sum">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <span style="font-size:18px;font-weight:800">Калькулятор стоимости</span>
            {lines.length > 0 && (
              <button type="button" onClick={() => setCart({})} style="min-height:36px;border:0;background:transparent;color:var(--on-ink);font-size:14px;font-weight:700;text-decoration:underline">
                Очистить
              </button>
            )}
          </div>
          {lines.length === 0 ? (
            <div style="border:1px dashed var(--ink-line-2);border-radius:14px;padding:22px;color:var(--on-ink);font-size:15px;display:flex;flex-direction:column;gap:10px">
              <span>
                <b style="color:#fff">1.</b> Нажмите «В расчёт» у нужных испытаний.
              </span>
              <span>
                <b style="color:#fff">2.</b> Впишите объёмы: пробы, серии, м², км.
              </span>
              <span>
                <b style="color:#fff">3.</b> Получите КП — перезвоним за 30 минут.
              </span>
            </div>
          ) : (
            <>
              <div style="font-size:13px;color:var(--on-ink)">Впишите объём по каждой позиции — итог пересчитается сразу.</div>
              <ul style="display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none">
                {lines.map((c) => (
                  <li key={c.id} style="background:var(--ink-2);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
                    <div style="display:flex;justify-content:space-between;gap:10px">
                      <div style="font-size:14px;line-height:1.35">{c.name}</div>
                      <button type="button" onClick={() => toggle(c.id)} aria-label={'Убрать позицию: ' + c.name} class="rt__x">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    </div>
                    <div style="font-size:12px;color:var(--on-ink-2)">
                      {c.from ? 'от ' : ''}
                      {fmt(c.price)}&nbsp;₽ за {c.unit}
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                      <div class="rt__qty">
                        <button type="button" onClick={() => step(c.id, -1)} aria-label="Уменьшить количество">
                          −
                        </button>
                        <input type="text" inputMode="decimal" value={String(cart[String(c.id)])} onInput={(e) => setQty(c.id, (e.currentTarget as HTMLInputElement).value)} aria-label={'Количество: ' + c.name} />
                        <button type="button" onClick={() => step(c.id, 1)} aria-label="Увеличить количество">
                          +
                        </button>
                      </div>
                      <span style="font-weight:800;white-space:nowrap">
                        {c.from ? 'от ' : ''}
                        {fmt(c.sum)}&nbsp;₽
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div style="border-top:1px solid var(--ink-line);padding-top:14px;display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
                <span style="color:var(--on-ink)">Итого, без НДС</span>
                <span class="calc__total" style="font-size:26px">{totalText}</span>
              </div>
              {hasFrom && <div style="font-size:13px;color:var(--on-ink-2)">В расчёте есть позиции с ценой «от» — итог ориентировочный.</div>}
              <form class="calc__form" onSubmit={onSubmit} noValidate>
                <h2 style="margin:0;font-weight:800;font-size:16px">Получить предложение</h2>
                <div style="font-size:13px;color:var(--muted);margin-top:-6px">КП сформируется сразу; инженер проверит объёмы и перезвонит.</div>
                <Honeypot onValue={setHp} />
                <div class="field">
                  <label class="label" for="r-addr">
                    Объект <span aria-hidden="true" style="color:var(--accent-ink)">*</span>
                  </label>
                  <input id="r-addr" class="input" type="text" placeholder="Адрес или название объекта" value={lead.addr} onInput={setL('addr')} aria-required="true" aria-invalid={bad.addr ? 'true' : undefined} />
                </div>
                <div class="field">
                  <label class="label" for="r-name">
                    Контактное лицо <span aria-hidden="true" style="color:var(--accent-ink)">*</span>
                  </label>
                  <input id="r-name" class="input" type="text" autoComplete="name" placeholder="Имя и фамилия" value={lead.name} onInput={setL('name')} aria-required="true" aria-invalid={bad.name ? 'true' : undefined} />
                </div>
                <div class="field">
                  <label class="label" for="r-phone">
                    Телефон <span aria-hidden="true" style="color:var(--accent-ink)">*</span>
                  </label>
                  <PhoneInput id="r-phone" value={lead.phone} onValue={(p) => setLead({ ...lead, phone: p })} invalid={bad.phone} required describedBy={bad.phone ? 'r-phone-err' : undefined} />
                  {bad.phone && (
                    <div class="err" id="r-phone-err" role="alert">
                      {PHONE_ERR}
                    </div>
                  )}
                </div>
                <div class="field">
                  <label class="label" for="r-email">
                    E-mail <small>(пришлём КП)</small>
                  </label>
                  <input id="r-email" class="input" type="email" inputMode="email" autoComplete="email" placeholder="name@company.ru" value={lead.email} onInput={setL('email')} />
                </div>
                {(bad.addr || bad.name) && (
                  <div class="err" role="alert">
                    Заполните поля со звёздочкой.
                  </div>
                )}
                <Consent id="r-consent" checked={consent} onChange={setConsent} invalid={bad.consent} />
                <button type="submit" class="btn btn--accent btn--block" disabled={status === 'sending'} aria-busy={status === 'sending'}>
                  {status === 'sending' ? 'Отправляем…' : 'Получить предложение'}
                </button>
              </form>
            </>
          )}
          <div style="border-top:1px solid var(--ink-line);padding-top:14px;display:flex;flex-direction:column;gap:8px;font-size:14px;color:var(--on-ink)">
            <span>Нужна консультация по составу испытаний?</span>
            <a href={'tel:+' + phone.replace(/\D/g, '')} style="color:#fff;font-weight:800;font-size:17px;text-decoration:none">
              {phone}
            </a>
          </div>
        </div>
      </aside>

      {lines.length > 0 && (
        <div class="dock" role="region" aria-label="Ваш расчёт">
          <div style="display:flex;flex-direction:column;line-height:1.2;min-width:0">
            <span style="font-size:12px;color:var(--on-ink-2)">В расчёте {positions(lines.length)}</span>
            <b>{totalText}</b>
          </div>
          <button type="button" class="btn btn--accent btn--sm" onClick={() => asideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            К расчёту
          </button>
        </div>
      )}
    </div>
  );
}

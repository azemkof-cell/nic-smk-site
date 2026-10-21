/**
 * Коммерческое предложение: модель и HTML-шаблон.
 * Один шаблон — для превью на сайте и для PDF на сервере.
 * Подпись и печать передаются только сервером (opts.sign / opts.stamp) — в браузер не попадают.
 */
import { compute, type Vals } from './calc';
import { packages, rateViews, requisites } from './data';
import { escapeHtml as e, fmt, months as monthsText } from './format';

export type KpSource = 'calculator' | 'package' | 'rates';

export interface KpLead {
  org?: string;
  name: string;
  phone: string;
  email?: string;
  addr?: string;
}
export interface KpRow {
  name: string;
  rule: string;
  norm: string;
  qty: number;
  unit: string;
  price: number;
  sum: number;
  from: boolean;
}
export interface Kp {
  no: string;
  date: string; // ISO
  source: KpSource;
  subject: string; // «на оказание услуг строительного контроля»
  intro: string;
  object: string; // вид работ
  summary: string; // краткое описание параметров
  lead: KpLead;
  rows: KpRow[];
  pack?: { name: string; months: number; price: number; items: string[] };
  total: number;
  hasFrom: boolean;
}

const pad = (x: number) => (x < 10 ? '0' : '') + x;

export function kpNumber(d: Date, seq: number): string {
  return 'КП-' + pad(d.getDate()) + pad(d.getMonth() + 1) + String(d.getFullYear()).slice(2) + '-' + String(seq).padStart(3, '0');
}
/** Временный номер в браузере, пока сервер не выдал сквозной */
export function localKpNumber(d = new Date()): string {
  return kpNumber(d, 100 + Math.floor(Math.random() * 900));
}
export function kpDates(iso: string) {
  const d = new Date(iso);
  const u = new Date(d.getTime() + 30 * 86400000);
  return {
    date: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }),
    until: u.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' }),
  };
}

/* ---------- Сборка КП из трёх источников ---------- */

export function kpFromCalc(type: string, vals: Vals, lead: KpLead, no: string, date = new Date().toISOString()): Kp {
  const r = compute(type, vals);
  const sk = r.type.id === 'sk';
  return {
    no,
    date,
    source: 'calculator',
    subject: sk ? 'на оказание услуг строительного контроля' : 'на проведение лабораторных испытаний',
    intro: sk
      ? 'ООО «НИЦ СМК» предлагает осуществлять строительный контроль на объекте на весь период строительства. Стоимость определена по нормативу затрат заказчика на строительный контроль (ПП РФ от 21.06.2010 № 468). Испытания материалов выполняет собственная аккредитованная лаборатория.'
      : 'ООО «НИЦ СМК» предлагает выполнить лабораторный контроль на объекте. Состав и количество испытаний определены по нормативным документам исходя из параметров объекта. Испытания выполняет собственная аккредитованная испытательная лаборатория.',
    object: r.type.label.replace(/­/g, ''),
    summary: r.summary,
    lead,
    rows: r.lines.map((l) => ({ name: l.name, rule: l.rule, norm: l.norm, qty: l.qty, unit: l.unit, price: l.price, sum: l.sum, from: l.from })),
    total: r.total,
    hasFrom: r.hasFrom,
  };
}

export function clampMonths(m: unknown): number {
  const n = Math.round(parseFloat(String(m ?? '').replace(',', '.')) || 1);
  return Math.min(36, Math.max(1, n));
}

export function kpFromPackage(packId: string, monthsRaw: unknown, lead: KpLead, no: string, date = new Date().toISOString()): Kp {
  const p = packages.packages.find((x) => x.id === packId) || packages.packages.find((x) => x.recommended)!;
  const m = clampMonths(monthsRaw);
  const total = p.price * m;
  return {
    no,
    date,
    source: 'package',
    subject: 'на лабораторное сопровождение объекта, пакет «' + p.name + '»',
    intro: 'ООО «НИЦ СМК» предлагает выполнить лабораторный контроль монолитных конструкций на объекте по пакету «' + p.name + '». Испытания выполняет собственная аккредитованная испытательная лаборатория.',
    object: 'Сплошной контроль прочности монолитных конструкций',
    summary: 'пакет «' + p.name + '», ' + monthsText(m),
    lead,
    rows: [
      {
        name: 'Пакет «' + p.name + '»: ' + p.includes.join('; ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
        rule: '1 объект × ' + monthsText(m) + ' × ' + fmt(p.price) + ' ₽',
        norm: 'ГОСТ 18105, 22690, 17624',
        qty: m,
        unit: 'мес.',
        price: p.price,
        sum: total,
        from: false,
      },
    ],
    pack: { name: p.name, months: m, price: p.price, items: p.includes },
    total,
    hasFrom: false,
  };
}

export type Cart = Record<string, string | number>;

export function cartLines(cart: Cart) {
  const out: (KpRow & { id: number; code: string })[] = [];
  for (const r of rateViews) {
    if (!Object.prototype.hasOwnProperty.call(cart, String(r.id))) continue;
    const q = parseFloat(String(cart[String(r.id)]).replace(',', '.'));
    const qty = isNaN(q) || q < 0 ? 0 : Math.min(q, 1e6);
    out.push({ id: r.id, code: r.code, name: r.name, rule: r.sectionTitle + ' · ' + r.code, norm: r.norm, qty, unit: r.unit, price: r.price, sum: Math.round(qty * r.price * 100) / 100, from: r.priceFrom });
  }
  return out;
}

export function kpFromRates(cart: Cart, lead: KpLead, no: string, date = new Date().toISOString()): Kp {
  const rows = cartLines(cart).filter((r) => r.qty > 0);
  const total = Math.round(rows.reduce((s, r) => s + r.sum, 0) * 100) / 100;
  return {
    no,
    date,
    source: 'rates',
    subject: 'на проведение лабораторных испытаний',
    intro: 'ООО «НИЦ СМК» предлагает выполнить испытания и работы по единичным расценкам прайс-листа 2026 года. Испытания выполняет собственная аккредитованная испытательная лаборатория.',
    object: 'Испытания по единичным расценкам',
    summary: rows.length + ' ' + (rows.length % 10 === 1 && rows.length % 100 !== 11 ? 'позиция' : rows.length % 10 >= 2 && rows.length % 10 <= 4 && (rows.length % 100 < 12 || rows.length % 100 > 14) ? 'позиции' : 'позиций'),
    lead,
    rows: rows.map(({ id: _i, code: _c, ...r }) => r),
    total,
    hasFrom: rows.some((r) => r.from),
  };
}

/* ---------- HTML ---------- */

const C = {
  ink: '#14171A',
  muted: '#5B6066',
  text2: '#3A3F45',
  line: '#E2E2DC',
  line2: '#ECECE6',
  accent: '#F5C02B',
  wash: '#FDF6DD',
};

const logo = `<span style="flex:none;width:48px;height:48px;background:${C.accent};border-radius:10px;display:flex;align-items:center;justify-content:center"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/></svg></span>`;

export function kpHtml(kp: Kp, opts: { sign?: string; stamp?: string } = {}): string {
  const { date, until } = kpDates(kp.date);
  const ct = requisites.contacts;
  const from = (b: boolean) => (b ? 'от ' : '');
  const client = (kp.lead.org || '').trim() || kp.lead.name.trim();
  const contact = [kp.lead.name.trim(), kp.lead.phone.trim(), (kp.lead.email || '').trim()].filter(Boolean).join(', ');
  const totalText = from(kp.hasFrom) + fmt(kp.total) + ' ₽';

  let body: string;
  if (kp.pack) {
    const p = kp.pack;
    body = `<div style="margin-top:20px;border:1px solid ${C.line};border-radius:12px;overflow:hidden">
<div style="background:${C.ink};color:#fff;padding:12px 16px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 12px;font-weight:800"><span>Пакет «${e(p.name)}»</span><span style="white-space:nowrap">1 объект × ${e(monthsText(p.months))} × ${e(fmt(p.price))} ₽</span></div>
<div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">${p.items.map((i) => `<div style="display:flex;gap:10px"><span style="color:#C79A12;font-weight:800">✓</span><span>${e(i)}</span></div>`).join('')}</div>
<div style="border-top:2px solid ${C.ink};background:${C.wash};padding:14px 16px;display:flex;justify-content:space-between;gap:12px;font-weight:800"><span>Итого за ${e(monthsText(p.months))}, без НДС</span><span style="font-size:18px;white-space:nowrap">${e(totalText)}</span></div>
</div>`;
  } else {
    const rows = kp.rows
      .map(
        (r, i) => `<tr style="border-top:1px solid ${C.line2};vertical-align:top">
<td style="padding:10px;color:${C.muted}">${i + 1}</td>
<td style="padding:10px"><div style="font-weight:600">${e(r.name)}</div><div style="font-size:12px;color:#6B7076;margin-top:2px">${e(r.rule)}</div></td>
<td style="padding:10px;font-size:12px;color:${C.text2}">${e(r.norm || '—')}</td>
<td style="padding:10px;text-align:right;white-space:nowrap">${e(fmt(r.qty) + ' ' + r.unit)}</td>
<td style="padding:10px;text-align:right;white-space:nowrap">${e(from(r.from) + fmt(r.price))}</td>
<td style="padding:10px;text-align:right;white-space:nowrap;font-weight:700">${e(from(r.from) + fmt(r.sum))}</td>
</tr>`,
      )
      .join('');
    body = `<div class="kp-table" style="margin-top:22px;overflow-x:auto;border:1px solid ${C.line};border-radius:12px">
<table style="width:100%;min-width:640px;border-collapse:collapse;font-size:14px">
<thead><tr style="background:${C.ink};color:#fff;text-align:left">
<th scope="col" style="padding:12px 10px;width:36px">№</th><th scope="col" style="padding:12px 10px">Наименование работ</th><th scope="col" style="padding:12px 10px">Норматив</th>
<th scope="col" style="padding:12px 10px;text-align:right;white-space:nowrap">Кол-во</th><th scope="col" style="padding:12px 10px;text-align:right;white-space:nowrap">Цена, ₽</th><th scope="col" style="padding:12px 10px;text-align:right;white-space:nowrap">Сумма, ₽</th>
</tr></thead>
<tbody>${rows}
<tr style="border-top:2px solid ${C.ink};background:${C.wash}"><td colspan="5" style="padding:14px 10px;font-weight:800">Итого, без НДС</td><td style="padding:14px 10px;text-align:right;font-weight:800;font-size:17px;white-space:nowrap">${e(totalText)}</td></tr>
</tbody></table></div>`;
  }

  const signImgs =
    (opts.sign ? `<img src="${opts.sign}" alt="" style="position:absolute;left:40px;top:6px;width:120px;height:auto;z-index:2">` : '') +
    (opts.stamp ? `<img src="${opts.stamp}" alt="" style="position:absolute;right:0;top:-10px;width:150px;height:auto;opacity:.92;z-index:0">` : '');

  return `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:3px solid ${C.accent}">
<div style="display:flex;gap:14px;align-items:flex-start">${logo}
<div style="font-size:13px;line-height:1.5;color:${C.text2}">
<div style="font-weight:800;color:${C.ink};font-size:14px">ООО «НИЦ СМК»</div>
<div>Научно-испытательный центр строительных материалов и конструкций</div>
<div>${e(ct.labAddress)}</div>
<div>ИНН 9715387698 · КПП 771501001 · ОГРН 1207700275903</div>
<div>${e(ct.phone)} · ${e(ct.email)}</div>
</div></div>
<div style="font-size:13px;color:${C.text2};text-align:right"><div>Аттестат аккредитации</div><div style="font-weight:700;color:${C.ink}">№ RU.АСК.ИЛ.1132</div></div>
</div>
<h2 style="margin:28px 0 4px;font-family:'Unbounded',sans-serif;font-weight:600;font-size:clamp(20px,2.6vw,28px);line-height:1.25">Коммерческое предложение № ${e(kp.no)}</h2>
<div style="font-weight:700">${e(kp.subject)}</div>
<div style="color:${C.muted}">от ${e(date)} · действительно до ${e(until)}</div>
<div style="margin-top:22px;display:grid;grid-template-columns:minmax(110px,.35fr) minmax(0,1fr);gap:8px 16px">
<span style="color:${C.muted}">Заказчик</span><span style="font-weight:700;overflow-wrap:anywhere">${e(client)}</span>
<span style="color:${C.muted}">Контакт</span><span style="overflow-wrap:anywhere">${e(contact)}</span>
<span style="color:${C.muted}">Объект</span><span style="font-weight:700;overflow-wrap:anywhere">${e((kp.lead.addr || '').trim() || 'адрес уточняется')}</span>
<span style="color:${C.muted}">Вид работ</span><span>${e(kp.object)} — ${e(kp.summary)}</span>
</div>
<p style="margin:22px 0 0;line-height:1.6">${e(kp.intro)}</p>
${body}
<div style="margin-top:22px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:${C.text2}">
<div style="font-weight:800;color:${C.ink}">Условия</div>
<span>— Цены указаны без НДС.</span>
${kp.hasFrom ? '<span>— Цены с пометкой «от» — минимальные; точная стоимость — после уточнения объёмов по проекту и условиям объекта.</span>' : ''}
${kp.pack ? `<span>— Стоимость пакета — ${e(fmt(kp.pack.price))} ₽ за один объект в месяц, без НДС.</span>` : ''}
<span>— Сроки выполнения работ согласовываются при заключении договора.</span>
<span>— Информация не является публичной офертой; итоговая стоимость фиксируется в договоре.</span>
<span>— Срок действия предложения: 30 календарных дней (до ${e(until)}).</span>
</div>
<div style="margin-top:32px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:20px">
<div style="position:relative;font-size:14px;min-height:150px;padding-right:150px">
<div>Главный специалист ООО «НИЦ СМК»</div>
<div style="margin-top:34px;color:${C.muted};position:relative;z-index:1">_________________ / К. И. Стрючкова /</div>
${signImgs}
</div>
<div style="font-size:13px;color:${C.muted};text-align:right">Вопросы по предложению:<br><b style="color:${C.ink}">${e(ct.phone)}</b> · ${e(ct.email)}</div>
</div>`;
}

/** Текстовая версия для письма и Telegram */
export function kpText(kp: Kp): string {
  const { date, until } = kpDates(kp.date);
  const from = (b: boolean) => (b ? 'от ' : '');
  const lines = kp.rows.map((r, i) => `${i + 1}. ${r.name} — ${fmt(r.qty)} ${r.unit} × ${from(r.from)}${fmt(r.price)} = ${from(r.from)}${fmt(r.sum)} ₽`);
  return [
    `Коммерческое предложение ${kp.no} от ${date} (до ${until})`,
    kp.subject,
    `Заказчик: ${kp.lead.org || '—'}`,
    `Контакт: ${kp.lead.name}, ${kp.lead.phone}${kp.lead.email ? ', ' + kp.lead.email : ''}`,
    `Объект: ${kp.lead.addr || 'адрес уточняется'}`,
    `Вид работ: ${kp.object} — ${kp.summary}`,
    '',
    ...lines,
    '',
    `Итого без НДС: ${from(kp.hasFrom)}${fmt(kp.total)} ₽`,
  ].join('\n');
}

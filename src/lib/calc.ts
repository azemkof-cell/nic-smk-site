/**
 * Калькулятор по объекту. Чистые функции: один и тот же код считает в браузере
 * и повторно на сервере (/api/lead), цены — только из /data.
 */
import { calcConfig as CFG, indices, rateById } from './data';
import { fmt, num } from './format';

export type Vals = Record<string, string | boolean>;

export interface Line {
  name: string;
  norm: string;
  rule: string;
  qty: number;
  unit: string;
  price: number;
  from: boolean;
}

type FieldBase = { k: string; label: string; hint?: string; hintFn?: (v: Vals) => string; wide?: boolean; only?: [string, string | boolean]; notOnly?: [string, string | boolean] };
export type Field =
  | (FieldBase & { t: 'num'; unit: string; req?: boolean; ph?: string })
  | (FieldBase & { t: 'seg'; def: string; opts: [string, string][] })
  | (FieldBase & { t: 'check'; def: boolean | ((v: Vals) => boolean) })
  | (FieldBase & { t: 'head' });

export interface CalcType {
  id: string;
  label: string;
  sub: string;
  note: string;
  promo?: boolean;
  fields: Field[];
  calc: (v: Vals) => Line[];
  sum: (v: Vals) => string;
}

type PriceRef = { rate?: number; price?: number; from?: boolean };
/** Цена позиции калькулятора: из rates.json по коду или собственная */
export function price(ref: PriceRef): { price: number; from: boolean } {
  if (ref.rate != null) {
    const r = rateById(ref.rate);
    if (!r) throw new Error('Нет позиции прайса ' + ref.rate);
    return { price: r.price, from: ref.from ?? r.priceFrom };
  }
  return { price: ref.price ?? 0, from: !!ref.from };
}

const C = Math.ceil;
const loc = (x: number, d = 2) => x.toLocaleString('ru-RU', { maximumFractionDigits: d }).replace(/[\s ]/g, ' ');

type Own = { price: number; from: boolean; own: true };
const own = (p: number, from = false): Own => ({ price: p, from, own: true });

function L(name: string, norm: string, rule: string, qty: number, unit: string, ref: PriceRef | Own): Line {
  const p = 'own' in ref ? ref : price(ref);
  return { name, norm, rule, qty, unit, price: p.price, from: p.from };
}

/* ---------- ПП РФ № 468 ---------- */
export function pp468(costMln: number, indexId: string) {
  const ind = indices.items.find((i) => i.id === indexId) || indices.items.find((i) => i.id === indices.default)!;
  const c2000 = costMln / ind.index;
  const row = indices.pp468.scale.find((r) => c2000 <= r.upToMlnRub2000);
  let H: number, N: number;
  if (row) {
    H = row.percent;
    N = row.staff;
  } else {
    H = Math.round(((0.04193 * Math.pow(c2000, 0.8022)) / c2000) * 10000) / 100;
    N = 28 + Math.floor((c2000 - 900) / 30);
  }
  return { index: ind, c2000, percent: H, staff: N, sum: Math.round((costMln * 1e6 * H) / 100) };
}

export function idocPercent(costMln: number): number {
  return CFG.sk.idoc.tiers.find((t) => t.upToMln == null || costMln <= t.upToMln)!.percent;
}

/** Линейная шкала стоимости обследования свыше 100 м² */
export function surveyScale(A: number): number {
  const S = CFG.survey;
  const K = S.scale;
  let tot = 0;
  if (A >= K[K.length - 1].m2) tot = K[K.length - 1].price + (A - K[K.length - 1].m2) * S.abovePerM2;
  else {
    for (let q = 1; q < K.length; q++) {
      if (A <= K[q].m2) {
        tot = K[q - 1].price + ((A - K[q - 1].m2) * (K[q].price - K[q - 1].price)) / (K[q].m2 - K[q - 1].m2);
        break;
      }
    }
  }
  return Math.max(S.minPrice, Math.round(tot / S.roundTo) * S.roundTo);
}

const idxHint = (v: Vals) => {
  const i = indices.items.find((x) => x.id === v.ind) || indices.items.find((x) => x.id === indices.default)!;
  return 'Норматив ПП № 468 задан в ценах 2000 года, поэтому стоимость объекта пересчитывается индексом Минстроя. Для каждого назначения он свой: сейчас ' + loc(i.index) + ' (III кв. 2026). Не знаете? Оставьте «Другое».';
};

export const TYPES: CalcType[] = [
  {
    id: 'sk',
    label: 'Строительный контроль',
    sub: 'по стоимости строительства',
    note: 'Стоимость строительного контроля по нормативу затрат заказчика (ПП РФ от 21.06.2010 № 468). Для коммерческих объектов цена договорная и может быть ниже.',
    fields: [
      { k: 'cost', t: 'num', label: 'Стоимость строительства без НДС', unit: 'млн ₽', req: true, ph: 'Например, по смете', hint: 'Общая сметная стоимость в текущих ценах, без стоимости земли.' },
      { k: 'ind', t: 'seg', label: 'Назначение объекта', def: indices.default, wide: true, opts: indices.items.map((i) => [i.id, i.label] as [string, string]), hintFn: idxHint },
      { k: 'h2', t: 'head', label: 'Дополнительно' },
      { k: 'idoc', t: 'check', label: 'Подготовка исполнительной документации', def: false, hint: 'Ведём и комплектуем ИД за подрядчика: акты освидетельствования скрытых работ, исполнительные схемы, журналы, реестр. Сдаём комплект для ЗОС.' },
    ],
    calc(v) {
      const cost = num(v.cost);
      const out: Line[] = [];
      if (!cost) return out;
      const r = pp468(cost, String(v.ind));
      out.push(
        L(
          'Строительный контроль на объекте (весь период строительства)',
          'ПП РФ от 21.06.2010 № 468; письмо Минстроя № 50058-ИФ/09',
          'в ценах 2000 г.: ' + loc(cost, 1) + ' / ' + r.index.index.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' = ' + loc(r.c2000, 1) + ' млн ₽ → норматив ' + loc(r.percent) + ' %, численность ' + r.staff + ' чел.',
          1,
          'объект',
          own(r.sum),
        ),
      );
      if (v.idoc) {
        const ip = idocPercent(cost);
        const tiers = CFG.sk.idoc.tiers;
        out.push(
          L(
            'Подготовка и комплектование исполнительной документации (весь период строительства)',
            'Приказ Минстроя России от 16.05.2023 № 344/пр',
            loc(ip) + ' % от стоимости строительства (до ' + tiers[0].upToMln + ' млн ₽: ' + loc(tiers[0].percent) + ' %, до ' + tiers[1].upToMln + ' млн ₽: ' + loc(tiers[1].percent) + ' %, свыше: ' + loc(tiers[2].percent) + ' %)',
            1,
            'объект',
            own(Math.round((cost * 1e6 * ip) / 100), CFG.sk.idoc.from),
          ),
        );
      }
      return out;
    },
    sum: (v) => 'стоимость строительства ' + loc(num(v.cost)) + ' млн ₽',
  },
  {
    id: 'asphalt',
    label: 'Асфальто­бетонное покрытие',
    sub: 'дороги, тротуары, дворы',
    note: 'Отбор кернов и испытания покрытия при приёмке работ.',
    fields: [
      { k: 'kind', t: 'seg', label: 'Тип покрытия и норматив', def: 'road', wide: true, opts: [['road', 'Дорога, СП 78.13330 (асфальтобетон ГОСТ 9128)'], ['euro', 'Дорога, Евроасфальт (ГОСТ Р 58406)'], ['yard', 'Тротуары и дворы, СП 82']] },
      { k: 'h1', t: 'head', label: 'Готовое покрытие (керны)', hint: 'Проверяем уплотнение и качество уложенного слоя.' },
      { k: 'area', t: 'num', label: 'Площадь покрытия', unit: 'м²', req: true, ph: 'Введите площадь' },
      { k: 'len', t: 'num', label: 'Протяжённость дороги', unit: 'км', hint: 'Для контроля ровности. Оставьте пустым, если не нужно.', notOnly: ['kind', 'yard'] },
      { k: 'lab', t: 'check', label: 'Лабораторные испытания кернов', def: true },
      { k: 'h2', t: 'head', label: 'Асфальтобетонная смесь', hint: 'Проверяем, что на объект пришла смесь нужного состава, ещё до укладки.' },
      {
        k: 'mix',
        t: 'check',
        label: 'Испытания асфальтобетонной смеси',
        def: (v) => v.kind === 'euro',
        hintFn: (v) => (v.kind === 'euro' ? 'Рекомендуем: для Евроасфальта контроль смеси (состав, колея, водостойкость) составляет основную часть приёмки.' : 'Рекомендуем при поставке смеси от нового АБЗ или при спорах о качестве.'),
      },
      { k: 'batches', t: 'num', label: 'Партий смеси', unit: 'шт', ph: 'Обычно 1', hint: 'Партия: смесь одного состава за смену укладки. 1 проба на партию.', only: ['mix', true] },
      { k: 'h3', t: 'head', label: 'Дополнительно' },
      { k: 'meas', t: 'check', label: 'Исполнительная геодезическая съёмка покрытия (ГНСС-приёмник или электронный тахеометр)', def: false, hint: 'Фиксируем фактические контуры, площадь, отметки и уклоны покрытия в системе координат объекта. Основание для приёмки объёмов и КС-2.' },
      { k: 'sch', t: 'check', label: 'Составление исполнительных схем покрытия', def: false, hint: 'Схемы на листах А3 с фактическими контурами, площадями и отметками для комплекта исполнительной документации. Выполняются по данным съёмки, она добавится автоматически.' },
      { k: 'rep', t: 'check', label: 'Экспертное заключение о качестве покрытия', def: false },
    ],
    calc(v) {
      const A = num(v.area);
      const out: Line[] = [];
      if (!A) return out;
      const cfg = CFG.asphalt;
      const P = cfg.prices;
      const cnt = (per: number) => Math.max(1, Math.round(A / per));
      const a = loc(A);
      let cores: number;
      if (v.kind === 'euro') {
        cores = cnt(cfg.coresPer.euro);
        out.push(L('Отбор проб (кернов) из покрытия по Евростандарту', 'ГОСТ Р 58406.1-2020, ГОСТ Р 58406.2-2020', '1 проба на 3 000 м²: ' + a + ' м² → ' + cores + ' шт', cores, 'проба', P.coreEuro));
        if (v.lab) out.push(L('Комплексные лабораторные испытания проб асфальтобетона', 'ГОСТ Р 58406.1-2020, ГОСТ Р 58406.2-2020', 'каждая отобранная проба → ' + cores + ' шт', cores, 'проба', P.labEuro));
      } else if (v.kind === 'yard') {
        cores = cnt(cfg.coresPer.yard);
        out.push(L('Отбор проб (кернов) из покрытия тротуаров и дворовых территорий', 'ГОСТ 12801-98, СП 82.13330.2016', '1 проба на 2 000 м²: ' + a + ' м² → ' + cores + ' шт', cores, 'проба', P.coreYard));
        if (v.lab) out.push(L('Испытание проб: средняя плотность, коэффициент уплотнения, водонасыщение', 'ГОСТ 12801-98', 'каждая отобранная проба → ' + cores + ' шт', cores, 'проба', P.labStd));
      } else {
        cores = cnt(cfg.coresPer.road);
        out.push(L('Отбор проб (кернов) из покрытия автомобильной дороги', 'СП 78.13330.2012, ГОСТ 12801-98, ГОСТ 9128-2013', '3 пробы на 7 000 м² (1 на ~2 350 м²): ' + a + ' м² → ' + cores + ' шт', cores, 'проба', P.coreRoad));
        if (v.lab) out.push(L('Испытание проб: средняя плотность, коэффициент уплотнения, водонасыщение', 'ГОСТ 12801-98', 'каждая отобранная проба → ' + cores + ' шт', cores, 'проба', P.labStd));
      }
      if (v.kind !== 'yard' && num(v.len) > 0) out.push(L('Геометрические параметры и ровность покрытия', 'СП 78.13330.2012', 'по протяжённости', num(v.len), 'лин. км', P.evenness));
      if (v.mix) {
        const b = Math.max(1, C(num(v.batches)));
        out.push(L('Отбор проб асфальтобетонной смеси (из миксера / укладчика)', 'ГОСТ 12801-98', '1 проба на партию → ' + b, b, 'проба', P.mixSample));
        if (v.kind === 'euro') {
          out.push(L('Зерновой состав смеси и содержание вяжущего', 'ГОСТ Р 58401.15-2019', 'каждая проба смеси → ' + b, b, 'проба', P.mixGrain));
          out.push(L('Средняя глубина колеи, коэффициент водостойкости', 'ГОСТ Р 58406.1-2020, ГОСТ Р 58406.2-2020', 'каждая проба смеси → ' + b, b, 'проба', P.mixRut));
        } else {
          out.push(L('Зерновой состав смеси и содержание вяжущего', 'ГОСТ 12801-98', 'каждая проба смеси → ' + b, b, 'проба', P.mixGrain));
          out.push(L('Физико-механические показатели: плотность, водонасыщение, прочность при 0, 20, 50 °С', 'ГОСТ 12801-98', 'каждая проба смеси → ' + b, b, 'проба', P.mixPhys));
        }
      }
      if (v.meas || v.sch) {
        const g = cfg.geodesy;
        const gp = g.tiers.find((t) => t.upToM2 == null || A <= t.upToM2)!.pricePerM2;
        const name = 'Исполнительная геодезическая съёмка покрытия (ГНСС / электронный тахеометр) с определением фактической площади';
        const norm = 'СП 126.13330.2017, ГОСТ Р 51872-2024';
        if (A * gp < g.minPrice) out.push(L(name, norm, 'до ' + loc(Math.floor(g.minPrice / gp)) + ' м²: минимальная стоимость', 1, 'объект', own(g.minPrice)));
        else out.push(L(name, norm, a + ' м² × ' + loc(gp) + ' ₽ (до 5 000 м²: 8 ₽, до 20 000 м²: 5,5 ₽, свыше: 4 ₽)', A, 'м²', own(gp)));
      }
      if (v.sch) {
        const sh = Math.max(1, C(A / cfg.schemeM2PerSheet));
        out.push(L('Составление исполнительных схем покрытия (лист А3)', 'Приказ Минстроя России № 344/пр, ГОСТ Р 51872-2024', '1 лист на 2 500 м²: ' + a + ' м² → ' + sh + ' л.', sh, 'лист', P.schemeSheet));
      }
      if (v.rep) out.push(L('Экспертное заключение по качеству асфальтобетонного покрытия', '', '1 комплект', 1, 'комплект', P.report));
      out.push(L('Выезд лаборатории на объект', '', '1 выезд', 1, 'выезд', P.visit));
      return out;
    },
    sum: (v) => ({ road: 'Дорога, СП 78 / ГОСТ 9128', euro: 'Дорога, Евроасфальт', yard: 'Тротуары/дворы, СП 82' })[String(v.kind)] + ', ' + loc(num(v.area)) + ' м²',
  },
  {
    id: 'soil',
    label: 'Уплотнение грунта и песка',
    sub: 'обратная засыпка, основания',
    note: 'Контроль коэффициента уплотнения каждого слоя.',
    fields: [
      { k: 'h1', t: 'head', label: 'Уплотнение слоёв на объекте', hint: 'Коэффициент уплотнения каждого отсыпанного слоя.' },
      { k: 'area', t: 'num', label: 'Площадь одного слоя', unit: 'м²', req: true, ph: 'Введите площадь' },
      { k: 'layers', t: 'num', label: 'Количество слоёв', unit: 'шт', req: true, ph: 'Сколько слоёв' },
      { k: 'method', t: 'seg', label: 'Метод контроля', def: 'dyn', wide: true, opts: [['dyn', 'Динамический плотномер'], ['stat', 'Статический плотномер'], ['ring', 'Режущие кольца'], ['pdu', 'ПДУ-МГ4 «Удар»']], hint: 'Плотномеры дают результат сразу на месте, режущие кольца — лабораторный метод. ПДУ-МГ4 «Удар» дополнительно даёт модуль упругости основания, это нужно для мощения и дорожной одежды.' },
      { k: 'h2', t: 'head', label: 'Грунт и песок (лаборатория)', hint: 'Без максимальной плотности коэффициент уплотнения не посчитать.' },
      { k: 'kinds', t: 'num', label: 'Видов грунта / песка', unit: 'шт', ph: 'Обычно 1', hint: 'Для каждого определяется максимальная плотность.' },
      { k: 'inp', t: 'check', label: 'Входной контроль песка: зерновой состав, модуль крупности, фильтрация', def: false, hint: 'Рекомендуем: подтверждает, что привезли песок по проекту.' },
      { k: 'gr', t: 'check', label: 'Комплексное исследование грунта: классификация, пластичность, фильтрация', def: false, hint: 'Если в засыпку идёт местный грунт.' },
      { k: 'h3', t: 'head', label: 'Щебень в основании' },
      { k: 'sh', t: 'check', label: 'Входной контроль щебня: зерновой состав, дробимость, лещадность', def: false },
      { k: 'shk', t: 'num', label: 'Видов / фракций щебня', unit: 'шт', ph: 'Обычно 1', only: ['sh', true] },
      { k: 'h4', t: 'head', label: 'Дополнительно' },
      { k: 'pit', t: 'check', label: 'Освидетельствование котлована с актом', def: false },
    ],
    calc(v) {
      const cfg = CFG.soil;
      const P = cfg.prices;
      const A = num(v.area);
      const Ly = Math.max(1, C(num(v.layers)));
      const K = Math.max(1, C(num(v.kinds)));
      const out: Line[] = [];
      if (!A) return out;
      const plots = C(A / cfg.plotM2);
      const u = plots * Ly;
      const pduPrice = price(P.pduPoint);
      const m: Record<string, [string, string, PriceRef | Own]> = {
        dyn: ['динамический плотномер Д-51', 'ГОСТ 22733-2016, ГОСТ 28514-90', P.dyn],
        stat: ['статический плотномер', 'ГОСТ 22733-2016, СП 78.13330.2012', P.stat],
        ring: ['метод режущих колец', 'ГОСТ 5180-2015', P.ring],
        pdu: ['прибор ПДУ-МГ4 «Удар», ' + cfg.pduPointsPerPlot + ' точки на участок', 'СП 82.13330.2016, СП 78.13330.2012', own(pduPrice.price * cfg.pduPointsPerPlot, pduPrice.from)],
      };
      const mm = m[String(v.method)] || m.dyn;
      out.push(L((v.method === 'pdu' ? 'Коэффициент уплотнения и модуль упругости основания (' : 'Коэффициент уплотнения (') + mm[0] + ')', mm[1], '1 участок до 500 м² на каждый слой → ' + plots + ' × ' + Ly + ' сл.', u, 'участок', mm[2]));
      out.push(L('Максимальная плотность и оптимальная влажность (стандартное уплотнение)', 'ГОСТ 22733-2016', '1 испытание на вид грунта → ' + K, K, 'испытание', P.maxDensity));
      if (v.inp) out.push(L('Комплексное исследование физико-механических свойств песка', 'ГОСТ 8736-2014, ГОСТ 8735-88', '1 проба на вид песка → ' + K, K, 'проба', P.sand));
      if (v.gr) out.push(L('Комплексное исследование физико-механических свойств грунта', 'ГОСТ 25100-2020, ГОСТ 12536-2014, ГОСТ 5180-2015', '1 проба на вид грунта → ' + K, K, 'проба', P.ground));
      if (v.sh) {
        const Sh = Math.max(1, C(num(v.shk)));
        out.push(L('Комплексное исследование щебня', 'ГОСТ 8269.0-97', '1 проба на фракцию → ' + Sh, Sh, 'проба', P.gravel));
      }
      if (v.pit) out.push(L('Освидетельствование котлована: осмотр основания, проверка отметок, акт', 'СП 45.13330.2017', '1 котлован', 1, 'объект', P.pit));
      return out;
    },
    sum: (v) => loc(num(v.area)) + ' м² × ' + Math.max(1, C(num(v.layers))) + ' сл.',
  },
  {
    id: 'concrete',
    label: 'Монолитные конструкции',
    sub: 'фундаменты, плиты, стены',
    promo: true,
    note: 'Контроль прочности бетона по образцам и неразрушающими методами. Для объекта целиком выгоднее пакеты «Контроль монолита»: от 75 000 ₽ за объект в месяц.',
    fields: [
      { k: 'h1', t: 'head', label: 'Бетонная смесь (контрольные образцы)', hint: 'Проверяем привезённый на объект бетон по образцам из каждой захватки.' },
      { k: 'vol', t: 'num', label: 'Объём бетона', unit: 'м³', req: true, ph: 'Введите объём' },
      { k: 'pours', t: 'num', label: 'Количество захваток (бетонирований)', unit: 'шт', req: true, ph: 'Сколько захваток' },
      { k: 'ages', t: 'seg', label: 'Испытание образцов в возрасте', def: '28', opts: [['28', '28 суток'], ['728', '7 и 28 суток']], hint: '7 суток нужны, если важно раньше понять, набирает ли бетон прочность.' },
      { k: 'mix', t: 'check', label: 'Входной контроль смеси: осадка конуса, температура', def: true, hint: 'Рекомендуем: отсекает некачественную смесь до укладки.' },
      { k: 'dens', t: 'check', label: 'Плотность бетонной смеси', def: false },
      { k: 'h2', t: 'head', label: 'Готовые конструкции (неразрушающий контроль)', hint: 'Фактическая прочность бетона прямо в конструкциях, без разрушения.' },
      { k: 'flat', t: 'num', label: 'Площадь плит и стен', unit: 'м²' },
      { k: 'lin', t: 'num', label: 'Длина колонн и балок', unit: 'п. м' },
      { k: 'ndt', t: 'seg', label: 'Метод', def: 'us', wide: true, opts: [['us', 'Ультразвук'], ['sk', 'Отрыв со скалыванием']], hint: 'Отрыв со скалыванием точнее, ультразвук быстрее и дешевле.' },
      { k: 'h3', t: 'head', label: 'Специальные свойства бетона', hint: 'Если марки W и F указаны в проекте, их нужно подтвердить.' },
      { k: 'w', t: 'check', label: 'Водонепроницаемость (W)', def: false, hint: 'Фундаменты, подвалы, резервуары, подземные части.' },
      { k: 'wa', t: 'check', label: 'Водопоглощение', def: false },
      { k: 'f', t: 'check', label: 'Морозостойкость (F)', def: false, hint: 'Конструкции на улице: открытые площадки, лестницы, парапеты.' },
    ],
    calc(v) {
      const cfg = CFG.concrete;
      const P = cfg.prices;
      const V = num(v.vol);
      const Pr = C(num(v.pours));
      const out: Line[] = [];
      if (V) {
        const s = Math.max(Pr, C(V / cfg.m3PerSeries), 1);
        const ages = v.ages === '728' ? 2 : 1;
        const made = s * ages;
        out.push(L('Отбор проб бетонной смеси и изготовление образцов', 'ГОСТ 10181-2014, ГОСТ 18105-2018', '1 серия на 50 м³, не менее 1 на захватку' + (ages > 1 ? ', × 2 возраста' : '') + ' → ' + made, made, 'серия (3 шт)', P.sampling));
        out.push(L('Прочность бетона на сжатие по контрольным образцам', 'ГОСТ 10180-2012', 'по числу серий → ' + made, made, 'серия (3 шт)', P.compression));
        if (v.mix) {
          out.push(L('Удобоукладываемость бетонной смеси (осадка конуса)', 'ГОСТ 10181-2014', 'при каждом отборе проб → ' + s, s, 'проба', P.slump));
          out.push(L('Температура бетонной смеси', 'ГОСТ 10181-2014', 'при каждом отборе проб → ' + s, s, 'испытание', P.temperature));
        }
        if (v.dens) out.push(L('Плотность бетонной смеси', 'ГОСТ 10181-2014', 'при каждом отборе проб → ' + s, s, 'проба', P.density));
        if (v.wa) out.push(L('Водопоглощение бетона по контрольным образцам', 'ГОСТ 12730.3-2020', '1 серия на состав бетона', 1, 'серия (3 шт)', P.waterAbs));
        if (v.w) out.push(L('Марка бетона по водонепроницаемости', 'ГОСТ 12730.5-2020', '1 серия на состав бетона', 1, 'серия (6 шт)', P.w));
        if (v.f) out.push(L('Марка бетона по морозостойкости', 'ГОСТ 10060-2012', '1 испытание на состав бетона', 1, 'испытание (12 обр.)', P.f));
      }
      const pl = C(num(v.flat) / cfg.ndtM2PerPlot) + C(num(v.lin) / cfg.ndtLmPerPlot);
      if (pl) {
        const us = v.ndt !== 'sk';
        out.push(L('Сплошной контроль прочности бетона в конструкциях (' + (us ? 'ультразвук' : 'отрыв со скалыванием') + ')', us ? 'ГОСТ 17624-2012, ГОСТ 18105-2018' : 'ГОСТ 22690-2015, ГОСТ 18105-2018', '1 участок на 4 м² или 4 п. м → ' + pl, pl, 'испытание', us ? P.ultrasound : P.pullOff));
      }
      return out;
    },
    sum: (v) => [num(v.vol) ? loc(num(v.vol)) + ' м³, ' + C(num(v.pours)) + ' захв.' : '', num(v.flat) ? loc(num(v.flat)) + ' м²' : '', num(v.lin) ? loc(num(v.lin)) + ' п. м' : ''].filter(Boolean).join(', '),
  },
  {
    id: 'hydro',
    label: 'Гидроизоляция',
    sub: 'фундаменты, кровли, подвалы',
    note: 'Контроль сцепления с основанием и качества покрытия.',
    fields: [
      { k: 'area', t: 'num', label: 'Площадь гидроизоляции', unit: 'м²', req: true, ph: 'Введите площадь' },
      { k: 'kind', t: 'seg', label: 'Тип гидроизоляции', def: 'roll', wide: true, opts: [['roll', 'Рулонная'], ['mastic', 'Обмазочная / мастичная']] },
      { k: 'vis', t: 'check', label: 'Визуально-измерительный контроль покрытия', def: true },
    ],
    calc(v) {
      const cfg = CFG.hydro;
      const A = num(v.area);
      const out: Line[] = [];
      if (!A) return out;
      const z = C(A / cfg.plotM2);
      if (v.kind === 'mastic') out.push(L('Адгезия гидроизоляционного покрытия (метод отрыва)', 'ГОСТ Р 55402, ГОСТ 26589', '3 точки на участок до 500 м² → ' + z * cfg.masticPointsPerPlot, z * cfg.masticPointsPerPlot, 'точка', cfg.prices.mastic));
      else out.push(L('Сцепление гидроизоляции с основанием (метод отрыва)', 'ГОСТ 2678-94, ГОСТ 28574', '1 серия (3 отрыва) на участок до 500 м² → ' + z, z, 'серия (3 шт)', cfg.prices.roll));
      if (v.vis) out.push(L('Визуально-измерительный контроль гидроизоляционного покрытия', 'ГОСТ Р ЕН 13018-2014', 'вся площадь', A, 'м²', cfg.prices.visual));
      return out;
    },
    sum: (v) => (v.kind === 'mastic' ? 'обмазочная' : 'рулонная') + ', ' + loc(num(v.area)) + ' м²',
  },
  {
    id: 'weld',
    label: 'Сварные соединения',
    sub: 'металлоконструкции, арматура',
    note: 'Визуальный и ультразвуковой контроль швов.',
    fields: [
      { k: 'len', t: 'num', label: 'Общая длина сварных швов', unit: 'п. м', req: true, ph: 'Введите длину' },
      { k: 'ut', t: 'num', label: 'Объём УЗК по проекту', unit: '%', ph: 'По проекту, %', hint: 'Доля швов для ультразвукового контроля по проекту или ППР.' },
    ],
    calc(v) {
      const Lw = num(v.len);
      const out: Line[] = [];
      if (!Lw) return out;
      out.push(L('Визуальный и измерительный контроль сварных соединений', 'ГОСТ 3242-2021', '100 % швов', Lw, 'п. м', CFG.weld.prices.vik));
      const pct = Math.min(100, num(v.ut));
      const u = Math.round(((Lw * pct) / 100) * 10) / 10;
      if (u) out.push(L('Ультразвуковой контроль сварных соединений', 'ГОСТ Р ИСО 17640-2014', loc(pct) + ' % швов → ' + loc(u, 1) + ' п. м', u, 'п. м', CFG.weld.prices.ut));
      return out;
    },
    sum: (v) => loc(num(v.len)) + ' п. м швов',
  },
  {
    id: 'anchor',
    label: 'Анкерные крепления',
    sub: 'фасады, оборудование',
    note: 'Испытания анкеров на вырыв.',
    fields: [
      { k: 'total', t: 'num', label: 'Установлено анкеров', unit: 'шт', req: true, ph: 'Сколько анкеров' },
      { k: 'pct', t: 'num', label: 'Объём контроля по проекту', unit: '%', ph: 'По проекту, %', hint: 'Не менее 3 испытаний.' },
      { k: 'load', t: 'seg', label: 'Испытательная нагрузка', def: '50', opts: [['50', 'до 50 кН'], ['90', '50–90 кН']] },
      { k: 'calc', t: 'check', label: 'Расчёт несущей способности по результатам', def: false },
    ],
    calc(v) {
      const cfg = CFG.anchor;
      const T = num(v.total);
      const out: Line[] = [];
      if (!T) return out;
      const pct = num(v.pct);
      const k = anchorTests(T, pct);
      out.push(
        L(
          'Определение усилия вырыва анкера (' + (v.load === '90' ? '50–90 кН' : 'до 50 кН') + ')',
          'ГОСТ Р 56731-2015',
          (pct ? loc(pct) + ' % от ' + loc(T) + ', не менее ' + cfg.minTests + ' → ' : 'минимальный объём (укажите % по проекту) → ') + k + ' шт',
          k,
          'шт.',
          v.load === '90' ? cfg.prices.upTo90 : cfg.prices.upTo50,
        ),
      );
      if (v.calc) out.push(L('Расчёт несущей способности анкера', 'ГОСТ Р 56731-2015', 'по числу испытаний → ' + k, k, 'шт.', cfg.prices.calc));
      return out;
    },
    sum: (v) => loc(num(v.total)) + ' анкеров',
  },
  {
    id: 'ladder',
    label: 'Пожарные лестницы и ограждения',
    sub: 'наружные лестницы, кровля',
    note: 'Испытания проводятся для каждой лестницы и всего ограждения кровли.',
    fields: [
      { k: 'vc', t: 'num', label: 'Вертикальных лестниц', unit: 'шт' },
      { k: 'vh', t: 'num', label: 'Высота каждой', unit: 'м' },
      { k: 'mc', t: 'num', label: 'Маршевых лестниц', unit: 'шт' },
      { k: 'ml', t: 'num', label: 'Длина каждой маршевой', unit: 'п. м' },
      { k: 'roof', t: 'num', label: 'Ограждение кровли', unit: 'п. м' },
      { k: 'balc', t: 'num', label: 'Ограждения балконов и маршей', unit: 'п. м' },
    ],
    calc(v) {
      const cfg = CFG.ladder;
      const P = cfg.prices;
      const out: Line[] = [];
      const vc = C(num(v.vc)), vh = num(v.vh), mc = C(num(v.mc)), ml = num(v.ml), roof = num(v.roof), balc = num(v.balc);
      const vpm = price(P.verticalPerM).price, vmin = price(P.verticalMin).price;
      const mpm = price(P.marchPerM).price, mmin = price(P.marchMin).price;
      const rpm = price(P.roofPerM).price, rmin = price(P.roofMin).price;
      if (vc && vh) out.push(L('Испытание вертикальной пожарной лестницы', 'ГОСТ Р 53254-2009', loc(vh) + ' м × ' + loc(vpm) + ' ₽, не менее ' + loc(vmin) + ' ₽ за лестницу', vc, 'лестница', own(Math.max(vpm * vh, vmin), cfg.from)));
      if (mc && ml) out.push(L('Испытание маршевой пожарной лестницы', 'ГОСТ Р 53254-2009', loc(ml) + ' п. м × ' + loc(mpm) + ' ₽, не менее ' + loc(mmin) + ' ₽ за лестницу', mc, 'лестница', own(Math.max(mpm * ml, mmin), cfg.from)));
      if (roof) {
        const r = roof <= cfg.roofMinUpToM ? Math.max(rpm * roof, rmin) : rpm * roof;
        out.push(L('Испытание ограждения кровли на прочность', 'ГОСТ Р 53254-2009', loc(roof) + ' п. м × ' + loc(rpm) + ' ₽, не менее ' + loc(rmin) + ' ₽ до ' + cfg.roofMinUpToM + ' п. м', 1, 'объект', own(r, cfg.from)));
      }
      if (balc) out.push(L('Испытание ограждений балконов и лестничных маршей', 'ГОСТ 25772-2021', 'по длине ограждений', balc, 'п. м', P.balcony));
      return out;
    },
    sum: (v) => [num(v.vc) ? C(num(v.vc)) + ' верт.' : '', num(v.mc) ? C(num(v.mc)) + ' марш.' : '', num(v.roof) ? 'кровля ' + loc(num(v.roof)) + ' п. м' : '', num(v.balc) ? 'ограждения ' + loc(num(v.balc)) + ' п. м' : ''].filter(Boolean).join(', '),
  },
  {
    id: 'survey',
    label: 'Обследование помещения или здания',
    sub: 'квартиры, нежилые, здания',
    note: 'Оценка технического состояния по ГОСТ 31937-2024.',
    fields: [
      { k: 'kind', t: 'seg', label: 'Что обследуем', def: 'nonres', wide: true, opts: [['flat', 'Квартира'], ['nonres', 'Нежилое помещение'], ['bld', 'Здание / сооружение']] },
      { k: 'area', t: 'num', label: 'Площадь', unit: 'м²', req: true, ph: 'Введите площадь' },
      { k: 'lvl', t: 'seg', label: 'Вид обследования', def: 'instr', wide: true, opts: [['vis', 'Визуальный осмотр (акт)'], ['instr', 'Инструментальное (техзаключение)']] },
      { k: 'balc', t: 'check', label: 'Балконы, лоджии, козырьки', def: false },
      { k: 'roof', t: 'check', label: 'Кровля и стропильная система', def: false },
    ],
    calc(v) {
      const cfg = CFG.survey;
      const P = cfg.prices;
      const A = num(v.area);
      const out: Line[] = [];
      const G = 'ГОСТ 31937-2024';
      if (!A) return out;
      const big = A > cfg.smallUpToM2;
      const flat = v.kind === 'flat';
      if (v.lvl === 'vis') {
        if (flat) out.push(L('Визуальный осмотр квартиры с актом осмотра', G, big ? 'свыше 100 м²' : 'до 100 м²', 1, 'объект', big ? P.visFlatBig : P.visFlatSmall));
        else out.push(L('Визуальный осмотр нежилого помещения/здания с актом осмотра', G, big ? 'свыше 100 м²' : 'до 100 м²', 1, 'объект', big ? P.visNonresBig : P.visNonresSmall));
      } else if (!big) {
        out.push(L(flat ? 'Обследование квартиры с техническим заключением' : 'Обследование нежилого помещения/здания с техническим заключением', G, 'до 100 м²', 1, 'объект', flat ? P.instrFlatSmall : P.instrNonresSmall));
      } else {
        const tot = surveyScale(A);
        out.push(L('Инструментальное обследование с техническим заключением', G, loc(A) + ' м² по шкале площади (≈ ' + loc(Math.round(tot / A)) + ' ₽/м²), не менее ' + loc(cfg.minPrice) + ' ₽', 1, 'объект', own(tot, true)));
      }
      if (v.balc) out.push(L('Обследование балконов, лоджий, козырьков', G, '1 объект', 1, 'объект', P.balcony));
      if (v.roof) out.push(L('Обследование кровли и стропильной системы', G, '1 объект', 1, 'объект', P.roof));
      out.push(L('Выезд специалиста на объект', '', '1 выезд', 1, 'выезд', P.visit));
      return out;
    },
    sum: (v) => ({ flat: 'Квартира', nonres: 'Нежилое помещение', bld: 'Здание' })[String(v.kind)] + ', ' + loc(num(v.area)) + ' м²',
  },
];

export function anchorTests(total: number, pct: number): number {
  return Math.max(CFG.anchor.minTests, C((total * pct) / 100));
}

export const typeById = (id: string) => TYPES.find((t) => t.id === id) || TYPES[0];

/** Значения полей с учётом умолчаний */
export function resolveVals(type: CalcType, stored: Vals = {}): Vals {
  const v: Vals = {};
  for (const f of type.fields) {
    if (f.t === 'head') continue;
    if (Object.prototype.hasOwnProperty.call(stored, f.k)) {
      const raw = stored[f.k];
      if (f.t === 'check') v[f.k] = raw === true || raw === 'true' || raw === '1';
      else if (f.t === 'seg') v[f.k] = f.opts.some((o) => o[0] === raw) ? String(raw) : f.def;
      else v[f.k] = String(raw).replace(/[^0-9.,]/g, '').slice(0, 14);
    } else if (f.t === 'num') v[f.k] = '';
    else if (f.t === 'seg') v[f.k] = f.def;
    else if (f.t === 'check') v[f.k] = typeof f.def === 'function' ? f.def(v) : f.def;
  }
  return v;
}

export function isVisible(f: Field, v: Vals): boolean {
  return (!f.only || v[f.only[0]] === f.only[1]) && (!f.notOnly || v[f.notOnly[0]] !== f.notOnly[1]);
}

export interface CalcResult {
  type: CalcType;
  vals: Vals;
  lines: (Line & { sum: number })[];
  total: number;
  hasFrom: boolean;
  summary: string;
}

export function compute(typeId: string, stored: Vals = {}): CalcResult {
  const type = typeById(typeId);
  const vals = resolveVals(type, stored);
  const lines = type
    .calc(vals)
    .filter((l) => l.qty > 0)
    .map((l) => ({ ...l, sum: Math.round(l.qty * l.price * 100) / 100 }));
  const total = Math.round(lines.reduce((s, l) => s + l.sum, 0) * 100) / 100;
  return { type, vals, lines, total, hasFrom: lines.some((l) => l.from), summary: lines.length ? type.sum(vals) : 'Параметры ещё не указаны' };
}

export const fmtQty = (l: Line) => fmt(l.qty) + ' ' + l.unit;

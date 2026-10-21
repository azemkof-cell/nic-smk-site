import ratesJson from '../../data/rates.json';
import packagesJson from '../../data/packages.json';
import indicesJson from '../../data/indices.json';
import requisitesJson from '../../data/requisites.json';
import calculatorJson from '../../data/calculator.json';

export interface Rate {
  id: number;
  section: string;
  sectionTitle: string;
  sectionShort: string;
  subsection: string;
  name: string;
  norm: string;
  unit: string;
  price: number;
  priceFrom: boolean;
}
export interface RateView extends Rate {
  code: string;
}
export interface Package {
  id: string;
  name: string;
  price: number;
  description: string;
  includes: string[];
  recommended: boolean;
}

export const rates: Rate[] = ratesJson.items as Rate[];
export const ratesUpdated = ratesJson.updated;
export const packages = packagesJson as { unit: string; features: string[]; packages: Package[]; stationaryPost: { priceFrom: number; unit: string } };
export const indices = indicesJson;
export const requisites = requisitesJson;
export const calcConfig = calculatorJson;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

/** Позиции прайса с кодом «раздел.номер» (1.1, 2.18 …) — как в прайс-листе */
export const rateViews: RateView[] = (() => {
  const counters: Record<string, number> = {};
  return rates.map((r) => {
    counters[r.section] = (counters[r.section] || 0) + 1;
    return { ...r, code: ROMAN.indexOf(r.section) + 1 + '.' + counters[r.section] };
  });
})();

export const rateById = (id: number) => rates.find((r) => r.id === id);

export interface RateSection {
  id: string;
  title: string;
  short: string;
  count: number;
  subs: { title: string; rows: RateView[] }[];
}
export const rateSections: RateSection[] = (() => {
  const out: RateSection[] = [];
  for (const r of rateViews) {
    let s = out.find((x) => x.id === r.section);
    if (!s) out.push((s = { id: r.section, title: r.sectionTitle, short: r.sectionShort, count: 0, subs: [] }));
    s.count++;
    let g = s.subs[s.subs.length - 1];
    if (!g || g.title !== r.subsection) s.subs.push((g = { title: r.subsection, rows: [] }));
    g.rows.push(r);
  }
  return out;
})();

export const contacts = requisitesJson.contacts;
export const phoneHref = 'tel:+' + contacts.phone.replace(/\D/g, '');
export const emailHref = 'mailto:' + contacts.email;
export const social = {
  telegram: 'https://t.me/ooonicsmk',
  whatsapp: 'https://wa.me/79160065206',
  max: 'https://max.ru/u/f9LHodD0cOLZF6t7XRWCG-8q7VpEPbdTDQymQCEaeUK3dIo2XsYUSsrqEbo',
  yandexMaps: 'https://yandex.ru/maps/org/nauchno_ispytatelny_tsentr_stroitelnykh_materialov_i_konstruktsiy/138955398020/',
  yandexReviews: 'https://yandex.ru/maps/org/nauchno_ispytatelny_tsentr_stroitelnykh_materialov_i_konstruktsiy/138955398020/reviews/',
};

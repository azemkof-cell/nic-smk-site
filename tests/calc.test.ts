import { describe, expect, it } from 'vitest';
import { compute, pp468, surveyScale, anchorTests, idocPercent } from '../src/lib/calc';
import { packages } from '../src/lib/data';

describe('Строительный контроль, ПП № 468', () => {
  it('250 млн ₽, «Экономика в целом» → C2000 19,2, H 2,14 %, 2 чел., 5 350 000 ₽', () => {
    const r = pp468(250, 'econ');
    expect(r.c2000).toBeCloseTo(19.19, 1);
    expect(r.percent).toBe(2.14);
    expect(r.staff).toBe(2);
    expect(r.sum).toBe(5_350_000);
    expect(compute('sk', { cost: '250' }).total).toBe(5_350_000);
  });
  it('1 000 млн ₽ → C2000 76,7, H 1,72 %, 5 чел., 17 200 000 ₽', () => {
    const r = pp468(1000, 'econ');
    expect(r.c2000).toBeCloseTo(76.7, 1);
    expect(r.percent).toBe(1.72);
    expect(r.staff).toBe(5);
    expect(r.sum).toBe(17_200_000);
  });
  it('свыше 900 млн ₽ в ценах 2000 — формула', () => {
    const r = pp468(15000, 'econ');
    expect(r.c2000).toBeGreaterThan(900);
    expect(r.staff).toBe(28 + Math.floor((r.c2000 - 900) / 30));
    expect(r.percent).toBeLessThan(1.09);
  });
  it('ИД при 250 млн ₽ → от 2 625 000 ₽', () => {
    expect(idocPercent(250)).toBe(1.05);
    const res = compute('sk', { cost: '250', idoc: true });
    const l = res.lines[1];
    expect(l.price).toBe(2_625_000);
    expect(l.from).toBe(true);
    expect(res.hasFrom).toBe(true);
  });
  it('пустая стоимость → нет строк', () => {
    const r = compute('sk', {});
    expect(r.lines).toHaveLength(0);
    expect(r.total).toBe(0);
    expect(r.summary).toBe('Параметры ещё не указаны');
  });
});

describe('Асфальт', () => {
  const cores = (vals: Record<string, string | boolean>) => compute('asphalt', vals).lines[0].qty;
  it('ГОСТ 9128, 5 000 м² → 2 керна', () => expect(cores({ kind: 'road', area: '5000' })).toBe(2));
  it('Евро, 5 000 м² → 2 керна + смесь включена, 1 проба на партию', () => {
    const r = compute('asphalt', { kind: 'euro', area: '5000' });
    expect(r.lines[0].qty).toBe(2);
    const mix = r.lines.find((l) => l.name.startsWith('Отбор проб асфальтобетонной смеси'));
    expect(mix?.qty).toBe(1);
  });
  it('Тротуары СП 82, 5 000 м² → 3 керна', () => expect(cores({ kind: 'yard', area: '5000' })).toBe(3));
  it('керны — round, минимум 1', () => expect(cores({ kind: 'yard', area: '100' })).toBe(1));
  it('схемы добавляют съёмку автоматически; минимум 25 000 ₽', () => {
    const r = compute('asphalt', { kind: 'road', area: '1000', sch: true });
    const geo = r.lines.find((l) => l.name.startsWith('Исполнительная геодезическая'));
    expect(geo?.price).toBe(25000);
    const sh = r.lines.find((l) => l.name.startsWith('Составление исполнительных схем'));
    expect(sh?.qty).toBe(1);
  });
});

describe('Грунт', () => {
  it('слой 1 500 м² × 3 слоя → 9 участков + 1 макс. плотность', () => {
    const r = compute('soil', { area: '1500', layers: '3' });
    expect(r.lines[0].qty).toBe(9);
    expect(r.lines[1].qty).toBe(1);
  });
  it('ПДУ, 1 500 м² × 2 слоя → 6 участков × 3 990 ₽', () => {
    const r = compute('soil', { area: '1500', layers: '2', method: 'pdu' });
    expect(r.lines[0].qty).toBe(6);
    expect(r.lines[0].price).toBe(3990);
    expect(r.lines[0].name).toContain('Коэффициент уплотнения и модуль упругости основания');
  });
});

describe('Монолит', () => {
  it('300 м³, 6 захваток, 800 м² + 120 п. м → 6 серий, 230 участков НК', () => {
    const r = compute('concrete', { vol: '300', pours: '6', flat: '800', lin: '120' });
    expect(r.lines[0].qty).toBe(6);
    const ndt = r.lines.find((l) => l.name.startsWith('Сплошной контроль'));
    expect(ndt?.qty).toBe(230);
  });
  it('7 и 28 суток удваивают серии', () => {
    expect(compute('concrete', { vol: '300', pours: '6', ages: '728' }).lines[0].qty).toBe(12);
  });
});

describe('Анкеры', () => {
  it('300 шт, 2 % → 6; 0,5 % → 3 (минимум)', () => {
    expect(anchorTests(300, 2)).toBe(6);
    expect(anchorTests(300, 0.5)).toBe(3);
    expect(compute('anchor', { total: '300', pct: '0,5' }).lines[0].qty).toBe(3);
  });
  it('без % — минимум 3 с пометкой', () => {
    const l = compute('anchor', { total: '300' }).lines[0];
    expect(l.qty).toBe(3);
    expect(l.rule).toContain('укажите % по проекту');
  });
});

describe('Обследование', () => {
  it('300 м² → 61 500 ₽; 1 000 м² → 194 700 ₽', () => {
    expect(surveyScale(300)).toBe(61500);
    expect(surveyScale(1000)).toBe(194700);
  });
  it('свыше 10 000 м² — +51,9 ₽/м²', () => expect(surveyScale(12000)).toBe(661900 + 2000 * 51.9));
  it('минимум 50 000 ₽', () => expect(surveyScale(150)).toBe(50000));
});

describe('Лестницы', () => {
  it('вертикальная: max(475 × м, 5 700)', () => {
    expect(compute('ladder', { vc: '2', vh: '10' }).lines[0].price).toBe(5700);
    expect(compute('ladder', { vc: '1', vh: '20' }).lines[0].price).toBe(9500);
  });
  it('кровля: не менее 27 350 ₽ до 200 п. м', () => {
    expect(compute('ladder', { roof: '100' }).lines[0].price).toBe(27350);
    expect(compute('ladder', { roof: '300' }).lines[0].price).toBe(30000);
  });
});

describe('Пакеты', () => {
  it('«Профессионал», 3 мес. → 270 000 ₽', () => {
    const p = packages.packages.find((x) => x.id === 'pro')!;
    expect(p.price * 3).toBe(270000);
  });
});

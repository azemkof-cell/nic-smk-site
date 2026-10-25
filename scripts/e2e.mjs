// Сквозная проверка в браузере: маска, калькулятор → КП, пакеты → КП, расценки → КП, бургер. node scripts/e2e.mjs [base] [outdir]
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://127.0.0.1:4321';
const out = process.argv[3] || '.';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem('nicsmk.cookie', 'necessary'));
const p = await ctx.newPage();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

// 1. Маска телефона
await p.goto(base + '/kontakty');
const ph = p.locator('#contacts-phone');
for (const [typed, exp] of [['89161234567', '+7 (916) 123-45-67'], ['9161234567', '+7 (916) 123-45-67'], ['+79161234567', '+7 (916) 123-45-67']]) {
  await ph.fill(''); await ph.pressSequentially(typed); ok((await ph.inputValue()) === exp, `ввод ${typed} → ${await ph.inputValue()}`);
}
await ph.fill(''); await ph.focus();
await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', '8(916)123-45-67'); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
await p.keyboard.insertText('8(916)123-45-67');
ok((await ph.inputValue()) === '+7 (916) 123-45-67', 'вставка 8(916)123-45-67 → ' + (await ph.inputValue()));
await ph.press('End'); await ph.press('Backspace'); await ph.press('Backspace'); await ph.press('Backspace');
ok((await ph.inputValue()) === '+7 (916) 123-4', 'Backspace через дефис → ' + (await ph.inputValue()));
// курсор в середине: ставим после «91», печатаем 0
await ph.fill(''); await ph.pressSequentially('9161234567');
await ph.evaluate((el) => el.setSelectionRange(7, 7)); await ph.press('Backspace');
const pos = await ph.evaluate((el) => el.selectionStart);
ok((await ph.inputValue()) === '+7 (911) 234-56-7' && pos === 6, 'правка в середине, курсор не прыгает → ' + (await ph.inputValue()) + ' @' + pos);
// пустая отправка
await ph.fill(''); await ph.pressSequentially('916');
await p.click('text=Перезвоните мне');
ok(await p.locator('text=Введите 10 цифр номера').isVisible(), 'короткий номер → «Введите 10 цифр номера»');

// 2. Калькулятор: асфальт евро, 5000
await p.goto(base + '/kalkulyator?type=asphalt&kind=euro&area=5000');
await p.waitForTimeout(500);
const lines = await p.locator('.calc__line').count();
ok(lines >= 5, 'асфальт евро 5000 м² из URL: строк ' + lines);
ok((await p.locator('.calc__line').first().innerText()).includes('2 проба'), 'евро 5000 м² → 2 керна');
await p.click('button:has-text("Строительный контроль")');
await p.fill('#f-sk-cost', '250');
await p.waitForTimeout(200);
ok((await p.locator('.calc__total').innerText()).replace(/\s/g, '') === '5350000₽', 'СК 250 млн → ' + (await p.locator('.calc__total').innerText()));
ok(p.url().includes('type=sk') && p.url().includes('cost=250'), 'параметры в URL: ' + p.url());
await p.click('#calc-form button[type=submit]');
ok(await p.locator('#k-addr[aria-invalid=true]').count() === 1, 'пустые обязательные поля подсвечены');
ok(await p.evaluate(() => document.activeElement?.id) === 'k-addr', 'фокус на первом пустом поле');
await p.fill('#k-addr', 'Москва, ЖК Тест');
await p.fill('#k-name', 'Иван Тестов');
await p.locator('#k-phone').pressSequentially('9161234567');
await p.check('#k-consent');
await p.waitForTimeout(3100);
await p.click('#calc-form button[type=submit]');
await p.waitForSelector('article.kp', { timeout: 30000 });
const kpText = await p.locator('article.kp').innerText();
ok(/КП-\d{6}-\d{3}/.test(kpText) && kpText.includes('на оказание услуг строительного контроля') && kpText.includes('без НДС'), 'КП из калькулятора: номер, «стройконтроль», без НДС');
ok(await p.locator('a:has-text("Скачать PDF")').count() === 1, 'кнопка «Скачать PDF»');
ok(!(await p.content()).includes('sign.png') && !(await p.content()).includes('stamp.png'), 'подпись/печать не попадают в браузер');
await p.screenshot({ path: out + '/e2e-kp-calc.png', fullPage: false });

// 3. Пакеты
await p.goto(base + '/ceny');
await p.waitForTimeout(400);
ok((await p.locator('.pk-form button[type=submit]').innerText()).replace(/\s/g, '') === 'Получитьпредложение·270000₽за3мес.', 'кнопка пакета: 270 000 ₽ за 3 мес.');
await p.click('.pk-card:has-text("Эксперт")');
await p.click('button[aria-label="Больше месяцев"]');
ok((await p.locator('.pk-form button[type=submit]').innerText()).replace(/\s/g, '') === 'Получитьпредложение·560000₽за4мес.', 'Эксперт × 4 мес → 560 000 ₽');
await p.fill('#pk-ceny-addr', 'Москва, ул. Тестовая');
await p.fill('#pk-ceny-name', 'Пётр');
await p.locator('#pk-ceny-phone').pressSequentially('89160000000');
await p.check('#pk-ceny-consent');
await p.waitForTimeout(3100);
await p.click('.pk-form button[type=submit]');
await p.waitForSelector('article.kp', { timeout: 30000 });
ok((await p.locator('article.kp').innerText()).includes('пакет «Эксперт»'), 'КП пакета «Эксперт» под формой');

// 4. Расценки
await p.goto(base + '/ceny/rascenki');
await p.waitForTimeout(400);
ok(await p.locator('.rt__row').count() === 138, '138 позиций в расценках');
await p.fill('#price-search', 'ГОСТ 10180');
await p.waitForTimeout(200);
const n = await p.locator('.rt__row').count();
ok(n > 0 && n < 10, 'поиск «ГОСТ 10180» → ' + n);
await p.fill('#price-search', 'керн');
await p.locator('.rt__add').first().click();
await p.fill('#price-search', 'ёмкост'); await p.waitForTimeout(100);
await p.fill('#price-search', 'zzzz');
ok(await p.locator('text=Ничего не нашли? Позвоните').isVisible(), 'пустое состояние');
await p.fill('#price-search', '');
await p.locator('button[aria-label="Увеличить количество"]').first().click();
await p.reload(); await p.waitForTimeout(500);
ok((await p.locator('#rates-cart li').count()) === 1, 'корзина сохраняется в localStorage');
await p.fill('#r-addr', 'Объект 1'); await p.fill('#r-name', 'Анна');
await p.locator('#r-phone').pressSequentially('9161112233'); await p.check('#r-consent');
await p.waitForTimeout(3100);
await p.click('#rates-cart button[type=submit]');
await p.waitForSelector('article.kp', { timeout: 30000 });
ok((await p.locator('article.kp').innerText()).includes('2 пробу'), 'КП из расценок с количеством 2');

// 5. Бургер
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 800 });
await m.goto(base + '/');
await m.click('[data-burger]');
ok(await m.locator('#mnav').isVisible(), 'бургер открывается');
await m.keyboard.press('Escape');
ok(!(await m.locator('#mnav').isVisible()), 'бургер закрывается по Esc');
await b.close();
console.log(fails ? `\n${fails} проверок не прошло` : '\nВсе проверки прошли');
process.exit(fails ? 1 : 0);

// Скриншоты страниц на 1440 и 390 px + проверка горизонтальной прокрутки. node scripts/shots.mjs <outdir> [base]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2] || 'shots';
const base = process.argv[3] || 'http://127.0.0.1:4321';
fs.mkdirSync(out, { recursive: true });
const pages = ['/', '/stroitelnyj-kontrol', '/kontrol-monolita', '/laboratoriya', '/elektrolaboratoriya', '/obsledovanie', '/ceny', '/ceny/rascenki', '/kalkulyator', '/kontakty', '/personalnye-dannye', '/404-test'];
const widths = (process.env.WIDTHS || '1440,390').split(',').map(Number);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem('nicsmk.cookie', 'necessary'));
  const p = await ctx.newPage();
  for (const path of pages) {
    await p.goto(base + path, { waitUntil: 'networkidle' });
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(300);
    const over = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const bad = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > W + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.hp,.sr-only,.kp-table'); }).slice(0, 5).map((el) => el.tagName + '.' + el.className + ' ' + Math.round(el.getBoundingClientRect().right));
      return { sw: document.documentElement.scrollWidth, W, bad };
    });
    if (over.sw > over.W || over.bad.length) console.log('OVERFLOW', w, path, JSON.stringify(over));
    const name = (path === '/' ? 'home' : path.slice(1).replace(/\//g, '_')) + '-' + w + '.png';
    await p.screenshot({ path: out + '/' + name, fullPage: true });
  }
  await ctx.close();
}
await b.close();
console.log('done');

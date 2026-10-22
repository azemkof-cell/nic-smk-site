/**
 * PDF из HTML-шаблона через Chromium (playwright-core).
 * Подпись и печать читаются из PRIVATE_DIR (по умолчанию ./private) и встраиваются только в PDF.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { kpHtml, type Kp } from '../lib/kp';

const ROOT = process.cwd();
const PRIVATE = process.env.PRIVATE_DIR || path.join(ROOT, 'private');
const FONTS = process.env.FONTS_DIR || [path.join(ROOT, 'dist/client/fonts'), path.join(ROOT, 'public/fonts')].find((d) => fs.existsSync(d)) || '';

const dataUri = (file: string, mime: string) => {
  try {
    return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
  } catch {
    return '';
  }
};

function fontCss(): string {
  const f = (fam: string, sub: string) => {
    const uri = dataUri(path.join(FONTS, `font-${fam}-${sub}.woff2`), 'font/woff2');
    return uri ? `@font-face{font-family:'${fam}';font-weight:100 900;src:url(${uri}) format('woff2')}` : '';
  };
  return ['Manrope', 'Unbounded'].flatMap((x) => [f(x, 'cyrillic'), f(x, 'latin')]).join('\n');
}

let browser: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = (async () => {
      const { chromium } = await import('playwright-core');
      const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean) as string[];
      const executablePath = candidates.find((p) => fs.existsSync(p));
      const b = await chromium.launch({ executablePath, args: ['--no-sandbox', '--font-render-hinting=none', '--disable-dev-shm-usage'] });
      b.on('disconnected', () => (browser = null));
      return b;
    })();
    browser.catch(() => (browser = null));
  }
  return browser;
}

export function wrapDoc(inner: string, title: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>
${fontCss()}
@page{size:A4;margin:14mm 12mm}
*{box-sizing:border-box}
body{margin:0;font-family:'Manrope',Arial,sans-serif;color:#14171A;font-size:13.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{page-break-inside:auto}tr{page-break-inside:avoid}
.kp-table{overflow:visible!important}
.kp-table table{min-width:0!important}
</style></head><body>${inner}</body></html>`;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally {
    await page.close();
  }
}

export function kpPdf(kp: Kp): Promise<Buffer> {
  const inner = kpHtml(kp, { sign: dataUri(path.join(PRIVATE, 'sign.png'), 'image/png'), stamp: dataUri(path.join(PRIVATE, 'stamp.png'), 'image/png') });
  return htmlToPdf(wrapDoc(inner, 'Коммерческое предложение ' + kp.no));
}

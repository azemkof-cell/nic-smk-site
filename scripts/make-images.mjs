// Генерирует favicon.ico/png, apple-touch-icon и og.jpg (1200×630) из исходников. Запуск: node scripts/make-images.mjs
import sharp from 'sharp';
import fs from 'node:fs';
const svg = fs.readFileSync('public/favicon.svg');
await sharp(svg).resize(180, 180).flatten({ background: '#F5C02B' }).png().toFile('public/apple-touch-icon.png');
await sharp(svg).resize(32, 32).png().toFile('public/favicon-32.png');
// ICO с одним PNG 32×32 внутри
const png = fs.readFileSync('public/favicon-32.png');
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
fs.writeFileSync('public/favicon.ico', Buffer.concat([head, png]));
fs.unlinkSync('public/favicon-32.png');
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#14171A" opacity="0.72"/>
<rect x="64" y="64" width="72" height="72" rx="16" fill="#F5C02B"/><g transform="translate(76 76) scale(2)" fill="none" stroke="#14171A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/></g>
<text x="160" y="114" font-family="Manrope, Arial, sans-serif" font-size="40" font-weight="800" fill="#fff">НИЦ СМК</text>
<text x="64" y="330" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#fff">Строительный контроль</text>
<text x="64" y="410" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#F5C02B">и испытания полного цикла</text>
<text x="64" y="530" font-family="Arial, sans-serif" font-size="30" fill="#D6D9DD">Аккредитованная лаборатория · Москва · КП онлайн за минуту</text>
</svg>`);
await sharp('src/assets/img/lab-964eb733.jpg').resize(1200, 630, { fit: 'cover' }).composite([{ input: overlay }]).jpeg({ quality: 82 }).toFile('public/og.jpg');
console.log('ok');

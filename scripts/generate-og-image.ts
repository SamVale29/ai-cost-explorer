import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const output = resolve(process.cwd(), 'public', 'brand', 'social-preview.png');
await mkdir(resolve(process.cwd(), 'public', 'brand'), { recursive: true });
const svg = `<svg width="1280" height="640" xmlns="http://www.w3.org/2000/svg">
  <rect width="1280" height="640" fill="#0b1020"/>
  <circle cx="1080" cy="-20" r="360" fill="#14334a" opacity="0.8"/>
  <circle cx="1150" cy="560" r="260" fill="#163c35" opacity="0.75"/>
  <text x="80" y="145" fill="#65e6b5" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="4">AI COST EXPLORER</text>
  <text x="80" y="250" fill="#f4f7fb" font-family="Arial, sans-serif" font-size="68" font-weight="700">Choose the right</text>
  <text x="80" y="330" fill="#f4f7fb" font-family="Arial, sans-serif" font-size="68" font-weight="700">AI model before the bill arrives.</text>
  <text x="82" y="400" fill="#a8b4c7" font-family="Arial, sans-serif" font-size="26">Transparent pricing, capabilities and history for modern AI APIs.</text>
  <rect x="80" y="470" width="720" height="86" rx="18" fill="#111a2d" stroke="#2a3b55"/>
  <text x="112" y="508" fill="#7c8da6" font-family="Arial, sans-serif" font-size="16">MODEL</text>
  <text x="112" y="540" fill="#f4f7fb" font-family="Arial, sans-serif" font-size="23" font-weight="700">GPT-5.6 Terra</text>
  <text x="350" y="508" fill="#7c8da6" font-family="Arial, sans-serif" font-size="16">INPUT / OUTPUT</text>
  <text x="350" y="540" fill="#65e6b5" font-family="Arial, sans-serif" font-size="23" font-weight="700">$2.50 / $15.00</text>
  <text x="625" y="508" fill="#7c8da6" font-family="Arial, sans-serif" font-size="16">CONTEXT</text>
  <text x="625" y="540" fill="#f7b955" font-family="Arial, sans-serif" font-size="23" font-weight="700">1.05M</text>
</svg>`;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
console.log(`Generated ${output}`);

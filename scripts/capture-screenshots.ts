import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:4173/ai-cost-explorer/';
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await mkdir(resolve(process.cwd(), 'public', 'brand'), { recursive: true });
await page.screenshot({ path: resolve(process.cwd(), 'public', 'brand', 'landing-screenshot.png'), fullPage: true });
await page.goto(`${baseUrl}explore`, { waitUntil: 'networkidle' });
await page.screenshot({ path: resolve(process.cwd(), 'public', 'brand', 'explorer-screenshot.png'), fullPage: true });
await browser.close();
console.log('Captured landing and explorer screenshots.');

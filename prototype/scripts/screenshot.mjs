import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'apps/web/virtual-sprig.png';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500); // let a few frames render
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);

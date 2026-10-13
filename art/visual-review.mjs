import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL(process.env.VISUAL_REVIEW_OUTPUT || './review-production/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
try {
console.log('Opening local game');
await page.goto(process.env.VISUAL_REVIEW_URL || 'http://127.0.0.1:8004', { waitUntil: 'commit', timeout: 60000 });
console.log('Response received, waiting for WebGL canvas');
await page.locator('canvas').first().waitFor({ timeout: 300000 });
await page.waitForTimeout(12000);
await page.screenshot({ path: new URL('isometric.png', output).pathname.replace(/^\/(\w:)/, '$1') });
await page.getByRole('button', { name: 'Câmera', exact: true }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: new URL('third-person.png', output).pathname.replace(/^\/(\w:)/, '$1') });
const performanceSample = await page.evaluate(async () => {
  const samples = [];
  let previous = performance.now();
  for (let i = 0; i < 90; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const now = performance.now();
    samples.push(now - previous);
    previous = now;
  }
  samples.sort((a, b) => a - b);
  return { frameMedianMs: samples[45], frameP95Ms: samples[85], frames: samples.length,
    renderer: window.__celStats || null, note: 'Local headless Chrome sample; CPU/GPU/load dependent, not a target-hardware FPS guarantee.' };
});
await writeFile(new URL('report.json', output), JSON.stringify({ errors, performanceSample, text: await page.locator('body').innerText(), buttons: await page.getByRole('button').allTextContents() }, null, 2));
console.log(JSON.stringify({ errors, title: await page.title(), output: output.pathname }));
} catch (error) {
  await page.screenshot({ path: new URL('failure.png', output).pathname.replace(/^\/(\w:)/, '$1'), timeout: 10000 }).catch(() => {});
  await writeFile(new URL('failure.json', output), JSON.stringify({ error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}

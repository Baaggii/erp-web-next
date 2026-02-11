import test from 'node:test';
import assert from 'node:assert/strict';

const runE2E = process.env.RUN_WIDGET_E2E === '1';

if (!runE2E) {
  test('messaging widget e2e', { skip: true }, () => {});
} else {
  test('messaging widget smoke e2e via puppeteer', async (t) => {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new' });
    t.after(async () => {
      await browser.close();
    });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle2' });

    const launcher = await page.waitForSelector('[aria-label="Open messaging widget"]', { timeout: 15000 });
    assert.ok(launcher);
    await launcher.click();

    const composer = await page.waitForSelector('[aria-label="Message composer"]', { timeout: 15000 });
    assert.ok(composer);

    await page.type('[aria-label="Message composer"]', 'e2e ping');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
  });
}

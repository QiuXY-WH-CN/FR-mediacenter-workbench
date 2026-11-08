import {spawn} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE;
const {chromium} = PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(PLAYWRIGHT_MODULE).href)
  : await import('playwright');

const port = Number(process.env.TUTORIAL_CHECK_PORT || 8922);
const base = `http://127.0.0.1:${port}`;
const setupToken = 'tutorial-reader-check';
const server = spawn(process.execPath, ['scripts/dev.mjs'], {
  env: {...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: ':memory:',
    BOOTSTRAP_HASH: createHash('sha256').update(setupToken).digest('hex')},
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('startup timeout')), 20000);
    server.stdout.on('data', (c) => { if (c.toString().includes('Local:')) { clearTimeout(timer); resolve(); } });
    server.on('error', reject); server.on('exit', (c) => reject(Error('exit ' + c)));
  });
  browser = await chromium.launch({channel: 'msedge', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/#setup=' + setupToken);
  await page.locator('[name=username]').fill('check_admin');
  await page.locator('[name=name]').fill('检查管理员');
  await page.locator('[name=password]').fill('Check-admin-2026!');
  await page.locator('[name=confirm]').fill('Check-admin-2026!');
  await page.getByRole('button', {name: '创建管理员账号', exact: true}).click();
  await page.locator('.sidebar').waitFor();
  await page.evaluate(() => { localStorage.setItem('fengru-tour-done', '1'); if (typeof stopTour === 'function') stopTour(); });

  await page.locator('[data-view=sop]').first().click();
  await page.locator('.sop-document').first().waitFor();
  const firstTitle = await page.locator('.sop-document').first().locator('span').first().textContent();
  assert.ok(firstTitle.includes('新手快速入门'), 'tutorial listed first: ' + firstTitle);
  await page.locator('.sop-document').first().click();
  await page.locator('#dialog .sop-reader').waitFor();
  assert.equal(await page.locator('#dialog .sop-sandbox[data-sandbox]').count(), 8, '8 sandbox exercises');

  await page.fill('#dialog [data-sandbox=login] [name=username]', 'demo_user');
  await page.fill('#dialog [data-sandbox=login] [name=password]', 'demo-pass-1234');
  await page.click('#dialog [data-sandbox=login] button[type=submit]');
  await page.waitForSelector('#dialog [data-sandbox=login] .sop-sandbox-ok', {state: 'attached'});

  await page.evaluate(() => document.querySelector('#dialog [data-sop-full]').click());
  await page.waitForSelector('#sop-fullscreen.in');
  assert.ok(await page.locator('#sop-fullscreen .sop-full-toc .sop-toc-link').count() >= 3, 'fullscreen with TOC');
  assert.ok(await page.locator('#sop-fullscreen .sop-reader img.guide-screenshot').count() >= 6, 'inline images render');
  await page.locator('#sop-fullscreen [data-sandbox=event] [name=name]').scrollIntoViewIfNeeded();
  await page.fill('#sop-fullscreen [data-sandbox=event] [name=name]', '迎新晚会拍摄');
  await page.click('#sop-fullscreen [data-sandbox=event] button[type=submit]');
  await page.waitForSelector('#sop-fullscreen [data-sandbox=event] .sop-sandbox-result', {state: 'attached'});
  await page.evaluate(() => document.querySelector('#sop-fullscreen [data-sop-full-close]').click());
  await page.waitForSelector('#sop-fullscreen', {state: 'detached'});
  assert.ok(await page.locator('#dialog').evaluate((d) => d.open), 'back to preview modal');

  await page.evaluate(() => document.querySelector('#dialog [data-sop-tour]').click());
  await page.locator('#tour-tip').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS tutorial: preview default, 8 sandboxes, fullscreen toggle + animation, tour.');
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

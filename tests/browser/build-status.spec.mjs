import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectDashboardAppearance } from './dashboard-appearance.mjs';

const now = new Date('2026-10-16T12:10:00Z');
const newer = { version: 'published-build-2', builtAt: '2026-10-16T13:01:00.000Z' };
const newHtml = `<html><head><meta name="dashboard-version" content="${newer.version}"></head><body data-built-at="${newer.builtAt}"></body></html>`;
const testFont = `
  @font-face { font-family: 'Visual Test Mono'; src: url('/test-mono-400.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Visual Test Mono'; src: url('/test-mono-700.woff2') format('woff2'); font-weight: 700; }
  :root { --font-mono: 'Visual Test Mono', monospace; }
`;

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: now });
  await page.goto('/');
  await page.addStyleTag({ content: testFont });
  await page.evaluate(() => document.fonts.ready);
});

async function simulatePublication(page, { manifest = newer, html = newHtml } = {}) {
  await page.route(/\/version\.json(?:\?|$)/, route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(manifest),
  }));
  await page.route(/\/index\.html\?check=/, route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

test('loaded feed health, age, and expected schedule remain distinct', async ({ page }) => {
  const status = page.locator('.status-bar');
  await expect(status).toContainText('DEGRADED');
  await expect(status).toContainText('RSS 4/5');
  await expect(status).toContainText('BUILT 10m ago');
  await expect(page.locator('#status-next')).toContainText('NEXT 00:50:00');
  await page.clock.fastForward(49 * 60_000);
  await expect(status).toContainText('BUILT 59m ago');
  await expect(page.locator('#status-next')).toContainText('NEXT 00:01:00');
  await page.clock.fastForward(60_000);
  await expect(page.locator('#status-next')).toContainText('AWAITING UPDATE');
  await expect(page.locator('#status-update')).toBeHidden();
  expect(await status.evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(32);
});

test('successful feed fixture reports ready health', async ({ page }) => {
  await page.goto('/healthy/');
  await expect(page.locator('.status-bar')).toContainText('READY');
  await expect(page.locator('.status-bar')).toContainText('RSS 5/5');
});

test('successful empty feed is healthy while a separate failed feed is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/empty/');
  await expect(page.locator('.status-bar')).toContainText('RSS 4/5');
  await expect(page.locator('#feed-axios .feed-unavailable')).toHaveText('feed unavailable');
  await page.getByRole('button', { name: 'Next RSS page' }).click();
  await expect(page.locator('#feed-longreads .feed-empty')).toHaveText('No headlines available');
  await expect(page.locator('#feed-longreads .feed-unavailable')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('without status JavaScript the exact build time and feed health remain visible', async ({ page }) => {
  await page.route(/\/build-status\.js(?:\?|$)/, route => route.abort());
  await page.reload();
  await expect(page.locator('.status-bar')).toContainText('RSS 4/5');
  await expect(page.locator('#built-at-time')).toHaveText('2026-10-16T12:00:00.000Z');
  await expect(page.locator('#status-next')).toBeHidden();
  await expect(page.locator('#status-update')).toBeHidden();
  await expect(page.getByRole('link', { name: 'A small tool for faster local builds' })).toBeVisible();
});

test('details dialog reports loaded metadata and restores focus', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Build details' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'BUILD DETAILS' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('2026-10-16T12:00:00.000Z');
  await expect(dialog).toContainText('RSS 4/5');
  await expect(dialog).toContainText('Longreads');
  await expect(dialog).toContainText('0 * * * * UTC');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('dialog', { name: 'KEYBOARD SHORTCUTS' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('matching manifest and HTML expose update without replacing loaded content', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Next RSS page' }).click();
  const focused = page.locator('#feed-longreads');
  await focused.focus();
  const before = page.url();
  await simulatePublication(page);
  await expect(page.locator('#status-update')).toBeVisible();
  await expect(page.getByRole('button', { name: 'REFRESH' })).toBeVisible();
  await expect(page.locator('#rss-page-indicator')).toHaveText('02 / 02');
  await expect(focused).toBeFocused();
  expect(page.url()).toBe(before);
  await expect(page.locator('#built-at-time')).toHaveAttribute('datetime', '2026-10-16T12:00:00.000Z');
  await expect(page.locator('#shortcut-refresh')).toBeHidden();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.locator('#shortcut-refresh')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('manifest before HTML and HTML before manifest do not announce an update', async ({ page }) => {
  await simulatePublication(page, { html: '<html><head><meta name="dashboard-version" content="fixture-2026-10-16"></head><body data-built-at="2026-10-16T12:00:00.000Z"></body></html>' });
  await expect(page.locator('#status-update')).toBeHidden();
  await simulatePublication(page, { manifest: { version: 'fixture-2026-10-16', builtAt: '2026-10-16T12:00:00.000Z' } });
  await expect(page.locator('#status-update')).toBeHidden();
  await simulatePublication(page);
  await expect(page.locator('#status-update')).toBeVisible();
});

test('malformed and failed version checks leave content usable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/version\.json(?:\?|$)/, route => route.abort());
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#status-update')).toBeHidden();
  await expect(page.getByRole('link', { name: 'A small tool for faster local builds' })).toBeVisible();
  await page.unroute(/\/version\.json(?:\?|$)/);
  await page.route(/\/version\.json(?:\?|$)/, route => route.fulfill({ contentType: 'application/json', body: '{' }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#status-update')).toBeHidden();
  expect(errors).toEqual([]);
});

test('visible-tab checks do not overlap a pending manifest request', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let requests = 0;
  await page.route(/\/version\.json(?:\?|$)/, async route => {
    requests++;
    await pending;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      version: 'fixture-2026-10-16', builtAt: '2026-10-16T12:00:00.000Z',
    }) });
  });
  try {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => requests).toBe(1);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(requests).toBe(1);
  } finally { release(); }
});

test('manual button and R navigate only after a verified update', async ({ page }) => {
  await page.keyboard.press('r');
  expect(page.url()).toBe('http://127.0.0.1:4173/');
  await simulatePublication(page);
  await expect(page.getByRole('button', { name: 'REFRESH' })).toBeVisible();
  await page.getByRole('button', { name: 'REFRESH' }).click();
  await expect(page).toHaveURL(/\/index\.html\?refresh=/);
  await page.goto('/');
  await simulatePublication(page);
  await expect(page.getByRole('button', { name: 'REFRESH' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search the web' }).fill('');
  await page.keyboard.press('r');
  await expect(page.getByRole('searchbox', { name: 'Search the web' })).toHaveValue('r');
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await page.keyboard.press('r');
  await expect(page.getByRole('dialog', { name: 'KEYBOARD SHORTCUTS' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#rss-heading').focus();
  await page.keyboard.press('r');
  await expect(page).toHaveURL(/\/index\.html\?refresh=/);
});

test('footer stays inside compact viewports with an update and details open', async ({ page }) => {
  for (const [width, height] of [[1280, 720], [1440, 900], [960, 600]]) {
    await page.setViewportSize({ width, height });
    await simulatePublication(page);
    await expect(page.locator('#status-update')).toBeVisible();
    await page.getByRole('button', { name: 'Build details' }).click();
    const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      footerHeight: document.querySelector('.status-bar').getBoundingClientRect().height,
      dialogBottom: document.getElementById('build-details').getBoundingClientRect().bottom }));
    expect(geometry).toMatchObject({ width, height, footerHeight: 32 });
    expect(geometry.dialogBottom).toBeLessThanOrEqual(height);
    await page.keyboard.press('Escape');
  }
});

test('visual baseline loaded status, update, and build details', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await simulatePublication(page);
  await expect(page.locator('#status-update')).toBeVisible();
  await expectDashboardAppearance(page, 'dashboard-update-1280x720.png');
  await page.getByRole('button', { name: 'Build details' }).click();
  await expect(page).toHaveScreenshot('build-details-1280x720.png');
});

test('visual baseline ready health at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/healthy/');
  await page.addStyleTag({ content: testFont });
  await page.evaluate(() => document.fonts.ready);
  await expectDashboardAppearance(page, 'dashboard-ready-1440x900.png');
});

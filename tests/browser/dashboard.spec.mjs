import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const fixedNow = new Date('2026-10-16T12:10:00Z');
const testFont = `
  @font-face { font-family: 'Visual Test Mono'; src: url('/test-mono-400.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Visual Test Mono'; src: url('/test-mono-700.woff2') format('woff2'); font-weight: 700; }
  :root { --font-mono: 'Visual Test Mono', monospace; }
`;

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: fixedNow });
  await page.goto('/');
  await page.addStyleTag({ content: testFont });
  await page.evaluate(() => document.fonts.ready);
});

for (const [width, height] of [[1280, 720], [1440, 900], [1024, 576], [853, 480], [1152, 720], [960, 600]]) {
  test(`fixed shell fits ${width}x${height} CSS viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const toolbar = page.locator('.app-toolbar');
    const rss = page.getByRole('region', { name: 'RSS' });
    const future = page.getByRole('region', { name: 'WORKSPACE' });
    const status = page.locator('.status-bar');
    await expect(toolbar).toBeVisible();
    await expect(rss).toBeVisible();
    await expect(future).toBeVisible();
    await expect(status).toBeVisible();

    const geometry = await page.evaluate(() => {
      const rss = document.querySelector('.rss-workspace').getBoundingClientRect();
      const future = document.querySelector('.future-workspace').getBoundingClientRect();
      const status = document.querySelector('.status-bar').getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        rssWidth: rss.width,
        futureWidth: future.width,
        statusBottom: status.bottom,
      };
    });
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
    expect(geometry.documentHeight).toBe(geometry.viewportHeight);
    expect(Math.abs(geometry.rssWidth - geometry.futureWidth)).toBeLessThan(2);
    expect(geometry.statusBottom).toBe(geometry.viewportHeight);
  });
}

test('reserved workspace has three noninteractive slots that fit at desktop sizes', async ({ page }) => {
  for (const [width, height] of [[1280, 720], [1440, 900], [960, 600], [853, 480]]) {
    await page.setViewportSize({ width, height });
    const workspace = page.getByRole('region', { name: 'WORKSPACE' });
    const metrics = page.getByRole('region', { name: 'METRICS' });
    const home = page.getByRole('region', { name: 'HOME' });
    const utilities = page.getByRole('region', { name: 'UTILITIES' });
    for (const slot of [metrics, home, utilities]) {
      await expect(slot).toBeVisible();
      await expect(slot).toContainText('RESERVED');
      expect(await slot.evaluate(element =>
        element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight
      )).toBe(true);
    }
    await expect(workspace.locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0);

    const boxes = await Promise.all([workspace, metrics, home, utilities].map(locator => locator.boundingBox()));
    const [outer, top, lowerLeft, lowerRight] = boxes;
    expect(top.x).toBe(lowerLeft.x);
    expect(top.width).toBeGreaterThan(lowerLeft.width);
    expect(top.x + top.width).toBeGreaterThan(lowerRight.x + lowerRight.width - 1);
    expect(lowerLeft.y).toBe(lowerRight.y);
    expect(lowerLeft.x + lowerLeft.width).toBeLessThan(lowerRight.x);
    for (const box of [top, lowerLeft, lowerRight]) {
      expect(box.x).toBeGreaterThanOrEqual(outer.x);
      expect(box.y).toBeGreaterThanOrEqual(outer.y);
      expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(box.y + box.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  }
});

test('search is labelled, autofocuses, and offers three destinations', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'Search the web' });
  await expect(search).toBeFocused();
  for (const name of ['Google', 'Kagi', 'DDG']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Google' })).toHaveAttribute('aria-pressed', 'true');
});

test('search accepts immediate typing and Escape leaves its query intact', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'Search the web' });
  await expect(search).toBeFocused();
  await page.keyboard.type('ordinary words');
  await expect(search).toHaveValue('ordinary words');
  await search.press('Escape');
  await expect(page.getByRole('link', { name: 'A small tool for faster local builds' })).toBeFocused();
  await expect(search).toHaveValue('ordinary words');
  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  expect(await search.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, 'ordinary words'.length]);
});

test('editable search treats question mark and page arrows as ordinary input', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'Search the web' });
  await page.keyboard.type('?');
  await expect(search).toHaveValue('?');
  await expect(page.getByRole('dialog', { name: 'KEYBOARD SHORTCUTS' })).toBeHidden();
  await search.press('ArrowRight');
  await expect(page.locator('#rss-page-indicator')).toHaveText('01 / 02');
});

test('help is modal, keyboard accessible, and restores article focus after Escape', async ({ page }) => {
  const link = page.getByRole('link', { name: 'A small tool for faster local builds' });
  await link.focus();
  await page.keyboard.press('Shift+/');
  const dialog = page.getByRole('dialog', { name: 'KEYBOARD SHORTCUTS' });
  const close = page.getByRole('button', { name: 'CLOSE' });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await expect(close).toHaveCSS('outline-color', 'rgb(131, 165, 152)');
  await expect(page.locator('#shortcut-pages')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => {
    const dialog = document.getElementById('shortcut-help');
    return document.activeElement === dialog || dialog.contains(document.activeElement);
  })).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => {
    const dialog = document.getElementById('shortcut-help');
    return document.activeElement === dialog || dialog.contains(document.activeElement);
  })).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#rss-page-indicator')).toHaveText('01 / 02');
  await page.keyboard.press('Shift+/');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(link).toBeFocused();
});

test('footer help button and close button restore footer focus', async ({ page }) => {
  const help = page.getByRole('button', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await help.click();
  await expect(page.getByRole('dialog', { name: 'KEYBOARD SHORTCUTS' })).toBeVisible();
  await page.getByRole('button', { name: 'CLOSE' }).click();
  await expect(help).toBeFocused();
});

test('Escape and help have useful targets with one or zero feeds', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'Search the web' });
  await page.goto('/one/');
  await search.press('Escape');
  await expect(page.getByRole('link', { name: 'A small tool for faster local builds' })).toBeFocused();
  await page.keyboard.press('Shift+/');
  await expect(page.locator('#shortcut-pages')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.goto('/none/');
  await search.press('Escape');
  await expect(page.locator('#rss-heading')).toBeFocused();
  await page.keyboard.press('Shift+/');
  await expect(page.getByRole('dialog', { name: 'KEYBOARD SHORTCUTS' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#rss-heading')).toBeFocused();
});

test('Escape from search focuses an unavailable feed on the selected RSS page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Next RSS page' }).click();
  const search = page.getByRole('searchbox', { name: 'Search the web' });
  await search.focus();
  await search.press('Escape');
  await expect(page.locator('#feed-longreads')).toBeFocused();
});

test('help keeps the document fixed and passes axe at desktop viewport sizes', async ({ page }) => {
  for (const [width, height] of [[1280, 720], [1440, 900], [960, 600]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    const geometry = await page.evaluate(() => {
      const dialog = document.getElementById('shortcut-help').getBoundingClientRect();
      return { documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        dialogTop: dialog.top, dialogBottom: dialog.bottom };
    });
    expect(geometry.documentWidth).toBe(width);
    expect(geometry.documentHeight).toBe(height);
    expect(geometry.dialogTop).toBeGreaterThanOrEqual(0);
    expect(geometry.dialogBottom).toBeLessThanOrEqual(height);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('closing help after resize falls back from a hidden opener to a visible RSS target', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/many/');
  await page.locator('#feed-longreads').focus();
  await page.keyboard.press('Shift+/');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#rss-page-indicator')).toHaveText('01 / 03');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'A small tool for faster local builds' })).toBeFocused();
});

test('search selection persists and invalid storage falls back to Google', async ({ page }) => {
  await page.getByRole('button', { name: 'Kagi' }).click();
  await expect(page.getByRole('button', { name: 'Kagi' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#search-form')).toHaveAttribute('action', 'https://kagi.com/search');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Kagi' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'DDG' }).click();
  await expect(page.getByRole('button', { name: 'DDG' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#search-form')).toHaveAttribute('action', 'https://duckduckgo.com/');
  await page.evaluate(() => localStorage.setItem('search-engine', 'invalid'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Google' })).toHaveAttribute('aria-pressed', 'true');
});

test('search still works when storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage unavailable'); } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Kagi' }).click();
  await expect(page.getByRole('button', { name: 'Kagi' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#search-form')).toHaveAttribute('action', 'https://kagi.com/search');
});

test('search submits to the selected destination without contacting it', async ({ page }) => {
  await page.getByRole('button', { name: 'Kagi' }).click();
  await page.route('https://kagi.com/search?**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<title>Intercepted search</title>',
  }));
  await page.getByRole('searchbox', { name: 'Search the web' }).fill('static dashboards');
  const request = page.waitForRequest(request => request.url().startsWith('https://kagi.com/search?'));
  await page.getByRole('searchbox', { name: 'Search the web' }).press('Enter');
  expect((await request).url()).toContain('q=static+dashboards');
});

test('fixture feeds and article links remain accessible without runtime RSS requests', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.reload();
  await expect(page.locator('.feed-widget')).toHaveCount(5);
  const longLink = page.getByRole('link', { name: 'How a very long headline wraps naturally when its source panel is narrow and the dashboard window is resized' });
  await expect(longLink).toHaveAttribute('href', 'https://example.com/hn/2');
  await expect(page.getByRole('link', { name: 'SQLite notes' }).locator('..').locator('time')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next RSS page' }).click();
  await expect(page.getByRole('region', { name: 'Longreads: Essays and Investigations' })).toContainText('feed unavailable');
  expect(requests.every(url => url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
  expect(requests.some(url => url.includes('feed-data.json'))).toBe(false);
});

test('headlines stay dense, wrap fully, and do not overflow narrow feed panels', async ({ page }) => {
  await page.setViewportSize({ width: 853, height: 480 });
  const link = page.getByRole('link', { name: 'How a very long headline wraps naturally when its source panel is narrow and the dashboard window is resized' });
  await expect(link).toBeVisible();
  const metrics = await link.evaluate(el => ({
    fontSize: getComputedStyle(el).fontSize,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    height: el.getBoundingClientRect().height,
    title: el.textContent,
    panelOverflow: el.closest('.feed-widget').scrollWidth > el.closest('.feed-widget').clientWidth,
  }));
  expect(metrics.fontSize).toBe('13px');
  expect(metrics.height).toBeGreaterThan(metrics.lineHeight * 2);
  expect(metrics.title).toContain('dashboard window is resized');
  expect(metrics.panelOverflow).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(853);
});

test('a minimum-height panel exposes two representative wrapped headlines', async ({ page }) => {
  await page.setViewportSize({ width: 853, height: 364 });
  await expect(page.locator('#rss-page-indicator')).toHaveText('01 / 03');
  const geometry = await page.locator('#feed-hn').evaluate(panel => {
    const body = panel.querySelector('.widget-body');
    const second = body.querySelectorAll('.feed-item')[1];
    return {
      panelHeight: panel.getBoundingClientRect().height,
      bodyBottom: body.getBoundingClientRect().bottom,
      secondBottom: second.getBoundingClientRect().bottom,
      scrollable: body.scrollHeight > body.clientHeight,
    };
  });
  expect(geometry.panelHeight).toBeGreaterThanOrEqual(226);
  expect(geometry.secondBottom).toBeLessThanOrEqual(geometry.bodyBottom);
  expect(geometry.scrollable).toBe(true);
});

test('relative dates update from a shared timer while exact UTC dates remain available', async ({ page }) => {
  const first = page.locator('#feed-hn .feed-item-date').first();
  await expect(first).toHaveText('30m');
  await expect(first).toHaveAttribute('datetime', '2026-10-16T11:40:00.000Z');
  await expect(first).toHaveAttribute('title', '2026-10-16 11:40 UTC');
  await expect(first).toHaveAttribute('aria-label', '2026-10-16 11:40 UTC');
  await expect(page.getByRole('link', { name: 'SQLite notes' }).locator('..').locator('time')).toHaveCount(0);
  await page.clock.runFor(30 * 60_000);
  await expect(first).toHaveText('1h');
});

test('without JavaScript, timestamp fallback remains absolute and semantic', async ({ page }) => {
  await page.route(/\/dashboard\.js(?:\?|$)/, route => route.abort());
  await page.reload();
  const first = page.locator('#feed-hn .feed-item-date').first();
  await expect(first).toHaveText('Oct 16');
  await expect(first).toHaveAttribute('datetime', '2026-10-16T11:40:00.000Z');
});

test('hover and focus are visible, and article scrolling uses styled native bars', async ({ page }) => {
  const link = page.getByRole('link', { name: 'A small tool for faster local builds' });
  const row = link.locator('..');
  const initialBackground = await row.evaluate(el => getComputedStyle(el).backgroundColor);
  await link.hover();
  await expect(row).not.toHaveCSS('background-color', initialBackground);
  await expect(link).toHaveCSS('color', 'rgb(250, 189, 47)');
  await page.getByRole('searchbox', { name: 'Search the web' }).focus();
  for (let index = 0; index < 5; index++) await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await expect(link).toHaveCSS('outline-color', 'rgb(250, 189, 47)');
  await expect(page.locator('#feed-hn .widget-body')).toHaveCSS('scrollbar-width', 'thin');
  await expect(page.locator('#feed-hn .widget-body')).toHaveCSS('overscroll-behavior-y', 'contain');
});

test('reduced motion removes article color and row transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#feed-hn .feed-item').first()).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('#feed-hn .feed-item-title').first()).toHaveCSS('transition-duration', '0s');
});

test('Tab reaches article links and focus is visible', async ({ page }) => {
  await expect(page.getByRole('searchbox', { name: 'Search the web' })).toBeFocused();
  for (let index = 0; index < 4; index++) await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Next RSS page' })).toBeFocused();
  await page.keyboard.press('Tab');
  const firstArticle = page.getByRole('link', { name: 'A small tool for faster local builds' });
  await expect(firstArticle).toBeFocused();
  await expect(firstArticle).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Next RSS page' })).toBeFocused();
});

test('five feeds paginate at 1280x720 and fit at 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('.rss-column .feed-widget')).toHaveCount(4);
  await expect(page.locator('#rss-page-indicator')).toHaveText('01 / 02');
  await expect(page.getByRole('button', { name: 'Previous RSS page' })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.rss-column .feed-widget')).toHaveCount(5);
  await expect(page.locator('#rss-navigation')).toBeHidden();
  await expect(page.locator('.rss-column').first().locator('.feed-widget')).toHaveCount(3);
  await expect(page.locator('.rss-column').nth(1).locator('.feed-widget')).toHaveCount(2);
});

test('one feed stays in one column and zero feeds show a static empty state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/one/');
  await expect(page.locator('.rss-column').first().locator('.feed-widget')).toHaveCount(1);
  await expect(page.locator('.rss-column').nth(1)).toBeHidden();
  await expect(page.locator('#rss-navigation')).toBeHidden();
  await page.goto('/none/');
  await expect(page.locator('.feed-widget')).toHaveCount(0);
  await expect(page.locator('.rss-empty')).toContainText('No RSS feeds configured.');
});

test('multiple pages use configured order and mouse, Enter, and Arrow keys navigate', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/many/');
  const names = await page.locator('.feed-widget .widget-title').allTextContents();
  expect(names).toHaveLength(9);
  const visibleIds = async () => page.locator('.rss-column .feed-widget').evaluateAll(elements => elements.map(el => el.id));
  expect(await visibleIds()).toEqual(['feed-hn', 'feed-lobsters', 'feed-arstechnica', 'feed-axios']);
  await page.getByRole('button', { name: 'Next RSS page' }).click();
  await expect(page.locator('#rss-page-indicator')).toHaveText('02 / 03');
  expect(await visibleIds()).toEqual(['feed-longreads', 'feed-extra-6', 'feed-extra-7', 'feed-extra-8']);
  await expect(page.locator('#feed-longreads')).toBeFocused();
  await expect(page.locator('#rss-page-announcement')).toHaveText('RSS page 2 of 3');
  await page.keyboard.press('ArrowRight');
  expect(await visibleIds()).toEqual(['feed-extra-9']);
  await expect(page.getByRole('button', { name: 'Next RSS page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous RSS page' }).focus();
  await page.keyboard.press('Enter');
  expect(await visibleIds()).toEqual(['feed-longreads', 'feed-extra-6', 'feed-extra-7', 'feed-extra-8']);
  await page.keyboard.press('ArrowLeft');
  expect(await visibleIds()).toEqual(['feed-hn', 'feed-lobsters', 'feed-arstechnica', 'feed-axios']);
});

test('search input keeps native arrow behavior and page selection resets on reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Next RSS page' }).click();
  const search = page.getByRole('searchbox', { name: 'Search the web' });
  await search.fill('hello');
  await search.press('ArrowLeft');
  await expect(page.locator('#rss-page-indicator')).toHaveText('02 / 02');
  await page.reload();
  await expect(page.locator('#rss-page-indicator')).toHaveText('01 / 02');
});

test('resize preserves focused feed and a visible-page anchor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/many/');
  const feedFive = page.locator('#feed-longreads');
  await feedFive.focus();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#rss-page-indicator')).toHaveText('02 / 03');
  await expect(feedFive).toBeVisible();
  await expect(feedFive).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#rss-page-indicator')).toHaveText('01 / 02');
  await expect(feedFive).toBeFocused();
  await page.getByRole('button', { name: 'Next RSS page' }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#rss-page-indicator')).toHaveText('02 / 03');
});

test('all links remain reachable across pages and article lists scroll independently', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/many/');
  const allHrefs = await page.locator('.feed-item-title').evaluateAll(links => links.map(link => link.href));
  const seen = new Set();
  for (let index = 0; index < 3; index++) {
    for (const href of await page.locator('.rss-column .feed-item-title').evaluateAll(links => links.map(link => link.href))) seen.add(href);
    if (index < 2) await page.getByRole('button', { name: 'Next RSS page' }).click();
  }
  expect([...seen].sort()).toEqual(allHrefs.sort());
  await page.getByRole('button', { name: 'Previous RSS page' }).click();
  await page.getByRole('button', { name: 'Previous RSS page' }).click();
  const first = page.locator('#feed-hn .widget-body');
  const second = page.locator('#feed-lobsters .widget-body');
  await first.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await first.evaluate(el => { el.scrollTop = 100; });
  await expect.poll(() => first.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await second.evaluate(el => el.scrollTop)).toBe(0);
  expect(await page.locator('.rss-content').evaluate(el => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
});

test('resize retains a visible feed article-list scroll offset', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const body = page.locator('#feed-hn .widget-body');
  await body.evaluate(el => { el.scrollTop = 100; });
  await body.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const before = await body.evaluate(el => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.rss-column').first().locator('.feed-widget')).toHaveCount(3);
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBe(before);
});

test('too-short workspace explains the constraint without losing feeds', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await expect(page.locator('#rss-size-warning')).toBeVisible();
  await expect(page.locator('#rss-navigation')).toBeHidden();
  await expect(page.locator('.feed-widget')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(300);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('.rss-column .feed-widget')).toHaveCount(4);
});

test('static fallback retains every feed when dashboard script is unavailable', async ({ page }) => {
  await page.route(/\/dashboard\.js(?:\?|$)/, route => route.abort());
  await page.reload();
  await expect(page.locator('.widget-grid > .feed-widget')).toHaveCount(5);
  await expect(page.locator('.rss-content')).toHaveCSS('overflow-y', 'auto');
  await expect(page.locator('#status-help')).toBeHidden();
});

test('pagination controls pass axe and remain outside hidden content', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const next = page.getByRole('button', { name: 'Next RSS page' });
  await expect(next).toBeVisible();
  await next.focus();
  await expect(next).toHaveCSS('outline-style', 'solid');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('status is visible and scripts raise no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.reload();
  const status = page.locator('.status-bar');
  await expect(status).toBeVisible();
  await expect(status).toContainText('BUILT 10m ago');
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('principal view has no automated axe violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

for (const [width, height] of [[1280, 720], [1440, 900]]) {
  test(`visual baseline ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await expect(page.locator('body')).toHaveScreenshot(`dashboard-${width}x${height}.png`);
  });
}

test('visual baseline compact RSS workspace at 960x600', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await expect(page.locator('body')).toHaveScreenshot('dashboard-960x600.png');
});

test('visual baseline second RSS page at 1280x720', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/many/');
  await page.getByRole('button', { name: 'Next RSS page' }).click();
  await expect(page.locator('body')).toHaveScreenshot('dashboard-second-page-1280x720.png');
});

for (const [width, height] of [[1280, 720], [1440, 900], [960, 600]]) {
  test(`visual baseline keyboard help at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(page).toHaveScreenshot(`keyboard-help-${width}x${height}.png`);
  });
}

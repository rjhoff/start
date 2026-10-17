import { expect } from '@playwright/test';

// Dense text snapshots are authored on macOS. Linux uses exact layout and theme
// assertions because Chromium rasterizes the same test font differently there.
export async function expectDashboardAppearance(page, snapshotName) {
  if (process.platform === 'darwin' && process.env.DASHBOARD_VISUAL_MODE !== 'structure') {
    await expect(page.locator('body')).toHaveScreenshot(snapshotName);
    return;
  }

  const appearance = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const css = selector => getComputedStyle(document.querySelector(selector));
    const rss = rect('.rss-workspace');
    const future = rect('.future-workspace');
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      toolbarBottom: rect('.app-toolbar').bottom,
      rssWidth: rss.width,
      futureWidth: future.width,
      workspaceBottom: rss.bottom,
      footerTop: rect('.status-bar').top,
      footerBottom: rect('.status-bar').bottom,
      background: css('body').backgroundColor,
      panelBorder: css('.feed-widget').borderTopColor,
      reservedBorder: css('.reserved-slot').borderTopColor,
      headlineColor: css('.feed-item-title').color,
      font: css('.feed-item-title').fontFamily,
      fontLoaded: document.fonts.check('13px "Visual Test Mono"'),
    };
  });
  expect(appearance.width).toBe(page.viewportSize().width);
  expect(appearance.height).toBe(page.viewportSize().height);
  expect(appearance.toolbarBottom).toBe(56);
  expect(Math.abs(appearance.rssWidth - appearance.futureWidth)).toBeLessThan(2);
  expect(appearance.workspaceBottom).toBe(appearance.footerTop);
  expect(appearance.footerBottom).toBe(page.viewportSize().height);
  expect(appearance.background).toBe('rgb(40, 40, 40)');
  expect(appearance.panelBorder).toBe('rgb(102, 92, 84)');
  expect(appearance.reservedBorder).toBe('rgb(80, 73, 69)');
  expect(appearance.headlineColor).toBe('rgb(235, 219, 178)');
  expect(appearance.font).toContain('Visual Test Mono');
  expect(appearance.fontLoaded).toBe(true);
}

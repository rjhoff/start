(function () {
  'use strict';

  const MIN_PANEL_HEIGHT = 226;
  const PANEL_GAP = 8;
  const CONTENT_PADDING = 8;

  function rowsForHeight(height, minimum = MIN_PANEL_HEIGHT) {
    if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(minimum) || minimum <= 0) return 0;
    const usable = height - CONTENT_PADDING * 2;
    return usable < minimum ? 0 : Math.floor((usable + PANEL_GAP) / (minimum + PANEL_GAP));
  }

  function pagesForFeeds(feeds, rows) {
    if (!Array.isArray(feeds) || feeds.length === 0 || !Number.isInteger(rows) || rows < 1) return [];
    const capacity = rows * 2;
    const pages = [];
    for (let start = 0; start < feeds.length; start += capacity) {
      const page = feeds.slice(start, start + capacity);
      const leftCount = Math.ceil(page.length / 2);
      pages.push([page.slice(0, leftCount), page.slice(leftCount)]);
    }
    return pages;
  }

  function pageForFeed(feedIndex, rows, feedCount) {
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(feedCount) || feedCount < 1) return 0;
    const last = Math.ceil(feedCount / (rows * 2)) - 1;
    return Math.min(last, Math.max(0, Math.floor(Math.max(0, feedIndex) / (rows * 2))));
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { rowsForHeight, pagesForFeeds, pageForFeed };
  }

  if (typeof document === 'undefined') return;

  const relativeTimes = document.querySelectorAll('time.feed-item-date[datetime]');
  function updateRelativeTimes() {
    const now = Date.now();
    for (const time of relativeTimes) {
      const relative = window.RssTime?.formatRelativeTime(time.dateTime, now);
      if (relative) time.textContent = relative;
    }
  }
  updateRelativeTimes();
  if (relativeTimes.length) setInterval(updateRelativeTimes, 60_000);

  const workspace = document.querySelector('.rss-workspace');
  const content = workspace?.querySelector('.rss-content');
  const grid = content?.querySelector('.widget-grid');
  if (!workspace || !content || !grid) return;

  const feeds = Array.from(grid.querySelectorAll(':scope > .feed-widget'));
  if (feeds.length === 0) return;

  const navigation = document.getElementById('rss-navigation');
  const previous = document.getElementById('rss-previous');
  const next = document.getElementById('rss-next');
  const indicator = document.getElementById('rss-page-indicator');
  const announcement = document.getElementById('rss-page-announcement');
  const warning = document.getElementById('rss-size-warning');
  const columns = [document.createElement('div'), document.createElement('div')];
  const inactive = document.createElement('div');
  columns.forEach((column) => {
    column.className = 'rss-column';
    grid.append(column);
  });
  inactive.hidden = true;
  grid.append(inactive);
  workspace.classList.add('rss-enhanced');

  let rows = -1;
  let pageIndex = 0;
  let renderVersion = 0;
  let restoringScroll = false;
  const scrollOffsets = new Map();
  for (const feed of feeds) {
    const body = feed.querySelector('.widget-body');
    body?.addEventListener('scroll', () => {
      if (!restoringScroll && body.scrollHeight > body.clientHeight) scrollOffsets.set(feed, body.scrollTop);
    }, { passive: true });
  }
  window.addEventListener('resize', () => { restoringScroll = true; });

  function focusFeed(feed) {
    (feed.querySelector('.feed-item-title') || feed).focus({ preventScroll: true });
  }

  function render(nextRows, nextPage, moveFocus = false) {
    restoringScroll = true;
    const active = document.activeElement;
    const focusedFeed = active?.closest?.('.feed-widget');
    for (const feed of feeds) {
      if (feed.parentElement === inactive) continue;
      const body = feed.querySelector('.widget-body');
      if (body && (body.scrollHeight > body.clientHeight || !scrollOffsets.has(feed))) {
        scrollOffsets.set(feed, body.scrollTop);
      }
    }
    const pages = pagesForFeeds(feeds, nextRows);
    rows = nextRows;
    pageIndex = Math.min(Math.max(0, nextPage), Math.max(0, pages.length - 1));
    const version = ++renderVersion;

    if (nextRows === 0) {
      grid.hidden = true;
      warning.hidden = false;
      navigation.hidden = true;
      if (focusedFeed || navigation.contains(active)) warning.focus({ preventScroll: true });
      requestAnimationFrame(() => { if (version === renderVersion) restoringScroll = false; });
      return;
    }

    grid.hidden = false;
    warning.hidden = true;
    const [left, right] = pages[pageIndex];
    const visible = new Set([...left, ...right]);
    for (const feed of feeds) {
      if (!visible.has(feed) && feed.parentElement !== inactive) inactive.append(feed);
    }
    for (const [column, items] of [[columns[0], left], [columns[1], right]]) {
      column.style.setProperty('--panel-count', items.length);
      column.hidden = items.length === 0;
      for (const feed of items) if (feed.parentElement !== column) column.append(feed);
    }
    requestAnimationFrame(() => {
      if (version !== renderVersion) return;
      for (const feed of visible) {
        const body = feed.querySelector('.widget-body');
        if (body) body.scrollTop = scrollOffsets.get(feed) || 0;
      }
      requestAnimationFrame(() => { if (version === renderVersion) restoringScroll = false; });
    });

    navigation.hidden = pages.length < 2;
    indicator.textContent = `${String(pageIndex + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`;
    previous.disabled = pageIndex === 0;
    next.disabled = pageIndex === pages.length - 1;

    if (moveFocus || (focusedFeed && !visible.has(focusedFeed)) || (navigation.hidden && navigation.contains(active)) || active === warning) {
      focusFeed(left[0] || right[0]);
    } else if (focusedFeed && visible.has(focusedFeed) && document.activeElement !== active) {
      active.focus({ preventScroll: true });
    }
  }

  function measure() {
    const nextRows = rowsForHeight(content.clientHeight);
    if (nextRows === rows) {
      requestAnimationFrame(() => { restoringScroll = false; });
      return;
    }
    const focusedFeed = document.activeElement?.closest?.('.feed-widget');
    const anchorIndex = focusedFeed
      ? feeds.indexOf(focusedFeed)
      : Math.min(feeds.length - 1, pageIndex * Math.max(1, rows * 2));
    render(nextRows, pageForFeed(anchorIndex, nextRows, feeds.length));
  }

  function changePage(direction) {
    if (rows < 1) return;
    const pages = pagesForFeeds(feeds, rows);
    const target = pageIndex + direction;
    if (target < 0 || target >= pages.length) return;
    render(rows, target, true);
    announcement.textContent = `RSS page ${target + 1} of ${pages.length}`;
  }

  previous.addEventListener('click', () => changePage(-1));
  next.addEventListener('click', () => changePage(1));
  workspace.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const target = pageIndex + (event.key === 'ArrowRight' ? 1 : -1);
      if (target < 0 || target >= pagesForFeeds(feeds, rows).length) return;
      event.preventDefault();
      changePage(event.key === 'ArrowRight' ? 1 : -1);
    }
  });

  measure();
  new ResizeObserver(measure).observe(content);
})();

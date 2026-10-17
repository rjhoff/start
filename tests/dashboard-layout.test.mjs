import { test, expect } from 'vitest';
import layout from '../src/dashboard.js';

const { rowsForHeight, pagesForFeeds, pageForFeed, shortcutForKey } = layout;
const feeds = Array.from({ length: 9 }, (_, index) => `feed-${index + 1}`);

test('height threshold includes content padding and inter-panel gap', () => {
  expect(rowsForHeight(241)).toBe(0);
  expect(rowsForHeight(242)).toBe(1);
  expect(rowsForHeight(475)).toBe(1);
  expect(rowsForHeight(476)).toBe(2);
  expect(rowsForHeight(709)).toBe(2);
  expect(rowsForHeight(710)).toBe(3);
});

test('invalid or unusable dimensions produce no rows', () => {
  for (const height of [0, -1, NaN, Infinity, undefined]) expect(rowsForHeight(height)).toBe(0);
  expect(rowsForHeight(500, 0)).toBe(0);
});

test('zero and one feed preserve sensible columns', () => {
  expect(pagesForFeeds([], 2)).toEqual([]);
  expect(pagesForFeeds(feeds.slice(0, 1), 2)).toEqual([[['feed-1'], []]]);
  expect(pagesForFeeds(feeds, 0)).toEqual([]);
});

test('even and odd feed counts distribute in configuration order', () => {
  expect(pagesForFeeds(feeds.slice(0, 4), 2)).toEqual([[
    ['feed-1', 'feed-2'], ['feed-3', 'feed-4'],
  ]]);
  expect(pagesForFeeds(feeds.slice(0, 5), 3)).toEqual([[
    ['feed-1', 'feed-2', 'feed-3'], ['feed-4', 'feed-5'],
  ]]);
  expect(pagesForFeeds(feeds.slice(0, 6), 3)).toEqual([[
    ['feed-1', 'feed-2', 'feed-3'], ['feed-4', 'feed-5', 'feed-6'],
  ]]);
});

test('overflow pages retain order and partially filled final page', () => {
  expect(pagesForFeeds(feeds, 2)).toEqual([
    [['feed-1', 'feed-2'], ['feed-3', 'feed-4']],
    [['feed-5', 'feed-6'], ['feed-7', 'feed-8']],
    [['feed-9'], []],
  ]);
});

test('anchor mapping follows capacity changes and clamps at the last page', () => {
  expect(pageForFeed(4, 3, 9)).toBe(0);
  expect(pageForFeed(4, 2, 9)).toBe(1);
  expect(pageForFeed(8, 2, 9)).toBe(2);
  expect(pageForFeed(99, 3, 9)).toBe(1);
  expect(pageForFeed(-5, 2, 9)).toBe(0);
  expect(pageForFeed(2, 0, 9)).toBe(0);
  expect(pageForFeed(2, 2, 0)).toBe(0);
});

test('shortcuts respect editable fields, RSS context, and page availability', () => {
  const context = { editable: false, searchFocused: false, rssContext: true,
    canPrevious: false, canNext: true, helpOpen: false };
  const key = (value, options = {}) => ({ key: value, ...options });
  expect(shortcutForKey(key('/'), context)).toBe('search');
  expect(shortcutForKey(key('?'), context)).toBe('help');
  expect(shortcutForKey(key('ArrowRight'), context)).toBe('next');
  expect(shortcutForKey(key('ArrowLeft'), context)).toBeNull();
  expect(shortcutForKey(key('ArrowRight'), { ...context, rssContext: false })).toBeNull();
  expect(shortcutForKey(key('ArrowRight'), { ...context, canNext: false })).toBeNull();
  expect(shortcutForKey(key('?'), { ...context, editable: true })).toBeNull();
  expect(shortcutForKey(key('Escape'), { ...context, editable: true, searchFocused: true })).toBe('leave-search');
  expect(shortcutForKey(key('x'), context)).toBeNull();
});

test('modifier keys, IME composition, and an open modal suppress routing', () => {
  const context = { editable: false, searchFocused: false, rssContext: true,
    canPrevious: true, canNext: true, helpOpen: false };
  for (const options of [{ altKey: true }, { ctrlKey: true }, { metaKey: true },
    { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }]) {
    expect(shortcutForKey({ key: '/', ...options }, context)).toBeNull();
  }
  expect(shortcutForKey({ key: 'ArrowRight', shiftKey: true }, context)).toBeNull();
  expect(shortcutForKey({ key: '?', shiftKey: true }, context)).toBe('help');
  expect(shortcutForKey({ key: '/', shiftKey: true }, context)).toBe('help');
  expect(shortcutForKey({ key: '?' }, { ...context, helpOpen: true })).toBeNull();
  expect(shortcutForKey({ key: '?', repeat: true }, context)).toBeNull();
});

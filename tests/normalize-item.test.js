const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeItem } = require('../build/normalize-item.js');

test('normalizes a complete item with isoDate', () => {
  const item = {
    title: 'Test Article',
    link: 'https://example.com/article',
    isoDate: '2026-07-04T12:00:00.000Z',
  };
  const result = normalizeItem(item, 'test-feed');
  assert.equal(result.title, 'Test Article');
  assert.equal(result.link, 'https://example.com/article');
  assert.equal(result.feedId, 'test-feed');
  assert.match(result.pubDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('falls back to pubDate when isoDate is missing', () => {
  const item = {
    title: 'Old Article',
    link: 'https://example.com/old',
    pubDate: 'Fri, 04 Jul 2026 12:00:00 +0000',
  };
  const result = normalizeItem(item, 'feed-2');
  assert.ok(result.pubDate, 'pubDate should be set');
  assert.match(result.pubDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('uses guid as link fallback', () => {
  const item = { title: 'No Link', guid: 'urn:uuid:abc123', isoDate: '2026-07-04T00:00:00.000Z' };
  const result = normalizeItem(item, 'feed-3');
  assert.equal(result.link, 'urn:uuid:abc123');
});

test('falls back title to (no title)', () => {
  const item = { link: 'https://example.com', isoDate: '2026-07-04T00:00:00.000Z' };
  const result = normalizeItem(item, 'feed-4');
  assert.equal(result.title, '(no title)');
});

test('falls back link to # when absent', () => {
  const item = { title: 'No Link', isoDate: '2026-07-04T00:00:00.000Z' };
  const result = normalizeItem(item, 'feed-5');
  assert.equal(result.link, '#');
});

test('returns null pubDate when no date fields present', () => {
  const item = { title: 'No Date', link: 'https://example.com' };
  const result = normalizeItem(item, 'feed-6');
  assert.equal(result.pubDate, null);
});

test('returns null pubDate for unparseable date string', () => {
  const item = { title: 'Bad Date', link: 'https://example.com', isoDate: 'not a date' };
  const result = normalizeItem(item, 'feed-7');
  assert.equal(result.pubDate, null);
});

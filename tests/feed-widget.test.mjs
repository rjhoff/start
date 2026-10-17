import { test } from 'vitest';
import assert from 'node:assert/strict';
import feedWidget from '../src/widgets/feed-widget.js';

const { render } = feedWidget;

const config = { id: 'test-feed', title: 'Test Feed', category: 'tech' };
const feedData = {
  items: [
    { title: 'Article One', link: 'https://example.com/1', pubDate: '2026-07-04T12:00:00.000Z', feedId: 'test-feed' },
    { title: 'Article Two', link: 'https://example.com/2', pubDate: '2026-07-03T10:00:00.000Z', feedId: 'test-feed' },
  ],
};

test('renders feed title and category', () => {
  const html = render(feedData, config);
  assert.ok(html.includes('Test Feed'), 'missing title');
  assert.ok(html.includes('tech'), 'missing category');
});

test('renders each item title as a link opening in new tab', () => {
  const html = render(feedData, config);
  assert.ok(html.includes('Article One'));
  assert.ok(html.includes('href="https://example.com/1"'));
  assert.ok(html.includes('target="_blank"'));
});

test('renders exact semantic UTC time and an absolute static fallback', () => {
  const html = render(feedData, config);
  assert.ok(html.includes('datetime="2026-07-04T12:00:00.000Z"'));
  assert.ok(html.includes('title="2026-07-04 12:00 UTC"'));
  assert.ok(html.includes('aria-label="2026-07-04 12:00 UTC"'));
  assert.ok(html.includes('>Jul 4</time>'));
});

test('renders error state when feedData has error property', () => {
  const html = render({ error: 'timeout', items: [] }, config);
  assert.ok(html.includes('feed unavailable'));
  assert.ok(html.includes('Test Feed'), 'header should still render in error state');
});

test('renders error state when items array is empty', () => {
  const html = render({ items: [] }, config);
  assert.ok(html.includes('feed unavailable'));
});

test('escapes HTML entities in item title to prevent XSS', () => {
  const xss = {
    items: [{ title: '<script>alert(1)</script>', link: 'https://example.com', pubDate: null, feedId: 'f' }],
  };
  const html = render(xss, config);
  assert.ok(!html.includes('<script>'), 'raw <script> tag must not appear in output');
  assert.ok(html.includes('&lt;script&gt;'));
});

test('escapes HTML entities in item link to prevent XSS', () => {
  const xss = {
    items: [{ title: 'Legit', link: 'javascript:alert(1)', pubDate: null, feedId: 'f' }],
  };
  const html = render(xss, config);
  assert.ok(!html.includes('href="javascript:'), 'raw javascript: href must not appear');
});

test('omits timestamp element when pubDate is null', () => {
  const noDate = {
    items: [{ title: 'No Date', link: 'https://example.com', pubDate: null, feedId: 'f' }],
  };
  const html = render(noDate, config);
  assert.ok(!html.includes('<time'), 'should not render <time> when pubDate is null');
});

test('omits category element when config has no category', () => {
  const noCategory = { id: 'no-cat', title: 'No Cat' };
  const html = render(feedData, noCategory);
  assert.ok(!html.includes('widget-category'));
});

test('sets id attribute on widget root element', () => {
  const html = render(feedData, config);
  assert.ok(html.includes('id="feed-test-feed"'));
});

test('omits malformed or injected timestamps', () => {
  const xssDate = {
    items: [{ title: 'Test', link: 'https://example.com', pubDate: '" onmouseover="alert(1)', feedId: 'f' }],
  };
  const html = render(xssDate, config);
  assert.ok(!html.includes('<time'), 'invalid date should not render as a timestamp');
  assert.ok(!html.includes('onmouseover'), 'injected attribute must not appear');
});

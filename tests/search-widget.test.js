const { test } = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../src/widgets/search-widget.js');

test('renders a form with GET method and id=search-form', () => {
  const html = render({ defaultEngine: 'google' });
  assert.ok(html.includes('method="GET"'));
  assert.ok(html.includes('id="search-form"'));
});

test('renders engine toggle buttons for all three engines', () => {
  const html = render({ defaultEngine: 'google' });
  assert.ok(html.includes('data-engine="google"'));
  assert.ok(html.includes('data-engine="kagi"'));
  assert.ok(html.includes('data-engine="ddg"'));
});

test('includes autofocus attribute on the search input', () => {
  const html = render({ defaultEngine: 'google' });
  assert.ok(html.includes('autofocus'));
});

test('includes inline script for localStorage engine persistence', () => {
  const html = render({ defaultEngine: 'google' });
  assert.ok(html.includes('localStorage'));
  assert.ok(html.includes('search-engine'));
  assert.ok(html.includes('kagi.com'));
  assert.ok(html.includes('duckduckgo.com'));
});

test('bakes defaultEngine into the localStorage fallback in the script', () => {
  const html = render({ defaultEngine: 'kagi' });
  assert.ok(html.includes("|| 'kagi'"));
});

test('form default action points to google', () => {
  const html = render({ defaultEngine: 'google' });
  assert.ok(html.includes('action="https://www.google.com/search"'));
});

test('defaults to google when no defaultEngine provided', () => {
  const html = render({});
  assert.ok(html.includes("|| 'google'"));
});

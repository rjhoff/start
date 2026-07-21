# Personal Start Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static personal new-tab start page with a search bar and RSS feed widgets, rebuilt on a schedule via GH Actions and deployed to `start.rjhoff.dev` on GH Pages.

**Architecture:** A Node.js build pipeline (`fetch-feeds.js` → `build.js`) reads `feeds.config.json`, fetches RSS at build time, and renders static HTML from pure render functions; no client-side data fetching. Widget render functions (`feed-widget.js`, `search-widget.js`) are pure `(data, config) => HTML string` functions, tested independently. The shipped `dist/` is a single `index.html` + `styles.css`.

**Tech Stack:** Node.js 20, `rss-parser` (single runtime dependency), Node built-in `node:test` runner, GH Actions (`peaceiris/actions-gh-pages`), GH Pages custom domain.

---

## File Map

```
.
├── .github/workflows/build.yml       — hourly GH Actions build + deploy
├── build/
│   ├── normalize-item.js             — pure fn: rss-parser item → {title,link,pubDate,feedId}
│   ├── fetch-feeds.js                — reads config, fetches RSS, writes dist/feed-data.json
│   └── build.js                     — reads template+data, writes dist/index.html + CNAME
├── src/
│   ├── template.html                 — page shell with {{BUILT_AT}}, {{SEARCH_WIDGET}}, {{WIDGET_GRID}} slots
│   ├── styles.css                    — design tokens + layout (no framework)
│   └── widgets/
│       ├── feed-widget.js            — render(feedData, config) => HTML string
│       └── search-widget.js          — render(config) => HTML string (form + inline persistence script)
├── tests/
│   ├── normalize-item.test.js
│   ├── feed-widget.test.js
│   └── search-widget.test.js
├── feeds.config.json                 — feed list (id, type, title, url, limit, category)
├── .env.example                      — SEARCH_ENGINE_DEFAULT, BUILD_OUTPUT_DIR
├── .gitignore
└── package.json
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "start-page",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "fetch": "node build/fetch-feeds.js",
    "build:only": "node build/build.js",
    "build": "node build/fetch-feeds.js && node build/build.js",
    "test": "node --test tests/normalize-item.test.js tests/feed-widget.test.js tests/search-widget.test.js"
  },
  "dependencies": {
    "rss-parser": "^3.13.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p build src/widgets tests .github/workflows
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` written.

- [ ] **Step 5: Commit**

```bash
git init
git add package.json package-lock.json .gitignore
git commit -m "chore: project scaffold with rss-parser dependency"
```

---

## Task 2: Item Normalizer (TDD)

**Files:**
- Create: `build/normalize-item.js`
- Test: `tests/normalize-item.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/normalize-item.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/normalize-item.test.js
```

Expected: `Error: Cannot find module '../build/normalize-item.js'`

- [ ] **Step 3: Implement normalize-item.js**

Create `build/normalize-item.js`:

```js
function normalizeItem(item, feedId) {
  const raw = item.isoDate || item.pubDate || null;
  let pubDate = null;
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      pubDate = d.toISOString().slice(0, 16);
    }
  }
  return {
    title: item.title || '(no title)',
    link: item.link || item.guid || '#',
    pubDate,
    feedId,
  };
}

module.exports = { normalizeItem };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/normalize-item.test.js
```

Expected: `✔ normalizes a complete item with isoDate` × 7, all passing.

- [ ] **Step 5: Commit**

```bash
git add build/normalize-item.js tests/normalize-item.test.js
git commit -m "feat: add item normalizer with ISO-8601 date output"
```

---

## Task 3: Feed Widget (TDD)

**Files:**
- Create: `src/widgets/feed-widget.js`
- Test: `tests/feed-widget.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/feed-widget.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../src/widgets/feed-widget.js');

const config = { id: 'test-feed', title: 'Test Feed', category: 'tech' };
const feedData = {
  items: [
    { title: 'Article One', link: 'https://example.com/1', pubDate: '2026-07-04T12:00', feedId: 'test-feed' },
    { title: 'Article Two', link: 'https://example.com/2', pubDate: '2026-07-03T10:00', feedId: 'test-feed' },
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

test('renders ISO-8601 timestamp for each item', () => {
  const html = render(feedData, config);
  assert.ok(html.includes('2026-07-04T12:00'));
  assert.ok(html.includes('datetime="2026-07-04T12:00"'));
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/feed-widget.test.js
```

Expected: `Error: Cannot find module '../src/widgets/feed-widget.js'`

- [ ] **Step 3: Implement feed-widget.js**

Create `src/widgets/feed-widget.js`:

```js
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(url) {
  return /^https?:\/\//i.test(url) || url === '#';
}

function render(feedData, config) {
  const hasItems = feedData.items && feedData.items.length > 0;

  const header = `  <div class="widget-header">
    <span class="widget-title">${escapeHtml(config.title)}</span>
    ${config.category ? `<span class="widget-category">${escapeHtml(config.category)}</span>` : ''}
  </div>`;

  if (feedData.error || !hasItems) {
    return `<div class="widget feed-widget" id="feed-${escapeHtml(config.id)}">
${header}
  <div class="widget-body">
    <p class="feed-unavailable">feed unavailable</p>
  </div>
</div>`;
  }

  const items = feedData.items
    .map((item) => {
      const safeLink = isSafeUrl(item.link) ? escapeHtml(item.link) : '#';
      const dateEl = item.pubDate
        ? `\n      <time class="feed-item-date" datetime="${item.pubDate}">${item.pubDate}</time>`
        : '';
      return `    <li class="feed-item">
      <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="feed-item-title">${escapeHtml(item.title)}</a>${dateEl}
    </li>`;
    })
    .join('\n');

  return `<div class="widget feed-widget" id="feed-${escapeHtml(config.id)}">
${header}
  <ul class="widget-body feed-list">
${items}
  </ul>
</div>`;
}

module.exports = { render };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/feed-widget.test.js
```

Expected: all 10 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/feed-widget.js tests/feed-widget.test.js
git commit -m "feat: add feed widget renderer with XSS protection"
```

---

## Task 4: Search Widget (TDD)

**Files:**
- Create: `src/widgets/search-widget.js`
- Test: `tests/search-widget.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/search-widget.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/search-widget.test.js
```

Expected: `Error: Cannot find module '../src/widgets/search-widget.js'`

- [ ] **Step 3: Implement search-widget.js**

Create `src/widgets/search-widget.js`:

```js
function render(config) {
  const defaultEngine = config.defaultEngine || 'google';
  return `<div class="search-container">
  <form id="search-form" action="https://www.google.com/search" method="GET">
    <input type="search" name="q" autofocus placeholder="search..." class="search-input" autocomplete="off" />
    <div class="engine-toggle">
      <button type="button" data-engine="google">Google</button>
      <button type="button" data-engine="kagi">Kagi</button>
      <button type="button" data-engine="ddg">DDG</button>
    </div>
  </form>
  <script>
    (function () {
      var engines = {
        google: { action: 'https://www.google.com/search', param: 'q' },
        kagi:   { action: 'https://kagi.com/search',        param: 'q' },
        ddg:    { action: 'https://duckduckgo.com/',         param: 'q' }
      };
      var saved = localStorage.getItem('search-engine') || '${defaultEngine}';
      var form = document.getElementById('search-form');
      form.action = engines[saved].action;
      form.querySelector('input[type=search]').name = engines[saved].param;
      document.querySelectorAll('.engine-toggle button').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.engine === saved);
        btn.addEventListener('click', function () {
          localStorage.setItem('search-engine', btn.dataset.engine);
          form.action = engines[btn.dataset.engine].action;
          form.querySelector('input[type=search]').name = engines[btn.dataset.engine].param;
          document.querySelectorAll('.engine-toggle button').forEach(function (b) {
            b.classList.toggle('active', b.dataset.engine === btn.dataset.engine);
          });
        });
      });
    })();
  </script>
</div>`;
}

module.exports = { render };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/search-widget.test.js
```

Expected: all 7 tests passing.

- [ ] **Step 5: Run all tests together to confirm no regressions**

```bash
npm test
```

Expected: all 24 tests passing (7 normalize + 10 feed + 7 search).

- [ ] **Step 6: Commit**

```bash
git add src/widgets/search-widget.js tests/search-widget.test.js
git commit -m "feat: add search widget renderer with localStorage engine persistence"
```

---

## Task 5: CSS Design System

**Files:**
- Create: `src/styles.css`

- [ ] **Step 1: Create styles.css**

Create `src/styles.css`:

```css
:root {
  --font-mono: "Berkeley Mono", ui-monospace, monospace;
  --color-bg: #0a0a0a;
  --color-fg: #e4e4e4;
  --color-accent: #ffb000;
  --color-border: #2a2a2a;
  --color-muted: #6b6b6b;
  --radius: 0;
  --space-unit: 8px;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── Layout ──────────────────────────────────────────────────── */

.page-header {
  padding: calc(var(--space-unit) * 3) calc(var(--space-unit) * 3) calc(var(--space-unit) * 2);
  border-bottom: 1px solid var(--color-border);
}

.widget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1px;
  background: var(--color-border);
  flex: 1;
}

.page-footer {
  padding: var(--space-unit) calc(var(--space-unit) * 3);
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: 11px;
}

/* ── Search ──────────────────────────────────────────────────── */

.search-container {
  max-width: 640px;
}

#search-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-unit);
}

.search-input {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  color: var(--color-fg);
  font-family: var(--font-mono);
  font-size: 16px;
  outline: none;
  padding: var(--space-unit) calc(var(--space-unit) * 1.5);
  width: 100%;
}

.search-input:focus {
  border-color: var(--color-accent);
}

.engine-toggle {
  background: var(--color-border);
  display: flex;
  gap: 1px;
}

.engine-toggle button {
  background: var(--color-bg);
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  padding: calc(var(--space-unit) * 0.5) var(--space-unit);
  text-transform: lowercase;
}

.engine-toggle button:hover,
.engine-toggle button.active {
  color: var(--color-accent);
}

/* ── Widget shell ─────────────────────────────────────────────── */

.widget {
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  max-height: 400px;
  overflow: hidden;
}

.widget-header {
  align-items: baseline;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-unit);
  padding: var(--space-unit) calc(var(--space-unit) * 1.5);
  flex-shrink: 0;
}

.widget-title {
  color: var(--color-accent);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.widget-category {
  color: var(--color-muted);
  font-size: 10px;
}

.widget-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--space-unit) * 0.5) 0;
}

/* ── Feed items ───────────────────────────────────────────────── */

.feed-list {
  list-style: none;
}

.feed-item {
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: calc(var(--space-unit) * 0.75) calc(var(--space-unit) * 1.5);
}

.feed-item:last-child {
  border-bottom: none;
}

.feed-item-title {
  color: var(--color-fg);
  font-size: 12px;
  line-height: 1.4;
  text-decoration: none;
}

.feed-item-title:hover {
  color: var(--color-accent);
}

.feed-item-date {
  color: var(--color-muted);
  font-size: 10px;
}

.feed-unavailable {
  color: var(--color-muted);
  font-size: 11px;
  padding: calc(var(--space-unit) * 1.5);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat: add design system CSS with phosphor amber tokens"
```

---

## Task 6: Template HTML

**Files:**
- Create: `src/template.html`

- [ ] **Step 1: Create template.html**

Create `src/template.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Start</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body data-built-at="{{BUILT_AT}}">
  <header class="page-header">
    {{SEARCH_WIDGET}}
  </header>
  <main class="widget-grid">
    {{WIDGET_GRID}}
  </main>
  <footer class="page-footer">
    <span class="built-at">built <time id="built-at-time" datetime="{{BUILT_AT}}">{{BUILT_AT}}</time></span>
  </footer>
  <script>
    (function () {
      var el = document.getElementById('built-at-time');
      if (!el) return;
      var d = new Date(el.getAttribute('datetime'));
      if (isNaN(d.getTime())) return;
      var diff = Math.floor((Date.now() - d) / 60000);
      if (diff < 1) el.textContent = 'just now';
      else if (diff < 60) el.textContent = diff + 'm ago';
      else el.textContent = Math.floor(diff / 60) + 'h ago';
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/template.html
git commit -m "feat: add page template with search, widget grid, and staleness indicator slots"
```

---

## Task 7: Config Files

**Files:**
- Create: `feeds.config.json`
- Create: `.env.example`

- [ ] **Step 1: Create feeds.config.json**

Create `feeds.config.json`:

```json
{
  "feeds": [
    {
      "id": "hn",
      "type": "rss-feed",
      "title": "Hacker News",
      "url": "https://hnrss.org/frontpage",
      "limit": 15,
      "category": "tech"
    },
    {
      "id": "lobsters",
      "type": "rss-feed",
      "title": "Lobsters",
      "url": "https://lobste.rs/rss",
      "limit": 15,
      "category": "tech"
    }
  ]
}
```

Replace the example feeds with your actual feeds. Fields:
- `id`: unique slug, used as `id="feed-<id>"` on the widget element
- `type`: `"rss-feed"` (only type currently supported)
- `title`: displayed in widget header
- `url`: RSS/Atom feed URL
- `limit`: max items shown
- `category`: displayed as a muted tag in widget header (optional)

- [ ] **Step 2: Create .env.example**

Create `.env.example`:

```
# Copy to .env and fill in values.
# Feed list lives in feeds.config.json — not here.

SEARCH_ENGINE_DEFAULT=google   # google | kagi | ddg
BUILD_OUTPUT_DIR=./dist
```

- [ ] **Step 3: Commit**

```bash
git add feeds.config.json .env.example
git commit -m "feat: add feed config and env example"
```

---

## Task 8: Fetch Feeds Script

**Files:**
- Create: `build/fetch-feeds.js`

- [ ] **Step 1: Create fetch-feeds.js**

Create `build/fetch-feeds.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const Parser = require('rss-parser');
const { normalizeItem } = require('./normalize-item.js');

const CONFIG_PATH = path.join(__dirname, '..', 'feeds.config.json');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const OUT_PATH = path.join(DIST_DIR, 'feed-data.json');
const FETCH_TIMEOUT_MS = 10000;

async function fetchFeed(feedConfig) {
  const parser = new Parser({ timeout: FETCH_TIMEOUT_MS });
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = feed.items
      .slice(0, feedConfig.limit)
      .map((item) => normalizeItem(item, feedConfig.id));
    return { id: feedConfig.id, items };
  } catch (err) {
    process.stderr.write(`[fetch-feeds] WARN: failed to fetch "${feedConfig.id}" (${feedConfig.url}): ${err.message}\n`);
    return { id: feedConfig.id, error: err.message, items: [] };
  }
}

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const rssFeedConfigs = config.feeds.filter(
    (f) => !f.type || f.type === 'rss-feed'
  );

  const results = await Promise.all(rssFeedConfigs.map(fetchFeed));
  const feedDataMap = Object.fromEntries(results.map((r) => [r.id, r]));

  fs.writeFileSync(OUT_PATH, JSON.stringify(feedDataMap, null, 2), 'utf8');
  const count = results.filter((r) => !r.error).length;
  process.stdout.write(`[fetch-feeds] Fetched ${count}/${results.length} feeds → ${OUT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`[fetch-feeds] FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add build/fetch-feeds.js
git commit -m "feat: add fetch-feeds build script with fail-soft per feed"
```

---

## Task 9: Build Script

**Files:**
- Create: `build/build.js`

- [ ] **Step 1: Create build.js**

Create `build/build.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const { render: renderFeedWidget } = require('../src/widgets/feed-widget.js');
const { render: renderSearchWidget } = require('../src/widgets/search-widget.js');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'feeds.config.json');
const FEED_DATA_PATH = path.join(ROOT, 'dist', 'feed-data.json');
const TEMPLATE_PATH = path.join(ROOT, 'src', 'template.html');
const STYLES_SRC = path.join(ROOT, 'src', 'styles.css');
const DIST_DIR = path.join(ROOT, 'dist');

function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const feedDataMap = JSON.parse(fs.readFileSync(FEED_DATA_PATH, 'utf8'));
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const builtAt = new Date().toISOString().slice(0, 16);

  const searchConfig = {
    defaultEngine: process.env.SEARCH_ENGINE_DEFAULT || 'google',
  };

  const searchHtml = renderSearchWidget(searchConfig);

  const widgetGrid = config.feeds
    .filter((feed) => !feed.type || feed.type === 'rss-feed')
    .map((feed) => {
      const data = feedDataMap[feed.id] || { error: 'missing feed data', items: [] };
      return renderFeedWidget(data, feed);
    })
    .join('\n');

  template = template
    .replaceAll('{{BUILT_AT}}', builtAt)
    .replace('{{SEARCH_WIDGET}}', searchHtml)
    .replace('{{WIDGET_GRID}}', widgetGrid);

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), template, 'utf8');
  fs.copyFileSync(STYLES_SRC, path.join(DIST_DIR, 'styles.css'));
  fs.writeFileSync(path.join(DIST_DIR, 'CNAME'), 'start.rjhoff.dev\n', 'utf8');

  process.stdout.write(`[build] dist/index.html written (built-at: ${builtAt})\n`);
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add build/build.js
git commit -m "feat: add build script — renders template to dist/index.html with CNAME"
```

---

## Task 10: GH Actions Workflow

**Files:**
- Create: `.github/workflows/build.yml`

- [ ] **Step 1: Create build.yml**

Create `.github/workflows/build.yml`:

```yaml
name: Build start page

on:
  schedule:
    - cron: '0 * * * *'   # hourly
  workflow_dispatch: {}    # manual on-demand trigger
  push:
    branches: [main]       # rebuild immediately on config changes

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - run: node build/fetch-feeds.js

      - run: node build/build.js

      - name: Deploy to gh-pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: add hourly GH Actions build and deploy to gh-pages"
```

---

## Task 11: Smoke Test

**Goal:** Run the full pipeline locally and verify `dist/index.html` is valid and complete.

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: all 24 tests passing, no failures.

- [ ] **Step 2: Run full build pipeline**

```bash
npm run build
```

Expected output (approximate):
```
[fetch-feeds] Fetched 2/2 feeds → /path/to/dist/feed-data.json
[build] dist/index.html written (built-at: 2026-07-04T...)
```

If a feed is behind a paywall or 404s at your location, you'll see a WARN line but the build completes and that widget shows "feed unavailable".

- [ ] **Step 3: Inspect dist/index.html**

```bash
grep -c "feed-item-title" dist/index.html
```

Expected: a number greater than 0 (each feed item produces one link with this class).

```bash
grep "data-built-at" dist/index.html
```

Expected: `<body data-built-at="2026-07-04T...">` with a current timestamp.

```bash
cat dist/CNAME
```

Expected: `start.rjhoff.dev`

- [ ] **Step 4: Open in browser**

```bash
open dist/index.html
```

Verify:
- Search bar autofocuses immediately
- Clicking `[Kagi]` updates the active button highlight and the form action (inspect in DevTools → Network tab, do a search)
- Feed boxes render with amber titles and muted dates
- Footer shows a relative time like "just now" or "0m ago"

- [ ] **Step 5: Commit (if any fixes were needed during smoke test)**

```bash
git add -p
git commit -m "fix: smoke test corrections"
```

---

## Post-Deploy Checklist

These steps happen outside this plan (one-time setup, not automated):

1. **GH Pages setup:** Repo Settings → Pages → Source: `gh-pages` branch, root. Enter custom domain `start.rjhoff.dev`, enable "Enforce HTTPS".
2. **DNS:** Add `CNAME start <github-username>.github.io` to your DNS registrar. Wait for propagation (~minutes to hours).
3. **Personal feeds:** Replace the example feeds in `feeds.config.json` with your real feed URLs. Push to `main` — the `push: [main]` trigger rebuilds immediately.
4. **Browser new-tab:** Set `https://start.rjhoff.dev` (or `file:///path/to/dist/index.html` for fully local) as your browser's new-tab page.

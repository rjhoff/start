const fs = require('node:fs');
const path = require('node:path');
const { render: renderFeedWidget } = require('../src/widgets/feed-widget.js');
const { render: renderSearchWidget } = require('../src/widgets/search-widget.js');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'feeds.config.json');
const FEED_DATA_PATH = path.join(ROOT, 'dist', 'feed-data.json');
const TEMPLATE_PATH = path.join(ROOT, 'src', 'template.html');
const STYLES_SRC = path.join(ROOT, 'src', 'styles.css');
const DASHBOARD_SRC = path.join(ROOT, 'src', 'dashboard.js');
const RELATIVE_TIME_SRC = path.join(ROOT, 'src', 'relative-time.js');
const DIST_DIR = path.join(ROOT, 'dist');

function build({ configPath = CONFIG_PATH, feedDataPath = FEED_DATA_PATH, outDir = DIST_DIR,
  builtAt = new Date().toISOString().slice(0, 16) + 'Z',
  searchEngineDefault = process.env.SEARCH_ENGINE_DEFAULT || 'google' } = {}) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const feedDataMap = JSON.parse(fs.readFileSync(feedDataPath, 'utf8'));
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const searchConfig = {
    defaultEngine: searchEngineDefault,
  };

  const searchHtml = renderSearchWidget(searchConfig);

  const widgetGrid = config.feeds
    .filter((feed) => !feed.type || feed.type === 'rss-feed')
    .map((feed) => {
      const data = feedDataMap[feed.id] || { error: 'missing feed data', items: [] };
      return renderFeedWidget(data, feed);
    })
    .join('\n') || '<p class="feed-unavailable rss-empty">No RSS feeds configured.</p>';

  template = template
    .replaceAll('{{BUILT_AT}}', builtAt)
    .replace('{{SEARCH_WIDGET}}', searchHtml)
    .replace('{{WIDGET_GRID}}', widgetGrid);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), template, 'utf8');
  fs.copyFileSync(STYLES_SRC, path.join(outDir, 'styles.css'));
  fs.copyFileSync(DASHBOARD_SRC, path.join(outDir, 'dashboard.js'));
  fs.copyFileSync(RELATIVE_TIME_SRC, path.join(outDir, 'relative-time.js'));
  fs.writeFileSync(path.join(outDir, 'CNAME'), 'start.rjhoff.dev\n', 'utf8');

  process.stdout.write(`[build] ${path.join(outDir, 'index.html')} written (built-at: ${builtAt})\n`);
}

if (require.main === module) build();

module.exports = { build };

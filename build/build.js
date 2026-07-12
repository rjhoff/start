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

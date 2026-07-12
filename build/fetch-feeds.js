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

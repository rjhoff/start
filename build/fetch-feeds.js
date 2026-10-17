const fs = require('node:fs');
const path = require('node:path');
const Parser = require('rss-parser');
const { normalizeItem } = require('./normalize-item.js');

const CONFIG_PATH = path.join(__dirname, '..', 'feeds.config.json');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const OUT_PATH = path.join(DIST_DIR, 'feed-data.json');
const FETCH_TIMEOUT_MS = 10000;

async function fetchFeed(feedConfig, timeoutMs = FETCH_TIMEOUT_MS) {
  const parser = new Parser();
  try {
    const response = await fetch(feedConfig.url, {
      headers: { 'User-Agent': 'rss-parser', Accept: 'application/rss+xml' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Status code ${response.status}`);
    const charset = response.headers?.get('content-type')?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
    let xml;
    if (charset && !/^utf-?8$/i.test(charset)) {
      const bytes = await response.arrayBuffer();
      let decoder;
      try { decoder = new TextDecoder(charset); }
      catch { decoder = new TextDecoder(); }
      xml = decoder.decode(bytes);
    } else {
      xml = await response.text();
    }
    const feed = await parser.parseString(xml);
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

  const results = await Promise.all(rssFeedConfigs.map((feed) => fetchFeed(feed)));
  const feedDataMap = Object.fromEntries(results.map((r) => [r.id, r]));

  fs.writeFileSync(OUT_PATH, JSON.stringify(feedDataMap, null, 2), 'utf8');
  const count = results.filter((r) => !r.error).length;
  process.stdout.write(`[fetch-feeds] Fetched ${count}/${results.length} feeds → ${OUT_PATH}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[fetch-feeds] FATAL: ${err.message}\n${err.stack}\n`);
    process.exitCode = 1;
  });
}

module.exports = { fetchFeed };

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../../build/build.js');

const root = path.join(__dirname, '..', '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'start-browser-test-'));
const fonts = path.join(root, 'node_modules', '@fontsource', 'ibm-plex-mono', 'files');
const fixtureConfig = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'feeds.config.json'), 'utf8'));
const fixtureData = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'feed-data.json'), 'utf8'));

build({
  configPath: path.join(root, 'tests', 'fixtures', 'feeds.config.json'),
  feedDataPath: path.join(root, 'tests', 'fixtures', 'feed-data.json'),
  outDir: output,
  builtAt: '2026-10-16T12:00Z',
  version: 'fixture-2026-10-16',
  searchEngineDefault: 'google',
});

for (const [variant, count] of [['many', 9], ['one', 1], ['none', 0], ['healthy', 5], ['empty', 5]]) {
  const feeds = Array.from({ length: count }, (_, index) => {
    const original = fixtureConfig.feeds[index % fixtureConfig.feeds.length];
    return index < fixtureConfig.feeds.length ? original : {
      ...original, id: `extra-${index + 1}`, title: `Additional Source ${index + 1}`,
    };
  });
  const data = { ...fixtureData };
  if (variant === 'healthy') data.longreads = { id: 'longreads', items: [{
    title: 'A long essay about a quiet city', link: 'https://example.com/longreads/1',
    pubDate: '2026-10-16T10:00:00.000Z', feedId: 'longreads',
  }] };
  if (variant === 'empty') {
    data.longreads = { id: 'longreads', items: [] };
    data.axios = { id: 'axios', error: 'fixture failure', items: [] };
  }
  for (const feed of feeds) {
    if (feed.id.startsWith('extra-')) {
      data[feed.id] = {
        items: Array.from({ length: 8 }, (_, index) => ({
          title: `Story ${index + 1} from ${feed.title}`,
          link: `https://example.com/${feed.id}/${index + 1}`,
          pubDate: index % 2 ? null : '2026-10-16T11:00:00.000Z',
        })),
      };
    }
  }
  const directory = path.join(output, variant);
  fs.mkdirSync(directory);
  const configPath = path.join(directory, 'feeds.config.json');
  const dataPath = path.join(directory, 'feed-data.json');
  fs.writeFileSync(configPath, JSON.stringify({ feeds }));
  fs.writeFileSync(dataPath, JSON.stringify(data));
  build({ configPath, feedDataPath: dataPath, outDir: directory,
    builtAt: '2026-10-16T12:00Z', version: `fixture-${variant}-2026-10-16`, searchEngineDefault: 'google' });
}

for (const weight of [400, 700]) {
  fs.copyFileSync(
    path.join(fonts, `ibm-plex-mono-latin-${weight}-normal.woff2`),
    path.join(output, `test-mono-${weight}.woff2`)
  );
}

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/dashboard.js', ['dashboard.js', 'text/javascript; charset=utf-8']],
  ['/build-status.js', ['build-status.js', 'text/javascript; charset=utf-8']],
  ['/relative-time.js', ['relative-time.js', 'text/javascript; charset=utf-8']],
  ['/version.json', ['version.json', 'application/json; charset=utf-8']],
  ['/test-mono-400.woff2', ['test-mono-400.woff2', 'font/woff2']],
  ['/test-mono-700.woff2', ['test-mono-700.woff2', 'font/woff2']],
]);

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const match = pathname.match(/^\/(many|one|none|healthy|empty)(\/.*)?$/);
  const variant = match?.[1];
  const relativePath = match ? (match[2] || '/') : pathname;
  const file = files.get(relativePath);
  if (!file) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { 'content-type': file[1] });
  fs.createReadStream(path.join(output, variant || '', file[0])).pipe(response);
});

process.once('exit', () => fs.rmSync(output, { recursive: true, force: true }));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}

server.listen(4173, '127.0.0.1');

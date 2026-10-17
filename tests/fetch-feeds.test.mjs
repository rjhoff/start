import { afterEach, test, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fetchFeeds from '../build/fetch-feeds.js';

const { fetchFeed, main } = fetchFeeds;
const config = { id: 'fixture', url: 'https://example.com/feed.xml', limit: 1 };

afterEach(() => vi.unstubAllGlobals());

test('fetches and parses RSS before applying the configured item limit', async () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title>
    <item><title>First</title><link>https://example.com/first</link></item>
    <item><title>Second</title><link>https://example.com/second</link></item>
  </channel></rss>`;
  const request = vi.fn(async () => ({ ok: true, text: async () => xml }));
  vi.stubGlobal('fetch', request);

  const result = await fetchFeed(config);

  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ title: 'First', link: 'https://example.com/first', feedId: 'fixture' });
  expect(request.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

test('aborts a stalled request and returns a per-feed error', async () => {
  const request = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  vi.stubGlobal('fetch', request);
  const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  try {
    const result = await fetchFeed(config, 20);
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result).toMatchObject({ id: 'fixture', items: [] });
    expect(result.error).toBeTruthy();
  } finally {
    warning.mockRestore();
  }
});

test('honors a feed response charset when decoding XML', async () => {
  const xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title><item><title>Café notes</title><link>https://example.com/cafe</link></item></channel></rss>';
  const bytes = Buffer.from(xml, 'latin1');
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    headers: { get: () => 'application/rss+xml; charset=iso-8859-1' },
    arrayBuffer: async () => bytes,
  })));

  const result = await fetchFeed(config);

  expect(result.items[0].title).toBe('Café notes');
});

test.each([
  ['complete success', [{ id: 'one', items: [{ title: 'One' }] }, { id: 'two', items: [] }], false],
  ['partial success', [{ id: 'one', items: [] }, { id: 'two', error: 'timeout', items: [] }], false],
  ['complete failure', [{ id: 'one', error: 'timeout', items: [] }, { id: 'two', error: 'HTTP 429', items: [] }], true],
  ['empty configuration', [], false],
])('fetch command handles %s without live feeds', async (_case, results, shouldFail) => {
  const directory = mkdtempSync(join(tmpdir(), 'start-fetch-outcome-'));
  const output = join(directory, 'feed-data.json');
  const configPath = join(directory, 'feeds.config.json');
  const feeds = results.map(({ id }) => ({ id, title: id, url: `https://example.com/${id}` }));
  const fetchFeedImpl = vi.fn(async feed => results.find(result => result.id === feed.id));
  const log = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    writeFileSync(configPath, JSON.stringify({ feeds }));
    const run = main({ configPath, outPath: output, fetchFeedImpl });
    if (shouldFail) await expect(run).rejects.toThrow('All configured RSS feeds failed');
    else await expect(run).resolves.toBeUndefined();
    expect(fetchFeedImpl).toHaveBeenCalledTimes(feeds.length);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(Object.fromEntries(results.map(result => [result.id, result])));
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Fetched ${results.filter(result => !result.error).length}/${results.length} feeds`));
  } finally {
    log.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});

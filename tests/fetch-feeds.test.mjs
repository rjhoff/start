import { afterEach, test, expect, vi } from 'vitest';
import fetchFeeds from '../build/fetch-feeds.js';

const { fetchFeed } = fetchFeeds;
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

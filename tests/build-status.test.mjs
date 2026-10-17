import { describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createBuildMetadata, scheduledCron } = require('../build/build-metadata.js');
const { build } = require('../build/build.js');
const { buildAge, scheduleState, publishedCandidate, verifiedVersion } = require('../src/build-status.js');
const feeds = [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }];
const data = { one: { items: [] }, two: { error: 'failed', items: [] } };
const builtAt = '2026-10-16T12:10:00.123Z';

describe('build metadata', () => {
  test('uses the workflow schedule and summarizes successful and failed feeds', () => {
    expect(scheduledCron()).toBe('0 * * * *');
    const result = createBuildMetadata({ feeds, feedData: data, builtAt, version: 'test-1' });
    expect(result).toEqual({ version: 'test-1', builtAt, schedule: '0 * * * *',
      feedCount: 2, successCount: 1, feeds: [
        { id: 'one', name: 'One', ok: true }, { id: 'two', name: 'Two', ok: false },
      ] });
    expect(() => scheduledCron("- cron: '15 * * * *'")).toThrow();
  });

  test('full precision and identity survive CI and local builds', () => {
    const input = { feeds, feedData: data, builtAt };
    expect(createBuildMetadata({ ...input, runId: '123', runAttempt: '2' }).version).toBe(`${builtAt}-123-2`);
    const first = createBuildMetadata({ ...input, runId: '', runAttempt: '' });
    const second = createBuildMetadata({ ...input, runId: '', runAttempt: '' });
    expect(first.version).not.toBe(second.version);
    expect(first.builtAt).toBe(builtAt);
    expect(() => createBuildMetadata({ ...input, builtAt: 'invalid' })).toThrow();
  });

  test('HTML, manifest, and versioned asset URLs share one injected version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'start-metadata-test-'));
    try {
      const metadata = build({ configPath: join('tests', 'fixtures', 'feeds.config.json'),
        feedDataPath: join('tests', 'fixtures', 'feed-data.json'), outDir: directory,
        builtAt, version: 'fixture-build-1' });
      const html = readFileSync(join(directory, 'index.html'), 'utf8');
      const manifest = JSON.parse(readFileSync(join(directory, 'version.json'), 'utf8'));
      expect(manifest).toEqual({ version: metadata.version, builtAt: metadata.builtAt });
      expect(html).toContain('<meta name="dashboard-version" content="fixture-build-1">');
      expect(html).toContain('styles.css?v=fixture-build-1');
      expect(html).toContain('build-status.js?v=fixture-build-1');
      expect(html).toContain('RSS 4/5');
      expect(html).toContain('"successCount":4');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('embedded metadata cannot close its script or expand replacement tokens', () => {
    const directory = mkdtempSync(join(tmpdir(), 'start-metadata-escape-'));
    try {
      const configPath = join(directory, 'config.json');
      writeFileSync(configPath, JSON.stringify({ feeds: [{ id: 'one', title: '$&</script>' }] }));
      const dataPath = join(directory, 'data.json');
      writeFileSync(dataPath, JSON.stringify({ one: { items: [] } }));
      build({ configPath, feedDataPath: dataPath, outDir: directory, builtAt, version: 'safe-1' });
      const html = readFileSync(join(directory, 'index.html'), 'utf8');
      const json = html.match(/<script id="build-metadata" type="application\/json">([^<]+)<\/script>/)[1];
      expect(JSON.parse(json).feeds[0].name).toBe('$&</script>');
      expect(json).not.toContain('</script>');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

describe('loaded status and publication decisions', () => {
  test('build age handles minute, hour, day, future, and invalid dates', () => {
    const time = Date.parse(builtAt);
    expect(buildAge(builtAt, time - 30_000)).toBe('just now');
    expect(buildAge(builtAt, time + 60_000)).toBe('1m ago');
    expect(buildAge(builtAt, time + 3_600_000)).toBe('1h ago');
    expect(buildAge(builtAt, time + 86_400_000)).toBe('1d ago');
    expect(buildAge('invalid', time)).toBe('unknown');
  });

  test('schedule uses UTC boundaries and remains neutral after an unpublished boundary', () => {
    const before = scheduleState(Date.parse('2026-10-16T12:59:59Z'), builtAt, '0 * * * *');
    expect(before).toMatchObject({ next: '2026-10-16T13:00:00.000Z', awaiting: false, countdown: '00:00:01' });
    const overdue = scheduleState(Date.parse('2026-10-16T13:00:00Z'), builtAt, '0 * * * *');
    expect(overdue).toMatchObject({ next: '2026-10-16T14:00:00.000Z', awaiting: true, countdown: '01:00:00' });
    expect(scheduleState(Date.parse('2026-10-16T14:40:00Z'), builtAt, '0 * * * *').awaiting).toBe(true);
    expect(scheduleState(Date.parse('2026-10-16T12:00:00Z'), builtAt, '0 * * * *').awaiting).toBe(false);
    expect(scheduleState(NaN, builtAt, '0 * * * *')).toBeNull();
  });

  test('a different manifest needs a newer timestamp and matching published HTML', () => {
    const loaded = { version: 'a', builtAt };
    const newer = { version: 'b', builtAt: '2026-10-16T13:00:00.000Z' };
    expect(publishedCandidate(newer, loaded)).toBe(true);
    expect(verifiedVersion(newer, 'b', newer.builtAt, loaded)).toBe(true);
    expect(verifiedVersion(newer, 'old-html', newer.builtAt, loaded)).toBe(false);
    expect(verifiedVersion(newer, 'b', builtAt, loaded)).toBe(false);
    expect(publishedCandidate({ ...newer, version: 'a' }, loaded)).toBe(false);
    expect(publishedCandidate({ ...newer, builtAt: 'bad' }, loaded)).toBe(false);
    expect(publishedCandidate({ ...newer, builtAt: '2026-10-16' }, loaded)).toBe(false);
    expect(publishedCandidate({ ...newer, builtAt: '2026-10-16T11:00:00Z' }, loaded)).toBe(false);
    expect(publishedCandidate(null, loaded)).toBe(false);
  });
});

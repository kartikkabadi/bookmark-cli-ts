import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { withIsolatedDataDir } from './helpers.js';
import { writeJson } from '../src/fs.js';
import { formatBookmarkStatus, formatBookmarkSummary, getBookmarkStatusView } from '../src/bookmarks-service.js';

test('formatBookmarkStatus produces human-readable summary', () => {
  const text = formatBookmarkStatus({
    connected: true,
    bookmarkCount: 99,
    lastUpdated: '2026-03-28T17:23:00Z',
    mode: 'Incremental by default (GraphQL + API available)',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /^Bookmarks/);
  assert.match(text, /bookmarks: 99/);
  assert.match(text, /last updated: 2026-03-28T17:23:00Z/);
  assert.match(text, /sync mode: Incremental by default \(GraphQL \+ API available\)/);
  assert.match(text, /cache: \/tmp\/x-bookmarks\.jsonl/);
  assert.doesNotMatch(text, /dataset/);
});

test('formatBookmarkStatus shows never when no lastUpdated', () => {
  const text = formatBookmarkStatus({
    connected: false,
    bookmarkCount: 0,
    lastUpdated: null,
    mode: 'Incremental by default (GraphQL)',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /last updated: never/);
});

test('formatBookmarkSummary produces concise operator-friendly output', () => {
  const text = formatBookmarkSummary({
    connected: true,
    bookmarkCount: 99,
    lastUpdated: '2026-03-28T17:23:00Z',
    mode: 'API sync',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /bookmarks=99/);
  assert.match(text, /updated=2026-03-28T17:23:00Z/);
  assert.match(text, /mode="API sync"/);
});

test('formatBookmarkSummary handles null lastUpdated', () => {
  const text = formatBookmarkSummary({
    connected: false,
    bookmarkCount: 0,
    lastUpdated: null,
    mode: 'Incremental by default (GraphQL)',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /bookmarks=0/);
  assert.match(text, /updated=never/);
});

test('getBookmarkStatusView uses the most recent sync timestamp', async () => {
  await withIsolatedDataDir(async (dir) => {
    await writeJson(path.join(dir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastIncrementalSyncAt: '2026-04-05T10:00:00Z',
      lastFullSyncAt: '2026-04-05T12:34:56Z',
      totalBookmarks: 3,
    });

    const view = await getBookmarkStatusView();

    assert.equal(view.bookmarkCount, 3);
    assert.equal(view.lastUpdated, '2026-04-05T12:34:56Z');
    assert.equal(view.connected, false);
  });
});

test('getBookmarkStatusView uses lastIncrementalSyncAt when lastFullSyncAt is absent', async () => {
  await withIsolatedDataDir(async (dir) => {
    await writeJson(path.join(dir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastIncrementalSyncAt: '2026-04-05T15:00:00Z',
      totalBookmarks: 7,
    });

    const view = await getBookmarkStatusView();

    assert.equal(view.bookmarkCount, 7);
    assert.equal(view.lastUpdated, '2026-04-05T15:00:00Z');
  });
});

test('getBookmarkStatusView returns never when no sync has occurred', async () => {
  await withIsolatedDataDir(async (dir) => {
    // Write metadata with no sync timestamps
    await writeJson(path.join(dir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalBookmarks: 0,
    });

    const view = await getBookmarkStatusView();

    assert.equal(view.bookmarkCount, 0);
    assert.equal(view.lastUpdated, null);
  });
});

test('getBookmarkStatusView sets connected=true when OAuth token exists', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;

    // Write bookmarks-meta.json first
    await writeJson(path.join(dir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastIncrementalSyncAt: '2026-04-05T10:00:00Z',
      totalBookmarks: 3,
    });

    // Create oauth-token.json to simulate connected state
    await writeJson(path.join(dir, 'oauth-token.json'), {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
    });

    const view = await getBookmarkStatusView();

    assert.equal(view.connected, true);
    assert.ok(view.mode.includes('API'), 'mode should indicate API is available');
  });
});

test('getBookmarkStatusView sets cachePath from status', async () => {
  await withIsolatedDataDir(async (dir) => {
    await writeJson(path.join(dir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastIncrementalSyncAt: '2026-04-05T10:00:00Z',
      totalBookmarks: 5,
    });

    const view = await getBookmarkStatusView();

    assert.ok(view.cachePath.length > 0, 'cachePath should be set');
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
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

test('getBookmarkStatusView uses the most recent sync timestamp', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ft-status-view-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    await writeJson(path.join(tmpDir, 'bookmarks-meta.json'), {
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
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { rm } from 'node:fs/promises';
import { withIsolatedDataDir } from './helpers.js';
import { writeJson } from '../src/fs.js';
import { bookmarkMediaManifestPath } from '../src/paths.js';
import { validateMediaUrl, sanitizeExtFromContentType } from '../src/bookmark-media.js';

// ── URL Validation Tests ─────────────────────────────────────────────────

test('validateMediaUrl rejects http:// URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('http://evil.com/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /scheme|https?:\/\/|unsupported/i);
  });
});

test('validateMediaUrl rejects ftp:// URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('ftp://evil.com/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /scheme|https?:\/\/|unsupported/i);
  });
});

test('validateMediaUrl rejects localhost', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://localhost/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /localhost|private|address/i);
  });
});

test('validateMediaUrl rejects 127.0.0.1', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://127.0.0.1/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /localhost|private|address|127/i);
  });
});

test('validateMediaUrl rejects 10.x private IPs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://10.0.0.1/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /private|address|10\./i);
  });
});

test('validateMediaUrl rejects 192.168.x private IPs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://192.168.1.1/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /private|address|192\.168/i);
  });
});

test('validateMediaUrl rejects 172.16-31.x private IPs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://172.20.100.5/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /private|address|172\.(1[6-9]|2\d|3[0-1])/i);
  });
});

test('validateMediaUrl rejects 169.254.169.254 (AWS metadata)', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://169.254.169.254/latest/meta-data/');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /private|address|169\.254/i);
  });
});

test('validateMediaUrl accepts https://pbs.twimg.com URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://pbs.twimg.com/media/abc123.jpg');
    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });
});

test('validateMediaUrl accepts https://video.twimg.com URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://video.twimg.com/ext_tw_video/123.mp4');
    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });
});

test('validateMediaUrl accepts arbitrary valid HTTPS URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://example.com/image.png');
    assert.equal(result.valid, true);
  });
});

// ── Content-Type to Extension Mapping Tests ───────────────────────────────

test('sanitizeExtFromContentType maps image/jpeg to .jpg', () => {
  assert.equal(sanitizeExtFromContentType('image/jpeg'), '.jpg');
});

test('sanitizeExtFromContentType maps image/jpeg with charset to .jpg', () => {
  assert.equal(sanitizeExtFromContentType('image/jpeg; charset=utf-8'), '.jpg');
});

test('sanitizeExtFromContentType maps image/png to .png', () => {
  assert.equal(sanitizeExtFromContentType('image/png'), '.png');
});

test('sanitizeExtFromContentType maps image/gif to .gif', () => {
  assert.equal(sanitizeExtFromContentType('image/gif'), '.gif');
});

test('sanitizeExtFromContentType maps image/webp to .webp', () => {
  assert.equal(sanitizeExtFromContentType('image/webp'), '.webp');
});

test('sanitizeExtFromContentType maps video/mp4 to .mp4', () => {
  assert.equal(sanitizeExtFromContentType('video/mp4'), '.mp4');
});

test('sanitizeExtFromContentType falls back to URL extension when content-type is unknown', () => {
  const ext = sanitizeExtFromContentType('application/octet-stream', 'https://example.com/media/video.mov');
  assert.equal(ext, '.mov');
});

test('sanitizeExtFromContentType falls back to .bin when content-type and URL have no extension', () => {
  const ext = sanitizeExtFromContentType('application/octet-stream', 'https://example.com/media/file');
  assert.equal(ext, '.bin');
});

test('sanitizeExtFromContentType returns .bin when content-type is undefined and URL has no path', () => {
  const ext = sanitizeExtFromContentType(undefined, undefined);
  assert.equal(ext, '.bin');
});

// ── Batch Processing Tests ───────────────────────────────────────────────────

test('fetchBookmarkMediaBatch respects --limit option', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    // Create 5 bookmarks with media
    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    const bookmarks = [
      { id: '1', tweetId: 't1', url: 'https://x.com/u/s/1', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/1.jpg'] },
      { id: '2', tweetId: 't2', url: 'https://x.com/u/s/2', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/2.jpg'] },
      { id: '3', tweetId: 't3', url: 'https://x.com/u/s/3', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/3.jpg'] },
      { id: '4', tweetId: 't4', url: 'https://x.com/u/s/4', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/4.jpg'] },
      { id: '5', tweetId: 't5', url: 'https://x.com/u/s/5', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/5.jpg'] },
    ];
    await fs.promises.writeFile(bookmarksPath, bookmarks.map(b => JSON.stringify(b)).join('\n'));

    const manifest = await fetchBookmarkMediaBatch({ limit: 2 });

    // limit option should be reflected in manifest
    assert.equal(manifest.limit, 2, 'manifest limit should be 2');
  });
});

test('fetchBookmarkMediaBatch respects --max-bytes option', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath,
      JSON.stringify({ id: '1', tweetId: 't1', url: 'https://x.com/u/s/1', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/1.jpg'] }) + '\n'
    );

    const manifest = await fetchBookmarkMediaBatch({ maxBytes: 1024 });

    assert.equal(manifest.maxBytes, 1024, 'manifest maxBytes should be 1024');
  });
});

test('fetchBookmarkMediaBatch creates manifest with correct schema', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath,
      JSON.stringify({ id: '1', tweetId: 't1', url: 'https://x.com/u/s/1', text: 't', syncedAt: new Date().toISOString(), media: [] }) + '\n'
    );

    const manifest = await fetchBookmarkMediaBatch({ limit: 1 });

    assert.equal(manifest.schemaVersion, 1, 'schemaVersion should be 1');
    assert.ok(manifest.generatedAt, 'generatedAt should be set');
    assert.ok(Array.isArray(manifest.entries), 'entries should be an array');
  });
});

test('fetchBookmarkMediaBatch skips bookmarks without media', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath,
      JSON.stringify({ id: '1', tweetId: 't1', url: 'https://x.com/u/s/1', text: 't', syncedAt: new Date().toISOString() }) + '\n'
    );

    const manifest = await fetchBookmarkMediaBatch({ limit: 10 });

    assert.equal(manifest.processed, 0, 'no bookmarks with media should be processed');
    assert.equal(manifest.downloaded, 0, 'downloaded should be 0');
  });
});

test('fetchBookmarkMediaBatch handles empty bookmarks.jsonl', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath, '');

    const manifest = await fetchBookmarkMediaBatch({ limit: 10 });

    assert.equal(manifest.processed, 0);
    assert.equal(manifest.downloaded, 0);
    assert.equal(manifest.entries.length, 0, 'entries should be empty');
  });
});

test('fetchBookmarkMediaBatch handles missing bookmarks.jsonl', async () => {
  await withIsolatedDataDir(async () => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const manifest = await fetchBookmarkMediaBatch({ limit: 10 });

    assert.equal(manifest.processed, 0);
    assert.equal(manifest.downloaded, 0);
  });
});

// ── Manifest Dedup Tests ─────────────────────────────────────────────────────

test('fetchBookmarkMediaBatch skips URLs already in prior manifest', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    // Create a prior manifest with an entry
    const priorManifest = {
      schemaVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      limit: 100,
      maxBytes: 50 * 1024 * 1024,
      processed: 1,
      downloaded: 1,
      skippedTooLarge: 0,
      failed: 0,
      entries: [{
        bookmarkId: '1',
        tweetId: 't1',
        tweetUrl: 'https://x.com/u/s/1',
        sourceUrl: 'https://example.com/already-downloaded.jpg',
        localPath: '/tmp/media/t1-abc123.jpg',
        contentType: 'image/jpeg',
        bytes: 12345,
        status: 'downloaded' as const,
        fetchedAt: new Date().toISOString(),
      }],
    };
    await writeJson(bookmarkMediaManifestPath(), priorManifest);

    // Create bookmark with the same URL
    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath,
      JSON.stringify({ id: '1', tweetId: 't1', url: 'https://x.com/u/s/1', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/already-downloaded.jpg'] }) + '\n'
    );

    const manifest = await fetchBookmarkMediaBatch({ limit: 10 });

    // The URL should NOT be processed again
    assert.equal(manifest.processed, 0, 'should not reprocess already-downloaded URL');
  });
});

test('fetchBookmarkMediaBatch preserves prior manifest entries', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    // Create a prior manifest
    const priorManifest = {
      schemaVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      limit: 100,
      maxBytes: 50 * 1024 * 1024,
      processed: 1,
      downloaded: 1,
      skippedTooLarge: 0,
      failed: 0,
      entries: [{
        bookmarkId: '1',
        tweetId: 't1',
        tweetUrl: 'https://x.com/u/s/1',
        sourceUrl: 'https://example.com/old.jpg',
        status: 'downloaded' as const,
        fetchedAt: new Date().toISOString(),
      }],
    };
    await writeJson(bookmarkMediaManifestPath(), priorManifest);

    // Create empty bookmarks
    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath, '');

    const manifest = await fetchBookmarkMediaBatch({ limit: 10 });

    // Prior entries should be preserved
    const priorEntry = manifest.entries.find(e => e.sourceUrl === 'https://example.com/old.jpg');
    assert.ok(priorEntry, 'prior entry should be in manifest');
    assert.equal(priorEntry?.status, 'downloaded');
  });
});

// ── HTTP Error Handling Tests ────────────────────────────────────────────────

test('fetchBookmarkMediaBatch records HTTP 404 as failed entry', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath,
      JSON.stringify({ id: '1', tweetId: 't1', url: 'https://x.com/u/s/1', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/image.jpg'] }) + '\n'
    );

    // Mock fetch to return 404
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 404,
        headers: new Map([['content-type', 'text/plain']]),
      } as unknown as Response;
    };

    const manifest = await fetchBookmarkMediaBatch({ limit: 10 });

    globalThis.fetch = originalFetch;

    assert.equal(manifest.failed, 1, 'should have 1 failed entry');
    const failedEntry = manifest.entries.find(e => e.sourceUrl === 'https://example.com/image.jpg');
    assert.ok(failedEntry, 'should have entry for the URL');
    assert.equal(failedEntry?.status, 'failed');
    assert.ok(failedEntry?.reason?.includes('404'), 'reason should include HTTP 404');
  });
});

test('fetchBookmarkMediaBatch records HTTP 500 as failed entry', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath,
      JSON.stringify({ id: '2', tweetId: 't2', url: 'https://x.com/u/s/2', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/image.jpg'] }) + '\n'
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 500,
        headers: new Map([['content-type', 'text/plain']]),
      } as unknown as Response;
    };

    const manifest = await fetchBookmarkMediaBatch({ limit: 10 });

    globalThis.fetch = originalFetch;

    assert.equal(manifest.failed, 1, 'should have 1 failed entry');
    const failedEntry = manifest.entries.find(e => e.sourceUrl === 'https://example.com/image.jpg');
    assert.ok(failedEntry?.reason?.includes('500'), 'reason should include HTTP 500');
  });
});

test('fetchBookmarkMediaBatch records content-length exceeding maxBytes as skipped_too_large', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath,
      JSON.stringify({ id: '3', tweetId: 't3', url: 'https://x.com/u/s/3', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/image.jpg'] }) + '\n'
    );

    const originalFetch = globalThis.fetch;
    // First call (HEAD) returns large content-length
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-length', '10485760'], ['content-type', 'image/jpeg']]),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-length', '10485760'], ['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(10485760),
      } as unknown as Response;
    };

    const manifest = await fetchBookmarkMediaBatch({ limit: 10, maxBytes: 1024 * 1024 });

    globalThis.fetch = originalFetch;

    assert.equal(manifest.skippedTooLarge, 1, 'should have 1 skipped_too_large entry');
    const skippedEntry = manifest.entries.find(e => e.sourceUrl === 'https://example.com/image.jpg');
    assert.equal(skippedEntry?.status, 'skipped_too_large');
    assert.ok(skippedEntry?.reason?.includes('content-length'), 'reason should mention content-length');
  });
});

test('fetchBookmarkMediaBatch records network error as failed entry', async () => {
  await withIsolatedDataDir(async (tmpDir) => {
    const { fetchBookmarkMediaBatch } = await import('../src/bookmark-media.js');

    const bookmarksPath = path.join(tmpDir, 'bookmarks.jsonl');
    await fs.promises.writeFile(bookmarksPath,
      JSON.stringify({ id: '4', tweetId: 't4', url: 'https://x.com/u/s/4', text: 't', syncedAt: new Date().toISOString(), media: ['https://example.com/image.jpg'] }) + '\n'
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };

    const manifest = await fetchBookmarkMediaBatch({ limit: 10 });

    globalThis.fetch = originalFetch;

    assert.equal(manifest.failed, 1, 'should have 1 failed entry');
    const failedEntry = manifest.entries.find(e => e.sourceUrl === 'https://example.com/image.jpg');
    assert.equal(failedEntry?.status, 'failed');
    assert.ok(failedEntry?.reason?.includes('ECONNREFUSED'), 'reason should include error message');
  });
});

// ── Bug Fix Tests ─────────────────────────────────────────────────────────────

test('validateMediaUrl rejects IPv6 loopback [::1] with brackets', async () => {
  const result = validateMediaUrl('https://[::1]/image.jpg');
  assert.equal(result.valid, false, 'IPv6 loopback with brackets should be rejected');
  assert.ok(result.reason?.includes('loopback'), 'reason should mention loopback');
});

test('sanitizeExtFromContentType handles uppercase content-type IMAGE/JPEG', () => {
  const ext = sanitizeExtFromContentType('IMAGE/JPEG', 'https://example.com/image.jpg');
  assert.equal(ext, '.jpg', 'should map IMAGE/JPEG to .jpg');
});

test('sanitizeExtFromContentType handles mixed case content-type Image/JpEg', () => {
  const ext = sanitizeExtFromContentType('Image/JpEg', 'https://example.com/image.jpg');
  assert.equal(ext, '.jpg', 'should map mixed-case content-type to .jpg');
});

test('sanitizeExtFromContentType handles lowercase content-type image/jpeg', () => {
  const ext = sanitizeExtFromContentType('image/jpeg', 'https://example.com/image.jpg');
  assert.equal(ext, '.jpg', 'should map lowercase content-type to .jpg');
});

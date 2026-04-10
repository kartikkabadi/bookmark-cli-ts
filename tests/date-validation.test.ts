import test from 'node:test';
import assert from 'node:assert/strict';
import { withIsolatedDataDir } from './helpers.js';
import { buildIndex, searchBookmarks, listBookmarks, validateDate } from '../src/bookmarks-db.js';
import { writeFile } from 'node:fs/promises';
import path from 'path';

const FIXTURES = [
  { id: '1', tweetId: '1', url: 'https://x.com/alice/status/1', text: 'Machine learning is transforming healthcare', authorHandle: 'alice', authorName: 'Alice Smith', syncedAt: '2026-01-01T00:00:00Z', postedAt: '2026-01-01T12:00:00Z', language: 'en', engagement: { likeCount: 100, repostCount: 10 }, mediaObjects: [], links: ['https://example.com'], tags: [], ingestedVia: 'graphql' },
  { id: '2', tweetId: '2', url: 'https://x.com/bob/status/2', text: 'Rust is a great systems programming language', authorHandle: 'bob', authorName: 'Bob Jones', syncedAt: '2026-02-01T00:00:00Z', postedAt: '2026-02-01T12:00:00Z', language: 'en', engagement: { likeCount: 50 }, mediaObjects: [], links: [], tags: [], ingestedVia: 'graphql' },
  { id: '3', tweetId: '3', url: 'https://x.com/alice/status/3', text: 'Deep learning models need massive compute', authorHandle: 'alice', authorName: 'Alice Smith', syncedAt: '2026-03-01T00:00:00Z', postedAt: '2026-03-01T12:00:00Z', language: 'en', engagement: { likeCount: 200, repostCount: 30 }, mediaObjects: [{ type: 'photo', url: 'https://img.com/1.jpg' }], links: [], tags: [], ingestedVia: 'graphql' },
];

// ── validateDate unit tests ─────────────────────────────────────────────

test('validateDate: accepts valid YYYY-MM-DD dates', () => {
  assert.equal(validateDate('2024-01-01'), '2024-01-01');
  assert.equal(validateDate('2024-12-31'), '2024-12-31');
  assert.equal(validateDate('2026-06-15'), '2026-06-15');
  assert.equal(validateDate('2000-01-01'), '2000-01-01');
});

test('validateDate: rejects freeform strings', () => {
  assert.throws(() => validateDate('not-a-date'), /Invalid date format/);
  assert.throws(() => validateDate('yesterday'), /Invalid date format/);
  assert.throws(() => validateDate('2024/01/01'), /Invalid date format/);
  assert.throws(() => validateDate('01-01-2024'), /Invalid date format/);
  assert.throws(() => validateDate('Jan 1, 2024'), /Invalid date format/);
});

test('validateDate: rejects invalid month (13, 00, etc)', () => {
  assert.throws(() => validateDate('2024-13-01'), /Invalid date format/);
  assert.throws(() => validateDate('2024-00-01'), /Invalid date format/);
  assert.throws(() => validateDate('2024-99-01'), /Invalid date format/);
});

test('validateDate: rejects invalid day (32, 00, etc)', () => {
  assert.throws(() => validateDate('2024-01-32'), /Invalid date format/);
  assert.throws(() => validateDate('2024-01-00'), /Invalid date format/);
  assert.throws(() => validateDate('2024-01-99'), /Invalid date format/);
});

test('validateDate: rejects invalid day for specific month', () => {
  // April has 30 days
  assert.throws(() => validateDate('2024-04-31'), /Invalid date format/);
  // February non-leap year has 28 days
  assert.throws(() => validateDate('2023-02-29'), /Invalid date format/);
  // February leap year has 29 days
  assert.equal(validateDate('2024-02-29'), '2024-02-29');
});

test('validateDate: rejects malformed format (missing parts)', () => {
  assert.throws(() => validateDate('2024-1-01'), /Invalid date format/);
  assert.throws(() => validateDate('2024-01-1'), /Invalid date format/);
  assert.throws(() => validateDate('24-01-01'), /Invalid date format/);
  assert.throws(() => validateDate('2024--01'), /Invalid date format/);
  assert.throws(() => validateDate('-01-01'), /Invalid date format/);
});

test('validateDate: rejects empty string', () => {
  assert.throws(() => validateDate(''), /Invalid date format/);
  assert.throws(() => validateDate('   '), /Invalid date format/);
});

test('validateDate: error message mentions YYYY-MM-DD', () => {
  try {
    validateDate('not-a-date');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok((err as Error).message.includes('YYYY-MM-DD'), 'error should suggest YYYY-MM-DD format');
  }
});

// ── search + list date filter integration tests ────────────────────────

test('searchBookmarks: after filter with valid date returns results', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    // Valid date - should work (may return 0 results if no match, but no error)
    const results = await searchBookmarks({ query: 'learning', after: '2026-01-15', limit: 10 });
    assert.ok(Array.isArray(results));
  });
});

test('searchBookmarks: before filter with valid date returns results', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    const results = await searchBookmarks({ query: 'learning', before: '2026-02-15', limit: 10 });
    assert.ok(Array.isArray(results));
  });
});

test('listBookmarks: date filters with valid dates work', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    const items = await listBookmarks({ after: '2026-01-01', before: '2026-02-01' });
    assert.ok(Array.isArray(items));
  });
});

test('listBookmarks: after filter with valid date returns results', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    const items = await listBookmarks({ after: '2026-02-01' });
    // Note: date filtering uses COALESCE(posted_at, bookmarked_at) string comparison
    // so '2026-02-01T12:00:00Z' >= '2026-02-01' due to lexicographic comparison
    assert.ok(Array.isArray(items));
    assert.ok(items.length >= 1);
  });
});

test('listBookmarks: before filter with valid date returns matching results', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    const items = await listBookmarks({ before: '2026-01-31' });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, '1');
  });
});

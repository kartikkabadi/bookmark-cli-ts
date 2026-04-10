import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withIsolatedDataDir } from './helpers.js';
import { buildIndex, searchBookmarks, getStats, formatSearchResults, getBookmarkById, sanitizeFtsQuery } from '../src/bookmarks-db.js';
import { openDb, saveDb } from '../src/db.js';
import { twitterBookmarksIndexPath } from '../src/paths.js';

const FIXTURES = [
  { id: '1', tweetId: '1', url: 'https://x.com/alice/status/1', text: 'Machine learning is transforming healthcare', authorHandle: 'alice', authorName: 'Alice Smith', syncedAt: '2026-01-01T00:00:00Z', postedAt: '2026-01-01T12:00:00Z', language: 'en', engagement: { likeCount: 100, repostCount: 10 }, mediaObjects: [], links: ['https://example.com'], tags: [], ingestedVia: 'graphql' },
  { id: '2', tweetId: '2', url: 'https://x.com/bob/status/2', text: 'Rust is a great systems programming language', authorHandle: 'bob', authorName: 'Bob Jones', syncedAt: '2026-02-01T00:00:00Z', postedAt: '2026-02-01T12:00:00Z', language: 'en', engagement: { likeCount: 50 }, mediaObjects: [], links: [], tags: [], ingestedVia: 'graphql' },
  { id: '3', tweetId: '3', url: 'https://x.com/alice/status/3', text: 'Deep learning models need massive compute', authorHandle: 'alice', authorName: 'Alice Smith', syncedAt: '2026-03-01T00:00:00Z', postedAt: '2026-03-01T12:00:00Z', language: 'en', engagement: { likeCount: 200, repostCount: 30 }, mediaObjects: [{ type: 'photo', url: 'https://img.com/1.jpg' }], links: [], tags: [], ingestedVia: 'graphql' },
];

test('buildIndex creates a searchable database', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

    const result = await buildIndex();
    assert.equal(result.recordCount, 3);
    assert.equal(result.newRecords, 3);
  });
});

test('buildIndex refreshes existing rows without dropping classifications', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

    await buildIndex();

    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      db.run(
        `UPDATE bookmarks
         SET categories = ?, primary_category = ?, domains = ?, primary_domain = ?, github_urls = ?
         WHERE id = ?`,
        ['ai,ml', 'research', 'example.com', 'example.com', '["https://github.com/openai/test"]', '1']
      );
      saveDb(db, dbPath);
    } finally {
      db.close();
    }

    const updatedFixtures = FIXTURES.map((fixture) =>
      fixture.id === '1'
        ? {
            ...fixture,
            text: 'Machine learning note updated',
            bookmarkedAt: '2026-04-02T00:00:00Z',
          }
        : fixture
    );
    const updatedJsonl = updatedFixtures.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), updatedJsonl);

    const result = await buildIndex();
    assert.equal(result.recordCount, 3);
    assert.equal(result.newRecords, 0);

    const bookmark = await getBookmarkById('1');
    assert.ok(bookmark);
    assert.equal(bookmark.text, 'Machine learning note updated');
    assert.equal(bookmark.bookmarkedAt, '2026-04-02T00:00:00Z');
    assert.deepEqual(bookmark.categories, ['ai', 'ml']);
    assert.equal(bookmark.primaryCategory, 'research');
    assert.deepEqual(bookmark.domains, ['example.com']);
    assert.equal(bookmark.primaryDomain, 'example.com');
    assert.deepEqual(bookmark.githubUrls, ['https://github.com/openai/test']);
  });
});

test('searchBookmarks: full-text search returns matching results', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

    await buildIndex();
    const results = await searchBookmarks({ query: 'learning', limit: 10 });
    assert.equal(results.length, 2);
    assert.ok(results.some((r) => r.id === '1'));
    assert.ok(results.some((r) => r.id === '3'));
  });
});

test('searchBookmarks: author filter works', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

    await buildIndex();
    const results = await searchBookmarks({ query: '', author: 'alice', limit: 10 });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.authorHandle === 'alice'));
  });
});

test('searchBookmarks: combined query + author filter', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

    await buildIndex();
    const results = await searchBookmarks({ query: 'learning', author: 'alice', limit: 10 });
    assert.equal(results.length, 2);
  });
});

test('searchBookmarks: no results for unmatched query', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

    await buildIndex();
    const results = await searchBookmarks({ query: 'cryptocurrency', limit: 10 });
    assert.equal(results.length, 0);
  });
});

test('getStats returns correct aggregate data', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

    await buildIndex();
    const stats = await getStats();
    assert.equal(stats.totalBookmarks, 3);
    assert.equal(stats.uniqueAuthors, 2);
    assert.equal(stats.topAuthors[0].handle, 'alice');
    assert.equal(stats.topAuthors[0].count, 2);
    assert.equal(stats.languageBreakdown[0].language, 'en');
    assert.equal(stats.languageBreakdown[0].count, 3);
  });
});

test('formatSearchResults: formats results with author, date, text, url', () => {
  const results = [
    { id: '1', url: 'https://x.com/test/status/1', text: 'Hello world', authorHandle: 'test', authorName: 'Test', postedAt: '2026-01-15T00:00:00Z', score: -1.5 },
  ];
  const formatted = formatSearchResults(results);
  assert.ok(formatted.includes('@test'));
  assert.ok(formatted.includes('2026-01-15'));
  assert.ok(formatted.includes('Hello world'));
  assert.ok(formatted.includes('https://x.com/test/status/1'));
});

test('formatSearchResults: returns message for empty results', () => {
  assert.equal(formatSearchResults([]), 'No results found.');
});

// ── FTS Query Sanitization ──────────────────────────────────────────────

test('sanitizeFtsQuery: rejects empty string', () => {
  assert.throws(() => sanitizeFtsQuery(''), /Invalid search query: empty query/);
});

test('sanitizeFtsQuery: rejects whitespace-only string', () => {
  assert.throws(() => sanitizeFtsQuery('   '), /Invalid search query: empty query/);
  assert.throws(() => sanitizeFtsQuery('\t\n'), /Invalid search query: empty query/);
});

test('sanitizeFtsQuery: rejects NULL bytes', () => {
  assert.throws(() => sanitizeFtsQuery('hello\0world'), /Invalid search query: contains NULL bytes/);
  assert.throws(() => sanitizeFtsQuery('\0'), /Invalid search query: contains NULL bytes/);
});

test('sanitizeFtsQuery: rejects query with only FTS5 operators', () => {
  assert.throws(() => sanitizeFtsQuery('OR AND NOT'), /Invalid search query/);
  assert.throws(() => sanitizeFtsQuery('AND'), /Invalid search query/);
  assert.throws(() => sanitizeFtsQuery('OR'), /Invalid search query/);
  assert.throws(() => sanitizeFtsQuery('NOT'), /Invalid search query/);
  assert.throws(() => sanitizeFtsQuery('AND OR'), /Invalid search query/);
});

test('sanitizeFtsQuery: rejects query with only special characters', () => {
  assert.throws(() => sanitizeFtsQuery('@#$%'), /Invalid search query/);
  assert.throws(() => sanitizeFtsQuery('***'), /Invalid search query/);
  assert.throws(() => sanitizeFtsQuery('!!!'), /Invalid search query/);
  assert.throws(() => sanitizeFtsQuery('( )'), /Invalid search query/);
});

test('sanitizeFtsQuery: accepts valid simple word queries', () => {
  assert.equal(sanitizeFtsQuery('hello'), 'hello');
  assert.equal(sanitizeFtsQuery('machine learning'), 'machine learning');
  assert.equal(sanitizeFtsQuery('hello-world'), 'hello-world');
  assert.equal(sanitizeFtsQuery('machine123'), 'machine123');
});

test('sanitizeFtsQuery: accepts quoted phrase queries', () => {
  assert.equal(sanitizeFtsQuery('"exact phrase"'), '"exact phrase"');
  assert.equal(sanitizeFtsQuery('"machine learning"'), '"machine learning"');
  assert.equal(sanitizeFtsQuery('hello "exact phrase" world'), 'hello "exact phrase" world');
});

test('sanitizeFtsQuery: accepts prefix search queries', () => {
  assert.equal(sanitizeFtsQuery('term*'), 'term*');
  assert.equal(sanitizeFtsQuery('machine*'), 'machine*');
  assert.equal(sanitizeFtsQuery('hello* world'), 'hello* world');
  assert.equal(sanitizeFtsQuery('"prefix*'), '"prefix*');
});

test('sanitizeFtsQuery: accepts combined valid FTS5 queries', () => {
  assert.equal(sanitizeFtsQuery('hello AND world'), 'hello AND world');
  assert.equal(sanitizeFtsQuery('machine OR deep'), 'machine OR deep');
  assert.equal(sanitizeFtsQuery('hello NOT world'), 'hello NOT world');
  assert.equal(sanitizeFtsQuery('"phrase" AND term*'), '"phrase" AND term*');
});

test('sanitizeFtsQuery: accepts queries with column filters', () => {
  assert.equal(sanitizeFtsQuery('author:alice'), 'author:alice');
  assert.equal(sanitizeFtsQuery('hello author:alice'), 'hello author:alice');
});

test('searchBookmarks: sanitizes query with only operators', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    // Should throw with clear error, not crash with SQLite error
    await assert.rejects(
      () => searchBookmarks({ query: 'OR AND NOT', limit: 10 }),
      /Invalid search query/
    );
  });
});

test('searchBookmarks: sanitizes query with special chars only', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    // Should throw with clear error, not crash
    await assert.rejects(
      () => searchBookmarks({ query: '@#$%', limit: 10 }),
      /Invalid search query/
    );
  });
});

test('searchBookmarks: preserves valid quoted phrase search', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    // Valid quoted phrase with no matches — should return empty, not crash
    const results = await searchBookmarks({ query: '"completely nonexistent phrase"', limit: 10 });
    assert.equal(results.length, 0);
  });
});

test('searchBookmarks: preserves valid prefix search', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    // "mach*" matches "Machine" in fixture 1 (case-insensitive FTS5)
    const results = await searchBookmarks({ query: 'mach*', limit: 10 });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, '1');
  });
});

test('searchBookmarks: preserves valid OR queries', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();

    // "rust OR elixir" - should find bob's rust tweet
    const results = await searchBookmarks({ query: 'rust OR elixir', limit: 10 });
    assert.equal(results.length, 1);
    assert.equal(results[0].authorHandle, 'bob');
  });
});

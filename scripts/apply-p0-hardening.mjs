#!/usr/bin/env node
import {existsSync, readFileSync, writeFileSync} from 'node:fs';

function read(path) {
  if (!existsSync(path)) throw new Error(`Missing ${path}; run from repo root.`);
  return readFileSync(path, 'utf8');
}

function write(path, value) {
  writeFileSync(path, value);
}

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Could not find ${label}; source may have drifted.`);
  return source.replace(needle, replacement);
}

function patchBookmarksDb() {
  const path = 'src/bookmarks-db.ts';
  let source = read(path);

  source = source.replaceAll("GLOB '____-__-__*'", "GLOB '????-??-??*'");

  const columns = [
    'id', 'tweet_id', 'url', 'text', 'author_handle', 'author_name', 'author_profile_image_url',
    'posted_at', 'bookmarked_at', 'synced_at', 'conversation_id', 'in_reply_to_status_id',
    'quoted_status_id', 'language', 'like_count', 'repost_count', 'reply_count', 'quote_count',
    'bookmark_count', 'view_count', 'media_count', 'link_count', 'links_json', 'tags_json',
    'ingested_via', 'categories', 'primary_category', 'github_urls', 'domains', 'primary_domain',
    'quoted_tweet_json'
  ];

  const positionalInsert = /db\.run\(`INSERT OR REPLACE INTO bookmarks VALUES \((\?,){30}\?\)`, \[([\s\S]*?)\]\);/m;
  const match = source.match(positionalInsert);
  if (!match) throw new Error('Could not find positional bookmark INSERT.');

  const replacement = [
    'db.run(`INSERT OR REPLACE INTO bookmarks (',
    columns.map((column) => `    ${column}`).join(',\n'),
    '  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [',
    match[2].trim(),
    '  ]);'
  ].join('\n');

  source = source.replace(positionalInsert, replacement);
  if (source.includes('INSERT OR REPLACE INTO bookmarks VALUES')) {
    throw new Error('Positional bookmark INSERT still remains after patch.');
  }

  write(path, source);
}

function patchGraphqlBookmarks() {
  const path = 'src/graphql-bookmarks.ts';
  let source = read(path);

  const snowflakeHelper = `function snowflakeToIso(snowflake: string): string | null {
  try {
    const id = BigInt(snowflake);
    const ms = Number(id >> 22n) + Number(TWITTER_SNOWFLAKE_EPOCH);
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}`;

  const timestampHelpers = `${snowflakeHelper}

function timestampLikeToIso(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isSafeInteger(n)) {
        if (trimmed.length <= 10) return new Date(n * 1000).toISOString();
        if (trimmed.length >= 12 && trimmed.length <= 14) return new Date(n).toISOString();
        if (trimmed.length >= 15 && trimmed.length <= 17) return new Date(Math.floor(n / 1000)).toISOString();
      }
      return snowflakeToIso(trimmed);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 10_000_000_000) return new Date(value * 1000).toISOString();
    if (value < 10_000_000_000_000) return new Date(value).toISOString();
    if (value < 10_000_000_000_000_000) return new Date(Math.floor(value / 1000)).toISOString();
  }
  return null;
}

function collectBookmarkTimestampCandidates(value: unknown, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 8 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectBookmarkTimestampCandidates(item, out, depth + 1);
    return out;
  }
  if (typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(sortIndex|sort_index|bookmarked_at|bookmarkedAt|bookmark_created_at|bookmarkCreatedAt|saved_at|savedAt)$/i.test(key)) out.push(child);
    if (typeof child === 'object' && child != null) collectBookmarkTimestampCandidates(child, out, depth + 1);
  }
  return out;
}

function extractBookmarkedAtFromEntry(entry: unknown, record: BookmarkRecord): string | null {
  for (const candidate of collectBookmarkTimestampCandidates(entry)) {
    const iso = timestampLikeToIso(candidate);
    if (!iso) continue;
    const sanitized = sanitizeBookmarkedAt({...record, bookmarkedAt: iso});
    if (sanitized.bookmarkedAt) return sanitized.bookmarkedAt;
  }
  return null;
}`;

  source = replaceOnce(source, snowflakeHelper, timestampHelpers, 'snowflakeToIso helper');

  const oldAssignment = `    if (record) {
      // Extract bookmarkedAt from the entry's sortIndex (snowflake timestamp)
      if (entry.sortIndex) {
        record.bookmarkedAt = snowflakeToIso(entry.sortIndex) ?? record.bookmarkedAt;
      }
      records.push(sanitizeBookmarkedAt(record));
    }`;
  const newAssignment = `    if (record) {
      record.bookmarkedAt = extractBookmarkedAtFromEntry(entry, record) ?? record.bookmarkedAt;
      records.push(sanitizeBookmarkedAt(record));
    }`;
  source = replaceOnce(source, oldAssignment, newAssignment, 'bookmarkedAt assignment');

  write(path, source);
}

function patchTests() {
  const dbTest = 'tests/bookmarks-db.test.ts';
  let dbSource = read(dbTest);
  dbSource = dbSource.replace(
    "sanitizeFtsQuery } from '../src/bookmarks-db.js';",
    "sanitizeFtsQuery, listBookmarks } from '../src/bookmarks-db.js';"
  );
  if (!dbSource.includes('buildIndex tolerates additive bookmark table columns')) {
    dbSource += `

test('buildIndex tolerates additive bookmark table columns', async () => {
  await withIsolatedDataDir(async (dir) => {
    const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\\n') + '\\n';
    await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
    await buildIndex();
    const db = await openDb(twitterBookmarksIndexPath());
    try {
      db.run('ALTER TABLE bookmarks ADD COLUMN future_column TEXT');
      saveDb(db, twitterBookmarksIndexPath());
    } finally {
      db.close();
    }
    const result = await buildIndex();
    assert.equal(result.recordCount, 3);
  });
});

test('listBookmarks sorts ISO bookmarkedAt dates descending', async () => {
  await withIsolatedDataDir(async (dir) => {
    const records = [
      {...FIXTURES[0], id: 'old', tweetId: '100', bookmarkedAt: '2026-01-01T00:00:00.000Z'},
      {...FIXTURES[1], id: 'new', tweetId: '101', bookmarkedAt: '2026-02-01T00:00:00.000Z'},
    ];
    await writeFile(path.join(dir, 'bookmarks.jsonl'), records.map((r) => JSON.stringify(r)).join('\\n') + '\\n');
    await buildIndex({force: true});
    const listed = await listBookmarks({sort: 'desc', limit: 2});
    assert.deepEqual(listed.map((item) => item.id), ['new', 'old']);
  });
});
`;
  }
  write(dbTest, dbSource);

  const gqlTest = 'tests/graphql-bookmarks.test.ts';
  let gqlSource = read(gqlTest);
  if (!gqlSource.includes('extracts bookmarkedAt from nested bookmark metadata')) {
    const needle = "test('parseBookmarksResponse: handles missing sortIndex gracefully', () => {";
    const insertion = `test('parseBookmarksResponse: extracts bookmarkedAt from nested bookmark metadata', () => {
  const tr = makeTweetResult();
  const resp = {data: {bookmark_timeline_v2: {timeline: {instructions: [{type: 'TimelineAddEntries', entries: [{entryId: 'tweet-0', content: {itemContent: {tweet_results: {result: tr}}, bookmark_info: {bookmarked_at: '2026-03-12T00:00:00.000Z'}}}]}]}}}};
  const {records} = parseBookmarksResponse(resp, NOW);
  assert.equal(records.length, 1);
  assert.equal(records[0].bookmarkedAt, '2026-03-12T00:00:00.000Z');
});

`;
    gqlSource = replaceOnce(gqlSource, needle, insertion + needle, 'GraphQL missing-sortIndex test');
  }
  write(gqlTest, gqlSource);
}

patchBookmarksDb();
patchGraphqlBookmarks();
patchTests();

console.log('Applied P0 hardening patch. Run: pnpm run typecheck && pnpm test && pnpm run lint && pnpm run smoke');

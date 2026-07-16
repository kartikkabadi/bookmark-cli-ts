import assert from 'node:assert/strict';
import test from 'node:test';
import {bookmarkToMemoriaEnvelope, bookmarksToMemoriaNdjson} from '../src/memoria-envelope.js';
import type {BookmarkRecord} from '../src/types.js';

function bookmark(overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id: '2030000000000000000',
    tweetId: '2030000000000000000',
    authorHandle: 'example',
    authorName: 'Example',
    url: 'https://x.com/example/status/2030000000000000000',
    text: 'Append-only journals make coding agents recoverable.',
    postedAt: '2026-07-15T12:00:00.000Z',
    bookmarkedAt: '2026-07-16T08:00:00.000Z',
    syncedAt: '2026-07-16T08:05:00.000Z',
    tags: ['agents'],
    links: ['https://example.com/journal'],
    ingestedVia: 'graphql',
    ...overrides
  };
}

test('GraphQL bookmark timestamps are not promoted as reliable bookmark time', () => {
  const envelope = bookmarkToMemoriaEnvelope(bookmark());
  assert.equal(envelope.schema, 'memoria.ingest.v1');
  assert.equal(envelope.source.provider, 'x');
  assert.equal(envelope.source.externalId, '2030000000000000000');
  assert.equal(envelope.item.sourceCreatedAt, '2026-07-15T12:00:00.000Z');
  assert.equal(envelope.item.metadata?.bookmarkedAt, null);
  assert.equal(envelope.item.metadata?.bookmarkTimestampReliability, 'unknown');
});

test('quoted posts and outbound links become searchable content and provenance', () => {
  const envelope = bookmarkToMemoriaEnvelope(
    bookmark({
      quotedTweet: {
        id: '2020000000000000000',
        text: 'Checkpoint every side effect.',
        authorHandle: 'quoted',
        url: 'https://x.com/quoted/status/2020000000000000000'
      }
    })
  );
  assert.match(envelope.item.content, /Checkpoint every side effect/);
  assert.ok(envelope.item.links?.includes('https://x.com/quoted/status/2020000000000000000'));
  assert.equal(JSON.parse(bookmarksToMemoriaNdjson([bookmark()])).schema, 'memoria.ingest.v1');
});

test('media-only bookmarks preserve GraphQL altText and legacy extAltText', () => {
  const envelope = bookmarkToMemoriaEnvelope(
    bookmark({
      text: '',
      mediaObjects: [
        {
          type: 'photo',
          mediaUrl: 'https://pbs.twimg.com/media/example.jpg',
          altText: 'Architecture diagram for resumable agents'
        }
      ]
    })
  );
  assert.match(envelope.item.content, /Architecture diagram for resumable agents/);

  const legacy = bookmarkToMemoriaEnvelope(
    bookmark({
      text: '',
      mediaObjects: [{extAltText: 'Legacy media description'}]
    })
  );
  assert.match(legacy.item.content, /Legacy media description/);

  const fallback = bookmarkToMemoriaEnvelope(bookmark({text: '', mediaObjects: []}));
  assert.match(fallback.item.content, /Saved X post/);
});

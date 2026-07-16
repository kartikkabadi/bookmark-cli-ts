import type {BookmarkRecord} from './types.js';
import {MEMORIA_INGEST_SCHEMA, type JsonObject, type JsonValue, type MemoriaIngestEnvelopeV1} from './memoria-protocol.js';

function validIso(value?: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function jsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject;
}

function knowledgeContent(record: BookmarkRecord): string {
  const sections = [record.text.trim()];
  if (record.quotedTweet?.text?.trim()) {
    const attribution = record.quotedTweet.authorHandle ? `@${record.quotedTweet.authorHandle}` : 'quoted post';
    sections.push(`Quoted from ${attribution}:\n${record.quotedTweet.text.trim()}`);
  }
  return sections.filter(Boolean).join('\n\n');
}

export function bookmarkToMemoriaEnvelope(record: BookmarkRecord): MemoriaIngestEnvelopeV1 {
  const capturedAt = validIso(record.syncedAt) ?? new Date().toISOString();
  const sourceCreatedAt = validIso(record.postedAt);
  const reliableBookmarkedAt = record.ingestedVia === 'graphql' ? null : validIso(record.bookmarkedAt);
  const links = [...new Set([record.url, ...(record.links ?? []), record.quotedTweet?.url].filter((value): value is string => Boolean(value)))];

  return {
    schema: MEMORIA_INGEST_SCHEMA,
    operation: 'upsert',
    source: {
      connector: 'memoria-x',
      provider: 'x',
      externalId: record.tweetId || record.id,
      capturedAt,
      raw: record as unknown as JsonValue
    },
    item: {
      kind: 'post',
      content: knowledgeContent(record),
      url: record.url,
      author: {
        ...(record.author?.id ? {id: record.author.id} : {}),
        ...(record.authorHandle ? {handle: record.authorHandle} : {}),
        ...(record.authorName ? {name: record.authorName} : {})
      },
      sourceCreatedAt,
      observedAt: capturedAt,
      ...(record.language ? {language: record.language} : {}),
      tags: record.tags ?? [],
      links,
      metadata: jsonObject({
        conversationId: record.conversationId,
        inReplyToStatusId: record.inReplyToStatusId,
        inReplyToUserId: record.inReplyToUserId,
        quotedStatusId: record.quotedStatusId,
        engagement: record.engagement,
        media: record.mediaObjects ?? record.media,
        possiblySensitive: record.possiblySensitive,
        sourceApp: record.sourceApp,
        ingestedVia: record.ingestedVia,
        bookmarkedAt: reliableBookmarkedAt,
        bookmarkTimestampReliability: reliableBookmarkedAt ? 'source-provided' : 'unknown'
      }),
      trust: 0.45
    }
  };
}

export function bookmarksToMemoriaNdjson(records: BookmarkRecord[]): string {
  return records.map((record) => JSON.stringify(bookmarkToMemoriaEnvelope(record))).join('\n') + (records.length ? '\n' : '');
}

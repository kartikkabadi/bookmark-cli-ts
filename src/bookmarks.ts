import {ensureDir, pathExists, readJson, readJsonLines, writeJson, writeJsonLines} from './fs.js';
import {ensureDataDir, twitterBackfillStatePath, twitterBookmarksCachePath, twitterBookmarksMetaPath} from './paths.js';
import type {BookmarkBackfillState, BookmarkCacheMeta, BookmarkRecord} from './types.js';
import {loadXApiConfig} from './config.js';
import {loadTwitterOAuthToken, refreshOAuthToken, saveTwitterOAuthToken} from './xauth.js';

export interface BookmarkSyncResult {
  mode: 'full' | 'incremental';
  totalBookmarks: number;
  added: number;
  cachePath: string;
  metaPath: string;
}

type BookmarkApiTweet = {
  id: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  entities?: {
    urls?: Array<{expanded_url?: string; url?: string}>;
  };
};

type BookmarkApiResponse = {
  data?: BookmarkApiTweet[];
  includes?: {
    users?: Array<{id: string; username?: string; name?: string}>;
  };
  meta?: {
    next_token?: string;
    result_count?: number;
  };
};

function makeBookmark(record: Partial<BookmarkRecord> & Pick<BookmarkRecord, 'id' | 'tweetId' | 'url' | 'text'>): BookmarkRecord {
  return {
    id: record.id,
    tweetId: record.tweetId,
    url: record.url,
    text: record.text,
    authorHandle: record.authorHandle,
    authorName: record.authorName,
    postedAt: record.postedAt,
    bookmarkedAt: record.bookmarkedAt,
    syncedAt: record.syncedAt ?? new Date().toISOString(),
    media: record.media ?? [],
    links: record.links ?? [],
    tags: record.tags ?? [],
    ingestedVia: record.ingestedVia
  };
}

async function fetchJsonWithUserToken(url: string, accessToken: string): Promise<{ok: boolean; status: number; parsed: any; text: string}> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    parsed,
    text
  };
}

async function fetchCurrentUserId(accessToken: string): Promise<{ok: boolean; status: number; detail: string; data?: {id: string}}> {
  const result = await fetchJsonWithUserToken('https://api.x.com/2/users/me', accessToken);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      detail: result.parsed ? JSON.stringify(result.parsed) : result.text
    };
  }

  const id = result.parsed?.data?.id;
  if (!id) {
    return {
      ok: false,
      status: result.status,
      detail: 'Could not find user id in /2/users/me response'
    };
  }

  return {
    ok: true,
    status: result.status,
    detail: 'Resolved current user id',
    data: {id: String(id)}
  };
}

export function normalizeBookmarkPage(page: BookmarkApiResponse, syncedAt: string): BookmarkRecord[] {
  const userMap = new Map<string, {username?: string; name?: string}>();
  for (const user of page.includes?.users ?? []) {
    userMap.set(String(user.id), {username: user.username, name: user.name});
  }

  return (page.data ?? []).map((tweet) => {
    const user = tweet.author_id ? userMap.get(String(tweet.author_id)) : undefined;
    const tweetId = String(tweet.id);
    return makeBookmark({
      id: tweetId,
      tweetId,
      url: `https://x.com/${user?.username ?? 'i'}/status/${tweetId}`,
      text: tweet.text ?? '',
      authorHandle: user?.username,
      authorName: user?.name,
      postedAt: tweet.created_at ?? null,
      // The v2 bookmarks endpoint exposes tweet creation, not bookmark creation.
      bookmarkedAt: null,
      syncedAt,
      links: (tweet.entities?.urls ?? []).map((u) => u.expanded_url ?? u.url ?? '').filter(Boolean),
      ingestedVia: 'api'
    });
  });
}

async function withTokenRefresh<T>(label: string, fn: (accessToken: string) => Promise<{ok: boolean; status: number; detail: string; data?: T}>, loadToken: () => Promise<{access_token: string; refresh_token?: string} | null>): Promise<{ok: boolean; status: number; detail: string; data?: T}> {
  const token = await loadToken();
  if (!token?.access_token) {
    return {ok: false, status: 0, detail: 'Missing user-context OAuth token. Run: ft auth'};
  }

  const result = await fn(token.access_token);
  if (result.status !== 401 || !token.refresh_token) {
    return result;
  }

  // Token expired — attempt refresh and retry once
  try {
    const refreshed = await refreshOAuthToken(token.refresh_token);
    await saveTwitterOAuthToken(refreshed);
    const retryResult = await fn(refreshed.access_token);
    return retryResult;
  } catch (refreshErr: any) {
    // Refresh token also expired or other error — surface the original failure
    if (refreshErr.message?.includes('expired')) {
      throw new Error('OAuth session expired. Re-run: ft auth');
    }
    throw refreshErr;
  }
}

async function fetchBookmarksPage(accessToken: string, userId: string, nextToken?: string): Promise<{ok: boolean; status: number; detail: string; page?: BookmarkApiResponse; requestUrl: string}> {
  const url = new URL(`https://api.x.com/2/users/${userId}/bookmarks`);
  url.searchParams.set('max_results', '100');
  url.searchParams.set('tweet.fields', 'created_at,author_id,entities');
  url.searchParams.set('expansions', 'author_id');
  url.searchParams.set('user.fields', 'username,name');
  if (nextToken) url.searchParams.set('pagination_token', nextToken);

  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await fetchJsonWithUserToken(url.toString(), accessToken);

    if (result.status === 429) {
      const waitSec = Math.min(15 * Math.pow(2, attempt), 120);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        detail: result.parsed ? JSON.stringify(result.parsed) : result.text,
        requestUrl: url.toString()
      };
    }

    return {
      ok: true,
      status: result.status,
      detail: 'ok',
      page: result.parsed as BookmarkApiResponse,
      requestUrl: url.toString()
    };
  }

  return {
    ok: false,
    status: 429,
    detail: 'Rate limited after 4 retries. Try again later.',
    requestUrl: url.toString()
  };
}

export async function syncTwitterBookmarks(mode: 'full' | 'incremental', options: {targetAdds?: number} = {}): Promise<BookmarkSyncResult> {
  const loadToken = () => loadTwitterOAuthToken();
  const meResult = await withTokenRefresh('fetchCurrentUserId', fetchCurrentUserId, loadToken);
  if (!meResult.ok || !meResult.data?.id) {
    if (meResult.status === 0 && meResult.detail.includes('Missing user-context OAuth token')) {
      throw new Error('Missing user-context OAuth token. Run: ft auth');
    }
    throw new Error(`Could not resolve current user id: ${meResult.detail}`);
  }
  const meId = meResult.data.id;

  ensureDataDir();
  const cachePath = twitterBookmarksCachePath();
  const metaPath = twitterBookmarksMetaPath();
  const now = new Date().toISOString();
  const existing = await readJsonLines<BookmarkRecord>(cachePath);
  const existingById = new Map(existing.map((item) => [item.id, item]));

  // Track current access token for the pagination loop
  let currentToken = (await loadToken())!;
  const allFetched: BookmarkRecord[] = [];
  let nextToken: string | undefined;
  let pages = 0;
  const maxPages = mode === 'full' ? 200 : 2;

  while (pages < maxPages) {
    const pageResult = await fetchBookmarksPage(currentToken.access_token, meId, nextToken);

    // Handle 401 by refreshing token and retrying once
    if (pageResult.status === 401 && currentToken.refresh_token) {
      try {
        const refreshed = await refreshOAuthToken(currentToken.refresh_token);
        await saveTwitterOAuthToken(refreshed);
        currentToken = refreshed;
        const retryResult = await fetchBookmarksPage(currentToken.access_token, meId, nextToken);
        if (!retryResult.ok || !retryResult.page) {
          throw new Error(`Bookmark fetch failed (${retryResult.status}): ${retryResult.detail}`);
        }
        const normalized = normalizeBookmarkPage(retryResult.page, now);
        allFetched.push(...normalized);
        nextToken = retryResult.page.meta?.next_token;
        pages += 1;
        if (!nextToken) break;
        if (mode === 'incremental' && normalized.every((item) => existingById.has(item.id))) break;
        if (typeof options.targetAdds === 'number') {
          const uniqueAddsSoFar = allFetched.filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index).filter((item) => !existingById.has(item.id)).length;
          if (uniqueAddsSoFar >= options.targetAdds) break;
        }
        continue;
      } catch (refreshErr: any) {
        if (refreshErr.message?.includes('expired')) {
          throw new Error('OAuth session expired. Re-run: ft auth');
        }
        throw refreshErr;
      }
    }

    if (!pageResult.ok || !pageResult.page) {
      throw new Error(`Bookmark fetch failed (${pageResult.status}): ${pageResult.detail}`);
    }

    const normalized = normalizeBookmarkPage(pageResult.page, now);
    allFetched.push(...normalized);
    nextToken = pageResult.page.meta?.next_token;
    pages += 1;

    if (!nextToken) break;
    if (mode === 'incremental' && normalized.every((item) => existingById.has(item.id))) break;
    if (typeof options.targetAdds === 'number') {
      const uniqueAddsSoFar = allFetched.filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index).filter((item) => !existingById.has(item.id)).length;
      if (uniqueAddsSoFar >= options.targetAdds) break;
    }
  }

  const merged = [...existing];
  let added = 0;
  for (const record of allFetched) {
    if (!existingById.has(record.id)) {
      merged.push(record);
      existingById.set(record.id, record);
      added += 1;
      if (typeof options.targetAdds === 'number' && added >= options.targetAdds) break;
    }
  }

  merged.sort((a, b) => String(b.bookmarkedAt ?? b.syncedAt).localeCompare(String(a.bookmarkedAt ?? a.syncedAt)));
  await writeJsonLines(cachePath, merged);

  const previousMeta = (await pathExists(metaPath)) ? await readJson<BookmarkCacheMeta>(metaPath) : undefined;
  const meta: BookmarkCacheMeta = {
    provider: 'twitter',
    schemaVersion: 1,
    lastFullSyncAt: mode === 'full' ? now : previousMeta?.lastFullSyncAt,
    lastIncrementalSyncAt: mode === 'incremental' ? now : previousMeta?.lastIncrementalSyncAt,
    totalBookmarks: merged.length
  };
  await writeJson(metaPath, meta);

  return {
    mode,
    totalBookmarks: merged.length,
    added,
    cachePath,
    metaPath
  };
}

export function latestBookmarkSyncAt(meta?: Pick<BookmarkCacheMeta, 'lastIncrementalSyncAt' | 'lastFullSyncAt'> | null): string | null {
  let latestValue: string | null = null;
  let latestTs = Number.NEGATIVE_INFINITY;

  for (const candidate of [meta?.lastIncrementalSyncAt, meta?.lastFullSyncAt]) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isFinite(parsed) || parsed <= latestTs) continue;
    latestTs = parsed;
    latestValue = candidate;
  }

  return latestValue;
}

export async function getTwitterBookmarksStatus(): Promise<BookmarkCacheMeta & {cachePath: string; metaPath: string}> {
  const cachePath = twitterBookmarksCachePath();
  const metaPath = twitterBookmarksMetaPath();
  const statePath = twitterBackfillStatePath();
  const meta = (await pathExists(metaPath)) ? await readJson<BookmarkCacheMeta>(metaPath) : undefined;
  const state = (await pathExists(statePath)) ? await readJson<BookmarkBackfillState>(statePath) : undefined;
  const metaUpdatedAt = latestBookmarkSyncAt(meta);
  const graphQlStatusIsNewer = Boolean(state?.lastRunAt && (!metaUpdatedAt || Date.parse(state.lastRunAt) > Date.parse(metaUpdatedAt)));

  if (!meta || graphQlStatusIsNewer) {
    const totalBookmarks = (await readJsonLines<BookmarkRecord>(cachePath)).length;
    return {
      provider: 'twitter',
      schemaVersion: meta?.schemaVersion ?? 1,
      lastFullSyncAt: meta?.lastFullSyncAt,
      lastIncrementalSyncAt: state?.lastRunAt ?? meta?.lastIncrementalSyncAt,
      totalBookmarks,
      cachePath,
      metaPath
    };
  }

  return {
    ...meta,
    cachePath,
    metaPath
  };
}

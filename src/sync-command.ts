/**
 * Sync command — extracted from cli.ts for better separation of concerns.
 * All sync flags (--api, --rebuild, --continue, --gaps, --classify, etc.)
 * are handled identically to before; this is a pure refactoring.
 */
import {syncTwitterBookmarks} from './bookmarks.js';
import {syncBookmarksGraphQL, syncGaps} from './graphql-bookmarks.js';
import type {SyncProgress, GapFillProgress} from './graphql-bookmarks.js';
import {buildIndex} from './bookmarks-db.js';
import {classifyWithLlm, classifyDomainsWithLlm} from './bookmark-classify-llm.js';
import {resolveEngine} from './engine.js';
import {dataDir, twitterBackfillStatePath} from './paths.js';
import {promptText, PromptCancelledError} from './prompt.js';
import fs from 'node:fs';
import path from 'node:path';

// ── Public types ────────────────────────────────────────────────────────────

export interface SyncCommandOptions {
  api?: boolean;
  rebuild?: boolean;
  continue?: boolean;
  gaps?: boolean;
  yes?: boolean;
  classify?: boolean;
  maxPages?: number;
  targetAdds?: number;
  delayMs?: number;
  maxMinutes?: number;
  browser?: string;
  cookies?: string[];
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
}

export interface SyncCommandResult {
  firstRun: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isStaleBookmarkIndexSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /table bookmarks has \d+ columns but \d+ values were supplied/i.test(message);
}

export async function rebuildIndex(): Promise<number> {
  process.stderr.write('  Building search index...\n');
  try {
    const idx = await buildIndex();
    process.stderr.write(`  \u2713 ${idx.recordCount} bookmarks indexed (${idx.newRecords} new)\n`);
    return idx.newRecords;
  } catch (error) {
    if (!isStaleBookmarkIndexSchemaError(error)) {
      throw error;
    }

    process.stderr.write('  \u26a0 Existing search index schema is stale; rebuilding it from bookmark cache...\n');
    const idx = await buildIndex({force: true});
    process.stderr.write(`  \u2713 ${idx.recordCount} bookmarks indexed (${idx.newRecords} new)\n`);
    return idx.newRecords;
  }
}

export async function classifyNew(): Promise<void> {
  const engine = await resolveEngine();

  const start = Date.now();
  process.stderr.write('  Classifying new bookmarks (categories)...\n');
  const catResult = await classifyWithLlm({
    engine,
    onBatch: (done: number, total: number) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const elapsed = Math.round((Date.now() - start) / 1000);
      process.stderr.write(`  Categories: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
    }
  });
  if (catResult.classified > 0) {
    process.stderr.write(`  \u2713 ${catResult.classified} categorized\n`);
  }

  const domStart = Date.now();
  process.stderr.write('  Classifying new bookmarks (domains)...\n');
  const domResult = await classifyDomainsWithLlm({
    engine,
    all: false,
    onBatch: (done: number, total: number) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const elapsed = Math.round((Date.now() - domStart) / 1000);
      process.stderr.write(`  Domains: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
    }
  });
  if (domResult.classified > 0) {
    process.stderr.write(`  \u2713 ${domResult.classified} domains assigned\n`);
  }
}

function friendlyStopReason(raw?: string): string {
  const FRIENDLY_STOP_REASONS: Record<string, string> = {
    'caught up to newest stored bookmark': 'All caught up \u2014 no new bookmarks since last sync.',
    'no new bookmarks (stale)': 'Sync complete \u2014 reached the end of new bookmarks.',
    'end of bookmarks': 'Sync complete \u2014 all bookmarks fetched.',
    'max runtime reached': 'Paused after 30 minutes. Run again to continue.',
    'max pages reached': 'Paused after reaching page limit. Run again to continue.',
    'target additions reached': 'Reached target bookmark count.'
  };
  if (!raw) return 'Sync complete.';
  return FRIENDLY_STOP_REASONS[raw] ?? `Sync complete \u2014 ${raw}`;
}

function warnIfEmpty(totalBookmarks: number): void {
  if (totalBookmarks > 0) return;
  console.log(`  \u26a0 No bookmarks were found. This usually means:`);
  console.log(`    \u2022 The browser needs to be fully quit first (Cmd+Q / close all windows)`);
  console.log(`    \u2022 Keychain/keyring access was denied`);
  console.log(`    \u2022 You may be logged into a different profile than the one with X/Twitter`);
  console.log(`    \u2022 Try: ft sync --cookies <ct0> <auth_token>  (paste from DevTools)\n`);
}

// ── Main entry point ─────────────────────────────────────────────────────────

export interface SyncSpinnerCallbacks {
  createSpinner: (renderLine: () => string) => {update: () => void; stop: () => void};
  runWithSpinner: <T>(spinner: {stop: () => void}, fn: () => Promise<T>) => Promise<T>;
}

export async function runSyncCommand(
  options: SyncCommandOptions,
  callbacks: {
    firstRun: boolean;
    showSyncWelcome: () => void;
    ensureDataDir: () => void;
    createSpinner: (renderLine: () => string) => {update: () => void; stop: () => void};
    runWithSpinner: <T>(spinner: {stop: () => void}, fn: () => Promise<T>) => Promise<T>;
  }
): Promise<void> {
  const {firstRun, showSyncWelcome, ensureDataDir, createSpinner, runWithSpinner} = callbacks;

  if (firstRun) showSyncWelcome();
  ensureDataDir();

  try {
    const mutuallyExclusive = [options.rebuild, options.continue, options.gaps].filter(Boolean).length;
    if (mutuallyExclusive > 1) {
      console.error('  Error: --rebuild, --continue, and --gaps cannot be used together.');
      process.exitCode = 1;
      return;
    }

    // ── gaps mode: backfill missing data for existing bookmarks ──
    if (options.gaps) {
      const startTime = Date.now();
      process.stderr.write('  Filling gaps (quoted tweets, truncated text)...\n');
      let lastProgress: GapFillProgress = {done: 0, total: 0, quotedFetched: 0, textExpanded: 0, failed: 0};
      const spinner = createSpinner(() => {
        const p = lastProgress;
        const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        return `${p.done}/${p.total} (${pct}%) \u2502 ${p.quotedFetched} quoted \u2502 ${p.textExpanded} expanded \u2502 ${p.failed} failed \u2502 ${elapsed}s`;
      });
      const result = await runWithSpinner(spinner, () =>
        syncGaps({
          delayMs: Number(options.delayMs) || 300,
          onProgress: (progress: GapFillProgress) => {
            lastProgress = progress;
            spinner.update();
          }
        })
      );
      if (result.total === 0 && result.bookmarkedAtRepaired === 0) {
        console.log('  No gaps found \u2014 all bookmarks are fully enriched.');
      } else {
        if (result.quotedTweetsFilled > 0) console.log(`  \u2713 ${result.quotedTweetsFilled} quoted tweets filled`);
        if (result.textExpanded > 0) console.log(`  \u2713 ${result.textExpanded} truncated texts expanded`);
        if (result.bookmarkedAtRepaired > 0) {
          console.log(`  \u2713 ${result.bookmarkedAtRepaired} invalid bookmark dates cleared`);
          await rebuildIndex();
        }
        if (result.failed > 0) {
          // Write failure log
          const logPath = path.join(dataDir(), 'gaps-failures.json');
          const byReason: Record<string, number> = {};
          for (const f of result.failures) {
            byReason[f.reason] = (byReason[f.reason] ?? 0) + 1;
          }
          fs.writeFileSync(logPath, JSON.stringify({failures: result.failures, summary: byReason}, null, 2));

          console.log(`  ${result.failed} unavailable:`);
          for (const [reason, count] of Object.entries(byReason)) {
            console.log(`    \u2022 ${count} ${reason}`);
          }
          console.log(`  Details: ${logPath}`);
        }
        if (result.bookmarkedAtMissing > 0) {
          console.log(`  ${result.bookmarkedAtMissing} bookmarks missing a reliable bookmark date`);
        }
      }
      return;
    }

    // ── rebuild confirmation ──
    if (options.rebuild) {
      const dir = dataDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupDir = `${dir}-backup-${timestamp}`;

      console.log(`  \u26a0 Rebuild will re-crawl all bookmarks from X.`);
      console.log(`  Your existing data will be merged (not deleted), but`);
      console.log(`  this is a full re-sync and may take a while.\n`);
      console.log(`  To back up first, run:`);
      console.log(`    cp -r ${dir} ${backupDir}\n`);

      // Allow --yes to skip confirmation
      if (!options.yes) {
        const answer = await promptText('  Continue? (y/N) ', {output: process.stdout});
        if (answer.kind === 'interrupt') {
          throw new PromptCancelledError('Cancelled. Rebuild aborted.', 130);
        }
        if (answer.kind !== 'answer' || answer.value.toLowerCase() !== 'y') {
          console.log('  Aborted.');
          return;
        }
      }
    }

    const useApi = Boolean(options.api);
    const mode = Boolean(options.rebuild) ? 'full' : 'incremental';

    if (useApi) {
      const result = await syncTwitterBookmarks(mode, {
        targetAdds: typeof options.targetAdds === 'number' && !Number.isNaN(options.targetAdds) ? options.targetAdds : undefined
      });
      console.log(`\n  \u2713 ${result.added} new bookmarks synced (${result.totalBookmarks} total)`);
      console.log(`  \u2713 Data: ${dataDir()}\n`);
      warnIfEmpty(result.totalBookmarks);
      const newCount = await rebuildIndex();
      if (options.classify && newCount > 0) {
        await classifyNew();
      }
    } else {
      const startTime = Date.now();
      let lastSync: SyncProgress = {page: 0, totalFetched: 0, newAdded: 0, running: true, done: false};
      const spinner = createSpinner(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (lastSync.stopReason && lastSync.running) {
          return `${lastSync.stopReason}  \u2502  ${lastSync.newAdded} new  \u2502  ${elapsed}s`;
        }
        return `Syncing bookmarks...  ${lastSync.newAdded} new  \u2502  page ${lastSync.page}  \u2502  ${elapsed}s`;
      });
      // Parse --cookies <ct0> [auth_token] — variadic, gives us an array
      let csrfToken: string | undefined;
      let cookieHeader: string | undefined;
      if (options.cookies && Array.isArray(options.cookies) && options.cookies.length > 0) {
        csrfToken = String(options.cookies[0]);
        const authToken = options.cookies.length > 1 ? String(options.cookies[1]) : undefined;
        const parts = [`ct0=${csrfToken}`];
        if (authToken) parts.push(`auth_token=${authToken}`);
        cookieHeader = parts.join('; ');
      }

      // Load saved cursor for --continue mode
      let resumeCursor: string | undefined;
      if (options.continue) {
        try {
          const statePath = twitterBackfillStatePath();
          const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
          resumeCursor = state?.lastCursor;
        } catch {
          /* no state file yet */
        }
        if (resumeCursor) {
          console.log('  Resuming from saved position...\n');
        } else {
          console.log('  No saved cursor — scanning past existing bookmarks to find new ones...\n');
        }
      }

      // When continuing without a cursor, disable stale page limit so we can
      // page through all existing bookmarks to reach the ones beyond the old cap.
      // With a saved cursor we skip straight to where we left off, so the normal
      // stale limit is fine.
      const continueWithoutCursor = Boolean(options.continue) && !resumeCursor;

      const result = await runWithSpinner(spinner, () =>
        syncBookmarksGraphQL({
          incremental: !Boolean(options.rebuild) && !Boolean(options.continue),
          resumeCursor,
          stalePageLimit: continueWithoutCursor ? Infinity : undefined,
          maxPages: options.maxPages != null ? Number(options.maxPages) : undefined,
          targetAdds: typeof options.targetAdds === 'number' && !Number.isNaN(options.targetAdds) ? options.targetAdds : undefined,
          delayMs: Number(options.delayMs) || 600,
          maxMinutes: Number(options.maxMinutes) || 30,
          browser: options.browser ? String(options.browser) : undefined,
          csrfToken,
          cookieHeader,
          chromeUserDataDir: options.chromeUserDataDir ? String(options.chromeUserDataDir) : undefined,
          chromeProfileDirectory: options.chromeProfileDirectory ? String(options.chromeProfileDirectory) : undefined,
          firefoxProfileDir: options.firefoxProfileDir ? String(options.firefoxProfileDir) : undefined,
          onProgress: (status: SyncProgress) => {
            lastSync = status;
            spinner.update();
          }
        })
      );

      console.log(`\n  \u2713 ${result.added} new bookmarks synced (${result.totalBookmarks} total)`);
      console.log(`  ${friendlyStopReason(result.stopReason)}`);
      if (result.bookmarkedAtRepaired > 0) {
        console.log(`  \u2713 ${result.bookmarkedAtRepaired} invalid bookmark dates cleared`);
      }
      if (result.bookmarkedAtMissing > 0) {
        console.log(`  ${result.bookmarkedAtMissing} bookmarks missing a reliable bookmark date`);
      }
      console.log(`  \u2713 Data: ${dataDir()}\n`);

      warnIfEmpty(result.totalBookmarks);

      const newCount = await rebuildIndex();
      if (options.classify && newCount > 0) {
        await classifyNew();
      }
    }

    if (firstRun) {
      console.log(`\n  Next steps:`);
      console.log(`        ft classify              Classify by category and domain (LLM)`);
      console.log(`        ft classify --regex      Classify by category (simple)`);
      console.log(`\n  Explore:`);
      console.log(`        ft search "machine learning"`);
      console.log(`        ft viz`);
      console.log(`        ft categories`);
      console.log(`\n  You can also just tell Claude to use the ft CLI to search and`);
      console.log(`  explore your bookmarks. It already knows how.\n`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (firstRun && (msg.includes('cookie') || msg.includes('Cookie') || msg.includes('Keychain') || msg.includes('Safe Storage'))) {
      console.log(`
  Couldn't connect to your browser session.

  To sync your bookmarks:

    1. Open your browser and log into x.com
    2. Run: ft sync

  Options:
    ft sync --browser brave           Use a specific browser
    ft sync --browser firefox          Use Firefox
    ft sync --cookies <ct0> <auth>     Pass cookies directly
    ft sync --chrome-profile-directory "Profile 1"
`);
    } else {
      console.error(`\n  Error: ${msg}\n`);
    }
    process.exitCode = 1;
  }
}

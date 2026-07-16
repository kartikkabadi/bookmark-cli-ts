import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {syncTwitterBookmarks} from './bookmarks.js';
import {syncBookmarksGraphQL} from './graphql-bookmarks.js';
import {writeMemoriaExport} from './memoria-export.js';
import {ingestIntoMemoria} from './memoria-ingest.js';
import {dataDir, memoriaExportPath, twitterBookmarksCachePath} from './paths.js';
import {installDailySchedule, removeDailySchedule, showDailySchedule} from './schedule.js';
import {runTwitterOAuthFlow} from './xauth.js';

const DAILY_FRONTIER_FLOOR = 200;
const DAILY_FRONTIER_BUFFER = 100;

function integer(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function nodeMajor(): number {
  return Number(process.versions.node.split('.')[0]);
}

export function buildMemoriaXCli(): Command {
  const program = new Command();
  program.name('memoria-x').description('Sync X bookmarks into Hermes Memoria').version('0.1.0');

  program
    .command('auth')
    .description('Authorize official X API access with OAuth 2.0 PKCE')
    .action(async () => printJson(await runTwitterOAuthFlow()));

  program
    .command('sync')
    .description('Incrementally sync X bookmarks and emit the Memoria connector protocol')
    .option('--api', 'Use the official X API instead of a browser session')
    .option('--browser <name>', 'Browser to read the X session from')
    .option('--chrome-user-data-dir <path>', 'Chrome-family user data directory override')
    .option('--chrome-profile-directory <name>', 'Chrome-family profile directory name')
    .option('--firefox-profile-dir <path>', 'Firefox profile directory override')
    .option('--csrf-token <token>', 'Manual X csrf token fallback')
    .option('--cookie-header <header>', 'Manual X cookie header fallback')
    .option('--rebuild', 'Crawl through all available bookmark history')
    .option('--max-pages <number>', 'Maximum internal X timeline pages to fetch')
    .option('--target-adds <number>', 'Stop after adding this many new bookmarks')
    .option('--full-export', 'Export the complete archive instead of the daily frontier')
    .option('--stdout', 'Also emit memoria.ingest.v1 NDJSON to stdout')
    .option('--ingest', 'Pipe the export directly to the local memoria CLI')
    .option('--quiet', 'Suppress progress and summary output')
    .action(
      async (options: {
        api?: boolean;
        browser?: string;
        chromeUserDataDir?: string;
        chromeProfileDirectory?: string;
        firefoxProfileDir?: string;
        csrfToken?: string;
        cookieHeader?: string;
        rebuild?: boolean;
        maxPages?: string;
        targetAdds?: string;
        fullExport?: boolean;
        stdout?: boolean;
        ingest?: boolean;
        quiet?: boolean;
      }) => {
        const browserOverrides = Boolean(
          options.browser ||
            options.chromeUserDataDir ||
            options.chromeProfileDirectory ||
            options.firefoxProfileDir ||
            options.csrfToken ||
            options.cookieHeader,
        );
        if (options.api && browserOverrides) {
          throw new Error('Browser-session flags cannot be combined with --api.');
        }
        if (options.api && options.maxPages) {
          throw new Error('--max-pages applies only to browser-session synchronization.');
        }
        const targetAdds = options.targetAdds
          ? integer(options.targetAdds, 'target-adds')
          : undefined;

        const result = options.api
          ? await syncTwitterBookmarks(options.rebuild ? 'full' : 'incremental', {
              ...(targetAdds !== undefined ? {targetAdds} : {})
            })
          : await syncBookmarksGraphQL({
              incremental: !options.rebuild,
              ...(options.browser ? {browser: options.browser} : {}),
              ...(options.chromeUserDataDir ? {chromeUserDataDir: options.chromeUserDataDir} : {}),
              ...(options.chromeProfileDirectory
                ? {chromeProfileDirectory: options.chromeProfileDirectory}
                : {}),
              ...(options.firefoxProfileDir ? {firefoxProfileDir: options.firefoxProfileDir} : {}),
              ...(options.csrfToken ? {csrfToken: options.csrfToken} : {}),
              ...(options.cookieHeader ? {cookieHeader: options.cookieHeader} : {}),
              ...(options.maxPages
                ? {maxPages: integer(options.maxPages, 'max-pages')}
                : {}),
              ...(targetAdds !== undefined ? {targetAdds} : {}),
              ...(!options.quiet
                ? {
                    onProgress: (progress) => {
                      process.stderr.write(
                        `\rSyncing X bookmarks: ${progress.page} pages, ${progress.newAdded} new`
                      );
                      if (progress.done) process.stderr.write('\n');
                    }
                  }
                : {})
            });

        const exportLimit =
          options.rebuild || options.fullExport
            ? undefined
            : Math.max(DAILY_FRONTIER_FLOOR, result.added + DAILY_FRONTIER_BUFFER);
        const exported = await writeMemoriaExport({
          ...(exportLimit !== undefined ? {limit: exportLimit} : {})
        });
        if (options.ingest) await ingestIntoMemoria(exported.ndjson);
        if (options.stdout) process.stdout.write(exported.ndjson);
        if (!options.quiet) {
          process.stderr.write(
            `${JSON.stringify(
              {
                source: options.api ? 'official-api' : 'browser-session',
                sync: result,
                export: {
                  path: exported.filePath,
                  count: exported.count,
                  totalRecords: exported.totalRecords,
                  scope: exportLimit === undefined ? 'full' : 'frontier'
                },
                ingested: Boolean(options.ingest)
              },
              null,
              2
            )}\n`
          );
        }
      }
    );

  program
    .command('export')
    .description('Convert the existing local X archive to memoria.ingest.v1 NDJSON')
    .argument('[file]', 'Output file', memoriaExportPath())
    .option('--limit <number>', 'Export only the newest N records')
    .option('--stdout', 'Emit the NDJSON to stdout')
    .action(async (file: string, options: {limit?: string; stdout?: boolean}) => {
      const exported = await writeMemoriaExport({
        filePath: file,
        ...(options.limit ? {limit: integer(options.limit, 'limit')} : {})
      });
      if (options.stdout) process.stdout.write(exported.ndjson);
      else
        printJson({
          path: exported.filePath,
          count: exported.count,
          totalRecords: exported.totalRecords
        });
    });

  program
    .command('doctor')
    .description('Inspect connector storage and the local Memoria command')
    .action(() => {
      const memoriaCommand = process.env.MEMORIA_COMMAND ?? 'memoria';
      const memoria = spawnSync(memoriaCommand, ['--version'], {encoding: 'utf8'});
      const cacheExists = existsSync(twitterBookmarksCachePath());
      const supportedNode = Number.isInteger(nodeMajor()) && nodeMajor() >= 24;
      printJson({
        healthy: supportedNode,
        initialized: cacheExists,
        dataDir: dataDir(),
        cache: {path: twitterBookmarksCachePath(), exists: cacheExists},
        export: {path: memoriaExportPath(), exists: existsSync(memoriaExportPath())},
        memoria: {
          command: memoriaCommand,
          available: !memoria.error && memoria.status === 0,
          version: memoria.stdout?.trim() || null
        },
        node: {version: process.version, supported: supportedNode}
      });
    });

  program
    .command('path')
    .description('Print the connector data directory')
    .action(() => console.log(dataDir()));

  const schedule = program.command('schedule').description('Manage daily local synchronization');
  schedule
    .command('install')
    .description('Install a macOS LaunchAgent that syncs and ingests daily')
    .option('--time <HH:MM>', 'Local daily run time', '07:00')
    .option('--api', 'Use the official X API')
    .option('--browser <name>', 'Browser to read the X session from')
    .action((options: {time: string; api?: boolean; browser?: string}) => {
      printJson({
        installed: true,
        path: installDailySchedule({
          time: options.time,
          ...(options.api ? {api: true} : {}),
          ...(options.browser ? {browser: options.browser} : {})
        })
      });
    });
  schedule
    .command('show')
    .description('Show the installed schedule')
    .action(() => printJson(showDailySchedule()));
  schedule
    .command('remove')
    .description('Remove the installed schedule')
    .action(() => printJson({removed: true, path: removeDailySchedule()}));

  return program;
}

export async function runMemoriaXCli(argv = process.argv): Promise<void> {
  try {
    await buildMemoriaXCli().parseAsync(argv);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ft auth')) {
      throw new Error(error.message.replaceAll('ft auth', 'memoria-x auth'), {cause: error});
    }
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMemoriaXCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`memoria-x: ${message}\n`);
    process.exitCode = 1;
  });
}

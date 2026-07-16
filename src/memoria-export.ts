import {mkdir, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {readJsonLines} from './fs.js';
import {bookmarksToMemoriaNdjson} from './memoria-envelope.js';
import {memoriaExportPath, twitterBookmarksCachePath} from './paths.js';
import type {BookmarkRecord} from './types.js';

export interface MemoriaExportOptions {
  filePath?: string;
  /** Export only the newest N records. Omit for a complete archive export. */
  limit?: number;
}

export async function loadMemoriaExport(
  options: Pick<MemoriaExportOptions, 'limit'> = {}
): Promise<{records: BookmarkRecord[]; totalRecords: number; ndjson: string}> {
  const allRecords = await readJsonLines<BookmarkRecord>(twitterBookmarksCachePath());
  const limit =
    options.limit === undefined
      ? undefined
      : Math.max(0, Math.min(allRecords.length, Math.trunc(options.limit)));
  const records = limit === undefined ? allRecords : allRecords.slice(0, limit);
  return {records, totalRecords: allRecords.length, ndjson: bookmarksToMemoriaNdjson(records)};
}

export async function writeMemoriaExport(
  options: MemoriaExportOptions = {}
): Promise<{filePath: string; count: number; totalRecords: number; ndjson: string}> {
  const {records, totalRecords, ndjson} = await loadMemoriaExport({
    ...(options.limit !== undefined ? {limit: options.limit} : {})
  });
  const resolved = path.resolve(options.filePath ?? memoriaExportPath());
  await mkdir(path.dirname(resolved), {recursive: true, mode: 0o700});
  const temporary = `${resolved}.tmp`;
  await writeFile(temporary, ndjson, {encoding: 'utf8', mode: 0o600});
  await rename(temporary, resolved);
  return {filePath: resolved, count: records.length, totalRecords, ndjson};
}

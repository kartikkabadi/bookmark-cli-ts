import {mkdir, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {readJsonLines} from './fs.js';
import {bookmarksToMemoriaNdjson} from './memoria-envelope.js';
import {memoriaExportPath, twitterBookmarksCachePath} from './paths.js';
import type {BookmarkRecord} from './types.js';

export async function loadMemoriaExport(): Promise<{records: BookmarkRecord[]; ndjson: string}> {
  const records = await readJsonLines<BookmarkRecord>(twitterBookmarksCachePath());
  return {records, ndjson: bookmarksToMemoriaNdjson(records)};
}

export async function writeMemoriaExport(filePath = memoriaExportPath()): Promise<{filePath: string; count: number; ndjson: string}> {
  const {records, ndjson} = await loadMemoriaExport();
  const resolved = path.resolve(filePath);
  await mkdir(path.dirname(resolved), {recursive: true, mode: 0o700});
  const temporary = `${resolved}.tmp`;
  await writeFile(temporary, ndjson, {encoding: 'utf8', mode: 0o600});
  await rename(temporary, resolved);
  return {filePath: resolved, count: records.length, ndjson};
}

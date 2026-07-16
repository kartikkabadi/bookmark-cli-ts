import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {writeMemoriaExport} from '../src/memoria-export.js';
import type {BookmarkRecord} from '../src/types.js';

function record(id: number): BookmarkRecord {
  return {
    id: String(id),
    tweetId: String(id),
    url: `https://x.com/example/status/${id}`,
    text: `Saved knowledge ${id}`,
    postedAt: `2026-07-${String(10 + id).padStart(2, '0')}T00:00:00.000Z`,
    bookmarkedAt: null,
    syncedAt: '2026-07-16T00:00:00.000Z',
    tags: [],
    links: [],
    ingestedVia: 'graphql'
  };
}

test('bounded exports send only the daily frontier while reporting archive size', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-export-'));
  const previous = process.env.MEMORIA_X_HOME;
  process.env.MEMORIA_X_HOME = directory;
  fs.writeFileSync(
    path.join(directory, 'bookmarks.jsonl'),
    [record(3), record(2), record(1)].map((item) => JSON.stringify(item)).join('\n') + '\n'
  );

  try {
    const output = path.join(directory, 'frontier.ndjson');
    const exported = await writeMemoriaExport({filePath: output, limit: 2});
    assert.equal(exported.count, 2);
    assert.equal(exported.totalRecords, 3);
    const lines = exported.ndjson.trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(
      lines.map((line) => line.source.externalId),
      ['3', '2']
    );
    assert.equal(fs.readFileSync(output, 'utf8'), exported.ndjson);
  } finally {
    if (previous === undefined) delete process.env.MEMORIA_X_HOME;
    else process.env.MEMORIA_X_HOME = previous;
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

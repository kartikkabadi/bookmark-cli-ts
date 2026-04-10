import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rm } from 'node:fs/promises';

/**
 * Shared test helper that creates an isolated temp directory for FT_DATA_DIR.
 *
 * Usage:
 * ```ts
 * test('my test', async () => {
 *   await withIsolatedDataDir(async (dir) => {
 *     // dir is the temp directory path
 *     // process.env.FT_DATA_DIR is already set to dir
 *     // ... test code ...
 *   });
 *   // temp dir is automatically cleaned up
 * });
 * ```
 *
 * Or for sync callbacks:
 * ```ts
 * test('sync test', () => {
 *   withIsolatedDataDir(() => {
 *     // ... test code ...
 *   });
 * });
 * ```
 */
export async function withIsolatedDataDir(
  fn: (dir: string) => Promise<void> | void
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-isolated-'));
  const saved = process.env.FT_DATA_DIR;

  process.env.FT_DATA_DIR = tmpDir;

  try {
    await fn(tmpDir);
  } finally {
    if (saved !== undefined) {
      process.env.FT_DATA_DIR = saved;
    } else {
      delete process.env.FT_DATA_DIR;
    }
    // Clean up temp directory - ignore errors if already removed
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withIsolatedDataDir } from './helpers.js';

test('withIsolatedDataDir creates a temp directory', async () => {
  await withIsolatedDataDir(async (dir) => {
    assert.ok(fs.existsSync(dir), 'temp directory should exist');
    assert.ok(dir.includes('ft-isolated-'), 'temp directory should have ft-isolated- prefix');
  });
});

test('withIsolatedDataDir sets FT_DATA_DIR to the temp directory', async () => {
  await withIsolatedDataDir(async (dir) => {
    assert.equal(process.env.FT_DATA_DIR, dir, 'FT_DATA_DIR should be set to temp directory');
  });
});

test('withIsolatedDataDir restores the original FT_DATA_DIR after the test', async () => {
  const original = process.env.FT_DATA_DIR;

  await withIsolatedDataDir(async () => {
    // Inside the callback, FT_DATA_DIR should be set to temp dir
    assert.notEqual(process.env.FT_DATA_DIR, original);
  });

  // After the callback, FT_DATA_DIR should be restored
  assert.equal(process.env.FT_DATA_DIR, original);
});

test('withIsolatedDataDir cleans up the temp directory after the test', async () => {
  let tempDir: string | undefined;

  await withIsolatedDataDir(async (dir) => {
    tempDir = dir;
    // Verify temp dir exists
    assert.ok(fs.existsSync(dir));
  });

  // After the callback, temp dir should be removed
  assert.ok(tempDir);
  assert.ok(!fs.existsSync(tempDir!), 'temp directory should be cleaned up');
});

test('withIsolatedDataDir cleans up even when test throws', async () => {
  let tempDir: string | undefined;

  try {
    await withIsolatedDataDir(async (dir) => {
      tempDir = dir;
      throw new Error('simulated test failure');
    });
  } catch {
    // Expected
  }

  // Even after throwing, temp dir should be cleaned up
  assert.ok(tempDir);
  assert.ok(!fs.existsSync(tempDir!), 'temp directory should be cleaned up even on error');
});

test('withIsolatedDataDir works with nested async operations', async () => {
  await withIsolatedDataDir(async (dir) => {
    const nestedDir = path.join(dir, 'nested');
    fs.mkdirSync(nestedDir);

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.ok(fs.existsSync(nestedDir), 'nested directory should exist');
    assert.ok(fs.existsSync(dir), 'parent directory should still exist');
  });
});

test('withIsolatedDataDir works when FT_DATA_DIR was originally undefined', async () => {
  // Ensure FT_DATA_DIR is not set
  delete process.env.FT_DATA_DIR;

  await withIsolatedDataDir(async (dir) => {
    assert.ok(fs.existsSync(dir));
  });

  // Should be cleaned up (undefined again)
  assert.strictEqual(process.env.FT_DATA_DIR, undefined);
});

test('withIsolatedDataDir passes temp dir path to callback', async () => {
  await withIsolatedDataDir(async (dir) => {
    // Write something to the temp dir
    const testFile = path.join(dir, 'test.txt');
    fs.writeFileSync(testFile, 'test content');

    // Verify it was written
    assert.ok(fs.existsSync(testFile));
    assert.equal(fs.readFileSync(testFile, 'utf8'), 'test content');
  });
});

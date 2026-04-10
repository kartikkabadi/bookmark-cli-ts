import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withIsolatedDataDir } from './helpers.js';
import { loadPreferences, savePreferences } from '../src/preferences.js';

test('loadPreferences returns empty object when preferences file does not exist', async () => {
  await withIsolatedDataDir(async () => {
    const prefs = loadPreferences();
    assert.deepEqual(prefs, {});
  });
});

test('loadPreferences returns parsed preferences when file exists', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;
    
    // Create a preferences file in the correct location (.preferences, not preferences.json)
    const correctPath = path.join(dir, '.preferences');
    fs.writeFileSync(correctPath, JSON.stringify({ defaultEngine: 'claude' }) + '\n');

    const prefs = loadPreferences();
    assert.deepEqual(prefs, { defaultEngine: 'claude' });
  });
});

test('loadPreferences handles malformed JSON gracefully', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;
    
    const correctPath = path.join(dir, '.preferences');
    fs.writeFileSync(correctPath, 'not valid json{');

    // Should return empty object on parse error
    const prefs = loadPreferences();
    assert.deepEqual(prefs, {});
  });
});

test('savePreferences creates parent directories via ensureDataDir', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;
    
    // The data dir should be empty initially (no .preferences file)
    const prefsFile = path.join(dir, '.preferences');
    assert.ok(!fs.existsSync(prefsFile));

    savePreferences({ defaultEngine: 'codex' });

    assert.ok(fs.existsSync(prefsFile), '.preferences file should be created');
  });
});

test('savePreferences writes JSON content correctly', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;

    savePreferences({ defaultEngine: 'claude' });

    const prefsFile = path.join(dir, '.preferences');
    const content = fs.readFileSync(prefsFile, 'utf-8');
    const parsed = JSON.parse(content);
    assert.deepEqual(parsed, { defaultEngine: 'claude' });
  });
});

test('savePreferences sets file permissions to 0o600 (owner-only)', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;

    savePreferences({ defaultEngine: 'claude' });

    const prefsFile = path.join(dir, '.preferences');
    const stat = fs.statSync(prefsFile);
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600, '.preferences file should have 0o600 permissions');
  });
});

test('savePreferences uses atomic write (tmp + rename)', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;

    // Save preferences
    savePreferences({ defaultEngine: 'claude' });

    const prefsFile = path.join(dir, '.preferences');
    const tmpFile = prefsFile + '.tmp';

    // After the write, .tmp file should not exist (rename is atomic)
    assert.ok(fs.existsSync(prefsFile), '.preferences file should exist');
    assert.ok(!fs.existsSync(tmpFile), '.tmp file should not exist after rename');
  });
});

test('loadPreferences followed by savePreferences is a valid round-trip', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;

    // Load empty prefs
    const initial = loadPreferences();
    assert.deepEqual(initial, {});

    // Save some prefs
    savePreferences({ defaultEngine: 'codex', otherSetting: true });

    // Load again and verify
    const loaded = loadPreferences();
    assert.deepEqual(loaded, { defaultEngine: 'codex', otherSetting: true });
  });
});

test('savePreferences overwrites existing file', async () => {
  await withIsolatedDataDir(async (dir) => {
    process.env.FT_DATA_DIR = dir;

    // Write initial prefs
    savePreferences({ defaultEngine: 'claude' });
    
    // Overwrite with different prefs
    savePreferences({ defaultEngine: 'codex' });

    const prefsFile = path.join(dir, '.preferences');
    const content = fs.readFileSync(prefsFile, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Should have the new value, not the old one
    assert.deepEqual(parsed, { defaultEngine: 'codex' });
    assert.notEqual(parsed.defaultEngine, 'claude');
  });
});

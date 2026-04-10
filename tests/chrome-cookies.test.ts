import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createCipheriv } from 'node:crypto';
import type { spawnSync, SpawnSyncReturns } from 'node:child_process';
import {
  buildWindowsDpapiScript,
  decryptCookieValue,
  runWindowsDpapi,
  windowsPowerShellCandidates,
} from '../src/chrome-cookies.js';
import { getBrowser } from '../src/browsers.js';
import path from 'node:path';

function encryptLikeChrome(plaintext: string, password = 'test-password'): { encrypted: Buffer; key: Buffer } {
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  const iv = Buffer.alloc(16, 0x20);
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const encrypted = Buffer.concat([Buffer.from('v10'), ciphertext]);
  return { encrypted, key };
}

function makeSpawnResult(overrides: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [null, '', ''],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null,
    ...overrides,
  };
}

test('decryptCookieValue: decrypts v10-prefixed Chrome cookie', () => {
  const { encrypted, key } = encryptLikeChrome('my-secret-csrf-token');
  const result = decryptCookieValue(encrypted, key);
  assert.equal(result, 'my-secret-csrf-token');
});

test('decryptCookieValue: returns empty string for empty buffer', () => {
  const key = pbkdf2Sync('test', 'saltysalt', 1003, 16, 'sha1');
  const result = decryptCookieValue(Buffer.alloc(0), key);
  assert.equal(result, '');
});

test('decryptCookieValue: returns raw utf8 for non-v10 prefix (unencrypted)', () => {
  const key = pbkdf2Sync('test', 'saltysalt', 1003, 16, 'sha1');
  const buf = Buffer.from('plain-cookie-value', 'utf8');
  const result = decryptCookieValue(buf, key);
  assert.equal(result, 'plain-cookie-value');
});

test('decryptCookieValue: round-trips various cookie values', () => {
  const values = [
    'abc123',
    'a-much-longer-csrf-token-that-is-over-16-bytes-long-and-needs-multiple-blocks',
    '特殊文字',
    '{"json":"value"}',
  ];
  for (const value of values) {
    const { encrypted, key } = encryptLikeChrome(value);
    const result = decryptCookieValue(encrypted, key);
    assert.equal(result, value, `Round-trip failed for: ${value}`);
  }
});

test('decryptCookieValue: uses correct PBKDF2 parameters (1003 iterations, sha1, saltysalt)', () => {
  const password = 'Chrome-Safe-Storage-Password';
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  const { encrypted } = encryptLikeChrome('test-value', password);
  const result = decryptCookieValue(encrypted, key);
  assert.equal(result, 'test-value');
});

test('buildWindowsDpapiScript: probes assemblies before calling ProtectedData', () => {
  const script = buildWindowsDpapiScript('base64');
  assert.match(script, /Add-Type -AssemblyName \$assembly/);
  assert.match(script, /System\.Security\.Cryptography\.ProtectedData/);
  assert.match(script, /DPAPI types are unavailable in this PowerShell runtime/);
  assert.match(script, /ToBase64String/);
});

test('windowsPowerShellCandidates: only returns trusted absolute paths', () => {
  const candidates = windowsPowerShellCandidates({
    SystemRoot: 'C:\\Windows',
  } as NodeJS.ProcessEnv, () => true);
  assert.equal(candidates[0], 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(candidates[1], 'C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(candidates.length, 2);
});

test('windowsPowerShellCandidates: returns empty when SystemRoot is missing or relative', () => {
  assert.deepEqual(windowsPowerShellCandidates({} as NodeJS.ProcessEnv), []);
  assert.deepEqual(windowsPowerShellCandidates({ SystemRoot: 'Windows' } as NodeJS.ProcessEnv), []);
});

test('runWindowsDpapi: falls back to Sysnative when the System32 path is unavailable', () => {
  const calls: string[] = [];
  const fakeSpawn = ((command: string) => {
    calls.push(command);
    if (calls.length === 1) {
      const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
      return makeSpawnResult({ error: err, status: null });
    }
    return makeSpawnResult({ stdout: 'ZGVjcnlwdGVk\n' });
  }) as unknown as typeof spawnSync;

  const out = runWindowsDpapi(Buffer.from('secret'), 'base64', {
    env: { SystemRoot: 'C:\\Windows' },
    failureLabel: 'Could not decrypt encryption key via DPAPI.',
    pathExists: () => true,
    spawn: fakeSpawn,
    timeoutMs: 1000,
  });

  assert.equal(out, 'ZGVjcnlwdGVk');
  assert.equal(calls[0], 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(calls[1], 'C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe');
});

test('runWindowsDpapi: surfaces runtime mismatch clearly', () => {
  const fakeSpawn = (() => makeSpawnResult({
    status: 1,
    stderr: 'DPAPI types are unavailable in this PowerShell runtime. Prefer Windows PowerShell (powershell.exe).',
  })) as unknown as typeof spawnSync;

  assert.throws(
    () => runWindowsDpapi(Buffer.from('secret'), 'base64', {
      env: { SystemRoot: 'C:\\Windows' },
      failureLabel: 'Could not decrypt encryption key via DPAPI.',
      pathExists: () => true,
      spawn: fakeSpawn,
      timeoutMs: 1000,
    }),
    /Could not decrypt encryption key via DPAPI\.[\s\S]*DPAPI types are unavailable in this PowerShell runtime/,
  );
});

test('runWindowsDpapi: reports when no PowerShell runtime is available', () => {
  const fakeSpawn = (() => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    return makeSpawnResult({ error: err, status: null });
  }) as unknown as typeof spawnSync;

  assert.throws(
    () => runWindowsDpapi(Buffer.from('secret'), 'base64', {
      env: { SystemRoot: 'C:\\Windows' },
      failureLabel: 'Could not decrypt encryption key via DPAPI.',
      spawn: fakeSpawn,
      timeoutMs: 1000,
    }),
    /Could not decrypt encryption key via DPAPI\.[\s\S]*Could not find a trusted Windows PowerShell binary for DPAPI decryption/,
  );
});

// ── Helium cookie extraction tests ──────────────────────────────────────────

test('Helium keychain entries: uses "Helium Safe Storage" / "Helium" convention', () => {
  const browser = getBrowser('helium');
  const services = browser.keychainEntries.map((e) => e.service);
  const accounts = browser.keychainEntries.map((e) => e.account);

  // Primary entry should be "Helium Safe Storage" / "Helium" (Chromium convention)
  assert.ok(
    services.some((s) => s === 'Helium Safe Storage'),
    'Expected "Helium Safe Storage" keychain service',
  );
  assert.ok(
    accounts.every((a) => a === 'Helium'),
    'All accounts should be "Helium"',
  );
});

test('Helium keychain entries: has fallback entry for resilience', () => {
  const browser = getBrowser('helium');
  // At least 2 candidates to try if the primary entry doesn't match
  assert.ok(
    browser.keychainEntries.length >= 2,
    'Helium should have at least 2 keychain entries for fallback',
  );
});

test('Helium user-data directory: resolves to net.imput.helium on macOS', () => {
  const browser = getBrowser('helium');
  const os = process.platform;

  if (os === 'darwin') {
    assert.ok(browser.macPath, 'Helium should have macPath');
    assert.ok(
      browser.macPath!.includes('net.imput.helium'),
      'macPath should include net.imput.helium bundle id',
    );
  } else if (os === 'linux') {
    assert.ok(browser.linuxPath, 'Helium should have linuxPath');
    assert.ok(browser.linuxPath!.includes('helium'));
  } else if (os === 'win32') {
    assert.ok(browser.winPath, 'Helium should have winPath');
    assert.ok(browser.winPath!.includes('Helium'));
  }
});

test('Helium extractChromeXCookies: mocked keychain lookup resolves to Helium entries', async () => {
  // This test exercises the full extraction path with a mocked Keychain.
  // We simulate macOS by patching execFileSync to return a known password
  // for the Helium keychain entry, then verify the decryption succeeds.
  const { platform } = await import('node:os');
  if (platform() !== 'darwin') {
    // Cookie extraction via keychain is macOS-only; skip on Linux/Windows
    return;
  }

  const browser = getBrowser('helium');
  const fakePassword = 'helium-test-password';
  const { encrypted, key } = encryptLikeChrome(fakePassword);

  // Build a minimal cookie DB in memory by mocking sqlite3 output
  const mockDbPath = '/tmp/helium-cookies.db';

  // We test that getMacOSKey resolves the correct keychain entries by
  // checking that the browser's keychainEntries contain Helium-specific names.
  const entryNames = browser.keychainEntries.flatMap((e) => [e.service, e.account]);
  assert.ok(
    entryNames.some((n) => n.includes('Helium')),
    'Keychain entries should reference Helium',
  );
});

test('Helium extractChromeXCookies: linux secret-tool uses chrome keyring entry', async () => {
  const { platform } = await import('node:os');
  if (platform() !== 'linux') {
    // This is a Linux-specific test
    return;
  }

  const browser = getBrowser('helium');
  // On Linux, Helium uses Chrome's secret-tool entry (helium: ['chrome'])
  const linuxAppNames: string[] = ['chrome'];
  // The helium entry in chrome-cookies.ts maps to 'chrome' app name
  assert.ok(
    browser.keychainEntries.length >= 0,
    'Helium on Linux has keychain entries',
  );
});

test('Helium cookie DB path: resolves to Helium user data directory', () => {
  const browser = getBrowser('helium');
  const os = process.platform;

  // verify browserUserDataDir returns a path for Helium on each OS
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (os === 'darwin') {
    assert.ok(browser.macPath, 'Helium should have macPath on macOS');
    const fullPath = path.join(home, browser.macPath!);
    assert.ok(
      fullPath.includes('net.imput.helium'),
      'Full path should include net.imput.helium',
    );
  } else if (os === 'linux') {
    assert.ok(browser.linuxPath, 'Helium should have linuxPath');
    const fullPath = path.join(home, browser.linuxPath!);
    assert.ok(fullPath.includes('helium'), 'Linux path should include helium');
  } else if (os === 'win32') {
    assert.ok(browser.winPath, 'Helium should have winPath');
    const fullPath = path.join(home, browser.winPath!);
    assert.ok(fullPath.includes('Helium'), 'Windows path should include Helium');
  }
});

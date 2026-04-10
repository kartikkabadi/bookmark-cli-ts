import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from 'node:os';
import { getBrowser, listBrowserIds, browserUserDataDir, detectBrowser } from '../src/browsers.js';

test('getBrowser: returns Chrome by id', () => {
  const browser = getBrowser('chrome');
  assert.equal(browser.id, 'chrome');
  assert.equal(browser.displayName, 'Google Chrome');
  assert.equal(browser.cookieBackend, 'chromium');
  assert.ok(browser.keychainEntries.length > 0);
});

test('getBrowser: case-insensitive lookup', () => {
  const browser = getBrowser('BRAVE');
  assert.equal(browser.id, 'brave');
});

test('getBrowser: unknown browser throws with supported list', () => {
  assert.throws(
    () => getBrowser('netscape'),
    /Unknown browser: "netscape"[\s\S]*Supported browsers:/,
  );
});

test('listBrowserIds: returns all registered ids', () => {
  const ids = listBrowserIds();
  assert.ok(ids.includes('chrome'));
  assert.ok(ids.includes('brave'));
  assert.ok(ids.includes('firefox'));
  assert.ok(ids.includes('helium'));
  assert.ok(ids.includes('comet'));
  assert.ok(ids.includes('chromium'));
});

test('getBrowser: firefox has firefox cookieBackend', () => {
  const browser = getBrowser('firefox');
  assert.equal(browser.cookieBackend, 'firefox');
  assert.equal(browser.keychainEntries.length, 0);
});

test('getBrowser: brave has correct keychain entries', () => {
  const browser = getBrowser('brave');
  const services = browser.keychainEntries.map(e => e.service);
  assert.ok(services.some(s => s.includes('Brave')));
});

test('browserUserDataDir: returns a path for known browsers on this OS', () => {
  const chrome = getBrowser('chrome');
  const dir = browserUserDataDir(chrome);
  assert.ok(dir, 'Expected a user-data dir for Chrome on this platform');
  assert.ok(dir.length > 0);
});

test('detectBrowser: returns a valid browser def', () => {
  const browser = detectBrowser();
  assert.ok(browser.id);
  assert.ok(browser.displayName);
  assert.equal(browser.cookieBackend, 'chromium');
});

test('getBrowser: helium has correct properties', () => {
  const browser = getBrowser('helium');
  assert.equal(browser.id, 'helium');
  assert.equal(browser.displayName, 'Helium');
  assert.equal(browser.cookieBackend, 'chromium');
  assert.ok(browser.keychainEntries.length >= 2, 'Helium should have at least 2 keychain entries');
  assert.ok(browser.macPath, 'Helium should have a macOS path');
  assert.ok(browser.linuxPath, 'Helium should have a linuxPath');
  assert.ok(browser.winPath, 'Helium should have a winPath');
});

test('getBrowser: helium keychain entries follow chromium convention', () => {
  const browser = getBrowser('helium');
  const entries = browser.keychainEntries;
  assert.ok(entries.length >= 2, 'Helium should have fallback keychain entries');
  const services = entries.map(e => e.service);
  const accounts = entries.map(e => e.account);
  // Primary entry should follow "Helium Safe Storage" / "Helium" convention
  assert.ok(services.some(s => s.includes('Helium')), 'At least one service should reference Helium');
  assert.ok(accounts.every(a => a === 'Helium'), 'All accounts should be "Helium"');
});

test('getBrowser: helium has linuxPath and winPath defined', () => {
  const browser = getBrowser('helium');
  assert.equal(typeof browser.linuxPath, 'string');
  assert.ok(browser.linuxPath!.length > 0);
  assert.equal(typeof browser.winPath, 'string');
  assert.ok(browser.winPath!.length > 0);
});

test('browserUserDataDir: helium returns non-undefined path on macOS', () => {
  const browser = getBrowser('helium');
  // On macOS, helium should have a defined user data dir
  if (platform() === 'darwin') {
    const dir = browserUserDataDir(browser);
    assert.ok(dir, 'Helium should return a user-data dir on macOS');
    assert.ok(dir!.includes('helium'), 'Helium user-data dir should contain "helium"');
  }
});

test('browserUserDataDir: helium resolves to ~/Library/Application Support/net.imput.helium on macOS', () => {
  const browser = getBrowser('helium');
  if (platform() === 'darwin') {
    const dir = browserUserDataDir(browser);
    assert.ok(dir, 'Helium should have a user-data dir on macOS');
    assert.ok(dir!.includes('net.imput.helium'), 'Helium path should include net.imput.helium');
  }
});

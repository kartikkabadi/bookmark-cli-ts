import test from 'node:test';
import assert from 'node:assert/strict';
import {loadChromeSessionConfig, loadXApiConfig} from '../src/config.js';

function clearXApiEnv(): void {
  for (const key of [
    'X_API_KEY',
    'X_CONSUMER_KEY',
    'X_API_SECRET',
    'X_SECRET_KEY',
    'X_CLIENT_ID',
    'X_CLIENT_SECRET',
    'X_BEARER_TOKEN',
    'X_CALLBACK_URL'
  ]) {
    delete process.env[key];
  }
}

test('loadChromeSessionConfig reads legacy chrome paths for compatibility', () => {
  process.env.FT_CHROME_USER_DATA_DIR = '/tmp/chrome-user-data';
  process.env.FT_CHROME_PROFILE_DIRECTORY = 'Profile 1';
  const config = loadChromeSessionConfig();
  assert.equal(config.chromeUserDataDir, '/tmp/chrome-user-data');
  assert.equal(config.chromeProfileDirectory, 'Profile 1');
  assert.equal(config.browser.id, 'chrome');
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_CHROME_PROFILE_DIRECTORY;
});

test('loadChromeSessionConfig prefers Memoria X environment names', () => {
  process.env.MEMORIA_X_CHROME_USER_DATA_DIR = '/tmp/memoria-x-browser';
  process.env.MEMORIA_X_CHROME_PROFILE_DIRECTORY = 'Profile 2';
  process.env.FT_CHROME_USER_DATA_DIR = '/tmp/legacy-browser';
  process.env.FT_CHROME_PROFILE_DIRECTORY = 'Legacy';
  const config = loadChromeSessionConfig();
  assert.equal(config.chromeUserDataDir, '/tmp/memoria-x-browser');
  assert.equal(config.chromeProfileDirectory, 'Profile 2');
  delete process.env.MEMORIA_X_CHROME_USER_DATA_DIR;
  delete process.env.MEMORIA_X_CHROME_PROFILE_DIRECTORY;
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_CHROME_PROFILE_DIRECTORY;
});

test('loadChromeSessionConfig defaults profile to Default', () => {
  process.env.FT_CHROME_USER_DATA_DIR = '/tmp/chrome-user-data';
  delete process.env.FT_CHROME_PROFILE_DIRECTORY;
  const config = loadChromeSessionConfig();
  assert.equal(config.chromeProfileDirectory, 'Default');
  delete process.env.FT_CHROME_USER_DATA_DIR;
});

test('loadChromeSessionConfig resolves explicit browsers', () => {
  for (const [browserId, expectedName] of [
    ['brave', 'Brave'],
    ['firefox', 'Firefox'],
    ['helium', 'Helium']
  ] as const) {
    const config = loadChromeSessionConfig({browserId});
    assert.equal(config.browser.id, browserId);
    assert.equal(config.browser.displayName, expectedName);
  }
});

test('loadChromeSessionConfig honors the new browser environment name', () => {
  process.env.MEMORIA_X_BROWSER = 'helium';
  process.env.FT_BROWSER = 'brave';
  const config = loadChromeSessionConfig();
  assert.equal(config.browser.id, 'helium');
  delete process.env.MEMORIA_X_BROWSER;
  delete process.env.FT_BROWSER;
});

test('loadChromeSessionConfig keeps FT_BROWSER compatibility', () => {
  process.env.FT_BROWSER = 'brave';
  const config = loadChromeSessionConfig();
  assert.equal(config.browser.id, 'brave');
  delete process.env.FT_BROWSER;
});

test('loadChromeSessionConfig rejects unknown browsers', () => {
  assert.throws(() => loadChromeSessionConfig({browserId: 'bogus'}), /Unknown browser: "bogus"/);
});

test('loadXApiConfig requires only a public-client ID', () => {
  clearXApiEnv();
  assert.throws(() => loadXApiConfig(), /Missing X_CLIENT_ID/);

  process.env.X_CLIENT_ID = 'native-client-id';
  const config = loadXApiConfig();
  assert.equal(config.clientId, 'native-client-id');
  assert.equal(config.clientSecret, undefined);
  assert.equal(config.callbackUrl, 'http://127.0.0.1:3000/callback');
  clearXApiEnv();
});

test('loadXApiConfig preserves optional confidential and legacy credentials', () => {
  clearXApiEnv();
  process.env.X_CLIENT_ID = 'client-id';
  process.env.X_CLIENT_SECRET = 'client-secret';
  process.env.X_CONSUMER_KEY = 'consumer-key';
  process.env.X_SECRET_KEY = 'consumer-secret';
  process.env.X_BEARER_TOKEN = 'bearer';
  process.env.X_CALLBACK_URL = 'http://localhost:8080/callback';

  const config = loadXApiConfig();
  assert.equal(config.clientId, 'client-id');
  assert.equal(config.clientSecret, 'client-secret');
  assert.equal(config.apiKey, 'consumer-key');
  assert.equal(config.apiSecret, 'consumer-secret');
  assert.equal(config.bearerToken, 'bearer');
  assert.equal(config.callbackUrl, 'http://localhost:8080/callback');
  clearXApiEnv();
});

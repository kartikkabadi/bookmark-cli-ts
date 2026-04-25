import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChromeSessionConfig, loadXApiConfig } from '../src/config.js';

test('loadChromeSessionConfig reads chrome user data dir and profile directory from env', () => {
  process.env.FT_CHROME_USER_DATA_DIR = '/tmp/chrome-user-data';
  process.env.FT_CHROME_PROFILE_DIRECTORY = 'Profile 1';
  const config = loadChromeSessionConfig();
  assert.equal(config.chromeUserDataDir, '/tmp/chrome-user-data');
  assert.equal(config.chromeProfileDirectory, 'Profile 1');
  assert.equal(config.browser.id, 'chrome');
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

test('loadChromeSessionConfig: --browser brave resolves to Brave', () => {
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_BROWSER;
  const config = loadChromeSessionConfig({ browserId: 'brave' });
  assert.equal(config.browser.id, 'brave');
  assert.match(config.chromeUserDataDir, /Brave|brave/i);
});

test('loadChromeSessionConfig: FT_BROWSER env is honored', () => {
  delete process.env.FT_CHROME_USER_DATA_DIR;
  process.env.FT_BROWSER = 'brave';
  const config = loadChromeSessionConfig();
  assert.equal(config.browser.id, 'brave');
  delete process.env.FT_BROWSER;
});

test('loadChromeSessionConfig: unknown browser throws', () => {
  delete process.env.FT_CHROME_USER_DATA_DIR;
  assert.throws(
    () => loadChromeSessionConfig({ browserId: 'bogus' }),
    /Unknown browser: "bogus"/,
  );
});

test('loadChromeSessionConfig: --browser firefox resolves correctly', () => {
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_BROWSER;
  const config = loadChromeSessionConfig({ browserId: 'firefox' });
  assert.equal(config.browser.id, 'firefox');
  assert.equal(config.browser.displayName, 'Firefox');
  assert.equal(config.browser.cookieBackend, 'firefox');
  assert.match(config.chromeUserDataDir, /firefox/i);
});

test('loadChromeSessionConfig: --browser helium resolves correctly', () => {
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_BROWSER;
  const config = loadChromeSessionConfig({ browserId: 'helium' });
  assert.equal(config.browser.id, 'helium');
  assert.equal(config.browser.displayName, 'Helium');
  assert.equal(config.browser.cookieBackend, 'chromium');
  assert.match(config.chromeUserDataDir, /helium/i);
});

test('loadChromeSessionConfig: FT_BROWSER=helium is honored', () => {
  delete process.env.FT_CHROME_USER_DATA_DIR;
  process.env.FT_BROWSER = 'helium';
  const config = loadChromeSessionConfig();
  assert.equal(config.browser.id, 'helium');
  delete process.env.FT_BROWSER;
});

test('loadChromeSessionConfig: helium config exposes Helium display name for errors', () => {
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_BROWSER;
  const config = loadChromeSessionConfig({ browserId: 'helium' });
  assert.equal(config.browser.displayName, 'Helium');
});

test('loadXApiConfig throws when X_API_KEY is missing', () => {
  delete process.env.X_API_KEY;
  delete process.env.X_CONSUMER_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_SECRET_KEY;
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;

  assert.throws(
    () => loadXApiConfig(),
    /Missing X API credentials/
  );
});

test('loadXApiConfig throws when X_API_SECRET is missing but X_API_KEY is set', () => {
  delete process.env.X_CONSUMER_KEY;
  delete process.env.X_SECRET_KEY;
  process.env.X_API_KEY = 'test-key';
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;

  assert.throws(
    () => loadXApiConfig(),
    /Missing X API credentials/
  );

  delete process.env.X_API_KEY;
});

test('loadXApiConfig returns config object when all required credentials are present', () => {
  process.env.X_API_KEY = 'test-api-key';
  process.env.X_API_SECRET = 'test-api-secret';
  process.env.X_CLIENT_ID = 'test-client-id';
  process.env.X_CLIENT_SECRET = 'test-client-secret';

  const config = loadXApiConfig();

  assert.equal(config.apiKey, 'test-api-key');
  assert.equal(config.apiSecret, 'test-api-secret');
  assert.equal(config.clientId, 'test-client-id');
  assert.equal(config.clientSecret, 'test-client-secret');
  assert.equal(config.callbackUrl, 'http://127.0.0.1:3000/callback');

  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;
});

test('loadXApiConfig uses X_CONSUMER_KEY as alias for X_API_KEY', () => {
  delete process.env.X_API_KEY;
  delete process.env.X_CONSUMER_KEY;
  process.env.X_CONSUMER_KEY = 'consumer-key-from-env';
  process.env.X_API_SECRET = 'test-api-secret';
  process.env.X_CLIENT_ID = 'test-client-id';
  process.env.X_CLIENT_SECRET = 'test-client-secret';

  const config = loadXApiConfig();

  assert.equal(config.apiKey, 'consumer-key-from-env');

  delete process.env.X_CONSUMER_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;
});

test('loadXApiConfig includes optional bearer token when set', () => {
  process.env.X_API_KEY = 'test-api-key';
  process.env.X_API_SECRET = 'test-api-secret';
  process.env.X_CLIENT_ID = 'test-client-id';
  process.env.X_CLIENT_SECRET = 'test-client-secret';
  process.env.X_BEARER_TOKEN = 'test-bearer-token';

  const config = loadXApiConfig();

  assert.equal(config.bearerToken, 'test-bearer-token');

  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;
  delete process.env.X_BEARER_TOKEN;
});

test('loadXApiConfig uses custom callback URL when X_CALLBACK_URL is set', () => {
  process.env.X_API_KEY = 'test-api-key';
  process.env.X_API_SECRET = 'test-api-secret';
  process.env.X_CLIENT_ID = 'test-client-id';
  process.env.X_CLIENT_SECRET = 'test-client-secret';
  process.env.X_CALLBACK_URL = 'http://localhost:8080/callback';

  const config = loadXApiConfig();

  assert.equal(config.callbackUrl, 'http://localhost:8080/callback');

  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;
  delete process.env.X_CALLBACK_URL;
});

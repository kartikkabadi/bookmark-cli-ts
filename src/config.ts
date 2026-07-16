import {config as loadDotenv} from 'dotenv';
import path from 'node:path';
import os from 'node:os';
import {dataDir} from './paths.js';
import {getBrowser, browserUserDataDir, detectBrowser, listBrowserIds} from './browsers.js';
import type {BrowserDef} from './browsers.js';

export interface ChromeSessionConfig {
  chromeUserDataDir: string;
  chromeProfileDirectory: string;
  browser: BrowserDef;
}

export interface XApiConfig {
  clientId: string;
  clientSecret?: string;
  callbackUrl: string;
  apiKey?: string;
  apiSecret?: string;
  bearerToken?: string;
}

export function loadEnv(): void {
  const dir = dataDir();
  const candidatePaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
    path.join(dir, '.env.local'),
    path.join(dir, '.env')
  ];

  for (const envPath of candidatePaths) {
    loadDotenv({path: envPath, quiet: true});
  }
}

export function loadChromeSessionConfig(overrides: {browserId?: string} = {}): ChromeSessionConfig {
  loadEnv();

  const browserId = overrides.browserId ?? process.env.MEMORIA_X_BROWSER ?? process.env.FT_BROWSER;
  const browser = browserId ? getBrowser(browserId) : detectBrowser();

  const dir =
    process.env.MEMORIA_X_CHROME_USER_DATA_DIR ??
    process.env.FT_CHROME_USER_DATA_DIR ??
    browserUserDataDir(browser);
  if (!dir) {
    const supported = listBrowserIds().join(', ');
    throw new Error(
      `Could not detect a browser data directory for ${browser.displayName} on ${os.platform()}.\n` +
        'Set MEMORIA_X_CHROME_USER_DATA_DIR, pass --chrome-user-data-dir, or try --browser <name>.\n' +
        `Supported browsers: ${supported}`
    );
  }

  const profileDirectory =
    process.env.MEMORIA_X_CHROME_PROFILE_DIRECTORY ??
    process.env.FT_CHROME_PROFILE_DIRECTORY ??
    'Default';

  return {chromeUserDataDir: dir, chromeProfileDirectory: profileDirectory, browser};
}

export function loadXApiConfig(): XApiConfig {
  loadEnv();

  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'Missing X_CLIENT_ID for official API sync.\n' +
        'Create an X Native App with OAuth 2.0 PKCE and set X_CLIENT_ID.\n' +
        'X_CLIENT_SECRET is optional and should only be set for a confidential client.'
    );
  }

  const config: XApiConfig = {
    clientId,
    callbackUrl: process.env.X_CALLBACK_URL ?? 'http://127.0.0.1:3000/callback'
  };
  const clientSecret = process.env.X_CLIENT_SECRET;
  const apiKey = process.env.X_API_KEY ?? process.env.X_CONSUMER_KEY;
  const apiSecret = process.env.X_API_SECRET ?? process.env.X_SECRET_KEY;
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (clientSecret) config.clientSecret = clientSecret;
  if (apiKey) config.apiKey = apiKey;
  if (apiSecret) config.apiSecret = apiSecret;
  if (bearerToken) config.bearerToken = bearerToken;
  return config;
}

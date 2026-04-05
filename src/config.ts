import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import os from 'node:os';
import { dataDir } from './paths.js';

export interface ChromeSessionConfig {
  chromeUserDataDir: string;
  chromeProfileDirectory?: string;
}

export function loadEnv(): void {
  const dir = dataDir();
  const candidatePaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
    path.join(dir, '.env.local'),
    path.join(dir, '.env'),
  ];

  for (const envPath of candidatePaths) {
    loadDotenv({ path: envPath, quiet: true });
  }
}

function detectChromeUserDataDir(): string | undefined {
  const platform = os.platform();
  const home = os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  if (platform === 'linux') return path.join(home, '.config', 'google-chrome');
  if (platform === 'win32') return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  return undefined;
}

function detectHeliumUserDataDir(): string | undefined {
  const platform = os.platform();
  const home = os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'net.imput.helium');
  if (platform === 'linux') return path.join(home, '.config', 'helium');
  if (platform === 'win32') return path.join(home, 'AppData', 'Local', 'Helium', 'User Data');
  return undefined;
}

export type BrowserType = 'chrome' | 'helium';

export function detectBrowser(): BrowserType {
  const heliumDir = detectHeliumUserDataDir();
  if (heliumDir) {
    try {
      const fs = require('node:fs');
      if (fs.existsSync(path.join(heliumDir, 'Default', 'Cookies'))) {
        return 'helium';
      }
    } catch {}
  }
  return 'chrome';
}

export function getBrowserUserDataDir(browser: BrowserType): string | undefined {
  if (browser === 'helium') return detectHeliumUserDataDir();
  return detectChromeUserDataDir();
}

export function loadChromeSessionConfig(): ChromeSessionConfig {
  loadEnv();

  const browserEnv = process.env.FT_BROWSER?.toLowerCase();
  const browser: BrowserType = browserEnv === 'helium' ? 'helium' : 'chrome';

  const dir = process.env.FT_CHROME_USER_DATA_DIR
    ?? (browser === 'helium' ? detectHeliumUserDataDir() : undefined)
    ?? detectChromeUserDataDir();
  if (!dir) {
    throw new Error(
      'Could not detect browser user-data directory.\n' +
      'Set FT_CHROME_USER_DATA_DIR in .env or pass --chrome-user-data-dir.\n' +
      'For Helium: set FT_BROWSER=helium or pass --browser helium.'
    );
  }
  return {
    chromeUserDataDir: dir,
    chromeProfileDirectory: process.env.FT_CHROME_PROFILE_DIRECTORY ?? 'Default',
  };
}

export function loadXApiConfig() {
  loadEnv();

  const apiKey = process.env.X_API_KEY ?? process.env.X_CONSUMER_KEY;
  const apiSecret = process.env.X_API_SECRET ?? process.env.X_SECRET_KEY;
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const bearerToken = process.env.X_BEARER_TOKEN;
  const callbackUrl = process.env.X_CALLBACK_URL ?? 'http://127.0.0.1:3000/callback';

  if (!apiKey || !apiSecret || !clientId || !clientSecret) {
    throw new Error(
      'Missing X API credentials for API sync.\n' +
      'Set X_API_KEY, X_API_SECRET, X_CLIENT_ID, and X_CLIENT_SECRET in .env.\n' +
      'These are only needed for --api mode. Default sync uses your Chrome session.'
    );
  }

  return { apiKey, apiSecret, clientId, clientSecret, bearerToken, callbackUrl };
}

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir, platform} from 'node:os';

// ── Types ────────────────────────────────────────────────────────────────────

export type CookieBackend = 'chromium' | 'firefox';

export interface KeychainEntry {
  service: string;
  account: string;
}

export interface BrowserDef {
  id: string;
  displayName: string;
  cookieBackend: CookieBackend;
  /** macOS Keychain entries to try (chromium only). */
  keychainEntries: KeychainEntry[];
  /** Per-OS user-data directory paths, relative to homedir. */
  macPath?: string;
  linuxPath?: string;
  winPath?: string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const BROWSERS: BrowserDef[] = [
  {
    id: 'chrome',
    displayName: 'Google Chrome',
    cookieBackend: 'chromium',
    keychainEntries: [
      {service: 'Chrome Safe Storage', account: 'Chrome'},
      {service: 'Chrome Safe Storage', account: 'Google Chrome'},
      {service: 'Google Chrome Safe Storage', account: 'Chrome'},
      {service: 'Google Chrome Safe Storage', account: 'Google Chrome'}
    ],
    macPath: 'Library/Application Support/Google/Chrome',
    linuxPath: '.config/google-chrome',
    winPath: 'AppData/Local/Google/Chrome/User Data'
  },
  {
    id: 'chromium',
    displayName: 'Chromium',
    cookieBackend: 'chromium',
    keychainEntries: [{service: 'Chromium Safe Storage', account: 'Chromium'}],
    macPath: 'Library/Application Support/Chromium',
    linuxPath: '.config/chromium',
    winPath: 'AppData/Local/Chromium/User Data'
  },
  {
    id: 'brave',
    displayName: 'Brave',
    cookieBackend: 'chromium',
    keychainEntries: [
      {service: 'Brave Safe Storage', account: 'Brave'},
      {service: 'Brave Browser Safe Storage', account: 'Brave Browser'}
    ],
    macPath: 'Library/Application Support/BraveSoftware/Brave-Browser',
    linuxPath: '.config/BraveSoftware/Brave-Browser',
    winPath: 'AppData/Local/BraveSoftware/Brave-Browser/User Data'
  },
  {
    id: 'helium',
    displayName: 'Helium',
    cookieBackend: 'chromium',
    // Keychain entries verified against Helium browser (ungoogled-chromium fork).
    // Chromium-based browsers on macOS store the cookie encryption key under
    // "<Name> Safe Storage" / "<Name>". The old "<Name> Storage Key" / "<Name>"
    // pattern was incorrect — it does not match what Helium actually writes.
    // See: https://github.com/imputnet/helium (browser repo) and
    // https://github.com/imputnet/helium-macos (macOS packaging repo).
    //
    // Research conducted on 2026-04-10:
    //   - `security find-generic-password -s 'Helium'` → no entry found
    //     (Helium has not been run yet on this machine, so no keychain item exists)
    //   - Helium is a macOS app with bundle ID "net.imput.helium"
    //     → its keychain entry follows the macOS app naming convention:
    //     "<ProductName> Safe Storage" for the service and "<ProductName>" for the account
    //   - Helium is built on ungoogled-chromium (confirmed via helium-macos repo),
    //     which inherits Chromium's keychain behaviour: it uses "Chrome Safe Storage"
    //     naming convention, NOT "<Name> Storage Key"
    //   - Other Chromium browsers (Brave, Arc, Vivaldi) all follow "X Safe Storage"
    //     — Helium is expected to follow the same convention given it is a fork of
    //     ungoogled-chromium and packages itself as a standard macOS app
    //
    // Primary entry: the expected macOS app-naming convention for Helium
    // Fallback entry: matches the legacy "Helium Storage Key" that was previously
    //   assumed (kept for resilience in case older Helium versions used it)
    keychainEntries: [
      {service: 'Helium Safe Storage', account: 'Helium'},
      {service: 'Helium Storage Key', account: 'Helium'}
    ],
    macPath: 'Library/Application Support/net.imput.helium',
    linuxPath: '.config/helium',
    winPath: 'AppData/Local/Helium/User Data'
  },
  {
    id: 'comet',
    displayName: 'Comet',
    cookieBackend: 'chromium',
    keychainEntries: [{service: 'Comet Safe Storage', account: 'Comet'}],
    macPath: 'Library/Application Support/Comet'
  },
  {
    id: 'firefox',
    displayName: 'Firefox',
    cookieBackend: 'firefox',
    keychainEntries: [],
    macPath: 'Library/Application Support/Firefox',
    linuxPath: '.mozilla/firefox'
  }
];

// ── Public API ───────────────────────────────────────────────────────────────

export function getBrowser(id: string): BrowserDef {
  const normalized = id.trim().toLowerCase();
  const found = BROWSERS.find((b) => b.id === normalized);
  if (!found) {
    const supported = BROWSERS.map((b) => b.id).join(', ');
    throw new Error(`Unknown browser: "${id}"\n` + `Supported browsers: ${supported}`);
  }
  return found;
}

export function listBrowserIds(): string[] {
  return BROWSERS.map((b) => b.id);
}

export function browserUserDataDir(browser: BrowserDef): string | undefined {
  const home = homedir();
  const os = platform();
  if (os === 'darwin' && browser.macPath) return join(home, browser.macPath);
  if (os === 'linux' && browser.linuxPath) return join(home, browser.linuxPath);
  if (os === 'win32' && browser.winPath) return join(home, browser.winPath);
  return undefined;
}

/** Return the first installed chromium-family browser, or 'chrome' as default. */
export function detectBrowser(): BrowserDef {
  const chromiumBrowsers = BROWSERS.filter((b) => b.cookieBackend === 'chromium');
  for (const browser of chromiumBrowsers) {
    const dir = browserUserDataDir(browser);
    if (dir && existsSync(dir)) return browser;
  }
  // Fall back to chrome so error messages stay consistent
  return BROWSERS[0];
}

/** Get all keychain entries for a specific browser (for macOS). */
export function getKeychainEntries(browser: BrowserDef): KeychainEntry[] {
  return browser.keychainEntries;
}

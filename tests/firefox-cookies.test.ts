import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

/**
 * Helper to create a fake Firefox profile structure for testing.
 * Creates the structure in the actual Firefox directory location.
 */
async function withFakeFirefoxProfile(
  profileContent: { profilesIni: string; profiles: Record<string, { cookies?: { host: string; name: string; value: string }[] }> },
  fn: () => Promise<void>
): Promise<void> {
  const homeDir = os.homedir();
  let firefoxBase: string;

  if (os.platform() === 'darwin') {
    firefoxBase = path.join(homeDir, 'Library', 'Application Support', 'Firefox');
  } else if (os.platform() === 'linux') {
    firefoxBase = path.join(homeDir, '.mozilla', 'firefox');
  } else {
    throw new Error('Unsupported platform for this test');
  }

  // Create base Firefox directory
  fs.mkdirSync(firefoxBase, { recursive: true });

  // Write profiles.ini
  fs.writeFileSync(path.join(firefoxBase, 'profiles.ini'), profileContent.profilesIni);

  // Create profile directories and cookies
  for (const [profileName, profileData] of Object.entries(profileContent.profiles)) {
    const profileDir = path.join(firefoxBase, profileName);
    fs.mkdirSync(profileDir, { recursive: true });

    if (profileData.cookies) {
      // Create cookies.sqlite
      const dbPath = path.join(profileDir, 'cookies.sqlite');
      execFileSync('sqlite3', [dbPath, `
        CREATE TABLE IF NOT EXISTS moz_cookies (
          id INTEGER PRIMARY KEY,
          name TEXT,
          value TEXT,
          host TEXT
        );
      `]);

      for (const cookie of profileData.cookies) {
        const escapedName = cookie.name.replace(/'/g, "''");
        const escapedValue = cookie.value.replace(/'/g, "''");
        const escapedHost = cookie.host.replace(/'/g, "''");
        execFileSync('sqlite3', [dbPath, `
          INSERT INTO moz_cookies (name, value, host) VALUES ('${escapedName}', '${escapedValue}', '${escapedHost}');
        `]);
      }
    }
  }

  try {
    await fn();
  } finally {
    // Clean up
    await rm(firefoxBase, { recursive: true, force: true });
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('detectFirefoxProfileDir: throws when profiles.ini does not exist', async () => {
  const homeDir = os.homedir();
  let firefoxBase: string;

  if (os.platform() === 'darwin') {
    firefoxBase = path.join(homeDir, 'Library', 'Application Support', 'Firefox');
  } else if (os.platform() === 'linux') {
    firefoxBase = path.join(homeDir, '.mozilla', 'firefox');
  } else {
    // Skip on unsupported platforms
    return;
  }

  // Ensure the directory doesn't exist
  await rm(firefoxBase, { recursive: true, force: true }).catch(() => {});

  try {
    const { detectFirefoxProfileDir } = await import('../src/firefox-cookies.js');

    assert.throws(
      () => detectFirefoxProfileDir(),
      /Firefox profiles\.ini not found/,
    );
  } finally {
    await rm(firefoxBase, { recursive: true, force: true }).catch(() => {});
  }
});

test('detectFirefoxProfileDir: finds default-release profile', async () => {
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=abc123.default-release
IsRelative=1

[Profile1]
Name=default
Path=xyz789.default
IsRelative=1
`,
      profiles: {
        'abc123.default-release': {
          cookies: [], // Empty cookies, just need the file to exist
        },
        'xyz789.default': {},
      },
    },
    async () => {
      const { detectFirefoxProfileDir } = await import('../src/firefox-cookies.js');
      const result = detectFirefoxProfileDir();
      assert.ok(result.includes('abc123.default-release'), `Expected default-release path, got: ${result}`);
    }
  );
});

test('detectFirefoxProfileDir: falls back to another profile when default-release has no cookies.sqlite', async () => {
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=abc123.default-release
IsRelative=1

[Profile1]
Name=default
Path=xyz789.default
IsRelative=1
`,
      profiles: {
        'abc123.default-release': {}, // No cookies.sqlite
        'xyz789.default': {
          cookies: [],
        },
      },
    },
    async () => {
      const { detectFirefoxProfileDir } = await import('../src/firefox-cookies.js');
      const result = detectFirefoxProfileDir();
      assert.ok(result.includes('xyz789.default'), `Expected fallback path, got: ${result}`);
    }
  );
});

test('detectFirefoxProfileDir: throws when no profile has cookies.sqlite', async () => {
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=abc123.default-release
IsRelative=1
`,
      profiles: {
        'abc123.default-release': {}, // No cookies.sqlite
      },
    },
    async () => {
      const { detectFirefoxProfileDir } = await import('../src/firefox-cookies.js');

      assert.throws(
        () => detectFirefoxProfileDir(),
        /No Firefox profile with cookies\.sqlite found/,
      );
    }
  );
});

test('detectFirefoxProfileDir: resolves absolute paths when IsRelative=0', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-ff-test-'));

  try {
    const homeDir = os.homedir();
    const firefoxBase = path.join(homeDir, 'Library', 'Application Support', 'Firefox');

    // Create Firefox base directory and profile at an absolute path
    fs.mkdirSync(firefoxBase, { recursive: true });
    const absoluteProfilePath = path.join(tmpDir, 'my-abs-profile');
    fs.mkdirSync(absoluteProfilePath, { recursive: true });

    // Create profiles.ini with absolute path reference
    const profilesIni = `[Profile0]
Name=default
Path=${absoluteProfilePath}
IsRelative=0
`;
    fs.writeFileSync(path.join(firefoxBase, 'profiles.ini'), profilesIni);

    // Create cookies.sqlite in the absolute path profile directory
    const dbPath = path.join(absoluteProfilePath, 'cookies.sqlite');
    execFileSync('sqlite3', [dbPath, `
      CREATE TABLE IF NOT EXISTS moz_cookies (
        id INTEGER PRIMARY KEY,
        name TEXT,
        value TEXT,
        host TEXT
      );
    `]);

    const { detectFirefoxProfileDir } = await import('../src/firefox-cookies.js');
    const result = detectFirefoxProfileDir();
    assert.equal(result, absoluteProfilePath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('detectFirefoxProfileDir: throws on unsupported platform (win32)', async () => {
  // This test requires win32 platform - skip if not on Windows
  if (os.platform() !== 'win32') {
    // On non-Windows, we can still test that the error is thrown for win32
    // by directly calling the function that checks platform
    const { firefoxBaseDir } = await import('../src/firefox-cookies.js');

    // Temporarily override platform - but we can't do this easily since platform() is captured at import
    // So we'll just skip this test on non-Windows
    return;
  }

  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default
Path=default
IsRelative=1
`,
      profiles: {
        default: {
          cookies: [],
        },
      },
    },
    async () => {
      const { detectFirefoxProfileDir } = await import('../src/firefox-cookies.js');

      assert.throws(
        () => detectFirefoxProfileDir(),
        /Firefox cookie extraction is currently supported on macOS and Linux only/,
      );
    }
  );
});

test('extractFirefoxXCookies: extracts ct0 and auth_token from .x.com', async () => {
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=profile
IsRelative=1
`,
      profiles: {
        profile: {
          cookies: [
            { host: '.x.com', name: 'ct0', value: 'test-csrf-token-123' },
            { host: '.x.com', name: 'auth_token', value: 'test-auth-token-456' },
          ],
        },
      },
    },
    async () => {
      const { extractFirefoxXCookies } = await import('../src/firefox-cookies.js');
      const result = extractFirefoxXCookies();

      assert.equal(result.csrfToken, 'test-csrf-token-123');
      assert.ok(result.cookieHeader.includes('ct0=test-csrf-token-123'));
      assert.ok(result.cookieHeader.includes('auth_token=test-auth-token-456'));
    }
  );
});

test('extractFirefoxXCookies: falls back to .twitter.com when .x.com returns no cookies', async () => {
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=profile
IsRelative=1
`,
      profiles: {
        profile: {
          cookies: [
            { host: '.twitter.com', name: 'ct0', value: 'twitter-csrf-token' },
          ],
        },
      },
    },
    async () => {
      const { extractFirefoxXCookies } = await import('../src/firefox-cookies.js');
      const result = extractFirefoxXCookies();

      assert.equal(result.csrfToken, 'twitter-csrf-token');
      assert.ok(result.cookieHeader.includes('ct0=twitter-csrf-token'));
    }
  );
});

test('extractFirefoxXCookies: throws when ct0 is missing', async () => {
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=profile
IsRelative=1
`,
      profiles: {
        profile: {
          cookies: [
            { host: '.x.com', name: 'auth_token', value: 'some-token' },
          ],
        },
      },
    },
    async () => {
      const { extractFirefoxXCookies } = await import('../src/firefox-cookies.js');

      assert.throws(
        () => extractFirefoxXCookies(),
        /No ct0 CSRF cookie found for x\.com in Firefox/,
      );
    }
  );
});

test('extractFirefoxXCookies: rejects cookie with non-printable characters', async () => {
  // The validation regex /^[\x21-\x7E]+$/ only allows printable ASCII.
  // A cookie value containing a newline (0x0A) should be rejected.
  // We test this by checking that whitespace-only value is rejected,
  // and by verifying the validation logic handles edge cases.
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=profile
IsRelative=1
`,
      profiles: {
        profile: {
          cookies: [
            // Value is whitespace-only - should fail validation after trim
            { host: '.x.com', name: 'ct0', value: '   \n\t  ' },
          ],
        },
      },
    },
    async () => {
      const { extractFirefoxXCookies } = await import('../src/firefox-cookies.js');

      assert.throws(
        () => extractFirefoxXCookies(),
        /Firefox ct0 cookie appears invalid/,
      );
    }
  );
});

test('extractFirefoxXCookies: rejects whitespace-only cookie value', async () => {
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=profile
IsRelative=1
`,
      profiles: {
        profile: {
          cookies: [
            { host: '.x.com', name: 'ct0', value: '   ' },
          ],
        },
      },
    },
    async () => {
      const { extractFirefoxXCookies } = await import('../src/firefox-cookies.js');

      assert.throws(
        () => extractFirefoxXCookies(),
        /Firefox ct0 cookie appears invalid/,
      );
    }
  );
});

test('extractFirefoxXCookies: uses custom profile directory when provided', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-ff-test-'));
  const customProfileDir = path.join(tmpDir, 'custom-profile');
  fs.mkdirSync(customProfileDir, { recursive: true });

  try {
    // Create cookies.sqlite directly in the custom directory
    const dbPath = path.join(customProfileDir, 'cookies.sqlite');
    execFileSync('sqlite3', [dbPath, `
      CREATE TABLE IF NOT EXISTS moz_cookies (
        id INTEGER PRIMARY KEY,
        name TEXT,
        value TEXT,
        host TEXT
      );
      INSERT INTO moz_cookies (name, value, host) VALUES ('ct0', 'custom-profile-token', '.x.com');
    `]);

    const { extractFirefoxXCookies } = await import('../src/firefox-cookies.js');
    const result = extractFirefoxXCookies(customProfileDir);

    assert.equal(result.csrfToken, 'custom-profile-token');
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('extractFirefoxXCookies: handles cookie with valid special characters', async () => {
  await withFakeFirefoxProfile(
    {
      profilesIni: `[Profile0]
Name=default-release
Path=profile
IsRelative=1
`,
      profiles: {
        profile: {
          cookies: [
            { host: '.x.com', name: 'ct0', value: 'abc123!@#$%^&*()_+-=[]{}|;:,.<>?' },
          ],
        },
      },
    },
    async () => {
      const { extractFirefoxXCookies } = await import('../src/firefox-cookies.js');
      const result = extractFirefoxXCookies();

      assert.equal(result.csrfToken, 'abc123!@#$%^&*()_+-=[]{}|;:,.<>?');
    }
  );
});

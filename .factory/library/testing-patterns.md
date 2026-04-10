# Testing Patterns

Common patterns and utilities for writing tests in this project.

## Test Framework

Uses Node built-in test runner (`node:test`). No external test framework (no Jest, Vitest, etc.).

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
```

## withIsolatedDataDir()

Shared test helper in `tests/helpers.ts`. Creates an isolated temp directory for `FT_DATA_DIR`.

```ts
import { withIsolatedDataDir } from './helpers.js';

test('my test', async () => {
  await withIsolatedDataDir(async (dir) => {
    // dir is the temp directory path
    // process.env.FT_DATA_DIR is already set to dir
    // ... test code ...
  });
  // temp dir is automatically cleaned up, FT_DATA_DIR restored
});
```

Key behaviors:
- Creates temp directory with `ft-isolated-` prefix in `os.tmpdir()`
- Sets `process.env.FT_DATA_DIR` to the temp dir
- Restores original `FT_DATA_DIR` value after callback (including on error)
- Cleans up temp directory in finally block (even on test failure)
- Supports both sync and async callbacks
- 3+ test files use the shared helper (bookmarks-db.test.ts, bookmarks-service.test.ts, helpers.test.ts)

## ESLint and Prettier

- ESLint uses flat config (`eslint.config.js`) with TypeScript-aware rules
- Prettier config in `.prettierrc` — run `npm run format:check` before committing
- Some rules are set to `warn` (not `error`): `no-unused-vars`, `no-explicit-any`
- The `lint` target only checks `src/`, not `tests/`

## TypeScript

- `npm run typecheck` runs `tsc --noEmit` with strict mode enabled
- All new code must pass both typecheck and lint

## Running Individual Tests

- Use `npx tsx --test tests/some-file.test.ts` (NOT `tsx --test` — tsx is not globally installed)
- `npm test` runs all tests via `tsx --test tests/**/*.test.ts`

## Testing Platform-Dependent Behavior

Tests that depend on `os.platform()` or `os.homedir()` currently use runtime conditionals like `if (platform() === 'darwin')`, which silently pass without assertions on non-matching OSes.

**Recommended approach:** Mock `os.platform()` and `os.homedir()` for deterministic cross-platform tests, so assertions run on all CI runners regardless of host OS:

```ts
import os from 'node:os';
test('browserUserDataDir on Linux', async (t) => {
  t.mock.method(os, 'platform', () => 'linux');
  t.mock.method(os, 'homedir', () => '/home/testuser');
  const result = browserUserDataDir('helium');
  assert.equal(result, '/home/testuser/.config/helium');
});
```

Alternative: use `assert.skip('macOS-only')` at the start so the skip is visible in test reports.

## Node 24+ Module Mocking Limitation

`test.mock.module()` (Node's built-in module mocking API) does NOT work reliably in Node 24+. If you need to mock `fetch` or other globals, use the `globalThis.fetch` override pattern instead:

```ts
test('my test', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({}))
  try {
    // ... test code ...
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

Alternatively, use `t.mock.method()` for method-level mocking on objects.

## writeJson Cannot Produce Corrupted JSON

The `writeJson()` function in `fs.ts` always serializes via `JSON.stringify()`, so it produces valid JSON output. If a test needs to write corrupted/malformed JSON (e.g., to test error handling), use `fs.writeFileSync()` directly instead:

```ts
// writeJson('not valid json {{{', path) would produce JSON string "\"not valid json {{{\"" — valid JSON!
// Use fs.writeFileSync for truly corrupted content:
fs.writeFileSync(path, '{"processedIds": [')
```

## Modules with Top-Level Captured References

Some modules capture `os.homedir()` or `os.platform()` at import time or in non-mockable ways. For these modules, `t.mock.method(os, 'homedir', ...)` does not work because the module already captured the original function reference. Affected modules:

- `firefox-cookies.ts` — `firefoxBaseDir()` calls `homedir()` at runtime but `detectFirefoxProfileDir` uses it internally
- `chrome-cookies.ts` — similar pattern with platform detection
- `browsers.ts` — `os.platform()` and `os.homedir()` used directly

**Workaround**: Create real files/directories at the expected OS paths (inside `withIsolatedDataDir()` or using temp directories at real paths). The `withFakeFirefoxProfile` pattern in `firefox-cookies.test.ts` is an example.

## Dynamic `import()` for Fresh Module State

In integration tests, modules may cache state (e.g., database connections, loaded config) across test boundaries. To get a fresh module instance within an isolated test, use dynamic `await import()`:

```ts
test('CROSS-004: OAuth + gap-fill state', async () => {
  await withIsolatedDataDir(async (dir) => {
    const { saveTwitterOAuthToken, loadTwitterOAuthToken } = await import('../dist/xauth.js');
    // Fresh module references within isolated data dir
  });
});
```

This ensures `dataDir()` resolves to the temp directory at module initialization time.

## Environment Variable Cleanup in Tests

Config tests manually manage env var cleanup (`delete process.env.XYZ` after each test). This is fragile — a throw before cleanup pollutes subsequent tests. Use save/restore in try/finally:

```ts
const saved = process.env.FT_BROWSER;
try {
  process.env.FT_BROWSER = 'helium';
  // ... test ...
} finally {
  if (saved === undefined) delete process.env.FT_BROWSER;
  else process.env.FT_BROWSER = saved;
}
```

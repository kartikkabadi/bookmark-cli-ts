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

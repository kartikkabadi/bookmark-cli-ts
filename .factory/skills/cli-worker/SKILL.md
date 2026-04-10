---
name: cli-worker
description: General-purpose worker for implementing features in the Field Theory CLI TypeScript project.
---

# CLI Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

All features in this mission. The Field Theory CLI is a single TypeScript CLI application with consistent patterns across sync, search, classify, and knowledge base modules.

## Required Skills

None. This is a terminal/CLI project — no browser testing or UI automation needed.

## Work Procedure

### 1. Read Context

Read these files before starting work:
- `mission.md` in the mission directory
- `AGENTS.md` in the mission directory
- `.factory/library/architecture.md`
- `.factory/library/environment.md`
- `src/types.ts` (for data model interfaces)
- The specific source file(s) you'll be modifying

### 2. Write Tests First (TDD — RED)

Write failing tests BEFORE implementation. This is mandatory.

- **Test framework:** Node built-in test runner (`import { describe, it } from 'node:test'`)
- **Test location:** `tests/<module-name>.test.ts`
- **Isolation:** Use `withIsolatedDataDir()` from `tests/helpers.ts` (created in Milestone 1). Before it exists, manually set `FT_DATA_DIR` to a temp directory and clean up in `finally`.
- **Mocking:** Use `import { mock } from 'node:test'` or manual stubs. No external test libraries.
- **Run tests:** `npm test` or `tsx --test tests/<specific>.test.ts`
- **Assert failing:** Verify tests fail with expected error before implementing.

### 3. Implement (GREEN)

- Follow existing code patterns in the codebase
- TypeScript strict mode — no `any` types unless absolutely necessary for untyped API responses
- Use atomic writes (tmp+rename) for file operations via patterns in `src/fs.ts`
- All new paths must go through `src/paths.ts` for `FT_DATA_DIR` support
- Error handling: throw descriptive errors in modules, let `safe()` wrapper handle CLI output
- No semicolons (follow existing code style)
- Keep backward compatibility — never change CLI command names, flags, or output format

### 4. Verify

Run ALL of these and fix any failures:

```bash
# Type check
npx tsc --noEmit

# Run specific test file
tsx --test tests/<your-test>.test.ts

# Run full test suite
npm test

# Build
npm run build
```

### 5. Manual Verification

For CLI-facing changes:
- Run the specific `ft` command you modified: `npx tsx src/cli.ts <command> [args]`
- Verify output looks correct
- Test edge cases (invalid input, empty data, etc.)

### 6. Commit

Stage and commit only files you created or modified. Use a descriptive commit message.

## Example Handoff

```json
{
  "salientSummary": "Added ESLint + Prettier config, created shared withIsolatedDataDir() helper in tests/helpers.ts, and added typecheck script to package.json. All 148 existing tests pass plus 3 new helper tests.",
  "whatWasImplemented": "ESLint flat config with TypeScript rules, Prettier config, npm scripts (lint, format:check, typecheck), shared test helper in tests/helpers.ts with withIsolatedDataDir() that creates temp dirs and cleans up, refactored 2 existing test files to use the shared helper.",
  "whatWasLeftUndone": "Prettier not yet run on existing codebase (only format:check added). Some existing test files still use manual temp dir management and could be migrated to the shared helper later.",
  "verification": {
    "commandsRun": [
      { "command": "npm run lint", "exitCode": 0, "observation": "No lint errors" },
      { "command": "npm run typecheck", "exitCode": 0, "observation": "No type errors" },
      { "command": "npm test", "exitCode": 0, "observation": "151 tests passing (148 original + 3 new)" },
      { "command": "npm run build", "exitCode": 0, "observation": "Clean build" }
    ],
    "interactiveChecks": [
      { "action": "npx tsx src/cli.ts --help", "observed": "Help text displays correctly with all 22+ commands" }
    ]
  },
  "tests": {
    "added": [
      { "file": "tests/helpers.test.ts", "cases": [
        { "name": "withIsolatedDataDir creates temp dir", "verifies": "Helper sets FT_DATA_DIR to temp dir" },
        { "name": "withIsolatedDataDir cleans up after test", "verifies": "Temp dir is removed in finally block" },
        { "name": "withIsolatedDataDir works with nested async operations", "verifies": "Isolation preserved across async boundaries" }
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature depends on a module or function that doesn't exist yet and is outside your feature's scope
- Requirements are ambiguous and you can't resolve them from AGENTS.md or the codebase
- Existing bugs block your feature and aren't part of your feature's scope
- You need to modify a module that another upcoming feature also needs to modify (coordination needed)

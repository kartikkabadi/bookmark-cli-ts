# User Testing

Testing surface, required testing skills/tools, and resource cost classification.

**What belongs here:** Validation surface details, testing tool requirements, resource constraints.
**What does NOT belong here:** Implementation details (use `architecture.md`). Service commands (use `services.yaml`).

---

## Validation Surface

This is a **CLI tool** — all testing is terminal-based.

### Primary Surface: Terminal (tuistory)
- All 22+ `ft` commands are tested via terminal I/O
- Input: command-line arguments and flags
- Output: stdout (data), stderr (progress, errors)
- Exit codes: 0 (success), 1 (error)

### Secondary Surface: Unit Tests (npm test)
- Node built-in test runner (`node:test`)
- 148+ tests, runs in ~650ms
- Tests are the primary automated validation mechanism

### No Browser Surface
- No web UI, no Electron app
- agent-browser is NOT needed for this project

## Required Testing Skills/Tools

| Tool | Surface | Usage |
|------|---------|-------|
| `tuistory` | Terminal | Launch and interact with `ft` commands, verify output |
| `npm test` | Unit tests | Run automated test suite |
| `curl` | N/A | Not needed (no HTTP API) |
| `agent-browser` | N/A | Not needed (no web UI) |

## Resource Cost Classification

### Terminal Surface (tuistory)
- Each tuistory instance: ~50MB RAM (lightweight CLI process)
- No shared infrastructure across instances
- Machine: 16GB RAM, 8 CPU cores, ~6GB used at baseline
- Usable headroom: 10GB * 0.7 = **7GB**
- Max concurrent tuistory validators: **5** (5 * 50MB = 250MB, well within budget)

### Unit Test Surface (npm test)
- Single test run: ~50MB RAM, ~650ms
- Sequential by default (no parallelization needed)
- Max concurrent: **1** (test runner is not designed for parallel execution)

## Testing Constraints

1. **No real browser cookies** — Must mock all cookie extraction for Helium/Chrome/Firefox tests
2. **No real X/Twitter API** — Must mock all network requests in tests
3. **No real LLM calls** — Must mock Claude/Codex engine for classification tests
4. **File-based isolation** — Each test must use a unique `FT_DATA_DIR` temp directory
5. **Cross-platform** — Tests must pass on macOS (primary), Linux, and Windows where applicable

## Validation Concurrency

### npm-test surface
- Max concurrent: **1** — test runner is not designed for parallel execution
- Each test run takes ~2 seconds, produces a single result set
- Multiple validators sharing npm test must run sequentially

### tuistory surface
- Max concurrent: **3** — each ft command invocation is lightweight (~50MB)
- No shared state between independent CLI invocations when using separate FT_DATA_DIR directories
- CLI commands must use isolated data directories (FT_DATA_DIR=tempdir)

### Isolation rules
- All CLI testing must use FT_DATA_DIR pointing to a temp directory
- Never use the default ~/.ft-bookmarks/ data directory for testing
- Each subagent gets its own temp directory for isolation
- Database and config files in temp dir are independent across subagents

## Flow Validator Guidance: npm-test

### What to test
- Verify test files exist with the required number and types of test cases
- Run `npm test` and check for pass/fail counts
- Run `npm run lint && npm run typecheck && npm test && npm run build` for pipeline validation
- Examine test file contents to verify coverage of required scenarios

### Isolation
- No isolation needed — tests are read-only and idempotent
- Can share a single `npm test` run for multiple assertions
- Do NOT modify test files or source code

### Evidence
- Capture `npm test` output showing test count and pass/fail
- Show specific test case names that verify each assertion
- Capture pipeline command output (lint, typecheck, test, build)

## Flow Validator Guidance: tuistory

### What to test
- CLI command registration and flag handling
- Error output and exit codes for invalid input
- Help output verification (`ft <command> --help`)
- Data flow through commands with seeded data

### Isolation
- Each subagent MUST set FT_DATA_DIR to a unique temp directory
- Never rely on or modify ~/.ft-bookmarks/
- Seed temp directory with test data before running commands
- Commands that require real network access (sync, auth) will fail gracefully — verify error handling, not success

### Seeding data
- Create a temp directory with `mktemp -d`
- Set `FT_DATA_DIR=<tempdir>` for all CLI commands
- Optionally seed with a `bookmarks.jsonl` file for search/list/classify commands

### Evidence
- TUI transcripts showing command output
- Exit codes for error cases
- Help output showing command structure

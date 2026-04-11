# Field Theory CLI — Agent Onboarding Guide

## Project Overview

Field Theory CLI is a standalone tool for syncing and querying X/Twitter bookmarks locally. Built with TypeScript, Commander.js, and SQLite FTS5 (via sql.js-fts5 WASM). All data stored in `~/.ft-bookmarks/`. No native bindings, pure JavaScript/WASM.

**Repository:** `kartikkabadi/fieldtheory-cli-helium`
**Node.js:** >=20 required

## Commands

```bash
pnpm install           # Install dependencies (or npm install / bun install)
pnpm run build         # Compile TypeScript to dist/
pnpm run dev           # Run via tsx directly
pnpm test              # Run tests (425 tests, Node built-in test runner)
pnpm run start         # Run compiled dist/cli.js
```

**Install globally:**
```bash
# Quick install (curl|bash)
curl -fsSL https://raw.githubusercontent.com/kartikkabadi/fieldtheory-cli-helium/main/install.sh | bash

# Or via package manager
pnpm install -g fieldtheory-helium
bun install -g fieldtheory-helium
npm install -g fieldtheory-helium
```

## Architecture

Single CLI application. Key source files (all 27 files in `src/`):

| File | Purpose |
|------|---------|
| `src/cli.ts` | Command definitions, progress bar, first-run UX |
| `src/graphql-bookmarks.ts` | GraphQL sync engine (Chrome/Firefox/Arc/Brave/Helium session cookies) |
| `src/bookmarks.ts` | OAuth API sync |
| `src/bookmarks-db.ts` | SQLite FTS5 index, search, list, stats |
| `src/bookmark-classify.ts` | Regex-based category classifier |
| `src/bookmark-classify-llm.ts` | LLM classifier (Claude/Codex CLI) |
| `src/bookmarks-viz.ts` | ANSI terminal dashboard |
| `src/bookmark-media.ts` | Media download with manifest |
| `src/chrome-cookies.ts` | macOS/Linux Keychain + Windows DPAPI cookie extraction |
| `src/firefox-cookies.ts` | Firefox cookie extraction |
| `src/browsers.ts` | Cross-platform browser registry (Chrome, Brave, Arc, Helium, Firefox) |
| `src/xauth.ts` | OAuth 2.0 flow |
| `src/db.ts` | WASM SQLite layer (sql.js-fts5) |
| `src/paths.ts` | Data directory resolution (`~/.ft-bookmarks/`) via FT_DATA_DIR |
| `src/config.ts` | Browser detection, env loading, CLI arg parsing |
| `src/types.ts` | TypeScript interfaces |
| `src/fs.ts` | JSONL/JSON file utilities, secure writes |
| `src/md.ts` | Markdown knowledge base export |
| `src/md-ask.ts` | Ask questions against knowledge base |
| `src/md-export.ts` | Bookmark-to-markdown exporter |
| `src/md-lint.ts` | Wiki health checker |
| `src/md-prompts.ts` | LLM prompt construction for knowledge base |
| `src/engine.ts` | LLM engine detection (claude/codex CLI) |
| `src/prompt.ts` | Interactive CLI prompt with spinner |
| `src/preferences.ts` | User preferences (model engine choice) |
| `src/skill.ts` | `/fieldtheory` skill installer for Claude Code/Codex |

### Data flow

```
Browser cookies -> GraphQL API -> JSONL cache -> SQLite FTS5 index
                                        |
                                 Regex/LLM classification
                                        |
                              Search / List / Viz / Wiki / Ask
```

## Key Patterns

- All data dirs resolved via `paths.ts` -> `dataDir()` which respects `FT_DATA_DIR` env var
- Tests use `withIsolatedDataDir()` helper that sets `FT_DATA_DIR` to temp dir
- SQLite operations use sql.js-fts5 (WASM, no native bindings)
- Commander.js for CLI (see `cli.ts` for all 20+ commands)
- No test framework — uses Node built-in test runner (`node:test`)
- Browser detection in `browsers.ts` — extensible registry pattern

## Testing

- 425 tests using Node built-in test runner
- Test isolation: tests set `FT_DATA_DIR` to temp dirs via `withIsolatedDataDir()`
- Run with: `pnpm test`
- Chrome cookie tests: mock-based (no real browser needed)
- DB tests: in-memory SQLite (no real data)

## Environment Variables

- `FT_DATA_DIR` — Override data directory (default: `~/.ft-bookmarks/`)
- `FT_BROWSER` — Browser preference: chrome|helium|brave|arc|firefox
- `FT_CHROME_USER_DATA_DIR` — Custom browser user-data directory
- `FT_CHROME_PROFILE_DIRECTORY` — Custom browser profile name
- `X_API_KEY`, `X_API_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET` — OAuth API credentials
- `X_CALLBACK_URL` — OAuth callback URL (default: `http://127.0.0.1:3000/callback`)

## Platform Support

- **macOS:** Full support (all browsers, Keychain cookie extraction)
- **Linux:** Firefox supported, Chrome/Brave/Arc via manual `--csrf-token`
- **Windows:** Firefox supported, DPAPI cookie extraction for Chrome

## Build Output

- `npm run build` -> `dist/` directory (ES2022, NodeNext modules)
- Entry point: `bin/ft.mjs` -> `dist/cli.js`
- Published as npm package `fieldtheory-helium`

## Data Directory Structure

```
~/.ft-bookmarks/
  bookmarks.jsonl         raw bookmark cache (one JSON per line)
  bookmarks.db            SQLite FTS5 search index
  bookmarks-meta.json     sync metadata
  oauth-token.json        OAuth token (chmod 600, owner-only)
  md/                     markdown knowledge base (ft wiki / ft md)
```

## Adding a New Command

1. Define the command in `src/cli.ts` using Commander.js
2. Implement logic in an existing or new module under `src/`
3. Add tests in `tests/` using `withIsolatedDataDir()` for isolation
4. Commands follow the pattern: `ft <verb>` or `ft <noun> <verb>`

## Adding a New Browser

1. Add browser detection in `src/browsers.ts` using the registry pattern
2. Implement cookie extraction in `src/<browser>-cookies.ts`
3. Register the cookie extractor in `src/graphql-bookmarks.ts`
4. Add tests with mocked cookie files

## Category Classification

The regex classifier in `src/bookmark-classify.ts` handles these categories:

| Category | Pattern |
|----------|---------|
| tool | GitHub repos, CLI tools, npm packages, open-source projects |
| security | CVEs, vulnerabilities, exploits, supply chain |
| technique | Tutorials, demos, code patterns, "how I built X" |
| launch | Product launches, announcements, "just shipped" |
| research | ArXiv papers, studies, academic findings |
| opinion | Takes, analysis, commentary, threads |
| commerce | Products, shopping, physical goods |

The LLM classifier in `src/bookmark-classify-llm.ts` catches what regex misses.

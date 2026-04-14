# CLAUDE.md

This is the Bookmark CLI TS — a standalone tool for syncing and querying X/Twitter bookmarks locally.

## Commands

```bash
pnpm run build        # Compile TypeScript to dist/
pnpm run dev          # Run via tsx directly
pnpm test             # Run tests
pnpm run start        # Run compiled dist/cli.js
```

## Architecture

Single CLI application built with Commander.js. All data stored in `~/.ft-bookmarks/`.

### Key files

| File | Purpose |
|------|---------|
| `src/cli.ts` | Command definitions, progress bar, first-run UX |
| `src/paths.ts` | Data directory resolution (`~/.ft-bookmarks/`) |
| `src/graphql-bookmarks.ts` | GraphQL sync engine (Chrome/Firefox/Arc/Brave/Helium session cookies) |
| `src/bookmarks.ts` | OAuth API sync |
| `src/bookmarks-db.ts` | SQLite FTS5 index, search, list, stats |
| `src/bookmark-classify.ts` | Regex-based category classifier |
| `src/bookmark-classify-llm.ts` | Optional LLM classifier |
| `src/bookmarks-viz.ts` | ANSI terminal dashboard |
| `src/chrome-cookies.ts` | Chrome cookie extraction (macOS Keychain) |
| `src/firefox-cookies.ts` | Firefox cookie extraction |
| `src/browsers.ts` | Cross-platform browser registry (Chrome, Brave, Arc, Helium, Firefox) |
| `src/bookmark-media.ts` | Media download with manifest |
| `src/sync-command.ts` | Sync command handler (extracted from cli.ts) |
| `src/bookmarks-service.ts` | Service layer (status, orchestration) |
| `src/xauth.ts` | OAuth 2.0 flow |
| `src/db.ts` | WASM SQLite layer (sql.js-fts5) |

### Data flow

```
Chrome cookies → GraphQL API → JSONL cache → SQLite FTS5 index
                                    ↓
                           Regex classification
                                    ↓
                         Search / List / Viz
```

### Dependencies

All pure JavaScript/WASM — no native bindings:
- `commander` — CLI framework
- `sql.js` + `sql.js-fts5` — SQLite in WebAssembly
- `zod` — schema validation
- `dotenv` — .env file loading

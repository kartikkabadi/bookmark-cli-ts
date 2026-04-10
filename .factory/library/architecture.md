# Architecture

How the Field Theory CLI works — components, relationships, data flows, invariants.

## What belongs here

High-level architectural knowledge: components, how they relate, data flows, invariants.
Keep it high-level — avoid enumerating implementation details.

---

## System Overview

Single-process CLI application. No server, no daemon. User invokes `ft <command>`, it runs synchronously, writes to local filesystem, and exits.

## Component Map

```
┌─────────────────────────────────────────────────────────┐
│  cli.ts (Commander.js)                                  │
│  22+ commands, progress UI, error handling              │
├──────────┬──────────┬──────────────┬────────────────────┤
│ Sync     │ Data     │ Classify     │ Knowledge Base     │
│ Layer    │ Layer    │ Layer        │ Layer              │
│          │          │              │                    │
│ graphql- │ bookmarks│ bookmark-    │ md.ts              │
│ bookmarks│ -db.ts   │ classify.ts  │ md-ask.ts          │
│ .ts      │ db.ts     │ bookmark-    │ md-export.ts       │
│ bookmarks│ fs.ts    │ classify-    │ md-lint.ts         │
│ .ts      │ paths.ts  │ llm.ts      │ md-prompts.ts      │
│ xauth.ts │          │              │                    │
│ chrome-  │          │ engine.ts    │                    │
│ cookies  │          │ preferences  │                    │
│ .ts      │          │ .ts          │                    │
│ firefox- │          │              │                    │
│ cookies  │          │              │                    │
│ .ts      │          │              │                    │
│ browsers │          │              │                    │
│ .ts      │          │              │                    │
│ config.ts│          │              │                    │
├──────────┴──────────┴──────────────┴────────────────────┤
│  bookmark-media.ts  (media download, shared by all)      │
│  skill.ts           (agent integration, standalone)       │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. Sync:
   Browser cookies → GraphQL/OAuth API → JSONL cache (append-only)
   JSONL cache → SQLite FTS5 index (rebuild or incremental)

2. Query:
   User query → FTS5 MATCH → ranked results → formatted output

3. Classify:
   Bookmarks → Regex classifier → category labels (in SQLite)
   Bookmarks → LLM classifier → category + domain labels (in SQLite)

4. Knowledge Base:
   Bookmarks → md-export → individual markdown files → wiki compilation
   Question + wiki pages → LLM prompt → answer

5. Media:
   Bookmarks with media URLs → fetch → local files + manifest
```

## Key Invariants

- **JSONL is the source of truth** — SQLite index is derived and can be rebuilt
- **Atomic writes** — All file writes use tmp+rename pattern (from `fs.ts`)
- **Cookie security** — Browser cookies are extracted, used for sync, never persisted to disk
- **OAuth tokens** stored with mode 0600 (owner-only)
- **Dedup by ID** — Merge uses `Map<id, record>` with score-based conflict resolution
- **`FT_DATA_DIR` controls all paths** — Every path function goes through `paths.ts`

## Helium-Specific Architecture

Helium is a Chromium-based browser. Cookie extraction uses the same chromium-backend as Chrome/Brave/Arc:
- Same cookie DB format (SQLite with encrypted values)
- Same decryption (PBKDF2 from Keychain key, AES-128-CBC)
- Different keychain entry name (needs verification)
- Different data directory path (`net.imput.helium`)

## Module Size Reference

| Module | Lines | Complexity |
|--------|-------|------------|
| cli.ts | 1,211 | High (22+ commands, sync mega-handler) |
| bookmarks-db.ts | 934 | High (FTS5 schema, 20+ query functions) |
| graphql-bookmarks.ts | ~800 | High (sync loop, gap-fill, auto-continue) |
| bookmarks-viz.ts | ~800 | Medium (terminal UI rendering) |
| chrome-cookies.ts | ~550 | High (3 OS paths, decryption) |
| bookmark-classify-llm.ts | ~300 | Medium (LLM integration) |
| bookmark-media.ts | ~220 | Medium (batch download) |
| bookmark-classify.ts | ~280 | Low (regex patterns) |

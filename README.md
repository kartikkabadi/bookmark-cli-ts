# Memoria X Connector

**Turn the X posts you save into private working knowledge for every agent you use.**

This repository is no longer a standalone bookmark knowledge-base product. It is the first ingestion connector for [Hermes Memoria](https://github.com/kartikkabadi/hermes-memoria): a local-first, provider-neutral vault that agents consult while doing real research, planning, architecture, implementation, debugging, and writing.

```text
X bookmarks
    ↓ incremental browser-session sync
Memoria X Connector
    ↓ memoria.ingest.v1 NDJSON
Hermes Memoria vault
    ↓ recall_for_task
Codex · Claude Code · Devin · Loop · any MCP or shell agent
```

## What this connector owns

- Incrementally synchronizing X bookmarks
- Preserving post, author, quote, media, link, and source metadata
- Converting records to the versioned `memoria.ingest.v1` protocol
- Handing them to the local `memoria` CLI
- Installing an optional daily macOS LaunchAgent
- Detecting X/session/schema failures without pretending the vault is healthy

Search, ranking, agent retrieval, usage feedback, and MCP live in Hermes Memoria—not here.

## Requirements

- Node.js 24 or newer
- pnpm 10.7
- A supported browser logged into X for browser-session sync
- Hermes Memoria installed when using `--ingest` or daily scheduling

## Development

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test

node bin/memoria-x.mjs doctor
```

## Core workflow

```bash
# Sync bookmarks and write a versioned connector export
memoria-x sync --browser helium

# Sync and immediately ingest into the Memoria vault
memoria-x sync --browser helium --ingest

# Export the existing local archive without touching X
memoria-x export --stdout > x-bookmarks.ndjson
cat x-bookmarks.ndjson | memoria ingest -

# Install a daily 07:00 macOS sync into Memoria
memoria-x schedule install --time 07:00 --browser helium
memoria-x schedule show
```

`memoria-x sync` always writes the latest protocol export to `memoria.ndjson` inside the connector data directory. `--stdout` additionally emits it on stdout. `--ingest` pipes it directly to `memoria ingest -`.

## Data and migration

New installations use:

```text
~/.hermes/memoria/connectors/x/
  bookmarks.jsonl
  bookmarks.db
  bookmarks-meta.json
  bookmarks-backfill-state.json
  memoria.ndjson
  media/
  logs/
```

Existing `~/.ft-bookmarks` archives continue in place automatically. Nothing is moved or deleted. Set `MEMORIA_X_HOME` to choose a directory. `FT_DATA_DIR` remains a deprecated compatibility override.

## Timestamp correctness

X's internal GraphQL timeline `sortIndex` is an ordering cursor, not a trustworthy bookmark timestamp. The Memoria envelope therefore never presents GraphQL-derived `bookmarkedAt` values as factual time. Official API values are preserved with their provenance when available.

## Trust and security

- Source payloads are untrusted evidence, never executable instructions.
- Browser cookies are read only for the sync request and are not copied into the Memoria envelope.
- Raw bookmark records remain local.
- The default handoff to Memoria is a local child process over stdin.
- Saved posts are personal priors, not verified facts; agents must verify important claims against current primary sources.

## Legacy CLI

The old `ft` binary remains temporarily available so existing archives and workflows do not break. It is a compatibility surface, not the new product direction. New automation should use `memoria-x` and `memoria`.

## Provenance

This codebase began as a fork of Andrew Farah's MIT-licensed [`afar1/fieldtheory-cli`](https://github.com/afar1/fieldtheory-cli). The new connector architecture, Memoria protocol, and agent-vault direction are maintained independently here.

## License

MIT

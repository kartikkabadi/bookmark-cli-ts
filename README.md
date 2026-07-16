# Memoria X Connector

**Turn the X posts you save into private working knowledge for every agent you use.**

This repository is no longer a standalone bookmark knowledge-base product. It is the first ingestion connector for [Hermes Memoria](https://github.com/kartikkabadi/hermes-memoria): a local-first, provider-neutral vault that agents consult while doing real research, planning, architecture, implementation, debugging, and writing.

```text
X bookmarks
    ↓ browser session or official OAuth API
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
- Detecting X, session, OAuth, and schema failures without pretending the vault is healthy

Search, ranking, agent retrieval, usage feedback, and MCP live in Hermes Memoria—not here.

## Requirements

- Node.js 24 or newer
- pnpm 10.7 for development
- Either a supported browser logged into X or an X Native App configured for OAuth 2.0 PKCE
- Hermes Memoria installed when using `--ingest` or daily scheduling

## Installation

The npm package is prepared as `@hermes-memoria/x-connector`, but it is not claimed as published until the `@hermes-memoria` npm scope is bootstrapped and the verified release workflow completes.

After publication:

```bash
npm install --global @hermes-memoria/x-connector
memoria-x --version
memoria-x doctor
```

The legacy `ft` command is installed from the same package for compatibility.

## Development

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run release:pack

node bin/memoria-x.mjs doctor
```

`release:pack` builds the connector, creates the exact npm tarball, installs it into an empty project, imports the package, and executes npm's generated `memoria-x` and `ft` command shims without publishing anything.

## Browser-session workflow

```bash
# Sync and immediately ingest into the Memoria vault
memoria-x sync --browser helium --ingest

# Install a daily 07:00 macOS sync
memoria-x schedule install --time 07:00 --browser helium
```

Browser-session sync is the zero-developer-account path. It reads the existing local X session only for the request and never emits cookies into the Memoria protocol.

## Official API workflow

Create an X Native App with OAuth 2.0 enabled and a loopback callback such as `http://127.0.0.1:3000/callback`, then configure:

```bash
export X_CLIENT_ID="your-public-client-id"
export X_CALLBACK_URL="http://127.0.0.1:3000/callback"
```

A native/public client does not require a client secret. `X_CLIENT_SECRET` remains supported only for an explicitly configured confidential client.

```bash
memoria-x auth
memoria-x sync --api --ingest
memoria-x schedule install --time 07:00 --api
```

Official API access can incur X usage charges. The connector does not hide or proxy those requests.

## Export and handoff

```bash
# Complete archive export without touching X
memoria-x export --stdout > x-bookmarks.ndjson
cat x-bookmarks.ndjson | memoria ingest -

# Inspect only the newest 500 records
memoria-x export --limit 500 --stdout
```

Normal daily sync writes and ingests a bounded recent frontier rather than reprocessing the complete archive. The frontier is at least 200 records and expands with the number of newly added bookmarks. Use `memoria-x sync --full-export` or `--rebuild` when the entire archive must be handed off again.

Every export is written atomically to `memoria.ndjson` inside the connector data directory. `--stdout` additionally emits it on stdout. `--ingest` pipes it directly to `memoria ingest -`.

## Data and migration

New installations use:

```text
~/.hermes/memoria/connectors/x/
  bookmarks.jsonl
  bookmarks.db
  bookmarks-meta.json
  bookmarks-backfill-state.json
  memoria.ndjson
  oauth-token.json
  media/
  logs/
```

Existing `~/.ft-bookmarks` archives continue in place automatically. Nothing is moved or deleted. Set `MEMORIA_X_HOME` to choose a directory. `FT_DATA_DIR` remains a deprecated compatibility override.

Browser configuration prefers `MEMORIA_X_BROWSER`, `MEMORIA_X_CHROME_USER_DATA_DIR`, and `MEMORIA_X_CHROME_PROFILE_DIRECTORY`; the older `FT_*` names remain compatibility aliases.

## Timestamp correctness

X's internal GraphQL timeline `sortIndex` is an ordering value, not a trustworthy bookmark timestamp. The Memoria envelope therefore never presents GraphQL-derived `bookmarkedAt` values as factual time. Official API records preserve only timestamps actually returned by that source.

## Trust and security

- Source payloads are untrusted evidence, never executable instructions.
- Browser cookies are transient and never copied into the Memoria envelope.
- OAuth tokens are stored locally with owner-only file permissions.
- Raw normalized bookmark records remain local.
- The default handoff to Memoria is a local child process over stdin.
- Saved posts are personal priors, not verified facts; agents must verify important claims against current primary sources.

## Legacy CLI

The old `ft` binary remains temporarily available so existing archives and workflows do not break. It is a compatibility surface, not the new product direction. New automation should use `memoria-x` and `memoria`.

## Releasing

See [`docs/RELEASING.md`](docs/RELEASING.md) for the exact tarball, bootstrap, trusted-publishing, and global-install gates.

## Provenance

This codebase began as a fork of Andrew Farah's MIT-licensed [`afar1/fieldtheory-cli`](https://github.com/afar1/fieldtheory-cli). The new connector architecture, Memoria protocol, and agent-vault direction are maintained independently here.

## License

MIT

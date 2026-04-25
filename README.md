# Bookmark CLI TS

Sync and store your X/Twitter bookmarks locally. Search, classify, visualize, and expose them to Claude Code, Codex, or any agent with shell access.

Free and open source. Helium-first. Designed for macOS with Helium browser. Also supports Chrome, Firefox, Brave, Arc, and OAuth API sync.

## Install

**Quick install:**

```bash
curl -fsSL https://raw.githubusercontent.com/kartikkabadi/bookmark-cli-ts/main/install.sh | bash
```

The installer uses GitHub release assets when available and falls back to a source build if a release asset is missing. It installs `ft` into `~/.local/bin` by default. Override with `INSTALL_DIR=/path/to/bin` if needed.

Requires Node.js 20+. Helium is recommended for session sync; other browsers are supported; OAuth is available for cross-platform API sync.

## Quick start

```bash
# 1. Sync your bookmarks. Helium must be logged into X.
ft sync --browser helium

# 2. Search them.
ft search "distributed systems"

# 3. Explore.
ft viz
ft categories
ft stats
```

On first run, `ft sync` extracts your X session from your browser and downloads your bookmarks into `~/.ft-bookmarks/`. Use `ft sync --browser helium` to sync with Helium, or `ft sync --browser firefox` for Firefox.

## Commands

### Sync

| Command | Description |
|---------|-------------|
| `ft sync` | Download and sync bookmarks with browser-session GraphQL |
| `ft sync --browser helium` | Sync with Helium browser explicitly |
| `ft sync --rebuild` | Full history crawl, not just incremental sync |
| `ft sync --gaps` | Backfill missing quoted tweets and expand truncated articles |
| `ft sync --continue` | Resume a previous sync that was interrupted or hit the page limit |
| `ft sync --yes` | Skip confirmation prompts |
| `ft sync --classify` | Sync then classify new bookmarks with LLM |
| `ft sync --api` | Sync via OAuth API |
| `ft auth` | Set up OAuth for API-based sync |

### Search and browse

| Command | Description |
|---------|-------------|
| `ft search <query>` | Full-text search with BM25 ranking |
| `ft list` | Filter by author, date, category, domain |
| `ft show <id>` | Show one bookmark in detail |
| `ft sample <category>` | Random sample from a category |
| `ft stats` | Top authors, languages, date range |
| `ft viz` | Terminal dashboard with sparklines, categories, and domains |
| `ft categories` | Show category distribution |
| `ft domains` | Subject-domain distribution |

### Classification

| Command | Description |
|---------|-------------|
| `ft classify` | Classify by category and domain using Claude/Codex CLI |
| `ft classify --regex` | Classify by category using simple regex |
| `ft classify-domains` | Classify by subject domain only with LLM |
| `ft model` | View or change the default LLM engine |

### Knowledge base

| Command | Description |
|---------|-------------|
| `ft md` | Export bookmarks as individual markdown files |
| `ft wiki` | Compile a Karpathy-style interlinked knowledge base |
| `ft ask <question>` | Ask questions against the knowledge base |
| `ft ask <question> --save` | Ask and save the answer as a concept page |
| `ft lint` | Health-check the wiki for broken links and missing pages |
| `ft lint --fix` | Auto-fix fixable wiki issues |

### Agent integration

| Command | Description |
|---------|-------------|
| `ft skill install` | Install `/bookmark-cli` skill for Claude Code and Codex |
| `ft skill show` | Print skill content to stdout |
| `ft skill uninstall` | Remove installed skill files |

### Utilities

| Command | Description |
|---------|-------------|
| `ft index` | Rebuild search index from JSONL cache and preserve classifications |
| `ft fetch-media` | Download media assets, static images only |
| `ft status` | Show sync status and data location |
| `ft path` | Print data directory path |

## Agent integration

Install the `/bookmark-cli` skill so your agent automatically searches your bookmarks when relevant:

```bash
ft skill install
```

Then ask your agent:

> "What have I bookmarked about cancer research in the last three years and how has it progressed?"

> "I bookmarked a number of new open source AI memory tools. Pick the best one and figure out how to incorporate it in this repo."

> "Every day please sync any new X bookmarks using the Bookmark CLI."

Works with Claude Code, Codex, or any agent with shell access.

## Scheduling

```bash
# Sync every morning at 7am
0 7 * * * ft sync --browser helium

# Sync and classify every morning
0 7 * * * ft sync --browser helium --classify
```

## Data

All data is stored locally at `~/.ft-bookmarks/`:

```text
~/.ft-bookmarks/
  bookmarks.jsonl         # raw bookmark cache, one JSON record per line
  bookmarks.db            # SQLite FTS5 search index
  bookmarks-meta.json     # sync metadata
  oauth-token.json        # OAuth token, if using API mode; chmod 600
  md/                     # markdown knowledge base from ft wiki / ft md
```

Override the location with `FT_DATA_DIR`:

```bash
export FT_DATA_DIR=/path/to/custom/dir
```

To remove all data:

```bash
rm -rf ~/.ft-bookmarks
```

## Categories

| Category | What it catches |
|----------|----------------|
| **tool** | GitHub repos, CLI tools, open-source projects |
| **security** | CVEs, vulnerabilities, exploits, supply chain |
| **technique** | Tutorials, demos, code patterns, "how I built X" |
| **launch** | Product launches, announcements, "just shipped" |
| **research** | ArXiv papers, studies, academic findings |
| **opinion** | Takes, analysis, commentary, threads |
| **commerce** | Products, shopping, physical goods |

Use `ft classify` for LLM-powered classification that catches what regex misses.

## Platform support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Session sync (`ft sync`) | Helium, Chrome, Brave, Arc, Firefox | Firefox; Chrome-family with manual cookies | Firefox |
| OAuth API sync (`ft sync --api`) | Yes | Yes | Yes |
| Search, list, classify, viz, wiki | Yes | Yes | Yes |

Session sync extracts cookies from your browser's local database. Use `ft sync --browser <name>` to pick a browser. On platforms where session sync is unavailable or unreliable, use `ft auth` and `ft sync --api`.

## Smoke test

After installing from source or a release, run:

```bash
ft --help
ft path
FT_DATA_DIR="$(mktemp -d)" ft status || true
ft sync --browser helium --max-pages 1 --target-adds 5
ft index
ft search "ai" --limit 5
ft classify --regex
ft categories
ft skill show >/tmp/bookmark-cli-skill.md
```

For a complete checklist, see [`docs/SMOKE_TEST.md`](docs/SMOKE_TEST.md).

## Security

**Your data stays local.** No telemetry, no analytics, nothing phoned home. The CLI only makes network requests to X during sync and optional media/gap-fill operations.

**Helium session sync** reads cookies from Helium's local database, uses them for the sync request, and discards them. Cookies are never stored separately.

**OAuth tokens** are stored with `chmod 600` where supported. Treat `~/.ft-bookmarks/oauth-token.json` like a password.

**The default sync uses X's internal GraphQL API**, the same API that x.com uses in your browser. For the official v2 API, use `ft auth` and `ft sync --api`.

## Repository

https://github.com/kartikkabadi/bookmark-cli-ts

## License

MIT — https://github.com/kartikkabadi/bookmark-cli-ts

# Bookmark CLI TS Smoke Test

Use this checklist after a fresh install, release build, or substantial sync/indexing change.

## 1. Environment

```bash
node --version          # must be v20+
ft --help
ft path
```

Expected result:

- `ft --help` prints the command list.
- `ft path` prints the active data directory, usually `~/.ft-bookmarks`.

## 2. Isolated no-data behavior

```bash
export FT_DATA_DIR="$(mktemp -d)"
ft status || true
ft search "ai" || true
```

Expected result:

- Commands should fail gracefully with user-facing setup guidance.
- No stack traces should be printed.

Unset the temporary data dir before testing real sync:

```bash
unset FT_DATA_DIR
```

## 3. Browser sync smoke test

Make sure Helium or the selected browser is open and logged into `x.com`.

```bash
ft sync --browser helium --max-pages 1 --target-adds 5
ft status
ft index
```

Expected result:

- Sync reports added bookmarks or a clear authentication/browser error.
- `ft status` prints bookmark count and cache location.
- `ft index` builds `bookmarks.db`.

## 4. Search and browse

```bash
ft search "ai" --limit 5
ft list --limit 5
ft stats
ft viz
```

Expected result:

- Search/list either return matching bookmarks or a clean empty state.
- `ft stats` and `ft viz` render without crashing.

## 5. Classification

```bash
ft classify --regex
ft categories
```

Expected result:

- Regex classification completes without needing external LLM tools.
- `ft categories` shows category counts or a clean empty state.

Optional LLM classification test:

```bash
ft model
ft classify
ft classify-domains
```

Expected result:

- If Claude/Codex CLI is installed and logged in, classification runs in batches.
- If no supported LLM CLI is available, the command explains what to install.

## 6. Markdown/wiki features

```bash
ft md
ft wiki
ft lint
ft ask "What topics do my bookmarks cover?" || true
```

Expected result:

- `ft md`, `ft wiki`, and `ft lint` complete or fail with actionable messages.
- `ft ask` requires an LLM engine and should explain missing engine state clearly.

## 7. Agent skill

```bash
ft skill show >/tmp/bookmark-cli-skill.md
ft skill install
```

Expected result:

- `ft skill show` writes valid skill content.
- `ft skill install` installs or updates the skill for detected agents.

## 8. Installer smoke test

From a clean shell:

```bash
curl -fsSL https://raw.githubusercontent.com/kartikkabadi/bookmark-cli-ts/main/install.sh | bash
command -v ft
ft --help
```

Expected result:

- Installer uses a release asset when available.
- If no release asset exists, installer falls back to source build.
- `ft` is installed into `~/.local/bin` by default.

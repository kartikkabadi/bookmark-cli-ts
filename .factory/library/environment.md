# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external dependencies, setup notes, platform-specific concerns.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Software

- **Node.js >=20** (tested with 20.x)
- **npm** (comes with Node)
- No other runtime dependencies

## Build Dependencies

- TypeScript 6.x
- tsx (for running tests and dev mode)
- All other deps are runtime (commander, dotenv, sql.js, sql.js-fts5)

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `FT_DATA_DIR` | Override data directory | No (default: `~/.ft-bookmarks/`) |
| `FT_BROWSER` | Browser for cookie extraction | No (auto-detected) |
| `FT_CHROME_USER_DATA_DIR` | Custom browser data dir | No |
| `FT_CHROME_PROFILE_DIRECTORY` | Custom browser profile | No (default: "Default") |
| `FT_FIREFOX_PROFILE_DIR` | Custom Firefox profile dir | No |
| `X_API_KEY` | OAuth API key | Only for `ft sync --api` |
| `X_API_SECRET` | OAuth API secret | Only for `ft sync --api` |
| `X_CLIENT_ID` | OAuth client ID | Only for `ft sync --api` |
| `X_CLIENT_SECRET` | OAuth client secret | Only for `ft sync --api` |
| `X_CALLBACK_URL` | OAuth callback URL | No (default: `http://127.0.0.1:3000/callback`) |

## Platform Notes

- **macOS**: Full support. Keychain required for Chromium cookie decryption.
- **Linux**: Firefox fully supported. Chromium browsers need `secret-tool` (GNOME keyring) or manual `--csrf-token`.
- **Windows**: Firefox supported. Chrome/Brave/Helium need DPAPI (PowerShell).

## Test Environment

- Tests use `FT_DATA_DIR` pointing to temp directories
- All external interactions (network, browser) are mocked
- SQLite is in-memory (WASM sql.js-fts5)
- No real browser, API keys, or network access needed for tests

## No External Services

This is a CLI tool. No databases, caches, or servers to start.

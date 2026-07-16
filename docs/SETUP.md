# Transactional first-run setup

`memoria-x setup` turns a source connector checkout or installed package into a working local agent-knowledge loop.

```bash
memoria-x setup --browser helium
```

On macOS, the default flow:

1. verifies Hermes Memoria 0.2.0 or newer;
2. inspects Codex and Claude Code without changing either host;
3. initializes the local Memoria vault;
4. performs the first X bookmark sync and ingests the resulting `memoria.ingest.v1` records;
5. configures every supported agent host that is installed and not already healthy;
6. preserves an existing daily schedule or installs a 07:00 LaunchAgent; and
7. verifies the vault, configured hosts, and schedule before returning a JSON receipt.

The setup command never deletes synced knowledge during rollback. If a later host or schedule step fails, it removes only host registrations and schedules that this setup run created.

## Inspect before changing state

```bash
memoria-x setup --browser helium --dry-run
```

Dry-run verifies the Memoria version, reads host state, validates each planned native host installation through `memoria host install --dry-run`, and reports the schedule plan. It does not initialize the vault, contact X, ingest records, edit host files, or install a schedule.

## Choose a source

Browser session:

```bash
memoria-x setup --browser helium
```

Official X API:

```bash
export X_CLIENT_ID="your-native-app-client-id"
export X_CALLBACK_URL="http://127.0.0.1:3000/callback"
memoria-x auth
memoria-x setup --api
```

The same browser profile and fallback options accepted by `memoria-x sync` are accepted by setup. Browser-session options cannot be combined with `--api`.

## Host selection

Without `--host`, setup inspects Codex and Claude Code, skips whichever is unavailable, and requires at least one supported host. Existing healthy registrations are preserved.

```bash
memoria-x setup --browser helium --host codex
memoria-x setup --browser helium --host codex claude
```

An explicitly requested unavailable host is a preflight error, so no vault, sync, host, or schedule mutation occurs.

For a connector-only machine or an unsupported agent host:

```bash
memoria-x setup --browser helium --skip-hosts
```

## Scheduling and partial setup

```bash
# Different local run time
memoria-x setup --browser helium --daily 06:30

# Keep the first sync and host configuration, but do not install LaunchAgent state
memoria-x setup --browser helium --no-schedule

# Initialize and configure without contacting X
memoria-x setup --browser helium --no-sync
```

Automatic daily scheduling currently supports macOS. Other platforms receive a truthful `skipped` schedule receipt rather than a false success claim.

## Custom Memoria executable

```bash
memoria-x setup \
  --browser helium \
  --memoria-command /absolute/path/to/memoria
```

The same command is used to initialize and verify the vault and is recorded in Codex or Claude's MCP registration.

## Receipt

Successful setup prints a versioned JSON receipt containing:

- Memoria command and version;
- first-sync source and status;
- per-host before/after state and action;
- schedule status and path;
- ordered completed operations; and
- rollback status.

A failed transactional run writes the partial receipt to stderr and exits non-zero. The receipt distinguishes retained synced data from setup-created host or scheduling state that was rolled back.

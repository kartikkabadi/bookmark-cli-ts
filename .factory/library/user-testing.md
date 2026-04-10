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

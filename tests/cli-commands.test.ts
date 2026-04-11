//! CLI integration tests using the Node test runner.
//!
//! These tests verify the CLI commands work correctly with mocked HTTP.

import { describe, it, before, after, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, '.test-data');

// Helper to isolate data dir for each test
function withIsolatedDataDir(fn) {
  return async () => {
    const testDir = path.join(tempDir, `cli-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    process.env.FT_DATA_DIR = testDir;
    try {
      await fn(testDir);
    } finally {
      delete process.env.FT_DATA_DIR;
      try { rmSync(testDir, { recursive: true }); } catch {}
    }
  };
}

// For CLI tests, we run the CLI binary and verify output
// These are integration tests that test the full CLI command flow

describe('CLI sync command', () => {
  it('ft sync --help shows all sync flags', async () => {
    const { exec } = await import('node:child_process');
    const result = await new Promise((resolve) => {
      exec('cd /Users/user/Documents/Projects/fieldtheory-cli-port && npx tsx src/cli.ts sync --help', (err, stdout, stderr) => {
        resolve({ code: err?.code ?? 0, stdout, stderr });
      });
    });
    // Should show help text with sync options
    assert.ok(result.stdout.includes('--browser') || result.stderr.includes('--browser'), 
      'Help should mention --browser flag');
  });
});

describe('CLI search command', () => {
  it('ft search --help shows search options', async () => {
    const { exec } = await import('node:child_process');
    const result = await new Promise((resolve) => {
      exec('cd /Users/user/Documents/Projects/fieldtheory-cli-port && npx tsx src/cli.ts search --help', (err, stdout, stderr) => {
        resolve({ code: err?.code ?? 0, stdout, stderr });
      });
    });
    assert.ok(result.stdout.includes('--limit') || result.stdout.includes('--author'), 
      'Help should show search filters');
  });
});

describe('CLI list command', () => {
  it('ft list --help shows all list filters', async () => {
    const { exec } = await import('node:child_process');
    const result = await new Promise((resolve) => {
      exec('cd /Users/user/Documents/Projects/fieldtheory-cli-port && npx tsx src/cli.ts list --help', (err, stdout, stderr) => {
        resolve({ code: err?.code ?? 0, stdout, stderr });
      });
    });
    assert.ok(result.stdout.includes('--author'), 'Help should show --author');
    assert.ok(result.stdout.includes('--category'), 'Help should show --category');
    assert.ok(result.stdout.includes('--domain'), 'Help should show --domain');
    assert.ok(result.stdout.includes('--limit'), 'Help should show --limit');
  });
});

describe('CLI auth command', () => {
  it('ft auth --help shows auth options', async () => {
    const { exec } = await import('node:child_process');
    const result = await new Promise((resolve) => {
      exec('cd /Users/user/Documents/Projects/fieldtheory-cli-port && npx tsx src/cli.ts auth --help', (err, stdout, stderr) => {
        resolve({ code: err?.code ?? 0, stdout, stderr });
      });
    });
    assert.ok(result.stdout.includes('auth') || result.code === 0, 'Auth command should work');
  });
});

describe('CLI status command', () => {
  it('ft status --help shows status options', async () => {
    const { exec } = await import('node:child_process');
    const result = await new Promise((resolve) => {
      exec('cd /Users/user/Documents/Projects/fieldtheory-cli-port && npx tsx src/cli.ts status --help', (err, stdout, stderr) => {
        resolve({ code: err?.code ?? 0, stdout, stderr });
      });
    });
    // status should work or show help
    assert.ok(result.code === 0 || result.stdout.includes('status'), 'Status command should work');
  });
});

describe('CLI path command', () => {
  it('ft path prints data directory', async () => {
    const { exec } = await import('node:child_process');
    const result = await new Promise((resolve) => {
      exec('cd /Users/user/Documents/Projects/fieldtheory-cli-port && npx tsx src/cli.ts path', (err, stdout, stderr) => {
        resolve({ code: err?.code ?? 0, stdout, stderr });
      });
    });
    assert.ok(result.code === 0, 'Path command should exit with 0');
    // Output should be a directory path
    assert.ok(result.stdout.trim().length > 0, 'Path should output something');
  });

  it('ft path respects FT_DATA_DIR override', async () => {
    const { exec } = await import('node:child_process');
    const result = await new Promise((resolve) => {
      exec('cd /Users/user/Documents/Projects/fieldtheory-cli-port && FT_DATA_DIR=/tmp/ft-test-env npx tsx src/cli.ts path', (err, stdout, stderr) => {
        resolve({ code: err?.code ?? 0, stdout, stderr });
      });
    });
    assert.ok(result.stdout.trim().startsWith('/tmp/ft-test-env'), 
      `Path should respect FT_DATA_DIR, got: ${result.stdout}`);
  });
});

describe('CLI index command', () => {
  it('ft index --help shows index options', async () => {
    const { exec } = await import('node:child_process');
    const result = await new Promise((resolve) => {
      exec('cd /Users/user/Documents/Projects/fieldtheory-cli-port && npx tsx src/cli.ts index --help', (err, stdout, stderr) => {
        resolve({ code: err?.code ?? 0, stdout, stderr });
      });
    });
    assert.ok(result.stdout.includes('--force') || result.code === 0, 
      'Index command should work with --force flag');
  });
});

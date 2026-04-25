#!/usr/bin/env node
import {readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const testsDir = join(root, 'tests');

function collectTestFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = collectTestFiles(testsDir).sort();

if (testFiles.length === 0) {
  console.error('No test files found under tests/**/*.test.ts');
  process.exit(1);
}

for (const file of testFiles) {
  const label = relative(root, file);
  console.log(`\n==> ${label}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', file], {
    stdio: 'inherit'
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

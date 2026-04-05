#!/usr/bin/env node
import { buildCli, showWelcome, showDashboard } from '../dist/cli.js';
import { isFirstRun } from '../dist/paths.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  if (isFirstRun()) {
    showWelcome();
  } else {
    await showDashboard();
  }
} else {
  await buildCli().parseAsync(process.argv);
}

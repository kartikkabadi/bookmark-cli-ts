#!/usr/bin/env node
import {runMemoriaXCli} from '../dist/memoria-x-cli.js';

runMemoriaXCli().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`memoria-x: ${message}`);
  process.exitCode = 1;
});

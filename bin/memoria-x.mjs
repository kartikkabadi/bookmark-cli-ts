#!/usr/bin/env node
import {runMemoriaXCli} from '../dist/memoria-x-cli.js';
import {redactSensitiveArguments} from '../dist/redact.js';

runMemoriaXCli().catch((error) => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  console.error(`memoria-x: ${redactSensitiveArguments(rawMessage)}`);
  process.exitCode = 1;
});

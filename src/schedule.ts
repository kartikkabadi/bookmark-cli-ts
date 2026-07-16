import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectorLogsDir} from './paths.js';

const LABEL = 'dev.hermes.memoria.x-sync';
const FALLBACK_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';

function ensureMac(): void {
  if (process.platform !== 'darwin') {
    throw new Error('Automatic scheduling currently supports macOS LaunchAgents.');
  }
}

function plistPath(): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function parseTime(value: string): {hour: number; minute: number} {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Time must use HH:MM.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Time must use a valid 24-hour HH:MM value.');
  }
  return {hour, minute};
}

function domainTarget(): string {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('Unable to determine the current macOS user ID.');
  return `gui/${uid}`;
}

function environmentXml(): string {
  const environment: Record<string, string> = {
    HOME: os.homedir(),
    PATH: process.env.PATH || FALLBACK_PATH
  };
  for (const key of [
    'MEMORIA_COMMAND',
    'MEMORIA_DB',
    'MEMORIA_HOME',
    'MEMORIA_X_HOME',
    'MEMORIA_X_BROWSER',
    'MEMORIA_X_CHROME_USER_DATA_DIR',
    'MEMORIA_X_CHROME_PROFILE_DIRECTORY',
    'FT_DATA_DIR',
    'FT_BROWSER',
    'FT_CHROME_USER_DATA_DIR',
    'FT_CHROME_PROFILE_DIRECTORY',
    'X_CLIENT_ID',
    'X_CLIENT_SECRET',
    'X_CALLBACK_URL',
    'X_API_KEY',
    'X_CONSUMER_KEY',
    'X_API_SECRET',
    'X_SECRET_KEY',
    'X_BEARER_TOKEN'
  ]) {
    const value = process.env[key];
    if (value) environment[key] = value;
  }
  return Object.entries(environment)
    .map(([key, value]) => `    <key>${xml(key)}</key><string>${xml(value)}</string>`)
    .join('\n');
}

export function installDailySchedule(options: {
  time: string;
  browser?: string;
  api?: boolean;
  executable?: string;
}): string {
  ensureMac();
  if (options.api && options.browser) throw new Error('Choose either API or browser synchronization.');
  const {hour, minute} = parseTime(options.time);
  const script = path.resolve(options.executable ?? process.argv[1] ?? '');
  if (!script) throw new Error('Unable to determine the memoria-x executable path.');

  const logs = connectorLogsDir();
  mkdirSync(logs, {recursive: true, mode: 0o700});
  const args = [process.execPath, script, 'sync', '--ingest', '--quiet'];
  if (options.api) args.push('--api');
  if (options.browser) args.push('--browser', options.browser);
  const argumentsXml = args.map((argument) => `      <string>${xml(argument)}</string>`).join('\n');
  const file = plistPath();
  mkdirSync(path.dirname(file), {recursive: true});
  const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argumentsXml}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${environmentXml()}
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(path.join(logs, 'daily-sync.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logs, 'daily-sync.error.log'))}</string>
</dict>
</plist>
`;
  writeFileSync(file, contents, {encoding: 'utf8', mode: 0o600});
  try {
    execFileSync('launchctl', ['bootout', domainTarget(), file], {stdio: 'ignore'});
  } catch {}
  execFileSync('launchctl', ['bootstrap', domainTarget(), file], {stdio: 'inherit'});
  return file;
}

export function showDailySchedule(): {installed: boolean; path: string; contents?: string} {
  const file = plistPath();
  try {
    return {installed: true, path: file, contents: readFileSync(file, 'utf8')};
  } catch {
    return {installed: false, path: file};
  }
}

export function removeDailySchedule(): string {
  ensureMac();
  const file = plistPath();
  try {
    execFileSync('launchctl', ['bootout', domainTarget(), file], {stdio: 'ignore'});
  } catch {}
  rmSync(file, {force: true});
  return file;
}

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {
  installDailySchedule,
  removeDailySchedule,
  showDailySchedule
} from './schedule.js';

export type SetupHost = 'codex' | 'claude';
export type SetupAction =
  | 'planned'
  | 'completed'
  | 'installed'
  | 'preserved'
  | 'skipped'
  | 'rolled-back';

export interface SetupCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface SetupRunner {
  run(
    command: string,
    args: string[],
    options?: {env?: NodeJS.ProcessEnv}
  ): SetupCommandResult;
}

export interface SetupScheduleStatus {
  installed: boolean;
  path: string;
}

export interface SetupScheduleAdapter {
  supported: boolean;
  show(): SetupScheduleStatus;
  install(options: {
    time: string;
    browser?: string;
    api?: boolean;
    executable: string;
  }): string;
  remove(): string;
}

export interface MemoriaHostStatus {
  host: SetupHost;
  available: boolean;
  serverConfigured: boolean;
  serverMatches: boolean;
  policyInstalled: boolean;
  healthy: boolean;
  detail?: string;
}

export interface SetupHostReceipt {
  host: SetupHost;
  explicit: boolean;
  action: SetupAction;
  before: MemoriaHostStatus;
  after?: MemoriaHostStatus;
  reason?: string;
}

export interface SetupReceipt {
  schema: 'hermes-memoria.x-connector.setup.v1';
  healthy: boolean;
  dryRun: boolean;
  memoria: {
    command: string;
    version: string;
    initialized: boolean;
    doctor: Record<string, unknown> | null;
  };
  sync: {
    action: SetupAction;
    source: 'official-api' | 'browser-session';
    browser: string | null;
  };
  hosts: SetupHostReceipt[];
  schedule: {
    action: SetupAction;
    supported: boolean;
    time: string;
    path: string | null;
    reason?: string;
  };
  operations: string[];
  rollback: {
    attempted: boolean;
    actions: string[];
    errors: string[];
  };
  failure: string | null;
}

export interface SetupOptions {
  memoriaCommand?: string;
  connectorCommand?: string;
  connectorArgsPrefix?: string[];
  connectorScript?: string;
  hosts?: readonly string[];
  skipHosts?: boolean;
  sync?: boolean;
  schedule?: boolean;
  dailyTime?: string;
  api?: boolean;
  browser?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
  csrfToken?: string;
  cookieHeader?: string;
  rebuild?: boolean;
  maxPages?: number;
  targetAdds?: number;
  dryRun?: boolean;
  environment?: NodeJS.ProcessEnv;
  runner?: SetupRunner;
  scheduleAdapter?: SetupScheduleAdapter;
}

const MINIMUM_MEMORIA_VERSION = [0, 2, 0] as const;
const DEFAULT_HOSTS: SetupHost[] = ['codex', 'claude'];
const SENSITIVE_ARGUMENTS = new Set(['--csrf-token', '--cookie-header']);

export const defaultSetupRunner: SetupRunner = {
  run(command, args, options) {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      env: options?.env ?? process.env
    });
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      ...(result.error ? {error: result.error} : {})
    };
  }
};

export const defaultSetupScheduleAdapter: SetupScheduleAdapter = {
  supported: process.platform === 'darwin',
  show() {
    const status = showDailySchedule();
    return {installed: status.installed, path: status.path};
  },
  install(options) {
    return installDailySchedule(options);
  },
  remove() {
    return removeDailySchedule();
  }
};

export class SetupFailure extends Error {
  readonly receipt: SetupReceipt;

  constructor(message: string, receipt: SetupReceipt, cause?: unknown) {
    receipt.rollback.attempted =
      receipt.rollback.attempted ||
      receipt.rollback.actions.length > 0 ||
      receipt.rollback.errors.length > 0;
    super(message, cause === undefined ? undefined : {cause});
    this.name = 'SetupFailure';
    this.receipt = receipt;
  }
}

export function parseSetupHost(value: string): SetupHost {
  if (value === 'codex' || value === 'claude') return value;
  throw new Error(`Unsupported host ${value}. Choose codex or claude.`);
}

function uniqueHosts(values: readonly string[]): SetupHost[] {
  const hosts: SetupHost[] = [];
  for (const value of values) {
    const host = parseSetupHost(value);
    if (!hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

function positiveInteger(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function validateTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Daily time must use HH:MM.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Daily time must use a valid 24-hour HH:MM value.');
  }
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function successful(result: SetupCommandResult): boolean {
  return !result.error && result.status === 0;
}

function safeArguments(args: readonly string[]): string[] {
  const safe = [...args];
  for (let index = 0; index < safe.length; index += 1) {
    const argument = safe[index];
    if (!argument || !SENSITIVE_ARGUMENTS.has(argument)) continue;
    if (index + 1 < safe.length) safe[index + 1] = '<redacted>';
    index += 1;
  }
  return safe;
}

function commandError(command: string, args: string[], result: SetupCommandResult): Error {
  const detail =
    result.stderr.trim() || result.stdout.trim() || result.error?.message || 'unknown error';
  return new Error(`${command} ${safeArguments(args).join(' ')} failed: ${detail}`);
}

function runRequired(
  runner: SetupRunner,
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv
): string {
  const result = runner.run(command, args, {env: environment});
  if (!successful(result)) throw commandError(command, args, result);
  return result.stdout.trim();
}

function runJson(
  runner: SetupRunner,
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv
): Record<string, unknown> {
  const output = runRequired(runner, command, args, environment);
  try {
    const parsed = JSON.parse(output) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} ${safeArguments(args).join(' ')} returned invalid JSON: ${detail}`);
  }
}

function parseVersion(value: string): [number, number, number] {
  const match = /(?:^|\s|v)(\d+)\.(\d+)\.(\d+)(?:\D|$)/.exec(value);
  if (!match) throw new Error(`Could not parse the Hermes Memoria version from: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(version: readonly number[], minimum: readonly number[]): boolean {
  for (let index = 0; index < minimum.length; index += 1) {
    const current = version[index] ?? 0;
    const required = minimum[index] ?? 0;
    if (current > required) return true;
    if (current < required) return false;
  }
  return true;
}

function readHostStatus(
  runner: SetupRunner,
  memoriaCommand: string,
  host: SetupHost,
  environment: NodeJS.ProcessEnv
): MemoriaHostStatus {
  const result = runJson(
    runner,
    memoriaCommand,
    ['--json', 'host', 'status', host, '--command', memoriaCommand],
    environment
  );
  if (result.host !== host) {
    throw new Error(`Hermes Memoria returned status for the wrong host: ${String(result.host)}`);
  }
  return {
    host,
    available: result.available === true,
    serverConfigured: result.serverConfigured === true,
    serverMatches: result.serverMatches === true,
    policyInstalled: result.policyInstalled === true,
    healthy: result.healthy === true,
    ...(typeof result.detail === 'string' ? {detail: result.detail} : {})
  };
}

function buildSyncArgs(options: SetupOptions): string[] {
  const browserConfigured = Boolean(
    options.browser ||
      options.chromeUserDataDir ||
      options.chromeProfileDirectory ||
      options.firefoxProfileDir ||
      options.csrfToken ||
      options.cookieHeader
  );
  if (options.api && browserConfigured) {
    throw new Error('Browser-session flags cannot be combined with --api.');
  }
  if (options.api && options.maxPages !== undefined) {
    throw new Error('max-pages applies only to browser-session synchronization.');
  }

  const maxPages = positiveInteger(options.maxPages, 'max-pages');
  const targetAdds = positiveInteger(options.targetAdds, 'target-adds');
  const args = ['sync', '--ingest', '--quiet'];
  if (options.api) args.push('--api');
  if (options.browser) args.push('--browser', options.browser);
  if (options.chromeUserDataDir) {
    args.push('--chrome-user-data-dir', options.chromeUserDataDir);
  }
  if (options.chromeProfileDirectory) {
    args.push('--chrome-profile-directory', options.chromeProfileDirectory);
  }
  if (options.firefoxProfileDir) {
    args.push('--firefox-profile-dir', options.firefoxProfileDir);
  }
  if (options.csrfToken) args.push('--csrf-token', options.csrfToken);
  if (options.cookieHeader) args.push('--cookie-header', options.cookieHeader);
  if (options.rebuild) args.push('--rebuild');
  if (maxPages !== undefined) args.push('--max-pages', String(maxPages));
  if (targetAdds !== undefined) args.push('--target-adds', String(targetAdds));
  return args;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hostInstallArgs(host: SetupHost, memoriaCommand: string, dryRun = false): string[] {
  return [
    '--json',
    'host',
    'install',
    host,
    '--command',
    memoriaCommand,
    ...(dryRun ? ['--dry-run'] : [])
  ];
}

function hostUninstallArgs(host: SetupHost, memoriaCommand: string): string[] {
  return ['--json', 'host', 'uninstall', host, '--command', memoriaCommand];
}

export function runSetup(options: SetupOptions = {}): SetupReceipt {
  const environment = options.environment ?? process.env;
  const runner = options.runner ?? defaultSetupRunner;
  const scheduleAdapter = options.scheduleAdapter ?? defaultSetupScheduleAdapter;
  const memoriaCommand = options.memoriaCommand ?? environment.MEMORIA_COMMAND ?? 'memoria';
  const connectorCommand = options.connectorCommand ?? process.execPath;
  const connectorScript = options.connectorScript ?? process.argv[1] ?? '';
  const connectorArgsPrefix =
    options.connectorArgsPrefix ??
    (connectorScript ? [...process.execArgv, path.resolve(connectorScript)] : []);
  const syncEnabled = options.sync !== false;
  const hostsEnabled = options.skipHosts !== true;
  const scheduleEnabled = options.schedule !== false;
  const explicitHosts = options.hosts !== undefined;
  const selectedHosts = hostsEnabled ? uniqueHosts(options.hosts ?? DEFAULT_HOSTS) : [];
  const dailyTime = validateTime(options.dailyTime ?? '07:00');
  const syncArgs = buildSyncArgs(options);

  if (options.skipHosts && options.hosts !== undefined) {
    throw new Error('Choose either explicit hosts or skip-hosts, not both.');
  }
  if (syncEnabled && connectorArgsPrefix.length === 0) {
    throw new Error('Unable to determine the memoria-x executable for the first sync.');
  }
  if (scheduleEnabled && scheduleAdapter.supported && !connectorScript) {
    throw new Error('Unable to determine the memoria-x executable for daily scheduling.');
  }

  const versionOutput = runRequired(runner, memoriaCommand, ['--version'], environment);
  const version = parseVersion(versionOutput);
  if (!versionAtLeast(version, MINIMUM_MEMORIA_VERSION)) {
    throw new Error(`Hermes Memoria 0.2.0 or newer is required; found ${versionOutput}.`);
  }

  const hostReceipts: SetupHostReceipt[] = selectedHosts.map((host) => {
    const before = readHostStatus(runner, memoriaCommand, host, environment);
    if (explicitHosts && !before.available) {
      throw new Error(`${host} is not available. Install it or remove it from the setup host list.`);
    }
    if (before.serverConfigured && !before.serverMatches) {
      throw new Error(
        before.detail ??
          `${host} has a conflicting hermes-memoria registration. Resolve it before setup.`
      );
    }
    if (!before.available) {
      return {
        host,
        explicit: explicitHosts,
        action: 'skipped',
        before,
        reason: `${host} is not installed`
      };
    }
    return {
      host,
      explicit: explicitHosts,
      action: before.healthy ? 'preserved' : 'planned',
      before
    };
  });

  if (hostsEnabled && !explicitHosts && hostReceipts.every((host) => !host.before.available)) {
    throw new Error(
      'No supported agent host is available. Install Codex or Claude Code, or rerun setup with --skip-hosts.'
    );
  }

  const scheduleBefore =
    scheduleEnabled && scheduleAdapter.supported
      ? scheduleAdapter.show()
      : {installed: false, path: ''};
  const receipt: SetupReceipt = {
    schema: 'hermes-memoria.x-connector.setup.v1',
    healthy: false,
    dryRun: options.dryRun === true,
    memoria: {
      command: memoriaCommand,
      version: versionOutput,
      initialized: false,
      doctor: null
    },
    sync: {
      action: syncEnabled ? 'planned' : 'skipped',
      source: options.api ? 'official-api' : 'browser-session',
      browser: options.browser ?? null
    },
    hosts: hostReceipts,
    schedule: {
      action: !scheduleEnabled
        ? 'skipped'
        : !scheduleAdapter.supported
          ? 'skipped'
          : scheduleBefore.installed
            ? 'preserved'
            : 'planned',
      supported: scheduleAdapter.supported,
      time: dailyTime,
      path: scheduleBefore.path || null,
      ...(!scheduleEnabled
        ? {reason: 'daily scheduling disabled'}
        : !scheduleAdapter.supported
          ? {reason: 'automatic scheduling is currently supported only on macOS'}
          : {})
    },
    operations: [],
    rollback: {attempted: false, actions: [], errors: []},
    failure: null
  };

  if (options.dryRun) {
    for (const host of receipt.hosts) {
      if (host.action !== 'planned') continue;
      runJson(
        runner,
        memoriaCommand,
        hostInstallArgs(host.host, memoriaCommand, true),
        environment
      );
      receipt.operations.push(`validated ${host.host} host installation plan`);
    }
    receipt.operations.push('validated Hermes Memoria version and host state');
    if (syncEnabled) receipt.operations.push('planned first X sync and Memoria ingestion');
    if (receipt.schedule.action === 'planned') {
      receipt.operations.push(`planned daily sync at ${dailyTime}`);
    }
    receipt.healthy = true;
    return receipt;
  }

  const installedHosts: SetupHost[] = [];
  try {
    runJson(runner, memoriaCommand, ['--json', 'init'], environment);
    receipt.memoria.initialized = true;
    receipt.operations.push('initialized Hermes Memoria vault');

    if (syncEnabled) {
      runRequired(
        runner,
        connectorCommand,
        [...connectorArgsPrefix, ...syncArgs],
        environment
      );
      receipt.sync.action = 'completed';
      receipt.operations.push('completed first X sync and Memoria ingestion');
    }

    for (const host of receipt.hosts) {
      if (host.action !== 'planned') continue;
      const result = runJson(
        runner,
        memoriaCommand,
        hostInstallArgs(host.host, memoriaCommand),
        environment
      );
      if (result.changed === true) installedHosts.push(host.host);
      host.after = readHostStatus(runner, memoriaCommand, host.host, environment);
      if (!host.after.healthy) {
        throw new Error(`${host.host} did not become healthy after installation.`);
      }
      host.action = result.changed === true ? 'installed' : 'preserved';
      receipt.operations.push(`configured ${host.host} host`);
    }

    if (receipt.schedule.action === 'planned') {
      const schedulePath = scheduleAdapter.install({
        time: dailyTime,
        executable: path.resolve(connectorScript),
        ...(options.api ? {api: true} : {}),
        ...(options.browser ? {browser: options.browser} : {})
      });
      receipt.schedule.action = 'installed';
      receipt.schedule.path = schedulePath;
      receipt.operations.push(`installed daily sync at ${dailyTime}`);
    }

    const doctor = runJson(runner, memoriaCommand, ['--json', 'doctor'], environment);
    receipt.memoria.doctor = doctor;
    if (doctor.healthy !== true) {
      throw new Error('Hermes Memoria doctor did not report a healthy vault.');
    }

    for (const host of receipt.hosts) {
      if (!host.before.available) continue;
      host.after = readHostStatus(runner, memoriaCommand, host.host, environment);
      if (!host.after.healthy) {
        throw new Error(`${host.host} failed the final host health check.`);
      }
    }

    if (scheduleEnabled && scheduleAdapter.supported) {
      const finalSchedule = scheduleAdapter.show();
      if (!finalSchedule.installed) {
        throw new Error('The daily X synchronization schedule is not installed.');
      }
      receipt.schedule.path = finalSchedule.path;
    }

    receipt.operations.push('verified vault, hosts, and schedule');
    receipt.healthy = true;
    return receipt;
  } catch (error) {
    receipt.failure = failureMessage(error);
    receipt.rollback.attempted = installedHosts.length > 0 || receipt.schedule.action === 'installed';

    if (scheduleEnabled && scheduleAdapter.supported && !scheduleBefore.installed) {
      try {
        const current = scheduleAdapter.show();
        if (current.installed) {
          receipt.rollback.attempted = true;
          scheduleAdapter.remove();
          receipt.schedule.action = 'rolled-back';
          receipt.rollback.actions.push('removed setup-created daily schedule');
        }
      } catch (rollbackError) {
        receipt.rollback.attempted = true;
        receipt.rollback.errors.push(`schedule rollback failed: ${failureMessage(rollbackError)}`);
      }
    }

    for (const host of installedHosts.reverse()) {
      receipt.rollback.attempted = true;
      try {
        runJson(
          runner,
          memoriaCommand,
          hostUninstallArgs(host, memoriaCommand),
          environment
        );
        const hostReceipt = receipt.hosts.find((entry) => entry.host === host);
        if (hostReceipt) hostReceipt.action = 'rolled-back';
        receipt.rollback.actions.push(`removed setup-created ${host} host registration`);
      } catch (rollbackError) {
        receipt.rollback.errors.push(`${host} rollback failed: ${failureMessage(rollbackError)}`);
      }
    }

    const rollbackSummary = receipt.rollback.errors.length
      ? ` Rollback encountered: ${receipt.rollback.errors.join('; ')}`
      : receipt.rollback.actions.length
        ? ` Rolled back: ${receipt.rollback.actions.join('; ')}.`
        : '';
    throw new SetupFailure(
      `Memoria X setup failed: ${receipt.failure}.${rollbackSummary}`,
      receipt,
      error
    );
  }
}

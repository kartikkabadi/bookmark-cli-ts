import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runSetup,
  SetupFailure,
  type SetupCommandResult,
  type SetupHost,
  type SetupRunner,
  type SetupScheduleAdapter,
  type SetupScheduleStatus
} from '../src/setup.js';

interface FakeHostState {
  available: boolean;
  healthy: boolean;
  conflicting?: boolean;
}

class FakeRunner implements SetupRunner {
  readonly calls: Array<{command: string; args: string[]}> = [];
  readonly events: string[];
  readonly hosts: Record<SetupHost, FakeHostState> = {
    codex: {available: true, healthy: false},
    claude: {available: false, healthy: false}
  };
  doctorHealthy = true;
  failSync = false;

  constructor(events: string[] = []) {
    this.events = events;
  }

  run(command: string, args: string[]): SetupCommandResult {
    this.calls.push({command, args: [...args]});
    this.events.push(`${command} ${args.join(' ')}`);

    if (command === 'memoria' && args.length === 1 && args[0] === '--version') {
      return {status: 0, stdout: '0.2.0\n', stderr: ''};
    }
    if (command === 'memoria' && args[0] === '--json' && args[1] === 'init') {
      return {status: 0, stdout: JSON.stringify({initialized: true}), stderr: ''};
    }
    if (command === 'memoria' && args[0] === '--json' && args[1] === 'doctor') {
      return {
        status: 0,
        stdout: JSON.stringify({healthy: this.doctorHealthy}),
        stderr: ''
      };
    }
    if (command === 'memoria' && args[0] === '--json' && args[1] === 'host') {
      const operation = args[2];
      const host = args[3] as SetupHost;
      const state = this.hosts[host];
      if (!state) return {status: 1, stdout: '', stderr: `unknown host ${host}`};

      if (operation === 'status') {
        return {
          status: 0,
          stdout: JSON.stringify({
            host,
            available: state.available,
            serverConfigured: state.healthy || state.conflicting === true,
            serverMatches: state.healthy,
            policyInstalled: state.healthy,
            healthy: state.available && state.healthy,
            ...(state.conflicting ? {detail: `${host} registration conflicts`} : {})
          }),
          stderr: ''
        };
      }
      if (operation === 'install') {
        if (args.includes('--dry-run')) {
          return {
            status: 0,
            stdout: JSON.stringify({healthy: true, changed: true, dryRun: true}),
            stderr: ''
          };
        }
        state.healthy = true;
        state.conflicting = false;
        return {
          status: 0,
          stdout: JSON.stringify({healthy: true, changed: true}),
          stderr: ''
        };
      }
      if (operation === 'uninstall') {
        state.healthy = false;
        return {
          status: 0,
          stdout: JSON.stringify({healthy: false, changed: true}),
          stderr: ''
        };
      }
    }
    if (command === 'node' && args.includes('sync')) {
      return this.failSync
        ? {status: 1, stdout: '', stderr: 'sync failed'}
        : {status: 0, stdout: '', stderr: ''};
    }
    return {status: 1, stdout: '', stderr: `unsupported command: ${command} ${args.join(' ')}`};
  }
}

class FakeSchedule implements SetupScheduleAdapter {
  supported = true;
  installed = false;
  failInstall = false;
  readonly path = '/tmp/dev.hermes.memoria.x-sync.plist';
  readonly calls: string[] = [];
  readonly events: string[];

  constructor(events: string[] = []) {
    this.events = events;
  }

  show(): SetupScheduleStatus {
    this.calls.push('show');
    this.events.push('schedule show');
    return {installed: this.installed, path: this.path};
  }

  install(options: {time: string}): string {
    this.calls.push(`install ${options.time}`);
    this.events.push(`schedule install ${options.time}`);
    this.installed = true;
    if (this.failInstall) throw new Error('launchctl bootstrap failed');
    return this.path;
  }

  remove(): string {
    this.calls.push('remove');
    this.events.push('schedule remove');
    this.installed = false;
    return this.path;
  }
}

const common = {
  memoriaCommand: 'memoria',
  connectorCommand: 'node',
  connectorArgsPrefix: ['/app/memoria-x.mjs'],
  connectorScript: '/app/memoria-x.mjs',
  environment: {}
};

test('dry-run validates plans without initializing, syncing, or mutating hosts and schedule', () => {
  const events: string[] = [];
  const runner = new FakeRunner(events);
  const schedule = new FakeSchedule(events);
  const receipt = runSetup({
    ...common,
    runner,
    scheduleAdapter: schedule,
    browser: 'helium',
    dryRun: true
  });

  assert.equal(receipt.healthy, true);
  assert.equal(receipt.dryRun, true);
  assert.equal(receipt.sync.action, 'planned');
  assert.equal(receipt.schedule.action, 'planned');
  assert.equal(runner.hosts.codex.healthy, false);
  assert.equal(schedule.installed, false);
  assert.ok(runner.calls.some((call) => call.args.includes('--dry-run')));
  assert.equal(runner.calls.some((call) => call.args.includes('init')), false);
  assert.equal(runner.calls.some((call) => call.command === 'node'), false);
  assert.equal(schedule.calls.some((call) => call.startsWith('install')), false);
});

test('setup syncs before host mutation, installs available defaults, and schedules last', () => {
  const events: string[] = [];
  const runner = new FakeRunner(events);
  const schedule = new FakeSchedule(events);
  const receipt = runSetup({
    ...common,
    runner,
    scheduleAdapter: schedule,
    browser: 'helium'
  });

  assert.equal(receipt.healthy, true);
  assert.equal(receipt.sync.action, 'completed');
  assert.equal(receipt.hosts.find((host) => host.host === 'codex')?.action, 'installed');
  assert.equal(receipt.hosts.find((host) => host.host === 'claude')?.action, 'skipped');
  assert.equal(receipt.schedule.action, 'installed');

  const syncIndex = events.findIndex((event) => event.includes(' sync '));
  const hostInstallIndex = events.findIndex((event) => event.includes('host install codex'));
  const scheduleInstallIndex = events.findIndex((event) => event.startsWith('schedule install'));
  assert.ok(syncIndex >= 0);
  assert.ok(hostInstallIndex > syncIndex);
  assert.ok(scheduleInstallIndex > hostInstallIndex);
});

test('an explicitly requested unavailable host fails before any mutation', () => {
  const events: string[] = [];
  const runner = new FakeRunner(events);
  const schedule = new FakeSchedule(events);

  assert.throws(
    () =>
      runSetup({
        ...common,
        runner,
        scheduleAdapter: schedule,
        hosts: ['claude']
      }),
    /claude is not available/
  );
  assert.equal(events.some((event) => event.includes(' init')), false);
  assert.equal(events.some((event) => event.includes(' sync ')), false);
  assert.equal(events.some((event) => event.startsWith('schedule install')), false);
});

test('a schedule failure removes partial schedule state and newly installed hosts', () => {
  const events: string[] = [];
  const runner = new FakeRunner(events);
  const schedule = new FakeSchedule(events);
  schedule.failInstall = true;

  let failure: SetupFailure | undefined;
  try {
    runSetup({...common, runner, scheduleAdapter: schedule, hosts: ['codex']});
  } catch (error) {
    assert.ok(error instanceof SetupFailure);
    failure = error;
  }

  assert.ok(failure);
  assert.equal(runner.hosts.codex.healthy, false);
  assert.equal(schedule.installed, false);
  assert.ok(events.some((event) => event.includes('host uninstall codex')));
  assert.ok(events.some((event) => event === 'schedule remove'));
  assert.equal(failure.receipt.hosts[0]?.action, 'rolled-back');
  assert.ok(failure.receipt.rollback.actions.length >= 2);
  assert.equal(failure.receipt.sync.action, 'completed');
});

test('existing healthy host and schedule are preserved across reruns', () => {
  const events: string[] = [];
  const runner = new FakeRunner(events);
  runner.hosts.codex.healthy = true;
  const schedule = new FakeSchedule(events);
  schedule.installed = true;

  for (let run = 0; run < 2; run += 1) {
    const receipt = runSetup({
      ...common,
      runner,
      scheduleAdapter: schedule,
      hosts: ['codex'],
      sync: false
    });
    assert.equal(receipt.healthy, true);
    assert.equal(receipt.hosts[0]?.action, 'preserved');
    assert.equal(receipt.schedule.action, 'preserved');
  }

  assert.equal(events.some((event) => event.includes('host install codex')), false);
  assert.equal(events.some((event) => event.startsWith('schedule install')), false);
  assert.equal(events.some((event) => event.includes(' sync ')), false);
});

test('API setup refuses browser-session options before invoking Memoria', () => {
  const runner = new FakeRunner();
  const schedule = new FakeSchedule();
  assert.throws(
    () =>
      runSetup({
        ...common,
        runner,
        scheduleAdapter: schedule,
        api: true,
        browser: 'helium'
      }),
    /cannot be combined/
  );
  assert.equal(runner.calls.length, 0);
});

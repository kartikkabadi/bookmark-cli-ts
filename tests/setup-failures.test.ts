import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runSetup,
  SetupFailure,
  type SetupCommandResult,
  type SetupRunner,
  type SetupScheduleAdapter,
  type SetupScheduleStatus
} from '../src/setup.js';

class FailureRunner implements SetupRunner {
  failSync = false;
  readonly calls: string[] = [];

  run(command: string, args: string[]): SetupCommandResult {
    this.calls.push(`${command} ${args.join(' ')}`);
    if (command === 'memoria' && args[0] === '--version') {
      return {status: 0, stdout: '0.2.0\n', stderr: ''};
    }
    if (command === 'memoria' && args[0] === '--json' && args[1] === 'init') {
      return {status: 0, stdout: JSON.stringify({initialized: true}), stderr: ''};
    }
    if (command === 'node' && args.includes('sync')) {
      return this.failSync
        ? {status: 1, stdout: '', stderr: 'browser request failed'}
        : {status: 0, stdout: '', stderr: ''};
    }
    if (command === 'memoria' && args[0] === '--json' && args[1] === 'doctor') {
      return {status: 0, stdout: JSON.stringify({healthy: true}), stderr: ''};
    }
    return {status: 1, stdout: '', stderr: `unsupported command: ${command} ${args.join(' ')}`};
  }
}

class PartialSchedule implements SetupScheduleAdapter {
  supported = true;
  installed = false;
  removed = false;
  readonly path = '/tmp/dev.hermes.memoria.x-sync.plist';

  show(): SetupScheduleStatus {
    return {installed: this.installed, path: this.path};
  }

  install(): string {
    this.installed = true;
    throw new Error('launchctl bootstrap failed');
  }

  remove(): string {
    this.installed = false;
    this.removed = true;
    return this.path;
  }
}

const common = {
  memoriaCommand: 'memoria',
  connectorCommand: 'node',
  connectorArgsPrefix: ['/app/memoria-x.mjs'],
  connectorScript: '/app/memoria-x.mjs',
  environment: {},
  skipHosts: true
};

test('sync failures redact manual browser credentials from error and receipt text', () => {
  const runner = new FailureRunner();
  runner.failSync = true;
  const csrfToken = 'private-csrf-token';
  const cookieHeader = 'auth_token=private-cookie';

  let failure: SetupFailure | undefined;
  try {
    runSetup({
      ...common,
      runner,
      schedule: false,
      csrfToken,
      cookieHeader
    });
  } catch (error) {
    assert.ok(error instanceof SetupFailure);
    failure = error;
  }

  assert.ok(failure);
  assert.equal(failure.message.includes(csrfToken), false);
  assert.equal(failure.message.includes(cookieHeader), false);
  assert.equal(failure.receipt.failure?.includes(csrfToken), false);
  assert.equal(failure.receipt.failure?.includes(cookieHeader), false);
  assert.match(failure.message, /<redacted>/u);
});

test('schedule-only partial rollback marks the receipt as attempted', () => {
  const runner = new FailureRunner();
  const schedule = new PartialSchedule();

  let failure: SetupFailure | undefined;
  try {
    runSetup({...common, runner, scheduleAdapter: schedule});
  } catch (error) {
    assert.ok(error instanceof SetupFailure);
    failure = error;
  }

  assert.ok(failure);
  assert.equal(schedule.removed, true);
  assert.equal(failure.receipt.rollback.attempted, true);
  assert.deepEqual(failure.receipt.rollback.errors, []);
  assert.deepEqual(failure.receipt.rollback.actions, [
    'removed setup-created daily schedule'
  ]);
  assert.equal(failure.receipt.schedule.action, 'rolled-back');
});

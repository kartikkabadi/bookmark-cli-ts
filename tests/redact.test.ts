import test from 'node:test';
import assert from 'node:assert/strict';
import {redactSensitiveArguments} from '../src/redact.js';

test('redacts manual browser-session credentials from error messages', () => {
  const csrfToken = 'csrf-secret-value';
  const cookieHeader = 'auth_token=private-cookie';
  const message = `node memoria-x sync --csrf-token ${csrfToken} --cookie-header ${cookieHeader} failed`;
  const redacted = redactSensitiveArguments(message, [
    'sync',
    '--csrf-token',
    csrfToken,
    '--cookie-header',
    cookieHeader
  ]);

  assert.equal(redacted.includes(csrfToken), false);
  assert.equal(redacted.includes(cookieHeader), false);
  assert.equal(redacted.match(/<redacted>/gu)?.length, 2);
});

test('leaves unrelated error text unchanged', () => {
  const message = 'memoria doctor failed: unavailable';
  assert.equal(redactSensitiveArguments(message, ['doctor']), message);
});

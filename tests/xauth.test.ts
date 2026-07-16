import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildTwitterOAuthUrl,
  refreshOAuthToken,
  saveTwitterOAuthToken
} from '../src/xauth.js';

function setupEnv(contents: string): {directory: string; restore: () => void} {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-xauth-'));
  const previous = process.env.MEMORIA_X_HOME;
  process.env.MEMORIA_X_HOME = directory;
  fs.writeFileSync(path.join(directory, '.env.local'), contents);
  return {
    directory,
    restore: () => {
      if (previous === undefined) delete process.env.MEMORIA_X_HOME;
      else process.env.MEMORIA_X_HOME = previous;
      for (const key of ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_CALLBACK_URL']) delete process.env[key];
      fs.rmSync(directory, {recursive: true, force: true});
    }
  };
}

test('saveTwitterOAuthToken writes a private token file on POSIX', async () => {
  if (process.platform === 'win32') return;
  const env = setupEnv('X_CLIENT_ID=native-client\n');
  try {
    const tokenPath = await saveTwitterOAuthToken({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      scope: 'bookmark.read',
      token_type: 'bearer',
      obtained_at: new Date().toISOString()
    });
    assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
  } finally {
    env.restore();
  }
});

test('buildTwitterOAuthUrl uses PKCE and bookmark scopes', () => {
  const env = setupEnv(
    'X_CLIENT_ID=native-client\nX_CALLBACK_URL=http://127.0.0.1:3000/callback\n'
  );
  try {
    const result = buildTwitterOAuthUrl();
    const url = new URL(result.url);
    assert.equal(url.hostname, 'x.com');
    assert.equal(url.searchParams.get('client_id'), 'native-client');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.match(url.searchParams.get('scope') ?? '', /bookmark\.read/);
    assert.ok(result.state.length >= 20);
    assert.ok(result.verifier.length >= 40);
  } finally {
    env.restore();
  }
});

test('refreshOAuthToken supports a public client without Basic authentication', async () => {
  const env = setupEnv(
    'X_CLIENT_ID=native-client\nX_CALLBACK_URL=http://127.0.0.1:3000/callback\n'
  );
  const originalFetch = globalThis.fetch;
  let capturedBody: URLSearchParams | null = null;
  let capturedHeaders: HeadersInit | undefined;
  globalThis.fetch = async (_url: URL | RequestInfo, init?: RequestInit) => {
    capturedBody = init?.body as URLSearchParams;
    capturedHeaders = init?.headers;
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 7200,
          scope: 'bookmark.read offline.access',
          token_type: 'bearer'
        })
    } as Response;
  };

  try {
    const result = await refreshOAuthToken('old-refresh-token');
    assert.equal(result.access_token, 'new-access-token');
    assert.equal(result.refresh_token, 'new-refresh-token');
    assert.equal(capturedBody?.get('client_id'), 'native-client');
    assert.equal(capturedBody?.get('refresh_token'), 'old-refresh-token');
    assert.equal((capturedHeaders as Record<string, string>).Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    env.restore();
  }
});

test('refreshOAuthToken adds Basic authentication for an explicit confidential client', async () => {
  const env = setupEnv('X_CLIENT_ID=client\nX_CLIENT_SECRET=secret\n');
  const originalFetch = globalThis.fetch;
  let authorization: string | undefined;
  globalThis.fetch = async (_url: URL | RequestInfo, init?: RequestInit) => {
    authorization = (init?.headers as Record<string, string>).Authorization;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({access_token: 'access'})
    } as Response;
  };
  try {
    await refreshOAuthToken('refresh');
    assert.match(authorization ?? '', /^Basic /);
  } finally {
    globalThis.fetch = originalFetch;
    env.restore();
  }
});

test('refreshOAuthToken explains expired sessions using the new CLI', async () => {
  const env = setupEnv('X_CLIENT_ID=native-client\n');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Refresh token is invalid or expired'
        })
    }) as Response;
  try {
    await assert.rejects(() => refreshOAuthToken('expired-token'), /Re-run: memoria-x auth/);
  } finally {
    globalThis.fetch = originalFetch;
    env.restore();
  }
});

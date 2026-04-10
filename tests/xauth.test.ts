import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { saveTwitterOAuthToken, refreshOAuthToken } from '../src/xauth.js';

test('saveTwitterOAuthToken: writes private token file on posix', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-xauth-test-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const tokenPath = await saveTwitterOAuthToken({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      scope: 'bookmark.read',
      token_type: 'bearer',
      obtained_at: new Date().toISOString(),
    });

    const mode = fs.statSync(tokenPath).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('refreshOAuthToken: returns new token pair on success', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-xauth-refresh-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  // Create a minimal .env.local so loadXApiConfig() works
  const envPath = path.join(tmpDir, '.env.local');
  fs.writeFileSync(envPath, 'X_API_KEY=key\nX_API_SECRET=secret\nX_CLIENT_ID=ci\nX_CLIENT_SECRET=cs\nX_CALLBACK_URL=http://127.0.0.1:3000/callback\n');

  try {
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 7200,
        scope: 'bookmark.read offline.access',
        token_type: 'bearer'
      })
    };
    const originalFetch = globalThis.fetch;
    let fetchCallCount = 0;
    let capturedBody: URLSearchParams | null = null;

    globalThis.fetch = async (url: URL | RequestInfo, init?: RequestInit) => {
      fetchCallCount++;
      capturedBody = init?.body as URLSearchParams;
      return mockResponse;
    };

    try {
      const result = await refreshOAuthToken('old-refresh-token');

      assert.equal(fetchCallCount, 1, 'fetch should be called once');
      assert.equal(result.access_token, 'new-access-token');
      assert.equal(result.refresh_token, 'new-refresh-token');
      assert.equal(result.expires_in, 7200);
      assert.ok(result.obtained_at, 'should have obtained_at timestamp');
      assert.ok(capturedBody, 'body should be captured');
      assert.equal(capturedBody!.get('grant_type'), 'refresh_token');
      assert.equal(capturedBody!.get('refresh_token'), 'old-refresh-token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('refreshOAuthToken: throws on expired refresh token', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-xauth-refresh-expired-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  const envPath = path.join(tmpDir, '.env.local');
  fs.writeFileSync(envPath, 'X_API_KEY=key\nX_API_SECRET=secret\nX_CLIENT_ID=ci\nX_CLIENT_SECRET=cs\nX_CALLBACK_URL=http://127.0.0.1:3000/callback\n');

  try {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'invalid_request', error_description: 'Refresh token is invalid or has expired' })
    };
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => mockResponse;

    try {
      await refreshOAuthToken('expired-token');
      assert.fail('should have thrown');
    } catch (err: any) {
      assert.equal(err.message, 'OAuth session expired. Re-run: ft auth');
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

import crypto from 'node:crypto';
import http from 'node:http';
import {URL} from 'node:url';
import {pathExists, readJson, writeJson} from './fs.js';
import {ensureDataDir, twitterOauthTokenPath} from './paths.js';
import {loadXApiConfig, type XApiConfig} from './config.js';
import type {XOAuthTokenSet} from './types.js';

const OAUTH_SCOPES = ['tweet.read', 'users.read', 'bookmark.read', 'offline.access'] as const;
const TOKEN_ENDPOINT = 'https://api.x.com/2/oauth2/token';
const AUTHORIZATION_ENDPOINT = 'https://x.com/i/oauth2/authorize';
const CALLBACK_TIMEOUT_MS = 5 * 60_000;

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createPkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64Url(crypto.randomBytes(16));
  return {verifier, challenge, state};
}

function tokenHeaders(config: XApiConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  if (config.clientSecret) {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
  }
  return headers;
}

function parseJson(text: string): Record<string, any> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTokenResponse(parsed: Record<string, any>, fallbackRefreshToken?: string): XOAuthTokenSet {
  if (typeof parsed.access_token !== 'string' || parsed.access_token.length === 0) {
    throw new Error('X returned a successful token response without an access token.');
  }
  return {
    access_token: parsed.access_token,
    ...(typeof parsed.refresh_token === 'string'
      ? {refresh_token: parsed.refresh_token}
      : fallbackRefreshToken
        ? {refresh_token: fallbackRefreshToken}
        : {}),
    ...(typeof parsed.expires_in === 'number' ? {expires_in: parsed.expires_in} : {}),
    ...(typeof parsed.scope === 'string' ? {scope: parsed.scope} : {}),
    ...(typeof parsed.token_type === 'string' ? {token_type: parsed.token_type} : {}),
    obtained_at: new Date().toISOString()
  };
}

function tokenError(parsed: Record<string, any>, status: number, action: string): Error {
  const detail =
    typeof parsed.error_description === 'string'
      ? parsed.error_description
      : typeof parsed.error === 'string'
        ? parsed.error
        : `HTTP ${status}`;
  return new Error(`${action} failed: ${detail}`);
}

export function buildTwitterOAuthUrl(): {url: string; state: string; verifier: string} {
  const config = loadXApiConfig();
  const {verifier, challenge, state} = createPkce();
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return {url: url.toString(), state, verifier};
}

async function exchangeCodeForToken(code: string, verifier: string): Promise<XOAuthTokenSet> {
  const config = loadXApiConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.callbackUrl,
    code_verifier: verifier,
    client_id: config.clientId
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: tokenHeaders(config),
    body
  });
  const parsed = parseJson(await response.text());
  if (!response.ok) throw tokenError(parsed, response.status, 'OAuth token exchange');
  return normalizeTokenResponse(parsed);
}

export async function refreshOAuthToken(refreshToken: string): Promise<XOAuthTokenSet> {
  const config = loadXApiConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: tokenHeaders(config),
    body
  });
  const parsed = parseJson(await response.text());
  if (!response.ok) {
    if (parsed.error === 'invalid_request' || parsed.error === 'invalid_grant' || response.status === 401) {
      throw new Error('OAuth session expired. Re-run: memoria-x auth');
    }
    throw tokenError(parsed, response.status, 'OAuth token refresh');
  }
  return normalizeTokenResponse(parsed, refreshToken);
}

export async function saveTwitterOAuthToken(token: XOAuthTokenSet): Promise<string> {
  ensureDataDir();
  const tokenPath = twitterOauthTokenPath();
  await writeJson(tokenPath, token, {mode: 0o600});
  const {chmod} = await import('node:fs/promises');
  await chmod(tokenPath, 0o600);
  return tokenPath;
}

export async function loadTwitterOAuthToken(): Promise<XOAuthTokenSet | null> {
  const tokenPath = twitterOauthTokenPath();
  if (!(await pathExists(tokenPath))) return null;
  return readJson<XOAuthTokenSet>(tokenPath);
}

function validateLoopbackCallback(callbackUrl: string): URL {
  const callback = new URL(callbackUrl);
  if (
    callback.protocol !== 'http:' ||
    (callback.hostname !== '127.0.0.1' && callback.hostname !== 'localhost')
  ) {
    throw new Error(
      'X_CALLBACK_URL must be an HTTP loopback URL such as http://127.0.0.1:3000/callback.'
    );
  }
  return callback;
}

export async function runTwitterOAuthFlow(): Promise<{tokenPath: string; scope?: string}> {
  const config = loadXApiConfig();
  const callback = validateLoopbackCallback(config.callbackUrl);
  const port = Number(callback.port || 80);
  const pathname = callback.pathname;
  const {url, state, verifier} = buildTwitterOAuthUrl();

  const code = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, authorizationCode?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      if (error) reject(error);
      else resolve(authorizationCode!);
    };

    const server = http.createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
        if (requestUrl.pathname !== pathname) {
          response.statusCode = 404;
          response.end('Not found');
          return;
        }

        const returnedState = requestUrl.searchParams.get('state');
        const returnedCode = requestUrl.searchParams.get('code');
        const oauthError = requestUrl.searchParams.get('error');
        if (oauthError) {
          response.statusCode = 400;
          response.end(`OAuth error: ${oauthError}`);
          finish(new Error(`OAuth error: ${oauthError}`));
          return;
        }
        if (!returnedCode || returnedState !== state) {
          response.statusCode = 400;
          response.end('Invalid OAuth callback');
          finish(new Error('Invalid OAuth callback state or code'));
          return;
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end('Memoria X authorization complete. You can close this tab.');
        finish(undefined, returnedCode);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

    const timeout = setTimeout(
      () => finish(new Error('OAuth authorization timed out. Re-run: memoria-x auth')),
      CALLBACK_TIMEOUT_MS
    );
    server.once('error', (error) => finish(error));
    server.listen(port, callback.hostname, () => {
      console.log('Open this URL in your browser to authorize X bookmark access:');
      console.log(url);
    });
  });

  const token = await exchangeCodeForToken(code, verifier);
  const tokenPath = await saveTwitterOAuthToken(token);
  return {tokenPath, ...(token.scope ? {scope: token.scope} : {})};
}

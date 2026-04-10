import test from 'node:test';
import assert from 'node:assert/strict';
import { withIsolatedDataDir } from './helpers.js';
import { validateMediaUrl } from '../src/bookmark-media.js';

test('validateMediaUrl rejects http:// URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('http://evil.com/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /scheme|https?:\/\/|unsupported/i);
  });
});

test('validateMediaUrl rejects ftp:// URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('ftp://evil.com/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /scheme|https?:\/\/|unsupported/i);
  });
});

test('validateMediaUrl rejects localhost', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://localhost/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /localhost|private|address/i);
  });
});

test('validateMediaUrl rejects 127.0.0.1', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://127.0.0.1/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /localhost|private|address|127/i);
  });
});

test('validateMediaUrl rejects 10.x private IPs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://10.0.0.1/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /private|address|10\./i);
  });
});

test('validateMediaUrl rejects 192.168.x private IPs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://192.168.1.1/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /private|address|192\.168/i);
  });
});

test('validateMediaUrl rejects 172.16-31.x private IPs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://172.20.100.5/image.jpg');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /private|address|172\.(1[6-9]|2\d|3[0-1])/i);
  });
});

test('validateMediaUrl rejects 169.254.169.254 (AWS metadata)', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://169.254.169.254/latest/meta-data/');
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /private|address|169\.254/i);
  });
});

test('validateMediaUrl accepts https://pbs.twimg.com URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://pbs.twimg.com/media/abc123.jpg');
    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });
});

test('validateMediaUrl accepts https://video.twimg.com URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://video.twimg.com/ext_tw_video/123.mp4');
    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });
});

test('validateMediaUrl accepts arbitrary valid HTTPS URLs', async () => {
  await withIsolatedDataDir(async () => {
    const result = validateMediaUrl('https://example.com/image.png');
    assert.equal(result.valid, true);
  });
});

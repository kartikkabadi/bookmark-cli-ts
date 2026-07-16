import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(repositoryRoot, 'artifacts', 'npm');
const packageName = '@hermes-memoria/x-connector';
const commandSuffix = process.platform === 'win32' ? '.cmd' : '';

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: options.shell ?? false
  });
}

function run(command, args, options = {}) {
  const result = execute(command, args, options);
  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
  return result.stdout.trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(file) {
  const hash = createHash('sha256');
  hash.update(readFileSync(file));
  return hash.digest('hex');
}

function tarballName(version) {
  return `hermes-memoria-x-connector-${version}.tgz`;
}

function globalBinPath(prefix, name) {
  return process.platform === 'win32'
    ? path.join(prefix, `${name}${commandSuffix}`)
    : path.join(prefix, 'bin', name);
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function packageVersionExists(version) {
  const result = execute(`npm${commandSuffix}`, [
    'view',
    `${packageName}@${version}`,
    'version',
    '--json'
  ]);
  if (result.status === 0) return true;
  const detail = `${result.stdout}\n${result.stderr}`;
  if (/E404|404 Not Found|is not in this registry/iu.test(detail)) return false;
  throw new Error(
    `Unable to determine whether ${packageName}@${version} exists:\n${detail.trim()}`
  );
}

function waitForRegistry(version) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = execute(`npm${commandSuffix}`, [
      'view',
      `${packageName}@${version}`,
      'version',
      '--json'
    ]);
    if (result.status === 0) {
      const published = JSON.parse(result.stdout.trim());
      assert(published === version, `Registry returned ${String(published)}; expected ${version}`);
      return;
    }
    if (attempt < 6) sleep(5_000);
    else throw new Error(`Registry verification failed: ${result.stderr.trim()}`);
  }
}

function verifyGlobalInstall(version) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'memoria-x-global-'));
  const prefix = path.join(temporaryRoot, 'prefix');
  try {
    run(`npm${commandSuffix}`, [
      'install',
      '--global',
      '--prefix',
      prefix,
      '--no-audit',
      '--no-fund',
      `${packageName}@${version}`
    ]);

    const memoriaX = globalBinPath(prefix, 'memoria-x');
    const legacyFt = globalBinPath(prefix, 'ft');
    assert(existsSync(memoriaX), `Published package did not create ${memoriaX}`);
    assert(existsSync(legacyFt), `Published package did not create ${legacyFt}`);
    const reportedVersion = run(memoriaX, ['--version'], {
      cwd: temporaryRoot,
      shell: process.platform === 'win32'
    });
    assert(
      reportedVersion === version,
      `Global memoria-x reported ${reportedVersion}; expected ${version}`
    );
    const legacyHelp = run(legacyFt, ['--help'], {
      cwd: temporaryRoot,
      shell: process.platform === 'win32'
    });
    assert(/\bft\b/u.test(legacyHelp), 'Published ft compatibility shim did not render help');
  } finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
  }
}

function main() {
  assert(process.env.GITHUB_ACTIONS === 'true', 'Publishing is restricted to GitHub Actions');
  assert(process.env.GITHUB_REF_TYPE === 'tag', 'Publishing requires a tag-triggered workflow');

  const sourceManifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
  );
  assert(sourceManifest.name === packageName, 'Unexpected source package name');
  const version = sourceManifest.version;
  const expectedTag = `v${version}`;
  assert(
    process.env.GITHUB_REF_NAME === expectedTag,
    `Tag ${String(process.env.GITHUB_REF_NAME)} does not match ${expectedTag}`
  );

  const releaseManifestPath = path.join(artifactDirectory, 'manifest.json');
  assert(existsSync(releaseManifestPath), 'Run release:pack before publishing');
  const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
  assert(
    releaseManifest.schema === 'hermes-memoria.x-connector.release.v1',
    'Unsupported release manifest schema'
  );
  assert(releaseManifest.name === packageName, 'Release manifest package name is invalid');
  assert(
    releaseManifest.version === version,
    'Release manifest version does not match package.json'
  );
  assert(releaseManifest.filename === tarballName(version), 'Unexpected release tarball filename');
  assert(/^[a-f0-9]{64}$/u.test(releaseManifest.sha256), 'Invalid release SHA-256 digest');

  const tarball = path.resolve(artifactDirectory, releaseManifest.filename);
  assert(tarball.startsWith(`${artifactDirectory}${path.sep}`), 'Unsafe release tarball path');
  assert(existsSync(tarball), `Missing release tarball ${releaseManifest.filename}`);
  assert(sha256(tarball) === releaseManifest.sha256, 'Release tarball checksum mismatch');
  assert(!packageVersionExists(version), `${packageName}@${version} already exists`);

  run(`npm${commandSuffix}`, ['publish', tarball, '--access', 'public']);
  waitForRegistry(version);
  verifyGlobalInstall(version);
  console.log(`Published and globally installed ${packageName}@${version}.`);
}

main();

import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(repositoryRoot, 'artifacts', 'npm');
const packageName = '@hermes-memoria/x-connector';
const commandSuffix = process.platform === 'win32' ? '.cmd' : '';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: options.shell ?? false
  });
  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
  return result.stdout.trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function tarballName(version) {
  return `hermes-memoria-x-connector-${version}.tgz`;
}

function sha256(file) {
  const hash = createHash('sha256');
  hash.update(readFileSync(file));
  return hash.digest('hex');
}

function binPath(cleanRoom, name) {
  return path.join(cleanRoom, 'node_modules', '.bin', `${name}${commandSuffix}`);
}

function main() {
  const sourceManifest = readJson(path.join(repositoryRoot, 'package.json'));
  const version = sourceManifest.version;
  assert(sourceManifest.name === packageName, `Unexpected package name ${String(sourceManifest.name)}`);
  assert(typeof version === 'string' && version.length > 0, 'Package version is missing');

  rmSync(artifactDirectory, {recursive: true, force: true});
  mkdirSync(artifactDirectory, {recursive: true});
  run(`pnpm${commandSuffix}`, ['pack', '--pack-destination', artifactDirectory]);

  const filename = tarballName(version);
  const tarball = path.join(artifactDirectory, filename);
  assert(existsSync(tarball), `pnpm pack did not create ${filename}`);
  assert(statSync(tarball).size > 0, `${filename} is empty`);

  const cleanRoom = mkdtempSync(path.join(os.tmpdir(), 'memoria-x-release-'));
  try {
    writeFileSync(
      path.join(cleanRoom, 'package.json'),
      `${JSON.stringify(
        {
          name: 'memoria-x-release-smoke',
          private: true,
          dependencies: {[packageName]: `file:${tarball}`}
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    run(
      `npm${commandSuffix}`,
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'],
      {cwd: cleanRoom}
    );

    const installedRoot = path.join(cleanRoom, 'node_modules', '@hermes-memoria', 'x-connector');
    const manifest = readJson(path.join(installedRoot, 'package.json'));
    assert(manifest.name === packageName, 'Packed package name changed');
    assert(manifest.version === version, 'Packed package version changed');
    assert(manifest.license === 'MIT', 'Packed package must declare the MIT license');
    assert(manifest.engines?.node === '>=24', 'Packed package must retain the Node >=24 contract');
    assert(manifest.publishConfig?.access === 'public', 'Packed package must remain public');
    assert(
      manifest.repository?.url === 'git+https://github.com/kartikkabadi/bookmark-cli-ts.git',
      'Packed repository URL does not match the trusted-publishing repository'
    );
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      assert(
        typeof range === 'string' && !range.startsWith('workspace:'),
        `Packed dependency leaked a workspace range: ${dependency}@${String(range)}`
      );
    }

    for (const relativePath of [
      'README.md',
      'LICENSE',
      'dist/memoria-x-cli.js',
      'bin/memoria-x.mjs',
      'bin/ft.mjs'
    ]) {
      assert(existsSync(path.join(installedRoot, relativePath)), `Packed package is missing ${relativePath}`);
    }

    run(process.execPath, ['--input-type=module', '--eval', `await import('${packageName}')`], {
      cwd: cleanRoom
    });

    const memoriaX = binPath(cleanRoom, 'memoria-x');
    const legacyFt = binPath(cleanRoom, 'ft');
    assert(existsSync(memoriaX), `npm did not create the memoria-x shim at ${memoriaX}`);
    assert(existsSync(legacyFt), `npm did not create the ft compatibility shim at ${legacyFt}`);
    const reportedVersion = run(memoriaX, ['--version'], {
      cwd: cleanRoom,
      shell: process.platform === 'win32'
    });
    assert(reportedVersion === version, `memoria-x reported ${reportedVersion}; expected ${version}`);
    const legacyHelp = run(legacyFt, ['--help'], {
      cwd: cleanRoom,
      shell: process.platform === 'win32'
    });
    assert(/\bft\b/u.test(legacyHelp), 'The ft compatibility shim did not render legacy help');
  } finally {
    if (process.env.MEMORIA_X_RELEASE_KEEP_TEMP !== '1') {
      rmSync(cleanRoom, {recursive: true, force: true});
    } else {
      console.log(`Retained clean-room installation at ${cleanRoom}`);
    }
  }

  const releaseManifest = {
    schema: 'hermes-memoria.x-connector.release.v1',
    name: packageName,
    version,
    node: process.version,
    npm: run(`npm${commandSuffix}`, ['--version']),
    pnpm: run(`pnpm${commandSuffix}`, ['--version']),
    filename,
    bytes: statSync(tarball).size,
    sha256: sha256(tarball)
  };
  writeFileSync(
    path.join(artifactDirectory, 'manifest.json'),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(releaseManifest, null, 2));
}

main();

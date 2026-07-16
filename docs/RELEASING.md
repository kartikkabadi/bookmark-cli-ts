# Releasing Memoria X Connector

The public package is `@hermes-memoria/x-connector`. It installs two command shims:

- `memoria-x` — the maintained connector interface
- `ft` — a temporary compatibility interface for existing users and archives

## Mandatory gates

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run release:pack
```

`release:pack` builds and packs the exact package, installs the tarball into an empty npm project, verifies package identity and payload, imports the exported entrypoint, executes both generated command shims, and writes `artifacts/npm/manifest.json` with the tarball size and SHA-256 digest.

The package verifier requires:

- exact `@hermes-memoria/x-connector` name and version;
- public npm access;
- MIT license;
- Node 24 or newer;
- exact GitHub repository identity;
- no leaked `workspace:` dependency ranges;
- README and LICENSE;
- built CLI code; and
- both `memoria-x` and `ft` bin entrypoints.

Do not publish the source directory. Publish only the tarball named in the generated manifest.

## Bootstrap release

The first package version must be published once with a maintainer's authenticated npm session before npm can attach a trusted publisher to the package.

1. Confirm ownership of the `@hermes-memoria` npm scope.
2. Enable publishing two-factor authentication.
3. Run all mandatory gates from the exact release commit.
4. Inspect the tarball and `manifest.json`.
5. Publish the tarball with `--access public`.
6. Install `@hermes-memoria/x-connector@<version>` into a fresh global prefix.
7. Run `memoria-x --version` and `ft --help` through npm's global command shims.

Never add a long-lived npm write token to the repository or GitHub secrets.

## Trusted publishing

After the bootstrap package exists, configure its npm trusted publisher:

- Provider: GitHub Actions
- GitHub user or organization: `kartikkabadi`
- Repository: `bookmark-cli-ts`
- Workflow filename: `publish.yml`
- Environment: `npm`
- Allowed action: `npm publish`

Create a protected GitHub environment named `npm` with maintainer approval and protect release tags matching `v*`.

The workflow:

- runs only for a tag equal to `v<package version>`;
- requires the tagged commit to be contained in `main`;
- requests only `contents: read` and `id-token: write`;
- pins every third-party Action to an exact reviewed commit;
- pins pnpm 10.7.0 and npm 11.5.1;
- reruns source, test, lint, format, smoke, pack, and clean-room gates;
- verifies the manifest filename, version, path, and SHA-256 digest;
- refuses an existing version;
- publishes through npm OIDC; and
- waits for registry visibility before performing a real global install and command-shim smoke.

Because the repository is private, npm provenance attestations are not currently available even though the package is public. Trusted publishing still avoids a long-lived npm credential.

## Normal release

1. Update the package version and CLI version together.
2. Update release notes and X compatibility notes.
3. Merge only after Node 24 and Node 26 checks plus the Node 24 package lane are green.
4. Create a protected `v<version>` tag on a commit contained in `main`.
5. Preserve the uploaded tarball and manifest from the publishing workflow.

A failed post-publish global smoke does not make the published version reusable. Fix the issue, increment the version, and publish a new tag. Never force-move a release tag or mutate a reviewed tarball.

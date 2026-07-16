# Connector release verification record

This record separates executed validation from gates that still depend on the exact repository workspace or external accounts.

## Already established

- The connector package identity is `@hermes-memoria/x-connector` at version `0.1.0`.
- Source, built, and bin entrypoints execute the maintained CLI.
- Existing Node 24 and Node 26 CI passed on the base connector refactor before this distribution layer.
- The package payload is constrained to `bin/`, `dist/`, README, and LICENSE.
- The maintained `memoria-x` and compatibility `ft` bin contracts are covered by existing smoke tests.
- The release scripts are fail-closed for GitHub/tag identity, package identity, unexpected filenames, unsafe paths, checksum mismatch, and duplicate versions.
- Third-party Actions are pinned to exact commits resolved from their official repositories.

## Mandatory executable gates added by this PR

- Full `pnpm run check` on Node 24 and Node 26.
- Exact `pnpm pack` artifact generation on Node 24.
- Installation of the exact tarball into a fresh npm project.
- Import of the packaged module.
- Execution of npm-generated local `memoria-x` and `ft` shims.
- SHA-256 manifest generation and artifact upload.
- After publication, installation from npm into a fresh global prefix and execution of both global shims.

## External boundaries

- No package has been published.
- Ownership of the `@hermes-memoria` npm scope is not yet confirmed in this repository.
- The first package version requires a one-time authenticated bootstrap before trusted publishing can be configured.
- Live authenticated July 2026 X browser/API synchronization remains a separate canary and is not implied by package-distribution checks.

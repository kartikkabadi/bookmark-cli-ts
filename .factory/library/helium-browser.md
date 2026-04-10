# Helium Browser Support

## Architecture

Helium is built on **ungoogled-chromium** (confirmed via github.com/imputnet/helium-macos). This means:
- Cookie storage format: identical to Chrome (Chromium CookieDB schema)
- Keychain naming: follows Chromium convention `<ProductName> Safe Storage` / `<ProductName>`
- Cookie encryption: uses Chrome's v10/v11 AES-CBC scheme with OS-specific key storage
- Cross-platform paths: follow Chromium pattern (`.config/helium` on Linux, `AppData/Local/Helium/User Data` on Windows)

## macOS Keychain Entry

**Primary:** `Helium Safe Storage` / `Helium`
**Fallback:** `Helium Storage Key` / `Helium`

The entry name was determined by inference from the ungoogled-chromium codebase and Chromium naming conventions, NOT by direct verification against macOS Keychain on a machine with Helium installed. The `security find-generic-password -s 'Helium'` command returned no results on the development machine. The fallback entry (`Helium Storage Key`) covers the possibility of a non-standard entry name.

If Helium's actual keychain entry differs from both candidates, cookie extraction will fail with a keychain error. Testing on a machine with Helium installed would provide definitive confirmation.

## Linux secret-tool Mapping

In `chrome-cookies.ts`, the `appNames` record maps browser IDs to Linux keyring entries. Chromium-fork browsers without their own Linux keyring entry should map to `['chrome']`:

```ts
// chrome-cookies.ts getLinuxKeys() appNames record
helium: ['chrome'],  // no Linux-specific keyring entry; uses Chrome's
```

Only browsers that ship their own Linux key schema (Chrome, Chromium, Brave) have dedicated entries.

## Data Directories

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/net.imput.helium` |
| Linux | `~/.config/helium` |
| Windows | `AppData/Local/Helium/User Data` |

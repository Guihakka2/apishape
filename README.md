# apishape

[![npm](https://img.shields.io/npm/v/@guihakka2/apishape)](https://www.npmjs.com/package/@guihakka2/apishape) [![CI](https://github.com/Guihakka2/apishape/actions/workflows/ci.yml/badge.svg)](https://github.com/Guihakka2/apishape/actions/workflows/ci.yml)

English · [Português](README.pt-BR.md) · [日本語](README.ja.md)

Catch **breaking JSON API changes** before your users do. apishape saves the *shape* of each response (field paths and types) and fails CI when a field disappears or changes type.

Snapshots contain **no values** (no emails, ids or tokens), so they are safe to commit. No OpenAPI spec needed. Zero dependencies.

```bash
npx @guihakka2/apishape https://api.example.com/v1/users            # first run: saves the snapshot
npx @guihakka2/apishape https://api.example.com/v1/users            # later runs: compare
npx @guihakka2/apishape https://api.example.com/me -H 'Authorization: Bearer ${API_TOKEN}'
npx @guihakka2/apishape                                              # every endpoint in apishape.json
```

```
$ apishape
✗ users
    - $.users[].email  (removed)
    ~ $.users[].id  number → string
    + $.users[].avatar_url  (new)

Breaking changes found. If they are intended, run with --update and commit .apishape/.
```

The snapshot that gets committed (`.apishape/users.json`):

```json
{
  "status": 200,
  "shape": {
    "$": "object",
    "$.total": "number",
    "$.users": "array",
    "$.users[]": "object",
    "$.users[].email": "string",
    "$.users[].id": "number",
    "$.users[].last_login": "null|string",
    "$.users[].plan": "string"
  }
}
```

## Config file

`apishape.json`, for several endpoints, methods and headers. `${VAR}` comes from the environment (CI secrets) and is never printed or saved:

```json
{
  "endpoints": [
    { "name": "users", "url": "https://api.example.com/v1/users", "headers": { "Authorization": "Bearer ${API_TOKEN}" } },
    { "name": "search", "url": "https://api.example.com/v1/search", "method": "POST", "body": { "q": "test" } },
    { "name": "fixture", "file": "test/fixtures/order.json" }
  ]
}
```

## In CI (GitHub Actions)

```yaml
- run: npx @guihakka2/apishape
  env:
    API_TOKEN: ${{ secrets.API_TOKEN }}
```

## What counts as breaking

| Change | Result |
|---|---|
| Field removed | ✗ breaking |
| Field changed type (`number` → `string`, or now can be `null`) | ✗ breaking |
| HTTP status changed (`200` → `302`) | ✗ breaking |
| New field | `+` reported, fails only with `--strict` |
| Array empty this time | fields inside it are not reported as removed |
| Field that was always `null` now has a value | not breaking (the old sample just didn't show its type) |
| Map keys that are ids (`{"123": …}`, UUIDs) | grouped as `*`, not new fields |

## Download (no Node.js needed)

Don't have Node.js? Each [release](https://github.com/Guihakka2/apishape/releases/latest) has a standalone program for Windows (x64, ARM), macOS (Apple silicon, Intel) and Linux (x64, ARM). Download the file for your system, unzip it and run `apishape` from a terminal, with the same options as above.

The programs are built by GitHub Actions from this repository's code, with a `SHA256SUMS.txt` and a [build provenance attestation](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations) (`gh attestation verify <file> -R Guihakka2/apishape`). They are not code-signed with a paid certificate yet, so the first run shows a warning: on Windows, SmartScreen → "More info" → "Run anyway"; on macOS, run `xattr -d com.apple.quarantine apishape` once.

## Options

| Option | |
|---|---|
| `--update` | Save the current shapes as the new snapshots |
| `--strict` | New fields also fail |
| `-H, --header` | Header for URL arguments (`${VAR}` from env) |
| `--name` | Snapshot name for a single URL/file |
| `--config FILE` | Config file (default `apishape.json`) |
| `--timeout MS` | Request timeout (default 15000) |
| `--json` | Machine-readable output |

Exit codes: `0` no breaking change, `1` breaking change, `2` usage, network or file error.

## Security

See [SECURITY.md](SECURITY.md). Snapshots never hold values, secrets from `${VAR}` are never printed or saved, printed URLs drop the query string, redirects aren't followed (auth headers stay on your host), responses are capped at 10 MB.

## License

MIT · Part of [Guihakka Tools](https://github.com/Guihakka2/guihakka-tools)

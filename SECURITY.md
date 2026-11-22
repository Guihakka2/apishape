# Security Policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting:
**Security tab > Report a vulnerability** on this repository.
You will get a reply within 7 days.

## Design guarantees

- Snapshots store field paths and types only, never values, so they are safe to commit.
- Network access only to the URLs you list. No telemetry, zero runtime dependencies.
- `${VAR}` in URLs and headers is read from the environment, is never printed or saved, and a missing variable stops the run before any request is sent.
- Printed URLs drop the query string and user/password (they often hold API keys).
- Redirects are not followed, so auth headers never reach another host; a 3xx shows up as a status change.
- Responses are capped at 10 MB, requests time out (15 s default), nesting depth and path count are capped.
- Snapshot names are restricted to `[A-Za-z0-9._-]`, and local files must be inside the current folder (no path traversal).
- Terminal control characters are stripped from everything printed.
- npm releases are built by GitHub Actions with provenance; never by hand.

## Standalone executables

Release executables are built only by GitHub Actions (`binaries.yml`) from the tagged source with the official Node.js single executable application feature, smoke-tested, and published with a SHA256SUMS.txt and a build provenance attestation (`gh attestation verify <file> -R Guihakka2/apishape`). They are not code-signed with a paid certificate yet.

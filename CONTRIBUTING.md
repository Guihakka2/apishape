# Contributing

Thanks for helping! Rules that keep users safe:

1. Every change goes through a pull request reviewed by the maintainer.
2. **No new runtime dependencies** without an issue discussing it first.
3. Snapshots must never contain response values: add a test if you touch shape or output.
4. Run `npm test` before opening a PR (Node 20+). Tests use a local server, no internet needed.
5. Found a false positive? Add the two JSON samples as a test.

English first for code, issues and docs. Translations (pt-BR, ja) are welcome as separate PRs.

# Agent Instructions

## Commands

| Task | Command |
|------|---------|
| Unit tests | `npm test` |
| Typecheck | `npm run typecheck` |
| Full local check | `npm run check` |
| Real Pi E2E | `npm run test:e2e` |

## Key Conventions

- Keep this package a thin wrapper; do not copy `pi-web-access` source.
- Pin the bundled `pi-web-access` version exactly and commit `package-lock.json`.
- Capture upstream tools through the `ExtensionAPI` proxy so custom tool names continue to work.
- Deferred tools must not retain `promptSnippet` or `promptGuidelines`.
- Loader activation must be purely additive and preserve active-tool order.
- Do not load this package together with the original `pi-web-access` package.

## External References

| Need | File |
|------|------|
| User behavior and setup | `README.md` |
| Upstream attribution | `THIRD_PARTY_NOTICES.md` |

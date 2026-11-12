# pi-web-access-lazy

Lazy tool loading for [`pi-web-access`](https://github.com/nicobailon/pi-web-access).

Pi starts with one small `load_web_tools` tool. The search, verification,
fetch, and content-retrieval tools become active only after the model calls the
loader.

Reloading or resuming a session restores the web tools declared on its current
branch. Sessions that have not loaded web tools stay cold across reloads.
For the `joker-dmit` and `ryan-dmit` providers, web tools are enabled before
each agent run because their bridges require tool definitions at query start.

## Install

Remove the original package first. Installing both packages registers the same
commands and tools twice.

```bash
pi remove npm:pi-web-access
pi install npm:pi-web-access-lazy
```

`~/.pi/web-search.json` keeps the same format. Provider credentials, custom
tool names, commands, shortcuts, and curator behavior come from
`pi-web-access`.

## Cache behavior

The wrapper removes `promptSnippet` and `promptGuidelines` from deferred tools.
The loader keeps one stable snippet. On models with native tool search, Pi can
therefore inject the full tool definitions at the loader result without
changing its system prompt or top-level tool list.

On other models the tools still load correctly, but the next request contains
the expanded top-level tool list and may miss the previous prompt cache.

## Development

```bash
npm install
npm run check
npm run test:e2e
```

The E2E test starts a real Pi process with `openai-codex/gpt-5.6-sol`. It
requires working Pi authentication. Override the model with
`PI_WEB_LAZY_E2E_MODEL`.

## Upstream version

Version 0.1.1 bundles `pi-web-access` 0.18.0. Upstream is imported through a
small `ExtensionAPI` proxy; its implementation is not copied into this
repository.

## License

MIT. The bundled `pi-web-access` dependency retains its original MIT license
and copyright. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

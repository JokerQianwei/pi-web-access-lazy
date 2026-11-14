# pi-web-access-lazy

Lazy tool loading for [`pi-web-access`](https://github.com/nicobailon/pi-web-access).

For most providers, Pi starts with one small `load_web_tools` tool. The search,
verification, fetch, and content-retrieval tools become active after the model
calls the loader.

For `tencent-intranet` and `codebuddy`, all web tools are active from session
start to keep their definitions in the cached prefix. Switching to either
provider also activates the tools. Activation preserves existing tool order.

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

Channel policies are centralized in `lazy.ts`. Codex keeps the SDK's default
loading protocol: two real Pi comparisons per protocol with prefixes above
50,000 tokens preserved the warm cache with both `additional_tools` and
`tool_search_call/output`. The wrapper does not override Codex model capabilities.

The wrapper removes `promptSnippet` and `promptGuidelines` from web tools.
The loader keeps one stable snippet. On models with native tool search, Pi can
therefore inject the full tool definitions at the loader result without
changing its system prompt or top-level tool list.

On other models the tools still load correctly, but the next request contains
the expanded top-level tool list and may miss the previous prompt cache.

## Compact tool definitions

All four web tools expose shorter descriptions. Search and source-check
`provider` accept a string or a non-empty string array; omit it for the
configured default. Provider selection and normalization follow upstream behavior.

`fetch_content` exposes `url`, `urls`, `prompt`, and `mode`. Video options
`timestamp`, `frames`, `model`, plus `forceClone` and `answerModel`, are hidden
from model discovery; omitted values follow upstream defaults. Execution,
return formats, custom tool names, and stored-content pagination are unchanged.

## Development

```bash
npm install
npm run smoke
npm run check
npm run test:e2e
```

The E2E test starts a real multi-turn Pi RPC session with
`openai-codex/gpt-6.1-sol`. It warms the cache, loads tools, and fetches
`https://example.com`. It requires working Pi authentication. Override the
model with `PI_WEB_LAZY_E2E_MODEL`, for example
`tencent-intranet/claude-sonnet-5.5`. Set `PI_WEB_LAZY_E2E_LARGE=1` for a
synthetic prefix above 50,000 tokens; this increases token usage.
`PI_WEB_LAZY_E2E_SEARCH=1` selects the alternative Codex search path only
inside the test observer. Production code never changes that capability.

## Upstream version

Version 0.1.3 bundles `pi-web-access` 0.18.0. Upstream is imported through a
small `ExtensionAPI` proxy; its implementation is not copied into this
repository.

## License

MIT. The bundled `pi-web-access` dependency retains its original MIT license
and copyright. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

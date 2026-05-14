# Codex Tool Routing

This skill was originally designed for Claude Code with custom WebSearch/WebFetch and a local CDP proxy.
In Codex, the execution model is different:

- `web` already covers search, opening pages, finance/weather/sports lookups, and source attribution.
- `chrome_devtools` already covers controlled-browser interaction, screenshots, typing, uploads, and DOM-level inspection.
- The bundled Node scripts are now a fallback layer for attaching to the user's real Chrome session.

## Practical Mapping

| Original concept | Codex-native equivalent |
|---|---|
| WebSearch | `web.search_query` |
| WebFetch | `web.open` |
| Read/search-first, then fetch source | `web.search_query` followed by `web.open` |
| Dynamic page inspection | `chrome_devtools.take_snapshot` / `evaluate_script` |
| Click, type, fill, upload, screenshot | `chrome_devtools` interaction tools |
| Attach to user's already logged-in Chrome | bundled `scripts/check-deps.mjs` + `scripts/cdp-proxy.mjs` |

## Selection Heuristics

Use `web` when:

- The task is informational.
- The user wants current facts, links, or citations.
- No DOM interaction is required.
- You can satisfy the task from fetched page content.

Use `chrome_devtools` when:

- The page is rendered dynamically.
- You need UI state, screenshots, form entry, or uploads.
- You need to inspect elements or interact iteratively.

Use the bundled CDP proxy when:

- The workflow depends on the user's real Chrome profile.
- The user is already logged into a target site in their normal browser.
- Built-in browser state is not enough.
- A site works only in the user's existing browser session.

## Adaptation Notes

The strategic parts of the upstream skill were preserved:

- Goal-driven browsing instead of rigid step lists.
- Tool choice based on access constraints.
- Site-pattern accumulation for repeated workflows.
- Escalation from cheap access to heavy access only when needed.

The Claude-specific parts were intentionally not kept as primary mechanisms:

- Claude plugin metadata.
- Claude-only environment variable examples.
- Treating the custom CDP proxy as the default browser interface.

In Codex, the custom proxy is useful, but it is no longer the default.

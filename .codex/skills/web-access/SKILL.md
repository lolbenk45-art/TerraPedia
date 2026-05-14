---
name: web-access
description: Web research, page inspection, browser automation, authenticated-site access, and site-specific web workflows. Use when Codex needs to search the web, read a specific URL, verify claims from primary sources, interact with dynamic pages, operate websites, or fall back to the user's real Chrome session for login-dependent workflows.
---

# web-access

Use this skill as a routing layer, not as a fixed recipe.
Its main value is deciding which execution surface matches the task:

- `web` for search, source discovery, direct page fetch, and fast fact gathering.
- `chrome_devtools` for dynamic pages, UI inspection, screenshots, form filling, uploads, and browser interaction inside Codex's controlled browser.
- Bundled Node/CDP scripts only when the task specifically needs the user's real local Chrome session, existing login state, or a browser context that Codex's built-in browser cannot reproduce.

## Core Operating Model

Work from goal to method:

1. Define the success condition before touching tools.
2. Start with the cheapest path that can realistically satisfy the task.
3. Treat each result as evidence, not just success/failure.
4. Escalate only when the current access layer is insufficient.
5. Stop once the task outcome is satisfied; do not over-browse.

Do not prematurely lock into a tool because of wording like "search" or "scrape".
Choose the tool based on access requirements, not surface phrasing.

## Tool Routing In Codex

Load [codex-tool-routing.md](/C:/Users/Administrator/.codex/skills/web-access/references/codex-tool-routing.md) when you need the detailed mapping.

Default routing:

| Situation | Preferred path |
|---|---|
| Find sources, compare sources, verify recent facts | `web.search_query` then `web.open` |
| Read a known URL or cite exact source text | `web.open` |
| Need direct quotes, links, dates, or current information | `web` with primary sources |
| Page needs scrolling, clicking, typing, screenshots, or DOM inspection | `chrome_devtools` |
| Upload files or reproduce a UI flow in a browser | `chrome_devtools` |
| Site depends on the user's existing Chrome login/session | bundled CDP proxy scripts |
| Built-in browser is blocked but the user's local Chrome works | bundled CDP proxy scripts |

## Escalation Rules

Use this escalation ladder:

1. `web` search/fetch.
2. `chrome_devtools` if rendering or interaction is required.
3. Bundled Node/CDP scripts if the task needs the user's actual Chrome session.

Do not jump to the Node/CDP proxy just because a page is dynamic.
Use it only when there is a concrete reason:

- The user explicitly wants operations in their own Chrome profile.
- Authentication already exists in the user's normal browser and reproducing it elsewhere is wasteful.
- A site behaves differently in the built-in browser context.
- The task is inherently about operating the user's existing browser state.

## Authenticated Or Risky Sites

When browser automation on social or creator platforms could trigger anti-bot controls:

- State the risk plainly before continuing.
- Prefer read-only access when it satisfies the task.
- Minimize writes and repeated retries.
- Keep all work in isolated tabs/windows you create, and clean them up when done.

If login is required, ask for it only after confirming the target content cannot be accessed otherwise.

## Site Experience Files

Site-specific notes live under `references/site-patterns/`.
When the target domain is known, check whether a matching file exists before starting a long workflow.

Use the helper only when needed:

```powershell
node "$env:USERPROFILE\\.codex\\skills\\web-access\\scripts\\match-site.mjs" "user request or target url"
```

Treat these notes as heuristics, not guarantees.
If a recorded pattern fails, fall back to general reasoning and update the site note only with facts you verified.

## Bundled CDP Proxy Fallback

Load [cdp-api.md](/C:/Users/Administrator/.codex/skills/web-access/references/cdp-api.md) only if you need the bundled proxy.

Use this path when Codex's built-in browser is not the right execution surface and the user's real Chrome session matters.

Typical flow:

1. Check runtime dependencies:

```powershell
node "$env:USERPROFILE\\.codex\\skills\\web-access\\scripts\\check-deps.mjs"
```

2. If Chrome remote debugging is not available, tell the user to open:

```text
chrome://inspect/#remote-debugging
```

and enable `Allow remote debugging for this browser instance`.

3. Start or reuse the local proxy through the same `check-deps.mjs` script.
4. Call the HTTP endpoints from `references/cdp-api.md`.
5. Close only the tabs you created.

## Evidence Standard

Prefer first-party sources whenever possible:

- Official docs for tool behavior.
- Original pages for factual claims.
- Company, government, standards, or project sources for authoritative statements.

Search results are discovery tools, not proof.
Once the source is located, read the source itself.

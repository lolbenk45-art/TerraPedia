# Bundled CDP Proxy API

Use this reference only when you need the bundled fallback that attaches to the user's real local Chrome session.

## Purpose

The bundled proxy exposes a small HTTP API over Chrome DevTools Protocol so the agent can:

- open background tabs in the user's Chrome instance
- run JavaScript in a page
- click or scroll the page
- upload files through file inputs
- capture screenshots
- reuse the user's existing login state

This is not the default path in Codex.
Prefer `web` and `chrome_devtools` first.

## Runtime

Dependency check and proxy bootstrap:

```powershell
node "$env:USERPROFILE\\.codex\\skills\\web-access\\scripts\\check-deps.mjs"
```

Default proxy address:

```text
http://127.0.0.1:3456
```

If Chrome remote debugging is not available, have the user open:

```text
chrome://inspect/#remote-debugging
```

and enable `Allow remote debugging for this browser instance`.

## Main Endpoints

List current page targets:

```powershell
curl.exe -s "http://127.0.0.1:3456/targets"
```

Create a new background tab:

```powershell
curl.exe -s "http://127.0.0.1:3456/new?url=https://example.com"
```

Read page metadata:

```powershell
curl.exe -s "http://127.0.0.1:3456/info?target=TARGET_ID"
```

Evaluate JavaScript in the target page:

```powershell
curl.exe -s -X POST "http://127.0.0.1:3456/eval?target=TARGET_ID" -d "document.title"
```

Click an element by CSS selector using `el.click()`:

```powershell
curl.exe -s -X POST "http://127.0.0.1:3456/click?target=TARGET_ID" -d "button.submit"
```

Click using real mouse events:

```powershell
curl.exe -s -X POST "http://127.0.0.1:3456/clickAt?target=TARGET_ID" -d "button.upload"
```

Set files on a file input:

```powershell
curl.exe -s -X POST "http://127.0.0.1:3456/setFiles?target=TARGET_ID" -d "{\"selector\":\"input[type=file]\",\"files\":[\"C:/path/to/file.png\"]}"
```

Scroll:

```powershell
curl.exe -s "http://127.0.0.1:3456/scroll?target=TARGET_ID&direction=bottom"
```

Capture a screenshot:

```powershell
curl.exe -s "http://127.0.0.1:3456/screenshot?target=TARGET_ID&file=C:/Temp/shot.png"
```

Navigate an existing tab:

```powershell
curl.exe -s "http://127.0.0.1:3456/navigate?target=TARGET_ID&url=https://example.com"
```

Close a tab you created:

```powershell
curl.exe -s "http://127.0.0.1:3456/close?target=TARGET_ID"
```

## Operating Rules

- Create your own tabs instead of hijacking the user's existing ones.
- Reuse full URLs produced by real in-site navigation when available.
- Close only the tabs you created.
- Do not stop the proxy unless there is a reason; reconnecting can require Chrome authorization again.

## Failure Modes

- `chrome: not connected`: Chrome remote debugging is not available.
- Proxy timeout: Chrome may be showing an authorization prompt.
- `attach failed` or command timeout: the tab no longer exists, or the page is stalled.
- A site saying content does not exist may indicate access pattern failure rather than true absence.

---
name: error-fast-locator
description: Rapidly triage high-noise failures into minimal, high-signal diagnostics for LLM handoff. Use when Codex sees network errors, missing files, wrong paths, command-not-found output, DNS failures, timeouts, permission errors, import/module lookup failures, or similar execution errors and needs to localize root cause while minimizing token usage.
---

# Error Fast Locator

Use this skill to avoid pasting full logs into context. Extract only the lines and checks that materially improve root-cause localization.

## Workflow

1. Classify the failure first.
   Common buckets:
   - network
   - dns
   - timeout
   - file-not-found
   - path-invalid
   - permission
   - command-not-found
   - import/module-not-found
   - auth
   - unknown

2. Capture only high-value facts.
   Keep:
   - the exact failing command, URL, file path, module name, host, port, or environment variable
   - the first explicit error line
   - 3-8 nearby lines with stack or stderr context
   - the current working directory if path-related
   - the concrete missing artifact if any

   Drop:
   - full stack traces when the top error already identifies the missing dependency or path
   - repeated retry noise
   - progress bars, banners, install spam, and unrelated warnings

3. Run the compression script when logs are noisy.

```powershell
python scripts/analyze_error.py --text "<raw error text>"
```

Or:

```powershell
python scripts/analyze_error.py --file path\to\error.log
```

4. Return the compressed diagnosis to the main LLM loop.
   Prefer this structure:
   - `category`
   - `root_cause_guess`
   - `evidence`
   - `next_checks`
   - `llm_handoff`

## Fast Rules

- If the error names a missing file or directory, verify the path before reading more logs.
- If the error names a command or executable, verify PATH and local installation before deeper analysis.
- If the error names a host, DNS, port, timeout, proxy, or TLS issue, classify as network-family and inspect connectivity facts only.
- If the error is `EACCES`, `EPERM`, `Permission denied`, or access-related, inspect permissions and ownership before application logic.
- If the error is `ModuleNotFoundError`, `Cannot find module`, or import-related, inspect environment, package manager, and interpreter mismatch before code changes.
- If there are multiple errors, localize the first causal error, not the last cascade error.

## Output Discipline

When reporting back to the LLM, keep the summary under 20 lines unless the failure is genuinely ambiguous.

Preferred handoff template:

```text
category: ...
root_cause_guess: ...
evidence:
- ...
- ...
next_checks:
- ...
- ...
llm_handoff: Minimal context needed for the next reasoning step.
```

## References

- For pattern-to-category mapping and check order, read `references/common-error-patterns.md`.
- For log compression, run `scripts/analyze_error.py` instead of manually pasting long stderr output.

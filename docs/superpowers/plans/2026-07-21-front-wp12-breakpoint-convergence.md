# Front WP-12 Breakpoint Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge only near-miss `@media` width breakpoints under a ≤24px hard cap, then freeze the surviving set with a source contract — without responsive redesign.

**Architecture:** Survey is limited to `@media` `(min|max)-width: Npx` (component `max-width` layout props are out of scope). Fresh measurement at `44b78477` shows 14 distinct max media boundaries and 3 min media boundaries. The only pair within 24px is `1020`/`1024` (Δ4); merge `1020 → 1024` (conventional value) and update the crafting structure marker. All other values — including force-leave examples 760/780/820/900/1080 and independent minors 640/520/980/860/430 plus complements 721/861 and independent min 960 — stay. A new `check-breakpoint-whitelist-contract.mjs` freezes the post-merge set and joins `pnpm run check`.

**Tech Stack:** Node source contracts, CSS `@media`, pnpm, optional theme-token parity.

**No-write boundary:** No push/merge/main, no crawler/DB writes, no port 13012/5181. Backend read-only (stack-assigned, currently 18091). Candidate port `15187` if runtime evidence is collected.

## Fresh survey (`@media` only, base `44b78477`)

| max-width | count | action |
|---|---|---|
| 720 | 21 | KEEP (dominant) |
| 1180 | 11 | KEEP (dominant) |
| 640 | 6 | KEEP (independent minor) |
| 520 | 5 | KEEP (independent minor) |
| 980 | 4 | KEEP (independent minor) |
| 860 | 2 | KEEP (has min 861 complement) |
| 430 | 2 | KEEP (no neighbor ≤24) |
| 1080 | 1 | KEEP (force-leave example) |
| 760 | 1 | KEEP (force-leave; Δ20 from 780 but both force-leave) |
| 780 | 1 | KEEP (force-leave) |
| 820 | 1 | KEEP (force-leave) |
| 900 | 1 | KEEP (force-leave) |
| 1020 | 1 | **MERGE → 1024** |
| 1024 | 1 | KEEP (merge target) |

| min-width | count | action |
|---|---|---|
| 721 | 1 | KEEP (complement of 720) |
| 861 | 1 | KEEP (complement of 860) |
| 960 | 1 | KEEP (independent; no max 959) |

**Post-merge frozen max set:**  
`430, 520, 640, 720, 760, 780, 820, 860, 900, 980, 1024, 1080, 1180`

**Post-merge allowed min set:**  
`{N+1 for N in frozen max}` ∪ `{960}`  
= `431, 521, 641, 721, 761, 781, 821, 861, 901, 981, 1025, 1081, 1181, 960`

---

### Task 0: Baseline + plan checkpoint

- [ ] **Step 1:** Verify branch `feat/front-p2-wp12-breakpoints` at `44b78477`, `local-stack.config.json` present, deps installed.
- [ ] **Step 2:** `cd front-nuxt && pnpm run check` (expect exit 0). Re-run survey script mentally: only one merge site `crafting.css` `@media (max-width: 1020px)`.
- [ ] **Step 3:** Create devlog `docs/devlog/entries/2026-07-21-front-wp12-breakpoint-convergence.md` (in_progress) + commit plan+devlog: `docs(front): plan wp12 breakpoint convergence`.

### Task 1: RED — whitelist contract + crafting marker

- [ ] **Step 1:** Create `front-nuxt/scripts/check-breakpoint-whitelist-contract.mjs` that:
  1. Walks `assets/css/**/*.css`, `pages/**/*.vue`, `components/**/*.vue` (skip node_modules/.nuxt).
  2. Parses only `@media` condition lists for `(min|max)-width: Npx`.
  3. Allows max N only if N ∈ FROZEN_MAX; min N only if N ∈ ALLOWED_MIN.
  4. Ignores non-width media features.
  5. On violation: print `path:line prop:Npx not in whitelist` and exit 1.
  6. Also asserts the merge happened: no remaining `@media` max-width:1020px; at least one max-width:1024px remains.
- [ ] **Step 2:** Wire into `package.json`:
  - `"check:breakpoints": "node scripts/check-breakpoint-whitelist-contract.mjs"`
  - insert `pnpm run check:breakpoints` into the `check` script after `check:css-ratchet` (or before typecheck).
- [ ] **Step 3:** Update `scripts/check-crafting-structure-contract.mjs` marker  
  `'@media (max-width: 1020px)'` → `'@media (max-width: 1024px)'`.
- [ ] **Step 4:** Observe RED: breakpoints contract fails (1020 still present OR 1024 assertion depending on order — expect fail on residual 1020 after we add the "no 1020" rule while CSS still has 1020). Crafting structure still green until CSS changes if only marker updated... **Order:** first add whitelist with frozen set including 1024 and ban 1020; CSS still has 1020 → RED. Crafting marker update alone would RED crafting until CSS merge — do marker update in same RED commit as contract, observe crafting RED too, then GREEN merges CSS.
- [ ] **Step 5:** Commit: `test(front): lock breakpoint whitelist and 1024 merge marker`.

### Task 2: GREEN — apply merge

- [ ] **Step 1:** In `assets/css/domains/crafting.css`, replace  
  `@media (max-width: 1020px)` → `@media (max-width: 1024px)` (one occurrence).
- [ ] **Step 2:** Confirm no other `max-width: 1020px` inside `@media` remains (`grep -rn` across assets/pages/components).
- [ ] **Step 3:** Run `node scripts/check-breakpoint-whitelist-contract.mjs`, `node scripts/check-crafting-structure-contract.mjs`, `pnpm run check` — all exit 0.
- [ ] **Step 4:** Commit: `feat(front): merge media max-width 1020 into 1024`.

### Task 3: Validation evidence

- [ ] **Step 1:** Optional candidate on 15187: smoke HTTP 200 for `/`, `/items`, `/crafting`, `/articles` at default viewport (structural; no redesign).
- [ ] **Step 2:** If backend up, optional 18-record theme-token parity compare is **not required** (4px media shift on crafting-only rule is outside the parity route matrix `/`,`/items`,`/armor-sets`). Record residual: crafting layout collapses at 1024 instead of 1020 (≤24px, approved).
- [ ] **Step 3:** Document post-merge survey in devlog (frozen lists above).

### Task 4: Closeout

- [ ] Close devlog entry; update `docs/devlog/current.md` (Active Focus → WP-13; Next Agent → WP-13 long-page governance; Recently Closed WP-12).
- [ ] Final `pnpm run check`; commit `docs(devlog): close wp12 breakpoint convergence`.
- [ ] No push/merge/cleanup.

## Self-review

- Spec ≤24px hard cap: only 1020/1024 qualifies ✔  
- Force-leave 760/780/820/900/1080: kept ✔  
- Complements 721/861 preserved as pairs ✔  
- Independent 640/520/980 (+860/430/960) kept ✔  
- Whitelist contract with max N + min N+1 (+960) ✔  
- No responsive redesign ✔

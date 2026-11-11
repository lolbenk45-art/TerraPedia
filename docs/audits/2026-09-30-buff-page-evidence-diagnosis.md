# Buff page evidence diagnosis

Status: source diagnosis and attribution repair validated; canonical ingestion blocked.

## Evidence and result

The full `b1-a63-20260929-08` crawl finished 400/400 on 2026-09-29 at
23:41 CST. All 400 parsed page records carry revisions. Its source-file hash
matches the terminal classification report. Completion establishes collection,
not NPC immunity completeness.

- Frozen source: `.local/tmp/b1-a63-20260929-08/raw/template__getbuffinfo.parsed.latest.json`
- Source SHA-256: `76492e8414f58a66a23751a24e1ebd99079ee513513c14f49a9464b83f9ad751`
- Original result: 30 parsed immunity sections, 370 missing, zero proved
  not-applicable. The 370 comprise 310 buffs and 60 debuffs.
- There are 309 distinct canonical pages for 400 Buff IDs. A shared page is
  not sufficient to bind its immunity list to every Buff on that page.
- Bounded runs `b1-a63-20260930-09`, `-10`, and `-11` captured 31 raw pages
  for 34 IDs: every original parsed-immunity record and four missing-section
  examples. Each `capture.json` binds the frozen input hash, selected IDs,
  page revision and raw-file hash. HTML, wikitext and section metadata are
  retained, unlike the earlier full fetch's parsed-only per-page records.
- Final replay: `.local/tmp/buff-source-diagnosis-20260930-v3.json`, generated
  by `.local/tmp/analyze-buff-evidence-20260930.mjs`. It validates all capture
  hashes and source bindings before replay. Result: **28 parsed sections with
  matching target labels, 370 missing sections, 2 target mismatches**.
  Hence 372 records remain unresolved. No not-applicable claim was created.
- The earlier non-v2 diagnostic replay temporarily rejected Life Drain's
  explicit display alias. It was superseded by v2; v3 adds fail-closed target
  validation with the same 28/372 result. Raw captures were not changed.

These paths are relative to the Buff worktree. Raw/replay artifacts remain
ignored local evidence; this document preserves the findings. Matching a label
proves section attribution, not the completeness of every upstream claim or
all fields required by ingestion.

## Confirmed defects and source limits

| Case | Revision-bound evidence | Result |
| --- | --- | --- |
| Dryad's Blessing, ID 165 | `Dryad's Blessing` revision `1029403` contains `{{immunities\|Dryad's Bane}}`; the rendered heading names Dryad's Bane | Its 22 NPC rows belong to ID 186. They must not be assigned to ID 165. |
| Stardust Cell, ID 182 | `Stardust Cell Staff` revision `1027585` contains `{{immunities\|Celled}}`; the rendered heading names Celled | Its 22 NPC rows belong to ID 183. They must not be assigned to ID 182. |
| Midas, ID 72 | The page explicitly describes an effect on enemies but contains no immune-NPC section | A missing section cannot imply the effect is player-only or not-applicable. |
| Potion Sickness, ID 21 | The page describes a player healing-item cooldown | It supplies semantic context; absence of an NPC section alone remains insufficient for a verified negative applicability contract. |
| Leather Whip, ID 307 | The selected source is a weapon page for an NPC-targeting debuff | Item-page membership cannot establish non-applicability. |
| Life Drain, ID 151 | `{{immunities\|Life Drain\|name=the Life Drain buff}}` supplies an explicit display alias | The rendered alias must not be mistaken for a different target. |

The two wrong assignments were present in the new source artifacts; this audit
does not assert that the current database has the same errors. No database row
was changed to repair them.

The original parser located the first immune-NPC heading and extracted its
entire list without checking which Buff the template targeted. It also reports
page-level `parseStatus=parsed` when a fact group is `section_missing` because
`unresolvedFacts` originally covered present-but-empty sections. That status is
not immunity acceptance. Repeatedly fetching unchanged pages cannot supply
missing source semantics.

## Implemented containment and evidence capture

- `pipelines/fetch/capture-buff-page-evidence.mjs` requires 1–20 distinct
  explicit Buff IDs and a fresh output directory. It deduplicates shared
  pages, requires revision binding, preserves private atomic raw artifacts,
  and writes a manifest with hashes. It does not patch standardized inputs or
  invoke imports. Its progress uses the existing registered Buff action,
  mirrors explicit paths to canonical progress, emits heartbeats and terminal
  status, and serializes Redis progress writes.
  Both custom and canonical progress destinations are checked before creating
  output or publishing progress: they cannot alias the input or occupy the
  capture directory, including paths through existing symbolic-link ancestors.
- `pipelines/fetch/buff-immunity-page-parser.mjs` binds explicit immunity
  template targets and rendered English target labels to the selected Buff.
  It understands literal main-page `PAGENAME` and explicit display aliases;
  it does not evaluate arbitrary nested templates. Known mismatch, ambiguity,
  or an unverified target in an identified Buff's present immunity section
  produces an empty unaccepted list, `parse_incomplete`, and an explicit
  `target_mismatch` / `target_ambiguous` / `target_unverified` fact-group status.
  An absent immunity section remains `section_missing`.
- `pipelines/relation/buff-source-applicability.mjs` retains these cases as
  unknown even if a caller supplies a not-applicable claim. Existing missing
  section requirements are unchanged.
- The classifier and `normalizeBuffPageEvidence` also reject explicitly
  unresolved binding even if a producer sets the group to `parsed`.
  Historical evidence without the new binding field is not retroactively
  certified. The legacy `parseBuffPageImmunityFacts` helper has no active
  runtime caller and remains an explicitly deferred compatibility limitation.
  Anonymous parser-only calls retain extraction compatibility; they cannot
  pass the normalizer with an explicit unverified binding.

See git for code-level diff details. No historical L1/L2, landing, maint,
relation, projection or policy artifacts were rewritten. Historical L1/L2
reports remain execution records; their existence does not certify today's
source semantics or active promotion state.

## Remaining ingestion work

1. Define and validate per-fact-group applicability using explicit positive or
   negative source assertions with Buff identity, page/revision, raw hash and
   verifier provenance. Do not promote category membership, Buff/debuff type,
   a self-labelled contract object, or an absent section as proof.
2. Reconcile acceptance contracts: `normalizeBuffPageEvidence` in
   `pipelines/relation/sync-buffs-to-relation.mjs` requires a parsed immunity
   section for every executable row. The separate classifier's not-applicable
   label does not currently satisfy that importer. A design that preserves
   unknown NPC facts and publishes only separately verified facts requires an
   explicit contract change and review, not a crawler-side bypass.
3. Reconcile source-item coverage before any whole-domain replacement. Both
   recent 400-record sources contain 184 source-item entries on 33 Buffs;
   the retained 388-record standardized input has 407 entries on 190 Buffs.
   These are different evidence layers, not a proved deletion set.
   The former `buildBuffRecords` preferred a present empty page source-item
   array over its module fallback. The continuation below repairs that loss
   without accepting the old module snapshot as fresh source authority.
4. After the source contracts are complete, rebuild candidates and run fresh
   runtime/ownership/after-set checks under the separate ingestion authority.
   This task generated no candidate, packet, permit or ingestion decision.

## Validation

- Fresh authenticated backend preflight: disabled scheduler, zero live
  attempts/sweep claims, healthy reconciler. No parallel crawler/DB writer was
  observed before launching the bounded runs.
- All three capture runs completed; final progress is `completed`, 5/5 pages
  for the last six IDs. Earlier full-run evidence remains independently frozen.
- Tests cover default/custom progress, pre-request visibility, no overwrite,
  terminal failure, wrong targets, multiple targets, comments, section scope,
  literal page name, rendered headings, display aliases, unverified targets,
  and input/output progress-path collisions. Added defect regressions were
  observed failing before their fixes. Existing synthetic success fixtures now
  include explicit target headings or templates.
- Node 22 broad Buff fetch/relation/landing regression: **241/241 passed**;
  log `.local/tmp/buff-evidence-final-regression-v3.log`. Targeted review-fix
  tests: **129/129 passed**. `git diff --check` passed.
- Independent read-only re-review (`buff_source_review`) confirmed both
  important fixes, 129 focused tests, all manifest/raw hashes and 34 v3 replays;
  no new critical/important findings. Dedicated heartbeat/Redis-order tests and
  legacy-helper retirement remain minor follow-ups, not source completeness proof.
- Final process inspection found no active Buff capture/full-crawl/finalizer
  Node process. Canonical progress remains `completed` with last heartbeat
  `2026-09-29T16:19:35.087Z` (2026-09-30 00:19 CST). This final check reads
  the progress file and process table; it does not renew the earlier
  authenticated backend preflight or DB health evidence.
- Canonical ingestion remains blocked; no database/import or scheduler control
  write was performed.

## Directional source contract replay — 2026-09-30

The revision-bound NPC-page contract is now covered by
`pipelines/fetch/buff-npc-page-evidence.mjs`. It validates page and revision
identity, NPC auto ID and page scope, and exactly one selected Buff identity;
it emits only `inflicts` facts from NPC infobox `debuff` fields. The rendered
NPC `Immune to` cell is deliberately outside this contract.

The Wall of Flesh fixture emits two facts from revision `1032375`:

```text
Wall of Flesh --inflicts--> Horrified (Buff 37)
Wall of Flesh --inflicts--> The Tongue (Buff 38)
```

The new Npcinfo verifier accepts a complete immunity source only when its
manifest declares `scopeCompleteness=all-npc-rows`,
`fieldSemantics=buffImmune-exhaustive`, and an exact `npcCount`. The retained
`.15` manifest has none of those declarations, so its verified result remains
`positive-assertions-only`; its 1,417 assertions across 21 Buff IDs cannot be
interpreted as complete empty lists for absent IDs.

The final offline replay is `.local/tmp/buff-directional-source-replay-20260930-v4.json`
(SHA-256 `sha256:7a8801865f11d4cf315c3bb2f7e070ee0fd87ebbd8d1305f68c50e42421f2493`),
generated by `.local/tmp/replay-buff-directional-source-20260930.mjs`. It
revalidated the frozen 400-Buff input, the Wall of Flesh raw hash
`sha256:f3020fc1d6f39bfcc00355ac908bec50f398cf5d1c5da538f311b08eb2f9a838`,
and the `.15` revision-bound Npcinfo capture before composition. Results are
28 matched / 372 unknown and 19/400 normalizer admissions, with rejection
reasons of 365 incomplete groups, 14 missing immunity sections, and 2
unresolved target bindings. The directional composition keeps NPC infliction
and Buff immunity evidence in separate provenance groups and creates no
canonical merged list. No landing, maint, relation, projection, candidate,
packet, permit, scheduler, Redis-control, standardized-data, or database write
was performed.

## Source-item coverage continuation

The retained 388-record standardized payload and the collected 400-record
payload are different evidence layers. Exact comparison identifies **161 Buffs
with 242 retained source-item rows whose new page lists are empty**. Every one
of those new lists has `factGroups.sourceItems.status=section_missing`.

There are two independent causes of the gap:

1. The `.08` run manifest points `sharedDataRoot` to its isolated `shared/`
   directory, where no Iteminfo module input exists. The fetched Buff page
   result therefore has no local module fallback to consult.
2. Before this repair, `buildBuffRecords` used null-coalescing selection, so an
   empty page array suppressed module rows even when a fallback was supplied.

An offline comparison against the available shared Iteminfo snapshot matches
all **242 retained entries by item ID**. That module was fetched on
2026-07-15, has revision timestamp `2026-03-09T22:52:58Z`, and has **no revision
ID**. Matching historical IDs explains the coverage difference; it does not
prove those relationships remain correct today. No old rows were copied into
standardized data or the database.

- Immutable comparison: `.local/tmp/buff-source-items-20260930/coverage.json`.
  `input-1.json`, `input-2.json`, and `input-3.json` preserve the exact fetched,
  retained-standardized, and module bytes with hashes in the report.
- Reproducer: `.local/tmp/audit-buff-source-items-20260930.mjs`; it creates a
  fresh directory and refuses to overwrite its prior diagnostic run.
- Repaired `buildBuffRecords` keeps positive page rows first; otherwise it
  preserves available module candidates. `sourceItemsSource` distinguishes
  `buff-page-causes`, `iteminfo-module`, and no positive source (`null`).
- A missing, empty or unverified page source group sets assembled evidence to
  `parse_incomplete` and retains an unresolved `sourceItems` fact. Original
  page evidence and unrelated failures are preserved. The existing runtime
  normalizer rejects these records; no import rule was relaxed.
- Replay without a module remains 184 entries / 33 Buffs, with all 367 missing
  source-item groups explicitly unresolved. Replay with the comparison module
  preserves **426 entries / 194 Buffs**, including 161 module-fallback Buffs;
  **all 161 remain incomplete**. Neither replay is an ingestion candidate.
- The immunity diagnosis remains **28 matched / 372 unknown**. This source-item
  repair supplies no missing immunity-applicability evidence.
- Six added regressions were verified RED against the pre-fix builder, then
  GREEN. Focused suite: 17/17; broader Buff suite: **247/247** in
  `.local/tmp/buff-source-items-regression.log`. Independent reviewer
  `buff_source_review` confirmed 17/17 focused tests, all three frozen input
  hashes and builder hash, the 426/194 replay and normalization rejection of
  all 161 fallback Buffs. No critical/important findings remain in this delta.

At this checkpoint the next source work was to bind a fresh Iteminfo revision/raw
hash and individual `buffType` item assertions; the following capture completes
that evidence collection, while runtime acceptance remains separate.
The shared `fetchWikiModuleContent` helper currently requests only
`rvprop=content|timestamp` and returns no revision ID, so rerunning that helper
unchanged cannot meet this evidence contract. A revision-bearing capture is
required; no shared helper or other domain was changed in this continuation.
The independent 372-record immunity gap still requires per-fact applicability
or a separately reviewed partial-fact ingestion contract. Historical L1/L2
and existing database rows remain untouched.

## Fresh Iteminfo assertions

The bounded `b1-a63-20260930-12` run completed one fixed
`Module:Iteminfo/data` capture at 2026-09-30 01:03 CST, exit 0. The existing
page-fetch helper binds its HTML/wikitext response to the selected page and
revision. The capture CLI now accepts explicit `--source-kind=iteminfo` for
one module resource and 1–1000 unique input Buff IDs; it rejects `--ids` in
this mode. Default Buff-page mode remains bounded to 1–20 explicit IDs.

- Page ID: `18021`; revision: **1023241**; timestamp:
  `2026-08-22T03:26:22Z`. Captured at `2026-09-29T17:03:04.012Z`.
- Raw: `.local/tmp/b1-a63-20260930-12/page-001.json`.
- Raw SHA-256:
  `15213c1624afc3316fc1b38f72e926e9d7d1edae0adea1597aad23b848ff9549`.
- Manifest: `.local/tmp/b1-a63-20260930-12/capture.json`, bound to the
  same frozen 400-Buff input; no canonical source file was overwritten.
- Field-level report: `.local/tmp/b1-a63-20260930-12/source-assertions.json`;
  verifier `.local/tmp/verify-buff-iteminfo-20260930.mjs` binds manifest/raw/input/
  prior-comparison hashes and records each numeric item key's `buffType`, Buff
  identity, revision and raw hash. It writes a new report only.
- **249 explicit positive item assertions across 167 Buffs**, all in input scope.
  All **242 retained comparisons confirm the same item ID → Buff ID**; zero
  changed targets or unestablished comparisons in that selected set.
- Four additional assertions versus the old module: item `6148` → Buff `389`,
  `6149` → `390`, `6161` → `393`, `6164` → `394`.
- Diagnostic replay preserves **430 source-item entries across 198 Buffs**.
  All **165 module-fallback Buffs remain incomplete** under the existing builder/
  normalizer. No module fact was promoted through a page-evidence bypass.

These are positive source assertions, not complete lists of every cause. An
item with no `buffType` in this module does not prove that it cannot cause a
Buff through another mechanic. The unchanged page evidence therefore retains
its own provenance and missing-section states; immunity remains 28 matched /
372 unknown. The next implementation boundary is a separately validated
module-source fact-group contract, followed by applicability/partial-fact
ingestion design. This capture generated no candidate, permit or DB mutation.

Authenticated preflight immediately before capture confirmed scheduler disabled,
0 live attempts / 0 sweep claims, healthy reconciler and unchanged policy/epoch
(`.local/tmp/buff-iteminfo-preflight-20260930.json`). Authenticated overview
afterward confirms Redis-backed Buff progress readable, completed 1/1, matching
the `.12/capture.json` report and heartbeat `2026-09-29T17:03:04.100Z`; evidence
is `.local/tmp/b1-a63-20260930-12/monitor-readback.json`. No other active crawler
was present at launch. The capture process exited; no additional crawler remains
from this run.

Three new mocked capture regressions were observed RED then GREEN. Capture
tests pass **15/15**, broad Buff regression **250/250** in
`.local/tmp/buff-iteminfo-regression.log`; independent pre-run review found no
critical/important issues. Post-capture reviewer `buff_source_review` independently
verified all nine artifact/code/snapshot hashes, the 249 assertions, all 242
retained mappings and four additions, 430/198 replay and normalization rejection
of all 165 fallback Buffs. No critical/important findings remain. Iteminfo-specific
empty/1000/1001 selector boundary tests remain a minor coverage follow-up; the
validation code enforces those limits. The existing shared module-fetch helper
and other domains were not changed.

## Source contract assembly checkpoint

The verified Iteminfo assertions are now accepted by the pure Buff record builder
as a separate evidence input. Page-derived source items keep precedence; when the
page group is missing, revision-bound Iteminfo rows are selected and marked
`sourceItemsSource=iteminfo-revision-bound`. The source evidence retains
`sourceItemEvidence` with module page/revision/raw hash. The overall record stays
`parse_incomplete` while any page fact (especially immunity) is unresolved.

- Verifier: `pipelines/fetch/buff-iteminfo-evidence.mjs`.
- Assembly replay: `.local/tmp/b1-a63-20260930-12/assembled-source-contract-v2.json`,
  generated by `.local/tmp/assemble-buff-source-contract-20260930.mjs`.
- Result: 400 records; **165** use revision-bound Iteminfo source rows and 33 use
  positive page source rows; **430 source-item entries** total. All 165
  revision-bound records remain incomplete, so this is not an import candidate.
- Actual normalizer result: **13 accepted / 387 rejected**. Rejections include
  363 incomplete page records, 12 missing immunity sections, six unresolved target
  bindings and six duplicate NPC page identities. The 28 attribution matches do
  not equal executable rows.
- Immunity applicability remains **28 attributed / 372 unknown**. No candidate,
  landing packet, permit, DB or scheduler mutation was created.

The next safe action is to repair the source-group contract and duplicate identity
policy, then rebuild a reviewed candidate; no partial DB apply is authorized by
this checkpoint. Focused verifier tests and the broad Buff suite pass 254/254.

## Source-contract hardening

The builder now verifies the capture bytes itself instead of accepting caller-built
assertion maps. `buildBuffRecords({ iteminfoCapture })` rechecks the exact input,
manifest and raw hashes, selected Buff identities, module page/revision and every
positive `buffType`; it then attaches per-Buff `sourceItemEvidence`. Zero
`buffType` is ignored as no positive assertion, while malformed positive IDs,
identities, durations and duplicate Buff/item identities fail closed.

- The assembled v3 replay is `.local/tmp/b1-a63-20260930-12/assembled-source-contract-v3.json`.
  It matches v2: 165 revision-bound source-item Buffs, 33 page-source Buffs,
  430 entries, 13 normalizer accepted and 387 rejected.
- Focused verifier suite is 5/5; broad Buff fetch/relation/landing suite is
  **255/255** in `.local/tmp/buff-source-contract-regression-v2.log`.
- No source-group completeness, negative applicability, candidate, packet, permit,
  database or scheduler claim is introduced. The capture remains positive-only.
- Post-hardening review by `buff_source_review` passed combined focused tests
  22/22, independent v3 replay, and `git diff --check`; no critical/important
  findings. Minor residual: the verifier does not compare manifest page ID or
  raw requestedPageTitle/API URL, while fixed module title/page ID and the
  revision-bound fetch contract still hold.

## Duplicate rendered identity containment

Six captured Buff pages rendered the same NPC page identity twice (the `Golem`
entry appears once per version presentation). The relation normalizer correctly
rejected these duplicate keys, but the duplicate was representational rather
than a second NPC identity. `parseBuffPageEvidence` now keeps the first stable
`pageTitle`/`internalName` identity, exposes `immuneNpcRawCount`, and reports
`immuneNpcCount` as the unique identity count. The legacy extraction helper
continues to preserve raw duplicate entries for compatibility; only the
identity-bound evidence path deduplicates.

- RED/GREEN regression: `rendered duplicate version entries collapse to one
  stable NPC identity`.
- Assembly replay: `.local/tmp/b1-a63-20260930-12/assembled-source-contract-v5.json`.
  Result: 400 records, 430 source-item entries, 28 attributed / 372 unknown
  immunity records, **19 normalizer accepted / 381 rejected**. Duplicate-identity
  rejection is gone from the replay; remaining rejection reasons are 363
  incomplete page records, 12 missing immunity sections and six unresolved target
  bindings.
- Buff regression suite: **256/256**; no candidate, packet, permit, DB or
  scheduler write. Deduplication does not create applicability or completeness
  evidence.
- `buff_source_review` re-review passed the dedupe contract, focused combined
  tests 131/131 and `git diff --check`; no critical/important finding. Minor
  follow-up: case/alias canonicalization is not handled, and the legacy raw
  helper remains compatibility-only.

## Missing-section target-binding correction

Four records previously surfaced as `immunity-target-unverified` even though no
immunity section existed. Their `unverified` binding is now subordinate to the
`section_missing` fact: only a present/parsed immunity group or explicit target
mismatch/ambiguity can trigger the target-binding rejection. The correction does
not accept any record; it preserves the incomplete evidence gate.

- Regression: `unverified binding without an immunity section remains a
  missing-section failure`.
- Assembly v6: `.local/tmp/b1-a63-20260930-12/assembled-source-contract-v6.json`.
  Accepted remains **19/400** and rejected **381/400**. Reasons are now 365
  incomplete, 14 missing immunity sections and 2 unresolved target bindings.
  Immunity remains 28 attributed / 372 unknown.
- `buff_source_review` confirmed fail-closed ordering, v6 coherence, focused
  combined tests and `git diff --check`; no critical/important/minor issue.

## Complete alternate immunity source

The reviewed semantic Npcinfo capture now provides a separate complete
immunity source for Buff pages whose immunity section is absent. For Buff `37`,
it contributes 37 revision-bound NPC assertions. The normalizer accepts this
source only when the five-page semantic capture and exact current whip-debuff
classification are present, and it retains Buff-page rows as the preferred
source whenever that section is complete.

This source never converts the Wall of Flesh page's `Immune to` cell into Buff
immunity and never changes the NPC-page direction for `inflicts`. The expanded
replay remains blocked overall because 367 of 400 records still have incomplete
source groups; no candidate or runtime write was generated.

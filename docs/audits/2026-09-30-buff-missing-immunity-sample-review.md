# Buff missing-immunity sample review

## Scope

This audit records the bounded raw page capture and offline parser review for
Buff IDs `1,2,3,4,5,6,7,8,9,10,21,22,23,25,32,33,35,37,38,46`.
It is evidence only. It did not create a landing envelope, packet, permit,
scheduler decision, canonical candidate, or database mutation.

- Capture directory:
  `.local/tmp/b1-a63-20260930-13/`
- Capture command: `pipelines/fetch/capture-buff-page-evidence.mjs`
- Input: `data/standardized/buffs.standardized.json`
- Input SHA-256: `sha256:10f9fab670835c6807249dcfc52bc416eb3e019db168ed6ba7cfdab56d8c048a`
- Capture report SHA-256: `sha256:b8c20e11b0066e5c7062a23e33f0139700a7e519359750099b7dd39ac04f87c3`
- Parser analysis SHA-256: `sha256:8130b451b81902eac103334108ae562603afaa9648403f7a9ea630863486665c`

The authenticated runtime preflight was read from backend `18102` immediately
before capture. It reported scheduler `enabled=false`, Buff readiness
`eligible`, live attempts and sweep claims `0/0`, and a healthy reconciler.
The canonical progress file reached `completed`, `20/20`, at
`2026-09-29T23:26:16.983Z` UTC. The terminal payload was mirrored to Redis
server `127.0.0.1:6380`, DB14, key
`terrapedia:crawler:buff-page-immunity-refresh:progress`; the direct readback
and API/preflight context are bound in
`.local/tmp/b1-a63-20260930-13/monitor-readback-v2.json`.

The first `.local/tmp/b1-a63-20260930-13/monitor-readback.json` was fetched after
capture but still exposed the previous `.12` progress. The capture did not
inherit the backend Redis connection settings; terminal mirroring was repaired
after collection. This is an observability defect: live API visibility during
the capture was not proven. No Redis history was deleted.

After repair, `monitor-registered-task-readback.json` records authenticated
overview HTTP `200` and the Buff `registeredTasks` entry with `completed 20/20`,
matching canonical progress field for field. This confirms terminal monitor
visibility; it does not retroactively prove live visibility. A direct capture
does not need a V2 attempt-history row to appear under registered tasks.

## Evidence result

All 20 selected page responses passed page identity, positive page ID, positive
revision ID, revision timestamp, raw-byte hash, and requested-title checks.
The parser saw `immuneNpcs.status=section_missing` for all 20 pages. There were
no rendered `Immune NPCs`/`免疫的 NPC` headings, no `Enemies immune to` block,
and no immunity template section that the parser could have missed.
The analysis artifact's top-level `parseStatus=parsed` is the aggregate parser
status and does not certify every fact group; the authoritative immunity result
is `sourceEvidence.factGroups.immuneNpcs.status=section_missing`.

| IDs | Page examples | Result |
| --- | --- | --- |
| 1–10 | Potion pages (`Obsidian Skin Potion` through `Invisibility Potion`) | Buff effect pages have no NPC immunity section. |
| 21, 22, 23, 25, 32, 33, 35, 38, 46 | Debuff pages (`Potion Sickness`, `Darkness`, `Cursed`, `Tipsy`, `Slow`, `Weak`, `Silenced`, `The Tongue`, `Chilled`) | Pages expose causes/source sections, but no NPC immunity section. |
| 37 | `Wall of Flesh` | The standardized Buff identity is `Horrified`, but its page is the NPC page and has NPC `Immune to` infobox rows; those are not Buff immunity evidence. |

The `Wall of Flesh` page also describes Horrified, so the shared-page mapping
alone does not establish an input identity error. Its NPC infobox lists Buffs
the NPC resists, not NPCs immune to Horrified. Converting that infobox into
immunity rows for Buff ID 37 would invert the relation and misattribute it.

## Decision

The sample confirms the current `section_missing` diagnosis. It does not prove
that these Buffs are immune to no NPCs, and it does not justify a
`not_applicable` classification. The source gate therefore remains closed for
these records and for the Buff domain as a whole. The normalizer must continue
to reject incomplete immunity evidence rather than accepting an empty array.

The next source task is to identify a revision-bound, Buff-specific source that
can establish immunity applicability for records whose pages have no immunity
section. Any alternate source must bind Buff identity and revision before it
can be considered for assembly; page category, Buff/debuff type, and absence of
a section remain insufficient.

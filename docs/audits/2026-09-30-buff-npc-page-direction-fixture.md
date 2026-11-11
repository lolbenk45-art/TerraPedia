# Buff NPC page direction fixture

Status: read-only source-contract evidence; canonical Buff ingestion remains
blocked.

## Fixture

The revision-bound page capture for Buff ID `37` (`Horrified`) is:

- raw page: `.local/tmp/b1-a63-20260930-13/page-018.json`
- page: `Wall of Flesh` (`pageId=10220`)
- revision: `1032375` (`2026-09-28T10:16:13Z`)
- raw SHA-256: `sha256:f3020fc1d6f39bfcc00355ac908bec50f398cf5d1c5da538f311b08eb2f9a838`

The Wiki parse API response contains both the original wikitext and rendered
HTML. The wikitext NPC infobox contains `debuff = Horrified` and the rendered
HTML contains an `Inflicts debuffs` row linking to `Horrified`. The existing NPC
parser extracts this as an NPC-owned positive fact:

```json
{
  "buffName": "Horrified",
  "sourceField": "debuff",
  "sourceSection": "infobox",
  "sourceInfobox": { "autoId": "113", "image": "Wall of Flesh.gif" }
}
```

The same rendered NPC infobox has `Immune to` rows. For the Wall of Flesh
records they list `On Fire!`, `Confused`, and `Hellfire`; the corresponding
revision-bound `Module:Npcinfo/data` record for NPC `113` has
`buffImmune = "24, 31, 323"`. It does not contain Buff ID `37`.

## Why the Buff result is unknown

The Buff fetcher requests the page named by `Template:GetBuffInfo` and passes
the response to `parseBuffPageEvidence`. That parser only accepts the Buff-page
fact groups `From player`, `From item`, `From enemy`, `From environment`, and
`Immune NPCs`. On the Wall of Flesh page there is no Buff-page `Immune NPCs`
section, so the authoritative fact group is:

```json
{
  "immuneNpcs": {
    "status": "section_missing",
    "count": 0,
    "sections": []
  }
}
```

The aggregate `parseStatus=parsed` does not override the per-group status. The
current normalizer therefore keeps Buff ID `37` unknown. This is a missing
source-contract integration, not an upstream API outage.

## Direction and ownership

The two facts have different directions:

```text
Wall of Flesh --inflicts--> Horrified
Wall of Flesh --immune_to--> On Fire!, Confused, Hellfire
Horrified --immune_npcs--> [not supplied by this NPC page]
```

Copying the NPC `Immune to` cell into Buff `immuneNpcs` would invert the
relation. A future NPC-owned source contract may promote the first line into an
`inflicts` relation after revision, NPC identity, Buff identity, and page scope
are verified. It must not use that line to fill the Buff immunity list.

No candidate, landing, maint, relation, projection, packet, permit, scheduler,
or database write was performed for this fixture.

## Implemented contract

`pipelines/fetch/buff-npc-page-evidence.mjs` now binds this fixture to the
exact page title, page/revision identity, NPC auto ID `113`, and the selected
Buff identities. Its output is
`completeness=positive-infliction-facts-only` and contains only
`relationType=inflicts` facts from the NPC infobox. The focused contract tests
are in `pipelines/fetch/buff-npc-page-evidence.test.mjs`; they cover both
Horrified and The Tongue, duplicate Buff fields, identity drift, missing
infliction fields, and the rule that `Immune to` markup cannot create an
infliction fact.

The contract is source evidence only. It is not wired to canonical relation
publication while the Buff immunity source remains incomplete.

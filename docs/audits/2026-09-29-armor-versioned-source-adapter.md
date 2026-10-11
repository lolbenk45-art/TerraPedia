# Armor versioned item-source candidate verification

## Result

The new pure adapter in
`pipelines/relation/armor-shroomite-source-candidate.mjs` derives three
Shroomite headpiece damage facts from the preserved real source artifacts.
It also runs those facts through the existing projection model. This is a
non-executable candidate, not a landing or database publication.

| Item | Operation/value/unit | Condition retained in projection |
| --- | --- | --- |
| 1546 / ShroomiteHeadgear | multiply /1.12 /multiplier | bows, repeaters, arrows, and Stakes |
| 1547 / ShroomiteMask | multiply /1.12 /multiplier | guns, bullets, and Candy Corn |
| 1548 / ShroomiteHelmet | multiply /1.12 /multiplier | specialist ranged weapons (non-consumable ranged weapons that are not bows or guns) and their ammunition |

The source model carries explicit target version `1.4.5.8`, the quoted
`1.4.5.0` history boundary, original damage/multiplication/attribution text,
Iteminfo identity, set membership statement and all three source hashes and
revision identities. The projection model retains owner, multiplication,
value, unit and condition; it has no independent game-version field, so this
test does not establish version visibility in the API/UI.

## Source and artifact binding

- Source01 `raw/shroomite-headgear.json`: page4771/revision1027106,
  `sha256:e04b55ce891e88059a09b29958f2dafff571afdfee4c7ae51f39290f48eb5176`.
- Source02 `module-iteminfo-data.json`: page18021/revision1023241,
  `sha256:2375bf54ebb430b89b3662f07c759762d47ca29654f07fc612a37a9685496ae1`.
- Source02 `module-armorsetbonuses.json`: page72704/revision964993,
  `sha256:f2b91a22f49320caf7d833e3fdb7af0c3206b96a44a5ddd021ad08eb90effbcd`.
- Source namespaces: `.local/tmp/a63-20260929-armor-source-01/` and
  `.local/tmp/a63-20260929-armor-source-02/`. Each expected identity was loaded
  from its preserved manifest; the adapter verified bytes and raw metadata.
- Generated immutable candidate:
  `.local/tmp/armor-shroomite-candidate-20260929-01.json`, file hash
  `sha256:01c1a0a2a8644f6e8b47957d968e1b1111edd6035862575cf62d80f76ac76d94`.
  Revalidated against original sources after the final implementation changes.

The modules have explicitly limited roles: Iteminfo establishes identities;
ArmorSetBonuses establishes membership only. Its older1.4.5.3 effects do not
authorize current stealth magnitudes. The2023 attribute table is neither patched
nor used as the lineage of these new current facts.

## Validation

- 36 focused adapter cases pass, including byte/revision/timestamp drift,
  wrong owner/slot/variant, unsupported versions, missing scope/history,
  commented-out evidence, candidate tampering and legacy writer rejection.
- Review RED reproduced three comment-admission defects, provisional projection
  IDs and unstable identities under metadata property reordering. All five
  assertions pass after fixes. Source line indices also match the original
  preserved text.
- 221/221 tests pass across adapter, producer, independent projection candidate,
  semantic retirement, secondary projection and its runner. Node syntax and
  diff-whitespace checks pass. Logs are under
  `.local/logs/armor-versioned-source-*.log`.
- Fresh authenticated runtime preflight at2026-09-29 23:21 CST timed out after
  successful login. No current runtime-health or database-count claim follows.

## Admission boundaries and follow-up

`executable=false`, `databaseWrites=false` and two explicit blockers remain:

1. `item-source-upstream-lineage-unbound`: no registered item-source landing or
   maint row exists for this new input. Owner-record, landing and maint IDs stay
   null; projected database IDs are omitted. The legacy semantic-repair writer
   rejects this candidate schema.
2. `complete-item-and-set-coverage-unverified`: these three damage facts do not
   establish all piece stats, current set stealth effects or whole-Armor coverage.
   Equipped13/25/20/12 totals are not emitted as extra bonuses.

Next, establish the versioned item-source landing/maint contract and complete
same-version source coverage, then integrate source rederivation with the
canonical proposal, executor and independent acceptance gate. Preserve the strict
legacy guards until a complete replacement contract is reviewed. Runtime
preflight, governed publication, DB/API/UI and automatic-run acceptance remain
separate required checks.

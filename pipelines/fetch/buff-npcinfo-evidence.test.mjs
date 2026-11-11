import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  verifyBuffNpcinfoCapture,
  verifyBuffNpcinfoCompleteCapture,
  verifyBuffNpcinfoExpandedCapture
} from './buff-npcinfo-evidence.mjs';

const input = {
  buffs: [
    { id: 20, internalName: 'Poisoned' },
    { id: 337, internalName: 'TentacleSpike' },
  ]
};
const inputBytes = Buffer.from(JSON.stringify(input));
const wikitext = `return {
  _terrariaversion = "1.4.4",
  [-65] = { internalName = "BigHornetStingy", name = "Hornet", buffImmune = "20, 337" },
  [76] = { internalName = "None2", name = nil, buffImmune = "20" },
}`;
const raw = {
  requestedPageTitle: 'Module:Npcinfo/data', pageTitle: 'Module:Npcinfo/data', pageId: 18065,
  revisionId: 1022313, revisionTimestamp: '2026-08-20T18:13:10Z', wikitext
};
const rawBytes = Buffer.from(JSON.stringify(raw));
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const manifest = {
  schemaVersion: 'buff-npcinfo-raw-capture/v1', sourceKind: 'npcinfo', status: 'completed',
  input: { sha256: hash(inputBytes) }, selectedBuffIds: [20, 337],
  pages: [{ requestedPageTitle: raw.pageTitle, pageTitle: raw.pageTitle, pageId: raw.pageId,
    revisionId: raw.revisionId, revisionTimestamp: raw.revisionTimestamp, sha256: hash(rawBytes) }]
};
const manifestBytes = Buffer.from(JSON.stringify(manifest));

test('verifies revision-bound Npcinfo positive buffImmune assertions', () => {
  const result = verifyBuffNpcinfoCapture({ inputBytes, rawBytes, manifestBytes });
  assert.deepEqual(result.scope, [
    { id: 20, internalName: 'Poisoned' },
    { id: 337, internalName: 'TentacleSpike' },
  ]);
  assert.deepEqual(result.assertions, [
    { npcId: -65, npcInternalName: 'BigHornetStingy', npcName: 'Hornet', buffId: 20 },
    { npcId: -65, npcInternalName: 'BigHornetStingy', npcName: 'Hornet', buffId: 337 },
    { npcId: 76, npcInternalName: 'None2', npcName: null, buffId: 20 },
  ]);
  assert.equal(result.completeness, 'positive-assertions-only');
});

test('keeps same-display-name NPC variants separate by stable id and internal name', () => {
  const variantInput = {
    buffs: [
      { id: 20, internalName: 'Poisoned' },
      { id: 24, internalName: 'OnFire' },
    ],
  };
  const variantRaw = {
    ...raw,
    wikitext: `return {
  [59] = { internalName = "LavaSlime", name = "Slime", buffImmune = "20, 24" },
  [-10] = { internalName = "JungleSlime", name = "Slime", buffImmune = "20" },
}`,
  };
  const variantInputBytes = Buffer.from(JSON.stringify(variantInput));
  const variantRawBytes = Buffer.from(JSON.stringify(variantRaw));
  const variantManifest = {
    ...manifest,
    input: { sha256: hash(variantInputBytes) },
    selectedBuffIds: [20, 24],
    pages: [{ ...manifest.pages[0], sha256: hash(variantRawBytes) }],
  };
  const result = verifyBuffNpcinfoCapture({
    inputBytes: variantInputBytes,
    rawBytes: variantRawBytes,
    manifestBytes: Buffer.from(JSON.stringify(variantManifest)),
  });

  assert.deepEqual(result.assertions, [
    { npcId: -10, npcInternalName: 'JungleSlime', npcName: 'Slime', buffId: 20 },
    { npcId: 59, npcInternalName: 'LavaSlime', npcName: 'Slime', buffId: 20 },
    { npcId: 59, npcInternalName: 'LavaSlime', npcName: 'Slime', buffId: 24 },
  ]);
  assert.notDeepEqual(
    result.assertions.filter(row => row.npcId === -10).map(row => row.buffId),
    result.assertions.filter(row => row.npcId === 59).map(row => row.buffId),
  );
});

test('rejects Npcinfo hash, identity, revision, scope, and assertion drift', () => {
  const withRaw = mutate => {
    const nextRawBytes = Buffer.from(JSON.stringify(mutate({ ...raw })));
    const nextManifest = { ...manifest, pages: [{ ...manifest.pages[0], sha256: hash(nextRawBytes) }] };
    return { rawBytes: nextRawBytes, manifestBytes: Buffer.from(JSON.stringify(nextManifest)) };
  };
  const cases = [
    ['input hash', () => ({ inputBytes: Buffer.from(JSON.stringify({ buffs: [{ id: 20, internalName: 'Other' }, input.buffs[1]] })) }), /input hash/],
    ['raw hash', () => ({ rawBytes: Buffer.from(JSON.stringify({ ...raw, pageTitle: 'Module:Other/data' })) }), /raw page hash/],
    ['wrong module', () => ({ manifestBytes: Buffer.from(JSON.stringify({ ...manifest, pages: [{ ...manifest.pages[0], pageTitle: 'Module:Other/data', requestedPageTitle: 'Module:Other/data' }] })) }), /page binding/],
    ['revision drift', () => withRaw(value => ({ ...value, revisionId: 1 })), /revision binding/],
    ['scope drift', () => ({ manifestBytes: Buffer.from(JSON.stringify({ ...manifest, selectedBuffIds: [20] })) }), /selected Buff scope/],
    ['input scope drift', () => ({ manifestBytes: Buffer.from(JSON.stringify({ ...manifest, input: { ...manifest.input, buffIds: [20] } })) }), /selected Buff scope/],
    ['duplicate assertion', () => withRaw(value => ({ ...value, wikitext: wikitext.replace('buffImmune = "20"', 'buffImmune = "20, 20"') })), /duplicate/],
    ['out-of-scope assertion', () => withRaw(value => ({ ...value, wikitext: wikitext.replace('buffImmune = "20, 337"', 'buffImmune = "20, 999"') })), /outside selected/],
  ];
  for (const [label, mutate, pattern] of cases) {
    assert.throws(() => verifyBuffNpcinfoCapture({ inputBytes, rawBytes, manifestBytes, ...mutate() }), pattern, label);
  }
});

function completeManifest(overrides = {}) {
  return {
    ...manifest,
    scopeCompleteness: 'all-npc-rows',
    fieldSemantics: 'buffImmune-exhaustive',
    npcCount: 2,
    ...overrides,
  };
}

function completeCapture({ rawValue = raw, manifestValue = completeManifest() } = {}) {
  const nextRawBytes = Buffer.from(JSON.stringify(rawValue));
  const nextManifest = {
    ...manifestValue,
    pages: [{ ...manifestValue.pages[0], sha256: hash(nextRawBytes) }],
  };
  return {
    inputBytes,
    rawBytes: nextRawBytes,
    manifestBytes: Buffer.from(JSON.stringify(nextManifest)),
  };
}

test('verifies an explicitly complete exhaustive Npcinfo scope and builds a reverse map', () => {
  const result = verifyBuffNpcinfoCompleteCapture(completeCapture());

  assert.equal(result.completeness, 'complete-exhaustive-npc-scope');
  assert.deepEqual(result.assertionsByBuffId, {
    20: [
      { npcId: -65, npcInternalName: 'BigHornetStingy', npcName: 'Hornet', buffId: 20 },
      { npcId: 76, npcInternalName: 'None2', npcName: null, buffId: 20 },
    ],
    337: [
      { npcId: -65, npcInternalName: 'BigHornetStingy', npcName: 'Hornet', buffId: 337 },
    ],
  });
});

test('only an exhaustive field declaration allows an absent selected Buff ID to be complete empty', () => {
  const result = verifyBuffNpcinfoCompleteCapture(completeCapture({
    rawValue: { ...raw, wikitext: wikitext.replace('buffImmune = "20, 337"', 'buffImmune = "20"') },
  }));
  assert.deepEqual(result.assertionsByBuffId[337], []);
});

test('does not call specific buffImmune rows exhaustive while all-buff flags remain unexpanded', () => {
  const capture = completeCapture({
    rawValue: {
      ...raw,
      wikitext: wikitext.replace(
        '  [76] = { internalName = "None2", name = nil, buffImmune = "20" },',
        '  [76] = { internalName = "None2", name = nil, buffImmune = "20", buffImmuneAll = true },',
      ),
    },
  });

  assert.throws(
    () => verifyBuffNpcinfoCompleteCapture(capture),
    /all-buff immunity flag|expansion evidence/,
  );
});

test('requires complete scope declarations, stable row count, and unique valid NPC identities', () => {
  const cases = [
    ['missing scope completeness', completeManifest({ scopeCompleteness: undefined }), /scope completeness/],
    ['missing field semantics', completeManifest({ fieldSemantics: undefined }), /field semantics/],
    ['npc count drift', completeManifest({ npcCount: 1 }), /NPC count/],
    ['duplicate NPC numeric ID', completeManifest(), /duplicate NPC ID/],
    ['duplicate NPC numeric ID on one line', completeManifest(), /duplicate NPC ID/],
    ['duplicate NPC internal name', completeManifest(), /duplicate NPC internal name/],
    ['malformed buffImmune', completeManifest(), /buffImmune identity/],
    ['out-of-scope assertion', completeManifest(), /outside selected scope/],
  ];
  for (const [label, manifestValue, pattern] of cases) {
    let capture = completeCapture({ manifestValue });
    if (label === 'duplicate NPC numeric ID') {
      capture = completeCapture({
        rawValue: {
          ...raw,
          wikitext: wikitext.replace(
            '  [76] = { internalName = "None2", name = nil, buffImmune = "20" },',
            '  [76] = { internalName = "None2", name = nil, buffImmune = "20" },\n  [76] = { internalName = "None3", name = nil, buffImmune = "20" },'
          ),
        },
        manifestValue,
      });
    } else if (label === 'duplicate NPC numeric ID on one line') {
      capture = completeCapture({
        rawValue: {
          ...raw,
          wikitext: wikitext.replace(
            '  [76] = { internalName = "None2", name = nil, buffImmune = "20" },',
            '  [76] = { internalName = "None2", name = nil, buffImmune = "20" }, [76] = { internalName = "None3", name = nil, buffImmune = "20" },',
          ),
        },
        manifestValue,
      });
    } else if (label === 'duplicate NPC internal name') {
      capture = completeCapture({
        rawValue: { ...raw, wikitext: wikitext.replace('internalName = "None2"', 'internalName = "BigHornetStingy"') },
        manifestValue,
      });
    } else if (label === 'malformed buffImmune') {
      capture = completeCapture({
        rawValue: { ...raw, wikitext: wikitext.replace('buffImmune = "20"', 'buffImmune = "20, nope"') },
        manifestValue,
      });
    } else if (label === 'out-of-scope assertion') {
      capture = completeCapture({
        rawValue: { ...raw, wikitext: wikitext.replace('buffImmune = "20, 337"', 'buffImmune = "20, 999"') },
        manifestValue,
      });
    }
    assert.throws(() => verifyBuffNpcinfoCompleteCapture(capture), pattern, label);
  }
});

test('expands all-buff and all-except-whips flags from revision-bound semantic sources', () => {
  const expandedInput = {
    buffs: [
      { id: 20, internalName: 'Poisoned' },
      { id: 310, internalName: 'ScytheWhipEnemyDebuff' },
      { id: 362, internalName: 'EelWhipEnemyDebuff' },
    ],
  };
  const expandedWikitext = `return {
  [1] = { internalName = "Specific", name = "Specific", buffImmune = "20" },
  [2] = { internalName = "All", name = "All", buffImmuneAll = true },
  [3] = { internalName = "AllNotWhips", name = "All Not Whips", buffImmuneAllNotWhips = true },
}`;
  const semanticPages = [
    {
      pageTitle: 'Module:Npcinfo/doc', pageId: 18032, revisionId: 1004647,
      revisionTimestamp: '2026-07-17T22:12:57Z',
      wikitext: '| buffImmune || A comma-separated list of debuffs and buffs\n| buffImmuneAll || Whether the NPC is immune to all de-/buffs.\n| buffImmuneAllNotWhips || Whether the NPC is immune to all de-/buffs, except whip debuffs.',
    },
    {
      pageTitle: 'Module:Npcinfo/datagen', pageId: 18037, revisionId: 1022307,
      revisionTimestamp: '2026-08-20T18:09:14Z',
      wikitext: 'ImmuneToAllBuffsThatAreNotWhips\nthis.buffImmuneAll = true\nthis.buffImmuneAllNotWhips = true',
    },
    {
      pageTitle: 'Template:GetBuffInfo', pageId: 55467, revisionId: 1023278,
      revisionTimestamp: '2026-08-22T05:46:54Z',
      wikitext: '<!--310-->|__buff:iname:310|ScytheWhipEnemyDebuff<!--310-->|__buff:ename:310|<!--310-->|__buff:type:310|debuff<!--362-->|__buff:iname:362|EelWhipEnemyDebuff<!--362-->|__buff:ename:362|<!--362-->|__buff:type:362|debuff',
    },
    {
      pageTitle: 'Whips', pageId: 5607, revisionId: 1028291,
      revisionTimestamp: '2026-09-09T16:13:05Z',
      wikitext: "The [[Electric Eel]]'s damage-over-time effect is caused by a debuff (buff ID 362). The [[Dark Harvest]] applies a debuff on hit (buff ID 310).",
    },
  ].map(page => {
    const rawBytes = Buffer.from(JSON.stringify(page));
    return { ...page, rawBytes, sha256: hash(rawBytes) };
  });
  const manifestValue = completeManifest({ npcCount: 3 });
  const result = verifyBuffNpcinfoExpandedCapture({
    inputBytes: Buffer.from(JSON.stringify(expandedInput)),
    rawBytes: Buffer.from(JSON.stringify({ ...raw, wikitext: expandedWikitext })),
    manifestBytes: Buffer.from(JSON.stringify({
      ...manifestValue,
      input: { sha256: hash(Buffer.from(JSON.stringify(expandedInput))), buffIds: [20, 310, 362] },
      selectedBuffIds: [20, 310, 362],
      pages: [{ ...manifestValue.pages[0], sha256: hash(Buffer.from(JSON.stringify({ ...raw, wikitext: expandedWikitext }))) }],
    })),
    semanticCapture: { pages: semanticPages },
  });

  assert.equal(result.completeness, 'complete-expanded-npc-scope');
  assert.deepEqual(result.assertionsByBuffId[310].map(row => row.npcId), [2]);
  assert.deepEqual(result.assertionsByBuffId[362].map(row => row.npcId), [2]);
  assert.deepEqual(result.assertionsByBuffId[20].map(row => row.npcId), [1, 2, 3]);
  assert.deepEqual(result.semanticExpansion.whipDebuffBuffIds, [310, 362]);
});

test('refuses all-except-whips expansion when the semantic Whips source omits a required ID', () => {
  const expandedInput = { buffs: [
    { id: 310, internalName: 'ScytheWhipEnemyDebuff' },
    { id: 362, internalName: 'EelWhipEnemyDebuff' },
  ] };
  const expandedRaw = { ...raw, wikitext: `return {
  [1] = { internalName = "AllNotWhips", name = "All Not Whips", buffImmuneAllNotWhips = true },
}` };
  const inputBytesExpanded = Buffer.from(JSON.stringify(expandedInput));
  const rawBytesExpanded = Buffer.from(JSON.stringify(expandedRaw));
  const pages = [
    ['Module:Npcinfo/doc', 'buffImmuneAll || all\nbuffImmuneAllNotWhips || except whip debuffs'],
    ['Module:Npcinfo/datagen', 'ImmuneToAllBuffsThatAreNotWhips this.buffImmuneAll = true this.buffImmuneAllNotWhips = true'],
    ['Template:GetBuffInfo', '<!--310-->|__buff:iname:310|ScytheWhipEnemyDebuff<!--310-->|__buff:ename:310|<!--310-->|__buff:type:310|debuff <!--362-->|__buff:iname:362|EelWhipEnemyDebuff<!--362-->|__buff:ename:362|<!--362-->|__buff:type:362|debuff'],
    ['Whips', 'buff ID 310'],
  ].map(([pageTitle, wikitext], index) => {
    const page = { pageTitle, pageId: 18000 + index, revisionId: 100000 + index,
      revisionTimestamp: '2026-09-30T00:00:00Z', wikitext };
    const rawBytes = Buffer.from(JSON.stringify(page));
    return { ...page, rawBytes, sha256: hash(rawBytes) };
  });
  assert.throws(() => verifyBuffNpcinfoExpandedCapture({
    inputBytes: inputBytesExpanded,
    rawBytes: rawBytesExpanded,
    manifestBytes: Buffer.from(JSON.stringify({
      ...completeManifest({ npcCount: 1 }),
      input: { sha256: hash(inputBytesExpanded), buffIds: [310, 362] },
      selectedBuffIds: [310, 362],
      pages: [{ ...manifest.pages[0], sha256: hash(rawBytesExpanded) }],
    })),
    semanticCapture: { pages },
  }), /whip-debuff semantic source|362/);
});

import { createHash } from 'node:crypto';

const identities = [
  [6148, 'PalworldMinionTrustyCattiva', 389],
  [6149, 'PalworldMinionTrustyFoxsparks', 390],
  [6155, 'LightningStrike', 399],
  [6161, 'ClayPotMinion', 393],
  [6164, 'ForbiddenMinion', 394],
  [6173, 'ArcSurge', 400],
];
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export function sourceFixture(changeData = () => {}) {
  const data = { _generated: 'fixture-generation', _terrariaversion: '1.4.5.7' };
  for (const [id, internalName, buffType] of identities) {
    data[id] = { internalName, name: internalName, buffType, buffTime: 60,
      damage: 12, value: 100, maxStack: 1, width: 20, height: 22 };
  }
  data[1] = { internalName: 'CopperPickaxe', name: 'Copper Pickaxe' };
  changeData(data);
  const inputBytes = Buffer.from(JSON.stringify({ buffs: identities.map(([, internalName, id]) => ({ id, internalName })) }));
  const titles = ['Module:Iteminfo/data', 'Module:Iteminfo/doc', 'Module:Iteminfo/datagen'];
  const pages = titles.map((pageTitle, index) => {
    const raw = { pageTitle, requestedPageTitle: pageTitle, pageId: index + 1,
      revisionId: index + 101, revisionTimestamp: '2026-10-01T00:00:00Z', fetchedAt: '2026-10-01T01:00:00Z',
      wikitext: index === 0
        ? `-- database with the statistics of all items; generated from Module:Iteminfo/datagen\nreturn { ["data"] = [==[${JSON.stringify(data)}]==] }`
        : index === 1 ? 'buffType is a Buff ID' : 'Module:Iteminfo/data convertToJsonData' };
    const rawBytes = Buffer.from(JSON.stringify(raw));
    return { ...raw, rawBytes, sha256: sha256(rawBytes) };
  });
  const manifestBytes = Buffer.from(JSON.stringify({ schemaVersion: 'buff-semantic-raw-capture/v1',
    sourceKind: 'iteminfo-semantics', status: 'completed', input: { sha256: sha256(inputBytes) },
    selectedBuffIds: identities.map(([, , id]) => id),
    pages: pages.map(({ rawBytes, wikitext, ...page }) => ({ ...page, buffIds: identities.map(([, , id]) => id) })) }));
  return { inputBytes, manifestBytes, semanticCapture: { pages } };
}

export function proposalInput(overrides = {}) {
  return { source: sourceFixture(), runId: 'buff-items-test-01', maintRows: [], landingRows: [], ...overrides };
}

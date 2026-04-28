import { matchNpcBridgeRecords } from './npc-bridge-match.mjs';

export function buildNpcStandardizedBridge({
  standardizedPayload,
  crawlerNormalizedRecords
} = {}) {
  const payload = standardizedPayload ?? {};
  const standardizedRecords = Array.isArray(payload.records) ? payload.records : [];
  const crawlerRecords = Array.isArray(crawlerNormalizedRecords) ? crawlerNormalizedRecords : [];

  const nextRecords = standardizedRecords.map((record) => ({ ...record }));
  let matched = 0;
  let unmatchedCrawler = 0;
  const unmatchedSamples = [];

  for (const crawlerRecord of crawlerRecords) {
    const match = matchNpcBridgeRecords({
      crawlerRecord,
      standardizedRecords: nextRecords
    });

    if (match.records.length === 0) {
      unmatchedCrawler += 1;
      if (unmatchedSamples.length < 20) {
        unmatchedSamples.push({
          entityId: crawlerRecord?.entityId ?? '',
          pageTitle: crawlerRecord?.source?.pageTitle ?? crawlerRecord?.display?.name ?? '',
          reason: match.reason
        });
      }
      continue;
    }

    matched += match.records.length;
    for (const record of match.records) {
      record.wikiCrawler = {
        pageTitle: crawlerRecord?.source?.pageTitle ?? '',
        groupMember: crawlerRecord?.groupMember ?? null,
        summary: crawlerRecord?.summary ?? {},
        combat: crawlerRecord?.combat ?? {},
        profile: crawlerRecord?.profile ?? {},
        shop: crawlerRecord?.shop ?? { items: [] },
        happiness: crawlerRecord?.happiness ?? { sourceTemplatePresent: false, notes: [] },
        relationships: crawlerRecord?.relationships ?? { relatedNpcs: [], relatedItems: [], relatedBiomes: [] },
        contentBlocks: crawlerRecord?.contentBlocks ?? { dialogue: '', tips: '', history: '' },
        audit: crawlerRecord?.audit ?? { status: 'fail', reasons: ['missing audit payload'] },
        sourceMetadata: crawlerRecord?.sourceMetadata ?? {}
      };
    }
  }

  return {
    ...payload,
    records: nextRecords,
    summary: {
      crawlerNpcTotal: crawlerRecords.length,
      matched,
      unmatchedCrawler,
      unmatchedSamples
    }
  };
}

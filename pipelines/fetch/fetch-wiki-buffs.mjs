import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureDir,
  expandWikiText,
  fetchWikiModuleContent,
  fetchWikiPagePayload,
  fetchWikiRenderedHtml,
  parseCliArgs,
  parseIteminfoModulePayload,
  sharedDataPath,
  shouldKeepSnapshot,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { verifyBuffIteminfoCapture, verifyBuffIteminfoSemanticCapture } from './buff-iteminfo-evidence.mjs';
import { verifyBuffNpcinfoCapture, verifyBuffNpcinfoExpandedCapture } from './buff-npcinfo-evidence.mjs';
import { composeBuffImmunitySourceEvidence } from './buff-immunity-source-composition.mjs';
import { reportHeartbeat } from '../lib/crawler-heartbeat.mjs';
import { writeCrawlerMonitorRedisState } from '../lib/crawler-monitor-redis-state.mjs';
import { advanceWikiIngestionManifestForSource } from '../lib/wiki-sync-manifest.mjs';
import {
  buildActionProgressPayload,
  buildCrawlerWorkSummary,
  createCrawlerProgressHeartbeat,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';
import {
  buildResumeProgressFields,
  computeInputFingerprint,
  createResumeState,
  derivePartialPath,
  loadResumeState,
  makeSkipChecker,
  markCompleted,
  resolveResumeDecision
} from '../lib/crawler-resume-state.mjs';
import {
  parseBuffPageEvidence,
  parseBuffPageImmunityFacts
} from './buff-immunity-page-parser.mjs';

const repoRoot = getProjectRoot();
const ACTION_ID = 'buff-page-immunity-refresh';
const RESUME_MODE_VALUE = 'keyed_items';
const DEFAULT_TEMPLATE_TITLE = 'Template:GetBuffInfo';
const DEFAULT_LANGS = ['en', 'zh'];
const EXPAND_BATCH_SIZE = 25;
const DEFAULT_BUFF_PROGRESS_PATH = sharedDataPath('generated', 'fetch-wiki-buffs-progress.latest.json');
const DEFAULT_BUFF_RESUME_STATE_PATH = path.join(repoRoot, 'data', 'generated', 'resume', `${ACTION_ID}.resume.json`);

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const templateTitle = options.template ?? DEFAULT_TEMPLATE_TITLE;
  const rawDir = path.resolve(process.cwd(), options['raw-dir'] ?? sharedDataPath('raw', 'wiki'));
  const reportDir = sharedDataPath('reports', 'fetch');
  const langs = parseLanguages(options.langs);
  const progressPath = path.resolve(process.cwd(), options['progress-path'] ?? DEFAULT_BUFF_PROGRESS_PATH);
  const manifestPath = options['manifest-path'] ? path.resolve(process.cwd(), options['manifest-path']) : null;
  const keepSnapshot = shouldKeepSnapshot(options);
  const startedAt = new Date().toISOString();
  let lastResumeFields = null;
  let lastProgressCurrent = 0;
  let lastProgressTotal = 0;
  let lastResumeAction = null;
  let lastResumeReason = null;
  let lastResumeSkippedCount = 0;
  const progressHeartbeat = createCrawlerProgressHeartbeat({
    writeProgress: (progress) => writeBuffFetchProgress(progressPath, progress)
  });

  try {
    ensureDir(rawDir);
    ensureDir(reportDir);
    await emitBuffHeartbeat('running', { phase: 'module' });
    progressHeartbeat.publish({
      status: 'running',
      phase: 'module',
      message: 'fetching Template:GetBuffInfo and preparing localized buff expansion',
      current: 0,
      total: 0,
      startedAt
    });

    const result = await fetchWikiModuleContent({ moduleTitle: templateTitle });
    const timestamp = new Date().toISOString().replaceAll(':', '-');
    const baseName = templateTitle.replaceAll(':', '__').replaceAll('/', '__').replaceAll(' ', '_').toLowerCase();
    const latestJsonPath = path.join(rawDir, `${baseName}.latest.json`);
    const latestMarkupPath = path.join(rawDir, `${baseName}.latest.wikitext`);
    const latestParsedPath = path.join(rawDir, `${baseName}.parsed.latest.json`);
    const snapshotJsonPath = path.join(rawDir, `${baseName}.${timestamp}.json`);
    const snapshotParsedPath = path.join(rawDir, `${baseName}.parsed.${timestamp}.json`);
    const reportPath = path.join(reportDir, `fetch-${baseName}-${timestamp}.json`);

    const baseBuffs = parseBaseBuffDatabase(result.moduleContent);
    const localizedByLang = {};
    progressHeartbeat.publish({
      status: 'running',
      phase: 'expand',
      message: `expanding localized fields for ${baseBuffs.length} buff(s) across ${langs.length} language(s)`,
      current: 0,
      total: baseBuffs.length,
      overallCurrent: 0,
      overallTotal: baseBuffs.length,
      startedAt
    });

    for (const lang of langs) {
      localizedByLang[lang] = await expandLocalizedBuffFields(baseBuffs.map((buff) => buff.id), lang);
    }

    const pageImmunityEnabled = options['skip-buff-page-immunities'] !== true && options['skip-buff-page-immunities'] !== 'true';
    const resume = pageImmunityEnabled
      ? buildBuffPageImmunityResumeContext({
        baseBuffs,
        localizedByLang,
        requestedResumeMode: String(options['resume-mode'] ?? 'fresh'),
        statePath: path.resolve(process.cwd(), options['resume-state'] ?? DEFAULT_BUFF_RESUME_STATE_PATH)
      })
      : null;
    lastResumeFields = resume?.progressFields() ?? null;
    lastProgressTotal = resume?.total ?? 0;
    lastProgressCurrent = resume?.completedCount() ?? 0;
    lastResumeAction = resume?.action ?? null;
    lastResumeReason = resume?.reason ?? null;
    lastResumeSkippedCount = resume?.skippedCount ?? 0;

    const relations = loadBuffRelations();
    const pageFacts = await collectBuffPageImmunityFacts({
      buffs: baseBuffs,
      localizedByLang,
      enabled: pageImmunityEnabled,
      resume,
      progressCallback: ({ current, total, pageTitle }) => {
        lastResumeFields = resume?.progressFields() ?? lastResumeFields;
        lastProgressCurrent = resume?.completedCount() ?? current;
        lastProgressTotal = total;
        progressHeartbeat.publish({
          status: 'running',
          phase: 'buff-page-immunities',
          message: `scraping rendered immunity pages ${current}/${total}: ${pageTitle}`,
          current,
          total,
          overallCurrent: current,
          overallTotal: total,
          startedAt,
          resumeFields: lastResumeFields,
          resumeAction: lastResumeAction,
          resumeReason: lastResumeReason,
          resumeSkippedCount: lastResumeSkippedCount
        });
      }
    });
    const completedPageFacts = resume?.completedCount() ?? pageFacts.size;
    const totalPageFacts = resume?.total ?? pageFacts.size;
    if (pageImmunityEnabled && completedPageFacts < totalPageFacts) {
      lastProgressCurrent = completedPageFacts;
      lastProgressTotal = totalPageFacts;
      lastResumeFields = resume?.progressFields() ?? lastResumeFields;
      throw new Error(`${completedPageFacts}/${totalPageFacts} buffs 完成，其余抓取或解析失败`);
    }
    const buffs = buildBuffRecords({
      baseBuffs,
      localizedByLang,
      langs,
      relations,
      pageFacts
    });

    const parsedPayload = {
      source: 'terraria.wiki.gg:Template:GetBuffInfo',
      sourceApi: result.apiUrl,
      sourcePageTitle: result.pageTitle,
      sourceRevisionTimestamp: result.revisionTimestamp,
      fetchedAt: result.fetchedAt,
      totalBuffs: buffs.length,
      langs,
      buffs
    };

    writeJson(latestJsonPath, result);
    if (keepSnapshot) {
      writeJson(snapshotJsonPath, result);
    }
    fs.writeFileSync(latestMarkupPath, result.moduleContent);
    writeJson(latestParsedPath, parsedPayload);
    if (keepSnapshot) {
      writeJson(snapshotParsedPath, parsedPayload);
    }

    const debuffCount = buffs.filter((buff) => buff.type === 'debuff').length;
    const buffCount = buffs.filter((buff) => buff.type === 'buff').length;
    const sourcedBuffCount = buffs.filter((buff) => buff.sourceItemCount > 0).length;

    writeJson(reportPath, {
      moduleTitle: result.moduleTitle,
      sourceApi: result.apiUrl,
      pageTitle: result.pageTitle,
      pageId: result.pageId,
      revisionTimestamp: result.revisionTimestamp,
      fetchedAt: result.fetchedAt,
      totalBuffs: buffs.length,
      buffCount,
      debuffCount,
      sourcedBuffCount,
      buffPageImmunityFactCount: pageFacts.size,
      langs,
      latestJsonPath,
      latestMarkupPath,
      latestParsedPath,
      snapshotJsonPath: keepSnapshot ? snapshotJsonPath : null,
      snapshotParsedPath: keepSnapshot ? snapshotParsedPath : null
    });
    if (manifestPath) {
      advanceWikiIngestionManifestForSource({
        sourceKey: 'wiki.page.template_getbuffinfo',
        locator: DEFAULT_TEMPLATE_TITLE,
        entityFamily: 'buffs',
        sourceKind: 'template',
        outputPath: latestJsonPath,
        manifestPath
      });
    }
    progressHeartbeat.publish({
      status: 'completed',
      phase: 'write',
      message: `finished buff fetch; buffs=${buffs.length}; page immunity facts=${pageFacts.size}`,
      current: buffs.length,
      total: buffs.length,
      overallCurrent: buffs.length,
      overallTotal: buffs.length,
      startedAt,
      outputPath: latestParsedPath,
      reportPath,
      resumeFields: resume?.progressFields() ?? lastResumeFields,
      resumeAction: lastResumeAction,
      resumeReason: lastResumeReason,
      resumeSkippedCount: lastResumeSkippedCount
    });
    await emitBuffHeartbeat('completed', { phase: 'write', totalBuffs: buffs.length, reportPath });

    console.log(`Fetched template: ${result.pageTitle}`);
    console.log(`Revision timestamp: ${result.revisionTimestamp ?? 'unknown'}`);
    console.log(`Total buffs: ${buffs.length}`);
    console.log(`Buffs: ${buffCount}`);
    console.log(`Debuffs: ${debuffCount}`);
    console.log(`Buffs with source items: ${sourcedBuffCount}`);
    console.log(`Buffs with page immunity facts: ${pageFacts.size}`);
    console.log(`Latest JSON: ${latestJsonPath}`);
    console.log(`Latest parsed JSON: ${latestParsedPath}`);
    console.log(`Latest wikitext: ${latestMarkupPath}`);
    console.log(`Report: ${reportPath}`);
  } catch (error) {
    const errorResumeFields = error && typeof error === 'object' ? error.resumeFields : null;
    const errorProgressCurrent = error && typeof error === 'object' && Number.isInteger(error.resumeCurrent)
      ? error.resumeCurrent
      : lastProgressCurrent;
    const errorProgressTotal = error && typeof error === 'object' && Number.isInteger(error.resumeTotal)
      ? error.resumeTotal
      : lastProgressTotal;
    writeFailedBuffFetchProgress({
      progressPath,
      startedAt,
      error,
      current: errorProgressCurrent,
      total: errorProgressTotal,
      resumeFields: errorResumeFields ?? lastResumeFields,
      resumeAction: lastResumeAction,
      resumeReason: lastResumeReason,
      resumeSkippedCount: lastResumeSkippedCount
    });
    throw error;
  } finally {
    progressHeartbeat.stop();
  }
}

export function buildBuffRecords({
  baseBuffs,
  localizedByLang,
  langs,
  relations,
  pageFacts = new Map(),
  iteminfoCapture = null,
  iteminfoSemanticCapture = null,
  npcinfoCapture = null,
  npcPageInflictionEvidenceByBuffId = new Map(),
  npcPageInflictionCompleteEvidence = null
}) {
  const iteminfoEvidence = iteminfoCapture == null ? null : verifyBuffIteminfoCapture(iteminfoCapture);
  const iteminfoSemanticEvidence = iteminfoSemanticCapture == null ? null
    : verifyBuffIteminfoSemanticCapture(iteminfoSemanticCapture);
  const npcinfoEvidence = npcinfoCapture == null ? null
    : npcinfoCapture.semanticCapture
      ? verifyBuffNpcinfoExpandedCapture(npcinfoCapture)
      : verifyBuffNpcinfoCapture(npcinfoCapture);
  const iteminfoAssertionsByBuffId = new Map();
  if (iteminfoEvidence || iteminfoSemanticEvidence) {
    const selectedEvidence = iteminfoSemanticEvidence ?? iteminfoEvidence;
    const scope = new Map(selectedEvidence.scope.map(row => [row.id, row.internalName]));
    const seen = new Set();
    for (const buff of baseBuffs) {
      if (seen.has(buff.id) || scope.get(buff.id) !== buff.internalName) throw new Error('Iteminfo selected Buff identity drifted');
      seen.add(buff.id);
    }
    for (const { buffId, buffInternalName, ...item } of selectedEvidence.assertions) {
      const rows = iteminfoAssertionsByBuffId.get(buffId) ?? [];
      rows.push({ ...item, source: 'iteminfo-module', sourceKind: 'item', sourceField: `[${item.itemId}].buffType`,
        sourceRevisionId: iteminfoEvidence?.source.revisionId ?? iteminfoSemanticEvidence.source.pages
          .find(page => page.pageTitle === 'Module:Iteminfo/data')?.revisionId,
        sourceRawSha256: iteminfoEvidence?.source.rawSha256
          ?? iteminfoSemanticEvidence.source.pages.find(page => page.pageTitle === 'Module:Iteminfo/data')?.rawSha256 });
      iteminfoAssertionsByBuffId.set(buffId, rows);
    }
  }
  if (npcinfoEvidence) {
    const scope = new Map(npcinfoEvidence.scope.map(row => [row.id, row.internalName]));
    const seen = new Set();
    for (const buff of baseBuffs) {
      if (seen.has(buff.id) || scope.get(buff.id) !== buff.internalName) throw new Error('Npcinfo selected Buff identity drifted');
      seen.add(buff.id);
    }
  }
  const completeNpcPageInflictionEvidence = normalizeCompleteNpcPageInflictionEvidence({
    evidence: npcPageInflictionCompleteEvidence,
    baseBuffs,
  });
  return baseBuffs.map((buff) => {
    const localized = {};
    for (const lang of langs) {
      localized[lang] = localizedByLang[lang]?.[String(buff.id)] ?? {
        name: null,
        page: null,
        tooltip: null,
        namesub: null
      };
    }

    const pageFact = pageFacts.get(buff.id);
    const pageEvidence = pageFact ?? relations.pageEvidenceByBuffId?.get(buff.id) ?? null;
    const pageSourceItems = Array.isArray(pageEvidence?.sourceItems) ? pageEvidence.sourceItems : [];
    const iteminfoRows = iteminfoAssertionsByBuffId.get(buff.id) ?? [];
    const completeIteminfoScope = iteminfoSemanticEvidence?.completeness === 'complete-exhaustive-item-scope';
    const sourceItems = completeIteminfoScope
      ? iteminfoRows
      : pageSourceItems.length > 0 ? pageSourceItems
        : iteminfoRows.length > 0 ? iteminfoRows
          : relations.sourceItemsByBuffId.get(buff.id) ?? [];
    const sourceItemsSource = completeIteminfoScope ? 'iteminfo-revision-bound'
      : pageSourceItems.length > 0 ? 'buff-page-causes'
        : iteminfoRows.length > 0 ? 'iteminfo-revision-bound'
          : sourceItems.length > 0 ? 'iteminfo-module' : null;
    let sourceEvidence = pageEvidence?.sourceEvidence ?? null;
    const sourceGroup = sourceEvidence?.factGroups?.sourceItems;
    if (sourceEvidence && (sourceGroup?.status !== 'parsed' || pageSourceItems.length === 0) && !completeIteminfoScope) {
      // Preserve module candidates, but never label them with the page's
      // revision or interpret missing page evidence as an authoritative empty set.
      const unresolvedFacts = [...(sourceEvidence.unresolvedFacts ?? [])];
      if (!unresolvedFacts.some(fact => fact.group === 'sourceItems')) {
        unresolvedFacts.push({ group: 'sourceItems',
          status: sourceGroup?.status === 'parsed' ? 'no_rows' : sourceGroup?.status ?? 'unverified',
          sections: sourceGroup?.sections ?? [] });
      }
      sourceEvidence = { ...sourceEvidence, parseStatus: 'parse_incomplete', unresolvedFacts };
    }
    if (completeIteminfoScope) {
      const unresolvedFacts = (sourceEvidence?.unresolvedFacts ?? [])
        .filter(fact => fact?.group !== 'sourceItems');
      sourceEvidence = { ...(sourceEvidence ?? {}),
        parseStatus: unresolvedFacts.length === 0 ? 'parsed' : sourceEvidence?.parseStatus ?? 'parse_incomplete',
        factGroups: { ...(sourceEvidence?.factGroups ?? {}),
          sourceItems: { status: 'parsed', count: sourceItems.length, sections: ['Module:Iteminfo/data'] } },
        unresolvedFacts };
    }
    if (iteminfoRows.length > 0 || completeIteminfoScope) {
      sourceEvidence = { ...(sourceEvidence ?? {}),
        sourceItemEvidence: { ...(iteminfoEvidence?.source ?? iteminfoSemanticEvidence.source),
          ...(iteminfoSemanticEvidence ? { semantic: iteminfoSemanticEvidence.semantic } : {}),
          buffId: buff.id, buffInternalName: buff.internalName,
          completeness: iteminfoSemanticEvidence?.completeness ?? iteminfoEvidence.completeness } };
    }
    const inflictionEvidence = completeNpcPageInflictionEvidence
      ? {
        completeness: completeNpcPageInflictionEvidence.completeness,
        source: completeNpcPageInflictionEvidence.source,
        facts: completeNpcPageInflictionEvidence.factsByBuffId[String(buff.id)] ?? [],
      }
      : lookupNpcPageInflictionEvidence(npcPageInflictionEvidenceByBuffId, buff.id);
    const directionalEvidence = npcinfoEvidence || inflictionEvidence
      ? composeBuffImmunitySourceEvidence({
        buffId: buff.id,
        buffInternalName: buff.internalName,
        pageEvidence,
        npcinfoEvidence,
        inflictionEvidence,
      })
      : null;
    if (directionalEvidence) {
      sourceEvidence = { ...(sourceEvidence ?? {}) };
      if (npcinfoEvidence) {
        sourceEvidence.immuneNpcPositiveEvidence = directionalEvidence;
      }
      if (inflictionEvidence) {
        sourceEvidence.inflictingNpcPositiveEvidence = directionalEvidence.inflictingNpcPositiveEvidence;
      }
    }
    const pageInflictingNpcs = Array.isArray(pageEvidence?.inflictingNpcs) ? pageEvidence.inflictingNpcs : [];
    const positiveInflictingNpcs = directionalEvidence?.inflictingNpcPositiveEvidence?.facts
      ?.map((fact) => mapNpcPageInflictionToBuffRow(fact, directionalEvidence.inflictingNpcPositiveEvidence.source)) ?? [];
    const inflictingNpcs = completeNpcPageInflictionEvidence
      ? positiveInflictingNpcs
      : mergeInflictingNpcRows(pageInflictingNpcs, positiveInflictingNpcs);
    if (!completeNpcPageInflictionEvidence && positiveInflictingNpcs.length > 0
        && sourceEvidence?.factGroups?.inflictingNpcs?.status === 'parsed') {
      const group = sourceEvidence.factGroups.inflictingNpcs;
      sourceEvidence = { ...sourceEvidence,
        factGroups: { ...sourceEvidence.factGroups,
          inflictingNpcs: { ...group, count: inflictingNpcs.length } } };
    }
    if (completeNpcPageInflictionEvidence) {
      const unresolvedFacts = (sourceEvidence?.unresolvedFacts ?? [])
        .filter(fact => fact?.group !== 'inflictingNpcs');
      sourceEvidence = { ...(sourceEvidence ?? {}),
        parseStatus: unresolvedFacts.length === 0 ? 'parsed' : sourceEvidence?.parseStatus ?? 'parse_incomplete',
        factGroups: { ...(sourceEvidence?.factGroups ?? {}),
          inflictingNpcs: { status: 'parsed', count: inflictingNpcs.length, sections: ['NPC page infobox debuffs'] } },
        unresolvedFacts };
    }
    const fallbackCount = relations.immuneNpcCountByBuffId.get(buff.id) ?? 0;
    const pageImmunityComplete = pageEvidence?.sourceEvidence?.parseStatus === 'parsed'
      && pageEvidence?.sourceEvidence?.factGroups?.immuneNpcs?.status === 'parsed'
      && Array.isArray(pageEvidence.immuneNpcs)
      && pageEvidence.sourceEvidence.unresolvedFacts?.every((fact) => fact?.group !== 'immuneNpcs');
    const expandedImmuneNpcs = !pageImmunityComplete && npcinfoEvidence?.completeness === 'complete-expanded-npc-scope'
      ? (npcinfoEvidence.assertionsByBuffId?.[String(buff.id)] ?? []).map((assertion) => ({
        npcId: assertion.npcId,
        internalName: assertion.npcInternalName,
        name: assertion.npcName ?? null,
        pageTitle: assertion.npcName ?? assertion.npcInternalName,
        source: 'npcinfo-module-expanded',
        sourceRevisionId: npcinfoEvidence.source.revisionId,
      }))
      : null;
    const canonicalImmuneNpcs = pageImmunityComplete
      ? pageEvidence.immuneNpcs
      : expandedImmuneNpcs ?? pageEvidence?.immuneNpcs ?? [];
    const immuneNpcCount = pageImmunityComplete
      ? pageEvidence.immuneNpcCount
      : expandedImmuneNpcs ? expandedImmuneNpcs.length : pageFact?.immuneNpcCount ?? fallbackCount;
    const immuneNpcSample = pageImmunityComplete
      ? pageEvidence.immuneNpcSample
      : expandedImmuneNpcs ? expandedImmuneNpcs.slice(0, 10) : pageFact?.immuneNpcSample ?? relations.immuneNpcSampleByBuffId.get(buff.id) ?? [];
    const immuneNpcSource = pageImmunityComplete
      ? pageEvidence.immuneNpcSource
      : expandedImmuneNpcs ? 'npcinfo-module-expanded' : pageFact?.immuneNpcSource
        ?? relations.immuneNpcSourceByBuffId.get(buff.id)
        ?? (fallbackCount > 0 ? 'npcinfo-module' : null);
    const immuneNpcSampleSemantics = pageImmunityComplete
      ? pageEvidence.immuneNpcSampleSemantics
      : expandedImmuneNpcs ? 'complete expanded Npcinfo module scope' : pageFact?.immuneNpcSampleSemantics
        ?? relations.immuneNpcSampleSemanticsByBuffId.get(buff.id)
        ?? (fallbackCount > 0 ? 'first up to 10 npcinfo module rows with this buffImmune id; immuneNpcCount is the full npcinfo-module match count' : null);

    return {
      ...buff,
      localized,
      sourceItemCount: sourceItems.length,
      sourceItems,
      sourceItemsSource,
      inflictingNpcs,
      immuneNpcs: canonicalImmuneNpcs,
      sourceEvidence,
      immuneNpcCount,
      immuneNpcSample,
      immuneNpcSource,
      immuneNpcSampleSemantics
    };
  });
}

function normalizeCompleteNpcPageInflictionEvidence({ evidence, baseBuffs } = {}) {
  if (evidence == null) return null;
  if (evidence.completeness !== 'complete-exhaustive-npc-page-scope'
      || !evidence.source || !Array.isArray(evidence.facts)
      || !evidence.factsByBuffId || typeof evidence.factsByBuffId !== 'object') {
    throw new Error('complete NPC page infliction evidence is invalid');
  }
  const sourceDescriptors = normalizeCompleteNpcPageSourceDescriptors(evidence.source);
  const scopeIds = new Set(baseBuffs.map(buff => buff?.id));
  const forwardByIdentity = new Map();
  for (const fact of evidence.facts) {
    if (fact?.relationType !== 'inflicts' || !Number.isSafeInteger(fact.npcSourceId) || fact.npcSourceId === 0
        || !scopeIds.has(fact.buffId)) throw new Error('complete NPC page infliction fact identity is invalid');
    const sourceKey = npcInflictionSourceKey({
      pageTitle: fact.sourcePage,
      pageId: fact.sourcePageId,
      revisionId: fact.sourceRevisionId,
      revisionTimestamp: fact.sourceRevisionTimestamp,
      rawSha256: fact.sourceRawSha256,
    });
    if (!sourceDescriptors.has(sourceKey)) {
      throw new Error('complete NPC page infliction fact provenance is not bound to a source descriptor');
    }
    const key = `${fact.npcSourceId}:${fact.buffId}`;
    if (forwardByIdentity.has(key)) throw new Error('duplicate complete NPC page infliction fact');
    forwardByIdentity.set(key, fact);
  }
  const reverseByIdentity = new Map();
  const expectedKeys = new Set(baseBuffs.map(buff => String(buff.id)));
  for (const [buffKey, facts] of Object.entries(evidence.factsByBuffId)) {
    if (!expectedKeys.has(buffKey) || !Array.isArray(facts)) {
      throw new Error('complete NPC page infliction reverse map drifted');
    }
    for (const fact of facts) {
      if (fact?.relationType !== 'inflicts' || fact.buffId !== Number(buffKey)
          || !Number.isSafeInteger(fact.npcSourceId) || fact.npcSourceId === 0) {
        throw new Error('complete NPC page infliction reverse map drifted');
      }
      const key = `${fact.npcSourceId}:${fact.buffId}`;
      const forward = forwardByIdentity.get(key);
      if (reverseByIdentity.has(key) || !forward || !sameNpcInflictionFact(forward, fact)) {
        throw new Error('complete NPC page infliction reverse map drifted');
      }
      reverseByIdentity.set(key, fact);
    }
  }
  if (reverseByIdentity.size !== forwardByIdentity.size
      || [...forwardByIdentity.keys()].some(key => !reverseByIdentity.has(key))) {
    throw new Error('complete NPC page infliction reverse map drifted');
  }
  for (const buff of baseBuffs) {
    const facts = evidence.factsByBuffId[String(buff.id)];
    if (!Array.isArray(facts) || facts.some(fact => fact?.buffId !== buff.id)) {
      throw new Error('complete NPC page infliction reverse map drifted');
    }
  }
  return evidence;
}

function normalizeCompleteNpcPageSourceDescriptors(source) {
  if (source.provider !== 'terraria.wiki.gg'
      || !Array.isArray(source.factSources) || source.factSources.length === 0) {
    throw new Error('complete NPC page infliction source descriptors are missing');
  }
  const descriptors = new Set();
  for (const descriptor of source.factSources) {
    const key = npcInflictionSourceKey(descriptor);
    if (!key || descriptors.has(key)) {
      throw new Error('complete NPC page infliction source descriptor is invalid');
    }
    descriptors.add(key);
  }
  return descriptors;
}

function npcInflictionSourceKey(source = {}) {
  const pageTitle = String(source.pageTitle ?? '').trim();
  const pageId = Number(source.pageId);
  const revisionId = Number(source.revisionId);
  const revisionTimestamp = String(source.revisionTimestamp ?? '').trim();
  const rawSha256 = String(source.rawSha256 ?? source.sourceRawSha256 ?? '').trim();
  if (!pageTitle || !Number.isSafeInteger(pageId) || pageId <= 0
      || !Number.isSafeInteger(revisionId) || revisionId <= 0
      || !revisionTimestamp || !Number.isFinite(Date.parse(revisionTimestamp))
      || !/^sha256:[a-f0-9]{64}$/.test(rawSha256)) return '';
  return `${pageTitle}\u0000${pageId}\u0000${revisionId}\u0000${revisionTimestamp}\u0000${rawSha256}`;
}

const NPC_INFLICTION_FACT_FIELDS = Object.freeze([
  'relationType', 'npcSourceId', 'npcInternalName', 'npcName',
  'buffId', 'buffInternalName', 'buffName', 'durationText', 'chanceText',
  'sourceField', 'sourcePage', 'sourcePageId', 'sourceRevisionId',
  'sourceRevisionTimestamp', 'sourceRawSha256',
]);

function sameNpcInflictionFact(left, right) {
  return NPC_INFLICTION_FACT_FIELDS.every((field) => (left?.[field] ?? null) === (right?.[field] ?? null));
}

function lookupNpcPageInflictionEvidence(source, buffId) {
  if (source == null) return null;
  if (source instanceof Map) return source.get(buffId) ?? null;
  if (typeof source === 'object' && !Array.isArray(source)) return source[String(buffId)] ?? null;
  throw new Error('NPC page infliction evidence map is invalid');
}

function mapNpcPageInflictionToBuffRow(fact, source) {
  return {
    npcId: fact.npcSourceId,
    internalName: fact.npcInternalName,
    name: fact.npcName ?? null,
    pageTitle: fact.npcName ?? fact.npcInternalName,
    buffId: fact.buffId,
    buffInternalName: fact.buffInternalName,
    relationType: 'inflicts',
    durationText: fact.durationText ?? null,
    source: 'npc-page-infliction',
    sourcePage: fact.sourcePage ?? source?.pageTitle ?? null,
    sourcePageId: fact.sourcePageId ?? source?.pageId ?? null,
    sourceRevisionId: fact.sourceRevisionId ?? source?.revisionId ?? null,
  };
}

function mergeInflictingNpcRows(pageRows, positiveRows) {
  const rows = [...pageRows];
  for (const row of positiveRows) {
    const rowIdentities = inflictingNpcIdentities(row);
    const existingIndex = rows.findIndex(existing => inflictingNpcIdentities(existing)
      .some(identity => rowIdentities.includes(identity)));
    if (existingIndex >= 0) {
      rows[existingIndex] = { ...rows[existingIndex], ...row };
    } else {
      rows.push(row);
    }
  }
  return rows;
}

function inflictingNpcIdentities(row) {
  const identities = [];
  const sourceId = Number(row?.npcId ?? row?.npcSourceId ?? row?.sourceId);
  if (Number.isSafeInteger(sourceId) && sourceId !== 0) identities.push(`id:${sourceId}`);
  const internalName = String(row?.internalName ?? row?.npcInternalName ?? '').trim().toLowerCase();
  if (internalName) identities.push(`internal:${internalName}`);
  const displayName = String(row?.pageTitle ?? row?.name ?? '').trim().toLowerCase();
  if (identities.length === 0 && displayName) identities.push(`name:${displayName}`);
  return identities;
}

export function buildBuffPageImmunityResumeContext({
  baseBuffs,
  localizedByLang,
  requestedResumeMode = 'fresh',
  statePath = DEFAULT_BUFF_RESUME_STATE_PATH
} = {}) {
  const resolvedStatePath = path.resolve(process.cwd(), statePath);
  const partialPath = derivePartialPath(resolvedStatePath);
  const immunitySeeds = buildBuffPageImmunitySeeds({ baseBuffs, localizedByLang });
  const validKeys = immunitySeeds.map((seed) => seed.id);
  const inputFingerprint = computeInputFingerprint(immunitySeeds, {
    normalizeEntry: (entry) => ({
      id: String(entry.id ?? ''),
      internalName: String(entry.internalName ?? ''),
      pageTitle: String(entry.pageTitle ?? '')
    })
  });
  const priorState = loadResumeState(resolvedStatePath);
  const priorPartialStore = fs.existsSync(partialPath) ? loadJsonObject(partialPath) : null;
  const failureState = priorState ?? createResumeState({ actionId: ACTION_ID, resumeMode: RESUME_MODE_VALUE, inputFingerprint });
  const decision = resolveResumeDecision({
    mode: requestedResumeMode,
    state: priorState,
    actionId: ACTION_ID,
    resumeMode: RESUME_MODE_VALUE,
    inputFingerprint,
    partialStore: priorPartialStore,
    getRecordKey: (record) => record.buffId,
    validKeys,
    isValidRecord: isValidBuffPageImmunityPartialRecord
  });
  if (decision.action === 'fail') {
    const error = new Error(`resume 校验失败(${decision.reason})：请用 --resume-mode=fresh 重跑，或确认输入未变`);
    error.resumeFields = buildResumeProgressFields(failureState, immunitySeeds.length);
    error.resumeCurrent = new Set((failureState.completedKeys || []).map((key) => String(key))).size;
    error.resumeTotal = immunitySeeds.length;
    throw error;
  }

  const resuming = decision.action === 'resume';
  const state = resuming
    ? priorState
    : createResumeState({ actionId: ACTION_ID, resumeMode: RESUME_MODE_VALUE, inputFingerprint });
  const partialStore = resuming ? priorPartialStore : {};
  if (!resuming) {
    fs.rmSync(resolvedStatePath, { force: true });
    fs.rmSync(partialPath, { force: true });
    writeJsonFile(partialPath, partialStore);
    writeJsonFile(resolvedStatePath, state);
  }
  const shouldSkip = makeSkipChecker(state, partialStore, {
    getRecordKey: (record) => record.buffId,
    isValidRecord: isValidBuffPageImmunityPartialRecord
  });

  return {
    action: decision.action,
    reason: decision.reason,
    skippedCount: resuming
      ? new Set((state.completedKeys || []).map((key) => String(key))).size
      : 0,
    statePath: resolvedStatePath,
    partialPath,
    state,
    partialStore,
    total: immunitySeeds.length,
    validKeys,
    shouldSkip,
    completedCount: () => new Set((state.completedKeys || []).map((key) => String(key))).size,
    progressFields: () => buildResumeProgressFields(state, immunitySeeds.length)
  };
}

function buildBuffPageImmunitySeeds({ baseBuffs, localizedByLang } = {}) {
  return (baseBuffs ?? [])
    .filter((buff) => Number.isInteger(buff?.id))
    .map((buff) => ({
      id: buff.id,
      internalName: buff.internalName,
      pageTitle: pickBuffPageTitle(buff, localizedByLang)
    }));
}

function isValidBuffPageImmunityPartialRecord(record) {
  return record?.sourceEvidence?.parseStatus === 'parsed';
}

function loadJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function collectBuffPageImmunityFacts({
  buffs,
  localizedByLang,
  enabled = true,
  fetchRenderedHtml = fetchWikiRenderedHtml,
  fetchPagePayload = null,
  sampleLimit = 10,
  progressCallback = null,
  resume = null,
  crashIfConfigured = () => {}
} = {}) {
  const factsByBuffId = new Map();
  if (!enabled) {
    return factsByBuffId;
  }

  const total = Array.isArray(buffs) ? buffs.filter((buff) => Number.isInteger(buff?.id)).length : 0;
  let current = 0;
  let attempted = 0;

  for (const buff of buffs ?? []) {
    if (!Number.isInteger(buff.id)) {
      continue;
    }

    const pageTitle = pickBuffPageTitle(buff, localizedByLang);
    current += 1;
    if (typeof progressCallback === 'function') {
      progressCallback({
        buffId: buff.id,
        pageTitle,
        current,
        total
      });
    }
    if (typeof pageTitle !== 'string' || pageTitle.trim() === '') {
      continue;
    }

    if (resume?.shouldSkip(buff.id)) {
      factsByBuffId.set(buff.id, resume.partialStore[String(buff.id)]);
      continue;
    }

    const facts = await fetchBuffPageImmunityFact({
      buff,
      pageTitle,
      fetchPagePayload,
      fetchRenderedHtml,
      sampleLimit
    });
    if (facts) {
      attempted += 1;
      factsByBuffId.set(buff.id, facts);
      if (resume) {
        resume.partialStore[String(buff.id)] = facts;
        writeJsonFile(resume.partialPath, resume.partialStore);
        runResumeCrashHook(crashIfConfigured, 'after-partial-before-mark', { buffId: buff.id, attempted }, resume);
        markCompleted({ statePath: resume.statePath, state: resume.state, key: buff.id });
        runResumeCrashHook(crashIfConfigured, 'after-mark', { buffId: buff.id, attempted }, resume);
      }
    }
  }

  return factsByBuffId;
}

function runResumeCrashHook(crashIfConfigured, point, detail, resume) {
  try {
    crashIfConfigured(point, detail);
  } catch (error) {
    if (error && typeof error === 'object' && resume) {
      error.resumeFields = resume.progressFields();
      error.resumeCurrent = resume.completedCount();
      error.resumeTotal = resume.total;
    }
    throw error;
  }
}

async function fetchBuffPageImmunityFact({
  buff,
  pageTitle,
  fetchPagePayload,
  fetchRenderedHtml,
  sampleLimit
} = {}) {
  try {
    const pagePayload = fetchPagePayload
      ? await fetchPagePayload({ pageTitle })
      : await fetchDefaultBuffPagePayload({ pageTitle, fetchRenderedHtml });
    return parseBuffPageEvidence({
      buffId: buff.id,
      buffName: buff.englishName ?? pageTitle,
      pageTitle: pagePayload.pageTitle ?? pageTitle,
      canonicalPageTitle: pagePayload.canonicalPageTitle ?? pagePayload.pageTitle ?? pageTitle,
      revisionId: pagePayload.revisionId ?? null,
      revisionTimestamp: pagePayload.revisionTimestamp ?? null,
      html: pagePayload.html,
      wikitext: pagePayload.wikitext,
      sections: pagePayload.sections,
      sampleLimit
    });
  } catch (error) {
    console.warn(`Failed to parse buff page immunities for ${pageTitle}: ${error.message}`);
    return null;
  }
}

export async function fetchDefaultBuffPagePayload({
  pageTitle,
  fetchRenderedHtml,
  fetchPagePayloadImpl = fetchWikiPagePayload
} = {}) {
  if (typeof fetchRenderedHtml === 'function' && fetchRenderedHtml !== fetchWikiRenderedHtml) {
    return { pageTitle, html: await fetchRenderedHtml({ pageTitle }), wikitext: null, sections: null };
  }
  return fetchPagePayloadImpl({ pageTitle, requireRevisionBinding: true });
}

export function buildBuffFetchProgressPayload(progressPath, {
  status,
  phase,
  message,
  current,
  total,
  overallCurrent = current,
  overallTotal = total,
  startedAt,
  outputPath = null,
  reportPath = null,
  resumeFields = null,
  resumeAction = null,
  resumeReason = null,
  resumeSkippedCount = 0
} = {}) {
  const generatedAt = new Date().toISOString();
  const discoveredTotal = phase === 'module' && Number(total) === 0 ? null : total;
  const payload = buildActionProgressPayload({
    ...buildCrawlerWorkSummary({
      status,
      current: discoveredTotal == null ? null : current,
      total: discoveredTotal,
      skippedCount: resumeSkippedCount,
      estimatedRecords: discoveredTotal,
      resumeAction,
      resumeReason
    }),
    actionId: ACTION_ID,
    status,
    phase,
    message,
    current,
    total,
    startedAt,
    overallCurrent,
    overallTotal,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  });
  if (resumeFields) {
    Object.assign(payload, resumeFields);
  }
  if (outputPath) {
    payload.outputPath = outputPath;
  }
  if (reportPath) {
    payload.reportPath = reportPath;
  }
  payload.queue = 'buff source refresh';
  payload.dataStage = 'wiki buff pages -> immunity evidence';
  payload.nextStep = 'standardize buffs, rebuild npc bridge, then backfill npc_buff_relations';
  return payload;
}

function writeBuffFetchProgress(progressPath, progress = {}) {
  const payload = buildBuffFetchProgressPayload(progressPath, progress);
  writeJsonFile(progressPath, payload);
  writeCrawlerMonitorRedisState({
    stateId: 'buff-page-immunity-refresh:progress',
    payload
  }).catch(() => {});
}

export function writeFailedBuffFetchProgress({
  progressPath,
  startedAt,
  error,
  current = 0,
  total = 0,
  resumeFields = null,
  resumeAction = null,
  resumeReason = null,
  resumeSkippedCount = 0
} = {}) {
  writeBuffFetchProgress(progressPath, {
    status: 'failed',
    phase: 'error',
    message: `buff fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    current,
    total,
    overallCurrent: current,
    overallTotal: total,
    startedAt,
    resumeFields,
    resumeAction,
    resumeReason,
    resumeSkippedCount
  });
}

function pickBuffPageTitle(buff, localizedByLang) {
  const buffKey = String(buff?.id ?? '');
  return firstNonEmptyText(
    localizedByLang?.en?.[buffKey]?.page,
    localizedByLang?.en?.[buffKey]?.title,
    localizedByLang?.zh?.[buffKey]?.page,
    localizedByLang?.zh?.[buffKey]?.title,
    buff?.englishName
  );
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function parseLanguages(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return [...DEFAULT_LANGS];
  }

  return [...new Set(
    value
      .split(',')
      .map((lang) => lang.trim())
      .filter(Boolean)
  )];
}

export function parseBaseBuffDatabase(templateContent) {
  const countMatch = templateContent.match(/\|__buff:count\|(\d+)<!--/);
  const expectedCount = Number(countMatch?.[1] ?? 0);
  const buffById = new Map();
  const fieldPattern = /__buff:(image|iname|ename|type):(\d+)\|([\s\S]*?)<!--/g;

  for (const match of templateContent.matchAll(fieldPattern)) {
    const field = match[1];
    const id = Number(match[2]);
    const value = sanitizeTemplateValue(match[3]);
    const current = buffById.get(id) ?? { id };
    current[field] = value;
    buffById.set(id, current);
  }

  const buffs = [...buffById.values()]
    .map((entry) => ({
      id: entry.id,
      image: entry.image ?? null,
      internalName: entry.iname ?? null,
      englishName: entry.ename ?? null,
      type: entry.type ?? null
    }))
    .sort((left, right) => left.id - right.id);

  if (expectedCount > 0 && buffs.length !== expectedCount) {
    console.warn(`Expected ${expectedCount} buffs, parsed ${buffs.length}`);
  }

  return buffs;
}

async function expandLocalizedBuffFields(ids, lang) {
  const localized = {};

  for (let index = 0; index < ids.length; index += EXPAND_BATCH_SIZE) {
    const batch = ids.slice(index, index + EXPAND_BATCH_SIZE);
    const text = batch.map((id) => {
      return [
        `@@REC:${id}@@`,
        `@@FLD@@{{getBuffInfo|${id}|name|lang=${lang}}}`,
        `@@FLD@@{{getBuffInfo|${id}|page|lang=${lang}}}`,
        `@@FLD@@{{getBuffInfo|${id}|tooltip|lang=${lang}}}`,
        `@@FLD@@{{getBuffInfo|${id}|namesub|lang=${lang}}}`,
        '@@ENDREC@@'
      ].join('');
    }).join('');

    const expanded = await expandTemplates(text);
    const recordPattern = /@@REC:(\d+)@@([\s\S]*?)@@ENDREC@@/g;

    for (const match of expanded.matchAll(recordPattern)) {
      const id = match[1];
      const parts = match[2].split('@@FLD@@').slice(1);
      localized[id] = {
        name: normalizeExpandedValue(parts[0]),
        page: normalizeExpandedValue(parts[1]),
        tooltip: normalizeExpandedValue(parts[2]),
        namesub: normalizeExpandedValue(parts[3])
      };
    }
  }

  return localized;
}

async function expandTemplates(text) {
  return expandWikiText({ text });
}

function normalizeExpandedValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' || trimmed === '(unknown)' ? null : trimmed;
}

function sanitizeTemplateValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function loadBuffRelations() {
  const sourceItemsByBuffId = new Map();
  const immuneNpcCountByBuffId = new Map();
  const immuneNpcSampleByBuffId = new Map();
  const immuneNpcSourceByBuffId = new Map();
  const immuneNpcSampleSemanticsByBuffId = new Map();

  const itemRawPath = sharedDataPath('raw', 'wiki', 'module__iteminfo__data.latest.json');
  if (fs.existsSync(itemRawPath)) {
    const rawPayload = JSON.parse(fs.readFileSync(itemRawPath, 'utf8'));
    const itemData = parseIteminfoModulePayload(rawPayload.moduleContent);

    for (const [key, item] of Object.entries(itemData)) {
      if (!/^\d+$/.test(key) || !item || typeof item !== 'object') {
        continue;
      }

      const buffId = Number(item.buffType ?? 0);
      if (!Number.isInteger(buffId) || buffId <= 0) {
        continue;
      }

      const current = sourceItemsByBuffId.get(buffId) ?? [];
      current.push({
        itemId: Number(key),
        name: item.name ?? null,
        internalName: item.internalName ?? null,
        buffTime: Number(item.buffTime ?? 0) || null
      });
      sourceItemsByBuffId.set(buffId, current);
    }
  }

  const npcParsedPath = sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json');
  if (fs.existsSync(npcParsedPath)) {
    const npcPayload = JSON.parse(fs.readFileSync(npcParsedPath, 'utf8'));
    const npcs = Array.isArray(npcPayload.npcs) ? npcPayload.npcs : [];

    for (const npc of npcs) {
      const immuneIds = String(npc.buffImmune ?? '')
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);

      for (const buffId of immuneIds) {
        immuneNpcCountByBuffId.set(buffId, (immuneNpcCountByBuffId.get(buffId) ?? 0) + 1);
        immuneNpcSourceByBuffId.set(buffId, 'npcinfo-module');
        immuneNpcSampleSemanticsByBuffId.set(
          buffId,
          'first up to 10 npcinfo module rows with this buffImmune id; immuneNpcCount is the full npcinfo-module match count'
        );

        const sample = immuneNpcSampleByBuffId.get(buffId) ?? [];
        if (sample.length < 10) {
          sample.push({
            npcId: npc.id,
            name: npc.name ?? null,
            internalName: npc.internalName ?? null
          });
          immuneNpcSampleByBuffId.set(buffId, sample);
        }
      }
    }
  }

  return {
    sourceItemsByBuffId,
    immuneNpcCountByBuffId,
    immuneNpcSampleByBuffId,
    immuneNpcSourceByBuffId,
    immuneNpcSampleSemanticsByBuffId
  };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    emitBuffHeartbeat('failed', { phase: 'error', error: error?.message ?? String(error) }).finally(() => {
      process.exitCode = 1;
    });
  });
}

async function emitBuffHeartbeat(status, detail = {}) {
  const result = await reportHeartbeat('buffs', status, { detail });
  if (!result.ok) {
    console.warn(`Crawler heartbeat skipped: ${result.error}`);
  }
  return result;
}

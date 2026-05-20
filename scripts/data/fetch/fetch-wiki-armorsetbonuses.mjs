#!/usr/bin/env node

import path from 'node:path';

import {
  ensureDir,
  fetchWikiApiJson,
  parseCliArgs,
  sharedDataPath,
  shouldKeepSnapshot,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const options = parseCliArgs(process.argv.slice(2));
const root = process.cwd();
const standardizedPath = path.join(root, 'data', 'standardized', 'armor_sets.standardized.json');
const rawOutputPath = path.join(root, 'data', 'generated', 'wiki-armorsetbonuses.latest.json');
const reportPath = path.join(root, 'reports', `wiki-armorsetbonuses-refresh-${new Date().toISOString().slice(0, 10)}.json`);
const sharedRawDir = sharedDataPath('raw', 'wiki');
const timestamp = new Date().toISOString().replaceAll(':', '-');
const keepSnapshot = shouldKeepSnapshot(options);

const moduleUrl = new URL('https://terraria.wiki.gg/api.php');
moduleUrl.searchParams.set('action', 'query');
moduleUrl.searchParams.set('titles', 'Module:ArmorSetBonuses');
moduleUrl.searchParams.set('prop', 'revisions');
moduleUrl.searchParams.set('rvprop', 'content|timestamp');
moduleUrl.searchParams.set('formatversion', '2');
moduleUrl.searchParams.set('format', 'json');

const payload = await fetchWikiApiJson({
  url: moduleUrl,
  profile: 'revision',
  sourceKey: 'Module:ArmorSetBonuses'
});
const page = payload?.query?.pages?.[0];
const revision = page?.revisions?.[0];
const content = String(revision?.content ?? '');
if (!content.trim()) {
  throw new Error('Module:ArmorSetBonuses returned empty content');
}

const records = parseArmorSetBonuses(content);
const fetchedAt = new Date().toISOString();
const rawPayload = {
  apiUrl: 'https://terraria.wiki.gg/api.php',
  fetchedAt,
  moduleContent: content,
  moduleTitle: 'Module:ArmorSetBonuses',
  pageId: page?.pageid ?? null,
  pageTitle: page?.title ?? 'Module:ArmorSetBonuses',
  revisionTimestamp: revision?.timestamp ?? null
};
const parsedPayload = {
  armorSets: records,
  fetchedAt,
  source: 'terraria.wiki.gg:Module:ArmorSetBonuses',
  sourceApi: rawPayload.apiUrl,
  sourcePageTitle: rawPayload.pageTitle,
  sourceRevisionTimestamp: rawPayload.revisionTimestamp,
  terrariaVersion: null,
  totalArmorSets: records.length
};
const standardized = {
  entity: 'armor_sets',
  generatedAt: fetchedAt,
  records,
  schemaVersion: '1.0.0',
  sourceFile: 'terraria.wiki.gg/api.php?action=query&titles=Module:ArmorSetBonuses&prop=revisions&rvprop=content',
  totalRecords: records.length,
  upstreamMeta: {
    fetchedAt,
    source: 'terraria.wiki.gg:Module:ArmorSetBonuses',
    sourceApi: 'https://terraria.wiki.gg/api.php',
    sourcePageTitle: 'Module:ArmorSetBonuses',
    sourceRevisionTimestamp: revision?.timestamp ?? null
  }
};

ensureDir(path.dirname(standardizedPath));
ensureDir(path.dirname(rawOutputPath));
ensureDir(path.dirname(reportPath));
ensureDir(sharedRawDir);
writeJson(standardizedPath, standardized);
writeJson(rawOutputPath, {
  fetchedAt,
  pageTitle: page?.title ?? null,
  revisionTimestamp: revision?.timestamp ?? null,
  content
});
writeJson(path.join(sharedRawDir, 'module__armorsetbonuses.latest.json'), rawPayload);
if (keepSnapshot) {
  writeJson(path.join(sharedRawDir, `module__armorsetbonuses.${timestamp}.json`), rawPayload);
}
writeJson(path.join(sharedRawDir, 'module__armorsetbonuses.parsed.latest.json'), parsedPayload);
if (keepSnapshot) {
  writeJson(path.join(sharedRawDir, `module__armorsetbonuses.parsed.${timestamp}.json`), parsedPayload);
}

const report = {
  generatedAt: fetchedAt,
  moduleUrl: moduleUrl.toString(),
  revisionTimestamp: revision?.timestamp ?? null,
  sharedRawDir,
  totalRecords: records.length,
  samples: records.slice(0, 5)
};
writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));

function parseArmorSetBonuses(content) {
  const block = extractInitializeBlock(content);
  const statements = splitStatements(block);
  const records = [];

  for (const statement of statements) {
    const parsed = parseArmorSetStatement(statement);
    if (parsed) {
      records.push(parsed);
    }
  }

  return records;
}

function extractInitializeBlock(content) {
  const start = content.indexOf('ArmorSetBonuses.Initialize = function()');
  if (start < 0) return content;
  const end = content.indexOf('\nend', start);
  return end < 0 ? content.slice(start) : content.slice(start, end);
}

function splitStatements(block) {
  const statements = [];
  let current = '';
  let parenDepth = 0;
  let braceDepth = 0;
  let inString = false;

  for (let i = 0; i < block.length; i += 1) {
    const ch = block[i];
    const prev = i > 0 ? block[i - 1] : '';
    current += ch;

    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth -= 1;
    else if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth -= 1;

    if (ch === ';' && parenDepth === 0 && braceDepth === 0) {
      const text = current.trim();
      if (text.startsWith('ArmorSetBonuses.')) statements.push(text);
      current = '';
    }
  }

  return statements;
}

function parseArmorSetStatement(statement) {
  if (statement.startsWith('ArmorSetBonuses.Add(')) {
    return parseAddStatement(statement);
  }
  if (statement.startsWith('ArmorSetBonuses.Create(')) {
    return parseCreateStatement(statement);
  }
  return null;
}

function parseAddStatement(statement) {
  const args = extractCallArgs(statement, 'ArmorSetBonuses.Add(');
  if (args.length < 5) return null;
  const benefitExpression = cleanEffectRef(args[0]);
  const textKey = stripQuotes(args[1]);
  const set = [parseNumberArg(args[2]), parseNumberArg(args[3]), parseNumberArg(args[4])];
  return buildRecord({
    benefitExpression,
    textKey,
    primaryPart: null,
    sets: [set]
  });
}

function parseCreateStatement(statement) {
  const createArgs = extractCallArgs(statement, 'ArmorSetBonuses.Create(');
  if (createArgs.length < 2) return null;
  const benefitExpression = cleanEffectRef(createArgs[0]);
  const textKey = stripQuotes(createArgs[1]);
  const primaryPart = createArgs[2] ? parsePrimaryPart(createArgs[2]) : null;
  const sets = [];

  const setRegex = /:Set\(([\s\S]*?)\)/g;
  let match;
  while ((match = setRegex.exec(statement)) !== null) {
    const setArgs = splitTopLevelArgs(match[1]);
    if (setArgs.length !== 3) continue;
    const headOptions = parseSetArg(setArgs[0]);
    const bodyOptions = parseSetArg(setArgs[1]);
    const legsOptions = parseSetArg(setArgs[2]);
    for (const head of headOptions) {
      for (const body of bodyOptions) {
        for (const legs of legsOptions) {
          sets.push([head, body, legs]);
        }
      }
    }
  }

  return buildRecord({
    benefitExpression,
    textKey,
    primaryPart,
    sets
  });
}

function buildRecord({ benefitExpression, textKey, primaryPart, sets }) {
  const normalizedSets = sets.map((set) => set.map((value) => Number.isFinite(value) ? value : 0));
  const uniqueItemIds = [...new Set(normalizedSets.flat().filter((value) => Number.isFinite(value)))];
  return {
    benefitExpression,
    primaryPart,
    setCount: normalizedSets.length,
    sets: normalizedSets,
    textKey,
    uniqueItemIds
  };
}

function extractCallArgs(statement, prefix) {
  const start = statement.indexOf(prefix);
  if (start < 0) return [];
  let cursor = start + prefix.length;
  let depth = 1;
  let content = '';
  let inString = false;

  while (cursor < statement.length) {
    const ch = statement[cursor];
    const prev = cursor > 0 ? statement[cursor - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      content += ch;
      cursor += 1;
      continue;
    }
    if (!inString) {
      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    content += ch;
    cursor += 1;
  }
  return splitTopLevelArgs(content);
}

function splitTopLevelArgs(content) {
  const parts = [];
  let current = '';
  let parenDepth = 0;
  let braceDepth = 0;
  let inString = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === '(') parenDepth += 1;
      else if (ch === ')') parenDepth -= 1;
      else if (ch === '{') braceDepth += 1;
      else if (ch === '}') braceDepth -= 1;
      else if (ch === ',' && parenDepth === 0 && braceDepth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSetArg(arg) {
  const text = arg.trim();
  if (text.startsWith('{') && text.endsWith('}')) {
    return splitTopLevelArgs(text.slice(1, -1)).map(parseNumberArg).filter((value) => value != null);
  }
  const value = parseNumberArg(text);
  return value == null ? [0] : [value];
}

function parseNumberArg(arg) {
  const text = String(arg).trim();
  if (text === '' || text === 'nil') return 0;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function parsePrimaryPart(arg) {
  const text = String(arg).trim();
  if (text.endsWith('.Head')) return 'Head';
  if (text.endsWith('.Body')) return 'Body';
  if (text.endsWith('.Legs')) return 'Legs';
  return null;
}

function cleanEffectRef(arg) {
  return String(arg).trim();
}

function stripQuotes(arg) {
  return String(arg).trim().replace(/^"/, '').replace(/"$/, '');
}

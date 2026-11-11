import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fetchWikiPagePayload } from '../lib/wiki-item-utils.mjs';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const inputPath = path.resolve(argValue('input', ''));
  const outputDir = path.resolve(argValue('output-dir', ''));
  const progressPath = path.resolve(argValue('progress-path', path.join(outputDir, 'progress.json')));
  if (!fs.existsSync(inputPath) || !outputDir) throw new Error('input and output-dir are required');
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const byTitle = new Map();
  for (const record of input.buffs ?? []) {
    const title = String(record.localized?.en?.page ?? record.englishName ?? '').trim();
    if (title && !byTitle.has(title)) byTitle.set(title, { title, buffIds: [] });
    if (title) byTitle.get(title).buffIds.push(Number(record.id));
  }
  const targets = [...byTitle.values()];
  const startedAt = new Date().toISOString();
  const state = { actionId: 'buff-page-raw-evidence-capture', status: 'running', current: 0, total: targets.length, startedAt, lastHeartbeatAt: startedAt, errors: 0 };
  writeJson(progressPath, state);
  const descriptors = [];
  for (const target of targets) {
    try {
      const page = await fetchWikiPagePayload({ pageTitle: target.title, requireRevisionBinding: true });
      const raw = { ...page, buffIds: target.buffIds, rawSha256: sha256(JSON.stringify({ wikitext: page.wikitext, html: page.html, sections: page.sections })) };
      const slug = target.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || `page_${state.current + 1}`;
      writeJson(path.join(outputDir, `${String(page.pageId)}-${slug}.json`), raw);
      descriptors.push({ pageTitle: page.pageTitle, pageId: page.pageId, revisionId: page.revisionId, revisionTimestamp: page.revisionTimestamp, rawSha256: raw.rawSha256, buffIds: target.buffIds });
      state.current += 1;
      state.lastHeartbeatAt = new Date().toISOString();
      writeJson(progressPath, state);
    } catch (error) {
      state.errors += 1;
      state.lastHeartbeatAt = new Date().toISOString();
      writeJson(progressPath, state);
      throw new Error(`${target.title}: ${error.message}`);
    }
  }
  state.status = 'completed';
  state.completedAt = new Date().toISOString();
  state.descriptorCount = descriptors.length;
  state.errorCount = state.errors;
  writeJson(progressPath, state);
  writeJson(path.join(outputDir, 'descriptors.json'), { schemaVersion: 'buff-page-raw-evidence/v1', descriptors });
  process.stdout.write(`${JSON.stringify({ status: state.status, total: state.total, descriptors: descriptors.length, errors: state.errors })}\n`);
}

main().catch((error) => { process.stderr.write(`Buff raw evidence capture failed: ${error.message}\n`); process.exitCode = 1; });

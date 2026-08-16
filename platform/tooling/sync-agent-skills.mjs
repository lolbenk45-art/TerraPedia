import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const CLASSES = ['portable', 'codex-only', 'claude-only', 'external/plugin'];
const RUNTIMES = ['codex', 'claude'];
const SKILL_ID = /^[a-z0-9-]+$/;

function normalizeContent(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function contentHash(content) {
  return createHash('sha256').update(normalizeContent(content), 'utf8').digest('hex');
}

function parseArguments(args) {
  const [mode, ...options] = args;
  if (!['--write', '--check', '--list'].includes(mode)) {
    throw new Error('usage: sync-agent-skills.mjs <--write|--check|--list> [--root=<repository-root>]');
  }

  let root = path.resolve(import.meta.dirname, '..', '..');
  for (const option of options) {
    if (!option.startsWith('--root=')) {
      throw new Error(`unknown option: ${option}`);
    }
    root = path.resolve(option.slice('--root='.length));
  }
  return { mode, root };
}

function assertContained(root, target, label) {
  const relative = path.relative(root, target);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`${label} escapes repository root: ${target}`);
}

function resolveSkillFile(skillRoot, relativePath) {
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || path.isAbsolute(relativePath)
    || relativePath.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`invalid manifest file path: ${relativePath}`);
  }
  const resolved = path.resolve(skillRoot, relativePath);
  assertContained(skillRoot, resolved, 'manifest file path');
  return resolved;
}

function parseFrontmatter(content, expectedName, relativePath) {
  const lines = normalizeContent(content).split('\n');
  if (lines[0] !== '---') {
    throw new Error(`missing frontmatter: ${relativePath}`);
  }
  const end = lines.indexOf('---', 1);
  if (end === -1) {
    throw new Error(`unterminated frontmatter: ${relativePath}`);
  }

  const fields = new Map();
  for (const line of lines.slice(1, end)) {
    const match = /^([a-z][a-z-]*):\s*(.+)$/.exec(line);
    if (!match || fields.has(match[1])) {
      throw new Error(`frontmatter must contain only name and description: ${relativePath}`);
    }
    fields.set(match[1], match[2]);
  }
  if (fields.size !== 2 || !fields.has('name') || !fields.has('description')) {
    throw new Error(`frontmatter must contain only name and description: ${relativePath}`);
  }
  if (fields.get('name') !== expectedName || fields.get('description').trim().length === 0) {
    throw new Error(`invalid skill frontmatter: ${relativePath}`);
  }
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(target));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(target);
    }
  }
  return files;
}

function readManifest(root) {
  const manifestPath = path.join(root, 'agent/skills/skill-manifest.json');
  assertContained(root, manifestPath, 'manifest path');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read manifest: ${error.message}`);
  }
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.skills)) {
    throw new Error('manifest must define schemaVersion 1 and a skills array');
  }
  if (manifest.hash?.algorithm !== 'sha256' || manifest.hash?.normalizeLineEndings !== 'lf') {
    throw new Error('hash schema must use sha256 with LF normalization');
  }

  const ids = new Set();
  const skills = manifest.skills.map((skill) => {
    if (!skill || typeof skill !== 'object' || !SKILL_ID.test(skill.id ?? '')) {
      throw new Error(`invalid skill id: ${skill?.id}`);
    }
    if (ids.has(skill.id)) throw new Error(`duplicate skill id: ${skill.id}`);
    ids.add(skill.id);
    if (!CLASSES.includes(skill.classification)) {
      throw new Error(`invalid skill classification: ${skill.classification}`);
    }

    if (skill.classification !== 'portable') {
      if (skill.files !== undefined || skill.targets !== undefined) {
        throw new Error(`non-portable skill must not define files or targets: ${skill.id}`);
      }
      return { ...skill };
    }

    if (!Array.isArray(skill.files) || skill.files.length === 0) {
      throw new Error(`portable skill must define files: ${skill.id}`);
    }
    if (!skill.files.includes('SKILL.md')) {
      throw new Error(`portable skill must declare SKILL.md: ${skill.id}`);
    }
    if (!Array.isArray(skill.targets) || skill.targets.length === 0) {
      throw new Error(`portable skill must define targets: ${skill.id}`);
    }
    const targets = [...new Set(skill.targets)];
    if (targets.length !== skill.targets.length || targets.some((target) => !RUNTIMES.includes(target))) {
      throw new Error(`invalid runtime targets: ${skill.id}`);
    }
    const files = [...new Set(skill.files)];
    if (files.length !== skill.files.length) throw new Error(`duplicate manifest file path: ${skill.id}`);
    return { ...skill, files, targets };
  });

  return skills;
}

function portableRecords(root, skills) {
  const records = [];
  for (const skill of skills.filter((candidate) => candidate.classification === 'portable')) {
    const sourceRoot = path.join(root, 'agent/skills', skill.id);
    assertContained(root, sourceRoot, 'skill source path');
    for (const file of skill.files) {
      const source = resolveSkillFile(sourceRoot, file);
      if (!fs.existsSync(source)) throw new Error(`missing source file: ${path.relative(root, source)}`);
      if (fs.lstatSync(source).isSymbolicLink()) {
        throw new Error(`source file must not be a symbolic link: ${path.relative(root, source)}`);
      }
      const content = normalizeContent(fs.readFileSync(source, 'utf8'));
      if (file === 'SKILL.md') parseFrontmatter(content, skill.id, path.relative(root, source));
      records.push({ skill, file, source, content });
    }
  }
  return records;
}

function runtimePath(root, runtime, skill, file) {
  const target = path.join(root, `.${runtime}`, 'skills', skill.id, file);
  assertContained(root, target, 'runtime target path');
  return target;
}

function collectRuntimeProblems(root, records) {
  const problems = [];
  const expectedByRuntimeSkill = new Map();

  for (const record of records) {
    for (const runtime of record.skill.targets) {
      const key = `${runtime}:${record.skill.id}`;
      if (!expectedByRuntimeSkill.has(key)) expectedByRuntimeSkill.set(key, new Set());
      expectedByRuntimeSkill.get(key).add(record.file);

      const target = runtimePath(root, runtime, record.skill, record.file);
      if (!fs.existsSync(target)) {
        problems.push(`missing generated file: ${path.relative(root, target)}`);
      } else if (fs.lstatSync(target).isSymbolicLink()) {
        problems.push(`generated file must not be a symbolic link: ${path.relative(root, target)}`);
      } else if (contentHash(fs.readFileSync(target, 'utf8')) !== contentHash(record.content)) {
        problems.push(`drift: ${path.relative(root, target)}`);
      }
    }
  }

  for (const [key, expectedFiles] of expectedByRuntimeSkill) {
    const [runtime, skillId] = key.split(':');
    const skillRoot = path.join(root, `.${runtime}`, 'skills', skillId);
    for (const target of listFiles(skillRoot)) {
      const relative = path.relative(skillRoot, target).split(path.sep).join('/');
      if (runtime === 'codex' && relative.startsWith('agents/')) continue;
      if (!expectedFiles.has(relative)) {
        problems.push(`undeclared runtime file: ${path.relative(root, target)}`);
      }
    }
  }

  return problems.sort();
}

function writeRuntimeFiles(root, records) {
  const problems = collectRuntimeProblems(root, records)
    .filter((problem) => problem.startsWith('undeclared runtime file:') || problem.startsWith('generated file must'));
  if (problems.length > 0) throw new Error(problems.join('\n'));

  for (const record of records) {
    for (const runtime of record.skill.targets) {
      const target = runtimePath(root, runtime, record.skill, record.file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, record.content, 'utf8');
    }
  }
}

function listSkills(skills) {
  for (const classification of CLASSES) {
    const ids = skills
      .filter((skill) => skill.classification === classification)
      .map((skill) => skill.id)
      .sort();
    console.log(ids.length > 0 ? `${classification}: ${ids.join(', ')}` : `${classification}:`);
  }
}

function main() {
  const { mode, root } = parseArguments(process.argv.slice(2));
  const skills = readManifest(root);
  if (mode === '--list') {
    listSkills(skills);
    return;
  }

  const records = portableRecords(root, skills);
  if (mode === '--check') {
    const problems = collectRuntimeProblems(root, records);
    if (problems.length > 0) throw new Error(problems.join('\n'));
    console.log(`skill runtime views are in sync: ${records.length} source files`);
    return;
  }

  writeRuntimeFiles(root, records);
  console.log(`skill runtime views written: ${records.length} source files`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

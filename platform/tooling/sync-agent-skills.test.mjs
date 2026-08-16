import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const synchronizerPath = path.join(repoRoot, 'platform/tooling/sync-agent-skills.mjs');

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixture({ manifest = defaultManifest(), skillContent = defaultSkill() } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-agent-skills-'));
  writeFile(root, 'agent/skills/skill-manifest.json', JSON.stringify(manifest, null, 2));
  writeFile(root, 'agent/skills/portable-skill/SKILL.md', skillContent);
  writeFile(root, 'agent/skills/portable-skill/references/guide.md', 'portable guide\n');
  return root;
}

function defaultManifest() {
  return {
    schemaVersion: 1,
    hash: { algorithm: 'sha256', normalizeLineEndings: 'lf' },
    skills: [
      {
        id: 'portable-skill',
        classification: 'portable',
        targets: ['codex', 'claude'],
        files: ['SKILL.md', 'references/guide.md']
      },
      { id: 'codex-local', classification: 'codex-only' },
      { id: 'external-tool', classification: 'external/plugin' }
    ]
  };
}

function defaultSkill() {
  return [
    '---',
    'name: portable-skill',
    'description: Use when validating generated skill views.',
    '---',
    '',
    '# Portable Skill',
    ''
  ].join('\n');
}

function run(root, mode) {
  return spawnSync(process.execPath, [synchronizerPath, mode, `--root=${root}`], {
    cwd: root,
    encoding: 'utf8'
  });
}

test('write creates declared portable skill files and preserves Codex metadata', () => {
  const root = createFixture();
  writeFile(root, '.codex/skills/portable-skill/agents/openai.yaml', 'metadata: keep\n');

  const result = run(root, '--write');

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    fs.readFileSync(path.join(root, '.codex/skills/portable-skill/SKILL.md'), 'utf8'),
    defaultSkill()
  );
  assert.equal(
    fs.readFileSync(path.join(root, '.claude/skills/portable-skill/references/guide.md'), 'utf8'),
    'portable guide\n'
  );
  assert.equal(
    fs.readFileSync(path.join(root, '.codex/skills/portable-skill/agents/openai.yaml'), 'utf8'),
    'metadata: keep\n'
  );
});

test('check reports changed and deleted declared skill files', () => {
  const root = createFixture();
  assert.equal(run(root, '--write').status, 0);

  writeFile(root, 'agent/skills/portable-skill/references/guide.md', 'changed guide\n');
  let result = run(root, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /drift:.*references\/guide\.md/);

  assert.equal(run(root, '--write').status, 0);
  fs.rmSync(path.join(root, '.claude/skills/portable-skill/SKILL.md'));
  result = run(root, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing generated file:.*\.claude\/skills\/portable-skill\/SKILL\.md/);
});

test('check rejects undeclared runtime files while allowing declared Codex metadata', () => {
  const root = createFixture();
  assert.equal(run(root, '--write').status, 0);
  writeFile(root, '.codex/skills/portable-skill/agents/openai.yaml', 'metadata: keep\n');
  writeFile(root, '.claude/skills/portable-skill/unlisted.md', 'stale\n');

  const result = run(root, '--check');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /undeclared runtime file:.*unlisted\.md/);
  assert.doesNotMatch(result.stderr, /openai\.yaml/);
});

test('validation rejects malformed frontmatter, unsafe paths, and invalid skill IDs', () => {
  const malformedRoot = createFixture({
    skillContent: [
      '---',
      'name: portable-skill',
      'description: Use when validating generated skill views.',
      'owner: unexpected',
      '---',
      '',
      '# Portable Skill',
      ''
    ].join('\n')
  });
  let result = run(malformedRoot, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /frontmatter must contain only name and description/);

  const unsafeManifest = defaultManifest();
  unsafeManifest.skills[0].files = ['SKILL.md', '../outside.md'];
  const unsafeRoot = createFixture({ manifest: unsafeManifest });
  result = run(unsafeRoot, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid manifest file path/);

  const invalidIdManifest = defaultManifest();
  invalidIdManifest.skills[0].id = 'portable_skill';
  const invalidIdRoot = createFixture({ manifest: invalidIdManifest });
  result = run(invalidIdRoot, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid skill id/);

  const noSkillManifest = defaultManifest();
  noSkillManifest.skills[0].files = ['references/guide.md'];
  const noSkillRoot = createFixture({ manifest: noSkillManifest });
  result = run(noSkillRoot, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /portable skill must declare SKILL\.md/);
});

test('validation requires the normalized SHA-256 hash schema', () => {
  const manifest = defaultManifest();
  manifest.hash.algorithm = 'sha1';
  const root = createFixture({ manifest });

  const result = run(root, '--check');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /hash schema must use sha256 with LF normalization/);
});

test('list reports every supported classification', () => {
  const root = createFixture();

  const result = run(root, '--list');

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /^portable: portable-skill$/m);
  assert.match(result.stdout, /^codex-only: codex-local$/m);
  assert.match(result.stdout, /^claude-only:$/m);
  assert.match(result.stdout, /^external\/plugin: external-tool$/m);
});

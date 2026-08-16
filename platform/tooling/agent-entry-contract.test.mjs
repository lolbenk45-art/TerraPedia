import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const entryFiles = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];
const requiredReferences = [
  'AGENTS.md',
  'docs/project-governance/00_CURRENT_SPEC.md',
  'docs/project-governance/00_WORKFLOW.md',
  'node platform/tooling/sync-agent-skills.mjs --write'
];

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function containsVendorRequirement(content) {
  return /\b(?:Codex|Claude Code|Gemini CLI)\b[^\n.]{0,80}\b(?:is )?(?:required|must be used)\b/i.test(content);
}

test('cross-model entry files point to the shared governance and sync contract', () => {
  for (const relativePath of entryFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    assert.equal(fs.existsSync(absolutePath), true, `missing entry file: ${relativePath}`);
    const content = readRepoFile(relativePath);
    for (const reference of requiredReferences) {
      assert.equal(
        content.includes(reference),
        true,
        `${relativePath} must reference ${reference}`
      );
    }
  }
});

test('agent documentation declares the source and generated runtime views', () => {
  const agentReadme = readRepoFile('agent/README.md');
  const skillsReadme = readRepoFile('agent/skills/README.md');

  assert.match(agentReadme, /agent\/skills\/?/);
  assert.match(agentReadme, /\.codex\/skills/);
  assert.match(agentReadme, /\.claude\/skills/);
  assert.match(skillsReadme, /name/);
  assert.match(skillsReadme, /description/);
  assert.match(skillsReadme, /portable/);
  assert.match(skillsReadme, /codex-only/);
  assert.match(skillsReadme, /external\/plugin/);
});

test('cross-model entries reject vendor-specific required runtimes', () => {
  assert.equal(containsVendorRequirement('Codex is required for every task.'), true);
  assert.equal(containsVendorRequirement('Claude Code must be used to sync skills.'), true);

  for (const relativePath of entryFiles) {
    assert.equal(
      containsVendorRequirement(readRepoFile(relativePath)),
      false,
      `${relativePath} must not declare a vendor runtime as required`
    );
  }
});

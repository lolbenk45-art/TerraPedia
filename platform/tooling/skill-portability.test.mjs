import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const manifestPath = path.join(repoRoot, 'agent/skills/skill-manifest.json');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function portableSkills() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.skills.filter((skill) => skill.classification === 'portable');
}

function frontmatter(content, relativePath) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  assert.equal(lines[0], '---', `${relativePath} must start with frontmatter`);
  const end = lines.indexOf('---', 1);
  assert.ok(end > 0, `${relativePath} must close frontmatter`);
  const values = new Map();
  for (const line of lines.slice(1, end)) {
    const match = /^([a-z][a-z-]*):\s*(.+)$/.exec(line);
    assert.ok(match, `${relativePath} has invalid frontmatter line: ${line}`);
    assert.equal(values.has(match[1]), false, `${relativePath} repeats ${match[1]}`);
    values.set(match[1], match[2]);
  }
  assert.deepEqual([...values.keys()].sort(), ['description', 'name'], `${relativePath} frontmatter fields`);
  return values;
}

test('portable source skills use discoverable, tool-neutral frontmatter and links', () => {
  const providerTerms = /\b(?:Codex-only|Claude-only|Gemini-only|TodoWrite|TaskCreate|TaskUpdate|chrome_devtools|mcp__|MCP)\b|\b(?:Claude Code|Codex|Gemini CLI)\b[^.\n]{0,40}\b(?:tool|must|only|required)\b|\bTask\(/i;
  const absolutePath = /(?:^|[ (])(?:\/home\/|\/Users\/|[A-Za-z]:[\\/]|\$env:USERPROFILE)/;

  for (const skill of portableSkills()) {
    const relativePath = `agent/skills/${skill.id}/SKILL.md`;
    const content = read(relativePath);
    const values = frontmatter(content, relativePath);
    assert.equal(values.get('name'), skill.id);
    assert.match(values.get('description'), /^Use when\b/);
    assert.ok(values.get('description').length <= 500, `${relativePath} description is too long`);
    assert.doesNotMatch(content, providerTerms, `${relativePath} has a provider-specific hard dependency`);
    assert.doesNotMatch(content, absolutePath, `${relativePath} has a machine-specific path`);

    for (const file of skill.files) {
      const filePath = `agent/skills/${skill.id}/${file}`;
      const fileContent = read(filePath);
      assert.doesNotMatch(fileContent, absolutePath, `${filePath} has a machine-specific path`);
      assert.doesNotMatch(fileContent, /\]\(\/(?!\/)/, `${filePath} has an absolute Markdown link`);
    }
  }
});

test('shared agent guidance defines fallbacks for missing subagents, browsers, and PowerShell', () => {
  const guidance = read('agent/skills/README.md');

  assert.match(guidance, /## Fallbacks/);
  assert.match(guidance, /subagent/i);
  assert.match(guidance, /browser/i);
  assert.match(guidance, /PowerShell/i);
  assert.match(guidance, /shell|Bash/i);
});

test('generated Codex and Claude session-handoff content is byte-identical', () => {
  const codex = fs.readFileSync(path.join(repoRoot, '.codex/skills/session-handoff/SKILL.md'));
  const claude = fs.readFileSync(path.join(repoRoot, '.claude/skills/session-handoff/SKILL.md'));
  assert.deepEqual(claude, codex);
});

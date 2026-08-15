import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readIfPresent(relativePath) {
  const targetPath = repoPath(relativePath);
  return fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
}

test('root editorconfig defines the Stage 1 formatting baseline', () => {
  const editorConfigPath = repoPath('.editorconfig');
  const editorConfig = readIfPresent('.editorconfig');

  assert.equal(fs.existsSync(editorConfigPath), true, '.editorconfig must exist');
  assert.match(editorConfig, /^root = true$/m);
  assert.match(editorConfig, /^charset = utf-8$/m);
  assert.match(editorConfig, /^end_of_line = lf$/m);
  assert.match(editorConfig, /^insert_final_newline = true$/m);
  assert.match(editorConfig, /^trim_trailing_whitespace = true$/m);
  assert.match(editorConfig, /\[\*\.\{js,ts,mjs,cjs,vue,css,scss,json,jsonc,yml,yaml,sql,sh,bash,ps1\}\]\nindent_size = 2/);
  assert.match(editorConfig, /\[\*\.\{java,kt,kts,groovy,xml\}\]\nindent_size = 4/);
  assert.match(editorConfig, /\[\*\.py\]\nindent_size = 4/);
  assert.match(editorConfig, /\[\*\.md\][\s\S]*trim_trailing_whitespace = false/);
  assert.match(editorConfig, /\[Makefile\]\nindent_style = tab/);
});

test('current code style separates active rules from planned enforcement', () => {
  const stylePath = repoPath('docs/project-governance/current/CURRENT_CODE_STYLE.md');
  const style = readIfPresent('docs/project-governance/current/CURRENT_CODE_STYLE.md');

  assert.equal(fs.existsSync(stylePath), true, 'CURRENT_CODE_STYLE.md must exist');
  for (const heading of [
    '## Scope And Authority',
    '## Enforcement Status',
    '## Common Rules',
    '## Java',
    '## Vue And TypeScript',
    '## Node And Data Scripts',
    '## Python And Shell',
    '## Tests',
    '## Documentation And Commits',
    '## Staged Tool Adoption'
  ]) {
    assert.match(style, new RegExp(`^${heading}$`, 'm'), `missing heading: ${heading}`);
  }
  assert.match(style, /EditorConfig is the active machine-readable baseline/);
  assert.match(style, /Prettier, ESLint, and Spotless are not currently enforced/);
  assert.match(style, /Do not mass-format unrelated existing files/);
  assert.match(style, /behavior changes that have a practical focused automated test/);
  assert.match(style, /Exceptions follow the task workflow/);
  assert.match(style, /Semantic-lint remediation can change behavior/);
  assert.match(style, /normal tests and behavior-oriented commits/);
});

test('current governance routes contributors to the code style authority', () => {
  const routedFiles = [
    'AGENTS.md',
    'docs/project-governance/INDEX.md',
    'docs/project-governance/current/README.md',
    'docs/project-governance/current/PROJECT_CONTROL.md',
    'docs/project-governance/current/CURRENT_TECH_STACK.md',
    'docs/project-management/current-status.md',
    'docs/project-management/risk-register.md'
  ];

  for (const relativePath of routedFiles) {
    assert.match(
      readIfPresent(relativePath),
      /CURRENT_CODE_STYLE\.md/,
      `${relativePath} must route to CURRENT_CODE_STYLE.md`
    );
  }
});

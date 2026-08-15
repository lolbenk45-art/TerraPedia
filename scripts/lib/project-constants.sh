#!/usr/bin/env bash

# Shell adapter for scripts/config/project.constants.json.  It is deliberately
# dependency-light so platform entrypoints can use the same contract on Bash
# hosts without jq.

_TP_CONSTANTS_ADAPTER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

tp_project_root() {
  if [[ -n "${TERRAPEDIA_REPO_ROOT:-}" ]]; then
    cd -- "$TERRAPEDIA_REPO_ROOT" && pwd -P
    return
  fi

  local current="$_TP_CONSTANTS_ADAPTER_DIR"
  while [[ "$current" != "/" ]]; do
    if [[ -f "$current/.git" || -d "$current/.git" ]]; then
      (cd -- "$current" && pwd -P)
      return
    fi
    current="$(dirname -- "$current")"
  done
  printf 'Unable to resolve TerraPedia project root from %s\n' "$_TP_CONSTANTS_ADAPTER_DIR" >&2
  return 1
}

tp_resolve_path() {
  local candidate="${1:?Missing path candidate}"
  TP_CONSTANT_ROOT="$(tp_project_root)" TP_CONSTANT_CANDIDATE="$candidate" node --input-type=module <<'NODE'
import path from 'node:path';

const root = path.resolve(process.env.TP_CONSTANT_ROOT);
const candidate = process.env.TP_CONSTANT_CANDIDATE || '';
const resolved = path.resolve(root, candidate);
const relative = path.relative(root, resolved);
if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
  console.error(`Resolved path escapes outside repository root: ${resolved}`);
  process.exit(1);
}
process.stdout.write(resolved);
NODE
}

tp_constant_path() {
  local key="${1:?Missing project constant key}"
  TP_CONSTANT_ROOT="$(tp_project_root)" TP_CONSTANT_KEY="$key" node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.TP_CONSTANT_ROOT);
const manifestPath = path.join(root, 'scripts', 'config', 'project.constants.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const key = process.env.TP_CONSTANT_KEY || '';
const value = key.split('.').reduce((current, segment) => current?.[segment], manifest);
if (typeof value !== 'string' || !value.trim()) {
  console.error(`Missing or non-path project constant: ${key}`);
  process.exit(1);
}
const resolved = path.resolve(root, value);
const relative = path.relative(root, resolved);
if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
  console.error(`Resolved project constant escapes outside repository root: ${key}`);
  process.exit(1);
}
process.stdout.write(resolved);
NODE
}

tp_application_path() {
  tp_constant_path "applications.${1:?Missing application key}.currentPath"
}

tp_command_path() {
  tp_constant_path "commands.${1:?Missing command key}"
}

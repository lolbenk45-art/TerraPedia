#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if (( $# != 1 )) || [[ "$1" != '--redis-db=18' ]]; then
  printf 'buff current source replay: only --redis-db=18 is accepted\n' >&2
  exit 2
fi
command -v node >/dev/null 2>&1 || {
  printf 'buff current source replay: node is required\n' >&2
  exit 2
}

cd "$REPO_ROOT"
exec node pipelines/automation/buff-current-source-replay.mjs "$1"

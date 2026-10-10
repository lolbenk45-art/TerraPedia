#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

die() { printf 'buff automation test window: %s\n' "$*" >&2; exit 2; }
command -v node >/dev/null 2>&1 || die 'node is required'

profile='t1'
window_minutes='5'
for argument in "$@"; do
  case "$argument" in
    --fixture-profile=*) profile="${argument#*=}" ;;
    --window-minutes=*) window_minutes="${argument#*=}" ;;
    *) die "unknown argument: $argument" ;;
  esac
done

[[ "$profile" == 't1' ]] || die '--fixture-profile must be t1'
[[ "$window_minutes" =~ ^[0-9]+$ ]] || die '--window-minutes must be an integer'
(( window_minutes >= 1 && window_minutes <= 15 )) || die '--window-minutes must be between 1 and 15'

cd "$REPO_ROOT"
exec node pipelines/automation/buff-automation-test-window.mjs \
  "--fixture-profile=$profile" \
  "--window-minutes=$window_minutes"

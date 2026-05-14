#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"

exec "${NODE_COMMAND:-node}" "$repo_root/scripts/ops/check-backend-refresh-daemon-heartbeat.mjs" "$@"

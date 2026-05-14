#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/ops/run-backend-refresh-scheduled.sh [options]

Runs one TerraPedia backend refresh cycle. Intended for systemd timer execution.

Options:
  --node-command <command>   Node executable to use (default: node)
  --mode <apply|plan>        Refresh mode forwarded to the daemon
  --steps <csv>              Comma-separated refresh steps forwarded to the daemon
  --timeout-ms <ms>          Refresh timeout forwarded to the daemon
  -h, --help                 Show this help
USAGE
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"

node_command="${NODE_COMMAND:-node}"
mode=""
steps=""
timeout_ms=""

while (($# > 0)); do
  case "$1" in
    --node-command)
      node_command="${2:?Missing value for --node-command}"
      shift 2
      ;;
    --node-command=*)
      node_command="${1#*=}"
      shift
      ;;
    --mode)
      mode="${2:?Missing value for --mode}"
      shift 2
      ;;
    --mode=*)
      mode="${1#*=}"
      shift
      ;;
    --steps)
      steps="${2:?Missing value for --steps}"
      shift 2
      ;;
    --steps=*)
      steps="${1#*=}"
      shift
      ;;
    --timeout-ms)
      timeout_ms="${2:?Missing value for --timeout-ms}"
      shift 2
      ;;
    --timeout-ms=*)
      timeout_ms="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

cd "$repo_root"

args=(
  "scripts/data/workflow/run-backend-data-refresh-daemon.mjs"
  "--once=true"
  "--enabled=true"
)

if [[ -n "$mode" ]]; then
  args+=("--mode=$mode")
fi
if [[ -n "$steps" ]]; then
  args+=("--steps=$steps")
fi
if [[ -n "$timeout_ms" ]]; then
  args+=("--timeout-ms=$timeout_ms")
fi

exec "$node_command" "${args[@]}"

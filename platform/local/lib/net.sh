#!/usr/bin/env bash

set -euo pipefail

if ! declare -F require_command >/dev/null 2>&1; then
  # shellcheck source=common.sh
  source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fi

tcp_check() {
  local host="$1"
  local port="$2"
  local timeout_ms="${3:-1000}"

  require_command node
  HOST="$host" PORT="$port" TIMEOUT_MS="$timeout_ms" node --input-type=module <<'NODE'
import net from 'node:net';

const host = process.env.HOST;
const port = Number(process.env.PORT);
const timeoutMs = Number(process.env.TIMEOUT_MS || 1000);
const socket = new net.Socket();
let done = false;

function finish(code) {
  if (done) return;
  done = true;
  socket.destroy();
  process.exit(code);
}

socket.setTimeout(timeoutMs);
socket.once('connect', () => finish(0));
socket.once('timeout', () => finish(1));
socket.once('error', () => finish(1));
socket.connect(port, host);
NODE
}

wait_port() {
  local host="$1"
  local port="$2"
  local timeout_seconds="${3:-15}"
  local deadline=$((SECONDS + timeout_seconds))

  while (( SECONDS < deadline )); do
    if tcp_check "$host" "$port" 800; then
      return 0
    fi
    sleep 0.5
  done

  return 1
}

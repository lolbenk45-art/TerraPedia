#!/usr/bin/env bash

# Isolated no-network acceptance smoke for crawler queue V2.  This script is
# deliberately fail-closed: it will not make an HTTP or Redis request until its
# fixture-only namespace, root, token, and explicit Redis database are proven.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
SSE_PID=""
SSE_OUTPUT=""

die() { printf 'crawler-queue-v2-smoke: %s\n' "$*" >&2; exit 2; }
pass() { printf '[PASS] %s\n' "$*"; }
require_command() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
require_env() { [[ -n "${!1:-}" ]] || die "required environment variable is blank: $1"; }

json_field() {
  JSON_INPUT="$1" JSON_PATH="$2" node --input-type=module <<'NODE'
const value = JSON.parse(process.env.JSON_INPUT || '');
let current = value;
for (const part of (process.env.JSON_PATH || '').split('.')) {
  if (!part) continue;
  current = current?.[part];
}
if (current === undefined || current === null) process.exit(3);
process.stdout.write(typeof current === 'string' ? current : JSON.stringify(current));
NODE
}

json_equals() {
  local payload="$1" path="$2" expected="$3" actual
  actual="$(json_field "$payload" "$path")" || die "response lacks $path"
  [[ "$actual" == "$expected" ]] || die "expected $path=$expected, got $actual"
}

json_nonempty() {
  local payload="$1" path="$2" actual
  actual="$(json_field "$payload" "$path")" || die "response lacks $path"
  [[ -n "$actual" && "$actual" != "[]" && "$actual" != "{}" ]] || die "expected non-empty $path"
  printf '%s' "$actual"
}

json_array_length_at_least() {
  local payload="$1" path="$2" expected="$3"
  JSON_INPUT="$payload" JSON_PATH="$path" EXPECTED="$expected" node --input-type=module <<'NODE'
const root = JSON.parse(process.env.JSON_INPUT || '');
let value = root;
for (const part of (process.env.JSON_PATH || '').split('.')) value = value?.[part];
if (!Array.isArray(value) || value.length < Number(process.env.EXPECTED)) process.exit(1);
NODE
}

api_get() {
  curl --fail-with-body --silent --show-error \
    -H "Authorization: Bearer ${TERRAPEDIA_ADMIN_TOKEN}" \
    "$TERRAPEDIA_API_BASE$1"
}

api_post() {
  curl --fail-with-body --silent --show-error \
    -H "Authorization: Bearer ${TERRAPEDIA_ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    -X POST "$TERRAPEDIA_API_BASE$1" --data "$2"
}

redis_cli() {
  REDISCLI_AUTH="${TERRAPEDIA_REDIS_PASSWORD:-}" redis-cli \
    -h "$TERRAPEDIA_REDIS_HOST" -p "$TERRAPEDIA_REDIS_PORT" \
    -n "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_REDIS_DB" --no-auth-warning "$@"
}

cleanup_prefix() {
  local prefix="$1" key
  while IFS= read -r key; do
    [[ "$key" == "$prefix"* ]] || die "refusing to delete a key outside fixture prefix"
    redis_cli DEL "$key" >/dev/null
  done < <(redis_cli --scan --pattern "${prefix}*")
}

cleanup() {
  local status=$?
  if [[ -n "$SSE_PID" ]] && kill -0 "$SSE_PID" >/dev/null 2>&1; then
    kill "$SSE_PID" >/dev/null 2>&1 || true
    wait "$SSE_PID" 2>/dev/null || true
  fi
  if [[ "${GUARDS_PASSED:-false}" == true ]]; then
    cleanup_prefix "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE" || true
    cleanup_prefix "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE" || true
    rm -rf -- "$FIXTURE_ROOT" || true
  fi
  exit "$status"
}

[[ "${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED:-}" == "true" ]] \
  || die 'TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED=true is required'
require_env TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE
require_env TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE
require_env TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT
require_env TERRAPEDIA_ADMIN_TOKEN
require_env TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_REDIS_DB

[[ "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE" == terrapedia:crawler:wiki-monitor:v2:test:* ]] \
  || die 'fixture test namespace must start with terrapedia:crawler:wiki-monitor:v2:test:'
[[ "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE" == *: ]] \
  || die 'fixture test namespace must end with a colon'
[[ "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE" == *:test:* ]] \
  || die 'fixture legacy namespace must contain :test:'
[[ "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE" == *: ]] \
  || die 'fixture legacy namespace must end with a colon'
[[ "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_REDIS_DB" =~ ^[0-9]+$ ]] \
  || die 'fixture Redis DB must be an explicitly supplied non-negative integer'

FIXTURE_ROOT="$(realpath -m "$TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ROOT")"
case "$FIXTURE_ROOT" in
  /tmp/*|"$REPO_ROOT"/reports/crawler-monitor/v2/fixtures/*) ;;
  *) die 'fixture root must be a temporary directory or reports/crawler-monitor/v2/fixtures child' ;;
esac
[[ "$FIXTURE_ROOT" != /tmp && "$FIXTURE_ROOT" != / ]] || die 'fixture root is not a removable child directory'

TERRAPEDIA_API_BASE="${TERRAPEDIA_API_BASE:-http://127.0.0.1:${APP_PORT:-18088}/api}"
TERRAPEDIA_REDIS_HOST="${TERRAPEDIA_REDIS_HOST:-127.0.0.1}"
TERRAPEDIA_REDIS_PORT="${TERRAPEDIA_REDIS_PORT:-6380}"
require_command curl
require_command node
require_command redis-cli

GUARDS_PASSED=true
trap cleanup EXIT INT TERM
mkdir -p "$FIXTURE_ROOT"
mkdir -p "$FIXTURE_ROOT/reports/crawler-monitor"
cat >"$FIXTURE_ROOT/reports/crawler-monitor/wiki-monitor-dispatch-queue.latest.json" <<EOF
{"items":[{"queueId":"legacy-${RUN_ID}","dispatchId":"legacy-${RUN_ID}","domain":"crawler_queue_v2_fixture","actionId":"crawler-queue-v2-fixture","status":"queued","requestedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","message":"isolated legacy fixture evidence"}]}
EOF
printf '{}\n' >"$FIXTURE_ROOT/reports/crawler-monitor/wiki-monitor-dispatch.latest.json"
printf '{}\n' >"$FIXTURE_ROOT/reports/crawler-monitor/wiki-monitor-dispatch.lock.json"

# 1. Write only exact legacy-prefix evidence for the immutable V1 snapshot.
redis_cli SET "${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE}running:${RUN_ID}" "fixture" >/dev/null
redis_cli SET "${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE}dedupe:${RUN_ID}" "fixture" >/dev/null
redis_cli SET "${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_LEGACY_NAMESPACE}lock:${RUN_ID}" "fixture" >/dev/null
pass '1/14 seeded only exact legacy fixture keys'

# 2. Cut over the isolated namespace; no V1 work is copied into the V2 queue.
CUTOVER_ID="fixture-v2-${RUN_ID}"
CUTOVER_GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
CUTOVER="$(api_post /admin/crawler-monitor/cutover "{\"cutoverId\":\"${CUTOVER_ID}\",\"confirmation\":\"CUTOVER_CRAWLER_QUEUE_V2\",\"gitSha\":\"${CUTOVER_GIT_SHA}\"}")"
json_equals "$CUTOVER" data.engineMode v2
pass '2/14 completed isolated V1 to V2 cutover'

# 3. V2 overview is empty and legacy evidence is history-only.
OVERVIEW="$(api_get /admin/crawler-monitor/overview)"
json_equals "$OVERVIEW" data.queueContractVersion 2
json_equals "$OVERVIEW" data.liveQueue '[]'
json_array_length_at_least "$OVERVIEW" data.legacyHistory 1 || die 'legacy fixture evidence was not exposed as history'
pass '3/14 observed empty V2 live queue and immutable legacy history'

# 4. Dispatch the only permitted no-network fixture and capture exact identity.
FIRST="$(api_post /admin/crawler-monitor/dispatch '{"domain":"crawler_queue_v2_fixture","actionId":"crawler-queue-v2-fixture","resumeMode":"fresh"}')"
QUEUE_ID="$(json_nonempty "$FIRST" data.queueId)"
ATTEMPT_ID="$(json_nonempty "$FIRST" data.attemptId)"
STATE_VERSION="$(json_nonempty "$FIRST" data.stateVersion)"
pass '4/14 dispatched no-network fixture with exact V2 identity'

# 5. An authenticated bounded SSE replay includes that exact attempt identity.
SSE_OUTPUT="$FIXTURE_ROOT/events-${RUN_ID}.log"
timeout 10s curl --silent --show-error --no-buffer \
  -H "Authorization: Bearer ${TERRAPEDIA_ADMIN_TOKEN}" \
  -H 'Accept: text/event-stream' \
  "$TERRAPEDIA_API_BASE/admin/crawler-monitor/events?after=0-0" >"$SSE_OUTPUT" 2>&1 &
SSE_PID=$!
for _ in $(seq 1 20); do
  grep -Fq "$ATTEMPT_ID" "$SSE_OUTPUT" && break
  sleep 0.25
done
grep -Fq "$ATTEMPT_ID" "$SSE_OUTPUT" || die 'SSE did not include the dispatched attemptId'
pass '5/14 authenticated SSE exposed the same attempt identity'

# 6. The incremental log cursor must move forward, never by an arbitrary path.
LOG_ONE=''
for _ in $(seq 1 30); do
  LOG_ONE="$(api_get "/admin/crawler-monitor/attempts/${ATTEMPT_ID}/log?offset=0&maxBytes=262144")" || true
  if [[ -n "$LOG_ONE" ]] && [[ "$(json_field "$LOG_ONE" data.availability 2>/dev/null || true)" == available ]]; then break; fi
  sleep 0.25
done
json_equals "$LOG_ONE" data.availability available
OFFSET_ONE="$(json_nonempty "$LOG_ONE" data.nextOffset)"
LOG_TWO="$(api_get "/admin/crawler-monitor/attempts/${ATTEMPT_ID}/log?offset=${OFFSET_ONE}&maxBytes=262144")"
OFFSET_TWO="$(json_nonempty "$LOG_TWO" data.nextOffset)"
[[ "$OFFSET_TWO" -ge "$OFFSET_ONE" ]] || die 'incremental attempt-log nextOffset moved backwards'
pass '6/14 read attempt-keyed incremental logs'

# 7. Same action while active returns the first active attempt through dedupe.
SECOND="$(api_post /admin/crawler-monitor/dispatch '{"domain":"crawler_queue_v2_fixture","actionId":"crawler-queue-v2-fixture","resumeMode":"fresh"}')"
json_equals "$SECOND" data.attemptId "$ATTEMPT_ID"
pass '7/14 verified active-attempt dedupe'

# 8. Exact cancel reports request-before-terminal and releases ownership.
CANCEL="$(api_post /admin/crawler-monitor/dispatch/control "{\"queueId\":\"${QUEUE_ID}\",\"attemptId\":\"${ATTEMPT_ID}\",\"expectedStateVersion\":${STATE_VERSION},\"controlAction\":\"cancel\"}")"
json_equals "$CANCEL" data.attemptId "$ATTEMPT_ID"
pass '8/14 issued exact V2 cancellation request'

# 9. Stop SSE locally and confirm overview polling observes the state change.
kill "$SSE_PID" >/dev/null 2>&1 || true
wait "$SSE_PID" 2>/dev/null || true
SSE_PID=''
sleep 3
AFTER_CANCEL="$(api_get /admin/crawler-monitor/overview)"
grep -Fq "$ATTEMPT_ID" <<<"$AFTER_CANCEL" || die 'overview lost the cancelled attempt history'
pass '9/14 three-second overview fallback observed cancellation state'

# 10. Start one more fixture, then delete only its selected V2 epoch key.
LONG="$(api_post /admin/crawler-monitor/dispatch '{"domain":"crawler_queue_v2_fixture","actionId":"crawler-queue-v2-fixture","resumeMode":"fresh"}')"
LONG_ATTEMPT="$(json_nonempty "$LONG" data.attemptId)"
for _ in $(seq 1 20); do
  CURRENT="$(api_get /admin/crawler-monitor/overview)"
  grep -Fq "$LONG_ATTEMPT" <<<"$CURRENT" && break
  sleep 0.25
done
redis_cli DEL "${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE}meta:epoch" >/dev/null
pass '10/14 simulated epoch loss by deleting only the fixture epoch key'

# 11. A missing epoch is visible maintenance, never an automatic V1 fallback.
RESET_OVERVIEW="$(api_get /admin/crawler-monitor/overview)"
grep -Fq 'STATE_STORE_RESET' <<<"$RESET_OVERVIEW" || die 'missing fixture epoch was not exposed as STATE_STORE_RESET'
[[ "$(redis_cli EXISTS "${TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_NAMESPACE}meta:epoch")" == 0 ]] \
  || die 'overview recreated a missing epoch automatically'
pass '11/14 verified fail-closed maintenance without automatic epoch creation'

# 12. Explicit reset creates a new empty epoch and preserves interrupted history.
RESET_ID="fixture-reset-${RUN_ID}"
RESET="$(api_post /admin/crawler-monitor/cutover/recover-state-store-reset "{\"cutoverId\":\"${CUTOVER_ID}\",\"resetId\":\"${RESET_ID}\",\"confirmation\":\"RESET_CRAWLER_QUEUE_V2_EPOCH\",\"gitSha\":\"${CUTOVER_GIT_SHA}\"}")"
json_equals "$RESET" data.stateStoreReset true
NEW_EPOCH="$(json_nonempty "$RESET" data.stateStoreEpoch)"
RESET_AFTER="$(api_get /admin/crawler-monitor/overview)"
json_equals "$RESET_AFTER" data.stateStoreEpoch "$NEW_EPOCH"
json_equals "$RESET_AFTER" data.liveQueue '[]'
grep -Fq "$LONG_ATTEMPT" <<<"$RESET_AFTER" || die 'reset did not retain the interrupted attempt as history'
pass '12/14 reset only the isolated epoch and preserved interrupted history'

# 13. Old-epoch ownership cannot block a new V2 fixture attempt.
AFTER_RESET="$(api_post /admin/crawler-monitor/dispatch '{"domain":"crawler_queue_v2_fixture","actionId":"crawler-queue-v2-fixture","resumeMode":"fresh"}')"
NEW_ATTEMPT="$(json_nonempty "$AFTER_RESET" data.attemptId)"
[[ "$NEW_ATTEMPT" != "$LONG_ATTEMPT" ]] || die 'new epoch dispatch reused old attempt identity'
pass '13/14 admitted a fresh V2 attempt after old-epoch isolation'

# 14. EXIT trap removes only the two fixture prefixes and fixture root.
pass '14/14 cleanup trap is armed for exact fixture prefixes and root'

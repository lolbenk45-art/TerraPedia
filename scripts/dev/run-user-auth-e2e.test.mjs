import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const runnerPath = path.join(repoRoot, 'scripts/dev/run-user-auth-e2e.sh');
const runId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const derivedDatabase = `terria_v1_e2e_${runId}`;
const privateValues = [
  'private-mysql-password-value',
  'private-redis-password-value',
  'a7e2d4c6b8f0a1c3e5d7b9f1a3c5e7d9b1f3a5c7e9d2b4f6a8c0e2d4b6f8a1c3',
  'private-cookie-value',
  'private-verification-code-value',
  'private-bearer-token',
];
const sandboxRoots = new Set();

function cleanupSandboxes() {
  for (const root of sandboxRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  sandboxRoots.clear();
}

test.after(cleanupSandboxes);

function requireRunnerSource() {
  assert.ok(fs.existsSync(runnerPath), 'runner is missing');
  return fs.readFileSync(runnerPath, 'utf8');
}

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-user-auth-e2e-test-'));
  const binDir = path.join(root, 'bin');
  const scriptDir = path.join(root, 'scripts', 'dev');

  sandboxRoots.add(root);
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'back'), { recursive: true });
  fs.mkdirSync(path.join(root, 'front-nuxt'), { recursive: true });
  const testEnvironment = [
    'FAKE_INVOCATIONS',
    'FAKE_LOCK_STATE',
    'FAKE_STARTED_PORTS',
    'FAKE_PORT_GROUPS',
    'FAKE_NEXT_PORTS',
    'FAKE_STOPPED_GROUPS',
    'FAKE_SUITE_DONE',
    'FAKE_REPORT_ROOT',
    'FAKE_REPORT_LEAKED',
    'FAKE_CHILD_ENV_CAPTURE',
    'FAKE_RUN_ID',
    'FAKE_RUN_SECRET',
    'FAKE_MYSQL_PASSWORD',
    'FAKE_REDIS_PASSWORD',
    'FAKE_COOKIE_VALUE',
    'FAKE_CODE_VALUE',
    'FAKE_BEARER_TOKEN',
    'FAKE_CREATE_COLLISION',
    'FAKE_DROP_FAILURE',
    'FAKE_LOCK_PROBE_ON_DROP',
    'FAKE_MARKER_MISSING',
    'FAKE_OCCUPIED_PORT',
    'FAKE_UNOWNED_PORT',
    'FAKE_MIXED_LISTENER_PORT',
    'FAKE_LEADER_EXITED',
    'FAKE_PERSISTENT_UNOWNED_LISTENER_AFTER_STOP',
    'FAKE_STOP_FAILURE',
    'FAKE_PRIVATE_LOG',
    'FAKE_REPORT_LEAK_CHECK',
    'FAKE_SIGNAL_DURING_SUITE',
    'FAKE_REPORT_PREP_FAILURE',
    'FAKE_REPORT_WRITE_FAILURE',
    'FAKE_SUITE_FAILURE',
  ].map((name) => `  "${name}=$` + `{${name}:-}"`).join('\n');
  const testHarness = `
kill() {
  printf 'kill' >>"$FAKE_INVOCATIONS"
  for value in "$@"; do
    printf '\\t%s' "$value" >>"$FAKE_INVOCATIONS"
  done
  printf '\\n' >>"$FAKE_INVOCATIONS"
  if [[ "\${FAKE_STOP_FAILURE:-0}" == "1" ]]; then
    return 1
  fi
  printf '%s\\n' "\${!#}" | sed 's/^-//' >>"$FAKE_STOPPED_GROUPS"
  return 0
}
report_stat() {
  local report_path="\${!#}"

  if [[ -n "\${FAKE_REPORT_OWNER_PATH:-}" && "$report_path" == "$FAKE_REPORT_OWNER_PATH" && "$1" == '-c' && "$2" == '%u' ]]; then
    printf '%s\n' "\${FAKE_REPORT_OWNER_VALUE:-2001}"
    return 0
  fi
  /usr/bin/stat "$@"
}
`;
  fs.writeFileSync(
    path.join(scriptDir, 'run-user-auth-e2e.sh'),
    requireRunnerSource()
      .replace('set -euo pipefail\n', `set -euo pipefail\n${testHarness}`)
      .replaceAll('isolated_environment=(', `isolated_environment=(\n${testEnvironment}`)
      .replaceAll('/usr/bin/stat -c', 'report_stat -c')
      .replace(
        'prepare_report() {\n',
        'prepare_report() {\n  [[ "${FAKE_REPORT_PREP_FAILURE:-0}" == "1" ]] && return 1\n',
      )
      .replace(
        'write_summary() {\n',
        'write_summary() {\n  printf \'summary-write\\n\' >>"$FAKE_INVOCATIONS"\n  [[ "${FAKE_REPORT_WRITE_FAILURE:-0}" == "1" ]] && return 1\n',
      ),
    { mode: 0o755 },
  );

  const fakeCommand = `#!/usr/bin/env bash
set -euo pipefail
name="$(basename "$0")"
printf '%s' "$name" >>"$FAKE_INVOCATIONS"
for value in "$@"; do
  printf '\t%s' "$value" >>"$FAKE_INVOCATIONS"
done
printf '\n' >>"$FAKE_INVOCATIONS"

if [[ -n "\${FAKE_CHILD_ENV_CAPTURE:-}" && ("$name" == "mvn" || "$name" == "pnpm") ]]; then
  label="$name"
  if [[ "$name" == "pnpm" && " $* " == *" nuxt dev "* ]]; then
    label='nuxt'
  elif [[ "$name" == "pnpm" && " $* " == *" test:e2e:"* ]]; then
    label='playwright'
  fi
  for variable in \
    JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS MAVEN_OPTS SPRING_CONFIG_LOCATION \
    SPRING_CONFIG_ADDITIONAL_LOCATION SPRING_CONFIG_IMPORT SPRING_APPLICATION_JSON NODE_OPTIONS \
    REDISCLI_AUTH MYSQL_PWD MYSQL_HOST ARBITRARY_POISON \
    TERRAPEDIA_E2E_DB_URL TERRAPEDIA_E2E_RUN_ID TERRAPEDIA_E2E_RUN_SECRET \
    TERRAPEDIA_E2E_REDIS_DATABASE \
    SERVER_PORT E2E_BASE_URL E2E_ARTIFACT_DIR E2E_CHROMIUM_EXECUTABLE; do
    state='unset'
    [[ -v "$variable" ]] && state='set'
    printf 'env\t%s\t%s\t%s\n' "$label" "$variable" "$state" >>"$FAKE_CHILD_ENV_CAPTURE"
  done
fi

case "$name" in
  flock)
    if [[ "\${1:-}" == "-n" ]]; then
      if [[ -e "$FAKE_LOCK_STATE" ]]; then
        exit 1
      fi
      : >"$FAKE_LOCK_STATE"
    elif [[ "\${1:-}" == "-u" ]]; then
      rm -f "$FAKE_LOCK_STATE"
    fi
    ;;
  node)
    node_count_path="$FAKE_INVOCATIONS.node-count"
    node_count=0
    [[ -f "$node_count_path" ]] && node_count="$(cat "$node_count_path")"
    printf '%s' "$((node_count + 1))" >"$node_count_path"
    if [[ "$node_count" == "0" ]]; then
      printf '%s' "$FAKE_RUN_ID"
    else
      printf '%s' "$FAKE_RUN_SECRET"
    fi
    ;;
  mysql)
    if [[ " $* " == *" CREATE DATABASE "* && "\${FAKE_CREATE_COLLISION:-0}" == "1" ]]; then
      [[ " $* " == *" IF NOT EXISTS "* ]] && exit 0
      exit 1
    fi
    if [[ " $* " == *" SELECT 1 FROM "* && "\${FAKE_MARKER_MISSING:-0}" != "1" ]]; then
      printf '1\n'
    fi
    if [[ "\${FAKE_DROP_FAILURE:-0}" == "1" && " $* " == *" DROP DATABASE "* ]]; then
      exit 1
    fi
    if [[ "\${FAKE_LOCK_PROBE_ON_DROP:-0}" == "1" && " $* " == *" DROP DATABASE "* ]]; then
      if flock -n 9; then
        printf 'lock-probe=acquired\n' >>"$FAKE_INVOCATIONS"
      else
        printf 'lock-probe=blocked\n' >>"$FAKE_INVOCATIONS"
      fi
    fi
    ;;
  ss)
    if [[ " $* " =~ :([0-9]+) ]]; then
      port="\${BASH_REMATCH[1]}"
      if [[ "$port" == "\${FAKE_OCCUPIED_PORT:-}" ]] \
        || ([[ -f "$FAKE_STARTED_PORTS" ]] && grep -qx "$port" "$FAKE_STARTED_PORTS"); then
        group_id="$(awk -v port="$port" '$1 == port { print $2; exit }' "$FAKE_PORT_GROUPS" 2>/dev/null || true)"
        if [[ -n "$group_id" ]] && grep -qx "$group_id" "$FAKE_STOPPED_GROUPS" 2>/dev/null; then
          [[ "\${FAKE_PERSISTENT_UNOWNED_LISTENER_AFTER_STOP:-0}" == "1" ]] || exit 0
        fi
        listener_id=$((900000000 + 10#$port))
        if [[ "$port" == "\${FAKE_UNOWNED_PORT:-}" ]] \
          || ([[ -n "$group_id" ]] && grep -qx "$group_id" "$FAKE_STOPPED_GROUPS" 2>/dev/null \
            && [[ "\${FAKE_PERSISTENT_UNOWNED_LISTENER_AFTER_STOP:-0}" == "1" ]]); then
          listener_id=$((listener_id + 1))
        fi
        printf 'LISTEN 0 4096 127.0.0.1:%s 0.0.0.0:* users:(("fake",pid=%s,fd=1))\n' "$port" "$listener_id"
        if [[ "$port" == "\${FAKE_MIXED_LISTENER_PORT:-}" ]]; then
          printf 'LISTEN 0 4096 127.0.0.1:%s 0.0.0.0:* users:(("fake",pid=%s,fd=2))\n' "$port" "$((listener_id + 1))"
        fi
      fi
    fi
    ;;
  ps)
    if [[ " $* " == *" -eo pid=,pgid= "* ]]; then
      while read -r port group_id; do
        [[ -n "$group_id" ]] || continue
        grep -qx "$group_id" "$FAKE_STOPPED_GROUPS" 2>/dev/null && continue
        if [[ "\${FAKE_LEADER_EXITED:-0}" == "1" && -e "$FAKE_SUITE_DONE" ]]; then
          printf '999998 %s\n' "$group_id"
          printf 'group-member\t999998\t%s\n' "$group_id" >>"$FAKE_INVOCATIONS"
        else
          printf '%s %s\n' "$group_id" "$group_id"
        fi
      done <"$FAKE_PORT_GROUPS"
    elif [[ " $* " == *" -o pgid= "* ]]; then
      for value in "$@"; do process_id="$value"; done
      if (( process_id >= 900000000 )); then
        port=$((process_id - 900000000))
        group_id="$(awk -v port="$port" '$1 == port { print $2; exit }' "$FAKE_PORT_GROUPS" 2>/dev/null || true)"
        [[ "$port" == "\${FAKE_UNOWNED_PORT:-}" ]] && group_id=$((group_id + 1))
        [[ -n "$group_id" ]] && printf '%s\n' "$group_id"
      else
        port="$(head -n 1 "$FAKE_NEXT_PORTS")"
        tail -n +2 "$FAKE_NEXT_PORTS" >"$FAKE_NEXT_PORTS.next"
        mv "$FAKE_NEXT_PORTS.next" "$FAKE_NEXT_PORTS"
        printf '%s %s\n' "$port" "$process_id" >>"$FAKE_PORT_GROUPS"
        printf '%s\n' "$process_id"
      fi
    fi
    ;;
  curl)
    if [[ " $* " == *"/api/user-auth/refresh"* ]]; then
      printf '401'
    else
      printf '200'
    fi
    ;;
  mvn|pnpm)
    if [[ "\${FAKE_PRIVATE_LOG:-0}" == "1" ]]; then
      printf '{"token":"%s","cookie":"%s","code":"%s","password":"%s","secret":"%s"}\nCookie: %s\nAuthorization: Bearer %s\nSet-Cookie: session=%s\npassword=%s&code=%s&token=%s\n' \
        "$FAKE_REDIS_PASSWORD" \
        "$FAKE_COOKIE_VALUE" \
        "$FAKE_CODE_VALUE" \
        "$FAKE_MYSQL_PASSWORD" \
        "$FAKE_RUN_SECRET" \
        "$FAKE_COOKIE_VALUE" \
        "$FAKE_BEARER_TOKEN" \
        "$FAKE_COOKIE_VALUE" \
        "$FAKE_MYSQL_PASSWORD" \
        "$FAKE_CODE_VALUE" \
        "$FAKE_BEARER_TOKEN"
    fi
    if [[ "$name" == "mvn" ]]; then
      printf '%s\n' "$SERVER_PORT" >>"$FAKE_STARTED_PORTS"
    elif [[ " $* " == *" nuxt dev "* ]]; then
      for value in "$@"; do frontend_port="$value"; done
      printf '%s\n' "$frontend_port" >>"$FAKE_STARTED_PORTS"
    fi
    ;;
  mktemp)
    /usr/bin/mktemp "$@"
    ;;
esac

case "$name" in
  pnpm)
    if [[ " $* " == *" test:e2e:"* ]]; then
      mkdir -p "$E2E_ARTIFACT_DIR"
      printf 'redacted browser artifact\n' >"$E2E_ARTIFACT_DIR/failure.png"
      chmod 600 "$E2E_ARTIFACT_DIR/failure.png"
      [[ "\${FAKE_SUITE_FAILURE:-0}" == "1" ]] && exit 1
      : >"$FAKE_SUITE_DONE"
    fi
    if [[ "\${FAKE_REPORT_LEAK_CHECK:-0}" == "1" && " $* " == *" test:e2e:"* ]]; then
      if grep -R -F \
        -e "$FAKE_MYSQL_PASSWORD" \
        -e "$FAKE_REDIS_PASSWORD" \
        -e "$FAKE_COOKIE_VALUE" \
        -e "$FAKE_CODE_VALUE" \
        -e "$FAKE_RUN_SECRET" \
        "$FAKE_REPORT_ROOT" >/dev/null 2>&1; then
        : >"$FAKE_REPORT_LEAKED"
      fi
    fi
    if [[ "\${FAKE_SIGNAL_DURING_SUITE:-0}" == "1" && " $* " == *" test:e2e:"* ]]; then
      kill -TERM "$PPID"
    fi
    ;;
esac
`;

  for (const command of ['flock', 'mysql', 'redis-cli', 'curl', 'mvn', 'pnpm', 'node', 'ss', 'ps', 'sleep', 'mktemp']) {
    const commandPath = path.join(binDir, command);
    fs.writeFileSync(commandPath, fakeCommand, { mode: 0o755 });
  }
  fs.writeFileSync(path.join(binDir, 'chromium'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });

  return {
    root,
    binDir,
    invocationPath: path.join(root, 'invocations.log'),
    lockStatePath: path.join(root, 'fake-lock-held'),
    startedPortsPath: path.join(root, 'started-ports.log'),
    portGroupsPath: path.join(root, 'port-groups'),
    nextPortsPath: path.join(root, 'next-ports'),
    stoppedGroupsPath: path.join(root, 'stopped-groups'),
    suiteDonePath: path.join(root, 'suite-done'),
    reportLeakPath: path.join(root, 'report-leaked'),
    childEnvironmentCapturePath: path.join(root, 'child-environment.log'),
  };
}

function runnerEnvironment(sandbox, overrides = {}) {
  const environment = {
    PATH: `${sandbox.binDir}${path.delimiter}${process.env.PATH}`,
    HOME: sandbox.root,
    LANG: 'C',
    FAKE_INVOCATIONS: sandbox.invocationPath,
    FAKE_LOCK_STATE: sandbox.lockStatePath,
    FAKE_STARTED_PORTS: sandbox.startedPortsPath,
    FAKE_PORT_GROUPS: sandbox.portGroupsPath,
    FAKE_NEXT_PORTS: sandbox.nextPortsPath,
    FAKE_STOPPED_GROUPS: sandbox.stoppedGroupsPath,
    FAKE_SUITE_DONE: sandbox.suiteDonePath,
    FAKE_REPORT_ROOT: path.join(sandbox.root, 'reports', 'e2e', runId),
    FAKE_REPORT_LEAKED: sandbox.reportLeakPath,
    FAKE_CHILD_ENV_CAPTURE: sandbox.childEnvironmentCapturePath,
    FAKE_RUN_ID: runId,
    FAKE_RUN_SECRET: privateValues[2],
    FAKE_MYSQL_PASSWORD: privateValues[0],
    FAKE_REDIS_PASSWORD: privateValues[1],
    FAKE_COOKIE_VALUE: privateValues[3],
    FAKE_CODE_VALUE: privateValues[4],
    FAKE_BEARER_TOKEN: privateValues[5],
    TERRAPEDIA_E2E_ENABLED: '1',
    TERRAPEDIA_E2E_MYSQL_USERNAME: 'e2e_runner',
    TERRAPEDIA_E2E_MYSQL_PASSWORD: privateValues[0],
    TERRAPEDIA_E2E_REDIS_PASSWORD: privateValues[1],
    TERRAPEDIA_E2E_BACKEND_PORT: '18081',
    TERRAPEDIA_E2E_FRONTEND_PORT: '15177',
    TERRAPEDIA_E2E_CHROMIUM_EXECUTABLE: path.join(sandbox.binDir, 'chromium'),
  };
  fs.writeFileSync(sandbox.nextPortsPath, '18081\n15177\n');

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete environment[name];
    } else {
      environment[name] = value;
    }
  }
  return environment;
}

function runRunner(sandbox, overrides = {}, mode = '--smoke', bashOptions = []) {
  return spawnSync('bash', [...bashOptions, path.join(sandbox.root, 'scripts/dev/run-user-auth-e2e.sh'), mode], {
    cwd: sandbox.root,
    env: runnerEnvironment(sandbox, overrides),
    encoding: 'utf8',
  });
}

function invocations(sandbox) {
  if (!fs.existsSync(sandbox.invocationPath)) return [];
  return fs.readFileSync(sandbox.invocationPath, 'utf8').trim().split('\n').filter(Boolean);
}

function capturedChildEnvironment(sandbox) {
  if (!fs.existsSync(sandbox.childEnvironmentCapturePath)) return new Map();
  const captured = new Map();

  for (const line of fs.readFileSync(sandbox.childEnvironmentCapturePath, 'utf8').trim().split('\n').filter(Boolean)) {
    const [prefix, label, variable, state] = line.split('\t');
    assert.equal(prefix, 'env');
    if (!captured.has(label)) captured.set(label, new Map());
    captured.get(label).set(variable, state);
  }
  return captured;
}

function assertNoDataClients(sandbox) {
  assert.equal(
    invocations(sandbox).some((line) => line.startsWith('mysql\t') || line.startsWith('redis-cli\t')),
    false,
    'preflight must finish before any database or Redis client call',
  );
}

function createUnsafeReportPath(sandbox, pathKind, unsafeKind) {
  const reportsPath = path.join(sandbox.root, 'reports');
  const e2ePath = path.join(reportsPath, 'e2e');
  const runPath = path.join(e2ePath, runId);
  const artifactsPath = path.join(runPath, 'artifacts');
  const unsafePath = {
    reports: reportsPath,
    e2e: e2ePath,
    run: runPath,
    artifacts: artifactsPath,
  }[pathKind];

  assert.ok(unsafePath, `unknown report path kind: ${pathKind}`);
  if (pathKind !== 'reports') {
    fs.mkdirSync(reportsPath, { recursive: true, mode: 0o700 });
    fs.chmodSync(reportsPath, 0o700);
  }
  if (pathKind === 'run' || pathKind === 'artifacts') {
    fs.mkdirSync(e2ePath, { recursive: true, mode: 0o700 });
    fs.chmodSync(e2ePath, 0o700);
  }
  if (pathKind === 'artifacts') {
    fs.mkdirSync(runPath, { recursive: true, mode: 0o700 });
    fs.chmodSync(runPath, 0o700);
  }

  if (unsafeKind === '0755') {
    fs.mkdirSync(unsafePath, { recursive: true, mode: 0o755 });
    fs.chmodSync(unsafePath, 0o755);
    return { externalSummaryPath: undefined };
  }

  if (unsafeKind === 'non-directory') {
    fs.writeFileSync(unsafePath, 'not a report directory\n', { mode: 0o600 });
    return { externalSummaryPath: undefined };
  }

  if (unsafeKind === 'non-current') {
    fs.mkdirSync(unsafePath, { recursive: true, mode: 0o700 });
    fs.chmodSync(unsafePath, 0o700);
    return { externalSummaryPath: undefined, reportOwnerPath: unsafePath };
  }

  const externalPath = path.join(sandbox.root, `external-${pathKind}-report-root`);
  fs.mkdirSync(externalPath, { recursive: true, mode: 0o700 });
  fs.chmodSync(externalPath, 0o700);
  fs.symlinkSync(externalPath, unsafePath);
  const externalSummaryPath = path.join(
    externalPath,
    ...({ reports: ['e2e', runId], e2e: [runId], run: [], artifacts: [] }[pathKind]),
    'summary.json',
  );

  return { externalSummaryPath };
}

function walkFiles(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

function assertPrivateValuesAreAbsent(sandbox, result) {
  const reportContents = walkFiles(path.join(sandbox.root, 'reports', 'e2e'))
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
  const observableOutput = `${result.stdout}\n${result.stderr}\n${reportContents}\n${invocations(sandbox).join('\n')}`;

  for (const value of privateValues) {
    assert.doesNotMatch(observableOutput, new RegExp(value));
  }
}

test('removes registered fake lifecycle sandboxes when cleanup runs', () => {
  const sandbox = makeSandbox();

  cleanupSandboxes();

  assert.equal(fs.existsSync(sandbox.root), false);
  assert.equal(sandboxRoots.has(sandbox.root), false);
});

test('requires explicit E2E consent before data clients run', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { TERRAPEDIA_E2E_ENABLED: '0' });

  assert.notEqual(result.status, 0);
  assertNoDataClients(sandbox);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('rejects remote MySQL and Redis endpoints before data clients run', () => {
  for (const overrides of [
    { TERRAPEDIA_E2E_MYSQL_HOST: 'db.example.test' },
    { TERRAPEDIA_E2E_REDIS_HOST: 'cache.example.test' },
    { TERRAPEDIA_E2E_MYSQL_HOST: 'localhost' },
    { TERRAPEDIA_E2E_REDIS_HOST: 'localhost' },
  ]) {
    const sandbox = makeSandbox();
    const result = runRunner(sandbox, overrides);

    assert.notEqual(result.status, 0);
    assertNoDataClients(sandbox);
    assertPrivateValuesAreAbsent(sandbox, result);
  }
});

test('rejects an unknown mode before data clients run', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, {}, '--unsafe-mode');

  assert.notEqual(result.status, 0);
  assertNoDataClients(sandbox);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('rejects invalid ports before data clients run', () => {
  for (const overrides of [
    { TERRAPEDIA_E2E_MYSQL_PORT: 'not-a-port' },
    { TERRAPEDIA_E2E_BACKEND_PORT: '70000' },
  ]) {
    const sandbox = makeSandbox();
    const result = runRunner(sandbox, overrides);

    assert.notEqual(result.status, 0);
    assertNoDataClients(sandbox);
    assertPrivateValuesAreAbsent(sandbox, result);
  }
});

test('rejects ordinary datasource and local-stack configuration inheritance before data clients run', () => {
  for (const overrides of [
    { TERRAPEDIA_DB_URL: 'jdbc:mysql://127.0.0.1:3306/ordinary_database' },
    { TERRAPEDIA_LOCAL_STACK_CONFIG: '/tmp/ordinary-local-stack.json' },
  ]) {
    const sandbox = makeSandbox();
    const result = runRunner(sandbox, overrides);

    assert.notEqual(result.status, 0);
    assertNoDataClients(sandbox);
    assertPrivateValuesAreAbsent(sandbox, result);
  }
});

test('rejects an unsafe generated run ID before data clients run', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_RUN_ID: '../ordinary_database' });

  assert.notEqual(result.status, 0);
  assertNoDataClients(sandbox);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('migrates current-user generic report parents from 0755 to 0700 before clients run', () => {
  const sandbox = makeSandbox();
  const reportsPath = path.join(sandbox.root, 'reports');
  const e2ePath = path.join(reportsPath, 'e2e');

  fs.mkdirSync(e2ePath, { recursive: true, mode: 0o755 });
  fs.chmodSync(reportsPath, 0o755);
  fs.chmodSync(e2ePath, 0o755);
  const result = runRunner(sandbox);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.statSync(reportsPath).mode & 0o777, 0o700);
  assert.equal(fs.statSync(e2ePath).mode & 0o777, 0o700);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('rejects unsafe generic and exact durable report paths before clients or child processes run', () => {
  const cases = [
    ...['reports', 'e2e'].flatMap((pathKind) => ['symlink', 'non-current', 'non-directory'].map((unsafeKind) => ({ pathKind, unsafeKind }))),
    ...['run', 'artifacts'].flatMap((pathKind) => ['symlink', 'non-current', 'non-directory', '0755'].map((unsafeKind) => ({ pathKind, unsafeKind }))),
  ];

  for (const { pathKind, unsafeKind } of cases) {
    const sandbox = makeSandbox();
    const { externalSummaryPath, reportOwnerPath } = createUnsafeReportPath(sandbox, pathKind, unsafeKind);
    const result = runRunner(sandbox, reportOwnerPath ? { FAKE_REPORT_OWNER_PATH: reportOwnerPath } : {});
    const calls = invocations(sandbox);

    assert.notEqual(result.status, 0, `${pathKind}/${unsafeKind} must be rejected`);
    assertNoDataClients(sandbox);
    assert.equal(calls.some((line) => line.startsWith('mvn\t')), false);
    assert.equal(calls.some((line) => line.startsWith('pnpm\t')), false);
    assert.equal(calls.includes('summary-write'), false);
    if (externalSummaryPath) {
      assert.equal(fs.existsSync(externalSummaryPath), false, 'unsafe external target must not receive a summary');
    }
    assertPrivateValuesAreAbsent(sandbox, result);
  }
});

test('rejects inherited E2E database, run ID, Redis database, and test-hook overrides before data clients run', () => {
  for (const overrides of [
    { TERRAPEDIA_E2E_DB_NAME: 'terria_v1_e2e_some_other_run' },
    { TERRAPEDIA_E2E_RUN_ID: 'inherited-run-id' },
    { TERRAPEDIA_E2E_REDIS_DATABASE: '14' },
    { TERRAPEDIA_E2E_TEST_READY_ATTEMPTS: '1' },
    { TERRAPEDIA_E2E_TEST_PORT_OWNERSHIP_HELPER: '/tmp/hostile-helper' },
    { TERRAPEDIA_E2E_TEST_PROCESS_GROUP_HELPER: '/tmp/hostile-helper' },
    { TERRAPEDIA_E2E_TEST_STOP_HELPER: '/tmp/hostile-helper' },
    { TERRAPEDIA_E2E_TEST_FORCE_DATABASE_IDENTITY_FAILURE: '1' },
  ]) {
    const sandbox = makeSandbox();
    const result = runRunner(sandbox, overrides);

    assert.notEqual(result.status, 0);
    assertNoDataClients(sandbox);
    assertPrivateValuesAreAbsent(sandbox, result);
  }
});

test('requires dedicated E2E database credentials before data clients run', () => {
  for (const missingVariable of [
    'TERRAPEDIA_E2E_MYSQL_USERNAME',
    'TERRAPEDIA_E2E_MYSQL_PASSWORD',
  ]) {
    const sandbox = makeSandbox();
    const environment = runnerEnvironment(sandbox);
    delete environment[missingVariable];
    const result = spawnSync('bash', [path.join(sandbox.root, 'scripts/dev/run-user-auth-e2e.sh'), '--smoke'], {
      cwd: sandbox.root,
      env: environment,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assertNoDataClients(sandbox);
    assertPrivateValuesAreAbsent(sandbox, result);
  }
});

test('rejects MySQL option-file control-character injection before creating a private file or client call', () => {
  for (const overrides of [
    { TERRAPEDIA_E2E_MYSQL_USERNAME: 'e2e_runner\ninit-command=SELECT injected_username' },
    { TERRAPEDIA_E2E_MYSQL_PASSWORD: `${privateValues[0]}\r\ninit-command=SELECT injected_password` },
  ]) {
    const sandbox = makeSandbox();
    const result = runRunner(sandbox, overrides);
    const calls = invocations(sandbox);
    const observableOutput = `${result.stdout}\n${result.stderr}\n${calls.join('\n')}`;

    assert.notEqual(result.status, 0);
    assertNoDataClients(sandbox);
    assert.equal(calls.some((line) => line.startsWith('mktemp\t')), false, 'unsafe credentials must not create an option file');
    assert.doesNotMatch(observableOutput, /init-command=SELECT injected_/);
    assertPrivateValuesAreAbsent(sandbox, result);
  }
});

test('disables inherited Bash xtrace before reading isolated E2E secrets', () => {
  const sandbox = makeSandbox();
  const result = runRunner(
    sandbox,
    {
      SHELLOPTS: 'braceexpand:hashall:interactive-comments:xtrace',
      BASH_XTRACEFD: '2',
      FAKE_PRIVATE_LOG: '1',
    },
    '--smoke',
    ['-x'],
  );
  const traceLine = `${result.stdout}\n${result.stderr}`.split('\n').find((line) => line.startsWith('+'));

  assert.equal(result.status, 0, result.stderr);
  assert.ok(traceLine, 'the xtrace lifecycle must produce a trace line before tracing is disabled');
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('disables inherited SHELLOPTS xtrace as the first executable action', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, {
    SHELLOPTS: 'braceexpand:hashall:interactive-comments:xtrace',
    TERRAPEDIA_E2E_MYSQL_USERNAME: 'e2e_runner\ninit-command=stop-before-clients',
  });
  const traceLine = `${result.stdout}\n${result.stderr}`.split('\n').find((line) => line.startsWith('+'));

  assert.notEqual(result.status, 0);
  assert.equal(traceLine, '+ set +x');
  assertNoDataClients(sandbox);
  assert.equal(fs.existsSync(path.join(sandbox.root, 'reports', 'e2e')), false);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('keeps generic Spring Config imports out of isolated E2E children', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { SPRING_CONFIG_IMPORT: 'optional:file:ambient-spring-config' });
  const captured = capturedChildEnvironment(sandbox);

  assert.equal(result.status, 0, result.stderr);
  for (const label of ['mvn', 'nuxt', 'playwright']) {
    const environment = captured.get(label);

    assert.ok(environment, 'missing ' + label + ' environment capture');
    assert.equal(environment.get('SPRING_CONFIG_IMPORT'), 'unset');
    assert.equal(environment.get('TERRAPEDIA_E2E_DB_URL'), 'set');
    assert.equal(environment.get('TERRAPEDIA_E2E_RUN_SECRET'), 'set');
  }
});

test('starts the marker-owned E2E schema from Flyway V1', () => {
  const source = requireRunnerSource();

  assert.match(source, /^\s*'SPRING_FLYWAY_BASELINE_VERSION=0'$/m);
});

test('runs Maven, Nuxt, and Playwright with an isolated E2E environment allowlist', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, {
    JAVA_TOOL_OPTIONS: 'poison-java-tool-options',
    JDK_JAVA_OPTIONS: 'poison-jdk-java-options',
    MAVEN_OPTS: 'poison-maven-options',
    SPRING_CONFIG_LOCATION: 'poison-spring-location',
    SPRING_CONFIG_ADDITIONAL_LOCATION: 'poison-spring-additional-location',
    SPRING_CONFIG_IMPORT: 'optional:file:poison-spring-import',
    SPRING_APPLICATION_JSON: '{"poison":true}',
    NODE_OPTIONS: '--require=poison-node-options',
    REDISCLI_AUTH: 'poison-redis-auth',
    MYSQL_PWD: 'poison-mysql-password',
    MYSQL_HOST: 'poison-mysql-host',
    ARBITRARY_POISON: 'poison-arbitrary-environment',
  });
  const captured = capturedChildEnvironment(sandbox);
  const forbiddenVariables = [
    'JAVA_TOOL_OPTIONS',
    'JDK_JAVA_OPTIONS',
    'MAVEN_OPTS',
    'SPRING_CONFIG_LOCATION',
    'SPRING_CONFIG_ADDITIONAL_LOCATION',
    'SPRING_CONFIG_IMPORT',
    'SPRING_APPLICATION_JSON',
    'NODE_OPTIONS',
    'REDISCLI_AUTH',
    'MYSQL_PWD',
    'MYSQL_HOST',
    'ARBITRARY_POISON',
  ];
  const requiredVariables = [
    'TERRAPEDIA_E2E_DB_URL',
    'TERRAPEDIA_E2E_RUN_ID',
    'TERRAPEDIA_E2E_RUN_SECRET',
    'TERRAPEDIA_E2E_REDIS_DATABASE',
    'SERVER_PORT',
    'E2E_BASE_URL',
    'E2E_ARTIFACT_DIR',
    'E2E_CHROMIUM_EXECUTABLE',
  ];

  assert.equal(result.status, 0, result.stderr);
  for (const label of ['mvn', 'nuxt', 'playwright']) {
    const environment = captured.get(label);
    assert.ok(environment, 'missing ' + label + ' environment capture');
    for (const variable of forbiddenVariables) {
      assert.equal(environment.get(variable), 'unset', variable + ' leaked into ' + label);
    }
    for (const variable of requiredVariables) {
      assert.equal(environment.get(variable), 'set', variable + ' is required by ' + label);
    }
  }
});

test('records ownership after an exclusive derived database create, keeps child logs private, and cleans up derived targets', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_PRIVATE_LOG: '1' });
  const calls = invocations(sandbox);
  const createIndex = calls.findIndex((line) => line.includes('CREATE DATABASE'));
  const markerIndex = calls.findIndex((line) => line.includes('__terrapedia_e2e_ownership'));
  const dropIndex = calls.findIndex((line) => line.includes('DROP DATABASE'));
  const firstFlushIndex = calls.findIndex((line) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB'));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.filter((line) => line.includes('CREATE DATABASE')).length, 1);
  assert.equal(calls.filter((line) => line.includes('randomBytes(16)')).length, 1, 'run ID must be generated once');
  assert.ok(createIndex >= 0, 'expected an exclusive CREATE DATABASE call');
  assert.doesNotMatch(calls[createIndex], /IF NOT EXISTS/);
  assert.ok(markerIndex > createIndex, 'ownership marker must follow CREATE DATABASE');
  assert.ok(firstFlushIndex > markerIndex, 'Redis flush must follow ownership marker creation');
  assert.ok(dropIndex > markerIndex, 'cleanup must happen after ownership marker creation');
  assert.match(calls[createIndex], new RegExp(`CREATE DATABASE .*${derivedDatabase}`));
  assert.match(calls[dropIndex], new RegExp(`DROP DATABASE .*${derivedDatabase}`));
  assert.equal(calls.some((line) => line.startsWith('redis-cli\t') && !line.includes('\t-n\t15\t')), false);
  assert.deepEqual(
    walkFiles(path.join(sandbox.root, 'reports', 'e2e', runId))
      .map((filePath) => path.relative(path.join(sandbox.root, 'reports', 'e2e', runId), filePath)),
    ['artifacts/failure.png', 'summary.json'],
    'only redacted browser artifacts and the summary may be promoted to reports',
  );
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('probes the user refresh readiness endpoint with POST', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox);
  const refreshProbe = invocations(sandbox).find((line) => (
    line.startsWith('curl\t') && line.includes('/api/user-auth/refresh')
  ));

  assert.equal(result.status, 0, result.stderr);
  assert.ok(refreshProbe, 'expected a user refresh readiness probe');
  assert.match(refreshProbe, /\t--request\tPOST(?:\t|$)/);
});

test('dispatches the maintained user-auth Playwright scripts for both modes', () => {
  for (const [mode, scriptName] of [
    ['--smoke', 'test:e2e:auth:smoke'],
    ['--regression', 'test:e2e:auth:regression'],
  ]) {
    const sandbox = makeSandbox();
    const result = runRunner(sandbox, {}, mode);
    const suiteCall = invocations(sandbox).find((line) => (
      line.startsWith('pnpm\t') && line.includes('\ttest:e2e:')
    ));

    assert.equal(result.status, 0, result.stderr);
    assert.ok(suiteCall, `expected a Playwright suite call for ${mode}`);
    assert.match(suiteCall, new RegExp(`\\t${scriptName}(?:\\t|$)`));
  }
});

test('retains redacted browser artifacts under the durable E2E report after cleanup', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox);
  const artifactPath = path.join(sandbox.root, 'reports', 'e2e', runId, 'artifacts', 'failure.png');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(artifactPath, 'utf8'), 'redacted browser artifact\n');
  assert.equal(fs.statSync(artifactPath).mode & 0o077, 0);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('retains redacted browser failure artifacts after a failed suite and cleanup', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_SUITE_FAILURE: '1' });
  const reportPath = path.join(sandbox.root, 'reports', 'e2e', runId);
  const artifactPath = path.join(reportPath, 'artifacts', 'failure.png');

  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(artifactPath, 'utf8'), 'redacted browser artifact\n');
  const summary = JSON.parse(fs.readFileSync(path.join(reportPath, 'summary.json'), 'utf8'));
  assert.equal(summary.outcome, 'failed');
  assert.equal(summary.exitStatus, 1);
  assert.equal(summary.cleanupStatus, 'passed');
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('fails safely when a configured backend port is occupied before runner start', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_OCCUPIED_PORT: '18081' });
  const calls = invocations(sandbox);

  assert.notEqual(result.status, 0);
  assert.equal(calls.some((line) => line.startsWith('mvn\t')), false);
  assert.equal(calls.some((line) => line.startsWith('curl\t')), false);
  assert.equal(calls.some((line) => line.includes('test:e2e:')), false);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('cleans owned data after a pre-start port collision when no process was recorded', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_OCCUPIED_PORT: '18081' });
  const calls = invocations(sandbox);

  assert.notEqual(result.status, 0);
  assert.ok(calls.some((line) => line.includes('DROP DATABASE')));
  assert.equal(calls.filter((line) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB')).length, 2);
});

test('fails safely when the configured frontend port is occupied before frontend start', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_OCCUPIED_PORT: '15177' });
  const calls = invocations(sandbox);

  assert.notEqual(result.status, 0);
  assert.ok(calls.some((line) => line.includes('18081/api/user-auth/refresh')));
  assert.equal(calls.some((line) => line.startsWith('pnpm\t') && line.includes('nuxt')), false);
  assert.equal(calls.some((line) => line.includes('test:e2e:')), false);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('requires a backend listener to belong to the recorded process group before readiness curl', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_UNOWNED_PORT: '18081' });
  const calls = invocations(sandbox);

  assert.notEqual(result.status, 0);
  assert.ok(calls.some((line) => line.startsWith('ss\t-H\t-ltnp') && line.includes('18081')), `${result.stderr}\n${calls.join('\n')}`);
  assert.equal(calls.some((line) => line.startsWith('curl\t')), false);
  assert.equal(calls.some((line) => line.includes('test:e2e:')), false);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('rejects a backend port when any listener PID is outside the recorded process group', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_MIXED_LISTENER_PORT: '18081' });
  const calls = invocations(sandbox);

  assert.notEqual(result.status, 0);
  assert.ok(calls.some((line) => line.startsWith('ss\t-H\t-ltnp') && line.includes('18081')));
  assert.equal(calls.some((line) => line.startsWith('curl\t')), false);
  assert.equal(calls.some((line) => line.includes('test:e2e:')), false);
});

test('requires a frontend listener to belong to the recorded process group before frontend readiness curl', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_UNOWNED_PORT: '15177' });
  const calls = invocations(sandbox);
  const frontendCurl = calls.find((line) => line.startsWith('curl\t') && line.includes('15177'));

  assert.notEqual(result.status, 0, `${result.stderr}\n${calls.join('\n')}`);
  assert.ok(calls.some((line) => line.includes('18081/api/user-auth/refresh')));
  assert.ok(calls.some((line) => line.startsWith('ss\t-H\t-ltnp') && line.includes('15177')));
  assert.equal(frontendCurl, undefined);
  assert.equal(calls.some((line) => line.includes('test:e2e:')), false);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('writes only safe reports while private process output remains in the private run directory', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, {
    FAKE_PRIVATE_LOG: '1',
    FAKE_REPORT_LEAK_CHECK: '1',
  });
  const reportFiles = walkFiles(path.join(sandbox.root, 'reports', 'e2e'));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(sandbox.reportLeakPath), false, 'suite-time report scan found a private value');
  assert.deepEqual(
    reportFiles.map((filePath) => path.relative(path.join(sandbox.root, 'reports', 'e2e', runId), filePath)),
    ['artifacts/failure.png', 'summary.json'],
  );
  for (const reportFile of reportFiles) {
    assert.equal(fs.statSync(reportFile).mode & 0o077, 0, `${reportFile} must be private`);
  }
  assert.equal(fs.statSync(path.join(sandbox.root, 'reports', 'e2e', runId)).mode & 0o077, 0);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('does not write a summary when report preparation fails before releasing the lock', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_REPORT_PREP_FAILURE: '1' });
  const calls = invocations(sandbox);
  const releaseIndex = calls.findIndex((line) => line === 'flock\t-u\t9');

  assert.notEqual(result.status, 0);
  assert.equal(calls.includes('summary-write'), false);
  assert.equal(fs.existsSync(path.join(sandbox.root, 'reports', 'e2e', runId, 'summary.json')), false);
  assert.ok(releaseIndex >= 0, 'flock must still be released after a preparation failure');
});

test('fails closed when writing the summary fails before the lock is released', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_REPORT_WRITE_FAILURE: '1' });
  const calls = invocations(sandbox);
  const summaryWriteIndex = calls.findIndex((line) => line === 'summary-write');
  const releaseIndex = calls.findIndex((line) => line === 'flock\t-u\t9');

  assert.notEqual(result.status, 0);
  assert.ok(summaryWriteIndex >= 0);
  assert.ok(releaseIndex > summaryWriteIndex, 'flock release must follow the failed summary attempt');
});

test('help exits without invoking a fake command or writing an E2E report', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, {}, '--help');

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(invocations(sandbox), []);
  assert.equal(fs.existsSync(path.join(sandbox.root, 'reports', 'e2e')), false);
});

test('stops after a create collision without marker, Redis flush, backend start, or drop', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_CREATE_COLLISION: '1' });
  const calls = invocations(sandbox);

  assert.notEqual(result.status, 0);
  assert.equal(calls.filter((line) => line.includes('CREATE DATABASE')).length, 1);
  assert.doesNotMatch(calls.find((line) => line.includes('CREATE DATABASE')), /IF NOT EXISTS/);
  assert.equal(calls.some((line) => line.includes('__terrapedia_e2e_ownership')), false);
  assert.equal(calls.some((line) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB')), false);
  assert.equal(calls.some((line) => line.startsWith('mvn\t')), false);
  assert.equal(calls.some((line) => line.includes('DROP DATABASE')), false);
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('cleanup stops owned groups before Redis flush, then validates and drops the derived database', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox);
  const calls = invocations(sandbox);
  const stopIndex = calls.findIndex((line) => line.startsWith('kill\t'));
  const flushIndexes = calls
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB'))
    .map(({ index }) => index);
  const markerValidationIndex = calls.findIndex((line) => line.includes('SELECT 1 FROM __terrapedia_e2e_ownership'));
  const dropIndex = calls.findIndex((line) => line.includes('DROP DATABASE'));

  assert.equal(result.status, 0, result.stderr);
  assert.ok(stopIndex >= 0);
  assert.ok(flushIndexes.at(-1) > stopIndex);
  assert.ok(markerValidationIndex > flushIndexes.at(-1));
  assert.ok(dropIndex > markerValidationIndex);
});

test('does not clean data when an owned process cannot be stopped', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_STOP_FAILURE: '1' });
  const calls = invocations(sandbox);
  const flushCount = calls.filter((line) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB')).length;

  assert.notEqual(result.status, 0);
  assert.equal(flushCount, 1, 'only the pre-run flush is allowed');
  assert.equal(calls.some((line) => line.includes('DROP DATABASE')), false);
});

test('does not clean data while a stopped group leaves an unowned listener behind', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_PERSISTENT_UNOWNED_LISTENER_AFTER_STOP: '1' });
  const calls = invocations(sandbox);
  const flushCount = calls.filter((line) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB')).length;

  assert.notEqual(result.status, 0);
  assert.equal(flushCount, 1, 'only the pre-run flush is allowed while a listener remains');
  assert.equal(calls.some((line) => line.includes('DROP DATABASE')), false);
});

test('rejects a missing ownership marker without dropping a database', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_MARKER_MISSING: '1' });
  const calls = invocations(sandbox);

  assert.notEqual(result.status, 0);
  assert.equal(calls.some((line) => line.includes('DROP DATABASE')), false);
});

test('keeps the fake OS lock held while cleanup attempts the database drop', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_LOCK_PROBE_ON_DROP: '1' });
  const calls = invocations(sandbox);
  const lockAcquireIndex = calls.findIndex((line) => line === 'flock\t-n\t9');
  const createIndex = calls.findIndex((line) => line.includes('CREATE DATABASE'));
  const probeIndex = calls.findIndex((line) => line === 'lock-probe=blocked');
  const releaseIndex = calls.findIndex((line) => line === 'flock\t-u\t9');

  assert.equal(result.status, 0, result.stderr);
  assert.ok(lockAcquireIndex >= 0 && lockAcquireIndex < createIndex, 'lock must be acquired before CREATE DATABASE');
  assert.ok(probeIndex >= 0, 'a second nonblocking lock attempt must be blocked during cleanup');
  assert.ok(releaseIndex > probeIndex);
  assert.equal(fs.existsSync(sandbox.lockStatePath), false, 'lock state must be released after cleanup');
});

test('reports a cleanup failure when the owned database cannot be dropped', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_DROP_FAILURE: '1' });
  const calls = invocations(sandbox);

  assert.notEqual(result.status, 0);
  assert.equal(calls.filter((line) => line.includes('DROP DATABASE')).length, 1);
  assert.ok(calls.some((line) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB')));
  assert.ok(calls.some((line) => line === 'flock\t-u\t9'));
  const summary = JSON.parse(fs.readFileSync(path.join(sandbox.root, 'reports', 'e2e', runId, 'summary.json'), 'utf8'));
  assert.equal(summary.outcome, 'failed');
  assert.equal(summary.exitStatus, 1);
  assert.equal(summary.cleanupStatus, 'failed');
  assertPrivateValuesAreAbsent(sandbox, result);
});

test('stops a surviving child listener when the recorded group leader has exited', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_LEADER_EXITED: '1' });
  const calls = invocations(sandbox);
  const firstCleanupStop = calls.findIndex((line) => line.startsWith('kill\t-TERM\t--\t-'));
  const finalFlush = calls
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB'))
    .at(-1)?.index;

  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.some((line) => line.startsWith('group-member\t999998\t')), 'fake ps must expose the child, not the dead leader');
  assert.ok(firstCleanupStop >= 0, 'cleanup must signal the surviving process group');
  assert.ok(finalFlush > firstCleanupStop, 'data cleanup must follow safe process-group shutdown');
});

test('signal cleanup retains the lock until it has cleaned only the owned derived database and Redis DB 15', () => {
  const sandbox = makeSandbox();
  const result = runRunner(sandbox, { FAKE_SIGNAL_DURING_SUITE: '1' });
  const calls = invocations(sandbox);
  const lockReleaseIndex = calls.findIndex((line) => line === 'flock\t-u\t9');
  const dropIndex = calls.findIndex((line) => line.includes('DROP DATABASE'));
  const cleanupFlushIndexes = calls
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith('redis-cli\t') && line.includes('\tFLUSHDB'))
    .map(({ index }) => index);

  assert.notEqual(result.status, 0);
  assert.ok(dropIndex >= 0, `signal cleanup must drop the owned database\n${result.stderr}\n${calls.join('\n')}`);
  assert.ok(lockReleaseIndex > dropIndex, 'flock must remain held until database cleanup finishes');
  assert.ok(cleanupFlushIndexes.some((index) => index < lockReleaseIndex), 'cleanup must flush Redis before lock release');
  assert.equal(calls.some((line) => line.includes('DROP DATABASE') && !line.includes(derivedDatabase)), false);
  assert.equal(calls.some((line) => line.startsWith('redis-cli\t') && !line.includes('\t-n\t15\t')), false);
  assertPrivateValuesAreAbsent(sandbox, result);
});

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_HEARTBEAT_FILE = path.join(
  repoRoot,
  'reports',
  'backend-refresh',
  'backend-refresh-daemon.heartbeat.json'
);
const DEFAULT_STALE_MINUTES = 30;

const rawOptions = parseArgs(process.argv.slice(2));

if (rawOptions.help) {
  printHelp();
  process.exit(0);
}

const heartbeatFile = path.resolve(
  repoRoot,
  String(rawOptions.heartbeatFile ?? rawOptions['heartbeat-file'] ?? DEFAULT_HEARTBEAT_FILE)
);
const staleMinutes = normalizePositiveNumber(
  rawOptions.staleMinutes ?? rawOptions['stale-minutes'],
  DEFAULT_STALE_MINUTES
);
const now = normalizeDate(rawOptions.now, new Date());

const result = checkHeartbeat({ heartbeatFile, staleMinutes, now });
console.log(JSON.stringify(result.payload, null, 2));
process.exit(result.exitCode);

function checkHeartbeat({ heartbeatFile, staleMinutes, now }) {
  if (!fs.existsSync(heartbeatFile)) {
    return {
      exitCode: 1,
      payload: {
        status: 'missing',
        heartbeatFile,
        stale: true
      }
    };
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(heartbeatFile, 'utf8'));
  } catch (error) {
    return {
      exitCode: 1,
      payload: {
        status: 'invalid',
        heartbeatFile,
        stale: true,
        error: error.message
      }
    };
  }

  const generatedAtText = String(payload.generatedAt ?? '');
  const generatedAtMs = Date.parse(generatedAtText);
  if (!Number.isFinite(generatedAtMs)) {
    return {
      exitCode: 1,
      payload: {
        status: String(payload.status ?? 'invalid'),
        heartbeatFile,
        generatedAt: payload.generatedAt ?? null,
        stale: true,
        error: 'Heartbeat generatedAt is missing or invalid.'
      }
    };
  }

  const ageMinutes = roundToTwoDecimals((now.getTime() - generatedAtMs) / 60000);
  const stale = ageMinutes >= staleMinutes;
  return {
    exitCode: stale ? 2 : 0,
    payload: {
      status: String(payload.status ?? 'unknown'),
      heartbeatFile,
      generatedAt: payload.generatedAt,
      ageMinutes,
      stale,
      pid: normalizeNullableInteger(payload.pid),
      activeChildPid: normalizeNullableInteger(payload.activeChildPid),
      lastOutputPath: payload.lastOutputPath ?? null
    }
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '-h' || token === '--help') {
      result.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    if (separatorIndex !== -1) {
      result[body.slice(0, separatorIndex)] = body.slice(separatorIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[body] = true;
      continue;
    }
    result[body] = next;
    index += 1;
  }
  return result;
}

function normalizePositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function normalizeDate(value, fallback) {
  const timestamp = Date.parse(String(value ?? ''));
  if (!Number.isFinite(timestamp)) {
    return fallback;
  }
  return new Date(timestamp);
}

function normalizeNullableInteger(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function roundToTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

function printHelp() {
  console.log(`Usage: node scripts/ops/check-backend-refresh-daemon-heartbeat.mjs [options]

Checks the backend refresh daemon heartbeat JSON file.

Options:
  --heartbeat-file <path>   Heartbeat JSON file to inspect
                            (default: reports/backend-refresh/backend-refresh-daemon.heartbeat.json)
  --stale-minutes <number>  Mark heartbeat stale at this age or older (default: 30)
  --now <iso-date>          Override current time for deterministic checks
  -h, --help                Show this help

Exit codes:
  0  heartbeat exists and is fresh
  1  heartbeat is missing or invalid
  2  heartbeat exists but is stale`);
}

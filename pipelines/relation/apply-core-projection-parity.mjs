#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { buildParityPlan } from './core-projection-parity-contract.mjs';
import { applyParityPlan, readParityPlan } from './core-projection-parity-db.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [k, ...v] = arg.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const mysql = createRequire(path.resolve('apps/admin-console/package.json'))('mysql2/promise');
const output = args.output || 'reports/runtime/core-projection-parity-plan.json';
const domain = args.domain ? String(args.domain) : null;
const config = loadLocalStackConfig();
const connection = await mysql.createConnection({ host: process.env.TERRAPEDIA_DB_HOST || config.database.host || '127.0.0.1', port: Number(process.env.TERRAPEDIA_DB_PORT || config.database.port || 13306), user: config.database.username || 'root', password: config.database.password || 'root', database: 'terria_v1_relation' });
try {
  const domains = await readParityPlan(connection);
  const plan = buildParityPlan({ domains, domain, apply: String(args.apply).toLowerCase() === 'true' });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(plan, null, 2)}\n`);
  if (plan.apply) { await connection.beginTransaction(); try { const changed = await applyParityPlan(connection, plan); await connection.commit(); plan.changed = changed.length; await fs.writeFile(output, `${JSON.stringify(plan, null, 2)}\n`); } catch (error) { await connection.rollback(); throw error; } }
  console.log(JSON.stringify({ output, scopeHash: plan.scopeHash, domain: plan.domain ?? null, apply: plan.apply, counts: Object.fromEntries(Object.entries(plan.domains).map(([k, v]) => [k, v.length])) }));
} finally { await connection.end(); }

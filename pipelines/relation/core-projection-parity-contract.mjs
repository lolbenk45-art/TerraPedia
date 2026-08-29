import crypto from 'node:crypto';

export const CORE_PROJECTION_PARITY_CONTRACT_VERSION = 'core-projection-parity-v1';
export const CORE_PROJECTION_PARITY_DOMAINS = Object.freeze({
  items: Object.freeze({ table: 'projection_items', key: 'internal_name', fields: Object.freeze(['knockback', 'sell']) }),
  npcs: Object.freeze({ table: 'projection_npcs', key: 'internal_name', fields: Object.freeze(['life_max', 'knock_back_resist', 'scale']) }),
  bosses: Object.freeze({ table: 'projection_bosses', key: 'code', fields: Object.freeze(['name_zh']) }),
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function hashScope(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

export function assertParityPlan(plan) {
  if (plan?.schemaVersion !== CORE_PROJECTION_PARITY_CONTRACT_VERSION) throw new Error('parity contract version mismatch');
  if (!plan.readOnly && plan.apply !== true) throw new Error('parity plan must declare apply or read-only');
  const domainsToValidate = plan.domain == null
    ? Object.keys(CORE_PROJECTION_PARITY_DOMAINS)
    : [plan.domain];
  if (domainsToValidate.some((domain) => !Object.hasOwn(CORE_PROJECTION_PARITY_DOMAINS, domain))) {
    throw new Error('unknown parity domain');
  }
  for (const domain of domainsToValidate) {
    const rows = plan.domains?.[domain];
    if (!Array.isArray(rows)) throw new Error(`missing parity domain ${domain}`);
    const keys = new Set();
    for (const row of rows) {
      if (!row.key || keys.has(row.key)) throw new Error(`duplicate or missing ${domain} parity key`);
      keys.add(row.key);
      for (const field of CORE_PROJECTION_PARITY_DOMAINS[domain].fields) {
        if (row.relation?.[field] === undefined) throw new Error(`missing relation-backed ${domain}.${field}`);
      }
    }
  }
  return plan;
}

export function buildParityPlan({ domains, domain = null, database = 'terria_v1_relation', apply = false, generatedAt = new Date().toISOString() }) {
  const selectedDomains = domain == null ? domains : { [domain]: domains?.[domain] ?? [] };
  const plan = { schemaVersion: CORE_PROJECTION_PARITY_CONTRACT_VERSION, generatedAt, database, apply, readOnly: !apply, ...(domain == null ? {} : { domain }), domains: selectedDomains };
  plan.scopeHash = hashScope(plan);
  return assertParityPlan(plan);
}

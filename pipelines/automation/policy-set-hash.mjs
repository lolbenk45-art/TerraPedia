import { createHash } from 'node:crypto';

const SHA256_PATTERN = /^(?:sha256:)?([0-9a-f]{64})$/;
const DOMAIN_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function canonicalizePolicySet(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('policy set must contain at least one row');
  }
  const seen = new Set();
  const canonical = rows.map((row) => {
    if (!row || typeof row !== 'object' || !DOMAIN_PATTERN.test(row.domainId ?? '')) {
      throw new Error('invalid policy domainId');
    }
    if (seen.has(row.domainId)) {
      throw new Error(`duplicate domainId: ${row.domainId}`);
    }
    seen.add(row.domainId);
    if (!Number.isSafeInteger(row.policyVersion) || row.policyVersion < 1) {
      throw new Error(`invalid policyVersion for ${row.domainId}`);
    }
    const match = SHA256_PATTERN.exec(row.policyHash ?? '');
    if (!match) {
      throw new Error(`invalid policyHash for ${row.domainId}`);
    }
    return {
      domainId: row.domainId,
      policyVersion: row.policyVersion,
      policyHash: `sha256:${match[1]}`,
    };
  });
  return canonical.sort((left, right) => compareUtf8(left.domainId, right.domainId));
}

export function computePolicySetHash(rows) {
  const bytes = JSON.stringify(canonicalizePolicySet(rows));
  return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
}

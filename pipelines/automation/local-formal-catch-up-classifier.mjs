const HASH = /^sha256:[a-f0-9]{6,}$/i;

export function classifyFormalCatchUpDomain({
  domain,
  targetVersionContext,
  source,
  formal,
} = {}) {
  const sourceFingerprint = nullable(source?.fingerprint);
  const acknowledgementFingerprint = nullable(formal?.acknowledgement?.fingerprint);
  const tableFingerprint = nullable(formal?.tableReadback?.fingerprint);
  const base = {
    domain: requireText(domain, 'domain'),
    targetVersionContext: requireText(targetVersionContext, 'targetVersionContext'),
    sourceIdentity: sourceIdentity(source),
    formalIdentity: {
      acknowledgement: formal?.acknowledgement ?? null,
      tableReadback: formal?.tableReadback ?? null,
      manifestFingerprint: nullable(formal?.manifestFingerprint),
    },
    writeAllowed: false,
  };

  if (source?.status !== 'ok' || !isHash(sourceFingerprint)) {
    return result(base, 'source_blocked', 'source_identity_unavailable');
  }

  if (acknowledgementFingerprint && tableFingerprint
      && acknowledgementFingerprint !== tableFingerprint) {
    return result(base, 'formal_state_blocked', 'formal_acknowledgement_table_lineage_conflict');
  }

  if (formal?.tableReadback?.status === 'verified' && formal.tableReadback.complete !== true) {
    return result(base, 'formal_state_blocked', 'formal_table_readback_incomplete');
  }

  if (formal?.tableReadback?.status === 'verified'
      && formal.tableReadback.complete === true
      && formal.tableReadback.apiParity !== true) {
    return result(base, 'formal_state_blocked', 'formal_api_parity_unverified');
  }

  const tableVerified = formal?.tableReadback?.status === 'verified'
    && formal?.tableReadback?.complete === true
    && formal?.tableReadback?.apiParity === true
    && Boolean(tableFingerprint)
    && Boolean(formal?.tableReadback?.committedRunId);
  if (acknowledgementFingerprint) {
    if (!tableVerified) {
      return result(base, 'formal_state_blocked', 'formal_table_lineage_unverified');
    }
    if (tableFingerprint !== acknowledgementFingerprint) {
      return result(base, 'formal_state_blocked', 'formal_acknowledgement_table_lineage_conflict');
    }
    if (acknowledgementFingerprint === sourceFingerprint) {
      return result(base, 'current', 'source_and_formal_lineage_match');
    }
    return result(base, 'behind', 'source_newer_than_formal_acknowledgement');
  }

  if (formal?.tableReadback?.status === 'empty'
      && formal.tableReadback.complete === true
      && Number(formal.tableReadback.rowCount) === 0) {
    return result(base, 'behind', 'formal_domain_empty');
  }

  if (tableVerified && tableFingerprint === sourceFingerprint) {
    return result(base, 'acknowledgement_reconcile', 'formal_lineage_current_acknowledgement_missing');
  }

  if (tableVerified && tableFingerprint && tableFingerprint !== sourceFingerprint) {
    return result(base, 'behind', 'source_newer_than_formal_table_lineage');
  }

  if (!formal?.tableReadback || formal?.tableReadback?.status === 'missing' || !tableFingerprint) {
    return result(base, 'formal_state_blocked', 'formal_table_lineage_missing');
  }
  return result(base, 'formal_state_blocked', 'committed_run_identity_missing');
}

export function admitFormalCatchUpDomain({ classification, dependencies, canonical } = {}) {
  if (!classification || typeof classification !== 'object') {
    throw new TypeError('classification is required');
  }
  if (classification.classification !== 'behind') {
    return { ...classification, writeAllowed: false };
  }
  if (dependencies?.complete !== true || Number(dependencies?.unresolvedCount ?? 0) !== 0) {
    return {
      ...classification,
      classification: 'dependency_blocked',
      reason: 'required_dependency_unresolved',
      dependencyEvidence: dependencies ?? null,
      writeAllowed: false,
    };
  }
  if (canonical?.apiParity !== true) {
    return {
      ...classification,
      classification: 'canonical_blocked',
      reason: canonical?.reason ?? 'consumer_api_parity_unverified',
      writeAllowed: false,
    };
  }
  if (canonical?.ready !== true) {
    return {
      ...classification,
      classification: 'canonical_blocked',
      reason: canonical?.reason ?? 'canonical_owner_or_projection_contract_missing',
      writeAllowed: false,
    };
  }
  return {
    ...classification,
    classification: 'ready',
    reason: 'source_formal_dependency_and_canonical_contract_ready',
    ownedTables: Array.isArray(canonical.ownedTables) ? [...canonical.ownedTables] : [],
    writeAllowed: true,
  };
}

function sourceIdentity(source) {
  return {
    status: source?.status ?? null,
    fingerprint: nullable(source?.fingerprint),
    runIdentity: nullable(source?.runIdentity),
    contentIdentity: nullable(source?.contentIdentity),
    checkedAt: nullable(source?.checkedAt),
  };
}

function result(base, classification, reason) {
  return { ...base, classification, reason };
}

function nullable(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function isHash(value) {
  return HASH.test(String(value ?? ''));
}

function requireText(value, label) {
  const normalized = nullable(value);
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

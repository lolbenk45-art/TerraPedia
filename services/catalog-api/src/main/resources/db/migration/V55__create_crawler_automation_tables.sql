CREATE TABLE crawler_automation_owner (
  id BIGINT NOT NULL AUTO_INCREMENT,
  singleton_key TINYINT NOT NULL DEFAULT 1,
  username VARCHAR(120) NOT NULL,
  status VARCHAR(24) NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  bootstrapped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_owner_singleton (singleton_key),
  CONSTRAINT chk_crawler_automation_owner_singleton CHECK (singleton_key = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_policy (
  id BIGINT NOT NULL AUTO_INCREMENT,
  domain_id VARCHAR(64) NOT NULL,
  current_version BIGINT NOT NULL,
  current_level VARCHAR(8) NOT NULL,
  operational_state VARCHAR(24) NOT NULL DEFAULT 'DISABLED',
  circuit_reason VARCHAR(500) NULL,
  circuit_opened_at DATETIME NULL,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_policy_domain (domain_id),
  CONSTRAINT chk_crawler_automation_policy_level CHECK (current_level IN ('L0', 'L1', 'L2')),
  CONSTRAINT chk_crawler_automation_policy_state CHECK (operational_state IN ('DISABLED', 'SHADOW', 'ACTIVE', 'CIRCUIT_OPEN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_policy_version (
  id BIGINT NOT NULL AUTO_INCREMENT,
  domain_id VARCHAR(64) NOT NULL,
  policy_version BIGINT NOT NULL,
  level VARCHAR(8) NOT NULL,
  policy_json JSON NOT NULL,
  policy_hash VARCHAR(71) NOT NULL,
  created_by VARCHAR(120) NOT NULL,
  approved_by VARCHAR(120) NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_policy_version (domain_id, policy_version),
  UNIQUE KEY uk_crawler_automation_policy_version_hash (domain_id, policy_hash),
  CONSTRAINT chk_crawler_automation_policy_version_level CHECK (level IN ('L0', 'L1', 'L2'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_run (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  primary_domain_id VARCHAR(64) NOT NULL,
  covered_domains_json JSON NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  trigger_kind VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  baseline_fingerprint VARCHAR(71) NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_run_id (run_id),
  KEY idx_crawler_automation_run_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_run_policy (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  domain_id VARCHAR(64) NOT NULL,
  policy_version BIGINT NOT NULL,
  policy_hash VARCHAR(71) NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_run_policy (run_id, domain_id),
  KEY idx_crawler_automation_run_policy_set (policy_set_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_attempt_reservation (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  stage VARCHAR(32) NOT NULL,
  ordinal_no INT NOT NULL,
  automation_dedupe_key VARCHAR(160) NOT NULL,
  domain_id VARCHAR(64) NOT NULL,
  covered_domains_json JSON NOT NULL,
  operation_id VARCHAR(96) NOT NULL,
  action_id VARCHAR(96) NOT NULL,
  retry_of VARCHAR(96) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RESERVED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_reservation_identity (run_id, stage, ordinal_no),
  UNIQUE KEY uk_crawler_automation_reservation_dedupe (automation_dedupe_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_run_attempt (
  id BIGINT NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT NOT NULL,
  run_id VARCHAR(96) NOT NULL,
  stage VARCHAR(32) NOT NULL,
  ordinal_no INT NOT NULL,
  automation_dedupe_key VARCHAR(160) NOT NULL,
  queue_contract_version VARCHAR(32) NOT NULL,
  state_store_epoch VARCHAR(96) NOT NULL,
  queue_id VARCHAR(96) NOT NULL,
  attempt_id VARCHAR(96) NOT NULL,
  fence_token VARCHAR(160) NOT NULL,
  state_version BIGINT NOT NULL,
  domain_id VARCHAR(64) NOT NULL,
  covered_domains_json JSON NOT NULL,
  operation_id VARCHAR(96) NOT NULL,
  action_id VARCHAR(96) NOT NULL,
  retry_of VARCHAR(96) NULL,
  status VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_attempt_identity (run_id, stage, ordinal_no),
  UNIQUE KEY uk_crawler_automation_attempt_dedupe (automation_dedupe_key),
  KEY idx_crawler_automation_attempt_queue (queue_id, attempt_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_evidence (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  kind VARCHAR(48) NOT NULL,
  private_path VARCHAR(768) NOT NULL,
  sha256 VARCHAR(71) NOT NULL,
  size_bytes BIGINT NOT NULL,
  schema_version INT NOT NULL,
  frozen_input TINYINT NOT NULL DEFAULT 0,
  policy_set_hash VARCHAR(71) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retention_until DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_evidence_hash (run_id, kind, sha256),
  CONSTRAINT chk_crawler_automation_evidence_size CHECK (size_bytes >= 0),
  CONSTRAINT chk_crawler_automation_evidence_schema CHECK (schema_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_evidence_set (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  evidence_hash VARCHAR(71) NOT NULL,
  manifest_json JSON NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  baseline_fingerprint VARCHAR(71) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_evidence_set_hash (run_id, evidence_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_apply_bundle (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  bundle_hash VARCHAR(71) NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  evidence_hash VARCHAR(71) NOT NULL,
  logical_diff_hash VARCHAR(71) NOT NULL,
  baseline_fingerprint VARCHAR(71) NOT NULL,
  planned_apply_action_id VARCHAR(96) NOT NULL,
  schema_version INT NOT NULL,
  private_path VARCHAR(768) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retention_until DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_apply_bundle_hash (bundle_hash),
  CONSTRAINT chk_crawler_automation_apply_bundle_schema CHECK (schema_version > 0),
  CONSTRAINT chk_crawler_automation_apply_bundle_size CHECK (size_bytes >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_decision (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  decision VARCHAR(40) NOT NULL,
  decision_hash VARCHAR(71) NOT NULL,
  reason_codes_json JSON NOT NULL,
  counts_ratios_json JSON NOT NULL,
  gate_results_json JSON NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  evidence_hash VARCHAR(71) NOT NULL,
  bundle_hash VARCHAR(71) NOT NULL,
  logical_diff_hash VARCHAR(71) NOT NULL,
  logical_diff_identity_json JSON NOT NULL,
  baseline_fingerprint VARCHAR(71) NOT NULL,
  snapshot_required TINYINT NOT NULL DEFAULT 1,
  planned_apply_action_id VARCHAR(96) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_decision_run_hash (run_id, decision_hash),
  CONSTRAINT chk_crawler_automation_decision_type CHECK (decision IN ('BLOCKED_L0', 'REQUIRES_OWNER_L1', 'AUTO_APPLY_L2', 'CIRCUIT_BREAK'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_reauth_challenge (
  id BIGINT NOT NULL AUTO_INCREMENT,
  reauth_id VARCHAR(160) NOT NULL,
  owner_username VARCHAR(120) NOT NULL,
  challenge_hash VARCHAR(71) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_reauth_id (reauth_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_approval (
  id BIGINT NOT NULL AUTO_INCREMENT,
  request_key VARCHAR(160) NOT NULL,
  run_id VARCHAR(96) NOT NULL,
  decision_hash VARCHAR(71) NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  evidence_hash VARCHAR(71) NOT NULL,
  bundle_hash VARCHAR(71) NOT NULL,
  logical_diff_hash VARCHAR(71) NOT NULL,
  logical_diff_identity_json JSON NOT NULL,
  baseline_fingerprint VARCHAR(71) NOT NULL,
  planned_apply_action_id VARCHAR(96) NOT NULL,
  actor VARCHAR(120) NOT NULL,
  action VARCHAR(24) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  reauth_id VARCHAR(160) NOT NULL,
  run_version BIGINT NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_approval_request (request_key),
  KEY idx_crawler_automation_approval_run (run_id, created_at),
  CONSTRAINT chk_crawler_automation_approval_action CHECK (action IN ('APPROVE', 'REJECT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_snapshot (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  scope_descriptor_json JSON NOT NULL,
  private_path VARCHAR(768) NOT NULL,
  sha256 VARCHAR(71) NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  baseline_fingerprint VARCHAR(71) NOT NULL,
  integrity_status VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retention_until DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_snapshot_hash (run_id, sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_apply (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NOT NULL,
  bundle_hash VARCHAR(71) NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  decision_hash VARCHAR(71) NOT NULL,
  approval_id BIGINT NULL,
  mode VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  before_generation_json JSON NOT NULL,
  committed_generation_json JSON NULL,
  commit_protocol VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_apply_run_bundle (run_id, bundle_hash),
  CONSTRAINT chk_crawler_automation_apply_mode CHECK (mode IN ('AUTO_APPLY_L2', 'APPROVED_OWNER_L1'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_alert (
  id BIGINT NOT NULL AUTO_INCREMENT,
  run_id VARCHAR(96) NULL,
  severity VARCHAR(16) NOT NULL,
  dedupe_key VARCHAR(160) NOT NULL,
  status VARCHAR(24) NOT NULL,
  details_json JSON NOT NULL,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by VARCHAR(120) NULL,
  acknowledged_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_alert_dedupe (dedupe_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_write_fence (
  id BIGINT NOT NULL AUTO_INCREMENT,
  environment_id VARCHAR(96) NOT NULL,
  database_role VARCHAR(16) NOT NULL,
  physical_table VARCHAR(96) NOT NULL,
  field_group VARCHAR(96) NOT NULL,
  logical_predicate_hash VARCHAR(71) NOT NULL,
  latest_run_id VARCHAR(96) NOT NULL,
  fence_token VARCHAR(160) NOT NULL,
  before_generation BIGINT NOT NULL,
  committed_generation BIGINT NULL,
  commit_marker VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_write_fence_scope (environment_id, database_role, physical_table, field_group, logical_predicate_hash),
  UNIQUE KEY uk_crawler_automation_write_fence_token (fence_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crawler_automation_mutation_generation (
  id BIGINT NOT NULL AUTO_INCREMENT,
  environment_id VARCHAR(96) NOT NULL,
  database_role VARCHAR(16) NOT NULL,
  physical_table VARCHAR(96) NOT NULL,
  scope_key_hash VARCHAR(71) NOT NULL,
  generation BIGINT NOT NULL DEFAULT 0,
  last_writer_run_id VARCHAR(96) NULL,
  schema_hash VARCHAR(71) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_generation_scope (environment_id, database_role, physical_table, scope_key_hash),
  CONSTRAINT chk_crawler_automation_generation_nonnegative CHECK (generation >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- These facts are append-only. Runtime/manual writer grants must also deny UPDATE/DELETE;
-- the triggers provide a second boundary for privileged application connections.
CREATE TRIGGER trg_crawler_automation_policy_version_no_update
BEFORE UPDATE ON crawler_automation_policy_version FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation policy versions are immutable';
CREATE TRIGGER trg_crawler_automation_policy_version_no_delete
BEFORE DELETE ON crawler_automation_policy_version FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation policy versions are immutable';
CREATE TRIGGER trg_crawler_automation_run_policy_no_update
BEFORE UPDATE ON crawler_automation_run_policy FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation run policies are immutable';
CREATE TRIGGER trg_crawler_automation_run_policy_no_delete
BEFORE DELETE ON crawler_automation_run_policy FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation run policies are immutable';
CREATE TRIGGER trg_crawler_automation_attempt_no_update
BEFORE UPDATE ON crawler_automation_run_attempt FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation attempts are immutable';
CREATE TRIGGER trg_crawler_automation_attempt_no_delete
BEFORE DELETE ON crawler_automation_run_attempt FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation attempts are immutable';
CREATE TRIGGER trg_crawler_automation_attempt_reservation_no_update
BEFORE UPDATE ON crawler_automation_attempt_reservation FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation attempt reservations are immutable';
CREATE TRIGGER trg_crawler_automation_attempt_reservation_no_delete
BEFORE DELETE ON crawler_automation_attempt_reservation FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation attempt reservations are immutable';
CREATE TRIGGER trg_crawler_automation_evidence_no_update
BEFORE UPDATE ON crawler_automation_evidence FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation evidence is immutable';
CREATE TRIGGER trg_crawler_automation_evidence_no_delete
BEFORE DELETE ON crawler_automation_evidence FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation evidence is immutable';
CREATE TRIGGER trg_crawler_automation_evidence_set_no_update
BEFORE UPDATE ON crawler_automation_evidence_set FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation evidence sets are immutable';
CREATE TRIGGER trg_crawler_automation_evidence_set_no_delete
BEFORE DELETE ON crawler_automation_evidence_set FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation evidence sets are immutable';
CREATE TRIGGER trg_crawler_automation_bundle_no_update
BEFORE UPDATE ON crawler_automation_apply_bundle FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation bundles are immutable';
CREATE TRIGGER trg_crawler_automation_bundle_no_delete
BEFORE DELETE ON crawler_automation_apply_bundle FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation bundles are immutable';
CREATE TRIGGER trg_crawler_automation_decision_no_update
BEFORE UPDATE ON crawler_automation_decision FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation decisions are immutable';
CREATE TRIGGER trg_crawler_automation_decision_no_delete
BEFORE DELETE ON crawler_automation_decision FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation decisions are immutable';
CREATE TRIGGER trg_crawler_automation_snapshot_no_update
BEFORE UPDATE ON crawler_automation_snapshot FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation snapshots are immutable';
CREATE TRIGGER trg_crawler_automation_snapshot_no_delete
BEFORE DELETE ON crawler_automation_snapshot FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation snapshots are immutable';

ALTER TABLE crawler_automation_apply_bundle
  ADD UNIQUE KEY uk_crawler_automation_bundle_run_hash (run_id, bundle_hash);
ALTER TABLE crawler_automation_approval
  ADD UNIQUE KEY uk_crawler_automation_approval_run_decision (run_id, decision_hash, action);

ALTER TABLE crawler_automation_run_policy
  ADD CONSTRAINT fk_crawler_automation_run_policy_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id),
  ADD CONSTRAINT fk_crawler_automation_run_policy_version
    FOREIGN KEY (domain_id, policy_version) REFERENCES crawler_automation_policy_version (domain_id, policy_version);
ALTER TABLE crawler_automation_attempt_reservation
  ADD CONSTRAINT fk_crawler_automation_reservation_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id);
ALTER TABLE crawler_automation_run_attempt
  ADD CONSTRAINT fk_crawler_automation_attempt_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id),
  ADD CONSTRAINT fk_crawler_automation_attempt_reservation
    FOREIGN KEY (reservation_id) REFERENCES crawler_automation_attempt_reservation (id);
ALTER TABLE crawler_automation_evidence
  ADD CONSTRAINT fk_crawler_automation_evidence_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id);
ALTER TABLE crawler_automation_evidence_set
  ADD CONSTRAINT fk_crawler_automation_evidence_set_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id);
ALTER TABLE crawler_automation_apply_bundle
  ADD CONSTRAINT fk_crawler_automation_bundle_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id),
  ADD CONSTRAINT fk_crawler_automation_bundle_evidence
    FOREIGN KEY (run_id, evidence_hash) REFERENCES crawler_automation_evidence_set (run_id, evidence_hash);
ALTER TABLE crawler_automation_decision
  ADD CONSTRAINT fk_crawler_automation_decision_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id),
  ADD CONSTRAINT fk_crawler_automation_decision_bundle
    FOREIGN KEY (run_id, bundle_hash) REFERENCES crawler_automation_apply_bundle (run_id, bundle_hash),
  ADD CONSTRAINT fk_crawler_automation_decision_evidence
    FOREIGN KEY (run_id, evidence_hash) REFERENCES crawler_automation_evidence_set (run_id, evidence_hash);
ALTER TABLE crawler_automation_approval
  ADD CONSTRAINT fk_crawler_automation_approval_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id),
  ADD CONSTRAINT fk_crawler_automation_approval_decision
    FOREIGN KEY (run_id, decision_hash) REFERENCES crawler_automation_decision (run_id, decision_hash),
  ADD CONSTRAINT fk_crawler_automation_approval_bundle
    FOREIGN KEY (run_id, bundle_hash) REFERENCES crawler_automation_apply_bundle (run_id, bundle_hash),
  ADD CONSTRAINT fk_crawler_automation_approval_evidence
    FOREIGN KEY (run_id, evidence_hash) REFERENCES crawler_automation_evidence_set (run_id, evidence_hash);
ALTER TABLE crawler_automation_snapshot
  ADD CONSTRAINT fk_crawler_automation_snapshot_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id);
ALTER TABLE crawler_automation_apply
  ADD CONSTRAINT fk_crawler_automation_apply_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id),
  ADD CONSTRAINT fk_crawler_automation_apply_decision
    FOREIGN KEY (run_id, decision_hash) REFERENCES crawler_automation_decision (run_id, decision_hash),
  ADD CONSTRAINT fk_crawler_automation_apply_bundle
    FOREIGN KEY (run_id, bundle_hash) REFERENCES crawler_automation_apply_bundle (run_id, bundle_hash),
  ADD CONSTRAINT fk_crawler_automation_apply_approval
    FOREIGN KEY (approval_id) REFERENCES crawler_automation_approval (id);
ALTER TABLE crawler_automation_alert
  ADD CONSTRAINT fk_crawler_automation_alert_run
    FOREIGN KEY (run_id) REFERENCES crawler_automation_run (run_id);

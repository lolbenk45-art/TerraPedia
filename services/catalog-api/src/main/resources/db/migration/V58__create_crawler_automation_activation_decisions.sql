CREATE TABLE crawler_automation_activation_decision (
  id BIGINT NOT NULL AUTO_INCREMENT,
  decision_kind VARCHAR(32) NOT NULL,
  domain_id VARCHAR(64) NOT NULL,
  policy_version BIGINT NOT NULL,
  policy_hash VARCHAR(71) NOT NULL,
  policy_set_hash VARCHAR(71) NOT NULL,
  minimum_successful_l1_runs INT NOT NULL,
  actor VARCHAR(120) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  authorization_reference VARCHAR(500) NOT NULL,
  decision_identity VARCHAR(160) NOT NULL,
  packet_hash VARCHAR(71) NOT NULL,
  authorized_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crawler_automation_activation_decision_identity (decision_identity),
  UNIQUE KEY uk_crawler_automation_activation_packet_hash (packet_hash),
  KEY idx_crawler_automation_activation_lookup (domain_id, decision_kind, authorized_at),
  CONSTRAINT fk_crawler_automation_activation_policy_version
    FOREIGN KEY (domain_id, policy_version)
    REFERENCES crawler_automation_policy_version (domain_id, policy_version),
  CONSTRAINT chk_crawler_automation_activation_kind
    CHECK (decision_kind IN ('L2_PROMOTION', 'SCHEDULER_ACTIVATION')),
  CONSTRAINT chk_crawler_automation_activation_minimum_l1
    CHECK (minimum_successful_l1_runs >= 2),
  CONSTRAINT chk_crawler_automation_activation_expiry
    CHECK (expires_at > authorized_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TRIGGER trg_crawler_automation_activation_decision_no_update
BEFORE UPDATE ON crawler_automation_activation_decision FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation activation decisions are immutable';
CREATE TRIGGER trg_crawler_automation_activation_decision_no_delete
BEFORE DELETE ON crawler_automation_activation_decision FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'crawler automation activation decisions are immutable';

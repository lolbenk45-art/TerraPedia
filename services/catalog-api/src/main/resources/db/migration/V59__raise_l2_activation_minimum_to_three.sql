ALTER TABLE crawler_automation_activation_decision
  ADD COLUMN legacy_minimum_l1_allowed TINYINT(1) NULL
    COMMENT 'NULL marks immutable V58 history; new rows are forced to 0',
  DROP CHECK chk_crawler_automation_activation_minimum_l1,
  ADD CONSTRAINT chk_crawler_automation_activation_minimum_l1
    CHECK (minimum_successful_l1_runs >= 3 OR legacy_minimum_l1_allowed IS NULL);

CREATE TRIGGER trg_crawler_automation_activation_decision_minimum_l1
BEFORE INSERT ON crawler_automation_activation_decision FOR EACH ROW
BEGIN
  SET NEW.legacy_minimum_l1_allowed = 0;
  IF NEW.minimum_successful_l1_runs < 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'minimum successful L1 runs must be at least 3';
  END IF;
END;

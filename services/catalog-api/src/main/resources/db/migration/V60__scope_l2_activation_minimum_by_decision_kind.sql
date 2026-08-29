DROP TRIGGER trg_crawler_automation_activation_decision_minimum_l1;

ALTER TABLE crawler_automation_activation_decision
  DROP CHECK chk_crawler_automation_activation_minimum_l1,
  ADD CONSTRAINT chk_crawler_automation_activation_minimum_l1
    CHECK (
      (legacy_minimum_l1_allowed IS NULL AND minimum_successful_l1_runs >= 2)
      OR (
        legacy_minimum_l1_allowed = 0
        AND (
          (decision_kind = 'L2_PROMOTION' AND minimum_successful_l1_runs >= 3)
          OR (decision_kind = 'SCHEDULER_ACTIVATION' AND minimum_successful_l1_runs >= 2)
        )
      )
    ),
  ADD CONSTRAINT chk_crawler_automation_activation_legacy_marker
    CHECK (legacy_minimum_l1_allowed IS NULL OR legacy_minimum_l1_allowed = 0);

CREATE TRIGGER trg_crawler_automation_activation_decision_minimum_l1
BEFORE INSERT ON crawler_automation_activation_decision FOR EACH ROW
BEGIN
  SET NEW.legacy_minimum_l1_allowed = 0;
  IF (NEW.decision_kind = 'L2_PROMOTION' AND NEW.minimum_successful_l1_runs < 3)
     OR (NEW.decision_kind = 'SCHEDULER_ACTIVATION' AND NEW.minimum_successful_l1_runs < 2) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'minimum successful L1 runs do not satisfy the decision kind minimum';
  END IF;
END;

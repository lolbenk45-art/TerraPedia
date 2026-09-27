ALTER TABLE crawler_automation_activation_decision
  ADD COLUMN authorized_action_id VARCHAR(128) NULL AFTER packet_hash;

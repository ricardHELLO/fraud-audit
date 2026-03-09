-- Fix missing ON DELETE CASCADE on alert tables foreign keys.
-- Without CASCADE, deleting a user or report fails with FK violation.

-- alert_history.alert_rule_id → alert_rules(id)
ALTER TABLE alert_history
  DROP CONSTRAINT alert_history_alert_rule_id_fkey,
  ADD CONSTRAINT alert_history_alert_rule_id_fkey
    FOREIGN KEY (alert_rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE;

-- alert_history.report_id → reports(id)
ALTER TABLE alert_history
  DROP CONSTRAINT alert_history_report_id_fkey,
  ADD CONSTRAINT alert_history_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

-- alert_rules.user_id → users(id)
ALTER TABLE alert_rules
  DROP CONSTRAINT alert_rules_user_id_fkey,
  ADD CONSTRAINT alert_rules_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Alert rules: user-defined threshold alerts
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  name TEXT NOT NULL,
  metric TEXT NOT NULL,
  operator TEXT NOT NULL,
  threshold NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Alert history: log of triggered alerts
CREATE TABLE alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_rule_id UUID REFERENCES alert_rules(id) NOT NULL,
  report_id UUID REFERENCES reports(id) NOT NULL,
  metric_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alert_rules_user ON alert_rules(user_id);
CREATE INDEX idx_alert_rules_active ON alert_rules(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_alert_history_rule ON alert_history(alert_rule_id);

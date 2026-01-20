-- Migration: Add AI Nudging System tables
-- Purpose: Store nudge rules and history for automated lead follow-up reminders

-- ============================================
-- Table: nudge_rules
-- Stores configurable rules for when to send nudges
-- ============================================

CREATE TABLE IF NOT EXISTS nudge_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('follow_up_overdue', 'no_activity', 'high_score_idle', 'custom')),
  -- Example conditions: {"days_overdue": 2, "min_score": 0.7, "statuses": ["hot", "follow_up"]}
  conditions JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE nudge_rules ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read nudge rules
CREATE POLICY "Authenticated users can read nudge rules"
  ON nudge_rules FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only admins can manage nudge rules
CREATE POLICY "Admins can manage nudge rules"
  ON nudge_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

COMMENT ON TABLE nudge_rules IS 'Configurable rules for AI-powered lead nudging';
COMMENT ON COLUMN nudge_rules.rule_type IS 'Type of nudge rule: follow_up_overdue, no_activity, high_score_idle, custom';
COMMENT ON COLUMN nudge_rules.conditions IS 'JSONB conditions for rule matching (days_overdue, min_score, statuses, etc.)';
COMMENT ON COLUMN nudge_rules.priority IS 'Higher priority rules are processed first';

-- ============================================
-- Table: nudge_history
-- Tracks all nudges sent for analytics and duplicate prevention
-- ============================================

CREATE TABLE IF NOT EXISTS nudge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES nudge_rules(id) ON DELETE SET NULL,
  nudge_type TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered BOOLEAN DEFAULT NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE nudge_history ENABLE ROW LEVEL SECURITY;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nudge_history_lead_id ON nudge_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_nudge_history_sent_at ON nudge_history(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nudge_history_rule_id ON nudge_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_nudge_history_recipient ON nudge_history(recipient_user_id);

-- Policy: Users can see nudges for leads they're assigned to or all if admin
CREATE POLICY "Users can read their nudge history"
  ON nudge_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = nudge_history.lead_id
      AND (
        leads.assigned_staff = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role = 'admin'
        )
      )
    )
  );

-- Policy: System can insert nudge history (via service role)
CREATE POLICY "Service role can insert nudge history"
  ON nudge_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE nudge_history IS 'History of all nudges sent to track delivery and prevent duplicates';
COMMENT ON COLUMN nudge_history.nudge_type IS 'Type of nudge: follow_up_overdue, no_activity, high_score_idle, manual';
COMMENT ON COLUMN nudge_history.channel IS 'Delivery channel: telegram, email, push';
COMMENT ON COLUMN nudge_history.delivered IS 'NULL = pending, true = delivered, false = failed';

-- ============================================
-- Seed default nudge rules
-- ============================================

INSERT INTO nudge_rules (name, description, rule_type, conditions, priority, is_active) VALUES
(
  'Follow-up Overdue',
  'Nudge for leads with overdue follow-up dates',
  'follow_up_overdue',
  '{"days_overdue": 1, "statuses": ["hot", "follow_up"]}',
  10,
  true
),
(
  'High Score Idle',
  'Nudge for high-scoring leads with no recent activity',
  'high_score_idle',
  '{"min_score": 0.7, "days_idle": 3, "statuses": ["hot", "follow_up", "new"]}',
  5,
  true
),
(
  'New Lead No Action',
  'Nudge for new leads with no follow-up scheduled',
  'no_activity',
  '{"days_since_created": 2, "statuses": ["new"]}',
  3,
  true
)
ON CONFLICT DO NOTHING;

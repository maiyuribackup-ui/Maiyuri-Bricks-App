-- AI Nudging System - Phase 4: Analytics
-- Adds tables for tracking nudge effectiveness and A/B testing

-- ============================================
-- Table: nudge_analytics
-- Tracks the outcome of each nudge sent
-- ============================================
CREATE TABLE IF NOT EXISTS nudge_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nudge_history_id UUID NOT NULL REFERENCES nudge_history(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  -- What was sent
  nudge_type TEXT NOT NULL,
  ai_enhanced BOOLEAN NOT NULL DEFAULT false,
  message_template_id TEXT, -- For A/B testing

  -- Timing
  sent_at TIMESTAMPTZ NOT NULL,
  viewed_at TIMESTAMPTZ, -- When user opened/viewed the nudge (if trackable)
  acted_at TIMESTAMPTZ, -- When user took action on the lead

  -- Outcome tracking
  action_taken TEXT, -- What action was taken: 'called', 'messaged', 'visited', 'none', etc.
  time_to_action_minutes INTEGER, -- Minutes between nudge and action
  lead_status_before TEXT,
  lead_status_after TEXT,
  lead_score_before DECIMAL(3,2),
  lead_score_after DECIMAL(3,2),

  -- Attribution
  contributed_to_conversion BOOLEAN DEFAULT false,

  -- Metadata for analysis
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_nudge_analytics_lead ON nudge_analytics(lead_id);
CREATE INDEX IF NOT EXISTS idx_nudge_analytics_type ON nudge_analytics(nudge_type);
CREATE INDEX IF NOT EXISTS idx_nudge_analytics_sent ON nudge_analytics(sent_at);
CREATE INDEX IF NOT EXISTS idx_nudge_analytics_ai ON nudge_analytics(ai_enhanced);
CREATE INDEX IF NOT EXISTS idx_nudge_analytics_template ON nudge_analytics(message_template_id);

-- ============================================
-- Table: nudge_templates (for A/B testing)
-- Stores different message templates to test
-- ============================================
CREATE TABLE IF NOT EXISTS nudge_templates (
  id TEXT PRIMARY KEY, -- e.g., 'morning_digest_v1', 'hot_lead_urgent_v2'
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL, -- 'morning_digest', 'hot_lead', 'overdue', etc.
  content TEXT NOT NULL, -- The message template with placeholders
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_control BOOLEAN NOT NULL DEFAULT false, -- Is this the control version for A/B test

  -- Performance metrics (updated periodically)
  send_count INTEGER NOT NULL DEFAULT 0,
  action_count INTEGER NOT NULL DEFAULT 0,
  action_rate DECIMAL(5,4), -- Calculated: action_count / send_count
  avg_time_to_action_minutes DECIMAL(10,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Table: nudge_daily_stats
-- Aggregated daily statistics for dashboards
-- ============================================
CREATE TABLE IF NOT EXISTS nudge_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date DATE NOT NULL,

  -- Counts
  nudges_sent INTEGER NOT NULL DEFAULT 0,
  nudges_ai_enhanced INTEGER NOT NULL DEFAULT 0,
  actions_taken INTEGER NOT NULL DEFAULT 0,
  conversions_attributed INTEGER NOT NULL DEFAULT 0,

  -- Rates
  action_rate DECIMAL(5,4), -- actions_taken / nudges_sent
  ai_action_rate DECIMAL(5,4), -- AI-enhanced nudge action rate
  non_ai_action_rate DECIMAL(5,4), -- Non-AI nudge action rate

  -- Timing
  avg_time_to_action_minutes DECIMAL(10,2),

  -- Breakdown by type
  stats_by_type JSONB DEFAULT '{}', -- { "morning_digest": { sent: 10, acted: 3 }, ... }
  stats_by_staff JSONB DEFAULT '{}', -- { "user_id": { sent: 5, acted: 2 }, ... }

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_stat_date UNIQUE (stat_date)
);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_nudge_daily_stats_date ON nudge_daily_stats(stat_date);

-- ============================================
-- RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE nudge_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudge_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudge_daily_stats ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read analytics
CREATE POLICY "Authenticated users can read nudge_analytics"
  ON nudge_analytics FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update analytics (from API)
CREATE POLICY "Service role can manage nudge_analytics"
  ON nudge_analytics FOR ALL
  TO service_role
  USING (true);

-- Authenticated users can read templates
CREATE POLICY "Authenticated users can read nudge_templates"
  ON nudge_templates FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can manage templates
CREATE POLICY "Service role can manage nudge_templates"
  ON nudge_templates FOR ALL
  TO service_role
  USING (true);

-- Authenticated users can read daily stats
CREATE POLICY "Authenticated users can read nudge_daily_stats"
  ON nudge_daily_stats FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can manage daily stats
CREATE POLICY "Service role can manage nudge_daily_stats"
  ON nudge_daily_stats FOR ALL
  TO service_role
  USING (true);

-- ============================================
-- Seed default templates for A/B testing
-- ============================================
INSERT INTO nudge_templates (id, name, template_type, content, is_active, is_control) VALUES
  ('morning_digest_v1', 'Morning Digest - Standard', 'morning_digest',
   'Morning Lead Digest\n\nYou have {{count}} leads requiring attention.',
   true, true),
  ('morning_digest_v2', 'Morning Digest - AI Enhanced', 'morning_digest',
   '🤖 AI-Enhanced Morning Digest\n\nYou have {{count}} leads requiring attention with smart insights.',
   true, false),
  ('hot_lead_v1', 'Hot Lead Alert - Standard', 'hot_lead_alert',
   '🔥 Hot Lead Alert\n\n{{lead_name}} just crossed the hot threshold!',
   true, true),
  ('hot_lead_v2', 'Hot Lead Alert - Urgent', 'hot_lead_alert',
   '🚨 URGENT: Hot Lead!\n\n{{lead_name}} ({{score}}%) needs immediate attention!',
   true, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Function: Update nudge template stats
-- Called periodically to update performance metrics
-- ============================================
CREATE OR REPLACE FUNCTION update_nudge_template_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE nudge_templates t
  SET
    send_count = COALESCE(stats.send_count, 0),
    action_count = COALESCE(stats.action_count, 0),
    action_rate = CASE
      WHEN COALESCE(stats.send_count, 0) > 0
      THEN COALESCE(stats.action_count, 0)::DECIMAL / stats.send_count
      ELSE NULL
    END,
    avg_time_to_action_minutes = stats.avg_time,
    updated_at = NOW()
  FROM (
    SELECT
      message_template_id,
      COUNT(*) as send_count,
      COUNT(acted_at) as action_count,
      AVG(time_to_action_minutes) as avg_time
    FROM nudge_analytics
    WHERE message_template_id IS NOT NULL
    GROUP BY message_template_id
  ) stats
  WHERE t.id = stats.message_template_id;
END;
$$;

-- ============================================
-- Function: Generate daily stats
-- Called by cron to aggregate daily statistics
-- ============================================
CREATE OR REPLACE FUNCTION generate_nudge_daily_stats(target_date DATE)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  stats_record RECORD;
BEGIN
  SELECT
    COUNT(*) as nudges_sent,
    COUNT(*) FILTER (WHERE ai_enhanced) as nudges_ai_enhanced,
    COUNT(acted_at) as actions_taken,
    COUNT(*) FILTER (WHERE contributed_to_conversion) as conversions_attributed,
    CASE WHEN COUNT(*) > 0 THEN COUNT(acted_at)::DECIMAL / COUNT(*) ELSE NULL END as action_rate,
    CASE WHEN COUNT(*) FILTER (WHERE ai_enhanced) > 0
      THEN COUNT(acted_at) FILTER (WHERE ai_enhanced)::DECIMAL / COUNT(*) FILTER (WHERE ai_enhanced)
      ELSE NULL END as ai_action_rate,
    CASE WHEN COUNT(*) FILTER (WHERE NOT ai_enhanced) > 0
      THEN COUNT(acted_at) FILTER (WHERE NOT ai_enhanced)::DECIMAL / COUNT(*) FILTER (WHERE NOT ai_enhanced)
      ELSE NULL END as non_ai_action_rate,
    AVG(time_to_action_minutes) as avg_time
  INTO stats_record
  FROM nudge_analytics
  WHERE sent_at::DATE = target_date;

  INSERT INTO nudge_daily_stats (
    stat_date,
    nudges_sent,
    nudges_ai_enhanced,
    actions_taken,
    conversions_attributed,
    action_rate,
    ai_action_rate,
    non_ai_action_rate,
    avg_time_to_action_minutes
  ) VALUES (
    target_date,
    stats_record.nudges_sent,
    stats_record.nudges_ai_enhanced,
    stats_record.actions_taken,
    stats_record.conversions_attributed,
    stats_record.action_rate,
    stats_record.ai_action_rate,
    stats_record.non_ai_action_rate,
    stats_record.avg_time
  )
  ON CONFLICT (stat_date) DO UPDATE SET
    nudges_sent = EXCLUDED.nudges_sent,
    nudges_ai_enhanced = EXCLUDED.nudges_ai_enhanced,
    actions_taken = EXCLUDED.actions_taken,
    conversions_attributed = EXCLUDED.conversions_attributed,
    action_rate = EXCLUDED.action_rate,
    ai_action_rate = EXCLUDED.ai_action_rate,
    non_ai_action_rate = EXCLUDED.non_ai_action_rate,
    avg_time_to_action_minutes = EXCLUDED.avg_time_to_action_minutes,
    updated_at = NOW();
END;
$$;

-- Comment for documentation
COMMENT ON TABLE nudge_analytics IS 'Tracks the outcome of each nudge sent for effectiveness analysis';
COMMENT ON TABLE nudge_templates IS 'Stores message templates for A/B testing different nudge formats';
COMMENT ON TABLE nudge_daily_stats IS 'Aggregated daily statistics for nudge performance dashboards';

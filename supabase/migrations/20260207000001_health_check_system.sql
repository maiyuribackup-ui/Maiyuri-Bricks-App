-- Health Check System
-- Stores health check results, alert state, AI analysis, and cron execution logs

-- health_check_results: Historical check data
CREATE TABLE IF NOT EXISTS public.health_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('morning', 'evening', 'manual')),
  agent_group TEXT NOT NULL,
  check_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
  response_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_hcr_run_id ON public.health_check_results(run_id);
CREATE INDEX idx_hcr_checked_at ON public.health_check_results(checked_at DESC);
CREATE INDEX idx_hcr_status ON public.health_check_results(status);
CREATE INDEX idx_hcr_service_time ON public.health_check_results(service_name, checked_at DESC);

-- health_alert_state: Deduplication for alerts
CREATE TABLE IF NOT EXISTS public.health_alert_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name TEXT UNIQUE NOT NULL,
  last_status TEXT NOT NULL,
  last_alert_at TIMESTAMPTZ NOT NULL,
  consecutive_failures INTEGER DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_has_check ON public.health_alert_state(check_name);

-- health_ai_analysis: AI diagnosis history
CREATE TABLE IF NOT EXISTS public.health_ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  overall_status TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  correlations TEXT,
  action_items JSONB,
  business_impact TEXT,
  raw_prompt TEXT,
  raw_response TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_hai_run ON public.health_ai_analysis(run_id);
CREATE INDEX idx_hai_analyzed ON public.health_ai_analysis(analyzed_at DESC);

-- cron_execution_log: Track cron job runs for freshness monitoring
CREATE TABLE IF NOT EXISTS public.cron_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'success', 'failed')),
  duration_ms INTEGER,
  error_message TEXT
);

CREATE INDEX idx_cel_name_time ON public.cron_execution_log(cron_name, started_at DESC);
CREATE INDEX idx_cel_status ON public.cron_execution_log(status);

-- RLS (service role bypasses, but enable for safety)
ALTER TABLE public.health_check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_alert_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_execution_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (health checks run server-side)
CREATE POLICY "Service role full access" ON public.health_check_results
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON public.health_alert_state
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON public.health_ai_analysis
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON public.cron_execution_log
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.health_check_results IS 'Historical health check results for monitoring and trending';
COMMENT ON TABLE public.health_alert_state IS 'Alert deduplication state per check';
COMMENT ON TABLE public.health_ai_analysis IS 'AI-generated diagnosis of health check runs';
COMMENT ON TABLE public.cron_execution_log IS 'Execution log for cron jobs (freshness monitoring)';

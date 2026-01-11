-- Floor Plan Sessions Migration
-- Persistent memory for the floor plan chatbot

-- ============================================
-- Floor Plan Sessions Table
-- ============================================
CREATE TABLE IF NOT EXISTS floor_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Session status
  status TEXT NOT NULL DEFAULT 'collecting' CHECK (status IN (
    'collecting', 'generating', 'awaiting_blueprint_confirmation',
    'generating_isometric', 'presenting', 'iterating', 'complete', 'failed'
  )),

  -- Project type
  project_type TEXT CHECK (project_type IN ('residential', 'compound', 'commercial')),

  -- Collected inputs (JSONB for flexibility)
  collected_inputs JSONB NOT NULL DEFAULT '{}',

  -- Generated images (stored as base64 or storage URLs)
  generated_images JSONB DEFAULT '{}',

  -- Blueprint awaiting confirmation
  blueprint_image JSONB DEFAULT NULL,

  -- Design context summary from AI
  design_context JSONB DEFAULT NULL,

  -- Current question being asked
  current_question_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- Floor Plan Messages Table
-- ============================================
CREATE TABLE IF NOT EXISTS floor_plan_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES floor_plan_sessions(id) ON DELETE CASCADE,

  -- Message details
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN (
    'text', 'image', 'options', 'progress', 'error', 'form'
  )),

  -- Optional metadata (options, progress data, form fields)
  metadata JSONB DEFAULT '{}',

  -- Ordering
  sequence_number INTEGER NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Floor Plan Generation Progress Table
-- ============================================
CREATE TABLE IF NOT EXISTS floor_plan_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES floor_plan_sessions(id) ON DELETE CASCADE,

  -- Progress tracking
  phase TEXT NOT NULL CHECK (phase IN ('blueprint', 'isometric')),
  current_stage TEXT NOT NULL,
  percent INTEGER NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),

  -- Stage details (array of stage objects)
  stages JSONB NOT NULL DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Floor Plan Modifications History
-- ============================================
CREATE TABLE IF NOT EXISTS floor_plan_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES floor_plan_sessions(id) ON DELETE CASCADE,

  -- Modification details
  modification_request TEXT NOT NULL,
  clarification TEXT,
  changes JSONB DEFAULT '[]',
  trade_offs JSONB DEFAULT '[]',

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),

  -- Before/after images
  before_image JSONB,
  after_image JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX idx_floor_plan_sessions_user ON floor_plan_sessions(user_id);
CREATE INDEX idx_floor_plan_sessions_status ON floor_plan_sessions(status);
CREATE INDEX idx_floor_plan_sessions_created ON floor_plan_sessions(created_at DESC);
CREATE INDEX idx_floor_plan_messages_session ON floor_plan_messages(session_id);
CREATE INDEX idx_floor_plan_messages_sequence ON floor_plan_messages(session_id, sequence_number);
CREATE INDEX idx_floor_plan_progress_session ON floor_plan_progress(session_id);
CREATE INDEX idx_floor_plan_modifications_session ON floor_plan_modifications(session_id);

-- ============================================
-- Updated At Trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_floor_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_floor_plan_sessions_updated
  BEFORE UPDATE ON floor_plan_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_floor_plan_updated_at();

CREATE TRIGGER trigger_floor_plan_progress_updated
  BEFORE UPDATE ON floor_plan_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_floor_plan_updated_at();

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE floor_plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_modifications ENABLE ROW LEVEL SECURITY;

-- Sessions: Users can only access their own sessions
CREATE POLICY "Users can view own sessions" ON floor_plan_sessions
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create sessions" ON floor_plan_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own sessions" ON floor_plan_sessions
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

-- Service role can access all sessions (for admin/backend)
CREATE POLICY "Service role full access to sessions" ON floor_plan_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Messages: Access through session ownership
CREATE POLICY "Users can view messages in own sessions" ON floor_plan_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM floor_plan_sessions
      WHERE id = floor_plan_messages.session_id
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Users can create messages in own sessions" ON floor_plan_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM floor_plan_sessions
      WHERE id = floor_plan_messages.session_id
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Service role full access to messages" ON floor_plan_messages
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Progress: Access through session ownership
CREATE POLICY "Users can view progress in own sessions" ON floor_plan_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM floor_plan_sessions
      WHERE id = floor_plan_progress.session_id
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Service role full access to progress" ON floor_plan_progress
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Modifications: Access through session ownership
CREATE POLICY "Users can view modifications in own sessions" ON floor_plan_modifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM floor_plan_sessions
      WHERE id = floor_plan_modifications.session_id
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Users can create modifications in own sessions" ON floor_plan_modifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM floor_plan_sessions
      WHERE id = floor_plan_modifications.session_id
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
  );

CREATE POLICY "Service role full access to modifications" ON floor_plan_modifications
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE floor_plan_sessions IS 'Floor plan design sessions with collected inputs and generated designs';
COMMENT ON TABLE floor_plan_messages IS 'Chat messages within each floor plan session';
COMMENT ON TABLE floor_plan_progress IS 'Generation progress tracking for floor plan creation';
COMMENT ON TABLE floor_plan_modifications IS 'History of modification requests and their outcomes';

-- Add client information to floor plan sessions
-- This enables client-based file naming and better tracking

ALTER TABLE floor_plan_sessions
ADD COLUMN IF NOT EXISTS client_name TEXT,
ADD COLUMN IF NOT EXISTS client_contact TEXT,
ADD COLUMN IF NOT EXISTS client_location TEXT;

-- Create index for client name searches
CREATE INDEX IF NOT EXISTS idx_floor_plan_sessions_client_name
  ON floor_plan_sessions(client_name);

-- Add comments
COMMENT ON COLUMN floor_plan_sessions.client_name IS 'Client or project name for file organization';
COMMENT ON COLUMN floor_plan_sessions.client_contact IS 'Client contact information (phone/email)';
COMMENT ON COLUMN floor_plan_sessions.client_location IS 'Client location or project site';

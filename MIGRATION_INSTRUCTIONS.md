# Apply Client Info Migration

The migration needs to be applied to add `client_name`, `client_contact`, and `client_location` columns to the `floor_plan_sessions` table.

## Quick Method: Supabase SQL Editor

1. Open this URL in your browser:

   ```
   https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/sql/new
   ```

2. Paste this SQL and click "Run":

```sql
-- Add client information to floor plan sessions
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
```

3. Verify it worked by running:

   ```bash
   cd apps/web
   bun --env-file=.env.local scripts/check-schema.ts
   ```

   You should see:

   ```
   ✅ Columns already exist!
      - client_name: ✓
      - client_contact: ✓
      - client_location: ✓
   ```

## Alternative: Command Line (if you have the database password)

```bash
psql "postgresql://postgres.pailepomvvwjkrhkwdqt:[YOUR_PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/20260111000002_add_client_info.sql
```

Replace `[YOUR_PASSWORD]` with your Supabase database password from:
https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/settings/database

## What This Migration Does

- Adds `client_name` column: Stores client or project name for file organization
- Adds `client_contact` column: Optional contact information (phone/email)
- Adds `client_location` column: Optional project site location
- Creates an index on `client_name` for fast searches
- Adds helpful comments to document the columns

## After Migration

Once applied, the system will:

1. Ask for client name as the first question in the chatbot
2. Save client info to the database
3. Use client name in file naming: `kumar-residence_20260111_143022_floor-plan.dxf`
4. Make files easier to find and organize

-- One-time script to archive all lost leads
-- Run this in Supabase SQL Editor

-- Step 1: Preview what will be archived
SELECT id, name, status, is_archived, updated_at
FROM leads
WHERE status = 'lost' AND is_archived = false;

-- Step 2: Archive all lost leads
UPDATE leads
SET is_archived = true, updated_at = now()
WHERE status = 'lost' AND is_archived = false;

-- Step 3: Verify the update
SELECT COUNT(*) as archived_count
FROM leads
WHERE status = 'lost' AND is_archived = true;

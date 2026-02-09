-- Migration: Split factory_visit into factory_visit_pending and factory_visit_completed
-- Replaces the single 'factory_visit' stage with two separate stages

-- Add new enum values
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'factory_visit_pending';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'factory_visit_completed';

-- Migrate existing data: factory_visit -> factory_visit_pending
-- (existing factory visits default to "pending" since we don't know if completed)
UPDATE leads SET stage = 'factory_visit_pending' WHERE stage = 'factory_visit';

-- Note: PostgreSQL does not support removing enum values directly.
-- The old 'factory_visit' value remains in the enum but will no longer be used by the application.
-- Any future reads of 'factory_visit' from the DB should be treated as 'factory_visit_pending'.

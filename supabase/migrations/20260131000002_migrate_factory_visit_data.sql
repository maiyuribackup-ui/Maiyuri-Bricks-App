-- Migration: Migrate existing factory_visit records to factory_visit_pending
-- This runs AFTER the enum values are committed in the previous migration

-- Update existing factory_visit records to the new pending stage
UPDATE leads SET stage = 'factory_visit_pending' WHERE stage = 'factory_visit';

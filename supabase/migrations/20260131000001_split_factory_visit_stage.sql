-- Migration: Split factory_visit into factory_visit_pending and factory_visit_completed
-- This migration updates the lead_stage enum to have two separate factory visit stages

-- Add new enum values for factory visit stages
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'factory_visit_pending' AFTER 'quote_sent';
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'factory_visit_completed' AFTER 'factory_visit_pending';

-- Migrate existing factory_visit records to factory_visit_pending
-- Note: This must be done in a separate transaction after the enum values are committed
-- Run this manually or in a subsequent migration:
-- UPDATE leads SET stage = 'factory_visit_pending' WHERE stage = 'factory_visit';

-- Comment on updated schema
COMMENT ON TYPE lead_stage IS 'Lead sales pipeline stages: inquiry -> quote_sent -> factory_visit_pending -> factory_visit_completed -> negotiation -> order_confirmed -> in_production -> ready_dispatch -> delivered';

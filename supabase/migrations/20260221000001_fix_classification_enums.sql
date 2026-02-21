-- Migration: Fix lead_classification and requirement_type enum values
-- Root cause: These enum types were pre-created with automotive dealership values
-- (walk_in, referral, sedan, suv, pickup, commercial) before the brick-business
-- migration ran. The IF NOT EXISTS check silently skipped creating the correct enums.
-- This caused Zod validation failures when editing leads because the app's schema
-- expected brick-business values but the DB had automotive values.

-- Step 1: Add the correct brick-business values to lead_classification enum
ALTER TYPE lead_classification ADD VALUE IF NOT EXISTS 'direct_customer';
ALTER TYPE lead_classification ADD VALUE IF NOT EXISTS 'vendor';
ALTER TYPE lead_classification ADD VALUE IF NOT EXISTS 'builder';
ALTER TYPE lead_classification ADD VALUE IF NOT EXISTS 'dealer';
ALTER TYPE lead_classification ADD VALUE IF NOT EXISTS 'architect';

-- Step 2: Add the correct brick-business values to requirement_type enum
ALTER TYPE requirement_type ADD VALUE IF NOT EXISTS 'residential_house';
ALTER TYPE requirement_type ADD VALUE IF NOT EXISTS 'commercial_building';
ALTER TYPE requirement_type ADD VALUE IF NOT EXISTS 'eco_friendly_building';
ALTER TYPE requirement_type ADD VALUE IF NOT EXISTS 'compound_wall';

-- Step 3: Add missing lead_stage value
ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'quotation_pending';

-- Step 4: Migrate existing automotive data to brick-business equivalents
-- walk_in -> direct_customer (closest equivalent: walk-in customers are direct)
-- referral -> direct_customer (referrals are typically direct customers)
UPDATE leads SET classification = 'direct_customer' WHERE classification = 'walk_in';
UPDATE leads SET classification = 'direct_customer' WHERE classification = 'referral';

-- sedan/suv/pickup -> residential_house (these were residential customer leads)
-- commercial -> commercial_building
UPDATE leads SET requirement_type = 'residential_house' WHERE requirement_type IN ('sedan', 'suv', 'pickup');
UPDATE leads SET requirement_type = 'commercial_building' WHERE requirement_type = 'commercial';

-- Note: The old enum values (walk_in, referral, sedan, suv, pickup, commercial)
-- remain in the PostgreSQL enum type (PG cannot remove enum values) but will no
-- longer be used by any records. The application Zod schema will not accept them.

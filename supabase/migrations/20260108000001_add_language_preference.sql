-- Migration: Add language_preference to users table
-- Supports English (en) and Tamil (ta) for AI-generated insights

ALTER TABLE public.users
ADD COLUMN language_preference TEXT NOT NULL DEFAULT 'en'
CHECK (language_preference IN ('en', 'ta'));

-- Add documentation comment
COMMENT ON COLUMN public.users.language_preference IS 'User preferred language for AI insights: en (English) or ta (Tamil/தமிழ்)';

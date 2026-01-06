-- Add staff_notes column to leads table for legacy import and quick notes
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS staff_notes TEXT;

-- Add comment
COMMENT ON COLUMN public.leads.staff_notes IS 'Staff notes and comments about the lead';

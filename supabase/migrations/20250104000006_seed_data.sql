-- Seed data for development (run manually after creating auth users)
-- This file is a reference - actual seeding happens after auth users are created

/*
-- Example: Insert users after they sign up via Supabase Auth
-- The trigger will auto-create the profile, but you can update roles:

UPDATE public.users
SET role = 'founder', name = 'Ram Kumaran'
WHERE email = 'ram@maiyuribricks.com';

UPDATE public.users
SET role = 'accountant', name = 'Kavitha'
WHERE email = 'kavitha@maiyuribricks.com';

UPDATE public.users
SET role = 'engineer', name = 'Srinivasan'
WHERE email = 'srinivasan@maiyuribricks.com';

-- Example leads for testing
INSERT INTO public.leads (name, contact, source, lead_type, status, next_action)
VALUES
  ('Test Customer 1', '9876543210', 'Website', 'Commercial', 'new', 'Initial call'),
  ('Test Customer 2', '9876543211', 'Referral', 'Residential', 'follow_up', 'Send quote'),
  ('Test Customer 3', '9876543212', 'Walk-in', 'Commercial', 'hot', 'Site visit scheduled');
*/

-- Create a view for dashboard stats
CREATE OR REPLACE VIEW public.lead_stats AS
SELECT
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE follow_up_date = CURRENT_DATE) as due_today,
  COUNT(*) FILTER (WHERE follow_up_date < CURRENT_DATE) as overdue
FROM public.leads
GROUP BY status;

-- Grant access to the view
GRANT SELECT ON public.lead_stats TO authenticated;

-- Comment
COMMENT ON VIEW public.lead_stats IS 'Aggregated lead statistics for dashboard';

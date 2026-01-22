-- Add 'driver' and 'sales' roles to user role constraint
-- Enables delivery driver and sales staff assignments

-- Drop existing constraint
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_role_check;

-- Add updated constraint with new roles
ALTER TABLE public.users
ADD CONSTRAINT users_role_check
CHECK (role IN ('founder', 'accountant', 'engineer', 'production_supervisor', 'owner', 'driver', 'sales'));

-- Comment for documentation
COMMENT ON CONSTRAINT users_role_check ON public.users IS


'User roles: founder (admin), accountant, engineer, production_supervisor, owner, driver (delivery), sales';

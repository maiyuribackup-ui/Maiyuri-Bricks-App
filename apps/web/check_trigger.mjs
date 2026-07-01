import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running this script.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Query for database triggers
const { data, error } = await supabase.rpc('get_triggers');
console.log('Triggers:', data);
console.log('Error:', error?.message);

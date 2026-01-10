import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://pailepomvvwjkrhkwdqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWxlcG9tdnZ3amtyaGt3ZHF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUzOTM3OSwiZXhwIjoyMDgzMTE1Mzc5fQ.gne7NmHyPE_mNE5Dps2CsJzxt5qzla19SQVB4FP9UfI'
);

// Query for database triggers
const { data, error } = await supabase.rpc('get_triggers');
console.log('Triggers:', data);
console.log('Error:', error?.message);

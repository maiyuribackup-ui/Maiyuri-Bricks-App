import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://pailepomvvwjkrhkwdqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWxlcG9tdnZ3amtyaGt3ZHF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUzOTM3OSwiZXhwIjoyMDgzMTE1Mzc5fQ.gne7NmHyPE_mNE5Dps2CsJzxt5qzla19SQVB4FP9UfI'
);

const { data, error } = await supabase
  .from('users')
  .select('id, email, name, role, is_active')
  .order('created_at');

console.log('Current users:');
data?.forEach(u => console.log(`  ${u.email} - role: ${u.role} - active: ${u.is_active}`));

// Check if ram@maiyuri.app is founder
const ram = data?.find(u => u.email === 'ram@maiyuri.app');
if (ram && ram.role !== 'founder') {
  console.log('\nFixing ram@maiyuri.app role to founder...');
  const { error: updateError } = await supabase
    .from('users')
    .update({ role: 'founder' })
    .eq('email', 'ram@maiyuri.app');
  
  if (updateError) {
    console.error('Error:', updateError.message);
  } else {
    console.log('✅ Role updated to founder');
  }
} else if (ram) {
  console.log('\nram@maiyuri.app is already a founder');
} else {
  console.log('\nram@maiyuri.app not found in users table');
}

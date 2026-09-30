import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running this script.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

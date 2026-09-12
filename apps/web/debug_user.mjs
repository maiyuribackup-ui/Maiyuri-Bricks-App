import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running this script.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Get users from public.users
const { data: publicUsers } = await supabase
  .from('users')
  .select('id, email, role');

console.log('Public users table:');
publicUsers?.forEach(u => console.log(`  ID: ${u.id} | Email: ${u.email} | Role: ${u.role}`));

// Get auth users
const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();

console.log('\nAuth users:');
authUsers?.forEach(u => console.log(`  ID: ${u.id} | Email: ${u.email}`));

// Check for ID mismatches
console.log('\nChecking for ID mismatches...');
for (const authUser of authUsers || []) {
  const publicUser = publicUsers?.find(p => p.email === authUser.email);
  if (publicUser && publicUser.id !== authUser.id) {
    console.log(`  MISMATCH: ${authUser.email}`);
    console.log(`    Auth ID: ${authUser.id}`);
    console.log(`    Public ID: ${publicUser.id}`);
    
    // Fix the mismatch
    console.log(`  Fixing...`);
    const { error } = await supabase
      .from('users')
      .update({ id: authUser.id })
      .eq('email', authUser.email);
    
    if (error) {
      console.log(`    Error: ${error.message}`);
    } else {
      console.log(`    ✅ Fixed!`);
    }
  }
}

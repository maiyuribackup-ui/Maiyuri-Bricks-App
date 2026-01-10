import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://pailepomvvwjkrhkwdqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWxlcG9tdnZ3amtyaGt3ZHF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUzOTM3OSwiZXhwIjoyMDgzMTE1Mzc5fQ.gne7NmHyPE_mNE5Dps2CsJzxt5qzla19SQVB4FP9UfI'
);

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

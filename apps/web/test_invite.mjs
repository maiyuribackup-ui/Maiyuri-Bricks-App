import { createClient } from '@supabase/supabase-js';

// Use service role for testing
const supabase = createClient(
  'https://pailepomvvwjkrhkwdqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWxlcG9tdnZ3amtyaGt3ZHF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUzOTM3OSwiZXhwIjoyMDgzMTE1Mzc5fQ.gne7NmHyPE_mNE5Dps2CsJzxt5qzla19SQVB4FP9UfI'
);

// Login as founder
console.log('Logging in as founder...');
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: 'ram@maiyuri.app',
  password: 'TempPass123!'
});

if (authError) {
  console.error('Login failed:', authError.message);
  process.exit(1);
}

console.log('Logged in successfully as:', authData.user.email);

// Now call the invite API
console.log('\nSending invitation to maiyuribricks@gmail.com...');

const response = await fetch('https://maiyuri-bricks-app.vercel.app/api/users/invite', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.session.access_token}`,
  },
  body: JSON.stringify({
    email: 'maiyuribricks@gmail.com',
    name: 'Maiyuri Bricks',
    role: 'engineer',
    phone: '+919876543210'
  })
});

const result = await response.json();
console.log('Response status:', response.status);
console.log('Response:', JSON.stringify(result, null, 2));

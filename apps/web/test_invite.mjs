import { createClient } from '@supabase/supabase-js';

// Require environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) {
  console.error('Error: E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables are required');
  process.exit(1);
}

// Use service role for testing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Login as founder
console.log('Logging in as founder...');
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: process.env.E2E_TEST_EMAIL,
  password: process.env.E2E_TEST_PASSWORD
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

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local manually
const envContent = readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
  console.log('Testing login for ram@maiyuri.app...');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'ram@maiyuri.app',
    password: 'TempPass123!',
  });

  if (error) {
    console.error('Login failed:', error.message);
    console.error('Error code:', error.status);
    return;
  }

  console.log('Login successful!');
  console.log('User:', data.user?.email);
  console.log('Session:', data.session ? 'Active' : 'None');
}

testLogin();

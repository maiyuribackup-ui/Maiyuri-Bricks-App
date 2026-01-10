#!/usr/bin/env node
/**
 * Run Production Auth migration on Supabase
 * Adds fields for staff invitation, notification preferences, and soft delete
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pailepomvvwjkrhkwdqt.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWxlcG9tdnZ3amtyaGt3ZHF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUzOTM3OSwiZXhwIjoyMDgzMTE1Mzc5fQ.gne7NmHyPE_mNE5Dps2CsJzxt5qzla19SQVB4FP9UfI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Check if columns already exist
async function checkExistingColumns() {
  console.log('Checking if production auth columns already exist...');

  const { data, error } = await supabase
    .from('users')
    .select('id, email, phone, invitation_token, invitation_status, is_active')
    .limit(1);

  if (error) {
    if (error.message.includes('phone') || error.message.includes('invitation')) {
      console.log('Production auth columns do not exist yet - migration needed');
      return false;
    }
    console.error('Error checking table:', error.message);
    return null;
  }

  console.log('Production auth columns already exist!');
  return true;
}

// Run migration via RPC (using raw SQL function)
async function runMigration() {
  console.log('\n' + '='.repeat(60));
  console.log('Production Auth Migration');
  console.log('='.repeat(60));

  const exists = await checkExistingColumns();

  if (exists === true) {
    console.log('\n✅ Migration already applied - auth columns exist');

    // Show current users
    const { data: users } = await supabase
      .from('users')
      .select('id, email, name, role, phone, invitation_status, is_active')
      .order('created_at', { ascending: true });

    console.log('\nCurrent users:');
    users?.forEach(u => {
      console.log(`  - ${u.name} (${u.email}) - ${u.role} - ${u.invitation_status || 'active'}`);
    });
    return;
  }

  console.log('\n❌ Production auth columns do not exist');
  console.log('\n' + '='.repeat(60));
  console.log('MANUAL MIGRATION REQUIRED');
  console.log('='.repeat(60));
  console.log('\n1. Go to: https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/sql');
  console.log('2. Click "New Query"');
  console.log('3. Copy and paste the contents of:');
  console.log('   supabase/migrations/20260110000006_production_auth.sql');
  console.log('4. Click "Run" to execute the migration');
  console.log('\nOr run the SQL below directly:');
  console.log('\n' + '-'.repeat(60));
  console.log(`
-- Production Auth Migration
-- Adds fields for staff invitation, notification preferences, and soft delete

-- Add phone column for WhatsApp notifications
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add invitation tracking columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invitation_token UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invitation_status TEXT DEFAULT 'active';

-- Add notification preferences (email enabled by default)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  DEFAULT '{"email": true, "whatsapp": false, "daily_summary": true}'::jsonb;

-- Add soft delete flag
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add updated_at column for tracking changes
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create index for invitation token lookup
CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON public.users(invitation_token)
  WHERE invitation_token IS NOT NULL;

-- Create index for active users
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active)
  WHERE is_active = true;
`);
  console.log('-'.repeat(60));
}

runMigration().catch(console.error);

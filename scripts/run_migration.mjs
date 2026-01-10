#!/usr/bin/env node
/**
 * Run Odoo integration migration on Supabase
 * Uses the Supabase SQL endpoint with service role key
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pailepomvvwjkrhkwdqt.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWxlcG9tdnZ3amtyaGt3ZHF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUzOTM3OSwiZXhwIjoyMDgzMTE1Mzc5fQ.gne7NmHyPE_mNE5Dps2CsJzxt5qzla19SQVB4FP9UfI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Migration statements - broken into individual commands
const migrations = [
  // Add columns one by one
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_lead_id INTEGER`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_partner_id INTEGER`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_quote_number TEXT`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_order_number TEXT`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_quote_amount NUMERIC(12, 2)`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_order_amount NUMERIC(12, 2)`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_quote_date TIMESTAMPTZ`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_order_date TIMESTAMPTZ`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ`,
  `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS odoo_sync_status TEXT DEFAULT 'pending'`,
];

async function checkLeadsTable() {
  console.log('Checking leads table structure...');

  const { data, error } = await supabase
    .from('leads')
    .select('id, name, odoo_lead_id, odoo_sync_status')
    .limit(1);

  if (error) {
    if (error.message.includes('odoo_lead_id')) {
      console.log('Odoo columns do not exist yet - migration needed');
      return false;
    }
    console.error('Error checking table:', error.message);
    return null;
  }

  console.log('Odoo columns already exist!');
  console.log('Sample data:', data);
  return true;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Odoo Integration Migration Check');
  console.log('='.repeat(60));

  const exists = await checkLeadsTable();

  if (exists === true) {
    console.log('\n✅ Migration already applied - Odoo columns exist');

    // Get count of leads
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    console.log(`Total leads in database: ${count}`);

    // Check odoo_sync_log table
    const { data: logs, error: logError } = await supabase
      .from('odoo_sync_log')
      .select('*')
      .limit(1);

    if (logError && logError.message.includes('does not exist')) {
      console.log('\n⚠️ odoo_sync_log table does not exist - needs to be created');
      console.log('\nPlease run this SQL in Supabase SQL Editor:');
      console.log(`
CREATE TABLE IF NOT EXISTS public.odoo_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  odoo_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_lead_id ON public.odoo_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_created_at ON public.odoo_sync_log(created_at DESC);
      `);
    } else if (!logError) {
      console.log('✅ odoo_sync_log table exists');
    }

    return;
  }

  if (exists === false) {
    console.log('\n❌ Odoo columns do not exist');
    console.log('\n' + '='.repeat(60));
    console.log('MANUAL MIGRATION REQUIRED');
    console.log('='.repeat(60));
    console.log('\n1. Go to: https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/sql');
    console.log('2. Click "New Query"');
    console.log('3. Paste the following SQL:');
    console.log('\n' + '-'.repeat(60));
    console.log(`
-- Add Odoo integration fields to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS odoo_lead_id INTEGER,
ADD COLUMN IF NOT EXISTS odoo_partner_id INTEGER,
ADD COLUMN IF NOT EXISTS odoo_quote_number TEXT,
ADD COLUMN IF NOT EXISTS odoo_order_number TEXT,
ADD COLUMN IF NOT EXISTS odoo_quote_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS odoo_order_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS odoo_quote_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS odoo_order_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS odoo_sync_status TEXT DEFAULT 'pending';

-- Create index for Odoo lookups
CREATE INDEX IF NOT EXISTS idx_leads_odoo_lead_id ON public.leads(odoo_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_odoo_sync_status ON public.leads(odoo_sync_status);

-- Create Odoo sync log table
CREATE TABLE IF NOT EXISTS public.odoo_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  odoo_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create index for sync log
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_lead_id ON public.odoo_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_created_at ON public.odoo_sync_log(created_at DESC);
    `);
    console.log('-'.repeat(60));
    console.log('\n4. Click "Run" to execute the migration');
  }
}

main().catch(console.error);

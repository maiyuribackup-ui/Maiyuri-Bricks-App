#!/usr/bin/env node
/**
 * Check Odoo migration status using REST API
 */

const SUPABASE_URL = 'https://pailepomvvwjkrhkwdqt.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWxlcG9tdnZ3amtyaGt3ZHF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUzOTM3OSwiZXhwIjoyMDgzMTE1Mzc5fQ.gne7NmHyPE_mNE5Dps2CsJzxt5qzla19SQVB4FP9UfI';

async function checkColumns() {
  console.log('Checking if Odoo columns exist in leads table...\n');

  // Try to select odoo columns - if they don't exist, we'll get an error
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?select=id,name,odoo_lead_id,odoo_sync_status&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    if (error.includes('odoo_lead_id')) {
      console.log('❌ Odoo columns do NOT exist - migration needed');
      return false;
    }
    console.error('API Error:', error);
    return null;
  }

  const data = await response.json();
  console.log('✅ Odoo columns EXIST in leads table!');
  console.log('Sample data:', JSON.stringify(data, null, 2));
  return true;
}

async function checkSyncLogTable() {
  console.log('\nChecking if odoo_sync_log table exists...\n');

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/odoo_sync_log?select=*&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    if (error.includes('does not exist') || error.includes('relation')) {
      console.log('❌ odoo_sync_log table does NOT exist - needs to be created');
      return false;
    }
    // Other permission errors might mean the table exists but RLS is blocking
    console.log('⚠️ Could not check sync_log table:', error);
    return null;
  }

  console.log('✅ odoo_sync_log table EXISTS!');
  return true;
}

async function getLeadCount() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?select=count`,
    {
      method: 'HEAD',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'count=exact',
      },
    }
  );

  const count = response.headers.get('content-range');
  if (count) {
    const total = count.split('/')[1];
    console.log(`\nTotal leads in database: ${total}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Odoo Integration Migration Status Check');
  console.log('='.repeat(60));
  console.log('');

  const columnsExist = await checkColumns();
  const tableExists = await checkSyncLogTable();

  await getLeadCount();

  console.log('\n' + '='.repeat(60));

  if (columnsExist && tableExists) {
    console.log('✅ ALL MIGRATIONS COMPLETE - Ready to sync!');
    console.log('='.repeat(60));
    console.log('\nYou can now test the sync by calling:');
    console.log('  POST /api/odoo/sync { "type": "full" }');
  } else {
    console.log('⚠️ MIGRATION REQUIRED');
    console.log('='.repeat(60));
    console.log('\n1. Open: https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/sql');
    console.log('2. Create a "New Query"');
    console.log('3. Paste and run the following SQL:\n');
    console.log('-'.repeat(60));
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

-- Create indexes for Odoo lookups
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

-- Create indexes for sync log
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_lead_id ON public.odoo_sync_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_created_at ON public.odoo_sync_log(created_at DESC);
    `);
    console.log('-'.repeat(60));
    console.log('\n4. Click "Run" to execute the migration');
    console.log('5. Re-run this script to verify');
  }
}

main().catch(console.error);

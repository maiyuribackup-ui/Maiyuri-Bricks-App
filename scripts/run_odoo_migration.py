#!/usr/bin/env python3
"""
Run Odoo integration migration on Supabase
This script adds the necessary columns for Odoo sync to the leads table.
"""

import os
import sys

# Try to use psycopg2 or supabase client
try:
    from supabase import create_client, Client
except ImportError:
    print("Installing supabase-py...")
    os.system("pip install supabase")
    from supabase import create_client, Client

# Supabase credentials
SUPABASE_URL = "https://pailepomvvwjkrhkwdqt.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWxlcG9tdnZ3amtyaGt3ZHF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUzOTM3OSwiZXhwIjoyMDgzMTE1Mzc5fQ.gne7NmHyPE_mNE5Dps2CsJzxt5qzla19SQVB4FP9UfI"

# Migration SQL
MIGRATION_SQL = """
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
"""

def main():
    print("=" * 60)
    print("Odoo Integration Migration")
    print("=" * 60)

    print("\nThis migration will add the following to your Supabase database:")
    print("- Odoo sync columns to the leads table")
    print("- odoo_sync_log table for tracking sync history")
    print("- Necessary indexes for performance")

    print("\n" + "=" * 60)
    print("INSTRUCTIONS:")
    print("=" * 60)
    print("""
1. Go to https://supabase.com/dashboard
2. Select your project (pailepomvvwjkrhkwdqt)
3. Click on "SQL Editor" in the left sidebar
4. Click "New Query"
5. Paste the following SQL and click "Run":
""")
    print("-" * 60)
    print(MIGRATION_SQL)
    print("-" * 60)

    print("\nAlternatively, run this migration file:")
    print(f"  supabase/migrations/20260110000005_odoo_integration.sql")

    print("\n" + "=" * 60)
    print("After running the migration, test with:")
    print("  curl -X POST http://localhost:3000/api/odoo/sync -d '{\"type\":\"full\"}'")
    print("=" * 60)

if __name__ == "__main__":
    main()

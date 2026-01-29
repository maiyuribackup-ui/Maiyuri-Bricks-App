/**
 * Fix PENDING Phone Records Script
 *
 * This script fixes call_recordings that were incorrectly processed
 * while their phone_number was still 'PENDING'.
 *
 * Usage:
 *   SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx bun run scripts/fix-pending-phone-records.ts
 *
 * Or with .env file:
 *   bun run scripts/fix-pending-phone-records.ts
 */

import { createClient } from '@supabase/supabase-js';

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing required environment variables');
  console.error('Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔍 Checking for PENDING phone records...\n');

  // Step 1: Find all records with PENDING phone
  const { data: pendingRecords, error: fetchError } = await supabase
    .from('call_recordings')
    .select('id, phone_number, processing_status, retry_count, error_message, created_at')
    .eq('phone_number', 'PENDING')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('Failed to fetch records:', fetchError.message);
    process.exit(1);
  }

  if (!pendingRecords || pendingRecords.length === 0) {
    console.log('✅ No records with phone_number="PENDING" found. Nothing to fix.');
    return;
  }

  console.log(`Found ${pendingRecords.length} records with phone_number="PENDING":\n`);

  // Display records grouped by status
  const byStatus: Record<string, typeof pendingRecords> = {};
  for (const record of pendingRecords) {
    const status = record.processing_status;
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push(record);
  }

  for (const [status, records] of Object.entries(byStatus)) {
    console.log(`📊 Status: ${status} (${records.length} records)`);
    for (const record of records.slice(0, 5)) {
      console.log(`   - ${record.id.substring(0, 8)}... | retries: ${record.retry_count} | created: ${record.created_at}`);
      if (record.error_message) {
        console.log(`     error: ${record.error_message.substring(0, 100)}...`);
      }
    }
    if (records.length > 5) {
      console.log(`   ... and ${records.length - 5} more`);
    }
    console.log('');
  }

  // Step 2: Find records that exhausted retries and need reset
  const recordsToReset = pendingRecords.filter(r =>
    r.retry_count >= 3 || r.processing_status === 'failed'
  );

  if (recordsToReset.length === 0) {
    console.log('✅ No records need retry reset. All PENDING records are waiting for user input.');
    return;
  }

  console.log(`\n🔧 Resetting ${recordsToReset.length} records that failed while PENDING...\n`);

  // Step 3: Reset the affected records
  const { data: updatedRecords, error: updateError } = await supabase
    .from('call_recordings')
    .update({
      retry_count: 0,
      processing_status: 'pending',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('phone_number', 'PENDING')
    .or('retry_count.gte.3,processing_status.eq.failed')
    .select('id');

  if (updateError) {
    console.error('Failed to reset records:', updateError.message);
    process.exit(1);
  }

  console.log(`✅ Successfully reset ${updatedRecords?.length ?? 0} records.`);
  console.log('');
  console.log('These records will now wait for the user to provide a phone number');
  console.log('before being picked up by the worker again.');
}

main().catch(console.error);

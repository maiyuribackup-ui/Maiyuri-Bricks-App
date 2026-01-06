import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error } from '@/lib/api-utils';
import * as XLSX from 'xlsx';
import type { LeadStatus } from '@maiyuri/shared';

// Valid lead statuses
const VALID_STATUSES: LeadStatus[] = ['new', 'follow_up', 'hot', 'cold', 'converted', 'lost'];

// Smart status mapping for Maiyuri Bricks legacy values
const STATUS_MAP: Record<string, LeadStatus> = {
  // Standard mappings
  'new': 'new',
  'follow up': 'follow_up',
  'follow-up': 'follow_up',
  'followup': 'follow_up',
  'hot': 'hot',
  'warm': 'hot',
  'cold': 'cold',
  'converted': 'converted',
  'won': 'converted',
  'lost': 'lost',
  'dead': 'lost',
  'inactive': 'cold',

  // Maiyuri Bricks legacy status mappings
  'closed - negative': 'lost',
  'closed - positive': 'converted',
  'will revert if required': 'cold',
  'follow-up required': 'follow_up',
  'ringing no response': 'cold',
  'subcontract': 'new',
  'customer visit pending': 'hot',
  'customer decision pending': 'hot',
  'to be contacted': 'new',
  'decision pending': 'hot',
  'samples to be sent': 'follow_up',
  'quotation to be sent': 'follow_up',
  'site visit pending - engineer': 'hot',
  'cold lead': 'cold',
  'hot lead': 'hot',
};

// Normalize status to valid LeadStatus
function normalizeStatus(value: string | undefined): LeadStatus {
  if (!value) return 'new';
  const normalized = value.toLowerCase().trim();
  return STATUS_MAP[normalized] || 'new';
}

// Convert Excel serial date to ISO string
function excelDateToISO(excelDate: unknown): string | undefined {
  if (!excelDate) return undefined;

  // If it's already a string date, try to parse it
  if (typeof excelDate === 'string') {
    const date = new Date(excelDate);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    return undefined;
  }

  // If it's a number (Excel serial date)
  if (typeof excelDate === 'number') {
    // Excel dates start from Dec 30, 1899
    const date = new Date((excelDate - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return undefined;
}

// Column mapping interface
interface ColumnMapping {
  name: string;
  contact: string;
  source?: string;
  lead_type?: string;
  status?: string;
  follow_up_date?: string;
  notes?: string;
}

// Default column mapping (case-insensitive)
const DEFAULT_MAPPING: ColumnMapping = {
  name: 'name',
  contact: 'contact',
  source: 'source',
  lead_type: 'lead_type',
  status: 'status',
  follow_up_date: 'follow_up_date',
  notes: 'notes',
};

// Find column by possible names (case-insensitive, exact match first, then partial)
function findColumn(row: Record<string, unknown>, possibleNames: string[]): string | undefined {
  const keys = Object.keys(row);

  // First try exact match (case-insensitive)
  for (const name of possibleNames) {
    const found = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') {
      return String(row[found]);
    }
  }

  // Then try partial match
  for (const name of possibleNames) {
    const found = keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
    if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') {
      return String(row[found]);
    }
  }

  return undefined;
}

// POST /api/leads/import - Import leads from Excel/CSV
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let data: Record<string, unknown>[] = [];
    let columnMapping: Partial<ColumnMapping> = {};

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const mappingJson = formData.get('mapping') as string | null;

      if (!file) {
        return error('No file provided', 400);
      }

      // Parse column mapping if provided
      if (mappingJson) {
        try {
          columnMapping = JSON.parse(mappingJson);
        } catch {
          return error('Invalid mapping JSON', 400);
        }
      }

      // Read file
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      data = XLSX.utils.sheet_to_json(worksheet);

    } else if (contentType.includes('application/json')) {
      // Handle JSON body with data array
      const body = await request.json();

      if (!body.data || !Array.isArray(body.data)) {
        return error('data array is required', 400);
      }

      data = body.data;
      columnMapping = body.mapping || {};

    } else {
      return error('Unsupported content type. Use multipart/form-data or application/json', 400);
    }

    if (data.length === 0) {
      return error('No data found in file', 400);
    }

    // Merge with default mapping
    const mapping = { ...DEFAULT_MAPPING, ...columnMapping };

    // Process and validate leads
    const results: { row: number; status: string; lead?: unknown; error?: string }[] = [];
    const leadsToInsert: {
      name: string;
      contact: string;
      source: string;
      lead_type: string;
      status: LeadStatus;
      staff_notes?: string;
      follow_up_date?: string;
      created_at?: string;
      updated_at?: string;
    }[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel rows start at 1, plus header

      // Extract fields using mapping or auto-detect
      // Priority order: exact Excel column names, then common variations
      const name = findColumn(row, ['Name', mapping.name, 'name', 'customer', 'client', 'party', 'customer name']);

      // IMPORTANT: Use "Phone No." first - this is the actual phone column in Maiyuri Excel
      const contact = findColumn(row, ['Phone No.', 'Phone No', 'Phone', 'Mobile', mapping.contact, 'contact', 'phone number', 'mobile number']);

      const source = findColumn(row, ['Source', mapping.source || 'source', 'reference', 'referral', 'lead source']) || 'Legacy Import';

      // Use "Requirement Type" for lead_type
      const leadType = findColumn(row, ['Requirement Type', mapping.lead_type || 'lead_type', 'type', 'category', 'product']) || 'General';

      // Use both "Status" and "Lead Stage" for status determination
      const statusRaw = findColumn(row, ['Status', 'Lead Stage', mapping.status || 'status', 'stage', 'state']);

      // Use "Followup Due Date" for follow-up
      const followUpDateRaw = row['Followup Due Date'] ?? row['followup due date'];

      // Get date fields from Excel (they come as serial numbers)
      const leadAddedDateRaw = row['Lead Added Date'] ?? row['lead added date'];
      const lastUpdatedDateRaw = row['Last Updated Date'] ?? row['last updated date'];

      // Get notes from Excel
      const staffNotes = findColumn(row, ['Notes', 'notes', 'comments', 'remarks']);

      // Validate required fields
      if (!name) {
        results.push({ row: rowNum, status: 'skipped', error: 'Missing name' });
        continue;
      }

      if (!contact) {
        results.push({ row: rowNum, status: 'skipped', error: 'Missing contact' });
        continue;
      }

      // Normalize status
      const status = normalizeStatus(statusRaw);

      // Parse dates using Excel serial date converter
      const parsedFollowUpDate = excelDateToISO(followUpDateRaw);
      const parsedCreatedAt = excelDateToISO(leadAddedDateRaw);
      const parsedUpdatedAt = excelDateToISO(lastUpdatedDateRaw);

      // Use current time as fallback for missing dates
      const now = new Date().toISOString();

      leadsToInsert.push({
        name: name.trim(),
        contact: contact.trim(),
        source: source.trim(),
        lead_type: leadType.trim(),
        status,
        ...(staffNotes && { staff_notes: staffNotes.trim() }),
        ...(parsedFollowUpDate && { follow_up_date: parsedFollowUpDate }),
        // Use parsed dates or current time as fallback
        created_at: parsedCreatedAt || now,
        updated_at: parsedUpdatedAt || now,
      });

      results.push({ row: rowNum, status: 'pending' });
    }

    if (leadsToInsert.length === 0) {
      return error('No valid leads found to import', 400);
    }

    // Insert leads in batches of 100
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < leadsToInsert.length; i += BATCH_SIZE) {
      const batch = leadsToInsert.slice(i, i + BATCH_SIZE);

      const { data: insertedLeads, error: dbError } = await supabaseAdmin
        .from('leads')
        .insert(batch)
        .select();

      if (dbError) {
        console.error('Database error:', dbError);
        // Mark these rows as failed
        for (let j = 0; j < batch.length; j++) {
          const resultIndex = i + j;
          if (results[resultIndex]) {
            results[resultIndex].status = 'error';
            results[resultIndex].error = dbError.message;
          }
        }
        errorCount += batch.length;
      } else {
        // Mark these rows as inserted
        for (let j = 0; j < batch.length; j++) {
          const resultIndex = i + j;
          if (results[resultIndex] && insertedLeads && insertedLeads[j]) {
            results[resultIndex].status = 'inserted';
            results[resultIndex].lead = insertedLeads[j];
          }
        }
        insertedCount += insertedLeads?.length || 0;
      }
    }

    return success({
      message: `Import complete: ${insertedCount} leads imported, ${errorCount} errors`,
      total: data.length,
      inserted: insertedCount,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: errorCount,
      results: results.slice(0, 50), // Return first 50 results for review
    });

  } catch (err) {
    console.error('Error importing leads:', err);
    return error('Internal server error', 500);
  }
}

// GET /api/leads/import - Get import template info
export async function GET() {
  return success({
    description: 'Lead Import API - Upload Excel/CSV or send JSON data',
    supportedFormats: ['xlsx', 'xls', 'csv'],
    requiredColumns: ['name', 'contact'],
    optionalColumns: ['source', 'lead_type', 'status', 'follow_up_date', 'notes'],
    statusMapping: STATUS_MAP,
    exampleCurl: `curl -X POST http://localhost:3000/api/leads/import \\
  -F "file=@leads.xlsx"`,
    exampleJson: {
      data: [
        { name: 'Customer 1', contact: '9876543210', source: 'Website', lead_type: 'Brick Order', status: 'new' },
        { name: 'Customer 2', contact: '9876543211', source: 'Referral', lead_type: 'Construction', status: 'hot' },
      ],
    },
  });
}

// DELETE /api/leads/import - Clear all leads (use with caution!)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get('confirm');

    if (confirm !== 'yes') {
      return error('Add ?confirm=yes to confirm deletion of all leads', 400);
    }

    // Delete all leads
    const { error: dbError, count } = await supabaseAdmin
      .from('leads')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (neq to impossible ID)

    if (dbError) {
      console.error('Database error:', dbError);
      return error(dbError.message, 500);
    }

    return success({
      message: `Deleted all leads`,
      deleted: count || 'all',
    });
  } catch (err) {
    console.error('Error deleting leads:', err);
    return error('Internal server error', 500);
  }
}

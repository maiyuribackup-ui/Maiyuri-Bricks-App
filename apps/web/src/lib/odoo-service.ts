/**
 * Odoo Integration Service
 * Handles bidirectional sync between Maiyuri Bricks app and Odoo CRM
 */

import { createClient } from '@supabase/supabase-js';

// Odoo connection config
const ODOO_CONFIG = {
  url: process.env.ODOO_URL || 'https://CRM.MAIYURI.COM',
  db: process.env.ODOO_DB || 'lite2',
  username: process.env.ODOO_USER || 'maiyuribricks@gmail.com',
  password: process.env.ODOO_PASSWORD || '',
};

// Lazy Supabase client for server-side operations
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface OdooLead {
  id: number;
  name: string;
  contact_name?: string;
  phone?: string;
  email_from?: string;
  description?: string;
  stage_id?: [number, string];
  partner_id?: [number, string];
  expected_revenue?: number;
}

interface OdooQuote {
  id: number;
  name: string;
  partner_id: [number, string];
  amount_total: number;
  state: string;
  date_order?: string;
  opportunity_id?: [number, string];
}

interface SyncResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Make XML-RPC call to Odoo
 */
async function odooXmlRpc(
  endpoint: string,
  method: string,
  params: unknown[]
): Promise<unknown> {
  const xmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>
    ${params.map(p => `<param><value>${formatXmlValue(p)}</value></param>`).join('\n    ')}
  </params>
</methodCall>`;

  const response = await fetch(`${ODOO_CONFIG.url}/xmlrpc/2/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xmlBody,
  });

  const text = await response.text();
  return parseXmlResponse(text);
}

function formatXmlValue(value: unknown): string {
  if (typeof value === 'string') return `<string>${escapeXml(value)}</string>`;
  if (typeof value === 'number') return Number.isInteger(value)
    ? `<int>${value}</int>`
    : `<double>${value}</double>`;
  if (typeof value === 'boolean') return `<boolean>${value ? 1 : 0}</boolean>`;
  if (Array.isArray(value)) {
    return `<array><data>${value.map(v => `<value>${formatXmlValue(v)}</value>`).join('')}</data></array>`;
  }
  if (typeof value === 'object' && value !== null) {
    const members = Object.entries(value).map(([k, v]) =>
      `<member><name>${k}</name><value>${formatXmlValue(v)}</value></member>`
    ).join('');
    return `<struct>${members}</struct>`;
  }
  return '<nil/>';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseXmlResponse(xml: string): unknown {
  // Check for fault first
  if (xml.includes('<fault>')) {
    const faultString = xml.match(/<name>faultString<\/name>\s*<value>(?:<string>)?(.*?)(?:<\/string>)?<\/value>/s);
    throw new Error(`Odoo Error: ${faultString?.[1] || 'Unknown error'}`);
  }

  // Extract the main response value
  const paramMatch = xml.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/);
  if (paramMatch) {
    return parseValue(paramMatch[1]);
  }

  return parseValue(xml);
}

/**
 * Extract content between matching XML tags, handling nested tags properly
 */
function extractTagContent(xml: string, tagName: string, startPos: number = 0): { content: string; endPos: number } | null {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  const openPos = xml.indexOf(openTag, startPos);
  if (openPos === -1) return null;

  const contentStart = openPos + openTag.length;
  let depth = 1;
  let pos = contentStart;

  while (depth > 0 && pos < xml.length) {
    const nextOpen = xml.indexOf(openTag, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) {
        return {
          content: xml.substring(contentStart, nextClose),
          endPos: nextClose + closeTag.length
        };
      }
      pos = nextClose + closeTag.length;
    }
  }

  return null;
}

/**
 * Extract all value elements from XML, handling nested structures
 */
function extractValues(xml: string): string[] {
  const values: string[] = [];
  let pos = 0;

  while (pos < xml.length) {
    const result = extractTagContent(xml, 'value', pos);
    if (!result) break;
    values.push(result.content);
    pos = result.endPos;
  }

  return values;
}

function parseValue(xml: string): unknown {
  xml = xml.trim();

  // Check for int
  const intMatch = xml.match(/^<i(?:nt|4)>(-?\d+)<\/i(?:nt|4)>$/);
  if (intMatch) return parseInt(intMatch[1], 10);

  // Check for double
  const doubleMatch = xml.match(/^<double>(-?[\d.]+)<\/double>$/);
  if (doubleMatch) return parseFloat(doubleMatch[1]);

  // Check for boolean
  const boolMatch = xml.match(/^<boolean>(\d)<\/boolean>$/);
  if (boolMatch) return boolMatch[1] === '1';

  // Check for string
  const stringMatch = xml.match(/^<string>([\s\S]*?)<\/string>$/);
  if (stringMatch) return unescapeXml(stringMatch[1]);

  // Check for nil/None
  if (xml.match(/^<nil\s*\/>$/) || xml === 'False' || xml === '') return null;

  // Check for array - use proper nested tag extraction
  const arrayMatch = xml.match(/^<array>\s*<data>([\s\S]*)<\/data>\s*<\/array>$/);
  if (arrayMatch) {
    const values = extractValues(arrayMatch[1]);
    return values.map(v => parseValue(v));
  }

  // Check for struct - use proper nested tag extraction
  const structMatch = xml.match(/^<struct>([\s\S]*)<\/struct>$/);
  if (structMatch) {
    const obj: Record<string, unknown> = {};
    const memberContent = structMatch[1];

    // Find all member elements
    let pos = 0;
    while (pos < memberContent.length) {
      const memberStart = memberContent.indexOf('<member>', pos);
      if (memberStart === -1) break;

      const memberEnd = findMatchingClose(memberContent, 'member', memberStart);
      if (memberEnd === -1) break;

      const member = memberContent.substring(memberStart + 8, memberEnd);

      // Extract name
      const nameMatch = member.match(/<name>([^<]+)<\/name>/);
      if (nameMatch) {
        // Extract value using proper nested extraction
        const valueResult = extractTagContent(member, 'value', 0);
        if (valueResult) {
          obj[nameMatch[1]] = parseValue(valueResult.content);
        }
      }

      pos = memberEnd + 9; // '</member>'.length
    }
    return obj;
  }

  // Check for bare int (without tags)
  if (/^-?\d+$/.test(xml)) {
    return parseInt(xml, 10);
  }

  // Return as string if no type tag
  return xml;
}

/**
 * Find matching close tag position for a tag that starts at startPos
 * startPos should point to the position of the opening '<' of the tag
 */
function findMatchingClose(xml: string, tagName: string, startPos: number): number {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  // Start after the opening tag
  let depth = 1;
  let pos = startPos + openTag.length;

  while (pos < xml.length) {
    const nextOpen = xml.indexOf(openTag, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) return -1;

    // Check which comes first
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Found another opening tag before the close tag
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      // Found a closing tag
      depth--;
      if (depth === 0) {
        return nextClose;
      }
      pos = nextClose + closeTag.length;
    }
  }

  return -1;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Authenticate with Odoo and get user ID
 */
async function authenticate(): Promise<number> {
  const uid = await odooXmlRpc('common', 'authenticate', [
    ODOO_CONFIG.db,
    ODOO_CONFIG.username,
    ODOO_CONFIG.password,
    {},
  ]);

  if (!uid || uid === false) {
    throw new Error('Odoo authentication failed');
  }

  return uid as number;
}

/**
 * Execute Odoo model method
 */
async function execute(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const uid = await authenticate();

  return odooXmlRpc('object', 'execute_kw', [
    ODOO_CONFIG.db,
    uid,
    ODOO_CONFIG.password,
    model,
    method,
    args,
    kwargs,
  ]);
}

/**
 * Map app status to Odoo stage
 */
function mapStatusToStage(status: string): string {
  const stageMap: Record<string, string> = {
    new: 'New',
    follow_up: 'Qualified',
    hot: 'Proposition',
    warm: 'Qualified',
    cold: 'New',
    converted: 'Won',
    lost: 'New', // Keep in pipeline, mark in notes
  };
  return stageMap[status] || 'New';
}

/**
 * Push a single lead to Odoo
 */
export async function pushLeadToOdoo(leadId: string): Promise<SyncResult> {
  try {
    // Fetch lead from Supabase
    const { data: lead, error } = await getSupabase()
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (error || !lead) {
      return { success: false, message: 'Lead not found', error: error?.message };
    }

    // Get Odoo stages
    let stageId = 1; // Default stage
    try {
      const stagesResult = await execute('crm.stage', 'search_read', [[]], {
        fields: ['name', 'id'],
      });

      // Ensure stages is an array
      const stages = Array.isArray(stagesResult) ? stagesResult as Array<{ id: number; name: string }> : [];

      if (stages.length > 0) {
        const stageMap = Object.fromEntries(
          stages.map(s => [s.name?.toLowerCase?.() || '', s.id])
        );
        const targetStage = mapStatusToStage(lead.status);
        stageId = stageMap[targetStage.toLowerCase()] || stageMap['new'] || stages[0]?.id || 1;
      }
    } catch (stageError) {
      console.warn('Failed to fetch stages, using default:', stageError);
    }

    // Prepare lead data
    const description = [
      `Lead Type: ${lead.lead_type}`,
      `Source: ${lead.source}`,
      `App Status: ${lead.status}`,
      lead.ai_summary ? `\nAI Summary: ${lead.ai_summary}` : '',
      lead.staff_notes ? `\nStaff Notes:\n${lead.staff_notes}` : '',
    ].filter(Boolean).join('\n');

    const leadData = {
      name: `${lead.name}'s opportunity`,
      contact_name: lead.name,
      phone: lead.contact,
      description,
      stage_id: stageId,
      type: 'opportunity',
      expected_revenue: lead.ai_score ? lead.ai_score * 100000 : 0,
    };

    let odooLeadId: number;

    if (lead.odoo_lead_id) {
      // Update existing lead
      await execute('crm.lead', 'write', [[lead.odoo_lead_id], leadData]);
      odooLeadId = lead.odoo_lead_id;
    } else {
      // Create new lead
      odooLeadId = await execute('crm.lead', 'create', [leadData]) as number;
    }

    // Update Supabase with Odoo ID
    await getSupabase()
      .from('leads')
      .update({
        odoo_lead_id: odooLeadId,
        odoo_sync_status: 'synced',
        odoo_synced_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // Log sync
    await getSupabase().from('odoo_sync_log').insert({
      lead_id: leadId,
      sync_type: 'lead_push',
      status: 'success',
      odoo_response: { odoo_lead_id: odooLeadId },
    });

    return {
      success: true,
      message: `Lead synced to Odoo (ID: ${odooLeadId})`,
      data: { odooLeadId },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Log error
    await getSupabase().from('odoo_sync_log').insert({
      lead_id: leadId,
      sync_type: 'lead_push',
      status: 'error',
      error_message: errorMessage,
    });

    await getSupabase()
      .from('leads')
      .update({ odoo_sync_status: 'error' })
      .eq('id', leadId);

    return { success: false, message: 'Sync failed', error: errorMessage };
  }
}

/**
 * Pull quotes and orders from Odoo for a lead
 */
export async function pullQuotesFromOdoo(leadId: string): Promise<SyncResult> {
  try {
    const { data: lead, error } = await getSupabase()
      .from('leads')
      .select('odoo_lead_id, odoo_partner_id')
      .eq('id', leadId)
      .single();

    if (error || !lead?.odoo_lead_id) {
      return { success: false, message: 'Lead not synced to Odoo yet' };
    }

    // Search for quotations linked to this lead
    const quotes = await execute('sale.order', 'search_read', [
      [['opportunity_id', '=', lead.odoo_lead_id]],
    ], {
      fields: ['id', 'name', 'amount_total', 'state', 'date_order', 'partner_id'],
      order: 'create_date desc',
      limit: 5,
    }) as OdooQuote[];

    if (quotes.length === 0) {
      return { success: true, message: 'No quotes found for this lead', data: { quotes: [] } };
    }

    // Get the latest quote and order
    const latestQuote = quotes.find(q => q.state === 'draft' || q.state === 'sent');
    const latestOrder = quotes.find(q => q.state === 'sale' || q.state === 'done');

    // Update Supabase lead with quote/order info
    const updateData: Record<string, unknown> = {};

    if (latestQuote) {
      updateData.odoo_quote_id = latestQuote.id;
      updateData.odoo_quote_number = latestQuote.name;
      updateData.odoo_quote_amount = latestQuote.amount_total;
      updateData.odoo_quote_date = latestQuote.date_order;
    }

    if (latestOrder) {
      updateData.odoo_order_id = latestOrder.id;
      updateData.odoo_order_number = latestOrder.name;
      updateData.odoo_order_amount = latestOrder.amount_total;
      updateData.odoo_order_date = latestOrder.date_order;

      // If order exists and lead not converted, update status
      const { data: currentLead } = await getSupabase()
        .from('leads')
        .select('status')
        .eq('id', leadId)
        .single();

      if (currentLead?.status !== 'converted') {
        updateData.status = 'converted';
      }
    }

    if (Object.keys(updateData).length > 0) {
      updateData.odoo_synced_at = new Date().toISOString();
      await getSupabase().from('leads').update(updateData).eq('id', leadId);
    }

    // Log sync
    await getSupabase().from('odoo_sync_log').insert({
      lead_id: leadId,
      sync_type: 'quote_pull',
      status: 'success',
      odoo_response: {
        quotes: quotes.map(q => ({
          number: q.name,
          amount: q.amount_total,
          state: q.state,
          date: q.date_order,
        })),
        latestQuote: latestQuote?.name,
        latestOrder: latestOrder?.name,
      },
    });

    return {
      success: true,
      message: `Found ${quotes.length} quote(s)/order(s)`,
      data: {
        quotes: quotes.map(q => ({
          number: q.name,
          amount: q.amount_total,
          state: q.state,
          date: q.date_order,
        })),
        latestQuote: latestQuote?.name,
        latestOrder: latestOrder?.name,
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    await getSupabase().from('odoo_sync_log').insert({
      lead_id: leadId,
      sync_type: 'quote_pull',
      status: 'error',
      error_message: errorMessage,
    });

    return { success: false, message: 'Failed to pull quotes', error: errorMessage };
  }
}

/**
 * Sync all pending leads to Odoo
 */
export async function syncAllLeadsToOdoo(): Promise<SyncResult> {
  try {
    // Get all leads that need syncing
    const { data: leads, error } = await getSupabase()
      .from('leads')
      .select('id, name')
      .or('odoo_sync_status.eq.pending,odoo_sync_status.is.null')
      .eq('is_archived', false)
      .limit(50);

    if (error) {
      return { success: false, message: 'Failed to fetch leads', error: error.message };
    }

    if (!leads || leads.length === 0) {
      return { success: true, message: 'No leads to sync' };
    }

    const results = { synced: 0, failed: 0, errors: [] as string[] };

    for (const lead of leads) {
      const result = await pushLeadToOdoo(lead.id);
      if (result.success) {
        results.synced++;
      } else {
        results.failed++;
        results.errors.push(`${lead.name}: ${result.error}`);
      }
    }

    return {
      success: results.failed === 0,
      message: `Synced ${results.synced}/${leads.length} leads`,
      data: results,
    };
  } catch (err) {
    return {
      success: false,
      message: 'Sync failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Process leads concurrently with limited concurrency
 */
async function processLeadsConcurrently<T>(
  leads: Array<{ id: string; name: string }>,
  processor: (leadId: string) => Promise<T>,
  concurrency: number = 5
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < leads.length; i += concurrency) {
    const batch = leads.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(lead => processor(lead.id))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Pull all quotes/orders from Odoo for synced leads (with batching)
 * @param limit - Max leads to process (default 10 for serverless timeout)
 * @param offset - Skip first N leads for pagination
 */
export async function syncAllQuotesFromOdoo(
  limit: number = 10,
  offset: number = 0
): Promise<SyncResult> {
  try {
    // Get total count first
    const { count: totalCount } = await getSupabase()
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .not('odoo_lead_id', 'is', null)
      .eq('is_archived', false);

    // Get batch of leads that are synced with Odoo
    const { data: leads, error } = await getSupabase()
      .from('leads')
      .select('id, name, odoo_lead_id')
      .not('odoo_lead_id', 'is', null)
      .eq('is_archived', false)
      .order('odoo_synced_at', { ascending: true, nullsFirst: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return { success: false, message: 'Failed to fetch leads', error: error.message };
    }

    if (!leads || leads.length === 0) {
      return {
        success: true,
        message: 'No more leads to sync',
        data: { updated: 0, noQuotes: 0, failed: 0, total: totalCount || 0, hasMore: false }
      };
    }

    const results = { updated: 0, noQuotes: 0, failed: 0 };

    // Process leads concurrently (5 at a time) instead of sequentially
    const pullResults = await processLeadsConcurrently(
      leads,
      pullQuotesFromOdoo,
      5
    );

    for (const result of pullResults) {
      if (result.success) {
        const quotes = result.data?.quotes as unknown[];
        if (quotes && quotes.length > 0) {
          results.updated++;
        } else {
          results.noQuotes++;
        }
      } else {
        results.failed++;
      }
    }

    const hasMore = offset + leads.length < (totalCount || 0);
    const nextOffset = hasMore ? offset + limit : null;

    return {
      success: true,
      message: `Updated ${results.updated}/${leads.length} leads with quotes/orders`,
      data: {
        ...results,
        processed: leads.length,
        total: totalCount || 0,
        hasMore,
        nextOffset,
      },
    };
  } catch (err) {
    return {
      success: false,
      message: 'Quote sync failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Full bidirectional sync (batched to avoid timeout)
 * @param pullLimit - Max leads to pull quotes for (default 10)
 * @param pullOffset - Offset for pull pagination
 */
export async function fullSync(
  pullLimit: number = 10,
  pullOffset: number = 0
): Promise<SyncResult> {
  const pushResult = await syncAllLeadsToOdoo();
  const pullResult = await syncAllQuotesFromOdoo(pullLimit, pullOffset);

  return {
    success: pushResult.success && pullResult.success,
    message: `Push: ${pushResult.message} | Pull: ${pullResult.message}`,
    data: {
      push: pushResult.data,
      pull: pullResult.data,
    },
  };
}

# Client-Based File Naming for Floor Plans

## Overview

Floor plan files (DXF, PNG, renders) are now automatically named using client name + date for easy tracking and organization in Supabase Storage.

## File Naming Format

```
{client-name}_{YYYYMMDD}_{HHMMSS}_{file-type}.{ext}
```

### Examples

**Input:** Client name: "Mr. Kumar's Residence", Date: 2026-01-11 14:30:22

**Output files:**
```
mr-kumars-residence_20260111_143022_floor-plan.dxf
mr-kumars-residence_20260111_143022_wireframe.png
mr-kumars-residence_20260111_143022_rendered.png
```

**Input:** Client name: "Ramesh Villa - Phase 2", Date: 2026-01-11 09:15:48

**Output files:**
```
ramesh-villa-phase-2_20260111_091548_floor-plan.dxf
ramesh-villa-phase-2_20260111_091548_wireframe.png
ramesh-villa-phase-2_20260111_091548_rendered.png
```

**Input:** No client name provided

**Output files:**
```
unnamed-client_20260111_143022_floor-plan.dxf
unnamed-client_20260111_143022_wireframe.png
unnamed-client_20260111_143022_rendered.png
```

## Storage Organization

Files are stored in Supabase Storage with this structure:

```
floor-plans/
  {session-id}/
    {client-name}_{date}_{time}_floor-plan.dxf
    {client-name}_{date}_{time}_wireframe.png
    {client-name}_{date}_{time}_rendered.png
```

Example:
```
floor-plans/
  123e4567-e89b-12d3-a456-426614174000/
    kumar-residence_20260111_143022_floor-plan.dxf
    kumar-residence_20260111_143022_wireframe.png
    kumar-residence_20260111_143022_rendered.png
```

## Database Schema

The `floor_plan_sessions` table now includes:

```sql
client_name TEXT         -- Client or project name
client_contact TEXT      -- Phone/email (optional)
client_location TEXT     -- Project site location (optional)
```

## Integration Examples

### 1. Create Session with Client Info

```typescript
import { floorPlanSupabase } from '@/lib/floor-plan-supabase';

const result = await floorPlanSupabase.createSession(
  userId,
  'residential',
  'Kumar Residence',      // client name
  '+91 98765 43210',      // client contact
  'Chennai, Tamil Nadu'   // client location
);
```

### 2. Update Client Info Later

```typescript
await floorPlanSupabase.updateClientInfo(sessionId, {
  clientName: 'Kumar Residence - Updated',
  clientContact: 'kumar@example.com',
  clientLocation: 'Adyar, Chennai',
});
```

### 3. Upload Files with Client-Based Naming

```typescript
import { uploadCadRenderResult } from '@/services/floor-plan-storage';

// Get session (includes client_name)
const session = await floorPlanSupabase.getSession(sessionId);

// Upload CAD outputs with client-based naming
const urls = await uploadCadRenderResult(
  sessionId,
  {
    dxf_path: '/path/to/plan.dxf',
    wireframe_base64: wireframeImageBase64,
    ai_rendered_base64: renderedImageBase64,
  },
  session.data?.client_name // Client name for filename
);

// Store URLs in database
await floorPlanSupabase.updateGeneratedImages(sessionId, {
  blueprint: urls.wireframeUrl,
  rendered: urls.aiRenderedUrl,
  dxf: urls.dxfUrl,
});
```

### 4. Full Integration Flow

```typescript
// Step 1: Create session with client info (from chatbot)
const sessionResult = await floorPlanSupabase.createSession(
  userId,
  'residential',
  'Mr. Kumar',
  null,
  null
);

const sessionId = sessionResult.data!.id;

// Step 2: Collect inputs through chat...
// ...

// Step 3: Generate floor plan with CAD service
const cadResult = await cadService.renderEngineeringPlan({
  rooms: [...],
  wall_system: {...},
  // ... other inputs
});

// Step 4: Get session to retrieve client name
const session = await floorPlanSupabase.getSession(sessionId);

// Step 5: Upload to Supabase Storage with client-based naming
const storageUrls = await uploadCadRenderResult(
  sessionId,
  cadResult,
  session.data?.client_name
);

// Step 6: Save URLs to database
await floorPlanSupabase.updateGeneratedImages(sessionId, storageUrls);

// Final result: Files named "mr-kumar_20260111_143022_*.ext"
```

## Frontend Integration

### Add Client Name Question Early

In the chatbot flow, ask for client name before starting the floor plan design:

```typescript
// src/components/FloorPlanChatbot/config/questions.ts

export const INITIAL_QUESTIONS: QuestionConfig[] = [
  {
    id: 'client_name',
    type: 'text',
    question: "What is the client or project name for this floor plan?",
    description: "This helps us organize your files with a meaningful name.",
    placeholder: "e.g., Kumar Residence, Villa Project Phase 2",
    inputKey: 'clientName',
    required: true,
    validation: (value) => {
      if (!value || value.trim().length < 2) {
        return 'Please enter a client or project name';
      }
      return null;
    },
  },
  {
    id: 'project_type',
    type: 'options',
    question: "What type of property are you designing?",
    options: [
      { value: 'residential', label: 'Residential Home' },
      { value: 'compound', label: 'Residential Compound' },
      { value: 'commercial', label: 'Commercial Building' },
    ],
    inputKey: 'projectType',
    required: true,
  },
  // ... rest of questions
];
```

### Save Client Name Immediately

```typescript
// When client name is provided
const handleClientNameSubmit = async (clientName: string) => {
  // Update session with client info
  await floorPlanSupabase.updateClientInfo(sessionId, {
    clientName: clientName.trim(),
  });

  // Continue with next question
  moveToNextQuestion();
};
```

## Benefits

### 1. **Easy Identification**
Files are immediately identifiable without opening them:
```
kumar-residence_20260111_143022_floor-plan.dxf
```
vs
```
1736598622000_plan.dxf  ❌ (unclear)
```

### 2. **Chronological Sorting**
Date in YYYYMMDD format ensures proper sorting:
```
kumar-residence_20260109_100000_floor-plan.dxf
kumar-residence_20260110_150000_floor-plan.dxf
kumar-residence_20260111_143022_floor-plan.dxf  ✅ Newest
```

### 3. **Client-Specific Searches**
Find all files for a specific client:
```sql
SELECT * FROM floor_plan_sessions
WHERE client_name ILIKE '%kumar%'
ORDER BY created_at DESC;
```

In Supabase Storage dashboard:
- Filter by filename prefix: `kumar-residence_`
- All files for that client appear together

### 4. **Professional Downloads**
When users download files, they have meaningful names:
```
✅ kumar-residence_20260111_143022_floor-plan.dxf
❌ download (23).dxf
```

## Migration Notes

### Existing Sessions

Run this migration to update existing sessions:

```bash
cd /path/to/project
bun supabase migration up
```

This adds the `client_name`, `client_contact`, and `client_location` columns.

### Updating Old Files

Old files without client-based naming will remain as-is. New generations will use the new naming convention automatically.

To manually update old sessions with client names:

```typescript
// Bulk update script (run once)
const sessions = await floorPlanSupabase.getUserSessions(userId, 100);

for (const session of sessions.data || []) {
  if (!session.client_name) {
    // Prompt user or infer from collected_inputs
    const inferredName = session.collected_inputs.projectName || 'Legacy Project';

    await floorPlanSupabase.updateClientInfo(session.id, {
      clientName: inferredName,
    });
  }
}
```

## Sanitization Rules

Client names are sanitized for filesystem safety:

| Input | Output |
|-------|--------|
| `Mr. Kumar's House` | `mr-kumars-house` |
| `Villa - Phase 2 (Updated)` | `villa-phase-2-updated` |
| `Ramesh & Co. Building` | `ramesh-co-building` |
| `123 Main Street` | `123-main-street` |

**Rules:**
1. Convert to lowercase
2. Replace non-alphanumeric with hyphens
3. Remove leading/trailing hyphens
4. Limit to 50 characters

## Security Considerations

### RLS Policies

Client names are visible to the session owner only:

```sql
-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON floor_plan_sessions
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
```

### Storage Access

Files in Supabase Storage are private by default:

```sql
CREATE POLICY "Users can read floor plans" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'floor-plans'
    AND auth.role() = 'authenticated'
  );
```

Signed URLs expire after 7 days for security.

## Troubleshooting

### Issue: Files have generic names

**Solution:** Ensure client name is set before uploading:

```typescript
// Check if client name exists
const session = await floorPlanSupabase.getSession(sessionId);

if (!session.data?.client_name) {
  console.warn('No client name set, files will use "unnamed-client"');

  // Optionally prompt user
  const clientName = await promptForClientName();
  await floorPlanSupabase.updateClientInfo(sessionId, { clientName });
}
```

### Issue: Duplicate filenames

**Solution:** The timestamp (down to seconds) prevents duplicates. If needed, add milliseconds:

```typescript
// In floor-plan-storage.ts, update generateFileName()
const dateStr = now.toISOString()
  .replace(/[-:.]/g, '')
  .replace('T', '_')
  .substring(0, 18); // Include milliseconds: YYYYMMDD_HHMMSS_mmm
```

### Issue: Client name too long

**Solution:** Already handled - names are truncated to 50 characters:

```typescript
.substring(0, 50); // Automatic truncation
```

## API Reference

### floorPlanSupabase.createSession()

```typescript
async createSession(
  userId?: string,
  projectType?: 'residential' | 'compound' | 'commercial',
  clientName?: string,
  clientContact?: string,
  clientLocation?: string
): Promise<FloorPlanResult<DbFloorPlanSession>>
```

### floorPlanSupabase.updateClientInfo()

```typescript
async updateClientInfo(
  sessionId: string,
  clientInfo: {
    clientName?: string;
    clientContact?: string;
    clientLocation?: string;
  }
): Promise<FloorPlanResult<void>>
```

### uploadCadRenderResult()

```typescript
async function uploadCadRenderResult(
  sessionId: string,
  result: {
    dxf_path?: string;
    wireframe_base64?: string;
    ai_rendered_base64?: string;
  },
  clientName?: string | null
): Promise<{
  dxfUrl?: string;
  wireframeUrl?: string;
  aiRenderedUrl?: string;
  error?: string;
}>
```

### uploadFloorPlanFile()

```typescript
async function uploadFloorPlanFile(
  sessionId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  clientName?: string | null
): Promise<StorageUploadResult>
```

## Testing

### Test File Naming

```typescript
import { uploadFloorPlanFile } from '@/services/floor-plan-storage';
import { Buffer } from 'buffer';

// Test 1: With client name
const result1 = await uploadFloorPlanFile(
  'test-session-id',
  'floor-plan.dxf',
  Buffer.from('test'),
  'application/octet-stream',
  'Kumar Residence'
);

console.log(result1.path);
// Expected: test-session-id/kumar-residence_20260111_143022_floor-plan.dxf

// Test 2: Without client name
const result2 = await uploadFloorPlanFile(
  'test-session-id',
  'wireframe.png',
  Buffer.from('test'),
  'image/png',
  null
);

console.log(result2.path);
// Expected: test-session-id/unnamed-client_20260111_143023_wireframe.png
```

### Run Migration

```bash
# Apply migration
bun supabase migration up

# Verify schema
bun supabase db dump --schema public --table floor_plan_sessions
```

## Next Steps

1. ✅ Apply migration: `bun supabase migration up`
2. ✅ Update frontend to capture client name early in chatbot flow
3. ✅ Test file naming with sample uploads
4. ✅ Update API routes to pass client name to storage service
5. ✅ Document for team members

## Summary

With client-based file naming:
- Files are **immediately identifiable** (e.g., `kumar-residence_20260111_143022_floor-plan.dxf`)
- **Chronological sorting** works correctly (YYYYMMDD format)
- **Easy searching** by client name in storage
- **Professional downloads** for users
- **Zero performance impact** (naming happens during upload)

The system automatically sanitizes client names for filesystem safety and handles missing names gracefully.

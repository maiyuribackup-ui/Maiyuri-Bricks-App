# Client Name Integration - Quick Start Example

## Step 1: Apply Database Migration

```bash
cd /Users/ramkumaranganeshan/Documents/Maiyuri_Bricks_App
bun supabase migration up
```

This adds `client_name`, `client_contact`, and `client_location` columns to `floor_plan_sessions`.

## Step 2: Update API Route to Capture Client Name

### In `/api/planning/start/route.ts`

```typescript
import { floorPlanSupabase } from '@/lib/floor-plan-supabase';

export async function POST(request: NextRequest) {
  const { userId, projectType, clientName, clientContact, clientLocation } = await request.json();

  // Create session with client info
  const sessionResult = await floorPlanSupabase.createSession(
    userId,
    projectType,
    clientName,      // ← NEW: Pass client name
    clientContact,   // ← NEW: Pass client contact (optional)
    clientLocation   // ← NEW: Pass client location (optional)
  );

  if (!sessionResult.success) {
    return error('Failed to create session', 500);
  }

  return success({ sessionId: sessionResult.data!.id });
}
```

### In `/api/planning/answer/route.ts`

```typescript
import { floorPlanSupabase } from '@/lib/floor-plan-supabase';

export async function POST(request: NextRequest) {
  const { sessionId, answer, questionId } = await request.json();

  // If answer is for client name, update session
  if (questionId === 'client_name') {
    await floorPlanSupabase.updateClientInfo(sessionId, {
      clientName: answer,
    });
  }

  // ... rest of answer processing
}
```

## Step 3: Add Client Name Question in Frontend

### Option A: Capture at Session Start

```typescript
// In useFloorPlanChatbot or equivalent hook

const startSession = async () => {
  // Prompt user for client name FIRST
  const clientName = prompt("What's the client or project name?");

  const response = await fetch('/api/planning/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: user?.id,
      projectType: null, // Will ask later
      clientName: clientName,
    }),
  });

  const { sessionId } = await response.json();
  setSessionId(sessionId);
};
```

### Option B: Add as First Question in Chat Flow

```typescript
// In your question flow configuration

const QUESTIONS = [
  {
    id: 'client_name',
    question: "What's the client or project name for this floor plan?",
    description: "This helps us organize your files with a meaningful name.",
    type: 'text',
    placeholder: "e.g., Kumar Residence, Villa Project Phase 2",
    required: true,
    validate: (value: string) => {
      if (!value || value.trim().length < 2) {
        return 'Please enter a valid client name';
      }
      return null;
    },
  },
  {
    id: 'project_type',
    question: "What type of property are you designing?",
    type: 'options',
    options: [
      { value: 'residential', label: 'Residential Home' },
      { value: 'compound', label: 'Residential Compound' },
      { value: 'commercial', label: 'Commercial Building' },
    ],
  },
  // ... rest of questions
];
```

## Step 4: Use Client Name During File Upload

### In your floor plan generation code

```typescript
import { uploadCadRenderResult } from '@/services/floor-plan-storage';
import { floorPlanSupabase } from '@/lib/floor-plan-supabase';

async function generateAndStoreFloorPlan(sessionId: string) {
  // 1. Get session (includes client_name)
  const sessionResult = await floorPlanSupabase.getSession(sessionId);
  const session = sessionResult.data;

  if (!session) {
    throw new Error('Session not found');
  }

  // 2. Generate floor plan with CAD service
  const cadResult = await cadService.renderEngineeringPlan({
    rooms: [...],
    wall_system: {...},
    // ... other inputs
  });

  // 3. Upload to Supabase Storage with client-based naming
  const storageUrls = await uploadCadRenderResult(
    sessionId,
    {
      dxf_path: cadResult.dxf_path,
      wireframe_base64: cadResult.wireframe_base64,
      ai_rendered_base64: cadResult.ai_rendered_base64,
    },
    session.client_name  // ← Client name for filename
  );

  // 4. Save URLs to database
  await floorPlanSupabase.updateGeneratedImages(sessionId, {
    blueprint: storageUrls.wireframeUrl,
    rendered: storageUrls.aiRenderedUrl,
    dxf: storageUrls.dxfUrl,
  });

  console.log('Files uploaded with client-based names:');
  console.log('- ' + storageUrls.dxfUrl);
  console.log('- ' + storageUrls.wireframeUrl);
  console.log('- ' + storageUrls.aiRenderedUrl);

  // Result: Files named like "kumar-residence_20260111_143022_*.ext"
}
```

## Step 5: Verify File Naming

### Test with sample upload

```typescript
// Test script: test-client-naming.ts

import { floorPlanSupabase } from '@/lib/floor-plan-supabase';
import { uploadFloorPlanFile } from '@/services/floor-plan-storage';
import { Buffer } from 'buffer';

async function testClientNaming() {
  // Create test session with client name
  const session = await floorPlanSupabase.createSession(
    null,
    'residential',
    'Kumar Residence Test'
  );

  console.log('Session created:', session.data?.id);

  // Upload test file
  const testBuffer = Buffer.from('test data');
  const result = await uploadFloorPlanFile(
    session.data!.id,
    'floor-plan.dxf',
    testBuffer,
    'application/octet-stream',
    'Kumar Residence Test'
  );

  console.log('File uploaded:', result.path);
  // Expected: {session-id}/kumar-residence-test_20260111_143022_floor-plan.dxf
}

testClientNaming();
```

## Example Output

When a floor plan is generated for "Mr. Kumar's House" on 2026-01-11 at 14:30:22:

**Files in Supabase Storage:**
```
floor-plans/
  a1b2c3d4-e5f6-7890-abcd-ef1234567890/
    mr-kumars-house_20260111_143022_floor-plan.dxf
    mr-kumars-house_20260111_143022_wireframe.png
    mr-kumars-house_20260111_143022_rendered.png
```

**When user downloads:**
- File shows as: `mr-kumars-house_20260111_143022_floor-plan.dxf` ✅
- NOT: `download (5).dxf` ❌

## Minimal Frontend Changes

### If you want to add client name question to existing flow:

```typescript
// In your FloorPlanChatbot component

// Add state
const [clientName, setClientName] = useState<string | null>(null);

// Add prompt after user starts
useEffect(() => {
  if (sessionStarted && !clientName) {
    // Show client name input dialog
    showClientNameDialog();
  }
}, [sessionStarted, clientName]);

// Handler
const handleClientNameSubmit = async (name: string) => {
  setClientName(name);

  // Update session with client name
  await fetch('/api/planning/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      questionId: 'client_name',
      answer: name,
    }),
  });

  // Continue with normal flow
  proceedToNextQuestion();
};
```

## Benefits You Get

1. **Organized Storage:**
   - Files grouped by session
   - Named with client + date for easy identification

2. **Easy Searching:**
   - Search database: `WHERE client_name ILIKE '%kumar%'`
   - Search storage: Filter by `kumar-residence_`

3. **Professional Downloads:**
   - Users get meaningful filenames
   - No more `download (23).dxf`

4. **Chronological Tracking:**
   - Date in filename ensures proper sorting
   - Easy to find latest version

## Troubleshooting

### Files still using generic names?

Check if client name is set before upload:

```typescript
const session = await floorPlanSupabase.getSession(sessionId);

if (!session.data?.client_name) {
  console.warn('⚠️ No client name set for session:', sessionId);

  // Option 1: Use fallback
  const fallback = 'unnamed-client';

  // Option 2: Prompt user
  const name = prompt("Client name for this project?");
  await floorPlanSupabase.updateClientInfo(sessionId, { clientName: name });
}
```

### Client name not saving to database?

Verify migration was applied:

```bash
bun supabase db dump --schema public --table floor_plan_sessions

# Should show:
# client_name text
# client_contact text
# client_location text
```

### Want to update all existing sessions?

```typescript
// Bulk update script
const sessions = await floorPlanSupabase.getUserSessions(userId, 100);

for (const session of sessions.data || []) {
  if (!session.client_name) {
    // Infer from inputs or prompt
    const inferredName = session.collected_inputs.projectType || 'Legacy Project';

    await floorPlanSupabase.updateClientInfo(session.id, {
      clientName: inferredName,
    });

    console.log(`Updated session ${session.id} with name: ${inferredName}`);
  }
}
```

## Complete Flow Diagram

```
User starts session
       ↓
   [Prompt for client name]
       ↓
   Save to floor_plan_sessions.client_name
       ↓
   User answers questions...
       ↓
   Generate floor plan with CAD service
       ↓
   Get session (includes client_name)
       ↓
   Upload files to Supabase Storage
       ↓
   Files named: {client-name}_{date}_{time}_{type}.{ext}
       ↓
   Store URLs in database
       ↓
   User can download with meaningful names ✅
```

## Next Steps

1. ✅ Run migration: `bun supabase migration up`
2. ✅ Update API routes to accept/save client name
3. ✅ Add client name question to frontend flow
4. ✅ Pass client name to upload functions
5. ✅ Test with sample generation
6. ✅ Verify file names in Supabase Storage dashboard

## Summary

With this integration:
- Files are automatically named with client name + date
- No code changes needed after initial setup
- Works for all future floor plan generations
- Existing sessions can be updated retroactively
- Professional, organized file management

**Time to implement: ~30 minutes**

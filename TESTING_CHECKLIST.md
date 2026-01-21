# Client Name Integration - Testing Checklist

## Step 1: Apply Migration ⏸️ **ACTION REQUIRED**

The database migration must be applied before testing. Choose one method:

### Method A: Supabase Dashboard (Recommended - 2 minutes)

1. Open: https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/sql/new
2. Paste the SQL from `supabase/migrations/20260111000002_add_client_info.sql`
3. Click "Run"
4. Verify: Run `cd apps/web && bun --env-file=.env.local scripts/check-schema.ts`

### Method B: psql Command Line

```bash
# Get your database password from Supabase dashboard first
# Then run:
psql "postgresql://postgres.pailepomvvwjkrhkwdqt:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/20260111000002_add_client_info.sql
```

---

## Step 2: Verify Code Changes ✅ **COMPLETED**

All code changes have been implemented:

- [x] Database schema migration created
- [x] `floor-plan-storage.ts` updated with client-based file naming
- [x] `floor-plan-supabase.ts` updated with client info methods
- [x] TypeScript types updated (`FloorPlanInputs`, `DbFloorPlanSession`)
- [x] Question flow updated in `useQuestionFlow.ts` (frontend)
- [x] API routes updated (`/api/planning/start`, `/api/planning/answer`)
- [x] Planning service updated with auto-sync logic

---

## Step 3: Test Client Name Capture 🧪 **READY TO TEST**

Once migration is applied, test the complete flow:

### A. Start the Development Server

```bash
cd /Users/ramkumaranganeshan/Documents/Maiyuri_Bricks_App
bun dev
```

### B. Open the Chatbot

Navigate to: http://localhost:3000/design

### C. Test the Flow

**Expected Behavior:**

1. **First Question** should be:

   ```
   "What's the client or project name for this floor plan?"
   ```

   - Type: Form input
   - Field: `clientName`
   - Example input: "Kumar Residence"

2. **After submitting**, client name should be saved to database:
   - Check in Supabase dashboard: `floor_plan_sessions` table
   - Column `client_name` should contain "Kumar Residence"

3. **Second Question** should be:

   ```
   "Let's start with your plot. Do you have a land survey document?"
   ```

4. Continue through the flow and generate a floor plan

5. **Check file names** in Supabase Storage:
   - Bucket: `floor-plans`
   - Path: `{session-id}/`
   - Files should be named:
     ```
     kumar-residence_20260111_143022_floor-plan.dxf
     kumar-residence_20260111_143022_wireframe.png
     kumar-residence_20260111_143022_rendered.png
     ```

### D. Automated Test Script

```bash
# Test client name in API flow
cd apps/web
bun --env-file=.env.local scripts/test-client-name-flow.ts
```

---

## Step 4: Test Different Scenarios 🔄

### Scenario 1: Client Name with Special Characters

Test input: `"Mr. Kumar's Villa - Phase 2 (Updated)"`

**Expected output filename:**

```
mr-kumars-villa-phase-2-updated_20260111_143022_floor-plan.dxf
```

**Sanitization rules:**

- Lowercase
- Special chars → hyphens
- Max 50 characters

### Scenario 2: No Client Name (Edge Case)

If user somehow skips client name:

**Expected output filename:**

```
unnamed-client_20260111_143022_floor-plan.dxf
```

### Scenario 3: Very Long Client Name

Test input: `"Ramakrishnan and Sons Construction Private Limited Residential Project Phase 2 Block A"`

**Expected output filename:**

```
ramakrishnan-and-sons-construction-private-limi_20260111_143022_floor-plan.dxf
```

(Truncated to 50 chars)

---

## Step 5: Verify Database Integration 🗄️

### Check Session Data

```sql
-- Run in Supabase SQL Editor
SELECT
  id,
  client_name,
  client_contact,
  client_location,
  project_type,
  created_at
FROM floor_plan_sessions
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**

- `client_name` populated with user input
- `client_contact` and `client_location` are NULL (optional fields)

### Check File Storage

1. Go to: https://supabase.com/dashboard/project/pailepomvvwjkrhkwdqt/storage/buckets/floor-plans
2. Navigate into a session folder
3. Verify files have client-based names

---

## Step 6: Performance Check ⚡

**Expected Performance:**

- No slowdown in API responses
- File naming happens during upload (no extra DB queries)
- Client name auto-synced when `updateInputs()` is called

**Monitor:**

- API response times (should be <500ms)
- Database query count (no extra queries)

---

## Troubleshooting 🔧

### Issue: "Column client_name does not exist"

**Solution:** Migration not applied. See Step 1.

### Issue: Client name question doesn't appear

**Check:**

1. Clear browser cache and reload
2. Check browser console for errors
3. Verify API response: `POST /api/planning/start` returns `firstQuestion.id === 'clientName'`

### Issue: Files still have generic names

**Check:**

1. Verify client name was saved: Query `floor_plan_sessions` table
2. Check `planning-service.ts` updateInputs() is calling `updateClientInfo()`
3. Verify `uploadCadRenderResult()` is receiving client name parameter

### Issue: Form validation not working

**Check:**

- Question validation in `useQuestionFlow.ts` (min 2 chars, max 100 chars)
- API validation in `/api/planning/answer/route.ts`

---

## Success Criteria ✅

- [ ] Migration applied successfully
- [ ] Client name appears as first question
- [ ] Client name saves to database
- [ ] Files named with client name + date
- [ ] Works for all project types (residential, compound, commercial)
- [ ] Special characters sanitized correctly
- [ ] No performance degradation

---

## Next Steps After Testing

Once all tests pass:

1. **Deploy to production:**

   ```bash
   git add .
   git commit -m "feat: add client-based file naming for floor plans"
   git push
   ```

2. **Monitor production:**
   - Check Supabase logs for any errors
   - Verify file naming in production storage
   - Collect user feedback

3. **Optional enhancements:**
   - Add client contact and location fields to the form
   - Add client search/filter in session history
   - Export feature with client name in download

---

## Documentation

See also:

- `docs/CLIENT_BASED_FILE_NAMING.md` - Complete reference
- `docs/CLIENT_NAME_INTEGRATION_EXAMPLE.md` - Integration examples
- `MIGRATION_INSTRUCTIONS.md` - How to apply the migration

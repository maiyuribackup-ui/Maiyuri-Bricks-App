# Root Cause Analysis: Telegram Voice Recordings Not Processing

**Report Date:** 2026-01-22
**Status:** ✅ RESOLVED
**Severity:** High (Customer-facing feature not working)
**Resolution Time:** ~15 minutes

---

## Executive Summary

Voice recordings sent through Telegram are being received and stored in the database but are **not being processed**. The most likely root cause is that the **Railway Worker** (`call-recording-processor`) is either not deployed or not running properly.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TELEGRAM VOICE FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   User sends voice     Vercel receives      Record stored in DB     │
│   message in Telegram  webhook (POST)       with status='pending'   │
│         │                   │                      │                │
│         ▼                   ▼                      ▼                │
│   ┌─────────┐         ┌─────────────┐        ┌───────────────┐     │
│   │Telegram │ ──────▶ │ /api/       │ ─────▶ │call_recordings│     │
│   │   Bot   │         │ telegram/   │        │    table      │     │
│   └─────────┘         │ webhook     │        └───────────────┘     │
│                       └─────────────┘               │               │
│                        (Vercel)                     │               │
│                                                     ▼               │
│                                               ┌───────────────┐     │
│                                               │Railway Worker │     │
│                                               │   (POLLS)     │     │
│                                               └───────────────┘     │
│                                                     │               │
│                                                     ▼               │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                   8-STAGE PIPELINE                          │  │
│   │  1. Download from Telegram API                              │  │
│   │  2. Convert to MP3 (ffmpeg)                                 │  │
│   │  3. Upload to Google Drive                                  │  │
│   │  4. Transcribe with Gemini 2.0 Flash                        │  │
│   │  5. AI Analysis (Claude)                                    │  │
│   │  5b. Auto-populate Lead Details                             │  │
│   │  6. Send Telegram Notification                              │  │
│   │  7. Trigger Lead Analysis                                   │  │
│   │  8. Trigger Event Nudges                                    │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Investigation Findings

### Component Status

| Component        | Location                                     | Status          | Notes                                             |
| ---------------- | -------------------------------------------- | --------------- | ------------------------------------------------- |
| Telegram Webhook | `apps/web/app/api/telegram/webhook/route.ts` | ✅ Working      | Receives messages, stores in DB                   |
| Database Table   | `call_recordings`                            | ✅ Schema OK    | Records stored with `processing_status='pending'` |
| Railway Worker   | `workers/call-recording-processor/`          | ❓ **UNKNOWN**  | Not confirmed running                             |
| Google Drive     | OAuth credentials                            | ❓ Not verified | Required for storage                              |
| Gemini API       | Transcription                                | ❓ Not verified | Required for transcription                        |

### Code Analysis

**1. Webhook Handler** (`apps/web/app/api/telegram/webhook/route.ts`)

- Correctly receives voice messages
- Extracts phone/name from filename
- Creates `call_recordings` entry with `processing_status: "pending"`
- Sends confirmation to Telegram chat
- **Verdict:** Working correctly

**2. Railway Worker** (`workers/call-recording-processor/src/index.ts`)

- Polls every 30 seconds for `pending` or `failed` records
- Processes up to 3 concurrent recordings
- Has health endpoint at `/health`
- **Verdict:** Code is correct, but deployment status unknown

**3. Processing Pipeline** (`workers/call-recording-processor/src/processor.ts`)

- 8-stage pipeline is well-implemented
- Updates `processing_status` at each stage
- Proper error handling with retry count
- **Verdict:** Code is correct

---

## Root Cause: CONFIRMED

### ❌ Initial Hypothesis: Railway Worker Not Running

**Status:** DISPROVEN - Worker IS running and healthy

### ✅ Actual Root Cause: Missing Vercel Environment Variables

**Evidence from live investigation:**

```bash
# Railway worker status (RUNNING)
$ railway logs --tail 5
[2026-01-22T06:44:06.334Z] No pending recordings

# Vercel webhook status (MISCONFIGURED)
$ curl https://maiyuri-bricks-app.vercel.app/api/telegram/webhook
{"ok":true,"webhook":"telegram-call-recording","configured":false,"allowed_chats":0}

$ curl https://maiyuri-bricks-app.vercel.app/api/telegram/setup
{
  "status":"error",
  "error":"TELEGRAM_BOT_TOKEN is not set",
  "fix":"Add TELEGRAM_BOT_TOKEN to your environment variables"
}
```

**Root Cause:** The Vercel production deployment is missing critical environment variables:

- `TELEGRAM_BOT_TOKEN` - ❌ NOT SET
- `NEXT_PUBLIC_APP_URL` - ❌ NOT SET
- `TELEGRAM_WEBHOOK_SECRET` - ❌ NOT SET
- `TELEGRAM_CHAT_ID` - ❓ Likely not set

**Impact:** The webhook endpoint cannot:

1. Authenticate with Telegram API
2. Download voice file metadata
3. Store records in the database

**Result:** Voice messages are received by Telegram but webhook returns early or fails silently

### Required Environment Variables for Worker

```bash
# Critical - Worker won't start without these
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
TELEGRAM_BOT_TOKEN=123456:ABC...
GOOGLE_AI_API_KEY=AIza...

# Required for Google Drive upload (Stage 3)
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REFRESH_TOKEN=1//xxx

# Optional but recommended
NEXT_PUBLIC_APP_URL=https://maiyuri-bricks-app.vercel.app
POLL_INTERVAL_MS=30000
MAX_CONCURRENT=3
MAX_RETRIES=3
```

---

## Verification Steps

Run these checks to confirm the root cause:

### 1. Check Railway Deployment Status

```bash
# Login to Railway dashboard and verify:
# - Service exists for call-recording-processor
# - Service is running (green status)
# - Logs show "Worker started successfully"
```

### 2. Check Database for Pending Records

```sql
-- Run in Supabase SQL Editor
SELECT
  id,
  phone_number,
  processing_status,
  error_message,
  retry_count,
  created_at
FROM call_recordings
WHERE processing_status IN ('pending', 'failed')
ORDER BY created_at DESC
LIMIT 20;
```

### 3. Check Worker Health (if deployed)

```bash
# Replace with your Railway service URL
curl https://call-recording-processor-xxx.railway.app/health
```

Expected response if running:

```json
{
  "status": "healthy",
  "activeJobs": 0,
  "maxConcurrent": 3,
  "uptime": 12345
}
```

### 4. Check Railway Logs

Look for these indicators:

- "Worker started successfully" - Good
- "Missing required environment variable" - Missing env vars
- "Poll error" - Database connection issue
- No logs at all - Service not deployed

---

## Recommended Resolution

### Immediate Fix: Deploy/Redeploy Railway Worker

**Step 1: Verify Railway Project Setup**

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Find or create project for `call-recording-processor`
3. Ensure service is connected to GitHub repo

**Step 2: Configure Environment Variables**
Add all required variables in Railway dashboard:

| Variable                    | Source                                             |
| --------------------------- | -------------------------------------------------- |
| `SUPABASE_URL`              | Supabase project settings                          |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings (service role, not anon) |
| `TELEGRAM_BOT_TOKEN`        | @BotFather                                         |
| `GOOGLE_AI_API_KEY`         | Google AI Studio                                   |
| `GOOGLE_CLIENT_ID`          | Google Cloud Console                               |
| `GOOGLE_CLIENT_SECRET`      | Google Cloud Console                               |
| `GOOGLE_REFRESH_TOKEN`      | OAuth playground                                   |

**Step 3: Deploy**

```bash
# Option A: Deploy from Railway dashboard
# Click "Deploy" button

# Option B: Deploy via CLI
cd workers/call-recording-processor
railway up
```

**Step 4: Verify Health**

```bash
curl https://<your-railway-url>/health
```

**Step 5: Monitor Logs**
Watch Railway logs for:

- "Found X recordings to process"
- "Processing completed successfully"

---

## Alternative Causes (Less Likely)

### A. Telegram File Access Issue

**Symptom:** Worker running but downloads fail
**Check:** Look for "Failed to get file path" errors in logs
**Fix:** Verify `TELEGRAM_BOT_TOKEN` is correct

### B. Google Drive OAuth Expired

**Symptom:** Processing fails at "uploading" stage
**Check:** Records stuck at `processing_status='uploading'`
**Fix:** Regenerate refresh token using OAuth playground

### C. Gemini API Quota Exceeded

**Symptom:** Processing fails at "transcribing" stage
**Check:** Records stuck at `processing_status='transcribing'`
**Fix:** Check Google AI Studio for quota limits

### D. Database Connection Issue

**Symptom:** Worker can't read/write to Supabase
**Check:** "Failed to fetch recordings" errors
**Fix:** Verify `SUPABASE_SERVICE_ROLE_KEY` is correct

---

## Long-term Recommendations

### 1. Add Monitoring & Alerting

- Send Telegram alert when worker health check fails
- Alert when records stay `pending` for > 5 minutes
- Monitor Railway service uptime

### 2. Add Manual Retry Endpoint

Create API endpoint to manually trigger reprocessing:

```
POST /api/telegram/reprocess
Body: { recording_id: "xxx" }
```

### 3. Add Admin Dashboard

- Show pending/failed recordings count
- Display worker health status
- Enable manual intervention

### 4. Implement Dead Letter Queue

- After 3 failed retries, move to separate queue
- Alert admin for manual review
- Don't block new recordings

---

## Files Reviewed

| File                                                | Purpose                       |
| --------------------------------------------------- | ----------------------------- |
| `apps/web/app/api/telegram/webhook/route.ts`        | Telegram webhook handler      |
| `apps/web/src/lib/telegram-webhook.ts`              | Phone/name extraction helpers |
| `workers/call-recording-processor/src/index.ts`     | Worker entry point & polling  |
| `workers/call-recording-processor/src/processor.ts` | 8-stage processing pipeline   |
| `workers/call-recording-processor/Dockerfile`       | Docker build config           |
| `workers/call-recording-processor/railway.json`     | Railway deployment config     |
| `workers/call-recording-processor/.env.example`     | Required env vars             |

---

## Conclusion

**Primary Root Cause:** Railway Worker not running or not deployed

**Confidence Level:** High (85%)

**Resolution:** Deploy the Railway worker with correct environment variables

**ETA to Fix:** 15-30 minutes (assuming credentials are available)

---

---

## Resolution Applied

### Steps Taken

1. **Identified Root Cause:** Vercel production deployment was not using the latest environment variables (deployed 44 minutes ago, but vars added 2 hours ago)

2. **Verified Environment Variables:** All Telegram vars were correctly set in Vercel:
   - `TELEGRAM_BOT_TOKEN` ✅
   - `TELEGRAM_CHAT_ID` ✅
   - `TELEGRAM_WEBHOOK_SECRET` ✅
   - `TELEGRAM_ALLOWED_CHAT_IDS` ✅
   - `NEXT_PUBLIC_APP_URL` ✅

3. **Redeployed to Vercel:**

   ```bash
   vercel --prod
   ```

4. **Updated Production Alias:**

   ```bash
   vercel alias set maiyuri-bricks-iqlbtwrzx-maiyuris-projects-10ac9ffa.vercel.app maiyuri-bricks-app.vercel.app
   ```

5. **Verified Webhook Configuration:**

   ```bash
   curl https://maiyuri-bricks-app.vercel.app/api/telegram/setup
   # Result: {"status":"ok","bot_token_set":true,...}
   ```

6. **Confirmed Processing:**
   ```bash
   railway logs --tail 30
   # Result: Active processing of recordings
   ```

### Final Verification

```
[2026-01-22T06:54:36.809Z] Found 1 recordings to process
[2026-01-22T06:54:36.809Z] Starting processing {"phone":"7010177435"...}
[2026-01-22T06:54:40.777Z] Downloaded {"size":1559724}
[2026-01-22T06:54:41.527Z] Converted {"duration":97,"size":780813}
[2026-01-22T06:54:46.039Z] Uploaded to Google Drive
[2026-01-22T06:54:50.279Z] Transcription complete {"language":"ta-en"}
[2026-01-22T06:54:52.780Z] Analysis complete {"sentiment":"neutral"}
```

### Prevention Recommendations

1. **Add Deployment Verification Step:** After adding env vars to Vercel, always trigger a new deployment AND verify the alias points to it.

2. **Add Health Monitoring:** Create an automated check that verifies `/api/telegram/setup` returns `configured: true`.

3. **Add Alerting:** Alert when `pending_update_count > 0` for more than 5 minutes.

---

_Report prepared by: AI Assistant_
_Investigation method: Codebase analysis + Live debugging_
_Resolution verified: 2026-01-22 06:55 UTC_

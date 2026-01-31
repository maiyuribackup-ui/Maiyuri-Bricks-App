# Learnings: Telegram Webhook Pipeline Debugging

**Date:** 2026-01-31
**Issue:** Voice recordings from Telegram not being processed by AI
**Resolution Time:** ~45 minutes
**Root Causes:** Multiple cascading failures

---

## Issue Summary

Voice recordings sent to Telegram bot were not appearing in the system. Last successful recording was Jan 24 (6 days prior).

---

## Root Causes Identified

### 1. Telegram Webhook URL Was Empty
```json
{"url": "", "pending_update_count": 1}
```
**Why:** The webhook was never re-registered after some deployment or configuration change.

**Impact:** Telegram had nowhere to send voice messages.

### 2. Environment Variables Had Corrupted Values
The `.env.vercel-production` file had `\n` characters appended to values:
```
TELEGRAM_BOT_TOKEN="8234610292:AAGnUo0iPls3QHCuOuzMMudFNDACrKOuxc0\n"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGc...\n"
```

**Why:** The `vercel env pull` command or manual editing introduced newline characters.

**Impact:** Environment variables failed silently - `configured: false` in webhook response.

### 3. Secret Token Mismatch (401 Unauthorized)
Even after fixing env vars, webhook returned 401 because:
- Telegram sends `X-Telegram-Bot-Api-Secret-Token` header
- Vercel env var had wrong/corrupted value
- Mismatch caused authentication failure

### 4. Vercel Alias Not Auto-Updating
After `vercel redeploy`, the production alias didn't update automatically:
```
maiyuri-bricks-app.vercel.app → old deployment (broken)
new-deployment-url.vercel.app → new deployment (working)
```

**Why:** Redeployments create new URLs but don't always update aliases.

**Impact:** Even after fixing code, production URL served stale deployment.

### 5. Railway Worker Was Fine (Red Herring)
Initial assumption was Railway worker issue. Actually:
- Worker was healthy (35+ hours uptime)
- Polling every 30 seconds correctly
- No pending recordings because webhook wasn't delivering them

---

## Loopholes in Current Architecture

### 1. No Webhook Health Monitoring
**Problem:** No alerts when webhook stops receiving messages.

**Fix:** Add a cron job that checks:
```typescript
// Check if we received any recordings in last 24 hours
const recentCount = await supabase
  .from('call_recordings')
  .select('count')
  .gte('created_at', dayAgo);

if (recentCount === 0) {
  await sendAlert('No recordings in 24 hours - check webhook');
}
```

### 2. No Webhook Registration Verification on Deploy
**Problem:** Deployments don't verify Telegram webhook is properly configured.

**Fix:** Add post-deployment hook:
```typescript
// In deployment script or GitHub Action
async function verifyWebhook() {
  const info = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
  const { url, last_error_message } = info.result;

  if (!url || url !== EXPECTED_URL) {
    throw new Error('Webhook URL mismatch - re-register required');
  }
  if (last_error_message) {
    throw new Error(`Webhook error: ${last_error_message}`);
  }
}
```

### 3. Environment Variables Not Validated at Runtime
**Problem:** App starts with corrupted env vars, fails silently.

**Fix:** Add startup validation:
```typescript
// In webhook route or app initialization
function validateEnvVars() {
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'];

  for (const key of required) {
    const value = process.env[key];
    if (!value) throw new Error(`Missing: ${key}`);
    if (value.includes('\n')) throw new Error(`Corrupted: ${key} contains newline`);
    if (value.includes('\\n')) throw new Error(`Corrupted: ${key} contains escaped newline`);
  }
}
```

### 4. No Automatic Alias Update After Redeploy
**Problem:** `vercel redeploy` doesn't update production alias.

**Fix:** Always use `vercel --prod` for production deploys, or add alias step:
```bash
# In deployment script
vercel redeploy $DEPLOYMENT_URL
NEW_URL=$(vercel ls --json | jq -r '.[0].url')
vercel alias set $NEW_URL maiyuri-bricks-app.vercel.app
```

### 5. No End-to-End Pipeline Test
**Problem:** No automated test that sends a voice message and verifies processing.

**Fix:** Add E2E test:
```typescript
// Nightly or post-deploy test
async function testPipeline() {
  // 1. Send test voice message via Telegram API
  // 2. Wait 60 seconds
  // 3. Check call_recordings for new entry
  // 4. Verify transcription_text is populated
  // 5. Alert if any step fails
}
```

---

## Why Deployment Was Failing

| Step | Issue | Symptom |
|------|-------|---------|
| 1. Webhook URL | Empty/missing | No messages received |
| 2. Env vars | `\n` in values | `configured: false` |
| 3. Secret token | Mismatch | 401 Unauthorized |
| 4. Alias | Not updated | Stale code served |
| 5. Cache | Vercel edge cache | Old responses cached |

---

## Recommended Improvements

### Immediate Actions

1. **Add webhook health check endpoint:**
```typescript
// GET /api/telegram/health
export async function GET() {
  const webhookInfo = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
  const dbRecent = await supabase.from('call_recordings').select('count').gte('created_at', dayAgo);

  return {
    webhook_configured: !!webhookInfo.result.url,
    webhook_errors: webhookInfo.result.last_error_message,
    pending_updates: webhookInfo.result.pending_update_count,
    recordings_24h: dbRecent.count,
    status: allGood ? 'healthy' : 'unhealthy'
  };
}
```

2. **Add Telegram notification on deploy:**
```typescript
// Post-deploy hook
await sendTelegramMessage(
  `🚀 Deployment Complete\n` +
  `Version: ${version}\n` +
  `Webhook: ${webhookStatus}\n` +
  `Env vars: ${envVarsValid ? '✅' : '❌'}`
);
```

3. **Create deployment checklist script:**
```bash
#!/bin/bash
# deploy-production.sh

echo "1. Checking env vars..."
vercel env ls | grep TELEGRAM

echo "2. Deploying..."
vercel --prod

echo "3. Updating alias..."
vercel alias set $(vercel ls -1) maiyuri-bricks-app.vercel.app

echo "4. Verifying webhook..."
curl -s https://maiyuri-bricks-app.vercel.app/api/telegram/webhook

echo "5. Re-registering Telegram webhook..."
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://maiyuri-bricks-app.vercel.app/api/telegram/webhook" \
  -d "secret_token=$WEBHOOK_SECRET"

echo "6. Checking webhook status..."
curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

### Long-Term Improvements

1. **Infrastructure as Code:** Store webhook config in code, apply on deploy
2. **Monitoring Dashboard:** Grafana/Datadog for pipeline health
3. **Automated Recovery:** If webhook fails 3x, auto-re-register
4. **Env Var Validation:** CI step to validate env vars before deploy
5. **Canary Deploys:** Test on subset before full production

---

## Debugging Checklist (For Future Issues)

When voice recordings stop processing:

```
□ 1. Check Telegram webhook: GET /getWebhookInfo
     - Is URL set correctly?
     - Any errors in last_error_message?
     - pending_update_count > 0 means deliveries failing

□ 2. Check webhook endpoint: GET /api/telegram/webhook
     - configured: true?
     - allowed_chats > 0?

□ 3. Check Railway worker: GET /health
     - status: healthy?
     - activeJobs count?

□ 4. Check database: SELECT processing_status, COUNT(*) FROM call_recordings
     - Any pending/failed?
     - When was last completed?

□ 5. Check Vercel env vars: vercel env ls
     - All TELEGRAM_* vars present?
     - No corrupted values?

□ 6. Test webhook manually:
     curl -X POST https://app/api/telegram/webhook \
       -H "X-Telegram-Bot-Api-Secret-Token: $SECRET" \
       -d '{"update_id":1,"message":{...}}'
```

---

## Key Takeaways

1. **Silent failures are the worst** - Env vars with `\n` didn't throw errors, just didn't work
2. **Assume nothing** - Railway worker seemed like the issue but was actually healthy
3. **Check the full pipeline** - Issue was at the entry point (webhook), not processing
4. **Aliases matter** - Redeploying doesn't mean production is updated
5. **Monitoring is essential** - Would have caught this in hours, not days

---

## Files Changed

None - this was a configuration/deployment issue, not a code issue.

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Deployment procedures
- [OBSERVABILITY.md](./OBSERVABILITY.md) - Monitoring setup

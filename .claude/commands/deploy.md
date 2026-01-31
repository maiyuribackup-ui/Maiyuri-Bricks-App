# Safe Deploy Command

Deploy to production with all safety checks including Telegram webhook verification.

## Instructions

When the user runs /deploy, follow this safe deployment workflow:

### Pre-Deploy Checklist (MANDATORY)

1. **Quality Gates**
   ```bash
   bun run typecheck && bun run lint && bun run test
   ```
   All tests must pass before proceeding.

2. **Git Status Check**
   ```bash
   git status
   git branch --show-current
   ```
   Ensure you're on main/master with no uncommitted changes.

### Option A: Use Deploy Script (Recommended)

Run the comprehensive deploy script that handles everything:
```bash
cd /Users/ramkumaranganeshan/Documents/MB_App_1/Maiyuri-Bricks-App
./scripts/deploy-production.sh
```

The script will:
1. Validate environment variables
2. Build the project
3. Deploy to Vercel production
4. Update the production alias (CRITICAL!)
5. Re-register Telegram webhook
6. Verify health endpoint
7. Send Telegram notification

### Option B: Manual Deployment Steps

If the script isn't available or you need manual control:

#### Step 1: Build
```bash
cd apps/web
bun run build
```

#### Step 2: Deploy to Vercel
```bash
vercel --prod
```
Note the deployment URL from the output.

#### Step 3: Update Alias (CRITICAL!)
This step was missing before and caused issues:
```bash
vercel alias set <deployment-url> maiyuri-bricks-app.vercel.app
```

#### Step 4: Re-register Telegram Webhook
```bash
# Delete old webhook and pending updates
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true"

# Wait 2 seconds
sleep 2

# Register new webhook
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://maiyuri-bricks-app.vercel.app/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\"]"
```

#### Step 5: Verify Webhook
```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```
Ensure `url` matches and `last_error_message` is null.

#### Step 6: Check Health Endpoint
```bash
curl https://maiyuri-bricks-app.vercel.app/api/telegram/health
```
Should return `"status": "healthy"`.

### Post-Deploy Verification

1. **Health Check**
   ```bash
   curl https://maiyuri-bricks-app.vercel.app/api/telegram/health | jq
   ```
   Status should be "healthy" or "degraded" (not "unhealthy").

2. **Test Voice Recording** (Optional but recommended)
   - Send a test voice message to the Telegram bot
   - Check Railway worker logs for processing
   - Verify recording appears in Supabase

### Rollback

If something goes wrong:
```bash
vercel rollback
```

Then re-run the webhook registration steps.

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Secret token mismatch | Verify TELEGRAM_WEBHOOK_SECRET matches |
| Empty webhook URL | Webhook not registered | Run setWebhook API call |
| Health shows "unhealthy" | Env vars corrupted | Check Vercel env vars for `\n` characters |
| Old deployment served | Alias not updated | Run `vercel alias set` explicitly |

### Related Documentation

- [LEARNINGS_TELEGRAM_WEBHOOK.md](/docs/LEARNINGS_TELEGRAM_WEBHOOK.md) - Debugging guide
- [Health Check](/api/telegram/health) - Pipeline status endpoint

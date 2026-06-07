# Push Notifications — Operations & Runbook

How app (native) push notifications work end-to-end, why they were silently
failing, and how to verify them. **App notifications = FCM push to the Android
Capacitor app.** (Telegram notifications are a separate channel — see
`docs/Telegram_int.md`.)

## Architecture

```
Android app (Capacitor shell, loads mb.maiyuri.com)
  └─ initPushNotifications()            apps/web/src/lib/native/capacitor.ts
       ├─ createChannel("default")      high-importance + sound
       ├─ requestPermissions()          POST_NOTIFICATIONS (Android 13+)
       ├─ register() → FCM token
       └─ on "registration":
            POST /api/push/register  (Authorization: Bearer <supabase token>)
                 └─ upsert device_tokens(user_id, token, platform)

Server trigger (new lead, call analysis, nudge, test, …)
  └─ sendPushToUsers(userIds, payload)  apps/web/src/lib/push/fcm.ts
       ├─ read device_tokens for those users
       └─ FCM HTTP v1 messages:send (android.notification.channel_id="default")
            └─ device shows heads-up notification → tap deep-links via data.url
```

## Why notifications were not working (root cause)

The registration request was authenticated **cookie-only**
(`createSupabaseRouteClient` → `auth.getUser()`), but the app authenticates with
**Bearer tokens** from the Supabase JS session (cookies are not reliably present
in the Capacitor webview). The client also sent **no `Authorization` header** and
did not retry. Net effect: `/api/push/register` returned **401**, `device_tokens`
stayed empty, and every send found zero devices — so nothing was ever delivered.

### The fix (fool-proof registration)

- `/api/push/register` and `/api/push/test` now use `getUserFromRequest`
  (Bearer **or** cookie).
- The client attaches the session Bearer token and **retries with exponential
  backoff** (handles "token arrived before session was ready").
- Foreground pushes now show an in-app toast (Android suppresses the tray
  notification while the app is open).
- Server + client agree on a high-importance `"default"` channel.
- Settings → Notifications has a **"Send Test"** button + live device count.

## What triggers a push

| Event | Recipients | Source |
|-------|-----------|--------|
| New lead created | assigned rep, else founders/owners | `app/api/leads/route.ts` |
| Lead reassigned / status changed | new/current assignee | `app/api/leads/[id]/route.ts` |
| Call recording processed (incl. Telegram voice notes) | assigned rep, else founders/owners | `src/lib/call-recording/processor.ts` |
| Lead turns hot (score ≥ 80%) | assigned rep, else founders/owners | `app/api/leads/[id]/analyze/route.ts` |
| Customer responds to a Smart Quote (CTA submit) | assigned rep, else founders/owners | `app/api/sq/[slug]/submit/route.ts` |
| Production order submitted for approval | founders/owners (approvers) | `src/lib/ticket-service.ts` |
| Approval decided (approved / rejected / changes) | the requester (`created_by`) | `src/lib/ticket-service.ts` |
| Nudge digest / SalesPulse | assigned staff / configured roles | `app/api/nudges/digest`, `app/api/salespulse/send` |

Recipient resolution helpers live in `src/lib/push/fcm.ts`: `resolveLeadRecipients(assignedStaff)` (assignee → leadership fallback) and `getUserIdsByRoles(roles)`. All triggers are best-effort (swallow + log) so a push failure never breaks the request.

## Required configuration

| Where | Variable / file | Purpose |
|-------|-----------------|---------|
| Vercel env | `FCM_PROJECT_ID` | Firebase project id (`n8nworkflow-481214-9932d`) |
| Vercel env | `FCM_SERVICE_ACCOUNT_JSON` | Firebase Admin service-account JSON (one line) |
| Supabase (prod) | `device_tokens` table | migration `20260603000003_device_tokens.sql` must be applied |
| Android | `apps/mobile/android/app/google-services.json` | FCM client config (committed) |

If `FCM_PROJECT_ID` / `FCM_SERVICE_ACCOUNT_JSON` are missing, sends are a safe
no-op and the test endpoint reports `configured: false`.

> **Note:** production runs on Supabase project `yczcpacfkirkukfyptyg`. Confirm
> the `device_tokens` migration is applied there (paused projects must be
> resumed first).

## Verifying on a real device

1. Install/open the Android app and sign in.
2. Approve the notification permission prompt.
3. Go to **Settings → Notifications → Push Notifications (This Device)**.
   - It should show `1 device(s) registered`. If it shows `0`, the token did not
     register — check logcat for `push registrationError` / `register failed`.
4. Tap **Send Test** → a "🔔 Push notifications are working!" notification should
   arrive (heads-up if backgrounded, toast if foregrounded).

### Quick API checks

```bash
# status for the signed-in user (configured + device count)
curl -H "Authorization: Bearer <supabase_access_token>" \
  https://mb.maiyuri.com/api/push/test

# send a test push to your own devices
curl -X POST -H "Authorization: Bearer <supabase_access_token>" \
  https://mb.maiyuri.com/api/push/test
```

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `deviceCount: 0` | token never registered | check sign-in + permission; watch logcat during launch |
| `configured: false` | FCM env not set | set `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON` in Vercel |
| `sent: 0` despite devices | stale tokens pruned / wrong project | re-open app to re-register; confirm `FCM_PROJECT_ID` matches `google-services.json` |
| No sound / not heads-up | channel mismatch | ensure server sends `channel_id: "default"` and app created that channel |
| Works backgrounded, not foregrounded | expected on Android | foreground shows an in-app toast instead of a tray notification |
```

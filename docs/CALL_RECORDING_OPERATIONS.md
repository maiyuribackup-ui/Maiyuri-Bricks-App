# Call Recording Operations Guide

This document covers the operation and maintenance of the Telegram-based call recording intake system.

## System Overview

```
Telegram Group → Webhook (Vercel) → Queue Record → Railway Worker
                                                         ↓
                    Telegram Insights ← AI Analysis ← Gemini Transcription
                                                         ↓
                                                   Google Drive Storage
```

## Components

| Component | Hosting | Purpose |
|-----------|---------|---------|
| Webhook Handler | Vercel | Receives audio from Telegram, queues for processing |
| Processing Worker | Railway | Downloads, converts, transcribes, analyzes audio |
| Database | Supabase | Stores recording metadata and analysis results |
| Audio Storage | Google Drive | Stores converted MP3 files |

## Environment Variables

### Vercel (Web App)

```bash
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_CHAT_ID=<main-chat-id>
TELEGRAM_WEBHOOK_SECRET=<random-32-char-secret>
TELEGRAM_ALLOWED_CHAT_IDS=<comma-separated-chat-ids>
```

### Railway (Worker)

```bash
SUPABASE_URL=<supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
TELEGRAM_BOT_TOKEN=<bot-token>
GOOGLE_AI_API_KEY=<gemini-api-key>
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_REFRESH_TOKEN=<oauth-refresh-token>
NEXT_PUBLIC_APP_URL=<app-url>
POLL_INTERVAL_MS=30000
MAX_CONCURRENT=3
MAX_RETRIES=3
```

## Setup

### 1. Database Migration

Run the migration to create the `call_recordings` table:

```bash
cd supabase
supabase db push
```

### 2. Configure Telegram Webhook

Set the webhook URL using the Telegram Bot API:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.vercel.app/api/telegram/webhook",
    "secret_token": "<WEBHOOK_SECRET>",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

Verify webhook is set:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### 3. Deploy Railway Worker

1. Create a new Railway project
2. Connect to the GitHub repository
3. Set the root directory to `workers/call-recording-processor`
4. Add all required environment variables
5. Deploy

### 4. Configure Google Drive

1. Create OAuth credentials in Google Cloud Console
2. Enable the Google Drive API
3. Generate a refresh token using the OAuth playground
4. Add credentials to Railway environment

## Processing Pipeline

### Status Flow

```
pending → downloading → converting → uploading → transcribing → analyzing → completed
                                                                              ↓
                                                                           failed
```

### Recording Lifecycle

1. **Received**: Audio file sent to Telegram group
2. **Queued**: Webhook validates and creates DB record with status `pending`
3. **Processing**: Worker picks up and processes through pipeline
4. **Completed**: Insights sent to Telegram, record marked `completed`
5. **Failed**: Error stored, can be retried via admin API

## Monitoring

### Health Check

Worker health endpoint:

```bash
curl https://your-worker.railway.app/health
```

Response:
```json
{
  "status": "healthy",
  "activeJobs": 0,
  "maxConcurrent": 3,
  "uptime": 12345
}
```

### Admin API

List recordings:
```bash
GET /api/admin/call-recordings?processing_status=failed&limit=10
```

Retry failed recording:
```bash
POST /api/admin/call-recordings/{id}/retry
```

### Database Queries

Check processing stats:
```sql
SELECT processing_status, COUNT(*)
FROM call_recordings
GROUP BY processing_status;
```

Find stuck recordings:
```sql
SELECT * FROM call_recordings
WHERE processing_status NOT IN ('completed', 'failed', 'pending')
  AND updated_at < NOW() - INTERVAL '1 hour';
```

## Troubleshooting

### Common Issues

#### 1. Webhook Not Receiving Messages

- Verify webhook URL is correct: `GET /getWebhookInfo`
- Check webhook secret matches environment variable
- Ensure bot is added to the Telegram group
- Check Vercel function logs for errors

#### 2. Worker Not Processing

- Check Railway logs for errors
- Verify all environment variables are set
- Check database connectivity
- Ensure no stuck jobs (reset if needed)

#### 3. Transcription Failures

- Verify GOOGLE_AI_API_KEY is valid
- Check audio file format (must be convertible by ffmpeg)
- Check Gemini API quotas

#### 4. Google Drive Upload Failures

- Verify OAuth credentials are valid
- Check refresh token hasn't expired
- Ensure Drive API is enabled
- Check folder permissions

### Recovery Procedures

#### Reset Stuck Recording

```sql
UPDATE call_recordings
SET processing_status = 'pending',
    error_message = NULL
WHERE id = '<recording-id>';
```

#### Bulk Retry Failed Recordings

```sql
UPDATE call_recordings
SET processing_status = 'pending',
    error_message = NULL
WHERE processing_status = 'failed'
  AND retry_count < 3;
```

#### Clear Processing Queue

In case of worker restart:
```sql
UPDATE call_recordings
SET processing_status = 'pending'
WHERE processing_status IN ('downloading', 'converting', 'uploading', 'transcribing', 'analyzing');
```

## File Naming Convention

### Filename Extraction

Phone number is extracted from the filename using these patterns:
- `Superfone_9876543210_20260115.wav`
- `Call_+919876543210.wav`
- `9876543210.wav`

### Google Drive Structure

```
MaiyuriBricks_CallRecordings/
├── LeadName_9876543210/
│   ├── 2026-01-15_10-30_9876543210_original.mp3
│   └── 2026-01-16_14-45_9876543210_original.mp3
└── unmatched/
    └── 2026-01-15_11-00_8765432109_unknown.mp3
```

## Notification Format

Successful processing sends this Telegram notification:

```
📞 New Call Recording Processed

👤 Lead: Kumar Residence
📱 Phone: 9876543210
⏱️ Duration: 4:32
🟢 Sentiment: POSITIVE

📝 AI Summary:
Customer interested in 8-inch CSEB blocks for house construction.
Budget of ₹15 lakhs discussed. Ready to visit factory next week.

🟢 Positive Signals:
• Confirmed budget availability
• Interested in factory visit
• Asked about bulk pricing

🎯 Recommended Action:
• Schedule factory visit for next week
• Prepare bulk pricing quote

🔥 Conversion Score Impact: 📈 +15%

🎧 Listen to Recording
📋 View Lead
```

## Performance Tuning

### Worker Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| POLL_INTERVAL_MS | 30000 | How often to check for new recordings |
| MAX_CONCURRENT | 3 | Maximum recordings processed simultaneously |
| MAX_RETRIES | 3 | Maximum retry attempts for failed recordings |

### Scaling Recommendations

- **Low volume** (<50 calls/day): Default settings work well
- **Medium volume** (50-200 calls/day): Increase MAX_CONCURRENT to 5
- **High volume** (>200 calls/day): Consider multiple worker instances

## Security Considerations

1. **Webhook Security**: Always use secret token for webhook verification
2. **Chat Whitelist**: Only allow specific Telegram chat IDs
3. **Service Role Key**: Keep Supabase service role key secure
4. **Google OAuth**: Use minimal scopes for Drive access
5. **RLS Policies**: Database has row-level security enabled

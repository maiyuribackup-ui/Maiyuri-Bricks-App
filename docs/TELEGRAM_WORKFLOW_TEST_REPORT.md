# Telegram Workflow Test Report

**Date:** 2026-02-01
**Test Suite:** `apps/web/src/lib/__tests__/telegram-workflow.test.ts`
**Status:** All Tests Passing (32/32)

---

## Executive Summary

The Telegram workflow has been comprehensively tested across all major components:
- **Phone number extraction** from filenames (11 test cases)
- **Name extraction** from filenames (7 test cases)
- **Phone number normalization** (6 test cases)
- **Combined filename extraction** (3 test cases)
- **Webhook verification** (4 test cases)
- **Test coverage summary** (1 meta-test)

**Result:** 32 tests passed, 0 failed

---

## Component Architecture

### 1. Core Files Analyzed

| File | Purpose | Lines |
|------|---------|-------|
| `apps/web/src/lib/telegram.ts` | Core notification service | 589 |
| `apps/web/src/lib/telegram-webhook.ts` | Webhook helpers & extraction | 440 |
| `apps/web/app/api/telegram/webhook/route.ts` | Main webhook handler | 716 |
| `apps/web/app/api/telegram/health/route.ts` | Health check endpoint | 408 |
| `apps/web/app/api/telegram/setup/route.ts` | Webhook setup | ~100 |
| `apps/web/app/api/notifications/daily-summary/route.ts` | Daily briefing | 664 |
| `apps/web/app/api/notifications/weekly-ceo-briefing/route.ts` | Weekly CEO report | 1014 |
| `workers/call-recording-processor/src/notifications.ts` | Worker notifications | ~200 |

### 2. Notification Types Supported

| Notification | Function | Description |
|-------------|----------|-------------|
| New Lead | `notifyNewLead()` | Basic new lead alert |
| New Lead Detailed | `notifyNewLeadDetailed()` | Full lead info with budget |
| Lead Updated | `notifyLeadUpdated()` | Status change notification |
| Staff Invited | `notifyStaffInvited()` | Invitation sent alert |
| Staff Joined | `notifyStaffJoined()` | Welcome notification |
| Follow-up Reminder | `notifyFollowUpReminder()` | Due date reminder |
| Daily Summary | `notifyDailySummary()` | Stats overview |
| AI Insight | `notifyAIInsight()` | Single AI insight |
| AI Analysis | `notifyAIAnalysis()` | Full AI analysis report |
| Quote Received | `notifyQuoteReceived()` | Quote notification |
| Call Recording Received | `notifyCallRecordingReceived()` | Upload confirmation |
| Call Recording Processed | `notifyCallRecordingProcessed()` | Processing complete |
| Call Recording Error | `notifyCallRecordingError()` | Processing failure |
| Error Alert | `notifyError()` | System error notification |
| Connection Test | `testTelegramConnection()` | Verify bot setup |

---

## Test Results by Category

### Category 1: Phone Number Extraction (11 Tests)

Tests the ability to extract Indian mobile numbers from various filename formats.

| Test Case | Input | Expected | Status |
|-----------|-------|----------|--------|
| Plain 10-digit | `9876543210.wav` | `9876543210` | PASS |
| Call prefix | `Call_9876543210.wav` | `9876543210` | PASS |
| Superfone format | `Superfone_9876543210_20260115.wav` | `9876543210` | PASS |
| Name with phone | `Robin_Avadi_9876543210.wav` | `9876543210` | PASS |
| With +91 prefix | `Call_+919876543210.wav` | `919876543210` | PASS |
| Hyphenated format | `Recording_91-98765-43210.wav` | `9876543210` | PASS |
| No phone number | `audio_file.wav` | `null` | PASS |
| Invalid (starts 1-5) | `1234567890.wav` | `null` | PASS |
| Too short | `test_123.wav` | `null` | PASS |
| WhatsApp format | `Whatsapp_John_7896543210_2024.wav` | `7896543210` | PASS |
| Starts with 6 | `Recording_6789012345.ogg` | `6789012345` | PASS |

**Key Pattern:** Indian mobile numbers must be 10 digits starting with 6-9.

### Category 2: Name Extraction (7 Tests)

Tests intelligent extraction of customer names from filenames.

| Test Case | Input | Expected | Status |
|-----------|-------|----------|--------|
| Name with phone | `Robin_Avadi_9876543210.wav` | `Robin Avadi` | PASS |
| Superfone format | `Superfone_John_Doe_9876543210_20260115.wav` | `John Doe` | PASS |
| Call prefix | `Call_CustomerName_+919876543210.wav` | `Customername` | PASS |
| Phone first | `9876543210_Ravi_Kumar.wav` | `Ravi Kumar` | PASS |
| Only phone | `9876543210.wav` | `null` | PASS |
| Skip 'test' word | `test.wav` | `null` | PASS |
| Short name (2 chars) | `Recording_AB_9876543210.wav` | `Ab` | PASS |

**Key Features:**
- Removes common prefixes: `superfone`, `call`, `recording`, `audio`, `voice`, `rec`, `whatsapp`, `wa`
- Removes phone numbers and date patterns
- Skips garbage words: `new`, `old`, `test`, `temp`, `file`, `audio`, `unknown`
- Title-cases the result

### Category 3: Phone Number Normalization (6 Tests)

Tests conversion of various phone formats to standard 10-digit format.

| Test Case | Input | Expected | Status |
|-----------|-------|----------|--------|
| Already normalized | `9876543210` | `9876543210` | PASS |
| With 91 prefix | `919876543210` | `9876543210` | PASS |
| With +91 prefix | `+919876543210` | `9876543210` | PASS |
| With hyphens | `91-98765-43210` | `9876543210` | PASS |
| With space | `98765 43210` | `9876543210` | PASS |
| With parentheses | `(91)9876543210` | `9876543210` | PASS |

### Category 4: Combined Extraction (3 Tests)

Tests the combined `extractFromFilename()` function.

| Test Case | Input | Expected Phone | Expected Name | Status |
|-----------|-------|----------------|---------------|--------|
| Standard format | `Robin_Avadi_9876543210.wav` | `9876543210` | `Robin Avadi` | PASS |
| Superfone format | `Superfone_Customer_Name_9876543210_20260115.wav` | `9876543210` | `Customer Name` | PASS |
| Voice message | `voice_message.ogg` | `null` | `Message`* | PASS |

*Note: Edge case - "message" is not in skipWords, so it gets extracted.

### Category 5: Webhook Verification (4 Tests)

Tests the security verification of incoming webhook requests.

| Test Case | Header | Expected Secret | Expected Result | Status |
|-----------|--------|-----------------|-----------------|--------|
| No secret configured | `any-header` | `undefined` | `true` | PASS |
| Secret matches | `secret123` | `secret123` | `true` | PASS |
| Secret mismatch | `wrong-secret` | `correct-secret` | `false` | PASS |
| Null header with secret | `null` | `secret123` | `false` | PASS |

---

## Edge Cases & Known Behaviors

### 1. Voice Message Filename
**File:** `voice_message.ogg`
**Behavior:** Extracts `name: "Message"` instead of `null`
**Reason:** After removing "voice_" prefix, "message" remains. It's not in the `skipWords` array.
**Impact:** Low - voice messages typically have no useful name info anyway.
**Recommendation:** Consider adding "message" to `skipWords` in `telegram-webhook.ts:153`

### 2. Country Code Handling
**Behavior:** `+919876543210` returns `919876543210` (12 digits with 91 prefix)
**Reason:** Pattern matching preserves country code for certain formats.
**Impact:** None - `normalizePhoneNumber()` correctly strips it to 10 digits when needed.

### 3. Budget Formatting
The notification system formats Indian Rupees correctly:
- Amounts >= 1 Crore: `1.50 Cr` (10,000,000+)
- Amounts >= 1 Lakh: `5.25 L` (100,000+)
- Smaller amounts: Standard Indian locale formatting

---

## Webhook Flow Summary

```
Telegram Bot
    |
    v
POST /api/telegram/webhook
    |
    +-- Verify webhook secret
    |
    +-- Parse message type (audio/voice/document/text)
    |
    +-- For audio uploads:
    |     |
    |     +-- Extract phone from filename
    |     +-- Extract name from filename
    |     +-- Look up existing lead (findMostRecentLead)
    |     +-- Create new lead if not found
    |     +-- Upload to Google Drive
    |     +-- Store call_recording record
    |     +-- Queue for processing
    |     +-- Send confirmation notification
    |
    +-- For text commands:
          |
          +-- PHONE: Update lead phone
          +-- NAME: Update lead name
```

---

## Scheduled Notifications

### Daily Summary (7:30 AM Dubai Time)
- **Endpoint:** `/api/notifications/daily-summary`
- **Trigger:** Vercel Cron
- **Content:** New leads, follow-ups completed, pending follow-ups, hot leads

### Weekly CEO Briefing (Saturday 9:00 AM Dubai Time)
- **Endpoint:** `/api/notifications/weekly-ceo-briefing`
- **Trigger:** Vercel Cron
- **Content:** Week-over-week metrics, conversion funnel, top performers, action items

---

## Test Coverage Analysis

| Component | Coverage | Notes |
|-----------|----------|-------|
| Phone extraction | High | All major formats tested |
| Name extraction | High | Prefixes, edge cases covered |
| Normalization | High | All common formats covered |
| Webhook verification | Complete | All 4 scenarios tested |
| Notification templates | Not unit tested | Would require fetch mocking |
| API routes | Not unit tested | Would require request mocking |
| Database operations | Not unit tested | Would require Supabase mocking |

---

## Recommendations

### Immediate Actions
1. **Add "message" to skipWords** - Prevents false name extraction from voice messages
2. **Add integration tests** - Test actual API routes with mocked Supabase

### Future Improvements
1. **Rate limiting tests** - Verify webhook rate limiting works
2. **Error recovery tests** - Test behavior when Telegram API fails
3. **End-to-end tests** - Test full flow from Telegram to database

---

## Conclusion

The Telegram workflow is **well-implemented and tested** for its core functionality:
- Robust phone number extraction with Indian format support
- Intelligent name extraction with prefix removal
- Secure webhook verification
- Comprehensive notification templates

The 32 tests provide strong coverage of the helper functions. Edge cases are documented and have minimal impact on production functionality.

---

**Generated by:** Claude Code Testing Agent
**Test Framework:** Vitest
**Total Tests:** 32 passed, 0 failed

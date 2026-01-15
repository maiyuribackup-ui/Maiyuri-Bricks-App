# Maiyuri Bricks – Telegram-Based Call Recording Intake & Auto-Analysis

## Product Requirements Document (PRD v1.1)

---

## 1. Product Vision

> **Turn every sales call into structured intelligence automatically — without asking staff to do extra work.**

This system removes friction in uploading Superfone call recordings and makes transcription + AI analysis the default behavior.

---

## 2. Problem Statement

* Sales calls are recorded in Superfone but require **manual download and upload** into the Maiyuri Bricks app.
* Staff often skip this step due to friction.
* Missing recordings = no transcripts, no insights, no learning loop.

---

## 3. Goal & Success Metrics

### Goals

* Make recording upload **near-zero effort** for staff.
* Ensure **automatic transcription and AI analysis** for every uploaded call.
* Improve sales quality through instant AI feedback.

### Success Metrics

* > 90% of sales calls have recordings attached
* > 80% of leads have transcripts + AI insights
* <30 seconds staff effort per upload
* Staff compliance becomes default, not enforced manually

---

## 4. Scope & Non-Goals

### In Scope

* Telegram-based audio ingestion
* Automatic lead mapping
* Google Drive storage
* Gemini transcription
* Auto-triggered AI analysis
* Telegram feedback to staff & owner

### Out of Scope

* Replacing Superfone (future phase)
* Direct Superfone API ingestion (not available)

---

## 5. User Personas

* **Sales Staff**: Upload call recordings quickly
* **Owner/Admin**: Monitor calls, insights, and staff performance
* **Ops/Admin**: Handle failures and remapping

---

## 6. Finalized User Flow

### Staff Flow (Telegram Group)

1. Staff shares Superfone `.wav` audio file into a **designated Telegram group**.
2. No commands or typing required.
3. Bot responds with:

   * Lead identified
   * Transcription in progress
   * AI insights summary

### Owner Flow

* Owner is part of the same Telegram group.
* Receives transcript + AI insights automatically.
* Full details available inside Maiyuri Bricks app.

---

## 7. System Architecture Overview

### Hosting Strategy (Locked)

* **Vercel**: Maiyuri Bricks web app, dashboards, thin API endpoints (lead CRUD, auth)
* **Railway**: Persistent background worker for audio ingestion, processing, transcription, analysis, and Telegram notifications

This separation ensures reliability for CPU- and I/O-heavy workloads while keeping the frontend fast and scalable.

### Architecture Flow

```
Telegram Group
   ↓
Telegram Bot Webhook (Railway)
   ↓
Extract phone number from FILE NAME
   ↓
Map to most recent lead
   ↓
Download WAV from Telegram (files <10MB)
   ↓
Convert WAV → MP3 (standardized)
   ↓
Upload MP3 to Google Drive (Lead-wise folder)
   ↓
Save metadata in DB (shared with app)
   ↓
Trigger Gemini Transcription
   ↓
Auto-trigger AI Analysis
   ↓
Push Insights to Telegram + App
```

---

## 8. Telegram Ingestion Requirements

### Group Configuration

* Bot listens only to **whitelisted Telegram Group ID**.
* Accepts messages only from approved Telegram user IDs.

### Supported Inputs

* Audio file (`.wav` – primary)
* Audio sent as document

### Ignored Inputs

* Text-only messages
* Images or videos

---

## 9. Phone Number Detection & Lead Mapping

### Detection Rule (Strict)

* Phone number is extracted **only from the file name**.
* Examples:

  * `Superfone_9876543210_20260115.wav`
  * `Call_+919876543210.wav`

### Normalization

* Remove `+`, spaces, `-`
* Convert `+91XXXXXXXXXX` → `XXXXXXXXXX`

### Mapping Logic

* Find leads matching the phone number
* If multiple leads exist, select the **most recently updated lead**

### Failure Handling

* If phone number not detected:

  > ❌ Phone number not found in file name. Please rename file as `Call_<PhoneNumber>.wav` and resend.

---

## 10. Audio Handling & Normalization (Critical)

### Accepted Formats

* `.wav` (Superfone default, typical size <10MB)
* `.mp3`, `.m4a` (future-proofing)

### Telegram File Size Assumption

* Typical Superfone recordings are **under 10MB**
* Standard Telegram Bot API download (`getFile`) is sufficient
* No local Bot API server required in current scope

### Internal Canonical Format

* **MP3, 16 kHz, mono, 64–96 kbps**

### Audio Processing Flow

1. Download `.wav` from Telegram
2. Validate audio header (RIFF, duration, codec)
3. Convert WAV → MP3 using ffmpeg
4. Normalize audio for speech recognition
5. Upload MP3 to Google Drive

### Storage Rule

* Only the **converted MP3** is stored permanently
* Original WAV may be temporarily cached (≤24h) for debugging

### Failure Handling

* Corrupted or invalid WAV → reject early
* Conversion failure → retry + notify staff

---

## 11. Google Drive Storage Structure

```
/Superfone Recordings/
   └── <LeadName>_<PhoneNumber>/
         └── YYYY-MM-DD_HH-MM_<StaffName>.mp3
```

### Metadata Stored

* lead_id
* staff_id
* telegram_message_id
* original_file_name
* original_format = wav
* converted_format = mp3
* drive_file_id
* duration
* upload_timestamp
* conversion_status

---

## 12. Transcription (Gemini)

* Triggered automatically after MP3 upload
* Always runs on normalized MP3
* Stores:

  * transcript_text
  * detected_language
  * confidence_score (if available)

---

## 13. Auto-Analysis (Mandatory)

* Analysis is **auto-triggered after transcription**
* Manual "Analyze" button is bypassed for Telegram uploads

### AI Insights Generated

* Complaints
* Negative feedback
* Negotiation signals
* Price expectations
* Positive buying signals
* Recommended next actions

---

## 14. Telegram Feedback Loop

### Status Updates

1. **Upload Confirmation**

   > 📞 Call received | Lead identified | Saved to Drive

2. **Transcription Update**

   > 📝 Transcription completed

3. **AI Insights Summary**

   ```
   🧠 AI Call Insights – <Lead Name>

   🔴 Concerns:
   • ...

   🟡 Negotiation Signals:
   • ...

   🟢 Positive Signals:
   • ...

   🎯 Recommended Action:
   • ...
   ```

Insights are sent to **both staff and owner** in the same group.

---

## 15. App-Side Behavior

* Lead timeline auto-populated with:

  * Audio player
  * Transcript
  * AI insight boxes
* Source tagged as: `Telegram – Superfone`

---

## 16. Compliance & Enforcement

### Soft Enforcement

* Leads without recordings show **“Recording missing”** badge
* Owner dashboard shows % compliance per staff

### Hard Enforcement (Optional – Phase 2)

* Lead cannot move to next stage without recording or admin override

---

## 17. Edge Cases & Safeguards

| Scenario             | Behavior                 |
| -------------------- | ------------------------ |
| Duplicate upload     | Detect via hash → ignore |
| Wrong lead mapping   | Admin remap              |
| Telegram outage      | Retry webhook            |
| Drive upload failure | Retry queue              |
| Large files          | Enforce size limit       |

---

## 18. Phased Rollout

### Phase 1 – Core Value (Current Scope)

* Telegram group ingestion (Bot API, files <10MB)
* WAV → MP3 normalization on Railway worker
* Lead mapping (most recent)
* Google Drive lead-wise storage
* Gemini transcription
* Auto-analysis
* Telegram insights to staff + owner

### Phase 2 – Control & Metrics

* Admin inbox
* Compliance dashboards
* Daily missing-upload summary

### Phase 3 – Strategic Upgrade

* API-based telephony
* Optional local Telegram Bot API server (only if file sizes grow)
* Zero-download future state

---

## 19. Design Principles (Non-Negotiable)

* Telegram is a **dumb pipe**
* Backend owns normalization & intelligence
* AI insights are **automatic**, not optional
* Systems shape behavior, not reminders

---

**End of PRD v1.1**

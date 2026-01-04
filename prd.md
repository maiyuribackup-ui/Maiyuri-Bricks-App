Maiyuri Bricks AI – Lead Management App

PRD for Claude Code Development

1. Project Overview

Objective: Build an AI-powered lead management system for Maiyuri Bricks that is mobile-first, web-accessible, and fully AI-enabled, allowing tracking, summarization, actionable insights, accountability, and coaching for staff.

Primary Goals:

Track leads with full transparency and accountability

Generate AI-driven summaries, highlights, and suggestions

Maintain knowledgebase of lead interactions

Provide staff coaching and performance insights

Integrate audio transcription and embeddings for conversation notes

Users / Roles:

Role	Access / Permissions
Founder (Ram)	Full access: view all leads, assign tasks, add/edit notes, approve AI suggestions, see performance analytics, notifications
Accountant (Kavitha)	Add/update notes, upload recordings, view assigned leads, AI suggestions
Engineer (Srinivasan)	Add/update notes, upload recordings, view assigned leads, AI suggestions
2. Tech Stack

Front-end:

Framework: React 18 + Next.js 14

Styling: Tailwind CSS + Design Tokens

State Management: Zustand (global state)

Data Fetching: TanStack Query

Charts & Dashboards: Recharts / ApexCharts

Forms: React Hook Form + Zod validation

Back-end:

Database & Auth: Supabase (PostgreSQL, Auth, Storage)

File Storage: Supabase Storage (for audio files)

API Layer: Supabase Functions / Next.js API routes

AI / ML:

Gemini 2.5 Flash:

STT (speech-to-text) for uploaded recordings

Embeddings for knowledgebase retrieval

Large context window for multi-day notes

Claude Code:

Agent orchestration, tool calls, workflows, prompt execution

Subagents for note summarization, lead scoring, coaching, and report generation

Integrations:

Telegram (daily report, notifications)

Superfone (manual audio upload, future automation)

Deployment:

Hosting: Vercel / Supabase hosted functions

CI/CD: GitHub Actions / Bun build & tests

3. Key Modules & Features
3.1 Lead Module

Purpose: Track all leads, assign responsibility, capture notes and conversations.
Features:

Add new lead (Name, Contact, Source, Lead Type, Assign Staff)

Multi-day follow-up notes (text + audio + attachments)

Timeline view of notes per lead

Assign next action / follow-up date

Lead status tracking (New / Follow-up / Hot / Cold)

AI-generated summary & highlights from all notes

AI-derived lead score & confidence rating

Notifications for pending actions

Claude Code Agents:

LeadManager Agent: CRUD operations, follow-up assignment, timeline management

AI Summarizer Agent: Generates note summaries, highlights, AI score, and action points

3.2 Notes & Conversation Module

Purpose: Capture all conversation data for leads (manual or audio).
Features:

Upload audio (STT via Gemini)

Add text notes (manual or AI-processed)

AI suggestion panel for answers or actions

Multiple entries per lead by date

AI summarization per note & cumulative summary

Confidence scoring for staff response

Claude Code Agents:

NotesAgent: Handles note ingestion, validation, storage

TranscriptionAgent: Converts audio to text, stores transcription

KnowledgebaseAgent: Maintains knowledgebase, context retrieval, AI suggestions

3.3 AI Knowledgebase Module

Purpose: Store, retrieve, and update lead Q&A knowledgebase for AI assistance.
Features:

Context-aware retrieval (based on lead queries)

Dynamic updating with new questions/answers

Confidence scoring per entry

Suggest actionable responses to staff

Claude Code Agents:

KnowledgeAgent: Manages embeddings, retrieval, confidence scoring

SuggestionAgent: Provides recommended actions for staff and founder

3.4 Dashboard Module

Purpose: Visualize leads, performance, and AI insights.
Features:

Lead summary cards with AI highlights & confidence scores

Staff performance metrics (coaching, trends, task completion)

Graphs for conversion trends & lead follow-ups

Notifications and AI suggestions panel

Exportable reports (Telegram, CSV, PDF)

Claude Code Agents:

DashboardAgent: Aggregates lead & staff data, prepares visualizations

ReportAgent: Generates downloadable or Telegram-friendly reports

3.5 AI Agent Module

Purpose: Core orchestrator for AI functionality.
Features:

Conversational agent (context-aware, multi-day, Tamil supported)

Auto-summarization of multiple notes

Suggest next actions based on knowledgebase & lead history

Staff coaching & trend insights

Confidence scoring for staff and lead conversion

Claude Code Subagents:

SummarizationAgent: Multi-note summarization

ScoringAgent: Lead conversion probability calculation

CoachingAgent: Staff performance & trend feedback

NotificationAgent: Sends Telegram alerts & in-app notifications

3.6 Reporting Module

Purpose: Provide actionable insights to founder and staff.
Features:

Daily summary of pending tasks

Lead status overview

Staff activity & conversion report

Trend & coaching insights

Export to Telegram, CSV, or PDF

Claude Code Agents:

ReportAgent: Collates data and formats reports

NotificationAgent: Sends notifications via chosen channels

4. Data Model & Persistence

Lead Table:

id, name, contact, source, lead_type, assigned_staff, status, created_at, updated_at

Note Table:

id, lead_id, staff_id, text, audio_url, transcription_text, date, ai_summary, confidence_score

Knowledgebase Table:

id, question_text, answer_text, embeddings, confidence_score, last_updated

AI State & Memory:

Store embeddings & multi-day context

Track AI suggestions, summaries, scores

Maintain conversation history for context-aware reasoning

5. UI / UX Requirements

Design Principles:

Mobile-first, responsive web

Minimalist & clean layout

Card/timeline-based notes visualization

AI highlights with color-coded confidence

Swipe gestures for lead status change

Pull-to-refresh dashboard & notes

Core Components:

Lead Cards (status, last note, AI summary)

Timeline Notes View (multi-day, audio + text)

Action Buttons (Add Note, Assign Task, Upload Audio)

AI Suggestion Panel

Performance Analytics Graphs

Export / Notifications panel

6. Claude Code Workflow

Root Agent: LeadManagementAgent

Orchestrates all modules & subagents

Subagents:

Agent	Role
LeadManager	CRUD leads, assign tasks
NotesAgent	Ingest & manage notes
TranscriptionAgent	Convert audio → text via Gemini
KnowledgeAgent	Manage embeddings, Q&A retrieval
SuggestionAgent	Recommend actions & responses
SummarizationAgent	Multi-note AI summary
ScoringAgent	Lead conversion probability
CoachingAgent	Staff performance insights
DashboardAgent	Aggregate data, render dashboards
ReportAgent	Generate reports & notifications
NotificationAgent	Send notifications via Telegram & in-app

Workflow Hooks:

PreToolUse: Validate inputs, check for duplicates

PostToolUse: Auto-run summarization, update dashboard, recalc confidence score

Notification: Send Telegram updates & in-app alerts

7. Integration Points

Supabase: Auth, Database, Storage, Functions

Gemini 2.5 Flash: STT + embedding retrieval

Telegram: Daily/real-time notifications

Manual Audio Upload (Superfone): For STT processing

8. Testing Requirements

Unit tests for all business logic (Vitest)

Integration tests for API endpoints and database operations

E2E tests for lead creation → notes → AI suggestions → dashboard flow (Playwright)

Pre-PR hooks: linting, type-check, tests, formatting

9. Deployment & CI/CD

Root: GitHub repo with monorepo structure

CI/CD: GitHub Actions

Commands: bun build, bun test, bun typecheck, bun lint

Deployment: Vercel (front-end) + Supabase Functions

10. Future Enhancements (Phase 2+)

Superfone integration for automatic audio ingestion

AI coaching notifications based on staff trends

Enhanced multi-language support (Tamil + English)

Predictive lead scoring using ML trends
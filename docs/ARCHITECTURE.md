# Maiyuri Bricks AI Lead Management - Architecture Documentation

> Last Updated: January 2026

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [AI Agents System](#4-ai-agents-system)
5. [Features Inventory](#5-features-inventory)
6. [API Endpoints](#6-api-endpoints)
7. [Database Schema](#7-database-schema)
8. [Security & Authentication](#8-security--authentication)
9. [Deployment & Infrastructure](#9-deployment--infrastructure)

---

## 1. Project Overview

### Mission

Maiyuri Bricks AI Lead Management is an AI-powered lead management and architectural design system for a brick manufacturing business. It combines intelligent lead tracking with automated floor plan generation.

### Core Value Propositions

| Capability                        | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| **AI-Powered Lead Intelligence**  | Scoring, summarization, and actionable suggestions for sales leads |
| **Intelligent Floor Plan Design** | Eco-friendly, Vastu-compliant automated architectural design       |
| **Sales Team Enablement**         | Kanban workflow, task tracking, performance coaching               |
| **Knowledge Management**          | Centralized searchable knowledge base with Q&A                     |
| **CRM Integration**               | Seamless Odoo synchronization                                      |
| **Team Collaboration**            | Multi-user workspace with notifications                            |
| **Analytics & Reporting**         | Real-time dashboards and custom reports                            |

### System Highlights

- **18 AI Agents**: 6 for lead analysis, 12 for floor plan generation
- **40+ Features**: Comprehensive lead management and design tools
- **70+ API Endpoints**: Full REST API coverage
- **Bilingual Support**: English and Tamil interfaces
- **PWA Ready**: Offline-capable Progressive Web App

---

## 2. Technology Stack

### Frontend

| Technology      | Version | Purpose                         |
| --------------- | ------- | ------------------------------- |
| Next.js         | 14.2.21 | React framework with App Router |
| React           | 18.3.1  | UI component library            |
| TypeScript      | 5.7.2   | Type-safe JavaScript            |
| Tailwind CSS    | 3.4.17  | Utility-first CSS framework     |
| Zustand         | 5.0.2   | Global state management         |
| TanStack Query  | 5.62.8  | Server state & caching          |
| React Hook Form | 7.54.2  | Form state management           |
| Zod             | 3.24.1  | Schema validation               |
| Recharts        | 2.15.0  | Data visualization              |
| Lucide React    | 0.562.0 | Icon library                    |
| date-fns        | 4.1.0   | Date manipulation               |
| @dnd-kit        | 6.3.1   | Drag-and-drop functionality     |

### Backend

| Technology         | Version | Purpose                     |
| ------------------ | ------- | --------------------------- |
| Next.js API Routes | 14.2.21 | Serverless API endpoints    |
| Bun                | Latest  | Runtime & package manager   |
| Turbo              | 2.0.0   | Monorepo task orchestration |
| TypeScript         | 5.7.2   | Type-safe backend code      |

### Database & Storage

| Technology          | Purpose                            |
| ------------------- | ---------------------------------- |
| Supabase PostgreSQL | Primary relational database        |
| Supabase Storage    | File uploads (floor plans, images) |
| Supabase Auth       | Authentication & user management   |
| 24 Migration Files  | Version-controlled schema changes  |

### AI/ML Services

| Service              | Model                      | Purpose                                   |
| -------------------- | -------------------------- | ----------------------------------------- |
| **Anthropic Claude** | claude-sonnet-4-20250514   | Reasoning, analysis, scoring, suggestions |
| **Google Gemini**    | gemini-2.5-flash           | Speech-to-text, embeddings (768-dim)      |
| **Google Gemini**    | gemini-2.5-pro             | Knowledge base Q&A with thinking          |
| **Google Gemini**    | gemini-3-pro-image-preview | 4K image generation (floor plans)         |
| **OpenAI**           | gpt-4o                     | Tertiary fallback                         |

### External Integrations

| Integration        | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| **Telegram Bot**   | Lead notifications, AI analysis alerts, **call recording intake** |
| **Odoo CRM**       | Two-way lead synchronization                                      |
| **Resend**         | Transactional email service                                       |
| **Railway Worker** | Background processing for call recordings                         |
| **Google Drive**   | Audio file storage for processed recordings                       |

### Development Tools

| Tool       | Version | Purpose         |
| ---------- | ------- | --------------- |
| Vitest     | 2.1.8   | Unit testing    |
| Playwright | 1.57.0  | E2E testing     |
| ESLint     | 9.17.0  | Code linting    |
| Prettier   | 3.0.0   | Code formatting |

---

## 3. Architecture Overview

### Monorepo Structure

```
maiyuri-bricks-app/
├── apps/
│   ├── web/                    # Next.js 14 frontend
│   │   ├── app/                # App Router (pages & API routes)
│   │   │   ├── (auth)/         # Authentication pages
│   │   │   ├── (dashboard)/    # Protected dashboard pages
│   │   │   └── api/            # API route handlers
│   │   ├── src/
│   │   │   ├── components/     # React components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Utilities & services
│   │   │   ├── stores/         # Zustand state stores
│   │   │   └── types/          # TypeScript definitions
│   │   └── tests/              # E2E tests (Playwright)
│   │
│   └── api/                    # Backend logic layer
│       └── src/
│           ├── agents/         # AI Agent orchestration
│           │   ├── planning/   # 12-agent floor plan pipeline
│           │   ├── lead-manager/
│           │   ├── scoring/
│           │   ├── suggestion/
│           │   ├── summarization/
│           │   ├── notifications/
│           │   └── reporting/
│           ├── cloudcore/      # Backend infrastructure
│           │   ├── kernels/    # Agent implementations
│           │   ├── services/   # Core services (AI, DB)
│           │   ├── routes/     # HTTP handlers
│           │   └── contracts/  # Zod schemas
│           └── services/       # Utility services
│
├── packages/
│   ├── shared/                 # Shared types & utilities
│   └── ui/                     # Shared UI components
│
├── services/
│   └── auth/                   # Authentication service
│
├── supabase/
│   └── migrations/             # 24 SQL migration files
│
└── docs/                       # Documentation
```

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────────────┤
│  Browser (Next.js App Router)                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Dashboard  │  │    Leads     │  │ Floor Plan   │                  │
│  │   Analytics  │  │  Management  │  │   Designer   │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│         ↓                  ↓                  ↓                         │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  State: Zustand (auth, UI)  |  TanStack Query (server data) │       │
│  └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Next.js API Routes (Serverless Functions)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  /api/leads  │  │/api/planning │  │  /api/kpi    │                  │
│  │  /api/notes  │  │ /api/image   │  │/api/coaching │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│         ↓                  ↓                  ↓                         │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │                    CloudCore Backend                         │       │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐ │       │
│  │  │  Kernels  │  │ Services  │  │  Routes   │  │Contracts │ │       │
│  │  └───────────┘  └───────────┘  └───────────┘  └──────────┘ │       │
│  └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   AI SERVICES        │ │    DATABASE      │ │  INTEGRATIONS    │
├──────────────────────┤ ├──────────────────┤ ├──────────────────┤
│ ┌──────────────────┐ │ │                  │ │ ┌──────────────┐ │
│ │ Anthropic Claude │ │ │    Supabase      │ │ │   Telegram   │ │
│ │  (Analysis, AI)  │ │ │   PostgreSQL     │ │ │    Bot       │ │
│ └──────────────────┘ │ │                  │ │ └──────────────┘ │
│ ┌──────────────────┐ │ │   ┌──────────┐   │ │ ┌──────────────┐ │
│ │  Google Gemini   │ │ │   │  Tables  │   │ │ │   Odoo CRM   │ │
│ │ (STT, Images)    │ │ │   │  RLS     │   │ │ │   (Sync)     │ │
│ └──────────────────┘ │ │   │  Storage │   │ │ └──────────────┘ │
│ ┌──────────────────┐ │ │   └──────────┘   │ │ ┌──────────────┐ │
│ │  OpenAI (GPT-4)  │ │ │                  │ │ │    Resend    │ │
│ │   (Fallback)     │ │ │                  │ │ │   (Email)    │ │
│ └──────────────────┘ │ │                  │ │ └──────────────┘ │
└──────────────────────┘ └──────────────────┘ └──────────────────┘
```

### Data Flow Pattern

```
Request Flow:
┌────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser  │────▶│  API Route      │────▶│  CloudCore      │
│  (Client)  │     │  (Validation)   │     │  (Logic)        │
└────────────┘     └─────────────────┘     └─────────────────┘
                           │                       │
                           ▼                       ▼
                   ┌─────────────────┐     ┌─────────────────┐
                   │   Supabase      │◀────│  AI Service     │
                   │   (Persist)     │     │  (Process)      │
                   └─────────────────┘     └─────────────────┘
```

### Sequence Diagrams

#### Lead Analysis Flow

```
┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Browser │     │  API Route  │     │Lead Manager │     │   Claude    │     │  Supabase   │
└────┬─────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
     │                  │                   │                   │                   │
     │  POST /leads/    │                   │                   │                   │
     │  [id]/analyze    │                   │                   │                   │
     │─────────────────▶│                   │                   │                   │
     │                  │                   │                   │                   │
     │                  │  Fetch lead +     │                   │                   │
     │                  │  notes            │                   │                   │
     │                  │───────────────────────────────────────────────────────────▶
     │                  │                   │                   │                   │
     │                  │◀──────────────────────────────────────────────────────────│
     │                  │                   │                   │                   │
     │                  │  runAnalysis()    │                   │                   │
     │                  │──────────────────▶│                   │                   │
     │                  │                   │                   │                   │
     │                  │                   │  ┌────────────────────────────────┐   │
     │                  │                   │  │  Run agents in parallel:       │   │
     │                  │                   │  │  - Scoring Agent               │   │
     │                  │                   │  │  - Suggestion Agent            │   │
     │                  │                   │  │  - Summarization Agent         │   │
     │                  │                   │  └────────────────────────────────┘   │
     │                  │                   │                   │                   │
     │                  │                   │  messages.create()│                   │
     │                  │                   │──────────────────▶│                   │
     │                  │                   │                   │                   │
     │                  │                   │◀──────────────────│                   │
     │                  │                   │  (score, factors) │                   │
     │                  │                   │                   │                   │
     │                  │◀──────────────────│                   │                   │
     │                  │  (analysis result)│                   │                   │
     │                  │                   │                   │                   │
     │                  │  Update lead with │                   │                   │
     │                  │  AI fields        │                   │                   │
     │                  │───────────────────────────────────────────────────────────▶
     │                  │                   │                   │                   │
     │                  │  Send Telegram    │                   │                   │
     │                  │  notification     │                   │                   │
     │                  │─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│                   │                   │
     │                  │                   │                   │                   │
     │◀─────────────────│                   │                   │                   │
     │  { score,        │                   │                   │                   │
     │    suggestions,  │                   │                   │                   │
     │    summary }     │                   │                   │                   │
     │                  │                   │                   │                   │
```

#### Floor Plan Generation Flow

```
┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Browser │     │  API Route  │     │Orchestrator │     │   Agents    │     │   Gemini    │
└────┬─────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
     │                  │                   │                   │                   │
     │  POST /planning/ │                   │                   │                   │
     │  start           │                   │                   │                   │
     │─────────────────▶│                   │                   │                   │
     │                  │  Create session   │                   │                   │
     │                  │────────────────────────────────────────────────────▶ DB   │
     │◀─────────────────│                   │                   │                   │
     │  { sessionId }   │                   │                   │                   │
     │                  │                   │                   │                   │
     │  ... User answers questions ...      │                   │                   │
     │                  │                   │                   │                   │
     │  POST /planning/ │                   │                   │                   │
     │  generate        │                   │                   │                   │
     │─────────────────▶│                   │                   │                   │
     │                  │                   │                   │                   │
     │                  │  runPipeline()    │                   │                   │
     │                  │──────────────────▶│                   │                   │
     │                  │                   │                   │                   │
     │                  │                   │  ┌─────────────────────────────────┐  │
     │                  │                   │  │ BLUEPRINT PHASE (7 agents)      │  │
     │                  │                   │  └─────────────────────────────────┘  │
     │                  │                   │                   │                   │
     │                  │                   │  DiagramInterpreter                   │
     │                  │                   │──────────────────▶│                   │
     │                  │                   │◀──────────────────│                   │
     │                  │                   │                   │                   │
     │                  │                   │  RegulationCompliance (parallel)      │
     │                  │                   │  EcoDesign (parallel)                 │
     │                  │                   │══════════════════▶│                   │
     │                  │                   │◀══════════════════│                   │
     │                  │                   │                   │                   │
     │  (Polling)       │                   │                   │                   │
     │  GET /planning/  │                   │                   │                   │
     │  status          │  progress: 35%    │                   │                   │
     │◀────────────────▶│                   │                   │                   │
     │                  │                   │                   │                   │
     │                  │                   │  VastuCompliance  │                   │
     │                  │                   │──────────────────▶│                   │
     │                  │                   │◀──────────────────│                   │
     │                  │                   │                   │                   │
     │                  │                   │  ArchitecturalZoning                  │
     │                  │                   │──────────────────▶│                   │
     │                  │                   │◀──────────────────│                   │
     │                  │                   │                   │                   │
     │                  │                   │  Dimensioning     │                   │
     │                  │                   │──────────────────▶│                   │
     │                  │                   │◀──────────────────│                   │
     │                  │                   │                   │                   │
     │                  │                   │  EngineeringPlan  │                   │
     │                  │                   │──────────────────▶│                   │
     │                  │                   │◀──────────────────│                   │
     │                  │                   │                   │                   │
     │                  │                   │  ┌─────────────────────────────────┐  │
     │                  │                   │  │ ISOMETRIC PHASE (5 agents)      │  │
     │                  │                   │  └─────────────────────────────────┘  │
     │                  │                   │                   │                   │
     │                  │                   │  DesignValidation │                   │
     │                  │                   │──────────────────▶│                   │
     │                  │                   │◀──────────────────│ (QA Gate)        │
     │                  │                   │                   │                   │
     │                  │                   │  FloorPlanImage   │                   │
     │                  │                   │─────────────────────────────────────▶│
     │                  │                   │                   │  generateContent()
     │                  │                   │◀────────────────────────────────────│
     │                  │                   │                   │  (PNG base64)    │
     │                  │                   │                   │                   │
     │                  │                   │  Visualization    │                   │
     │                  │                   │─────────────────────────────────────▶│
     │                  │                   │◀────────────────────────────────────│
     │                  │                   │                   │ (3D, courtyard)  │
     │                  │                   │                   │                   │
     │                  │◀──────────────────│                   │                   │
     │                  │  (design_context, │                   │                   │
     │                  │   images)         │                   │                   │
     │                  │                   │                   │                   │
     │  GET /planning/  │                   │                   │                   │
     │  status          │                   │                   │                   │
     │─────────────────▶│                   │                   │                   │
     │◀─────────────────│                   │                   │                   │
     │  { status:       │                   │                   │                   │
     │    'complete',   │                   │                   │                   │
     │    images: [...] │                   │                   │                   │
     │  }               │                   │                   │                   │
```

#### Authentication Flow

```
┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Browser │     │  Middleware │     │Supabase Auth│     │  Database   │
└────┬─────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
     │                  │                   │                   │
     │  POST /login     │                   │                   │
     │  { email, pass } │                   │                   │
     │─────────────────▶│                   │                   │
     │                  │                   │                   │
     │                  │  signInWithPassword()                 │
     │                  │──────────────────▶│                   │
     │                  │                   │                   │
     │                  │◀──────────────────│                   │
     │                  │  { session, user }│                   │
     │                  │                   │                   │
     │                  │  Set HTTP-only    │                   │
     │                  │  cookie (JWT)     │                   │
     │                  │                   │                   │
     │◀─────────────────│                   │                   │
     │  302 Redirect    │                   │                   │
     │  /dashboard      │                   │                   │
     │                  │                   │                   │
     │  GET /dashboard  │                   │                   │
     │  (with cookie)   │                   │                   │
     │─────────────────▶│                   │                   │
     │                  │                   │                   │
     │                  │  Verify JWT       │                   │
     │                  │──────────────────▶│                   │
     │                  │◀──────────────────│                   │
     │                  │  ✓ Valid          │                   │
     │                  │                   │                   │
     │                  │  Fetch user profile                   │
     │                  │───────────────────────────────────────▶
     │                  │◀──────────────────────────────────────│
     │                  │  { role, name }   │                   │
     │                  │                   │                   │
     │                  │  Check role       │                   │
     │                  │  permissions      │                   │
     │                  │                   │                   │
     │◀─────────────────│                   │                   │
     │  200 OK          │                   │                   │
     │  (Dashboard)     │                   │                   │
```

---

## 4. AI Agents System

### Lead Management Agents (6 Agents)

| Agent             | Role                   | Capabilities                                                        |
| ----------------- | ---------------------- | ------------------------------------------------------------------- |
| **Lead Manager**  | Orchestrator           | Coordinates all sub-agents, runs analysis in parallel               |
| **Summarization** | Content synthesis      | Multi-note summaries, action item extraction, Tamil/English support |
| **Scoring**       | Lead qualification     | Conversion probability (0-1), confidence levels, factor analysis    |
| **Suggestion**    | Action recommendations | 2-4 specific actions, next best action, follow-up scheduling        |
| **Reporting**     | Business intelligence  | Lead summaries, staff performance, pipeline reports                 |
| **Notification**  | Alert management       | Follow-up reminders, hot lead alerts, daily digests                 |

### Floor Plan Design Agents (12-Agent Pipeline)

The floor plan generation uses a sophisticated multi-agent pipeline:

```
BLUEPRINT PHASE (Agents 1-7)
┌─────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │    Diagram      │───▶│   Regulation    │    │    Eco-Design   │     │
│  │  Interpreter    │    │   Compliance    │    │    (Parallel)   │     │
│  │  (Vision AI)    │    │   (Parallel)    │    │                 │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│           │                     │                      │               │
│           └─────────────────────┼──────────────────────┘               │
│                                 ▼                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │     Vastu       │───▶│  Architectural  │───▶│  Dimensioning   │     │
│  │   Compliance    │    │    Zoning       │    │                 │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                        │               │
│                                                        ▼               │
│                                              ┌─────────────────┐       │
│                                              │  Engineering    │       │
│                                              │     Plan        │       │
│                                              └─────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘

ISOMETRIC PHASE (Agents 8-12)
┌─────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │    Design       │───▶│   Floor Plan    │───▶│ Visualization   │     │
│  │   Validation    │    │     Image       │    │                 │     │
│  │   (QA Gate)     │    │   (2D Render)   │    │  (3D Prompts)   │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                        │               │
│                                                        ▼               │
│                                              ┌─────────────────┐       │
│                                              │   Isometric     │       │
│                                              │   Rendering     │       │
│                                              └─────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

| Agent                      | Phase     | Role                                          |
| -------------------------- | --------- | --------------------------------------------- |
| **Diagram Interpreter**    | Blueprint | Analyzes plot sketches/images using vision AI |
| **Regulation Compliance**  | Blueprint | Validates Tamil Nadu building codes           |
| **Eco-Design**             | Blueprint | Integrates sustainable elements               |
| **Client Elicitation**     | Blueprint | Gathers user requirements via questions       |
| **Engineer Clarification** | Blueprint | Determines structural strategy                |
| **Vastu Compliance**       | Blueprint | Applies Vastu Shastra principles              |
| **Architectural Zoning**   | Blueprint | Room organization and adjacency               |
| **Dimensioning**           | Blueprint | Room sizing and space planning                |
| **Engineering Plan**       | Blueprint | Technical specifications                      |
| **Design Validation**      | Isometric | Cross-validation quality gate                 |
| **Visualization**          | Isometric | Generates render prompts                      |
| **Floor Plan Image**       | Isometric | AI image generation (Gemini)                  |

### Base Agent Architecture

```typescript
abstract class BaseAgent<TInput, TOutput> {
  // Core capabilities
  - buildPrompt()           // Construct AI prompt
  - callAPI()               // API call with retry logic
  - validateResponse()      // JSON schema validation
  - extractOpenQuestions()  // Human intervention points
  - trackAssumptions()      // Assumption logging
  - accountTokens()         // Token budget management
}
```

### AI Model Selection

| Task Type         | Model            | Reason                        |
| ----------------- | ---------------- | ----------------------------- |
| Deep reasoning    | Claude Opus      | Maximum intelligence          |
| Standard analysis | Claude Sonnet    | Balance of speed + capability |
| STT, Embeddings   | Gemini 2.5 Flash | Multimodal, fast              |
| Image generation  | Gemini 3 Pro     | 4K photorealistic             |
| Fallback          | GPT-4o           | Tertiary option               |

---

## 5. Features Inventory

### Lead Management

| Feature               | Description                                         |
| --------------------- | --------------------------------------------------- |
| Lead Creation         | Create leads with name, phone, source, type, status |
| Lead Editing          | Update lead information                             |
| Kanban Board          | Visual pipeline by status                           |
| Lead Assignment       | Assign leads to staff members                       |
| Lead Archival         | Auto-archive converted/lost leads                   |
| Bulk Import           | Import leads from CSV                               |
| AI Analysis           | Scoring, summarization, suggestions                 |
| AI Summary            | Automatic interaction summaries                     |
| Conversion Prediction | Probability scoring with factors                    |
| Next Best Action      | AI-recommended follow-ups                           |

### Floor Plan Design

| Feature              | Description                           |
| -------------------- | ------------------------------------- |
| Interactive Chatbot  | Conversational requirements gathering |
| Image Upload         | Upload plot sketches for analysis     |
| Quick Options        | Predefined answer buttons             |
| Progress Indicator   | 12-stage pipeline visualization       |
| Blueprint Generation | AI-generated floor plans              |
| Vastu Compliance     | Traditional principles integration    |
| Eco-Design           | Sustainable features enforcement      |
| Regulation Check     | Tamil Nadu building code validation   |
| 3D Visualization     | Isometric view generation             |
| PNG Download         | Downloadable floor plan images        |

### Dashboard & Analytics

| Feature               | Description               |
| --------------------- | ------------------------- |
| KPI Cards             | Key metrics at a glance   |
| Lead Status Breakdown | Pie charts by status      |
| Sales Funnel          | Conversion visualization  |
| Geographic Heat Map   | Lead distribution map     |
| Sales Leaderboard     | Staff rankings            |
| Lead Aging Report     | Days-in-stage analysis    |
| Response Time Metrics | Performance tracking      |
| Product Interest      | Analytics by product type |

### Knowledge Base

| Feature         | Description                 |
| --------------- | --------------------------- |
| Document Upload | Store company knowledge     |
| FAQ Management  | Frequently asked questions  |
| Web Scraping    | Content ingestion from URLs |
| Semantic Search | Embedding-based retrieval   |
| Q&A Interface   | Natural language questions  |

### Team Collaboration

| Feature              | Description            |
| -------------------- | ---------------------- |
| Multi-User Access    | Role-based permissions |
| Staff Invitations    | Team member onboarding |
| Task Assignment      | Work distribution      |
| Activity Tracking    | User action logging    |
| Performance Coaching | AI-powered insights    |

### Notifications

| Channel  | Types                                            |
| -------- | ------------------------------------------------ |
| Telegram | New leads, AI analysis, hot leads, daily digests |
| Email    | Transactional notifications                      |
| In-App   | Real-time alerts                                 |
| Push     | PWA notifications                                |

---

## 6. API Endpoints

### Lead Management

| Endpoint                    | Method           | Purpose           |
| --------------------------- | ---------------- | ----------------- |
| `/api/leads`                | GET, POST        | List/create leads |
| `/api/leads/[id]`           | GET, PUT         | Get/update lead   |
| `/api/leads/[id]/notes`     | GET, POST        | Lead notes        |
| `/api/leads/[id]/analyze`   | GET, POST        | AI analysis       |
| `/api/leads/[id]/estimates` | GET              | Get estimates     |
| `/api/leads/import`         | POST             | Bulk import       |
| `/api/notes`                | GET, POST        | Note management   |
| `/api/notes/[id]`           | GET, PUT, DELETE | Note CRUD         |

### Floor Plan Design

| Endpoint                           | Method | Purpose            |
| ---------------------------------- | ------ | ------------------ |
| `/api/planning/start`              | POST   | Initialize session |
| `/api/planning/[sessionId]/status` | GET    | Get progress       |
| `/api/planning/message`            | POST   | Chat message       |
| `/api/planning/answer`             | POST   | Answer question    |
| `/api/planning/inputs`             | POST   | Update inputs      |
| `/api/planning/confirm-blueprint`  | POST   | Confirm design     |
| `/api/planning/modify`             | POST   | Modify design      |
| `/api/planning/generate`           | POST   | Trigger generation |

### Analytics & KPI

| Endpoint                   | Method | Purpose            |
| -------------------------- | ------ | ------------------ |
| `/api/kpi/lead`            | GET    | Lead KPIs          |
| `/api/kpi/staff`           | GET    | Staff performance  |
| `/api/kpi/business`        | GET    | Business metrics   |
| `/api/kpi/dashboard`       | GET    | All dashboard data |
| `/api/dashboard/stats`     | GET    | Statistics         |
| `/api/dashboard/analytics` | GET    | Detailed analytics |

### Image Generation

| Endpoint              | Method | Purpose              |
| --------------------- | ------ | -------------------- |
| `/api/image/generate` | POST   | Generate from prompt |
| `/api/image/edit`     | POST   | Edit image           |

### Integrations

| Endpoint                      | Method    | Purpose                        |
| ----------------------------- | --------- | ------------------------------ |
| `/api/odoo/sync`              | POST, GET | Odoo sync                      |
| `/api/odoo/cron`              | GET       | Scheduled sync                 |
| `/api/notifications/telegram` | GET, POST | Telegram notifications         |
| `/api/telegram/webhook`       | GET, POST | Telegram call recording intake |
| `/api/transcribe`             | POST      | Audio transcription            |

### Call Recording Admin

| Endpoint                                | Method | Purpose                      |
| --------------------------------------- | ------ | ---------------------------- |
| `/api/admin/call-recordings`            | GET    | List recordings with filters |
| `/api/admin/call-recordings/[id]`       | GET    | Get recording details        |
| `/api/admin/call-recordings/[id]/retry` | POST   | Retry failed recording       |

### Knowledge Base

| Endpoint                | Method    | Purpose         |
| ----------------------- | --------- | --------------- |
| `/api/knowledge`        | GET, POST | Manage KB       |
| `/api/knowledge/ask`    | POST      | Q&A query       |
| `/api/knowledge/search` | POST      | Semantic search |
| `/api/knowledge/scrape` | POST      | Web scraping    |

### Archive Management

| Endpoint                   | Method   | Purpose             |
| -------------------------- | -------- | ------------------- |
| `/api/archive/suggestions` | GET      | Archive suggestions |
| `/api/archive/batch`       | POST     | Batch archive       |
| `/api/archive/restore`     | POST     | Restore leads       |
| `/api/archive/config`      | GET, PUT | Configuration       |

---

## 7. Database Schema

### Core Tables

#### users

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT CHECK (role IN ('founder', 'accountant', 'engineer')),
  language_preference TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### leads

```sql
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT,
  source TEXT,
  lead_type TEXT,
  status TEXT DEFAULT 'new',
  assigned_staff UUID REFERENCES users(id),

  -- AI Fields
  ai_summary TEXT,
  ai_score DECIMAL(3,2),
  ai_factors JSONB,
  ai_suggestions JSONB,
  next_action TEXT,
  follow_up_date DATE,

  -- Archive Fields
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES users(id),
  archive_reason TEXT,

  -- Odoo Integration
  odoo_lead_id INTEGER,
  odoo_partner_id INTEGER,
  odoo_quote_number TEXT,
  odoo_order_number TEXT,
  odoo_synced_at TIMESTAMPTZ,
  odoo_sync_status TEXT,

  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned ON leads(assigned_staff);
CREATE INDEX idx_leads_followup ON leads(follow_up_date);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
```

#### notes

```sql
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES users(id),
  text TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',
  audio_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Call Recording Tables

#### call_recordings

```sql
CREATE TABLE call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  phone_number TEXT NOT NULL,

  -- Telegram metadata
  telegram_file_id TEXT UNIQUE NOT NULL,
  telegram_message_id INTEGER,
  telegram_chat_id BIGINT,
  telegram_user_id BIGINT,
  original_filename TEXT,
  file_size_bytes INTEGER,

  -- Processing state
  processing_status TEXT DEFAULT 'pending',
  -- States: pending → downloading → converting → uploading → transcribing → analyzing → completed | failed
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Storage
  drive_file_id TEXT,
  drive_file_url TEXT,
  audio_duration_seconds INTEGER,

  -- AI Analysis
  transcription_text TEXT,
  ai_summary TEXT,
  ai_sentiment TEXT,
  ai_score_impact DECIMAL(3,2),
  detected_objections JSONB,
  recommended_actions JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_recordings_lead ON call_recordings(lead_id);
CREATE INDEX idx_recordings_status ON call_recordings(processing_status);
CREATE INDEX idx_recordings_phone ON call_recordings(phone_number);
```

### Floor Plan Tables

#### floor_plan_sessions

```sql
CREATE TABLE floor_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'collecting',
  project_type TEXT DEFAULT 'residential',
  collected_inputs JSONB DEFAULT '{}',
  generated_images JSONB,
  blueprint_image JSONB,
  design_context JSONB,
  current_question_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

#### floor_plan_messages

```sql
CREATE TABLE floor_plan_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES floor_plan_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata JSONB,
  sequence_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### floor_plan_progress

```sql
CREATE TABLE floor_plan_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES floor_plan_sessions(id) ON DELETE CASCADE,
  phase TEXT,
  current_stage TEXT,
  percent INTEGER DEFAULT 0,
  stages JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    users    │───────│    leads    │───────│    notes    │
└─────────────┘       └─────────────┘       └─────────────┘
      │                     │
      │                     │
      ▼                     ▼
┌─────────────┐       ┌─────────────┐
│floor_plan_  │       │  estimates  │
│  sessions   │       └─────────────┘
└─────────────┘
      │
      ├─────────────────────┐
      ▼                     ▼
┌─────────────┐       ┌─────────────┐
│floor_plan_  │       │floor_plan_  │
│  messages   │       │  progress   │
└─────────────┘       └─────────────┘
```

---

## 8. Security & Authentication

### Authentication Flow

```
Browser → Login Page → Supabase Auth → JWT Cookie → Middleware → Protected Routes
```

### Role-Based Access Control

| Role           | Capabilities                                        |
| -------------- | --------------------------------------------------- |
| **Founder**    | Full access to all leads, settings, invitations     |
| **Engineer**   | View assigned leads, create notes, use design tools |
| **Accountant** | View leads, reports, export data                    |

### Row Level Security (RLS)

```sql
-- Founders have full access
CREATE POLICY "Founders full access" ON public.leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'founder')
  );

-- Staff can view assigned leads
CREATE POLICY "Staff view assigned" ON public.leads
  FOR SELECT USING (
    assigned_staff = auth.uid() OR created_by = auth.uid()
  );

-- Users access own sessions
CREATE POLICY "Users own sessions" ON floor_plan_sessions
  FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
```

### Rate Limiting (Middleware)

| Endpoint Type  | Limit              |
| -------------- | ------------------ |
| Authentication | 10 req/min per IP  |
| AI Endpoints   | 20 req/min per IP  |
| Password Reset | 5 req/min per IP   |
| General API    | 100 req/min per IP |

### Security Headers

```typescript
// Applied via middleware
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HSTS)
```

### Centralized Supabase Client Pattern

**CRITICAL:** All server-side code MUST use the centralized Supabase client from `@/lib/supabase`.

```typescript
// ✅ CORRECT - Use centralized client
import { supabaseAdmin } from "@/lib/supabase";

const { data, error } = await supabaseAdmin.from("leads").select("*");

// ❌ WRONG - Never create clients with non-null assertions
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, // Dangerous!
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Dangerous!
);
```

The centralized client provides:

- Lazy initialization with proper null checks
- Single instance (singleton pattern)
- Graceful error logging if env vars missing
- Consistent configuration across all services

---

## 9. Deployment & Infrastructure

### Hosting

| Component | Platform | Details                |
| --------- | -------- | ---------------------- |
| Frontend  | Vercel   | Next.js serverless     |
| Database  | Supabase | Managed PostgreSQL     |
| Storage   | Supabase | S3-compatible buckets  |
| AI APIs   | Cloud    | Claude, Gemini, OpenAI |

### Environment Variables

**Client-Side (NEXT*PUBLIC* prefix):**

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
```

**Server-Side:**

```
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GOOGLE_AI_API_KEY
OPENAI_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
ODOO_RPC_URL
ODOO_DB
ODOO_USERNAME
ODOO_PASSWORD
RESEND_API_KEY
```

### Cron Jobs

| Job       | Schedule        | Endpoint         |
| --------- | --------------- | ---------------- |
| Odoo Sync | Daily 00:00 UTC | `/api/odoo/cron` |

### Build Commands

```bash
# Development
bun dev              # Start all dev servers

# Production Build
turbo run build --filter=@maiyuri/web

# Quality Gate
bun typecheck && bun lint && bun test
```

### Performance Considerations

| Constraint        | Current          | Solution                        |
| ----------------- | ---------------- | ------------------------------- |
| Token Budget      | 100,000/pipeline | Caching, incremental refinement |
| Function Timeout  | 60 seconds       | Background queues (future)      |
| Real-time Updates | Polling          | WebSockets (future)             |

---

## Appendix: Quick Reference

### Common Commands

```bash
bun dev          # Start development
bun build        # Build for production
bun test         # Run tests
bun typecheck    # TypeScript validation
bun lint         # ESLint check
```

### Key File Paths

| Purpose      | Path                      |
| ------------ | ------------------------- |
| Frontend App | `apps/web/app/`           |
| API Routes   | `apps/web/app/api/`       |
| AI Agents    | `apps/api/src/agents/`    |
| CloudCore    | `apps/api/src/cloudcore/` |
| Shared Types | `packages/shared/src/`    |
| Migrations   | `supabase/migrations/`    |

### AI Model Configuration

```typescript
// Claude
const claude = new Anthropic();
await claude.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  temperature: 0.3,
});

// Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
```

---

## Appendix: Maintenance Guide

### When to Update This Document

| Change Type            | Update Required                       |
| ---------------------- | ------------------------------------- |
| New AI agent added     | Add to Section 4 (AI Agents System)   |
| New API endpoint       | Add to Section 6 (API Endpoints)      |
| New database table     | Add to Section 7 (Database Schema)    |
| New package dependency | Add to Section 2 (Technology Stack)   |
| New migration file     | Update migration count in Section 2   |
| Architecture changes   | Update diagrams in Section 3          |
| New feature            | Add to Section 5 (Features Inventory) |
| Security changes       | Update Section 8 (Security)           |

### Version History

| Date       | Version | Changes                                                                          |
| ---------- | ------- | -------------------------------------------------------------------------------- |
| 2026-01-15 | 1.0.0   | Initial comprehensive documentation                                              |
| 2026-01-21 | 1.1.0   | Added call_recordings table, Telegram webhook docs, centralized Supabase pattern |

### How to Verify Documentation Accuracy

```bash
# Check package versions
cat apps/web/package.json | grep -E '"(next|react|tailwind)"'
cat apps/api/package.json | grep -E '"(@anthropic|@google)"'

# Count migration files
ls supabase/migrations/*.sql | wc -l

# List AI agents
ls apps/api/src/agents/planning/agents/*.ts

# Count API routes
find apps/web/app/api -name "route.ts" | wc -l
```

### Key Files to Monitor

| Purpose      | Files to Watch                        |
| ------------ | ------------------------------------- |
| Dependencies | `package.json`, `apps/*/package.json` |
| AI Agents    | `apps/api/src/agents/*/index.ts`      |
| API Routes   | `apps/web/app/api/**/route.ts`        |
| Database     | `supabase/migrations/*.sql`           |
| Middleware   | `apps/web/middleware.ts`              |
| State Stores | `apps/web/src/stores/*.ts`            |

### Documentation Standards

1. **Tables over prose**: Use markdown tables for lists and comparisons
2. **ASCII diagrams**: Use box-drawing characters for architecture diagrams
3. **Code examples**: Include TypeScript snippets where helpful
4. **Version numbers**: Always include specific versions for dependencies
5. **Sequence diagrams**: Use ASCII sequence diagrams for complex flows

### Contributing

When updating this documentation:

1. Verify changes against actual codebase using the commands above
2. Update the version history table
3. Run `bun typecheck` to ensure code examples are valid
4. Keep diagrams up to date with architectural changes

---

_This document reflects the current state of the codebase as of January 2026. Last verified: 2026-01-21._

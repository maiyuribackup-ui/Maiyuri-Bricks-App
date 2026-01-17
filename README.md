# Maiyuri Bricks AI Lead Management

[![CI](https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/actions/workflows/ci.yml/badge.svg)](https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/maiyuribackup-ui/Maiyuri-Bricks-App)](https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/releases)
[![License](https://img.shields.io/badge/license-Private-red)](LICENSE)

AI-powered lead management system for Maiyuri Bricks - a brick manufacturing business.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development](#development)
- [Version Control & Releases](#version-control--releases)
- [Contributing](#contributing)
- [Documentation](#documentation)

---

## Features

### Lead Management

- Full lifecycle lead tracking with CRUD operations
- AI-powered lead scoring and prioritization
- Intelligent suggestions for follow-up actions
- Call recording transcription and analysis

### Floor Plan AI

- AI-assisted architectural floor plan generation
- Vastu compliance checking
- Regulation compliance validation
- Multi-agent planning system

### Knowledge Base

- RAG-powered Q&A with company knowledge
- Document ingestion and processing
- Semantic search capabilities

### Team Collaboration

- Multi-role support (Founder, Accountant, Engineer)
- Team invitation system with email notifications
- Role-based access control

### Integrations

- Telegram bot for real-time notifications
- Odoo ERP integration
- Google Drive storage support

---

## Tech Stack

| Category       | Technology                                |
| -------------- | ----------------------------------------- |
| **Frontend**   | Next.js 14, React 18, Tailwind CSS        |
| **Backend**    | Next.js API Routes, Supabase              |
| **AI**         | Claude AI (Anthropic), Gemini AI (Google) |
| **Database**   | PostgreSQL (Supabase)                     |
| **Email**      | Resend                                    |
| **Deployment** | Vercel                                    |
| **CI/CD**      | GitHub Actions                            |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 10+
- Supabase account
- Anthropic API key
- Google AI API key

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App.git
   cd Maiyuri-Bricks-App
   ```

2. **Install dependencies**

   ```bash
   npm install --legacy-peer-deps
   ```

3. **Set up environment variables**

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

   Required variables:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   GOOGLE_AI_API_KEY=your_google_ai_key
   RESEND_API_KEY=your_resend_key
   RESEND_FROM_EMAIL=your_verified_email
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_CHAT_ID=your_telegram_chat_id
   ```

4. **Start development server**

   ```bash
   npm run dev
   ```

5. **Open the app**

   Visit [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
maiyuri-bricks-app/
├── apps/
│   ├── web/                 # Next.js frontend application
│   │   ├── app/             # App router pages
│   │   ├── src/components/  # React components
│   │   └── src/lib/         # Utilities and helpers
│   └── api/                 # Backend API and AI agents
│       ├── src/agents/      # AI agent implementations
│       └── src/services/    # Business logic services
├── packages/
│   ├── ui/                  # Shared UI component library
│   └── shared/              # Shared utilities and types
├── docs/                    # Documentation
├── supabase/                # Database migrations
└── .github/                 # GitHub Actions workflows
```

---

## Development

### Available Scripts

```bash
# Start development servers
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Run tests
npm run test

# Run E2E tests
npm run test:e2e

# Format code
npm run format
```

### Quality Checks

Before committing, ensure all checks pass:

```bash
npm run typecheck && npm run lint && npm run test
```

---

## Version Control & Releases

We follow **Semantic Versioning (SemVer)** and **GitHub Flow** for version control.

### Current Version

| Version    | Status | Release Date |
| ---------- | ------ | ------------ |
| **v0.2.0** | Latest | 2026-01-17   |

#### v0.2.0 Highlights

- WhatsApp Business auto-response with AI messages
- Enhanced lead detail page layout
- Auto-create leads from Telegram voice messages
- Lead classification, requirement type, and location fields
- 101 unit tests for lead management

See [CHANGELOG.md](CHANGELOG.md) for full version history.

### Version Format

```
MAJOR.MINOR.PATCH

Examples:
- 0.1.0 → 0.1.1  (patch: bug fixes)
- 0.1.1 → 0.2.0  (minor: new features)
- 0.2.0 → 1.0.0  (major: breaking changes)
```

### Release Process

Every release follows this workflow:

1. **Development** → Feature branches from `main`
2. **Testing** → CI runs typecheck, lint, tests
3. **Review** → PR requires 1 approval
4. **Merge** → Squash merge to `main`
5. **Release** → Tag with version, auto-generates release
6. **Notify** → Telegram notification sent

For detailed workflow, see [GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md).

### Branch Protection

The `main` branch is protected:

- Requires pull request with 1 approval
- Requires passing CI checks
- No direct pushes allowed

---

## Contributing

### Quick Start

1. Create a feature branch

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make changes with conventional commits

   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve bug"
   git commit -m "docs: update readme"
   ```

3. Push and create PR

   ```bash
   git push -u origin feature/your-feature-name
   ```

4. Wait for CI and review

### Commit Message Format

```
type(scope): description

Types:
- feat:     New feature
- fix:      Bug fix
- docs:     Documentation
- style:    Formatting
- refactor: Code restructuring
- test:     Tests
- chore:    Maintenance
```

### Code Standards

See [CLAUDE.md](CLAUDE.md) for detailed coding standards.

---

## Documentation

| Document                                   | Description                       |
| ------------------------------------------ | --------------------------------- |
| [CLAUDE.md](CLAUDE.md)                     | Coding standards and AI guidance  |
| [CHANGELOG.md](CHANGELOG.md)               | Version history and release notes |
| [GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)    | Git workflow and release process  |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)    | System architecture overview      |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Deployment instructions           |

---

## Notifications

Release and CI notifications are sent to the team Telegram group:

- **CI Pass/Fail**: Notified on every push to `main`
- **New Release**: Notified when version tag is pushed

---

## License

Private - All rights reserved. Maiyuri Bricks.

---

Built with AI-powered development using Claude Code.

# Maiyuri Bricks AI Lead Management

AI-powered lead management system for Maiyuri Bricks - a brick manufacturing business.

## Features

- **Lead Management** - Track and manage customer leads with full lifecycle support
- **AI Lead Scoring** - Automatic scoring and prioritization using Claude AI
- **Floor Plan AI** - AI-assisted architectural floor plan generation
- **Knowledge Base** - RAG-powered Q&A with company knowledge
- **Call Transcription** - Automatic transcription of call recordings
- **Team Management** - Multi-role support with invitation system
- **Telegram Integration** - Real-time notifications via Telegram bot
- **Dashboard Analytics** - KPI metrics and business insights

## Tech Stack

- **Frontend:** Next.js 14, React 18, Tailwind CSS
- **Backend:** Next.js API Routes, Supabase
- **AI:** Claude AI (Anthropic), Gemini AI (Google)
- **Database:** PostgreSQL (Supabase)
- **Email:** Resend
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- Bun package manager
- Supabase account
- Anthropic API key
- Google AI API key

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App.git
   cd Maiyuri-Bricks-App
   ```

2. Install dependencies
   ```bash
   bun install
   ```

3. Set up environment variables
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   # Edit .env.local with your credentials
   ```

4. Start development server
   ```bash
   bun dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # Backend API and AI agents
├── packages/
│   ├── ui/           # Shared UI components
│   └── shared/       # Shared utilities
├── docs/             # Documentation
└── supabase/         # Database migrations
```

## Development

```bash
# Run all checks before committing
bun typecheck && bun lint && bun test

# Start development server
bun dev

# Build for production
bun build
```

## Git Workflow

We use GitHub Flow:

1. Create a feature branch from `main`
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make changes and commit (conventional commits)
   ```bash
   git commit -m "feat: add new feature"
   ```

3. Push and create a PR
   ```bash
   git push -u origin feature/my-feature
   ```

4. PR requires:
   - Passing CI checks (typecheck, lint, test)
   - 1 code review approval

5. Squash and merge to `main`

## Contributing

See [CLAUDE.md](./CLAUDE.md) for detailed contribution guidelines and code standards.

## License

Private - All rights reserved.

---

Built with AI-powered development using Claude Code.

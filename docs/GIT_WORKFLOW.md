# Git Workflow & Release Process

This document describes the complete Git workflow, version control strategy, and release process for Maiyuri Bricks App.

## Table of Contents

1. [Branch Strategy](#branch-strategy)
2. [Development Workflow](#development-workflow)
3. [Pull Request Process](#pull-request-process)
4. [Release Process](#release-process)
5. [Version Numbering](#version-numbering)
6. [Hotfix Process](#hotfix-process)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [Telegram Notifications](#telegram-notifications)
9. [Troubleshooting](#troubleshooting)

---

## Branch Strategy

We use **GitHub Flow** - a simplified branch strategy ideal for continuous deployment.

### Branch Types

| Branch | Purpose | Naming Convention | Lifetime |
|--------|---------|-------------------|----------|
| `main` | Production code | `main` | Permanent |
| Feature | New features | `feature/description` | Until merged |
| Fix | Bug fixes | `fix/description` | Until merged |
| Hotfix | Urgent fixes | `hotfix/description` | Until merged |

### Branch Diagram

```
main (protected) ────●────●────●────●────●────●────► (production)
                     │         │         │
                     │         │         └─ hotfix/critical-bug ──┐
                     │         │                                  │
                     │         └─ feature/new-dashboard ──────────┤
                     │                                            │
                     └─ feature/user-auth ────────────────────────┘

                                              All branches merge via PR
```

### Branch Protection Rules

The `main` branch has the following protections:

| Rule | Setting |
|------|---------|
| Require pull request | Yes |
| Required reviewers | 1 |
| Require status checks | `quality` (CI) |
| Require up-to-date branch | Yes |
| Allow force push | No |
| Allow deletions | No |

---

## Development Workflow

### Step 1: Create Feature Branch

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/your-feature-name
```

### Step 2: Develop with Conventional Commits

```bash
# Make changes and commit
git add .
git commit -m "feat: add user dashboard component"

# Continue development
git commit -m "feat: add dashboard charts"
git commit -m "test: add dashboard unit tests"
git commit -m "docs: update dashboard documentation"
```

### Commit Message Format

```
type(scope): subject

[optional body]

[optional footer]
```

**Types:**
| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat: add lead scoring` |
| `fix` | Bug fix | `fix: resolve login error` |
| `docs` | Documentation | `docs: update API guide` |
| `style` | Formatting | `style: fix indentation` |
| `refactor` | Code restructure | `refactor: simplify auth logic` |
| `test` | Tests | `test: add unit tests` |
| `chore` | Maintenance | `chore: update dependencies` |
| `perf` | Performance | `perf: optimize query` |

### Step 3: Push and Create PR

```bash
# Push feature branch
git push -u origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## Pull Request Process

### PR Checklist

Before creating a PR, ensure:

- [ ] Code follows project standards (see CLAUDE.md)
- [ ] All tests pass locally (`npm run test`)
- [ ] TypeScript types check (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Documentation updated if needed
- [ ] No sensitive data in commits

### PR Template

When you create a PR, use this template:

```markdown
## Summary
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Changes Made
- Change 1
- Change 2

## Testing
- [ ] Unit tests pass
- [ ] Manual testing done

## Screenshots (if UI changes)
```

### Review Process

1. **Author** creates PR with description
2. **CI** runs automatically (typecheck, lint, test)
3. **Reviewer** reviews code and approves
4. **Author** addresses feedback if needed
5. **Merge** via squash merge

### Merge Strategy

Always use **Squash and Merge**:
- Combines all commits into one
- Keeps main history clean
- Use meaningful squash commit message

---

## Release Process

### Pre-Release Checklist

Before creating a release:

- [ ] All features for release are merged to `main`
- [ ] CI is passing on `main`
- [ ] Manual testing completed
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json (if needed)

### Creating a Release

#### Step 1: Update CHANGELOG.md

```markdown
## [0.2.0] - 2026-01-20

### Added
- New dashboard feature
- Lead scoring improvements

### Fixed
- Login redirect issue
- Mobile responsive bugs

### Changed
- Updated AI prompts
```

#### Step 2: Create Version Tag

```bash
# Ensure on main and up to date
git checkout main
git pull origin main

# Create annotated tag
git tag -a v0.2.0 -m "Release v0.2.0: Dashboard and Lead Scoring"

# Push tag
git push origin v0.2.0
```

#### Step 3: Automatic Release

When you push a tag:
1. GitHub Actions `release.yml` triggers
2. Changelog is auto-generated from commits
3. GitHub Release is created
4. Telegram notification is sent

### Release Artifacts

Each release includes:
- Git tag (e.g., `v0.2.0`)
- GitHub Release with notes
- Auto-generated changelog
- Telegram notification

---

## Version Numbering

We follow **Semantic Versioning (SemVer)**.

### Format

```
MAJOR.MINOR.PATCH

v1.2.3
│ │ │
│ │ └─ PATCH: Bug fixes, no API changes
│ └─── MINOR: New features, backwards compatible
└───── MAJOR: Breaking changes
```

### Examples

| Change Type | Before | After | Example |
|-------------|--------|-------|---------|
| Bug fix | 0.1.0 | 0.1.1 | Fix login error |
| New feature | 0.1.1 | 0.2.0 | Add dashboard |
| Breaking change | 0.2.0 | 1.0.0 | New API structure |

### Pre-release Versions

For testing releases:
```
v0.2.0-alpha.1   # Alpha release
v0.2.0-beta.1    # Beta release
v0.2.0-rc.1      # Release candidate
```

### Version Roadmap

| Version | Milestone | Status |
|---------|-----------|--------|
| v0.1.0 | Initial MVP | Released |
| v0.2.0 | Sales Coach | Planned |
| v0.3.0 | Floor Plan AI | Planned |
| v1.0.0 | Production Ready | Future |

---

## Hotfix Process

For urgent production fixes:

### Step 1: Create Hotfix Branch

```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug-fix
```

### Step 2: Fix and Test

```bash
# Make minimal fix
git commit -m "fix: resolve critical authentication bug"

# Test thoroughly
npm run test
```

### Step 3: Fast-Track PR

1. Create PR with `[HOTFIX]` prefix
2. Request expedited review
3. Merge immediately after approval

### Step 4: Release Patch

```bash
git checkout main
git pull origin main
git tag -a v0.1.1 -m "Hotfix v0.1.1: Critical auth fix"
git push origin v0.1.1
```

---

## CI/CD Pipeline

### Continuous Integration (CI)

**Trigger:** Every push to `main` and every PR

**File:** `.github/workflows/ci.yml`

**Jobs:**
1. **Code Quality**
   - Checkout code
   - Install dependencies
   - Run typecheck
   - Run lint
   - Run tests

2. **Notify Success** (on main push)
   - Send Telegram notification

3. **Notify Failure**
   - Send Telegram notification

### Continuous Deployment (CD)

**Trigger:** Push to `main` branch

**Platform:** Vercel

**Process:**
1. Vercel detects push to `main`
2. Builds application
3. Deploys to production
4. Updates production URL

### Release Workflow

**Trigger:** Push of version tag (v*)

**File:** `.github/workflows/release.yml`

**Jobs:**
1. Generate changelog from commits
2. Create GitHub Release
3. Send Telegram notification

---

## Telegram Notifications

### Notification Types

| Event | Trigger | Message |
|-------|---------|---------|
| CI Pass | Push to main | Green checkmark with details |
| CI Fail | Any push | Red X with error details |
| New Release | Tag push | Rocket emoji with version |

### Message Format

**CI Success:**
```
✅ CI Passed

Repository: maiyuribackup-ui/Maiyuri-Bricks-App
Branch: main
Commit: abc1234
Author: username

View Run: [link]
```

**CI Failure:**
```
❌ CI Failed

Repository: maiyuribackup-ui/Maiyuri-Bricks-App
Branch: main
Commit: abc1234
Author: username

View Run: [link]
```

**New Release:**
```
🚀 New Release: v0.2.0

Repository: maiyuribackup-ui/Maiyuri-Bricks-App

View Release: [link]
```

### Configuration

Telegram notifications require these secrets in GitHub:

| Secret | Description |
|--------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Target chat/group ID |

---

## Troubleshooting

### CI Failing

1. **Check logs**: `gh run view [run-id] --log-failed`
2. **Run locally**: `npm run typecheck && npm run lint && npm run test`
3. **Fix issues and push**

### Cannot Push to Main

Main is protected. You must:
1. Create a feature branch
2. Push to feature branch
3. Create PR
4. Get approval
5. Merge via PR

### Release Not Created

1. Ensure tag format is `v*` (e.g., `v0.2.0`)
2. Check GitHub Actions for errors
3. Verify `release.yml` workflow exists

### Telegram Not Sending

1. Verify secrets are set in GitHub
2. Check bot has access to chat
3. Review workflow logs for curl errors

---

## Quick Reference

### Common Commands

```bash
# Start new feature
git checkout main && git pull && git checkout -b feature/name

# Commit with conventional format
git commit -m "feat: description"

# Push feature branch
git push -u origin feature/name

# Create release
git tag -a v0.2.0 -m "Release v0.2.0" && git push origin v0.2.0

# Check CI status
gh run list --limit 5
```

### Links

- [GitHub Repository](https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App)
- [GitHub Actions](https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/actions)
- [Releases](https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/releases)
- [Pull Requests](https://github.com/maiyuribackup-ui/Maiyuri-Bricks-App/pulls)

---

*Last updated: 2026-01-17*

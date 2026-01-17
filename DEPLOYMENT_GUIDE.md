# Deployment Guide: Maiyuri Bricks AI App

This guide covers deployment for Vercel (production) and Hostinger (alternative).

---

## 0. Pre-Deployment Checklist (REQUIRED)

**Before every deployment, verify these items:**

### Database Migrations

```bash
# 1. Check for pending migrations
ls -la supabase/migrations/*.sql | tail -5

# 2. Compare local vs production schema
# If you added new columns, ensure migration was applied:
curl -s https://maiyuri-bricks-app.vercel.app/api/health | jq '.data.services.schema'
```

**If schema status is `invalid`:**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to SQL Editor
3. Run pending migrations from `supabase/migrations/`
4. Re-check health endpoint

### Code Quality

```bash
# Run all checks
npm run typecheck && npm run lint && npm run test
```

### Health Check After Deployment

```bash
# Verify all services are healthy
curl -s https://maiyuri-bricks-app.vercel.app/api/health | jq

# Expected: status = "healthy", schema.status = "valid"
```

### Quick Verification Checklist

- [ ] All pending migrations applied to production Supabase
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Health endpoint shows `healthy` status
- [ ] Test critical user flows (create lead, edit lead)

---

## 1. Vercel Deployment (Production)

The app auto-deploys to Vercel when you push to `main`.

### Environment Variables (Vercel Dashboard)

Required in Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_CHAT_ID` (optional)

### Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

---

## 2. Hostinger Deployment (Alternative)

This section explains how to host on Hostinger.

## 1. Static vs. VPS vs. Shared Hosting

### ❌ Static Website

You **cannot** deploy this as a static website (HTML/CSS only).
**Why?** The "Ask Maiyuri" chatbot needs a Node.js server to talk to the AI (Gemini) and query your Knowledge Base. Static sites cannot run this logic.

### ✅ Shared Hosting (The "Sweet Spot")

If you have Hostinger **Business** or **Cloud** hosting, you can use the **Node.js Selector**. This is the easiest way to run your app without managing a full server.

- **Pros**: Cheap, easy to manage, includes SSL and Email.
- **Cons**: Shared resources.

### ✅ VPS (The "Professional" Choice)

If you have high traffic (sales team of 50+ people), a VPS is better.

- **Pros**: Full control, high performance, no resource sharing.
- **Cons**: You must manage security updates and server configuration (Nginx, PM2).

---

## 2. How to Deploy (Hostinger Shared Node.js)

I have already automated much of this for you with the `scripts/deploy_fast.py` script. Here is the final manual bit you need to do in the **Hostinger Panel**:

### Step 1: Initialize Node.js

1. Log in to **hPanel** -> **Advanced** -> **Node.js**.
2. Click **Setup Node.js**.
3. Set the **Application Root**: `/public_html`.
4. Set the **Application Mode**: `Production`.
5. Set the **Application Entry Point**: `server.js` (this is the file I placed in your root).
6. Click **Install** or **Start**.

### Step 2: Environment Variables

You must add your `.env` variables to the Node.js selector (or a `.env` file in the root). You need:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`

### Step 3: Fast Deployment Script

To update your site in the future, just run:

```bash
python3 scripts/deploy_fast.py
```

This script zips the app locally, uploads it, and you can then visit `app.maiyuri.com/unzip.php` to extract it instantly.

---

## 3. How to Deploy (VPS)

If you switch to a VPS, the steps are:

1. **Install Node.js & Bun**: `curl -fsSL https://bun.sh/install | bash`.
2. **Clone Repo**: `git clone <your-repo-url>`.
3. **Build**: `npm install && npm run build`.
4. **Process Manager**: Use **PM2** to keep it running:
   ```bash
   pm2 start apps/web/.next/standalone/server.js --name "maiyuri-bricks"
   ```
5. **Reverse Proxy**: Use **Nginx** to map port 3000 to port 80/443.

# @maiyuri/native — React Native + Expo app

Native Android (and iOS) app for Maiyuri Bricks. Built with **Expo + expo-router**,
reusing the existing backend:

- **Auth & data:** Supabase (`@supabase/supabase-js`) — same project as the web app
- **Backend:** the 168 Next.js API routes under `apps/web/app/api`, called over HTTPS
- **Types:** `@maiyuri/shared` (workspace) — one source of truth for the data model
- **Styling:** NativeWind (Tailwind syntax)
- **State/data:** Zustand + TanStack Query

> This lives **alongside** the Capacitor shell in `apps/mobile`. Neither replaces
> the other yet — see the repo discussion on mobile strategy.

## Prerequisites (one-time)

This machine has **no Node toolchain installed**. Install:

1. **Node.js LTS 20.x** — https://nodejs.org (gets you `npm` / `npx`)
2. **EAS CLI** (for cloud Android builds, no Android Studio needed):
   ```bash
   npm install -g eas-cli
   ```
3. **Expo Go** app on your Android phone (from the Play Store) for live dev.

## Setup

```bash
# From the repo root — installs all workspaces incl. this app + @maiyuri/shared
npm install --legacy-peer-deps

# Configure env
cd apps/native
cp .env.example .env
# Fill in EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (reuse the web app's NEXT_PUBLIC_* values)
# and EXPO_PUBLIC_API_BASE_URL (https://mb.maiyuri.com)
```

## Run in development

```bash
cd apps/native
npm start          # starts Metro; scan the QR code with Expo Go on your phone
```

The app loads against your **live** Supabase + API, so log in with a real account.

## Build a Play Store / installable Android app (cloud — no Android Studio)

```bash
cd apps/native
eas login                      # one-time, free Expo account
eas build:configure            # one-time
npm run build:android:preview  # produces an installable APK (internal testing)
npm run build:android:prod     # produces an AAB for the Play Store
```

EAS builds in the cloud and gives you a download link / Play Store-ready artifact.

## What's implemented (vertical slice)

- `app/index.tsx` — auth gate (session check → app or login)
- `app/(auth)/login.tsx` — Supabase email/password sign-in
- `app/(tabs)/index.tsx` — leads list (search, pull-to-refresh) via `GET /api/leads`
- `app/(tabs)/settings.tsx` — account + sign out
- `app/leads/[id].tsx` — lead detail with call / WhatsApp actions via `GET /api/leads/:id`

## Architecture notes

- **API envelope:** routes return `{ data, error, meta }` (see
  `apps/web/src/lib/api-utils.ts`). The client in `src/lib/api.ts` unwraps `data`
  and throws `ApiError` on `error` / non-2xx.
- **Auth token:** `src/lib/api.ts` attaches the Supabase access token as a
  `Bearer` header on every request.
- **Session storage:** AsyncStorage (not expo-secure-store) because SecureStore's
  ~2KB per-value limit can truncate Supabase sessions. To harden, implement a
  chunking SecureStore adapter and swap it into `src/lib/supabase.ts`.
- **Monorepo:** `metro.config.js` watches the repo root and resolves hoisted
  modules so `@maiyuri/shared` works without publishing.

## Next screens to add (repeat the leads pattern)

Dashboard / KPIs, Tasks, Deliveries, Knowledge Q&A, Approvals, Coaching — each
maps to an existing route group under `apps/web/app/api`.

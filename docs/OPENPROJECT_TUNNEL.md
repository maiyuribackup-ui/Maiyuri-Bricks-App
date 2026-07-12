# OpenProject @ op.maiyuri.com — tunnel runbook

OpenProject runs in Docker on the founder's PC (all-in-one image, port 8080,
bundled PG + memcached). It is published to the internet as
`https://op.maiyuri.com` through a **Cloudflare Tunnel** — no port
forwarding, no router changes. maiyuri.com's DNS is already on Cloudflare,
so the subdomain mapping is instant.

The app bridge (see `/api/cron/openproject-sync` + the maiyuri-architecture
skill §3.13) treats "tunnel host offline" as a normal state — the sync skips
quietly when this PC is asleep and catches up on the next 30-min tick.

## One-time setup (~15 min)

### 0. Start Docker the safe way (this PC only)
This machine leaves undeletable socket files behind. **Always** run
`Start-Docker-Clean.ps1` before starting Docker Desktop, then bring
OpenProject up and confirm `http://localhost:8080` answers.

### 1. Create the tunnel (Cloudflare dashboard)
1. <https://one.dash.cloudflare.com> → **Networks → Tunnels → Create a tunnel**
2. Connector type **Cloudflared**, name it `maiyuri-op`, Save.
3. Cloudflare shows install commands — pick **Docker**. Copy ONLY the token
   from the shown command (the long string after `--token`).

### 2. Run the connector container
Replace `<TOKEN>` with the copied token (fine to paste locally — it is a
tunnel credential scoped to this one tunnel; treat it like a password):

```powershell
docker run -d --name maiyuri-op-tunnel --restart unless-stopped `
  cloudflare/cloudflared:latest tunnel run --token <TOKEN>
```

`--restart unless-stopped` makes it survive Docker/PC restarts.

### 3. Map the hostname
Back in the tunnel's **Public Hostname** tab → Add:
- Subdomain `op`, domain `maiyuri.com`
- Service **HTTP** → `host.docker.internal:8080`
  (the connector runs inside Docker; `localhost` would point at the
  container itself — `host.docker.internal` reaches the PC.)

`https://op.maiyuri.com` should now open OpenProject. HTTPS is automatic.

### 4. (Recommended) Lock it behind Cloudflare Access
Zero Trust → **Access → Applications → Add** → Self-hosted →
`op.maiyuri.com` → policy *Allow* with your team's email addresses.
Outsiders then never even see the OpenProject login page.
**Note:** if you enable Access, the API is also gated — create a
**Service Token** (Access → Service Auth) and add a bypass policy for it,
or scope the Access policy to paths excluding `/api/*`. Simplest working
combo: Access policy on everything EXCEPT `/api/*` (add a second
application for `op.maiyuri.com/api/*` with policy "Service Auth" or
"Bypass" — OpenProject's own API-key auth still protects it).

### 5. Wire the app
1. OpenProject → avatar → **My account → Access tokens → API** → generate.
2. Vercel → maiyuri project → Settings → Environment Variables:
   - `OPENPROJECT_URL` = `https://op.maiyuri.com`
   - `OPENPROJECT_API_KEY` = the token
3. Redeploy.
4. Staff who should receive OP tasks on their phone must have the **same
   email** in OpenProject as in the app (Settings → Team).

### 6. Verify
GitHub → Actions → **OpenProject bridge sync** → Run workflow. Expect
`{"packages":N,"created":...}` — or assign yourself a work package in OP,
run it, and watch the push notification arrive in the Maiyuri app.

## Day-2 notes
- PC asleep ⇒ op.maiyuri.com serves a Cloudflare 5xx and the sync skips;
  no alerts fire. Tasks already synced to phones keep working (they live
  in the app's DB).
- If OpenProject becomes business-critical, move its container + the
  connector to the Synology NAS (Priyam_NAS) — same tunnel token works.
- Container health: `docker logs maiyuri-op-tunnel --tail 20` shows the
  four Cloudflare edge connections when healthy.

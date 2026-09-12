# OpenProject exposure — Tailscale Funnel runbook (current)

> **History:** this doc originally described a Cloudflare Tunnel plan
> (`op.maiyuri.com`). That path was abandoned when we found OpenProject was
> not on the Windows host at all — it lives inside a VMware VM already on
> the founder's tailnet, so **Tailscale Funnel** was the shorter road. A
> leftover (harmless, DNS-less) `op.maiyuri.com` ingress entry remains in
> the Immich cloudflared config and can be deleted.

## Where everything is

| Thing | Value |
|---|---|
| Host | VMware Workstation VM **"Openclaw"** (Ubuntu) on the founder's PC |
| Container | `openproject` — `openproject/openproject:16` all-in-one (bundled PG + memcached) |
| Compose | `/home/ram/openproject-docker/docker-compose.yml` (user `ram`) |
| Local bind | `127.0.0.1:8080 → 80` (localhost-only, by design) |
| Public URL | `https://ram-vmware-virtual-platform.tailec7c1f.ts.net` |
| Exposure | `tailscale funnel --bg 8080` (survives reboots) |
| VM tailnet IP | `100.77.129.54` |
| SSH | `ssh -i "Claude workings/openproject/.ssh/openclaw_ed25519" ram@100.77.129.54` |
| App env (Vercel) | `OPENPROJECT_URL` = the ts.net URL · `OPENPROJECT_API_KEY` = API token |

Key container env (already set): `OPENPROJECT_HOST__NAME` = the ts.net name,
`OPENPROJECT_HTTPS=true`. OpenProject **400s with "Invalid host_name
configuration"** for any Host header that doesn't match — if the URL ever
changes, change this env and `docker compose up -d` again.

## Day-2 operations

- **VM/PC asleep** → the funnel URL serves an error and the app's
  `openproject-sync` cron skips gracefully (no Telegram alert). It catches
  up on the next 30-min tick. Alerts from that workflow mean real bugs.
- **Check funnel:** on the VM, `tailscale funnel status`. Re-enable with
  `tailscale funnel --bg 8080` (user `ram` is the tailscale operator — no
  sudo needed).
- **Check container:** `docker ps`, `docker logs openproject --tail 50`,
  restart with `cd ~/openproject-docker && docker compose up -d`.
- **Backups:** pgdata lives in the named volume `openproject-docker_pgdata`
  inside the VM. There is currently NO off-VM backup of OpenProject data —
  if it becomes business-critical, add a dump job (and consider moving the
  container to the Synology NAS).
- **Other services on this VM:** `maiyuri-metabase` (:3030), Mealie (:9925),
  Homepage (:3003) — unrelated; don't touch when working on OpenProject.
- Tailscale SSH is intentionally **disabled** on the VM (`tailscale set
  --ssh=false`): its check-mode kept denying sessions. Plain sshd +
  authorized_keys is the working path.

## Bridge verification

GitHub → Actions → **OpenProject bridge sync** → Run workflow. Healthy
responses: `{"packages":N,"created":…}` or, when the PC is off,
`{"skipped":true,"reason":"OpenProject unreachable…"}`. Full loop test:
assign a work package in OpenProject (assignee's email must match their app
email) → push notification + My Work task on the phone → complete it in the
app → the package closes in OpenProject with a comment.

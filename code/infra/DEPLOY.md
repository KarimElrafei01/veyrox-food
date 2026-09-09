# Deploy the backend (Phase 0 — one server)

Runs `api` + `worker` + `redis` on the box with Docker Compose. Postgres is Neon (external).
Uses the **dev** Neon project for now. HTTPS is either your existing host proxy or a bundled
Caddy — pick one in step 5.

Server: `65.109.239.222`.

---

## 0. Check what's already there

SSH in (`ssh root@65.109.239.222`) and run:

```
docker version && docker compose version     # Docker + the compose plugin
which caddy && caddy version                  # host Caddy binary?
systemctl is-active caddy nginx 2>/dev/null   # is a proxy running?
sudo ss -tlnp | grep -E ':(80|443|3001)\b'    # what's listening on these ports
```

- **Docker present** → skip step 2.
- **Something on 80/443** (your Caddy) → you'll use it as the proxy (step 5, option A).
- **Nothing on 80/443** → use the bundled Caddy (step 5, option B).

## 1. Firewall

Only if you use the **bundled** Caddy: open inbound TCP **80** and **443** in the Hetzner
Cloud console → your server → Firewalls. If your host proxy already serves HTTPS, its ports
are already open — nothing to do.

## 2. Install Docker (skip if step 0 showed it)

```
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code

```
git clone https://github.com/KarimElrafei01/veyrox-food.git
cd veyrox-food/code
```

Later, to update: `git pull` in this folder.

## 4. Create the env file

```
cp infra/api.env.example infra/api.env
nano infra/api.env
```

Fill in:

- `DATABASE_URL` and `DATABASE_ADMIN_URL` — the two Neon **dev** URLs from your local
  `code/.env` (the `postgresql://...neon.tech/veyrox_food?sslmode=require` lines).
- `SESSION_KEY` — run `openssl rand -hex 32`, paste the output.
- `WHATSAPP_APP_SECRET` — `placeholder` for now.
- `API_DOMAIN` — only matters for the bundled Caddy (option B). Leave the default otherwise.

Then: `chmod 600 infra/api.env`

## 5. Start it — pick ONE

The API always publishes on `127.0.0.1:3001` (localhost only).

### Option A — you already run Caddy/nginx on the host

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env up -d --build
```

Then add a site to your host Caddyfile (usually `/etc/caddy/Caddyfile`):

```
your-api-hostname {
    reverse_proxy localhost:3001
}
```

`your-api-hostname` is whatever DNS name points at this box (e.g. `api.veyroxai.com`, or
`65-109-239-222.nip.io` for no DNS). Reload: `sudo systemctl reload caddy`.

### Option B — nothing on 80/443, let Compose run Caddy

Set `API_DOMAIN` in `infra/api.env` first (e.g. `65-109-239-222.nip.io`), open ports 80+443
(step 1), then:

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env --profile edge up -d --build
```

First run builds the image (a few minutes) and Caddy fetches the cert.

## 6. Create the database tables

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env run --rm api \
  pnpm --filter @veyroxai/db db:migrate
```

Optional — load the placeholder pilot menu:

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env run --rm api \
  pnpm --filter @veyroxai/db db:seed
```

## 7. Check it works

From the box:

```
curl http://localhost:3001/health          # the container directly
```

From anywhere, through the proxy:

```
curl https://your-api-hostname/health
```

Expect `200` with a small JSON body. If the cert isn't ready, wait a minute and retry.

Logs if something's off:

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env logs -f api
```

## 8. Point the frontends at the API

In **each** Cloudflare Pages project, set:

```
VITE_API_BASE_URL = https://your-api-hostname
```

then redeploy each SPA.

---

## Everyday commands (run from `veyrox-food/code`)

| Do this                 | Command                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Update to latest `main` | `git pull && docker compose -f infra/compose.prod.yml --env-file infra/api.env up -d --build` |
| Restart                 | `docker compose -f infra/compose.prod.yml --env-file infra/api.env restart`                   |
| Stop                    | `docker compose -f infra/compose.prod.yml --env-file infra/api.env down`                      |
| Logs                    | `docker compose -f infra/compose.prod.yml --env-file infra/api.env logs -f`                   |

(Add `--profile edge` to every command if you use the bundled Caddy.)

## Not done yet

- CI/CD — the image is built on the box by hand for now.
- Backups / HA — Phase 0 skips these until M3 (ADR-0011). The dev database holds nothing
  real, so that's fine for now.

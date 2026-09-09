# Deploy the backend (Phase 0 — one server)

Runs `api` + `worker` + `redis` + an HTTPS proxy (Caddy) on one box with Docker Compose.
Postgres is Neon (not on the box). Uses the **dev** Neon project for now.

Server: `65.109.239.222`. Hostname: `65-109-239-222.nip.io` (nip.io resolves any
`<ip-with-dashes>.nip.io` to that IP, so **no DNS setup is needed**).

---

## 1. Open ports 80 and 443 to the server

In the Hetzner Cloud console → your server → **Firewalls**, allow inbound TCP **80** and
**443** from anywhere. (Caddy needs 80 to get the HTTPS certificate, 443 to serve.)

## 2. SSH in

```
ssh root@65.109.239.222
```

## 3. Install Docker (once)

```
curl -fsSL https://get.docker.com | sh
```

## 4. Get the code

```
git clone https://github.com/KarimElrafei01/veyrox-food.git
cd veyrox-food/code
```

(Later, to update: `git pull` in this folder.)

## 5. Create the env file

```
cp infra/api.env.example infra/api.env
nano infra/api.env
```

Fill in:

- `API_DOMAIN=65-109-239-222.nip.io` (already set)
- `DATABASE_URL` and `DATABASE_ADMIN_URL` — copy the two Neon **dev** URLs from your
  local `code/.env` (the `postgresql://...neon.tech/veyrox_food?sslmode=require` lines).
- `SESSION_KEY` — generate one: run `openssl rand -hex 32` and paste the output.
- `WHATSAPP_APP_SECRET` — put `placeholder` for now; the webhook isn't wired yet.

Save (Ctrl+O, Enter, Ctrl+X). Then lock it down:

```
chmod 600 infra/api.env
```

## 6. Start everything

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env up -d --build
```

First run builds the image (a few minutes) and Caddy fetches the HTTPS cert.

## 7. Create the database tables

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env run --rm api \
  pnpm --filter @veyroxai/db db:migrate
```

Optional — load the placeholder pilot menu:

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env run --rm api \
  pnpm --filter @veyroxai/db db:seed
```

## 8. Check it works

```
curl https://65-109-239-222.nip.io/health
```

Expect `200` with a small JSON body. If it says the cert isn't ready yet, wait a minute
and retry.

Watch logs if anything is off:

```
docker compose -f infra/compose.prod.yml --env-file infra/api.env logs -f api
```

## 9. Tell the frontends where the API is

In **each** Cloudflare Pages project, set the environment variable:

```
VITE_API_BASE_URL = https://65-109-239-222.nip.io
```

then trigger a new deploy of each SPA.

---

## Everyday commands

| Do this                 | Command (run from `veyrox-food/code`)                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Update to latest `main` | `git pull && docker compose -f infra/compose.prod.yml --env-file infra/api.env up -d --build` |
| Restart                 | `docker compose -f infra/compose.prod.yml --env-file infra/api.env restart`                   |
| Stop                    | `docker compose -f infra/compose.prod.yml --env-file infra/api.env down`                      |
| Logs                    | `docker compose -f infra/compose.prod.yml --env-file infra/api.env logs -f`                   |

## When you move to a real domain

Set `API_DOMAIN=api.veyroxai.com` in `infra/api.env`, add a DNS `A` record
`api → 65.109.239.222` (DNS-only / grey cloud so Caddy can issue the cert), then
`up -d`. Update `VITE_API_BASE_URL` in the Pages projects to match.

## Not done yet

- CI/CD (the image is built on the box by hand for now).
- Backups / HA — Phase 0 knowingly skips these until M3 (ADR-0011). The dev database has
  nothing real in it, so that's fine for now.

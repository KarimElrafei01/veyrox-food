# syntax=docker/dockerfile:1
#
# One image for `api` and `worker` — same code, the runtime command picks the
# entrypoint (ADR-0001, ADR-0011). No compile step: both run their TypeScript
# entrypoint directly via tsx.
#
#   docker build -f infra/Dockerfile -t veyroxai-api code/
#
FROM node:22-slim
ENV HUSKY=0
RUN corepack enable
WORKDIR /app

COPY . .
# Full install — tsx is a devDependency but is the runtime. NODE_ENV is left unset
# here so pnpm keeps devDependencies; compose sets NODE_ENV=production at run time.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# api listens on API_PORT (default 3001); worker listens on nothing.
EXPOSE 3001

# Overridden by the worker service in compose.prod.yml.
CMD ["pnpm", "--filter", "@veyroxai/api", "start"]

# Deployment

> **Railway is not used.** This project no longer runs on Railway, has no Railway account, and will not use it again. References to Railway in `docs/build-log/` are historical. The production host is still to be decided; confirm it with the maintainer rather than assuming one.

## What runs in production

| Service | Image | Port | Health checks |
|---|---|---|---|
| API (Fastify) | `Dockerfile.api` | 3001 | `GET /healthz` (liveness), `GET /readyz` (503 until Postgres and Redis are reachable) |
| Web dashboard (Next.js) | `Dockerfile.web` | 3000 | `GET /api/health` |
| Cron jobs | `Dockerfile.cron` | 3002 | `GET /healthz` |
| Postgres 16 | managed or container | 5432 | — |
| Redis 7 | managed or container | 6379 | — |

Any host that runs Docker containers works, for example a VPS with Docker Compose.

## Requirements

- Serve the web dashboard over HTTPS. Session cookies are `Secure` in production.
- Put the API behind a reverse proxy that forwards the real client IP (the API trusts proxy headers for rate limiting).
- Set `INTERNAL_API_URL` on the web service to the API's private address, for example `http://api:3001`.
- Copy `.env.example` to `.env` and fill in every value. Never commit `.env`.
- Run database migrations (`pnpm db:migrate`) before starting the API.

## Still to do (chunk 9)

- Choose the production host.
- DNS for the public domain.
- Email authentication for the sending domain: SPF, DKIM, DMARC.

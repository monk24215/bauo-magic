# wiredhowse-magic-link

Free, hosted magic-link authentication. Paste a JS snippet on your site — visitors enter their email, receive a magic link, and get a session. No passwords, no third-party cookie workarounds.

Production: **magic-link.wiredhowse.app**

## Packages

| Package | Description |
|---|---|
| `packages/api` | Fastify API (Railway service) |
| `packages/web` | Next.js 15 dashboard + public pages (Railway service) |
| `packages/snippet` | Browser snippet, under 15 KB gzipped, served at `/v1/snippet.js` |
| `packages/db` | Drizzle ORM schema + migrations |
| `packages/shared` | Shared TypeScript types + Zod schemas |

## Stack

Node 20 · TypeScript (strict) · Fastify · Next.js 15 · Drizzle ORM · Postgres 16 · Redis · Resend · pnpm workspaces · Biome · Vitest

## Quickstart

```bash
pnpm install
cp .env.example .env   # fill in local values
pnpm dev:api           # :3001
pnpm dev:web           # :3000
```

## CI checks

```bash
pnpm typecheck   # strict tsc across all packages
pnpm lint        # biome
pnpm test        # vitest unit tests
```

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for full setup and integration test instructions.

## Deployment

The API, web dashboard, and cron service each run as a Railway service (`Dockerfile.api`, `Dockerfile.web`, `Dockerfile.cron`). The dashboard depends on server-side rewrites and middleware, so it cannot be hosted as a static site such as GitHub Pages. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Document | Purpose |
|---|---|
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Local setup, tests, conventions |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Railway services, environment, DNS |
| [docs/faqs/site-owner-faq.md](docs/faqs/site-owner-faq.md) | FAQ for site owners embedding the snippet |
| [docs/faqs/end-user-faq.md](docs/faqs/end-user-faq.md) | FAQ for people signing in with a magic link |
| [docs/build-log/](docs/build-log/README.md) | Chunk-by-chunk record of how the service was built |
| [docs/resources/](docs/resources/README.md) | Background research material |

## Accessibility

The dashboard targets WCAG 2.2 AA: keyboard reachable with a skip link and visible focus, labelled form fields, dialogs announced as modal, current-page state on navigation, and reduced motion honoured. Please keep new UI to the same bar.

## License

MIT

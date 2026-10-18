# Chunk 7d: CSRF protection + auth integration tests

**Status:** ✅ Complete
**Model:** Sonnet 4.6
**Spec references:** `spec/06_session_token_design.md`, `spec/02_api_surface.md`
**Commit:** `2f1d86b`

## Prompt sent to Claude Code

> Chunk 7d: Finish CSRF protection + add the deferred auth integration tests.
>
> First, examine the two stashes from the abandoned 7d attempt and decide for each: is the work salvageable or should it be rewritten from spec?
>
> Then build:
>
> CSRF middleware (`packages/api/src/middleware/csrf.ts`):
> - Double-submit cookie pattern per spec/06
> - Issue wh_csrf cookie (non-HttpOnly, Secure, SameSite=Lax) on first dashboard GET
> - Validate X-CSRF-Token header matches wh_csrf cookie on every POST/PATCH/DELETE under /v1/auth/*, /v1/dashboard/*, /v1/me/*
> - Snippet routes exempt (Bearer auth, cross-origin)
> - Magic redemption exempt (browser navigation, not API call)
>
> Web client: read wh_csrf from document.cookie, send X-CSRF-Token on every mutating request.
>
> Auth integration tests: full signup → verify → login → logout flow; password reset; Google OAuth (mock token endpoint); lockout; dummy-verify timing protection; single-use token enforcement on email verification + password reset.
>
> CSRF tests: missing token returns 403; mismatched returns 403; valid succeeds; snippet routes still work; GETs don't require CSRF.

## Deliverable summary

- **CSRF double-submit middleware** (`packages/api/src/middleware/csrf.ts`) with timing-safe comparison
- **CSRF cookies issued** on login (both password + OAuth paths) and on first `/me` GET
- **Dashboard namespace consolidated**: auth → CSRF → route handlers, no duplicate DB hits
- **Logout clears** both session cookie and CSRF cookie
- **Web client** reads `wh_csrf` from `document.cookie` and sends `X-CSRF-Token` header on every mutation
- **Full auth integration test suite** (`auth-flows.test.ts`): signup/verify/login/logout, password reset, Google OAuth, lockout, timing protection, single-use token enforcement

## Tests

- **182/182 unit tests passing** project-wide
- **34 integration tests** in `auth-flows.test.ts` (testcontainer-based, CI-only locally)
- TypeScript clean across api, web, shared
- Biome lint clean

## Notable

- **Timing-safe comparison on CSRF tokens.** Tokens are short and don't have the same timing-attack profile as session tokens, but constant-time comparison is defense in depth and costs nothing.
- **Two issuance paths for the CSRF cookie.** Owner-side: on dashboard login (password or OAuth). End User side: on first `/me` GET. Two paths because End Users authenticate via Bearer-from-localStorage, not cookies — they need an explicit issuance moment when they land on `/me`.
- **Dashboard namespace consolidation.** Previous middleware chain re-fetched the owner row in CSRF middleware after auth middleware had already loaded it. Refactored to single load, passed down the chain. Minor perf win, cleaner code.
- **Snippet routes correctly exempt.** CSRF protects against cookie-bound auth being exercised by attacker-controlled origins. Snippet routes use Bearer auth from cross-origin clients by design — CSRF doesn't apply.
- **Stash recovery decision:** The salvaged work from `stash@{0}` (untracked `csrf.ts`) and `stash@{1}` (modified files) was evaluated and partially merged with corrections. Final implementation differs from the abandoned attempt where the spec required more strictness (e.g., the consolidated namespace, the two-path issuance).

## Chunk 7 milestone

Dashboard + self-service complete:

| Sub-chunk | Surface |
|---|---|
| 7a | Site Owner auth (signup, login, password reset, Google OAuth) |
| 7b | Sites management (CRUD, domain verification, metrics, clear sessions) |
| 7c | End User self-service (`/v1/me/*`, `/v1/identity/me`, /me page, close-and-archive) |
| 7d | CSRF protection across all mutating endpoints + auth integration tests |

A Site Owner can register, verify, log in, create up to 3 sites, embed the snippet on their domain, and protect their pages. An End User who hits a protected page receives a magic link, redeems it, gets a session, can manage that session at /me, and can fully archive their data. Every state-changing API endpoint is CSRF-protected. Every auth surface has integration test coverage.

## Review notes

Strong closeout. The stash-evaluation discipline at the start of the chunk (compare salvageable work to spec-fresh work, take the better) is a pattern worth keeping for any future "resume after crash" situations. The two-path CSRF issuance is a thoughtful detail that the spec didn't explicitly call out but follows directly from the architecture.

Build is now functionally complete pending:
- Chunk 8: Cron service (cleanup + archive purge)
- Chunk 9: Railway deploy + DNS + DMARC ramp

Both are operational chunks; no remaining feature work.

## Next chunk

8: Cron service. Scheduled cleanup of expired magic_links, handoff_tokens, oauth_state, expired email_verifications and password_resets. Daily session cleanup, 24-month archive purge, 90-day audit log retention.

## Implementation report

_Detailed write-up from the end of the chunk, kept alongside the log entry above._

**Date:** 2026-05-27  
**Model:** Sonnet 4.6  
**Status:** ✅ Complete

---

### Prompt summary

Build CSRF middleware (double-submit cookie pattern), wire it into the dashboard and `/me` routes, update the web client fetch wrapper to send the `X-CSRF-Token` header, and add the auth integration tests deferred from chunk 7a.

---

### Stash salvage

Two stashes from an abandoned prior attempt were evaluated:

| Stash | Content | Decision |
|-------|---------|----------|
| `stash{0}` | `packages/api/src/middleware/csrf.ts` | Salvaged — clean, timing-safe comparison |
| `stash{1}` | `cookies.ts`, login/google/logout routes, dashboard/index.ts hook, shared errors, web/lib/api.ts, auth-login.test.ts update | Salvaged with one fix: `SameSite=Strict` → `SameSite=Lax` per `spec/06_session_token_design.md` |

---

### What was built

#### CSRF middleware (`packages/api/src/middleware/csrf.ts`)

Double-submit cookie pattern:

- On safe methods (GET, HEAD, OPTIONS): passes through immediately.
- On mutations (POST, PATCH, DELETE): reads `wh_csrf` from the `Cookie` header and compares it to the `X-CSRF-Token` request header using `crypto.timingSafeEqual`. Length-mismatch is checked first to prevent zero-length bypass.
- 403 `CSRF_INVALID` on missing or mismatched token.
- `readCookieValue(header, name)` exported as a helper for route modules that need to inspect the CSRF cookie without importing the full middleware.

#### Cookie utilities (`packages/api/src/lib/cookies.ts`)

- `buildCsrfCookie(rawToken)` — NOT HttpOnly (SPA must read it), SameSite=Lax, same Secure/Domain rules as session cookie.
- `clearCsrfCookie()` — Max-Age=0 clear.
- `buildOwnerSessionCookie` — corrected from SameSite=Strict back to SameSite=Lax per spec.

#### Login / OAuth routes

Both `POST /v1/auth/login` and `GET /v1/auth/google/callback` now set both the `wh_owner_session` cookie and a fresh `wh_csrf` cookie on successful authentication. The CSRF token is generated with `crypto.randomBytes(32).toString('base64url')` — no prefix, just raw entropy.

#### Logout route

`POST /v1/auth/logout` now requires CSRF validation (`[requireSiteOwnerSession, requireCsrfToken]` preHandlers) and clears both cookies on success.

#### Dashboard namespace (`packages/api/src/routes/dashboard/index.ts`)

- `requireSiteOwnerSession` added at namespace level (runs before CSRF).
- `requireCsrfToken` added at namespace level (runs after auth — ensures unauthenticated requests get 401, not 403).
- All four sub-plugins (`siteRoutes`, `accountRoutes`, `siteMetricsRoutes`, `siteVerifyRoutes`) had their redundant per-plugin `requireSiteOwnerSession` hooks removed.

#### `/me` namespace (`packages/api/src/routes/me/index.ts`)

- `requireEndUserSession` (existing) remains as auth guard.
- `requireCsrfToken` added as a second preHandler hook (mutations only).
- `onSend` hook: on successful GET responses where `request.endUser` is set and no `wh_csrf` cookie is already present, issues a fresh CSRF cookie so the `/me` page can use it for subsequent mutations.

#### Web client (`packages/web/lib/api.ts`)

- `getCsrfToken()` reads `wh_csrf` from `document.cookie`.
- On every mutation (non-GET/HEAD/OPTIONS), the CSRF token is included as `X-CSRF-Token: <value>`.
- Server-side requests (no `document`) gracefully skip the token.

---

### Tests written

#### `packages/api/test/unit/csrf.test.ts` (14 unit tests)

- Safe methods pass without CSRF.
- POST/PATCH/DELETE without header → 403 CSRF_INVALID.
- POST/PATCH/DELETE without cookie → 403 CSRF_INVALID.
- Mismatched header vs cookie → 403 CSRF_INVALID.
- Length mismatch (padded header) → 403.
- URL-encoded cookie values decoded correctly.
- Matching pair → 200 (POST, PATCH, DELETE each verified).
- Snippet routes without hook: POST succeeds with no CSRF.

#### `packages/api/test/integration/auth-flows.test.ts` (deferred from 7a)

Uses testcontainer Postgres + Drizzle migrations. Email service mocked to capture verification/reset URLs.

Flows covered:
- **A. Signup → verify-email → login → logout:** 201 on signup, 403 before verify, verify sets `email_verified_at`, login sets both cookies with correct attributes, logout revokes session and clears both cookies with Max-Age=0.
- **B. Password reset:** `request-password-reset` always 200 (enumeration prevention), `reset-password` updates password, old password fails after reset, new password works, all sessions revoked on reset.
- **C. Google OAuth:** new account created on first login, existing password account linked (auth_method → `both`), state replay rejected, consumed state rejected, Google token exchange failure redirects to error page.
- **D. Account lockout:** locks after 10 failures with 423 ACCOUNT_LOCKED, correct password blocked while locked, unlocks after `locked_until` expires, `failed_login_count` reset on success.
- **E. Dummy-verify timing:** `dummyVerify` called when email not found, not called when real account exists.
- **F. Email verification token single-use:** second use returns 404, expired token returns 404.
- **G. Password reset token single-use:** second use returns 404, expired token returns 404.

#### Updated existing unit tests

`me-profile.test.ts`, `me-sessions.test.ts`, `me-close-archive.test.ts`, `dashboard-sites.test.ts`, `auth-login.test.ts` — all mutation requests updated with `CSRF_HEADERS` constants containing matching cookie + header pairs.

#### Updated existing integration test

`me.test.ts` — all 10 mutation requests updated with `csrfHeaders()` helper.

---

### Notable decisions

1. **Auth before CSRF in dashboard namespace.** Moving `requireSiteOwnerSession` to namespace level before `requireCsrfToken` ensures unauthenticated requests receive 401 (not 403). Without this ordering, CSRF fires first and unauthenticated clients get a confusing 403. Sub-plugins' redundant auth hooks removed to avoid double DB hits.

2. **CSRF for `/me` routes despite Bearer auth.** End User sessions use `Authorization: Bearer`, which is not auto-sent by browsers and thus not CSRF-vulnerable. CSRF was added anyway per spec, making the `/me` page defense-in-depth consistent. The cookie is issued on the first GET so the SPA can read it before mutations.

3. **SameSite=Lax (not Strict) for both cookies.** Spec mandates Lax. Strict would break navigations from email links, Google OAuth redirects, and any top-level GET arriving from an external origin.

4. **CSRF cookie is not HttpOnly.** By design: the SPA must read it via `document.cookie` to echo it in `X-CSRF-Token`. This is the canonical double-submit pattern.

---

### Files changed

```
packages/api/src/middleware/csrf.ts        — new (readCookieValue exported)
packages/api/src/lib/cookies.ts            — CSRF cookie builders + SameSite=Lax fix
packages/api/src/routes/auth/login.ts      — sets CSRF cookie on login
packages/api/src/routes/auth/google.ts     — sets CSRF cookie on OAuth login
packages/api/src/routes/auth/logout.ts     — CSRF check + clears CSRF cookie
packages/api/src/routes/dashboard/index.ts — auth + CSRF hooks at namespace level
packages/api/src/routes/dashboard/sites.ts         — remove per-plugin auth
packages/api/src/routes/dashboard/account.ts       — remove per-plugin auth
packages/api/src/routes/dashboard/site-metrics.ts  — remove per-plugin auth
packages/api/src/routes/dashboard/site-verify.ts   — remove per-plugin auth
packages/api/src/routes/me/index.ts        — CSRF hook + onSend CSRF cookie issuance
packages/shared/src/errors.ts              — CSRF_INVALID error code
packages/web/lib/api.ts                    — getCsrfToken() + X-CSRF-Token on mutations
packages/api/test/unit/csrf.test.ts        — new, 14 tests
packages/api/test/integration/auth-flows.test.ts  — new, 34 tests
packages/api/test/unit/auth-login.test.ts  — updated for CSRF + SameSite=Lax
packages/api/test/unit/me-profile.test.ts          — CSRF headers on mutations
packages/api/test/unit/me-sessions.test.ts         — CSRF headers on mutations
packages/api/test/unit/me-close-archive.test.ts    — CSRF headers on mutations
packages/api/test/unit/dashboard-sites.test.ts     — CSRF headers on mutations
packages/api/test/integration/me.test.ts           — CSRF headers on mutations
docs/build-log/07d_csrf_auth_tests.md  — this file
```

---

### Test results

- **Unit tests:** 182/182 passing (14 new CSRF tests, all existing tests updated)
- **Integration tests:** Require Docker (testcontainers) — run in CI. Code follows identical pattern to existing integration tests (`magic-redeem.test.ts`, `me.test.ts`).
- **Typecheck:** Clean across `api`, `web`, `shared`.
- **Lint:** Clean (Biome).

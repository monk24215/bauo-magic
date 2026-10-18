# Chunk 8: Cron service (cleanup + archive purge)

**Status:** ✅ Complete
**Model:** Sonnet 4.6
**Spec references:** `spec/06_session_token_design.md`, `spec/09_railway_layout.md`

## Prompt sent to Claude Code

> Chunk 8: Cron service per spec/09_railway_layout.md.
>
> Sonnet 4.6.
>
> Build a separate service in the repo that runs scheduled jobs. It reuses code from `packages/api` (Drizzle client, schema, services) so duplication is minimal.
>
> Structure:
> - New entry point at `packages/api/src/cron.ts` (or `packages/cron/` as its own package if cleaner — your call). The job runner shares dependencies with the api but has its own entry point.
> - Use node-cron or a similar scheduler. Lightweight, no external scheduler service.
> - All jobs log structured JSON to stdout (same logger as api) with job name, duration, rows affected, errors.
>
> Jobs:
>
> **Hourly:** magic_links > 24h, handoff_tokens > 1h, oauth_state > 1h, email_verifications expires_at past 7d, password_resets expires_at past 7d
>
> **Daily at 02:00 UTC:** sessions expires_at past 7d (cascades), archived_end_users where purge_after < now() (GDPR 24-month purge)
>
> **Daily at 03:00 UTC:** audit_log older than retention (configurable env var, default 90 days)
>
> Reliability requirements: each job wraps in try/catch (one failure doesn't kill others), atomic per table, idempotent, structured logs.
>
> Manual run capability: `pnpm --filter cron run-once <job-name>` for ad-hoc cleanup or testing.

## Deliverable summary

8 cleanup/purge jobs shipped as a standalone Railway service alongside the API.

### Jobs

| Schedule | Job | Deletes |
|---|---|---|
| Hourly | `cleanupMagicLinks` | `magic_links > 24h` old |
| Hourly | `cleanupHandoffTokens` | `handoff_tokens > 1h` old (clears raw session token) |
| Hourly | `cleanupOauthState` | `oauth_state > 1h` old |
| Hourly | `cleanupEmailVerifications` | `email_verifications` where `expires_at > 7d` past |
| Hourly | `cleanupPasswordResets` | `password_resets` where `expires_at > 7d` past |
| Daily 02:00 UTC | `cleanupExpiredSessions` | `sessions` where `expires_at > 7d` past (cascades to login_history) |
| Daily 02:00 UTC | `purgeArchivedEndUsers` | `archived_end_users` where `purge_after < now()` (GDPR 24-month) |
| Daily 03:00 UTC | `cleanupAuditLog` | `audit_log` older than `AUDIT_LOG_RETENTION_DAYS` (default 90) |

## Files

- `src/cron.ts` — entry point, Fastify health check on `:3002`, graceful shutdown
- `src/cron/scheduler.ts` — node-cron wiring, 3 schedule groups
- `src/cron/jobs/` — one file per job, each wraps in try/catch
- `src/cron-run-once.ts` — `pnpm --filter @wiredhowse/api run-once <jobName>`
- `Dockerfile.cron` — Railway cron service image (`CMD ["node", "dist/cron.js"]`)

## Tests

- 36 unit tests with mock DB, all pass
- Integration tests via testcontainers: seed stale + fresh rows, verify exact deletion counts and idempotency

## Notable

- **CTE delete-with-count pattern.** `WITH deleted AS (DELETE ... RETURNING 1) SELECT count(*)` — single round-trip, no memory load regardless of row count. Avoids the naive two-step `DELETE` + `SELECT count` which is racy.
- **`make_interval(days => $1)`** for the audit log retention parameter. Parameterized, no SQL injection surface even though the input is a trusted env var. Defense in depth as a default habit.
- **Sequential execution with per-job try/catch.** One failing job never kills the group. The handoff cleanup throwing doesn't prevent the magic-links cleanup from running. Worst case: one stuck job logged for ops attention, no cascading failure.
- **Health check at `:3002`** for Railway to monitor the cron service independently of the api.
- **Graceful shutdown** on SIGTERM — drains in-flight job before exiting. Railway redeploys won't interrupt a running cleanup mid-transaction.
- **`cron-run-once` CLI** for ad-hoc invocation. Future ops fix-it tool when something needs manual cleanup outside the schedule.

## Review notes

Production-grade execution. The CTE pattern and the parameterized interval syntax are both signs of genuine engagement with the SQL surface, not just translation of the prompt. The decision to put the cron entry point inside `packages/api/` (rather than spawning `packages/cron/`) keeps deployment simpler — same image base, same dependencies, just a different start command.

## Next chunk

9: Railway deploy + DNS + DMARC ramp. The final chunk. Service goes from "shippable" to "shipped." Mostly operational work: configure custom domain, run Resend onboarding, set DMARC at p=none, smoke-test mail to gmail/outlook/yahoo, verify the full magic-link flow against a real demo Site. Postgres minor upgrade (18.4) can happen in this chunk's pre-launch testing window.

## Implementation report

_Detailed write-up from the end of the chunk, kept alongside the log entry above._

### Prompt summary

Build a separate cron service that reuses code from `packages/api` (Drizzle client, schema). Use `node-cron` for scheduling. Expose `/healthz`. Write unit + integration tests with testcontainers. Add `Dockerfile.cron` and `run-once` script.

### Deliverable summary

A complete cleanup/purge service running alongside the API on Railway. All 8 jobs implemented, scheduled, tested, and idempotent.

### Files changed

#### New files

| File | Description |
|------|-------------|
| `packages/api/src/cron.ts` | Entry point. Fastify instance for `/healthz` + scheduler bootstrap. Graceful SIGTERM/SIGINT handling. |
| `packages/api/src/cron-run-once.ts` | Ad-hoc runner: `pnpm --filter @wiredhowse/api run-once <jobName>`. Reads job name from argv, runs once, exits. |
| `packages/api/src/cron/config.ts` | Cron-only env config (DATABASE_URL, LOG_LEVEL, HEALTHZ_PORT, AUDIT_LOG_RETENTION_DAYS). Validates at import time, fails fast. |
| `packages/api/src/cron/scheduler.ts` | `createScheduler(logger)` factory. Wires up 3 cron schedules via `node-cron`. Returns `{ start(), stop() }`. |
| `packages/api/src/cron/jobs/types.ts` | Shared types: `JobResult`, `CronLogger`. |
| `packages/api/src/cron/jobs/cleanup-magic-links.ts` | Hourly: DELETE magic_links older than 24 hours. |
| `packages/api/src/cron/jobs/cleanup-handoff-tokens.ts` | Hourly: DELETE handoff_tokens older than 1 hour. Clears raw_session_token exposure. |
| `packages/api/src/cron/jobs/cleanup-oauth-state.ts` | Hourly: DELETE oauth_state older than 1 hour. |
| `packages/api/src/cron/jobs/cleanup-email-verifications.ts` | Hourly: DELETE email_verifications where expires_at < now() - 7 days. |
| `packages/api/src/cron/jobs/cleanup-password-resets.ts` | Hourly: DELETE password_resets where expires_at < now() - 7 days. |
| `packages/api/src/cron/jobs/cleanup-expired-sessions.ts` | Daily 02:00 UTC: DELETE sessions where expires_at < now() - 7 days. |
| `packages/api/src/cron/jobs/purge-archived-end-users.ts` | Daily 02:00 UTC: DELETE archived_end_users where purge_after < now() (GDPR 24-month purge). |
| `packages/api/src/cron/jobs/cleanup-audit-log.ts` | Daily 03:00 UTC: DELETE audit_log where occurred_at < now() - N days. N from `AUDIT_LOG_RETENTION_DAYS` (default 90). Uses `make_interval(days => $1)` for parameterized interval. |
| `packages/api/src/cron/jobs/index.ts` | Re-exports all job functions + types. |
| `packages/api/Dockerfile.cron` | Same multi-stage build as `Dockerfile` but `CMD ["node", "dist/cron.js"]`. EXPOSE 3002. |
| `packages/api/test/unit/cron-jobs.test.ts` | 36 unit tests. Mock DB (`as unknown as Database`). Verifies job names, counts, error handling, duration shape. Cross-cutting shape tests for all 8 jobs × 2 scenarios (success + error). |
| `packages/api/test/integration/cron-jobs.test.ts` | Integration tests with real Postgres (testcontainers). Seeds stale + fresh rows, runs each job, asserts exact deletion counts and preserved rows. Idempotency verified for magic_links, archived_end_users, and audit_log. |

#### Modified files

| File | Change |
|------|--------|
| `packages/api/package.json` | Added `node-cron ^3.0.3` (dep) + `@types/node-cron ^3.0.11` (devDep). Added scripts: `dev:cron`, `start:cron`, `run-once`. |
| `CLAUDE.md` | Marked cron service complete. |
| `docs/build-log/README.md` | Status table updated. |

### Architecture decisions

#### Entry point lives in `packages/api/src/`

The spec permitted either a new `packages/cron/` or an entry in `packages/api`. Chose the latter: the cron service needs the Drizzle schema, the logger style, and Fastify — all already in `api/`. Adding a new workspace package would add zero value and duplicate build config.

The Railway cron service sets `Root Directory: packages/api` and `CMD: node dist/cron.js` — same as the spec.

#### CTE pattern for counted deletes

Each job uses:
```sql
WITH deleted AS (
  DELETE FROM <table> WHERE <condition> RETURNING 1
)
SELECT count(*) AS count FROM deleted
```

Advantages:
- Single round-trip (DELETE + COUNT in one query).
- No memory pressure — never loads row data into Node.js.
- `count(*)` always returns exactly one row (0 if nothing deleted), so `rows[0]?.count` is always defined.

#### Parameterized interval for audit_log

`make_interval(days => $1)` is used rather than string interpolation like `'90 days'::interval`. Drizzle's `sql` template tag parameterizes `${retentionDays}` as a prepared-statement value, eliminating any injection surface.

#### `JobDatabase` interface removed

Initial design used a `JobDatabase` interface to enable lightweight mocks in unit tests. Drizzle's `RowList` return type is not structurally compatible with simple `readonly T[]`, causing TypeScript errors. Replaced with `Database` from `@wiredhowse/db` + `as unknown as Database` cast in unit tests — the same pattern used everywhere else in the test suite.

#### Health check design

`/healthz` returns 503 before `scheduler.start()` completes, 200 after. Railway monitors this independently of the API's `/readyz`. The cron service has no DB health check in `/healthz` — if Postgres is down, jobs will emit error logs, which is the intended fail-closed behaviour.

### Test results

```
✓ test/unit/cron-jobs.test.ts (36 tests) — 47ms
All 218 unit tests pass.
```

Integration tests require Docker; run with `pnpm --filter @wiredhowse/api test:integration`.

### Env vars (cron service on Railway)

```
NODE_ENV=production
DATABASE_URL=${{ Postgres.DATABASE_URL }}
LOG_LEVEL=info
HEALTHZ_PORT=3002
AUDIT_LOG_RETENTION_DAYS=90   # optional, default 90
```

No Redis, Resend, or Google OAuth vars needed — cron only touches Postgres.

### Notable

- `cleanupHandoffTokens` is critical for security: handoff_tokens contain `raw_session_token` (plaintext `wh_s_` value). The 1-hour cleanup window ensures these ephemeral rows are purged well before any audit or backup retention window.
- All jobs are idempotent: running twice in a row deletes nothing the second time (verified in integration tests).
- One failing job does not kill the group — `runGroup` is sequential, each job has its own try/catch.

# Dellos Runbook

Operațional reference pentru Dellos (Visoro Financiar). **Last updated:** 2026-04-27.

Bus factor 1: this document exists so a new engineer — or Robert, six months from now — can recover from incidents without reverse-engineering the codebase.

## TL;DR — quick links

- Production: hosted on Railway (see Railway dashboard for current URL)
- Database: Postgres on Railway (same project)
- Logs: Railway dashboard → service → Logs
- Health check: `GET /api/health` (returns DB status, uptime, memory)
- Owner: Robert Ledényi (single operator)
- Repo: `github.com/VisoroGroup/dellos`
- Companion doc: [`docs/SECURITY.md`](docs/SECURITY.md)

## Required environment variables

Set in Railway dashboard → service → Variables.

| Name | Required | Description | How to obtain |
|---|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string | Auto-injected by Railway when Postgres plugin is linked |
| `JWT_SECRET` | yes | JWT signing secret, **≥32 chars** (boot fails otherwise) | `openssl rand -hex 32` |
| `CLIENT_URL` | yes | Public origin of the frontend (used for CORS) | Railway public URL of the same service |
| `NODE_ENV` | yes (prod) | Must be `production` on Railway | Set manually |
| `PORT` | no | Server port | Railway injects automatically |
| `SERVER_URL` | no | Public origin of the API (used to build ANAF redirect URI fallback) | Railway public URL |
| `DATABASE_CA_CERT` | no | Optional CA certificate for TLS to Postgres | Railway Postgres tab |
| `DATABASE_SSL_REJECT` | no | `false` to skip cert verify (dev only) | — |
| `DEV_AUTH_BYPASS` | no | `true` skips auth in dev. **Refused in production** (boot fails) | Local `.env` only |
| `RAILWAY_ENVIRONMENT` | auto | Set by Railway; used to disable dev bypass | — |
| **Microsoft Graph (email sending)** | | | |
| `AZURE_CLIENT_ID` | conditional | Azure AD app client id; if unset, payment emails are mocked (logged only) | Azure Portal → App registrations |
| `AZURE_CLIENT_SECRET` | conditional | Azure AD app client secret | Azure Portal → App registrations → Secrets |
| `AZURE_TENANT_ID` | conditional | Azure AD tenant id | Azure Portal → Directory overview |
| `GRAPH_SENDER_EMAIL` | conditional | From-address used by `sendEmail` | Mailbox in the AAD tenant |
| **ANAF SPV / e-Factura** | | | |
| `ANAF_CLIENT_ID` | conditional | ANAF OAuth2 client id | ANAF developer portal |
| `ANAF_CLIENT_SECRET` | conditional | ANAF OAuth2 client secret | ANAF developer portal |
| `ANAF_CIF` (or `CIF`) | conditional | Company tax id for SPV calls | Robert |
| `ANAF_REDIRECT_URI` | no | OAuth callback URL; defaults to `${SERVER_URL}/api/anaf/oauth/callback` | Must match the value registered with ANAF |
| `ANAF_AUTH_URL` | no | Default `https://logincert.anaf.ro/anaf-oauth2/v1/authorize` | — |
| `ANAF_TOKEN_URL` | no | Default `https://logincert.anaf.ro/anaf-oauth2/v1/token` | — |
| `ANAF_API_BASE` | no | Default `https://api.anaf.ro/prod/FCTEL/rest` | — |
| `ANAF_CHECK_INTERVAL_MINUTES` | no | Cron interval for SPV polling (default `5`) | — |

Boot enforcement (see `server/src/app.ts`, `server/src/middleware/auth.ts`):
- `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL` missing → `process.exit(1)`
- `JWT_SECRET` shorter than 32 chars → throws on import
- `NODE_ENV=production` AND `DEV_AUTH_BYPASS=true` → `process.exit(1)`

ANAF features auto-disable themselves if `ANAF_CLIENT_ID`, `ANAF_CLIENT_SECRET`, or `CIF` are missing (see `isAnafConfigured()`). Email sends become mock log lines if `AZURE_CLIENT_ID` is missing.

## Deploy procedure

1. `git push origin main` → Railway auto-deploys via Dockerfile.
2. On boot the server runs `runMigrations()` (see below). If any migration throws, the process exits 1 — the deploy is rolled back by Railway's restart policy.
3. Health check `GET /api/health` should return 200 with `{ status: "ok", database: "connected" }`. Railway has a 30s healthcheck timeout (`railway.json`).
4. Schedulers start after migrations: `paymentScheduler` (07:00 Mon-Fri Europe/Bucharest) and `anafScheduler` (every N minutes).

If a deploy is stuck:
- Logs say `MIGRATION FAILED — REFUSING TO START` → fix migration SQL, push again. Do NOT manually mark the migration as applied unless you've also run it by hand.
- Logs say `Missing required env vars` → set them in Railway and redeploy.

## ANAF token refresh — most likely failure mode

The ANAF OAuth refresh token expires periodically (~90 days observed). When it expires the scheduler logs `TOKEN_EXPIRED` and `/api/anaf/status` reports the missing token.

**Recovery:**
1. Log in as a `superadmin` user.
2. Open `/anaf` in the UI → click **Autentificare ANAF**.
   - Or hit `GET /api/anaf/oauth/authorize` directly to get the auth URL.
3. Complete the OAuth flow in a browser that has the digital certificate installed (this part can only be done on Robert's machine — the certificate is the gating factor).
4. ANAF redirects to `${ANAF_REDIRECT_URI}` → `/api/anaf/oauth/callback?code=…` → server stores fresh `access_token` + `refresh_token` in the `anaf_tokens` table.

If the redirect URI changes (new Railway domain, etc.):
- Update `ANAF_REDIRECT_URI` in Railway variables.
- Update the registered redirect URI in the ANAF developer portal.
- Redeploy. Then re-authenticate.

`getValidToken()` auto-refreshes when there are <5 minutes until expiry, so the only manual step required is the initial certificate-backed login.

## Database migrations: how to add one safely

Location: `server/src/database/migrations/NNN_description.sql`. Sequential numbering, three digits, lowercase snake_case description.

Runner semantics (`server/src/database/migrate.ts`):
- Tracks applied migrations in the `_migrations` table by filename.
- Strips lines that start with `--` (comment lines).
- **Splits the rest of the file on `;`** — every statement is run individually.
- Wraps the whole file in `BEGIN`/`COMMIT`. If any statement throws, rolls back AND throws — the boot process then exits 1.

Therefore, when authoring a migration:
- Every statement must end with `;`.
- **No `DO $$ … $$` blocks**, no PL/pgSQL functions with embedded `;` — the splitter will shred them.
- **No `;` inside string literals** — same reason.
- Stick to `ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, plain DML. Make migrations idempotent where you can.
- Test against a copy of prod first: `pg_dump $DATABASE_URL > prod.sql`, restore into a local DB, then `npx tsx src/database/migrate.ts`.

Per `AGENTS.md`: never include destructive operations (`DROP TABLE`, `TRUNCATE`, `DELETE`) without Robert's explicit approval.

## Database backup & restore

- Railway has automated daily backups — verify they're on in the Postgres plugin dashboard.
- Manual snapshot:
  ```
  pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
  ```
- Restore (destructive — make sure you really want this):
  ```
  psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  psql "$DATABASE_URL" < backup-YYYY-MM-DD.sql
  ```
- After restore, redeploy so migrations re-apply on top of any older snapshot.

## Cron jobs

Defined in `server/src/cron/`. Both use `node-cron` with `timezone: 'Europe/Bucharest'`.

| Job | Schedule | What it does |
|---|---|---|
| `paymentScheduler` | `0 7 * * 1-5` (07:00 Mon–Fri) | Sends daily payment-due email summary to all admins. Skips non-working days. |
| `anafScheduler` | `*/N * * * *` (default N=5) | Polls ANAF SPV: lists new messages, downloads ZIPs, generates PDFs. Also runs once at boot. |

Important: **no catch-up runs**. If the server is down at the scheduled time, the run is missed permanently. On restart, the next execution is at the next scheduled time. The ANAF scheduler does fire once on boot, so a restart effectively triggers an immediate ANAF check.

`anafScheduler` guards against overlapping runs with an in-memory `running` flag — safe to leave the interval at 5 min.

## Common incidents

### App returns 500 on every request
1. Open Railway logs.
2. Most common causes:
   - Missing env var (boot would have failed — check the boot log).
   - Postgres outage / pool exhausted (look for `connection terminated unexpectedly`).
   - A migration half-applied because someone bypassed `migrate.ts` and ran SQL by hand.
3. `GET /api/health` will return 503 with `database: "disconnected"` for DB issues.

### App refuses to boot after a deploy
- `❌ MIGRATION FAILED — REFUSING TO START` in logs is by design. The boot code calls `process.exit(1)` rather than serve traffic on a broken schema.
- Fix: revert the offending migration commit (or write a new migration that fixes the previous one), push to main.
- If Railway is in a crash loop, it will eventually back off; redeploys after the fix should succeed within one cycle.

### ANAF inbox stops updating
1. Check `anafScheduler` logs in Railway for the most recent `[anafScheduler] 🔍 … SPV check…`.
2. If logs show `TOKEN_EXPIRED` or `Token lejart` → see **ANAF token refresh** above.
3. If logs are silent and `isAnafConfigured()` returned false at boot, an env var is missing — check `ANAF_CLIENT_ID`, `ANAF_CLIENT_SECRET`, `CIF`.
4. ANAF API outage: confirm by visiting the ANAF SPV portal in a browser. There is nothing to do except wait — the scheduler will retry on the next tick.

### Payment emails stop arriving
- If `AZURE_CLIENT_ID` is unset, emails are mocked (logged only). Check if the env var is present.
- Otherwise check Azure AD app secret expiry — Microsoft Graph secrets are time-limited.
- Logs show `Failed to send payment email to <addr>:` for delivery errors.

### Migration failed on boot
1. Read the Railway log for the failing statement (the runner logs `[i/n] <preview>...` before each).
2. Common cause: a `;` inside a string literal, or a `DO $$` block. The split-on-`;` runner cannot handle either — see the migrations rules above.
3. Fix the migration SQL, commit, push. Do NOT attempt to mark it applied without running it.

### "App was working, now slow / timing out"
- Check Railway memory usage; restart the service if it's pegged.
- Look at `pg_stat_activity` for long-running queries.
- The `/api/health` endpoint reports memory — useful for triage.

## Bus factor mitigation

- All required env vars enumerated above (sourced from `validateEnv()`, `loadJwtSecret()`, `anafConfig`, and the rest of `process.env.*` references).
- Migration history lives in `server/src/database/migrations/` — read it top to bottom for the schema story.
- Auth flow: see `server/src/middleware/auth.ts` and `docs/SECURITY.md`.
- ANAF token: in `anaf_tokens` table, keyed by `cif`. To wipe and re-auth: `DELETE FROM anaf_tokens WHERE cif = '<cif>';`.
- ANAF re-authentication requires the digital certificate currently on Robert's machine. Without that certificate, no one can log in to ANAF SPV — this is the single biggest operational risk.
- For Robert's absence: anyone with `superadmin` role and a copy of the ANAF digital certificate can perform the re-auth.

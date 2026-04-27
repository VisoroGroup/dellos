# Security Posture — Dellos

**Last reviewed:** 2026-04-27.

Companion to [`RUNBOOK.md`](../RUNBOOK.md). This file documents what we protect, what we assume, where the known weak spots are, and how to respond when something goes wrong.

## Threat model

- One operator (Robert), ~5 internal users.
- Public-facing on Railway over HTTPS (Railway-terminated).
- No external customers, no public sign-up.
- Data held: financial planning entries, payment records, ANAF e-invoices (XML/PDF/ZIP), client invoices, bank statement imports.
- Primary realistic threats, in order:
  1. Operator mistake (bad migration, leaked secret, wrong env var).
  2. Stolen Microsoft AAD credential of an admin user.
  3. Compromised dependency in the npm tree.
  4. Unauthorized access to the ANAF digital certificate.
- Out of scope: nation-state attackers, DDoS, sophisticated supply-chain attacks.

## Critical assumptions enforced at boot

These are validated by `server/src/app.ts` and `server/src/middleware/auth.ts` — the process refuses to start if any are violated:

- `JWT_SECRET` is set and at least 32 characters.
- `DATABASE_URL` and `CLIENT_URL` are set.
- If `NODE_ENV=production`, then `DEV_AUTH_BYPASS` is not `"true"`.

Additional dev guard: `DEV_AUTH_BYPASS` is also disabled whenever `RAILWAY_ENVIRONMENT` is set, regardless of `NODE_ENV`. So even a misconfigured staging instance on Railway cannot accidentally run open.

## Auth flow summary

- **User login:** Microsoft OAuth (Azure AD) for company employees. See `server/src/routes/auth.ts`.
- **Session:** JWT in the `Authorization: Bearer <token>` header, 24h expiry, signed with `JWT_SECRET` (HS256 default for `jsonwebtoken`).
- **Authorization:** `requireRole(...roles)` middleware. `superadmin` inherits all lower roles (`admin`, `manager`, `user`).
- **Client behavior:** on 401 the client redirects to `/login`.
- **Dev bypass:** `DEV_AUTH_BYPASS=true` injects the first active user as `req.user` for every request. Local development only.

## Known issues + mitigations

1. **ANAF attachments stored on Railway ephemeral disk.**
   XML/PDF/ZIP files are written to `data/anaf/attachments/<id>.zip` (see `server/src/services/attachmentFetcher.ts`). Railway containers are ephemeral — every redeploy wipes the filesystem. The DB rows survive but the files do not.
   Mitigation today: re-fetch from ANAF SPV on demand. `processPendingInvoices` and `fetchPendingAttachments` will re-pull missing items on the next scheduler tick (subject to ANAF retention).
   Long-term: move storage to S3 / Cloudflare R2 / Railway Volumes.

2. **Migration runner uses naive `;` split.**
   `server/src/database/migrate.ts` splits each migration file on `;` and runs the pieces individually. This breaks if a migration contains `;` inside a string literal, or any `DO $$ … $$` block. Mitigation: review each new migration manually before merge, and follow the constraints documented in `RUNBOOK.md` → "Database migrations".

3. **No audit trail UI.**
   The `budget_entries_history` table is written by triggers but there is no read endpoint and no admin UI on top of it. Mitigation: query directly via `psql` if forensic lookups are needed; build an endpoint when the need is concrete.

4. **Bus factor 1.**
   Robert is the only operator and the only person with the ANAF digital certificate. Mitigations: this RUNBOOK, periodic knowledge transfer, and keeping a sealed backup of the certificate off-machine (recommended).

5. **No automated dependency scanning.**
   Per `AGENTS.md` there is no CI. `npm audit` must be run manually — see audit checklist below.

6. **No error-tracking / alerting.**
   No Sentry, no uptime monitor wired up. Failures only surface in Railway logs. Adding Sentry is on the to-do list.

7. **CSP disabled in helmet.**
   `app.use(helmet({ contentSecurityPolicy: false }))` in `server/src/app.ts`. Tightening CSP is a future-work item; the rest of helmet's defaults are on.

## Secret rotation

| Secret | Cadence | Procedure |
|---|---|---|
| `JWT_SECRET` | Quarterly, or immediately on suspected compromise | `openssl rand -hex 32` → set in Railway → redeploy. **All sessions invalidate** — users log in again. |
| Azure AD client secret | Annually (or before expiry — Azure secrets are time-limited) | Rotate in Azure Portal → update `AZURE_CLIENT_SECRET` in Railway → redeploy. |
| ANAF client secret | Per ANAF policy | Generate new credentials in ANAF developer portal → update `ANAF_CLIENT_SECRET` → redeploy → re-authenticate via `/anaf` UI. |
| ANAF OAuth tokens | Auto-refresh (5-min buffer in `getValidToken`) | Manual re-auth required only when refresh token expires (~90 days). See RUNBOOK → "ANAF token refresh". |
| Postgres password | When Railway requires, or on suspicion | Rotate in Railway Postgres tab — `DATABASE_URL` is auto-updated. Redeploy. |

## Incident response

**Suspected secret leak (JWT, DB password, Azure secret):**
1. Rotate the affected secret immediately (see above).
2. For `JWT_SECRET` rotation, all users will be force-logged-out automatically — no separate step needed.
3. Review Railway logs for the relevant time window for unusual access patterns.
4. Document what was exposed and when in this file's incident log section (add a section if/when needed).

**Suspected compromised admin account:**
1. Disable the user: `UPDATE users SET is_active = false WHERE id = '<uuid>';`
2. Force re-login by rotating `JWT_SECRET`.
3. Review `email_logs` and any audit-style tables for actions taken under that account.

**Lost or stolen ANAF certificate:**
1. Notify ANAF and revoke the certificate via the ANAF portal.
2. Rotate `ANAF_CLIENT_SECRET` (re-issue from ANAF developer portal).
3. Once a new certificate is provisioned, complete the ANAF re-auth flow.

**Logs:** Railway dashboard → service → Logs. There is no aggregator, no Sentry. Logs are kept for the Railway-default retention window only. If long-term retention is needed for an incident, export via Railway CLI before the window closes.

## Audit checklist (run quarterly)

- [ ] `JWT_SECRET` rotated within last 90 days
- [ ] Azure AD client secret expiry > 60 days out
- [ ] ANAF client secret current and not nearing expiry
- [ ] `npm audit` run in `server/` and `client/` — no high/critical without justification
- [ ] Backup restore drill: pull the latest Railway backup, restore to a scratch DB, run migrations, smoke-test
- [ ] Env var review: `NODE_ENV=production`, `DEV_AUTH_BYPASS` unset, `CLIENT_URL` matches the public URL
- [ ] User list reviewed: `SELECT email, role, is_active, last_login FROM users` — deactivate ex-employees
- [ ] ANAF re-auth tested in a browser with the certificate, even if not strictly required, to confirm the cert still works
- [ ] Confirm ANAF SPV polling cron is firing (recent log lines from `[anafScheduler]`)

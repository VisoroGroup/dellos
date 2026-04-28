import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import pool from '../config/database';
import { AuthRequest, authMiddleware, generateToken } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

interface MsGraphUser {
    id: string;
    displayName: string;
    mail: string | null;
    userPrincipalName: string;
    jobTitle?: string;
}

type SqlValue = string | number | boolean | null | string[];

// One-time auth code store — codes expire after 60 seconds and are single-use
const AUTH_CODE_TTL_MS = 60_000;
const authCodeStore = new Map<string, { token: string; expiresAt: number }>();

// OAuth CSRF state store — 5 min TTL, single-use
const OAUTH_STATE_TTL_MS = 5 * 60_000;
const oauthStateStore = new Map<string, number>();

// Clean up expired codes/states every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of authCodeStore) {
        if (entry.expiresAt < now) {
            authCodeStore.delete(code);
        }
    }
    for (const [state, expiresAt] of oauthStateStore) {
        if (expiresAt < now) {
            oauthStateStore.delete(state);
        }
    }
}, 5 * 60_000);

const router = Router();

// MSAL config for server-side OAuth — lazy init to avoid crash when credentials are not set (dev mode)
let _msalApp: ConfidentialClientApplication | null = null;
function getMsalApp(): ConfidentialClientApplication {
    if (!_msalApp) {
        if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET || !process.env.AZURE_TENANT_ID) {
            throw new Error('Azure AD credentials are not configured. Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and AZURE_TENANT_ID.');
        }
        _msalApp = new ConfidentialClientApplication({
            auth: {
                clientId: process.env.AZURE_CLIENT_ID,
                authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                clientSecret: process.env.AZURE_CLIENT_SECRET,
            }
        });
    }
    return _msalApp;
}

// GET /api/auth/microsoft — redirect to Microsoft OAuth
router.get('/microsoft', async (req: Request, res: Response): Promise<void> => {
    try {
        const serverUrl = process.env.SERVER_URL || `https://${req.headers.host}`;
        const redirectUri = `${serverUrl}/api/auth/microsoft/callback`;

        // CSRF: generate state, store with TTL, include in OAuth redirect
        const state = crypto.randomBytes(32).toString('hex');
        oauthStateStore.set(state, Date.now() + OAUTH_STATE_TTL_MS);

        const authUrl = await getMsalApp().getAuthCodeUrl({
            scopes: ['User.Read'],
            redirectUri,
            state,
        });
        res.redirect(authUrl);
    } catch (err) {
        console.error('Microsoft OAuth init error:', err);
        const clientUrl = process.env.CLIENT_URL || `https://${req.headers.host}`;
        res.redirect(`${clientUrl}/?error=oauth_init_failed`);
    }
});

// GET /api/auth/microsoft/callback — exchange code for token
router.get('/microsoft/callback', async (req: Request, res: Response): Promise<void> => {
    try {
        const { code, state } = req.query;
        const clientUrl = process.env.CLIENT_URL || `https://${req.headers.host}`;
        const serverUrl = process.env.SERVER_URL || `https://${req.headers.host}`;

        if (!code || typeof code !== 'string') {
            res.redirect(`${clientUrl}/?error=no_code`);
            return;
        }

        // CSRF: validate state matches a stored, unexpired value (single-use)
        if (!state || typeof state !== 'string' || !oauthStateStore.has(state)) {
            res.redirect(`${clientUrl}/?error=csrf`);
            return;
        }
        const stateExpiresAt = oauthStateStore.get(state)!;
        oauthStateStore.delete(state);
        if (stateExpiresAt < Date.now()) {
            res.redirect(`${clientUrl}/?error=csrf`);
            return;
        }

        const redirectUri = `${serverUrl}/api/auth/microsoft/callback`;
        const tokenResponse = await getMsalApp().acquireTokenByCode({
            code,
            scopes: ['User.Read'],
            redirectUri,
        });

        // Get user info from Graph
        const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const msUser = await graphResponse.json() as MsGraphUser;
        const email = msUser.mail || msUser.userPrincipalName;

        // Atomic upsert: SELECT FOR UPDATE + writes inside a single transaction
        // so concurrent logins serialize and don't race on microsoft_id.
        const client = await pool.connect();
        let user;
        try {
            await client.query('BEGIN');

            // Lock the row(s) for this email so a concurrent login waits.
            const existing = await client.query(
                'SELECT * FROM users WHERE email ILIKE $1 AND is_active = true FOR UPDATE',
                [email]
            );

            if (existing.rows.length > 0 && existing.rows[0].microsoft_id?.startsWith('pending-')) {
                // Pre-seeded user — link their Microsoft account
                await client.query(
                    `UPDATE users SET microsoft_id = 'CLEARED-' || microsoft_id
                     WHERE microsoft_id = $1 AND id != $2`,
                    [msUser.id, existing.rows[0].id]
                );
                const { rows } = await client.query(
                    `UPDATE users SET
                        microsoft_id = $1,
                        display_name = COALESCE(NULLIF(display_name, ''), $2),
                        updated_at = NOW()
                     WHERE id = $3
                     RETURNING *`,
                    [msUser.id, msUser.displayName, existing.rows[0].id]
                );
                user = rows[0];
                console.log(`[SSO] Linked pending user ${existing.rows[0].id} to Microsoft ID ${msUser.id}`);
            } else if (existing.rows.length > 0) {
                // Active user already linked — update microsoft_id if needed and refresh info
                await client.query(
                    `UPDATE users SET microsoft_id = 'CLEARED-' || microsoft_id
                     WHERE microsoft_id = $1 AND id != $2`,
                    [msUser.id, existing.rows[0].id]
                );
                const { rows } = await client.query(
                    `UPDATE users SET
                        microsoft_id = $1,
                        display_name = $2,
                        updated_at = NOW()
                     WHERE id = $3
                     RETURNING *`,
                    [msUser.id, msUser.displayName, existing.rows[0].id]
                );
                user = rows[0];
            } else {
                // No active user found by email — upsert by microsoft_id
                const { rows } = await client.query(
                    `INSERT INTO users (id, microsoft_id, email, display_name)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (microsoft_id) DO UPDATE SET
                       email = EXCLUDED.email,
                       display_name = EXCLUDED.display_name,
                       is_active = true,
                       updated_at = NOW()
                     RETURNING *`,
                    [uuidv4(), msUser.id, email, msUser.displayName]
                );
                user = rows[0];
            }

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        // Safety check: reject deactivated users
        if (!user || !user.is_active) {
            console.warn(`Login blocked for deactivated user: ${email}`);
            res.redirect(`${clientUrl}/?error=user_deactivated`);
            return;
        }

        const token = generateToken(user);

        // Generate one-time auth code instead of putting JWT in URL
        const authCode = crypto.randomUUID();
        authCodeStore.set(authCode, {
            token,
            expiresAt: Date.now() + AUTH_CODE_TTL_MS,
        });

        // Redirect with short-lived code — client will exchange it for the JWT
        res.redirect(`${clientUrl}/?code=${authCode}`);
    } catch (err) {
        console.error('Microsoft OAuth callback error:', err);
        const clientUrl = process.env.CLIENT_URL || `https://${req.headers.host}`;
        res.redirect(`${clientUrl}/?error=oauth_failed`);
    }
});

// POST /api/auth/exchange — exchange one-time code for JWT token
router.post('/exchange', async (req: Request, res: Response): Promise<void> => {
    try {
        const { code } = req.body;

        if (!code || typeof code !== 'string') {
            res.status(400).json({ error: 'Codul de autentificare lipsește.' });
            return;
        }

        const entry = authCodeStore.get(code);

        if (!entry) {
            res.status(401).json({ error: 'Cod de autentificare invalid sau deja folosit.' });
            return;
        }

        // Delete immediately — single use
        authCodeStore.delete(code);

        // Check expiration
        if (entry.expiresAt < Date.now()) {
            res.status(401).json({ error: 'Codul de autentificare a expirat.' });
            return;
        }

        res.json({ token: entry.token });
    } catch (err) {
        console.error('Auth code exchange error:', err);
        res.status(500).json({ error: 'Eroare la schimbul codului de autentificare.' });
    }
});

// POST /api/auth/login — email + password
router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body || {};

        if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
            res.status(400).json({ error: 'Email și parolă obligatorii.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const { rows } = await pool.query(
            `SELECT id, email, display_name, avatar_url, role, departments, is_active, password_hash
             FROM users
             WHERE LOWER(email) = $1`,
            [normalizedEmail]
        );

        const user = rows[0];

        // Constant-time-ish: still hash the password even if user doesn't exist
        // to avoid email enumeration timing leaks.
        const dummyHash = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8wNqz0UvK0lIu3p8ZCFV.SzcLYNTo6';
        const hashToCompare = user?.password_hash || dummyHash;
        const passwordMatches = await bcrypt.compare(password, hashToCompare);

        if (!user || !user.password_hash || !passwordMatches) {
            res.status(401).json({ error: 'Email sau parolă incorectă.' });
            return;
        }

        if (!user.is_active) {
            res.status(403).json({ error: 'Contul tău a fost dezactivat. Contactează administratorul.' });
            return;
        }

        // Don't return password_hash to client
        delete user.password_hash;

        const token = generateToken(user);
        res.json({ token, user });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Eroare internă la autentificare.' });
    }
});

// POST /api/auth/change-password — authenticated user changes their own password
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { current_password, new_password } = req.body || {};

        if (!current_password || !new_password || typeof new_password !== 'string') {
            res.status(400).json({ error: 'Parola curentă și parola nouă sunt obligatorii.' });
            return;
        }

        if (new_password.length < 8) {
            res.status(400).json({ error: 'Parola nouă trebuie să aibă minim 8 caractere.' });
            return;
        }

        const { rows } = await pool.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user!.id]
        );

        const currentHash = rows[0]?.password_hash;
        if (!currentHash || !(await bcrypt.compare(current_password, currentHash))) {
            res.status(401).json({ error: 'Parola curentă este incorectă.' });
            return;
        }

        const newHash = await bcrypt.hash(new_password, 10);
        await pool.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newHash, req.user!.id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Eroare internă la schimbarea parolei.' });
    }
});

// GET /api/auth/me — current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    res.json({ user: req.user });
});

// GET /api/users — all users (for @mention, subtask assignment)
router.get('/users', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, email, display_name, avatar_url, departments, role FROM users WHERE is_active = true ORDER BY display_name'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Eroare la încărcarea utilizatorilor.' });
    }
});

// PUT /api/users/:id — update user (admin only for role/departments)
router.put('/users/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { departments, role } = req.body;

        // Only admin can change roles/departments
        if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin' && req.user!.id !== id) {
            res.status(403).json({ error: 'Nu ai permisiunea necesară.' });
            return;
        }

        const updates: string[] = [];
        const values: SqlValue[] = [];
        let paramIndex = 1;

        if (departments) {
            // Only admin/superadmin can modify departments (prevent scope escalation)
            if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
                res.status(403).json({ error: 'Doar administratorii pot modifica departamentele.' });
                return;
            }
            updates.push(`departments = $${paramIndex++}`);
            values.push(departments);
        }
        if (role && (req.user!.role === 'admin' || req.user!.role === 'superadmin')) {
            updates.push(`role = $${paramIndex++}`);
            values.push(role);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'Nimic de actualizat.' });
            return;
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        const { rows } = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        if (rows.length === 0) {
            res.status(404).json({ error: 'Utilizator negăsit.' });
            return;
        }

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Eroare la actualizare.' });
    }
});

export default router;

import { Router, Response, Request } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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

// Clean up expired codes every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of authCodeStore) {
        if (entry.expiresAt < now) {
            authCodeStore.delete(code);
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
        const authUrl = await getMsalApp().getAuthCodeUrl({
            scopes: ['User.Read'],
            redirectUri,
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
        const { code } = req.query;
        const clientUrl = process.env.CLIENT_URL || `https://${req.headers.host}`;
        const serverUrl = process.env.SERVER_URL || `https://${req.headers.host}`;

        if (!code || typeof code !== 'string') {
            res.redirect(`${clientUrl}/?error=no_code`);
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



        // First try to find pre-seeded user by email (only active users!)
        // If found, link their microsoft_id. Otherwise upsert by microsoft_id.
        const existing = await pool.query(
            'SELECT * FROM users WHERE email ILIKE $1 AND is_active = true', [email]
        );



        let user;
        if (existing.rows.length > 0 && existing.rows[0].microsoft_id?.startsWith('pending-')) {
            // Pre-seeded user — link their Microsoft account
            // First: clear any conflicting microsoft_id on deactivated users
            await pool.query(
                `UPDATE users SET microsoft_id = 'CLEARED-' || microsoft_id
                 WHERE microsoft_id = $1 AND id != $2`,
                [msUser.id, existing.rows[0].id]
            );
            const { rows } = await pool.query(
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
            // First: clear any conflicting microsoft_id on other users
            await pool.query(
                `UPDATE users SET microsoft_id = 'CLEARED-' || microsoft_id
                 WHERE microsoft_id = $1 AND id != $2`,
                [msUser.id, existing.rows[0].id]
            );
            const { rows } = await pool.query(
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
            const { rows } = await pool.query(
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

// POST /api/auth/login — validate Microsoft token or dev login
router.post('/login', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Dev mode — login with microsoft_id or email (NEVER in production)
        if (process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
            const { microsoft_id, email } = req.body;

            let user;
            if (microsoft_id) {
                const { rows } = await pool.query('SELECT * FROM users WHERE microsoft_id = $1', [microsoft_id]);
                user = rows[0];
            } else if (email) {
                const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
                user = rows[0];
            }

            if (!user) {
                // Create a new dev user
                const id = uuidv4();
                const devUser = {
                    id,
                    microsoft_id: microsoft_id || `dev-${id}`,
                    email: email || 'dev@visoro.ro',
                    display_name: req.body.display_name || 'Dev User',
                    avatar_url: null,
                    departments: req.body.departments || ['departament_1'],
                    role: (['user', 'manager', 'admin'].includes(req.body.role) ? req.body.role : 'user')
                };

                const { rows } = await pool.query(
                    `INSERT INTO users (id, microsoft_id, email, display_name, avatar_url, departments, role)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                    [devUser.id, devUser.microsoft_id, devUser.email, devUser.display_name,
                    devUser.avatar_url, devUser.departments, devUser.role]
                );
                user = rows[0];
            }

            const token = generateToken(user);
            res.json({ token, user });
            return;
        }

        // Production mode — validate Microsoft token
        const { accessToken } = req.body;
        if (!accessToken) {
            res.status(400).json({ error: 'Token Microsoft lipsă.' });
            return;
        }

        // Validate the Microsoft token and get user info
        // In production, we'd call Microsoft Graph API to get user profile
        try {
            const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!graphResponse.ok) {
                res.status(401).json({ error: 'Token Microsoft invalid.' });
                return;
            }

            const msUser = await graphResponse.json() as MsGraphUser;

            // Upsert user
            const { rows } = await pool.query(
                `INSERT INTO users (microsoft_id, email, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (microsoft_id) DO UPDATE SET
           email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           updated_at = NOW()
         RETURNING *`,
                [msUser.id, msUser.mail || msUser.userPrincipalName, msUser.displayName, null]
            );

            const user = rows[0];

            // Try to get avatar
            try {
                const photoResp = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (photoResp.ok) {
                    const buffer = await photoResp.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString('base64');
                    const avatarUrl = `data:image/jpeg;base64,${base64}`;
                    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, user.id]);
                    user.avatar_url = avatarUrl;
                }
            } catch { /* avatar not available */ }

            const token = generateToken(user);
            res.json({ token, user });
        } catch (err) {
            res.status(500).json({ error: 'Eroare la validarea token-ului Microsoft.' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Eroare internă la autentificare.' });
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

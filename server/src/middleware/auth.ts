import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { User } from '../types';

interface JwtPayload {
    id: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}

export interface AuthRequest extends Request {
    user?: User;
}

const DEFAULT_JWT_SECRET = 'visoro-task-manager-jwt-secret-dev-2024';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
    console.error('🚨 CRITICAL: JWT_SECRET is not set in production! Using insecure default.');
    throw new Error('JWT_SECRET environment variable must be set in production.');
}
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET not set — using development default. Do NOT use this in production.');
}

export function generateToken(user: User): string {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

export async function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    // Dev mode bypass — NEVER active in production
    if (process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
        try {
            // Check if there's a token in the header
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                try {
                    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
                    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.id]);
                    if (rows.length > 0) {
                        req.user = rows[0];
                        return next();
                    }
                } catch {
                    // Token invalid, fall through to dev user
                }
            }

            // Use the first user as dev user
            const { rows } = await pool.query('SELECT * FROM users WHERE is_active = true ORDER BY created_at LIMIT 1');
            if (rows.length > 0) {
                req.user = rows[0];
                return next();
            }

            res.status(401).json({ error: 'Nu există utilizatori în baza de date. Rulează seed-ul.' });
            return;
        } catch (err) {
            res.status(500).json({ error: 'Eroare la autentificare dev.' });
            return;
        }
    }

    // Production mode - JWT validation
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token de autentificare lipsă.' });
        return;
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.id]);

        if (rows.length === 0) {
            res.status(401).json({ error: 'Utilizator negăsit.' });
            return;
        }

        req.user = rows[0];
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token invalid sau expirat.' });
    }
}

export function requireRole(...roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Neautentificat.' });
            return;
        }

        // superadmin inherits all lower roles (admin, manager, user)
        const effectiveRoles = req.user.role === 'superadmin'
            ? ['superadmin', 'admin', 'manager', 'user']
            : [req.user.role];

        if (!roles.some(r => effectiveRoles.includes(r))) {
            res.status(403).json({ error: 'Nu ai permisiunea necesară.' });
            return;
        }

        next();
    };
}

import bcrypt from 'bcryptjs';
import pool from '../config/database';

/**
 * One-shot admin bootstrap from env vars.
 *
 * Set on Railway/your env:
 *   BOOTSTRAP_ADMIN_EMAIL=robert@visoro.com
 *   BOOTSTRAP_ADMIN_PASSWORD=<some-strong-password>
 *
 * On every boot:
 *   - if user exists, updates password_hash + ensures role=superadmin + is_active=true
 *   - if user does not exist, inserts as superadmin
 *
 * After first successful login, REMOVE these env vars from Railway so the
 * password isn't sitting around in the dashboard.
 */
export async function bootstrapAdmin(): Promise<void> {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || email;

    if (!email || !password) {
        return;
    }

    if (password.length < 8) {
        console.warn('⚠️  BOOTSTRAP_ADMIN_PASSWORD is shorter than 8 characters — skipping bootstrap.');
        return;
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (email, display_name, role, is_active, password_hash)
             VALUES ($1, $2, 'superadmin', true, $3)
             ON CONFLICT (email) DO UPDATE
             SET password_hash = EXCLUDED.password_hash,
                 role = 'superadmin',
                 is_active = true,
                 updated_at = NOW()
             RETURNING id, email`,
            [email, name, hash]
        );
        const user = result.rows[0];
        console.log(`🔐 Bootstrap admin set: ${user.email} (id=${user.id})`);
        console.log('   ⚠️  Remove BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD env vars after first login.');
    } catch (err: any) {
        console.error('❌ Bootstrap admin failed:', err?.message || err);
    }
}

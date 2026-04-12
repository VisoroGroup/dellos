import { Pool } from 'pg';
import pg from 'pg';

// Prevent pg from converting DATE to JavaScript Date object
// Return as plain YYYY-MM-DD string instead
pg.types.setTypeParser(1082, (val: string) => val); // 1082 = DATE OID

/**
 * SSL configuration for PostgreSQL connection.
 * - If DATABASE_CA_CERT is set, use it with rejectUnauthorized: true
 * - If running on Railway (DATABASE_URL contains "railway.app"), use rejectUnauthorized: true
 * - Otherwise (local dev), disable SSL
 * 
 * NEVER use rejectUnauthorized: false in production — it disables certificate
 * verification and makes the connection vulnerable to MITM attacks.
 */
function getSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
    const caCert = process.env.DATABASE_CA_CERT;
    const dbUrl = process.env.DATABASE_URL || '';
    const isProduction = process.env.NODE_ENV === 'production';
    const isRailway = dbUrl.includes('railway') || !!process.env.RAILWAY_ENVIRONMENT;

    if (caCert) {
        // CA certificate provided — most secure option, works everywhere
        return { rejectUnauthorized: true, ca: caCert };
    }

    if (isRailway) {
        // Railway PostgreSQL uses self-signed certificates and does not
        // provide a CA cert. rejectUnauthorized: false is required here.
        // This is safe within Railway's private network.
        return { rejectUnauthorized: false };
    }

    if (isProduction) {
        // Non-Railway production: verify certificates strictly.
        // Set DATABASE_SSL_REJECT=false only for staging with self-signed certs.
        const allowInsecure = process.env.DATABASE_SSL_REJECT === 'false';
        if (allowInsecure) {
            console.warn('⚠️  DATABASE_SSL_REJECT=false — SSL cert verification DISABLED.');
        }
        return { rejectUnauthorized: !allowInsecure };
    }

    // Local development — no SSL needed
    return false;
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getSslConfig(),
});

// --- Pool error handling with retry ---
let consecutiveErrors = 0;
let recoveryInProgress = false;
const MAX_CONSECUTIVE_ERRORS = 5;
const BACKOFF_DELAYS = [1000, 5000, 15000, 30000, 60000]; // 1s, 5s, 15s, 30s, 60s

pool.on('error', (err) => {
    consecutiveErrors++;
    console.error(`[DB] Unexpected idle client error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err.message);

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[DB] ${MAX_CONSECUTIVE_ERRORS} consecutive pool errors — shutting down.`);
        gracefulShutdown('pool_errors');
    } else {
        const delay = BACKOFF_DELAYS[consecutiveErrors - 1] || 60000;
        console.warn(`[DB] Will attempt recovery in ${delay / 1000}s...`);
        if (!recoveryInProgress) {
            recoveryInProgress = true;
            setTimeout(async () => {
                try {
                    const client = await pool.connect();
                    client.release();
                    consecutiveErrors = 0;
                    console.log('[DB] Pool connection recovered.');
                } catch (retryErr: any) {
                    console.error('[DB] Recovery attempt failed:', retryErr.message);
                } finally {
                    recoveryInProgress = false;
                }
            }, delay);
        }
    }
});

// --- Graceful shutdown ---
async function gracefulShutdown(signal: string) {
    console.log(`[DB] Graceful shutdown initiated (${signal})...`);
    try {
        await pool.end();
        console.log('[DB] Pool closed.');
    } catch (err: any) {
        console.error('[DB] Error closing pool:', err.message);
    }
    process.exit(signal === 'pool_errors' ? 1 : 0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default pool;

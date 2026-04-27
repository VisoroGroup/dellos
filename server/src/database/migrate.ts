import pool from '../config/database';
import fs from 'fs';
import path from 'path';

export async function runMigrations() {
    const client = await pool.connect();

    try {
        // Create migrations tracking table
        await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

        // In production, __dirname is dist/database/ but .sql files are in src/database/migrations/
        let migrationsDir = path.join(__dirname, 'migrations');
        if (!fs.existsSync(migrationsDir)) {
            // Fallback: resolve from project root to src/database/migrations
            migrationsDir = path.join(__dirname, '..', '..', 'src', 'database', 'migrations');
        }

        if (!fs.existsSync(migrationsDir)) {
            console.warn('⚠️  Migrations directory not found. Skipping migrations.');
            return;
        }

        console.log(`📂 Migrations directory: ${migrationsDir}`);

        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        console.log(`📋 Found ${files.length} migration files.`);

        for (const file of files) {
            const { rows } = await client.query(
                'SELECT id FROM _migrations WHERE name = $1',
                [file]
            );

            if (rows.length > 0) {
                continue; // already executed
            }

            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
            console.log(`🔄 Running migration: ${file}`);

            // Strip SQL comment lines from the file, then split into individual statements
            const cleanedSql = sql.split('\n')
                .filter(line => !line.trim().startsWith('--'))
                .join('\n');

            const statements = cleanedSql.split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            console.log(`   📝 ${statements.length} statement(s) to execute`);

            await client.query('BEGIN');
            try {
                for (let i = 0; i < statements.length; i++) {
                    const stmt = statements[i];
                    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
                    console.log(`   [${i + 1}/${statements.length}] ${preview}...`);
                    await client.query(stmt);
                }

                await client.query('COMMIT');
                await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
                console.log(`✅ Completed: ${file}`);
            } catch (err: any) {
                await client.query('ROLLBACK');
                console.error(`❌ Failed: ${file}`, err?.message || err);
                // Stop the runner — refuse to boot with a half-applied schema.
                throw new Error(`Migration failed: ${file} — ${err?.message || err}`);
            }
        }

        console.log('✅ Migrations up to date.');
    } finally {
        client.release();
    }
}

// Allow standalone execution: npx tsx src/database/migrate.ts
if (require.main === module) {
    (async () => {
        const dotenv = await import('dotenv');
        dotenv.config({ path: path.join(__dirname, '../../..', '.env') });
        console.log('Starting migrations...');
        await runMigrations();
        await pool.end();
        console.log('Migrations complete, pool closed.');
    })().catch((err) => {
        console.error('Migration error:', err);
        process.exit(1);
    });
}

/**
 * ANAF Messages DB layer (PostgreSQL).
 *
 * Az SQLite-os `db.js`-bol portolt logika a Postgres-re.
 * Egyetlen helyen: insert / update / list / scadentar / top suppliers / monthly stats.
 */

import pool from '../config/database';

export interface AnafMessageRow {
    id: string;
    cif: string;
    data_creare: string | null;
    tip: string | null;
    detalii: string | null;
    id_solicitare: string | null;
    first_seen_at: string;
    notified_at: string | null;
    zip_path: string | null;
    zip_status: string;
    xml_path: string | null;
    pdf_path: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    invoice_due_date: string | null;
    invoice_total: string | null;     // PG decimal -> string
    invoice_currency: string | null;
    supplier_name: string | null;
    supplier_cif: string | null;
    customer_name: string | null;
    customer_cif: string | null;
    raw_json: Record<string, unknown> | null;
}

export interface RawSpvMessage {
    id: string | number;
    cif?: string;
    data_creare?: string;
    tip?: string;
    detalii?: string;
    id_solicitare?: string;
}

/**
 * Insert if not exists. Returns true if a new row was created.
 */
export async function insertMessageIfNew(msg: RawSpvMessage): Promise<boolean> {
    const result = await pool.query(`
        INSERT INTO anaf_messages
            (id, cif, data_creare, tip, detalii, id_solicitare, first_seen_at, raw_json)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
        ON CONFLICT (id) DO NOTHING
    `, [
        String(msg.id),
        String(msg.cif || ''),
        msg.data_creare || null,
        msg.tip || null,
        msg.detalii || null,
        msg.id_solicitare || null,
        JSON.stringify(msg),
    ]);
    return (result.rowCount ?? 0) > 0;
}

export async function getMessage(id: string): Promise<AnafMessageRow | null> {
    const r = await pool.query<AnafMessageRow>(`SELECT * FROM anaf_messages WHERE id = $1`, [id]);
    return r.rows[0] || null;
}

export async function markNotified(id: string): Promise<void> {
    await pool.query(`UPDATE anaf_messages SET notified_at = NOW() WHERE id = $1`, [id]);
}

/**
 * Generic update. Provide column→value pairs.
 * Only allow safe column names (whitelist).
 */
const ALLOWED_UPDATE_COLS = new Set([
    'zip_path', 'zip_status', 'xml_path', 'pdf_path',
    'invoice_number', 'invoice_date', 'invoice_due_date', 'invoice_total', 'invoice_currency',
    'supplier_name', 'supplier_cif', 'customer_name', 'customer_cif',
]);

export async function updateMessage(id: string, updates: Record<string, unknown>): Promise<void> {
    const cols = Object.keys(updates).filter(k => ALLOWED_UPDATE_COLS.has(k));
    if (cols.length === 0) return;
    const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const values = cols.map(c => updates[c]);
    await pool.query(`UPDATE anaf_messages SET ${setClause} WHERE id = $1`, [id, ...values]);
}

// --- Listing (UI) ---

export interface ListFilters {
    search?: string;
    tip?: string;
    from?: string;     // YYYY-MM-DD
    to?: string;
    limit?: number;
    offset?: number;
}

export async function listMessages(f: ListFilters = {}): Promise<AnafMessageRow[]> {
    const limit = f.limit ?? 25;
    const offset = f.offset ?? 0;
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.tip) { params.push(f.tip); where.push(`tip = $${params.length}`); }
    if (f.from) { params.push(f.from); where.push(`data_creare >= $${params.length}`); }
    if (f.to) { params.push(f.to); where.push(`data_creare <= $${params.length}`); }
    if (f.search) {
        params.push(`%${f.search}%`);
        const p = `$${params.length}`;
        where.push(`(detalii ILIKE ${p} OR invoice_number ILIKE ${p} OR supplier_name ILIKE ${p} OR customer_name ILIKE ${p})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);
    params.push(offset);
    const r = await pool.query<AnafMessageRow>(`
        SELECT * FROM anaf_messages
        ${whereSql}
        ORDER BY data_creare DESC NULLS LAST
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return r.rows;
}

export async function countMessages(f: ListFilters = {}): Promise<number> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.tip) { params.push(f.tip); where.push(`tip = $${params.length}`); }
    if (f.from) { params.push(f.from); where.push(`data_creare >= $${params.length}`); }
    if (f.to) { params.push(f.to); where.push(`data_creare <= $${params.length}`); }
    if (f.search) {
        params.push(`%${f.search}%`);
        const p = `$${params.length}`;
        where.push(`(detalii ILIKE ${p} OR invoice_number ILIKE ${p} OR supplier_name ILIKE ${p} OR customer_name ILIKE ${p})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await pool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM anaf_messages ${whereSql}`, params);
    return parseInt(r.rows[0].n, 10);
}

export async function stats(): Promise<{ total: number; byType: Array<{ tip: string | null; n: number }> }> {
    const totalR = await pool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM anaf_messages`);
    const byTypeR = await pool.query<{ tip: string | null; n: string }>(
        `SELECT tip, COUNT(*) AS n FROM anaf_messages GROUP BY tip`
    );
    return {
        total: parseInt(totalR.rows[0].n, 10),
        byType: byTypeR.rows.map(r => ({ tip: r.tip, n: parseInt(r.n, 10) })),
    };
}

// --- Reports ---

export async function topSuppliers(opts: { limit?: number; from?: string; to?: string } = {}) {
    const limit = opts.limit ?? 10;
    const where = ['invoice_total IS NOT NULL', 'supplier_cif IS NOT NULL'];
    const params: unknown[] = [];
    if (opts.from) { params.push(opts.from); where.push(`invoice_date >= $${params.length}`); }
    if (opts.to) { params.push(opts.to); where.push(`invoice_date <= $${params.length}`); }
    params.push(limit);
    const r = await pool.query(`
        SELECT
            supplier_cif AS cif,
            COALESCE(supplier_name, '(necunoscut)') AS name,
            COUNT(*)::int AS invoice_count,
            SUM(invoice_total) AS total_amount,
            MAX(invoice_date) AS last_invoice_date,
            invoice_currency AS currency
        FROM anaf_messages
        WHERE ${where.join(' AND ')}
        GROUP BY supplier_cif, invoice_currency, supplier_name
        ORDER BY total_amount DESC
        LIMIT $${params.length}
    `, params);
    return r.rows;
}

export async function monthlyStats(opts: { months?: number } = {}) {
    const months = opts.months ?? 12;
    const r = await pool.query(`
        SELECT
            to_char(COALESCE(invoice_date, NOW()::date), 'YYYY-MM') AS ym,
            COUNT(*)::int AS invoice_count,
            COALESCE(SUM(invoice_total), 0) AS total_amount,
            invoice_currency AS currency
        FROM anaf_messages
        WHERE invoice_total IS NOT NULL
          AND COALESCE(invoice_date, NOW()::date) >= (NOW() - ($1 || ' months')::interval)::date
        GROUP BY ym, invoice_currency
        ORDER BY ym ASC
    `, [months]);
    return r.rows;
}

export async function periodSummary(opts: { from?: string; to?: string } = {}) {
    const where = ['invoice_total IS NOT NULL'];
    const params: unknown[] = [];
    if (opts.from) { params.push(opts.from); where.push(`COALESCE(invoice_date::text, data_creare) >= $${params.length}`); }
    if (opts.to) { params.push(opts.to); where.push(`COALESCE(invoice_date::text, data_creare) <= $${params.length}`); }
    const r = await pool.query(`
        SELECT
            COUNT(*)::int AS invoice_count,
            COALESCE(SUM(invoice_total), 0) AS total_amount,
            invoice_currency AS currency,
            COUNT(DISTINCT supplier_cif)::int AS unique_suppliers
        FROM anaf_messages
        WHERE ${where.join(' AND ')}
        GROUP BY invoice_currency
    `, params);
    return r.rows;
}

export async function scadentar(opts: { daysAhead?: number; includeOverdue?: boolean; limit?: number } = {}) {
    const daysAhead = opts.daysAhead ?? 30;
    const includeOverdue = opts.includeOverdue ?? true;
    const limit = opts.limit ?? 100;

    // computed_due = COALESCE(invoice_due_date, invoice_date + 30 days)
    const sql = `
        WITH base AS (
            SELECT
                id, supplier_name, supplier_cif,
                invoice_number, invoice_date, invoice_due_date,
                invoice_total, invoice_currency,
                COALESCE(invoice_due_date, invoice_date + INTERVAL '30 days')::date AS computed_due_date
            FROM anaf_messages
            WHERE invoice_total IS NOT NULL AND invoice_date IS NOT NULL
        )
        SELECT *,
            (computed_due_date - CURRENT_DATE)::int AS days_until_due
        FROM base
        WHERE computed_due_date <= (CURRENT_DATE + ($1 || ' days')::interval)::date
          ${includeOverdue ? '' : 'AND computed_due_date >= CURRENT_DATE'}
        ORDER BY computed_due_date ASC
        LIMIT $2
    `;
    const r = await pool.query(sql, [daysAhead, limit]);
    return r.rows;
}

export async function totalSupplierInvoices(opts: { from?: string; to?: string } = {}) {
    const where = ['invoice_total IS NOT NULL'];
    const params: unknown[] = [];
    if (opts.from) { params.push(opts.from); where.push(`COALESCE(invoice_date::text, data_creare) >= $${params.length}`); }
    if (opts.to) { params.push(opts.to); where.push(`COALESCE(invoice_date::text, data_creare) <= $${params.length}`); }
    const r = await pool.query(`
        SELECT COALESCE(SUM(invoice_total), 0) AS total, invoice_currency AS currency, COUNT(*)::int AS n
        FROM anaf_messages
        WHERE ${where.join(' AND ')}
        GROUP BY invoice_currency
    `, params);
    return r.rows;
}

// Pending attachments / pending PDF processing
export async function listPendingZipDownloads(): Promise<Array<{ id: string }>> {
    const r = await pool.query<{ id: string }>(
        `SELECT id FROM anaf_messages WHERE zip_status = 'pending' ORDER BY data_creare ASC`
    );
    return r.rows;
}

export async function listPendingInvoiceProcessing(): Promise<Array<{ id: string }>> {
    const r = await pool.query<{ id: string }>(`
        SELECT id FROM anaf_messages
        WHERE zip_status = 'downloaded'
          AND zip_path IS NOT NULL
          AND (pdf_path IS NULL OR pdf_path = '')
        ORDER BY data_creare ASC
    `);
    return r.rows;
}

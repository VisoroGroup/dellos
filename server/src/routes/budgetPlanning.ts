import { Router, Response } from 'express';
import pool from '../config/database';
import { AuthRequest, authMiddleware, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Budget planning is superadmin only
router.use(authMiddleware);
router.use(requireRole('superadmin'));

// ==========================================
// CATEGORIES
// ==========================================

// GET /api/budget/categories — tree structure
router.get('/categories', asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(`
        SELECT id, name, section, section_label, parent_id, order_index, kind
        FROM budget_categories
        ORDER BY order_index ASC, name ASC
    `);

    // Build tree: group children under parents
    const parentMap = new Map<string | null, typeof rows>();
    for (const row of rows) {
        const pid = row.parent_id || null;
        if (!parentMap.has(pid)) parentMap.set(pid, []);
        parentMap.get(pid)!.push(row);
    }

    const tree = (parentMap.get(null) || []).map(parent => ({
        ...parent,
        children: (parentMap.get(parent.id) || []).sort((a: any, b: any) => a.order_index - b.order_index),
    }));

    res.json(tree);
}));

// POST /api/budget/categories — add new category
router.post('/categories', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, section, section_label, parent_id } = req.body;

    if (!name || !section) {
        res.status(400).json({ error: 'Név és szekció megadása kötelező.' });
        return;
    }

    // Get next order_index for the section/parent
    const orderQuery = parent_id
        ? await pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM budget_categories WHERE parent_id = $1', [parent_id])
        : await pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM budget_categories WHERE parent_id IS NULL');
    const nextOrder = parseInt(orderQuery.rows[0].next, 10);

    // If parent exists, inherit section info from parent
    let finalSection = section;
    let finalSectionLabel = section_label || section;
    if (parent_id) {
        const { rows: parentRows } = await pool.query('SELECT section, section_label FROM budget_categories WHERE id = $1', [parent_id]);
        if (parentRows.length > 0) {
            finalSection = parentRows[0].section;
            finalSectionLabel = parentRows[0].section_label;
        }
    }

    const { rows } = await pool.query(
        `INSERT INTO budget_categories (name, section, section_label, parent_id, order_index)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name.trim(), finalSection, finalSectionLabel, parent_id || null, nextOrder]
    );

    res.status(201).json(rows[0]);
}));

// DELETE /api/budget/categories/:id — delete category (cascades entries)
router.delete('/categories/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
        res.status(400).json({ error: 'Érvénytelen kategória ID formátum.' });
        return;
    }

    const { rows } = await pool.query(
        'DELETE FROM budget_categories WHERE id = $1 RETURNING *',
        [req.params.id]
    );

    if (rows.length === 0) {
        res.status(404).json({ error: 'Kategória nem található.' });
        return;
    }

    res.json({ message: 'Kategória törölve.', deleted: rows[0] });
}));

// PUT /api/budget/categories/:id — rename category
router.put('/categories/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name } = req.body;
    if (!name) {
        res.status(400).json({ error: 'Név megadása kötelező.' });
        return;
    }

    const { rows } = await pool.query(
        'UPDATE budget_categories SET name = $1 WHERE id = $2 RETURNING *',
        [name.trim(), req.params.id]
    );

    if (rows.length === 0) {
        res.status(404).json({ error: 'Kategória nem található.' });
        return;
    }

    res.json(rows[0]);
}));

// ==========================================
// ENTRIES (cell values)
// ==========================================

// GET /api/budget/entries?year=2025&month=4 — get a month's data (all weeks)
// GET /api/budget/entries?year=2025 — get a full year overview
router.get('/entries', asyncHandler(async (req: AuthRequest, res: Response) => {
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string, 10) : null;

    let query: string;
    let params: any[];

    if (month) {
        // Specific month — return all weeks + month total
        query = `
            SELECT e.*, c.name AS category_name, c.section, c.parent_id, c.kind
            FROM budget_entries e
            JOIN budget_categories c ON e.category_id = c.id
            WHERE e.year = $1 AND e.month = $2
            ORDER BY c.order_index ASC, e.week ASC NULLS LAST
        `;
        params = [year, month];
    } else {
        // Full year — aggregate by month
        query = `
            SELECT
                e.category_id,
                e.year,
                e.month,
                SUM(e.planned) AS planned,
                SUM(e.actual) AS actual,
                e.currency,
                c.name AS category_name,
                c.section,
                c.parent_id,
                c.kind
            FROM budget_entries e
            JOIN budget_categories c ON e.category_id = c.id
            WHERE e.year = $1
            GROUP BY e.category_id, e.year, e.month, e.currency, c.name, c.section, c.parent_id, c.kind, c.order_index
            ORDER BY c.order_index ASC, e.month ASC
        `;
        params = [year];
    }

    const { rows } = await pool.query(query, params);
    res.json({ year, month, entries: rows });
}));

// PUT /api/budget/entries — upsert a cell value
router.put('/entries', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { category_id, year, month, week, planned, actual, currency, notes } = req.body;

    // Validate required fields
    if (!category_id || !year || !month) {
        res.status(400).json({ error: 'category_id, year és month kötelező.' });
        return;
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(category_id)) {
        res.status(400).json({ error: 'Érvénytelen category_id formátum.' });
        return;
    }

    // Validate month range
    const m = parseInt(month, 10);
    if (isNaN(m) || m < 1 || m > 12) {
        res.status(400).json({ error: 'A hónap 1-12 közötti szám kell legyen.' });
        return;
    }

    // Validate week range if provided
    if (week !== null && week !== undefined) {
        const w = parseInt(week, 10);
        if (isNaN(w) || w < 1 || w > 5) {
            res.status(400).json({ error: 'A hét 1-5 közötti szám kell legyen.' });
            return;
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query(
            `SELECT id, planned, actual FROM budget_entries
             WHERE category_id = $1 AND year = $2 AND month = $3 AND week IS NOT DISTINCT FROM $4`,
            [category_id, year, m, week || null]
        );
        const prior = existing.rows[0] || null;

        const { rows } = await client.query(`
            INSERT INTO budget_entries (category_id, year, month, week, planned, actual, currency, notes, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (category_id, year, month, week)
            DO UPDATE SET
                planned = COALESCE($5, budget_entries.planned),
                actual = COALESCE($6, budget_entries.actual),
                currency = COALESCE($7, budget_entries.currency),
                notes = COALESCE($8, budget_entries.notes),
                updated_by = $9,
                updated_at = NOW()
            RETURNING *
        `, [
            category_id, year, m, week || null,
            planned ?? 0, actual ?? 0, currency || 'RON', notes || null,
            req.user!.id,
        ]);

        const saved = rows[0];
        await client.query(`
            INSERT INTO budget_entries_history
                (entry_id, category_id, year, month, week, planned_old, planned_new, actual_old, actual_new, operation, changed_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            saved.id, category_id, year, m, week || null,
            prior ? prior.planned : null, saved.planned,
            prior ? prior.actual : null, saved.actual,
            prior ? 'UPDATE' : 'INSERT',
            req.user!.id,
        ]);

        await client.query('COMMIT');
        res.json(saved);
    } catch (err: any) {
        await client.query('ROLLBACK');
        if (err?.code === '23503') {
            res.status(400).json({ error: 'Kategória nem található.' });
            return;
        }
        throw err;
    } finally {
        client.release();
    }
}));

// ==========================================
// CASH BALANCE
// ==========================================

// GET /api/budget/cash-balance?year=2025
router.get('/cash-balance', asyncHandler(async (req: AuthRequest, res: Response) => {
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    const { rows } = await pool.query(
        'SELECT * FROM cash_balance WHERE year = $1 ORDER BY month ASC, week ASC NULLS LAST',
        [year]
    );

    res.json(rows);
}));

// PUT /api/budget/cash-balance — upsert
router.put('/cash-balance', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { year, month, week, balance, currency, notes } = req.body;

    if (!year || !month || balance === undefined) {
        res.status(400).json({ error: 'year, month, balance kötelező.' });
        return;
    }

    const { rows } = await pool.query(`
        INSERT INTO cash_balance (year, month, week, balance, currency, notes, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (year, month, week, currency)
        DO UPDATE SET
            balance = $4,
            notes = COALESCE($6, cash_balance.notes),
            updated_by = $7,
            updated_at = NOW()
        RETURNING *
    `, [year, month, week || null, balance, currency || 'RON', notes || null, req.user!.id]);

    res.json(rows[0]);
}));

// ==========================================
// SUMMARY
// ==========================================

// GET /api/budget/summary?year=2025&month=4 — aggregated overview
router.get('/summary', asyncHandler(async (req: AuthRequest, res: Response) => {
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string, 10) : null;

    const entryConditions = ['e.year = $1'];
    const cashConditions = ['year = $1'];
    const params: (number)[] = [year];

    if (month) {
        params.push(month);
        entryConditions.push(`e.month = $${params.length}`);
        cashConditions.push(`month = $${params.length}`);
    }

    const entryWhere = entryConditions.join(' AND ');
    const cashWhere = cashConditions.join(' AND ');

    const [revenueQuery, deductionQuery, expenseQuery, cashQuery] = await Promise.all([
        // Revenue total (Valoare facturată)
        pool.query(`
            SELECT COALESCE(SUM(e.actual), 0) AS total_revenue_actual,
                   COALESCE(SUM(e.planned), 0) AS total_revenue_planned
            FROM budget_entries e
            JOIN budget_categories c ON e.category_id = c.id
            WHERE c.kind = 'revenue' AND ${entryWhere}
        `, params),
        // Deductions total (Parteneri + TVA + Rezervă firmă cu sub-categorii)
        pool.query(`
            SELECT COALESCE(SUM(e.actual), 0) AS total_deduction_actual,
                   COALESCE(SUM(e.planned), 0) AS total_deduction_planned
            FROM budget_entries e
            JOIN budget_categories c ON e.category_id = c.id
            WHERE c.kind = 'deduction'
              AND NOT EXISTS (SELECT 1 FROM budget_categories ch WHERE ch.parent_id = c.id)
              AND ${entryWhere}
        `, params),
        // Expense total (cheltuieli reale: doar kind='expense', fără părinte care are copii)
        pool.query(`
            SELECT COALESCE(SUM(e.actual), 0) AS total_expense_actual,
                   COALESCE(SUM(e.planned), 0) AS total_expense_planned
            FROM budget_entries e
            JOIN budget_categories c ON e.category_id = c.id
            WHERE c.kind = 'expense'
              AND NOT EXISTS (SELECT 1 FROM budget_categories ch WHERE ch.parent_id = c.id)
              AND ${entryWhere}
        `, params),
        // Latest cash balance
        pool.query(`
            SELECT balance FROM cash_balance
            WHERE ${cashWhere}
            ORDER BY month DESC, week DESC NULLS LAST
            LIMIT 1
        `, params),
    ]);

    const revenue = revenueQuery.rows[0];
    const deduction = deductionQuery.rows[0];
    const expense = expenseQuery.rows[0];

    const revenuePlanned = parseFloat(revenue.total_revenue_planned);
    const revenueActual = parseFloat(revenue.total_revenue_actual);
    const deductionPlanned = parseFloat(deduction.total_deduction_planned);
    const deductionActual = parseFloat(deduction.total_deduction_actual);
    const expensePlanned = parseFloat(expense.total_expense_planned);
    const expenseActual = parseFloat(expense.total_expense_actual);

    // Venit corectat = Valoare facturată − deduceri (Parteneri + TVA + Rezervă firmă)
    const adjustedRevenuePlanned = revenuePlanned - deductionPlanned;
    const adjustedRevenueActual = revenueActual - deductionActual;

    res.json({
        year,
        month,
        revenue_planned: revenuePlanned,
        revenue_actual: revenueActual,
        deduction_planned: deductionPlanned,
        deduction_actual: deductionActual,
        adjusted_revenue_planned: adjustedRevenuePlanned,
        adjusted_revenue_actual: adjustedRevenueActual,
        expense_planned: expensePlanned,
        expense_actual: expenseActual,
        // Rezultat = Venit corectat − Cheltuieli totale (matches "A HET EREDMENYE" in xlsx)
        result_planned: adjustedRevenuePlanned - expensePlanned,
        result_actual: adjustedRevenueActual - expenseActual,
        cash_balance: cashQuery.rows[0]?.balance ? parseFloat(cashQuery.rows[0].balance) : null,
    });
}));

// ==========================================
// COPY WEEK / EXPORT
// ==========================================

// POST /api/budget/copy-week — copy planned values from one week to another
router.post('/copy-week', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { source, target } = req.body || {};

    const validRef = (r: any) =>
        r && Number.isInteger(r.year) && Number.isInteger(r.month) && Number.isInteger(r.week)
        && r.month >= 1 && r.month <= 12 && r.week >= 1 && r.week <= 5;

    if (!validRef(source) || !validRef(target)) {
        res.status(400).json({ error: 'source și target trebuie să conțină year, month (1-12), week (1-5).' });
        return;
    }

    const result = await pool.query(`
        INSERT INTO budget_entries (category_id, year, month, week, planned, actual, currency, updated_by)
        SELECT category_id, $1, $2, $3, planned, 0, currency, $7
        FROM budget_entries
        WHERE year = $4 AND month = $5 AND week = $6
        ON CONFLICT (category_id, year, month, week)
        DO UPDATE SET planned = EXCLUDED.planned, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        RETURNING id
    `, [target.year, target.month, target.week, source.year, source.month, source.week, req.user!.id]);

    res.json({ copied: result.rowCount });
}));

// GET /api/budget/export?year=2026 — CSV export
router.get('/export', asyncHandler(async (req: AuthRequest, res: Response) => {
    const year = parseInt(req.query.year as string, 10);
    if (!year || isNaN(year)) {
        res.status(400).json({ error: 'year este obligatoriu.' });
        return;
    }

    const { rows } = await pool.query(`
        SELECT
            c.section_label,
            c.name AS category_name,
            p.name AS parent_name,
            c.kind,
            e.year, e.month, e.week,
            e.planned, e.actual, e.currency
        FROM budget_entries e
        JOIN budget_categories c ON e.category_id = c.id
        LEFT JOIN budget_categories p ON c.parent_id = p.id
        WHERE e.year = $1
        ORDER BY c.order_index, e.month, e.week
    `, [year]);

    const escape = (val: any): string => {
        if (val === null || val === undefined) return '';
        const s = String(val);
        if (/[",\n\r]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const header = 'section_label,category_name,parent_name,kind,year,month,week,planned,actual,currency';
    const lines = rows.map(r => [
        r.section_label, r.category_name, r.parent_name,
        r.kind, r.year, r.month, r.week,
        r.planned, r.actual, r.currency,
    ].map(escape).join(','));

    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="budget-${year}.csv"`);
    res.send(csv);
}));

// ==========================================
// OUTSTANDING ITEMS (Creanțe / Datorii / Prestate nefacturate)
// ==========================================

const ALLOWED_OUTSTANDING_TYPES = ['creanta', 'datorie', 'prestat_nefacturat'];

// GET /api/budget/outstanding?type=creanta&year=2026&month=4
router.get('/outstanding', asyncHandler(async (req: AuthRequest, res: Response) => {
    const type = req.query.type as string | undefined;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
    const month = req.query.month ? parseInt(req.query.month as string, 10) : null;
    const includeResolved = req.query.include_resolved === 'true';

    const conditions: string[] = [];
    const params: any[] = [];

    if (type) {
        if (!ALLOWED_OUTSTANDING_TYPES.includes(type)) {
            res.status(400).json({ error: 'Tip invalid.' });
            return;
        }
        params.push(type);
        conditions.push(`type = $${params.length}`);
    }
    if (year) {
        params.push(year);
        conditions.push(`year = $${params.length}`);
    }
    if (month) {
        params.push(month);
        conditions.push(`month = $${params.length}`);
    }
    if (!includeResolved) {
        conditions.push('is_resolved = false');
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
        `SELECT * FROM outstanding_items ${where} ORDER BY created_at DESC`,
        params
    );

    res.json(rows);
}));

// POST /api/budget/outstanding
router.post('/outstanding', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { type, description, amount, currency, counterparty, year, month, week } = req.body;

    if (!type || !ALLOWED_OUTSTANDING_TYPES.includes(type)) {
        res.status(400).json({ error: 'Tip invalid sau lipsă.' });
        return;
    }
    if (!description || amount === undefined || !year || !month) {
        res.status(400).json({ error: 'description, amount, year, month sunt obligatorii.' });
        return;
    }

    const { rows } = await pool.query(
        `INSERT INTO outstanding_items (type, description, amount, currency, counterparty, year, month, week, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [type, description, amount, currency || 'RON', counterparty || null, year, month, week || null, req.user!.id]
    );

    res.status(201).json(rows[0]);
}));

// PUT /api/budget/outstanding/:id — update or mark resolved
router.put('/outstanding/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
        res.status(400).json({ error: 'ID invalid.' });
        return;
    }

    const { description, amount, counterparty, is_resolved } = req.body;

    const { rows } = await pool.query(
        `UPDATE outstanding_items SET
            description = COALESCE($1, description),
            amount = COALESCE($2, amount),
            counterparty = COALESCE($3, counterparty),
            is_resolved = COALESCE($4, is_resolved),
            resolved_at = CASE WHEN $4 = true THEN NOW() ELSE NULL END,
            updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [description ?? null, amount ?? null, counterparty ?? null, is_resolved ?? null, req.params.id]
    );

    if (rows.length === 0) {
        res.status(404).json({ error: 'Element negăsit.' });
        return;
    }

    res.json(rows[0]);
}));

// DELETE /api/budget/outstanding/:id
router.delete('/outstanding/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
        res.status(400).json({ error: 'ID invalid.' });
        return;
    }

    const { rows } = await pool.query('DELETE FROM outstanding_items WHERE id = $1 RETURNING *', [req.params.id]);
    if (rows.length === 0) {
        res.status(404).json({ error: 'Element negăsit.' });
        return;
    }

    res.json({ message: 'Șters.', deleted: rows[0] });
}));

export default router;

import { Router, Response } from 'express';
import pool from '../config/database';
import { AuthRequest, authMiddleware, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Superadmin only
router.use(authMiddleware);
router.use(requireRole('superadmin'));

// GET /api/client-invoices — list invoices with filters
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { client_name, is_paid, search, sort = 'issued_date', order = 'desc' } = req.query;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (client_name) {
        conditions.push(`ci.client_name ILIKE $${idx++}`);
        values.push(`%${client_name}%`);
    }

    if (is_paid === 'true') {
        conditions.push('ci.is_paid = true');
    } else if (is_paid === 'false') {
        conditions.push('ci.is_paid = false');
    }

    if (search) {
        conditions.push(`(ci.client_name ILIKE $${idx} OR ci.invoice_number ILIKE $${idx} OR ci.notes ILIKE $${idx})`);
        values.push(`%${search}%`);
        idx++;
    }

    conditions.push('ci.deleted_at IS NULL');
    const where = `WHERE ${conditions.join(' AND ')}`;
    const SORT_COLUMNS: Record<string, string> = {
        issued_date: 'ci.issued_date',
        due_date: 'ci.due_date',
        amount: 'ci.amount',
        client_name: 'ci.client_name',
        paid_date: 'ci.paid_date',
        created_at: 'ci.created_at',
    };
    const sortExpr = SORT_COLUMNS[sort as string] || 'ci.issued_date';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const query = `
        SELECT ci.*, u.display_name AS creator_name
        FROM client_invoices ci
        LEFT JOIN users u ON ci.created_by = u.id
        ${where}
        ORDER BY
            CASE WHEN ci.is_paid THEN 1 ELSE 0 END,
            ${sortExpr} ${sortOrder} NULLS LAST
    `;

    const result = await pool.query(query, values);
    res.json(result.rows);
}));

// GET /api/client-invoices/summary — aggregate stats
router.get('/summary', asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { rows: [stats] } = await pool.query(`
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE is_paid = true)::int AS paid_count,
            COUNT(*) FILTER (WHERE is_paid = false)::int AS unpaid_count,
            COALESCE(SUM(amount) FILTER (WHERE is_paid = false), 0) AS unpaid_total,
            COALESCE(SUM(amount) FILTER (WHERE is_paid = true), 0) AS paid_total,
            COALESCE(SUM(COALESCE(paid_amount, amount)) FILTER (WHERE is_paid = true), 0) AS collected_total,
            COALESCE(SUM(amount), 0) AS grand_total
        FROM client_invoices
        WHERE deleted_at IS NULL
    `);

    res.json({
        total: stats.total,
        paid_count: stats.paid_count,
        unpaid_count: stats.unpaid_count,
        unpaid_total: parseFloat(stats.unpaid_total),
        paid_total: parseFloat(stats.paid_total),
        collected_total: parseFloat(stats.collected_total),
        grand_total: parseFloat(stats.grand_total),
    });
}));

// GET /api/client-invoices/clients — distinct client names for autocomplete
router.get('/clients', asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(`
        SELECT DISTINCT client_name FROM client_invoices WHERE deleted_at IS NULL ORDER BY client_name ASC
    `);
    res.json(rows.map(r => r.client_name));
}));

// POST /api/client-invoices — create invoice
router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { client_name, invoice_number, amount, currency, issued_date, due_date, notes } = req.body;

    if (!client_name || !amount || !issued_date) {
        res.status(400).json({ error: 'client_name, amount és issued_date kötelező.' });
        return;
    }

    const { rows } = await pool.query(`
        INSERT INTO client_invoices (client_name, invoice_number, amount, currency, issued_date, due_date, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `, [
        client_name.trim(), invoice_number?.trim() || null,
        amount, currency || 'RON',
        issued_date, due_date || null,
        notes?.trim() || null, req.user!.id,
    ]);

    res.status(201).json(rows[0]);
}));

// PUT /api/client-invoices/:id — update invoice
router.put('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { client_name, invoice_number, amount, currency, issued_date, due_date, notes } = req.body;

    const { rows } = await pool.query(`
        UPDATE client_invoices SET
            client_name = COALESCE($1, client_name),
            invoice_number = COALESCE($2, invoice_number),
            amount = COALESCE($3, amount),
            currency = COALESCE($4, currency),
            issued_date = COALESCE($5, issued_date),
            due_date = $6,
            notes = $7,
            updated_at = NOW()
        WHERE id = $8 AND deleted_at IS NULL
        RETURNING *
    `, [client_name, invoice_number, amount, currency, issued_date, due_date || null, notes || null, req.params.id]);

    if (rows.length === 0) {
        res.status(404).json({ error: 'Számla nem található.' });
        return;
    }

    res.json(rows[0]);
}));

// PUT /api/client-invoices/:id/mark-paid — mark as paid
router.put('/:id/mark-paid', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { paid_date, paid_amount } = req.body;

    // Fetch invoice first to validate
    const { rows: [invoice] } = await pool.query(
        'SELECT id, amount FROM client_invoices WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
    );

    if (!invoice) {
        res.status(404).json({ error: 'Számla nem található.' });
        return;
    }

    // Validate paid_amount if provided
    if (paid_amount !== undefined && paid_amount !== null) {
        const pa = Number(paid_amount);
        if (isNaN(pa) || pa < 0) {
            res.status(400).json({ error: 'A kifizetett összeg nem lehet negatív.' });
            return;
        }
        if (pa > parseFloat(invoice.amount)) {
            res.status(400).json({ error: `A kifizetett összeg (${pa}) nem haladhatja meg a számla értékét (${invoice.amount}).` });
            return;
        }
    }

    const { rows } = await pool.query(`
        UPDATE client_invoices SET
            is_paid = true,
            paid_date = COALESCE($1, CURRENT_DATE),
            paid_amount = $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
    `, [paid_date || null, paid_amount ?? null, req.params.id]);

    res.json(rows[0]);
}));

// PUT /api/client-invoices/:id/mark-unpaid — revert to unpaid
router.put('/:id/mark-unpaid', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(`
        UPDATE client_invoices SET is_paid = false, paid_date = NULL, paid_amount = NULL, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL RETURNING *
    `, [req.params.id]);

    if (rows.length === 0) {
        res.status(404).json({ error: 'Számla nem található.' });
        return;
    }

    res.json(rows[0]);
}));

// DELETE /api/client-invoices/:id (soft delete)
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        'UPDATE client_invoices SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [req.params.id]
    );

    if (rows.length === 0) {
        res.status(404).json({ error: 'Számla nem található.' });
        return;
    }

    res.json({ message: 'Számla törölve.' });
}));

export default router;

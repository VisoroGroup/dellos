import { Router, Response } from 'express';
import pool from '../config/database';
import { AuthRequest, authMiddleware, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import multer from 'multer';
import { parseExcelBuffer, matchTransaction, ParsedTransaction } from '../services/bankStatementParser';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// Superadmin only
router.use(authMiddleware);
router.use(requireRole('superadmin'));

// ==========================================
// POST /api/bank-import/upload — upload + parse Excel
// ==========================================
router.post('/upload', upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
        res.status(400).json({ error: 'Excel fájl feltöltése kötelező.' });
        return;
    }

    const { bank_account_name, currency } = req.body;

    // Parse the Excel
    const parseResult = await parseExcelBuffer(req.file.buffer);

    if (parseResult.errors.length > 0 && parseResult.transactions.length === 0) {
        res.status(400).json({ error: 'Nem sikerült beolvasni az Excel-t.', details: parseResult.errors });
        return;
    }

    // Create import record
    const importId = uuidv4();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Determine period from transactions
        const dates = parseResult.transactions
            .map(t => t.transactionDate)
            .filter(Boolean) as Date[];
        const periodStart = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
        const periodEnd = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

        await client.query(`
            INSERT INTO bank_statement_imports (id, file_name, file_data, bank_account_name, currency, period_start, period_end, total_transactions, status, imported_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
        `, [
            importId, req.file.originalname, req.file.buffer,
            bank_account_name || 'Raiffeisen',
            currency || 'RON',
            periodStart, periodEnd,
            parseResult.transactions.length,
            req.user!.id,
        ]);

        // Insert parsed rows
        for (const tx of parseResult.transactions) {
            await client.query(`
                INSERT INTO bank_statement_rows (id, import_id, row_index, transaction_date, description, debit, credit, currency, reference, counterparty, raw_data)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                uuidv4(), importId, tx.rowIndex,
                tx.transactionDate, tx.description,
                tx.debit, tx.credit,
                tx.currency, tx.reference, tx.counterparty,
                JSON.stringify(tx.rawData),
            ]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            import_id: importId,
            file_name: req.file.originalname,
            sheet_name: parseResult.sheetName,
            total_rows: parseResult.totalRows,
            parsed_rows: parseResult.parsedRows,
            detected_columns: parseResult.detectedColumns,
            errors: parseResult.errors,
            period_start: periodStart,
            period_end: periodEnd,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ==========================================
// GET /api/bank-import/imports — list imports
// ==========================================
router.get('/imports', asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(`
        SELECT i.id, i.file_name, i.bank_account_name, i.currency, i.period_start, i.period_end,
               i.total_transactions, i.matched_count, i.created_count, i.skipped_count,
               i.status, i.created_at, i.completed_at,
               u.display_name AS imported_by_name
        FROM bank_statement_imports i
        LEFT JOIN users u ON i.imported_by = u.id
        ORDER BY i.created_at DESC
    `);
    res.json(rows);
}));

// ==========================================
// GET /api/bank-import/imports/:id — import details with rows
// ==========================================
router.get('/imports/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rows: [importRow] } = await pool.query(
        'SELECT * FROM bank_statement_imports WHERE id = $1',
        [req.params.id]
    );

    if (!importRow) {
        res.status(404).json({ error: 'Import nem található.' });
        return;
    }

    const { rows: txRows } = await pool.query(`
        SELECT r.*, p.title AS matched_payment_title, p.amount AS matched_payment_amount, p.beneficiary_name AS matched_payment_beneficiary
        FROM bank_statement_rows r
        LEFT JOIN payments p ON r.matched_payment_id = p.id
        WHERE r.import_id = $1
        ORDER BY r.row_index ASC
    `, [req.params.id]);

    // Don't send the binary file data
    const { file_data, ...importData } = importRow;

    res.json({ import: importData, rows: txRows });
}));

// ==========================================
// POST /api/bank-import/imports/:id/match — run auto-matching
// ==========================================
router.post('/imports/:id/match', asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get unmatched rows
    const { rows: txRows } = await pool.query(
        `SELECT * FROM bank_statement_rows WHERE import_id = $1 AND match_status = 'unmatched'`,
        [req.params.id]
    );

    if (txRows.length === 0) {
        res.json({ message: 'Nincs párosítatlan sor.', matched: 0 });
        return;
    }

    // Get unpaid payments for matching
    const { rows: payments } = await pool.query(`
        SELECT id, title, amount::float, beneficiary_name, due_date::text, status
        FROM payments
        WHERE deleted_at IS NULL AND status = 'de_platit'
        ORDER BY due_date DESC
    `);

    let matchedCount = 0;

    for (const row of txRows) {
        const tx: ParsedTransaction = {
            rowIndex: row.row_index,
            transactionDate: row.transaction_date ? new Date(row.transaction_date) : null,
            description: row.description,
            debit: row.debit ? parseFloat(row.debit) : null,
            credit: row.credit ? parseFloat(row.credit) : null,
            currency: row.currency,
            reference: row.reference,
            counterparty: row.counterparty,
            rawData: row.raw_data || {},
        };

        const match = matchTransaction(tx, payments);

        if (match) {
            await pool.query(`
                UPDATE bank_statement_rows SET
                    match_status = 'matched',
                    matched_payment_id = $1,
                    match_confidence = $2,
                    match_reason = $3
                WHERE id = $4
            `, [match.paymentId, match.confidence, match.reason, row.id]);
            matchedCount++;
        }
    }

    // Update import counts
    await pool.query(`
        UPDATE bank_statement_imports SET
            matched_count = (SELECT COUNT(*) FROM bank_statement_rows WHERE import_id = $1 AND match_status = 'matched'),
            status = 'reviewing'
        WHERE id = $1
    `, [req.params.id]);

    res.json({ matched: matchedCount, total: txRows.length });
}));

// ==========================================
// PUT /api/bank-import/rows/:rowId/approve — approve a matched row
// ==========================================
router.put('/rows/:rowId/approve', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rows: [row] } = await pool.query(
        'SELECT * FROM bank_statement_rows WHERE id = $1',
        [req.params.rowId]
    );

    if (!row) {
        res.status(404).json({ error: 'Sor nem található.' });
        return;
    }

    if (row.match_status === 'matched' && row.matched_payment_id) {
        // Mark the payment as paid
        const paidDate = row.transaction_date || new Date();
        await pool.query(`
            UPDATE payments SET status = 'platit', paid_at = $1, paid_by = $2, updated_at = NOW()
            WHERE id = $3 AND status != 'platit'
        `, [paidDate, req.user!.id, row.matched_payment_id]);
    }

    await pool.query(`
        UPDATE bank_statement_rows SET
            approved = true, approved_by = $1, approved_at = NOW(), match_status = CASE WHEN match_status = 'unmatched' THEN 'skipped' ELSE match_status END
        WHERE id = $2
    `, [req.user!.id, req.params.rowId]);

    res.json({ message: 'Sor jóváhagyva.' });
}));

// ==========================================
// PUT /api/bank-import/rows/:rowId/assign — assign category + create payment
// ==========================================
router.put('/rows/:rowId/assign', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { category, title, payment_id } = req.body;
    const { rows: [row] } = await pool.query('SELECT * FROM bank_statement_rows WHERE id = $1', [req.params.rowId]);

    if (!row) {
        res.status(404).json({ error: 'Sor nem található.' });
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (payment_id) {
            // Link to existing payment
            await client.query(`
                UPDATE bank_statement_rows SET
                    matched_payment_id = $1, match_status = 'matched', match_confidence = 100, match_reason = 'Manuális párosítás',
                    category_suggestion = $2, approved = true, approved_by = $3, approved_at = NOW()
                WHERE id = $4
            `, [payment_id, category || null, req.user!.id, req.params.rowId]);

            // Mark payment as paid
            await client.query(`
                UPDATE payments SET status = 'platit', paid_at = COALESCE($1, NOW()), paid_by = $2, updated_at = NOW()
                WHERE id = $3 AND status != 'platit'
            `, [row.transaction_date, req.user!.id, payment_id]);
        } else {
            // Create new payment from transaction
            const amount = row.debit ? parseFloat(row.debit) : parseFloat(row.credit);
            const isIncome = !row.debit && row.credit;
            const paymentTitle = title || row.counterparty || row.description?.substring(0, 100) || 'Importált tétel';

            const newPaymentId = uuidv4();
            await client.query(`
                INSERT INTO payments (id, title, amount, currency, category, beneficiary_name, due_date, status, paid_at, paid_by, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), 'platit', COALESCE($7, NOW()), $8, $8)
            `, [
                newPaymentId, paymentTitle, amount, row.currency || 'RON',
                category || (isIncome ? 'incasare_client' : 'partener_furnizor'),
                row.counterparty || null,
                row.transaction_date,
                req.user!.id,
            ]);

            await client.query(`
                UPDATE bank_statement_rows SET
                    matched_payment_id = $1, match_status = 'created', match_confidence = 100, match_reason = 'Manuálisan létrehozva',
                    category_suggestion = $2, approved = true, approved_by = $3, approved_at = NOW()
                WHERE id = $4
            `, [newPaymentId, category, req.user!.id, req.params.rowId]);
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    res.json({ message: 'Sor feldolgozva.' });
}));

// ==========================================
// PUT /api/bank-import/rows/:rowId/skip — skip a row
// ==========================================
router.put('/rows/:rowId/skip', asyncHandler(async (req: AuthRequest, res: Response) => {
    await pool.query(`
        UPDATE bank_statement_rows SET match_status = 'skipped', approved = true, approved_by = $1, approved_at = NOW()
        WHERE id = $2
    `, [req.user!.id, req.params.rowId]);

    res.json({ message: 'Sor kihagyva.' });
}));

// ==========================================
// POST /api/bank-import/imports/:id/approve-all — approve all matched rows
// ==========================================
router.post('/imports/:id/approve-all', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rows: matchedRows } = await pool.query(`
        SELECT r.id, r.matched_payment_id, r.transaction_date
        FROM bank_statement_rows r
        WHERE r.import_id = $1 AND r.match_status = 'matched' AND r.approved = false AND r.match_confidence >= 70
    `, [req.params.id]);

    for (const row of matchedRows) {
        // Mark payment as paid
        if (row.matched_payment_id) {
            await pool.query(`
                UPDATE payments SET status = 'platit', paid_at = COALESCE($1, NOW()), paid_by = $2, updated_at = NOW()
                WHERE id = $3 AND status != 'platit'
            `, [row.transaction_date, req.user!.id, row.matched_payment_id]);
        }

        await pool.query(`
            UPDATE bank_statement_rows SET approved = true, approved_by = $1, approved_at = NOW()
            WHERE id = $2
        `, [req.user!.id, row.id]);
    }

    // Update import
    await pool.query(`
        UPDATE bank_statement_imports SET
            matched_count = (SELECT COUNT(*) FROM bank_statement_rows WHERE import_id = $1 AND match_status = 'matched'),
            created_count = (SELECT COUNT(*) FROM bank_statement_rows WHERE import_id = $1 AND match_status = 'created'),
            skipped_count = (SELECT COUNT(*) FROM bank_statement_rows WHERE import_id = $1 AND match_status = 'skipped')
        WHERE id = $1
    `, [req.params.id]);

    res.json({ approved: matchedRows.length });
}));

// ==========================================
// POST /api/bank-import/imports/:id/complete — finalize import
// ==========================================
router.post('/imports/:id/complete', asyncHandler(async (req: AuthRequest, res: Response) => {
    await pool.query(`
        UPDATE bank_statement_imports SET
            status = 'completed',
            completed_at = NOW(),
            matched_count = (SELECT COUNT(*) FROM bank_statement_rows WHERE import_id = $1 AND match_status = 'matched'),
            created_count = (SELECT COUNT(*) FROM bank_statement_rows WHERE import_id = $1 AND match_status = 'created'),
            skipped_count = (SELECT COUNT(*) FROM bank_statement_rows WHERE import_id = $1 AND match_status = 'skipped')
        WHERE id = $1
    `, [req.params.id]);

    res.json({ message: 'Import véglegesítve.' });
}));

export default router;

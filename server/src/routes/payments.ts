import { Router, Response } from 'express';
import pool from '../config/database';
import { PoolClient } from 'pg';
import { AuthRequest, authMiddleware, requireRole } from '../middleware/auth';
import { validateCreatePayment } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { dispatchWebhook } from '../services/webhookService';
import { v4 as uuidv4 } from 'uuid';
import { PaymentReminderType } from '../types';

const router = Router();

// All finance routes are protected and accessible ONLY to admins
router.use(authMiddleware);
router.use(requireRole('admin'));

// Helper to generate reminders when creating a payment
const generatePaymentReminders = async (paymentId: string, dueDate: Date, client: PoolClient) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const diffTime = due.getTime() - today.getTime(); // positive = future, negative = past
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // If due date is in the past, only create an overdue reminder for today
    if (diffDays < 0) {
        await client.query(
            `INSERT INTO payment_reminders (id, payment_id, reminder_type, scheduled_date, actual_sent_date)
             VALUES ($1, $2, 'overdue', $3, $3)`,
            [uuidv4(), paymentId, today.toISOString()]
        );
        return;
    }

    const reminders: { type: PaymentReminderType, daysBefore: number }[] = [
        { type: 'day_30', daysBefore: 30 },
        { type: 'day_21', daysBefore: 21 },
        { type: 'day_14', daysBefore: 14 },
        { type: 'day_7', daysBefore: 7 },
        { type: 'day_0', daysBefore: 0 }
    ];

    for (const reminder of reminders) {
        if (diffDays >= reminder.daysBefore) {
            const scheduledDate = new Date(due);
            scheduledDate.setDate(due.getDate() - reminder.daysBefore);

            // Skip if scheduled date is in the past (already missed)
            if (scheduledDate < today) continue;
            
            // Adjust for weekend -> move to Friday
            let actualSentDate = new Date(scheduledDate);
            const dayOfWeek = actualSentDate.getDay();
            if (dayOfWeek === 0) { // Sunday
                actualSentDate.setDate(actualSentDate.getDate() - 2);
            } else if (dayOfWeek === 6) { // Saturday
                actualSentDate.setDate(actualSentDate.getDate() - 1);
            }

            await client.query(
                `INSERT INTO payment_reminders (id, payment_id, reminder_type, scheduled_date, actual_sent_date)
                 VALUES ($1, $2, $3, $4, $5)`,
                [uuidv4(), paymentId, reminder.type, scheduledDate.toISOString(), actualSentDate.toISOString()]
            );
        }
    }
};

// GET /api/payments — list payments with filters
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, category, period, recurring } = req.query;
    let queryParams: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any -- Express query params
    let whereClauses: string[] = ['p.deleted_at IS NULL'];

    if (status) {
        queryParams.push(status);
        whereClauses.push(`status = $${queryParams.length}`);
    }

    if (category) {
        const categories = (category as string).split(',');
        queryParams.push(categories);
        whereClauses.push(`category = ANY($${queryParams.length})`);
    }

    if (recurring === 'true') {
        whereClauses.push(`is_recurring = true`);
    } else if (recurring === 'false') {
        whereClauses.push(`is_recurring = false`);
    }

    if (period) {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);

        if (period === 'luna_aceasta') {
            queryParams.push(startOfMonth.toISOString(), endOfMonth.toISOString());
            whereClauses.push(`due_date >= $${queryParams.length - 1} AND due_date <= $${queryParams.length}`);
        } else if (period === 'luna_viitoare') {
            queryParams.push(nextMonthStart.toISOString(), nextMonthEnd.toISOString());
            whereClauses.push(`due_date >= $${queryParams.length - 1} AND due_date <= $${queryParams.length}`);
        } else if (period === 'depasite') {
            queryParams.push(new Date().toISOString());
            whereClauses.push(`due_date < $${queryParams.length} AND status = 'de_platit'`);
        }
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
        SELECT p.*,
               creator.display_name as creator_name,
               creator.avatar_url as creator_avatar,
               payer.display_name as payer_name,
               payer.avatar_url as payer_avatar
        FROM payments p
        LEFT JOIN users creator ON p.created_by = creator.id
        LEFT JOIN users payer ON p.paid_by = payer.id
        ${whereString}
        ORDER BY 
            CASE WHEN p.status = 'platit' THEN 1 ELSE 0 END,
            p.due_date ASC
    `;

    const { rows } = await pool.query(query, queryParams);
    res.json(rows);
}));

// POST /api/payments — create payment
router.post('/', validateCreatePayment, asyncHandler(async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const {
            title, amount, currency = 'RON', category, beneficiary_name,
            due_date, is_recurring = false, recurring_frequency, initial_comment
        } = req.body;

        const paymentId = uuidv4();
        
        await client.query(
            `INSERT INTO payments (
                id, title, amount, currency, category, beneficiary_name,
                due_date, is_recurring, recurring_frequency, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                paymentId, title, amount, currency, category, beneficiary_name || null,
                due_date, is_recurring, is_recurring ? recurring_frequency : null, req.user!.id
            ]
        );

        // Activity log
        await client.query(
            `INSERT INTO payment_activity_log (id, payment_id, user_id, action_type, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuidv4(), paymentId, req.user!.id, 'created', JSON.stringify({ title, amount, category })]
        );

        // Generate reminders
        await generatePaymentReminders(paymentId, new Date(due_date), client);

        // Initial comment
        if (initial_comment) {
            await client.query(
                `INSERT INTO payment_comments (id, payment_id, author_id, content) VALUES ($1, $2, $3, $4)`,
                [uuidv4(), paymentId, req.user!.id, initial_comment]
            );
        }

        await client.query('COMMIT');
        
        const { rows } = await pool.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating payment:', err);
        res.status(500).json({ error: 'Eroare la crearea plății' });
    } finally {
        client.release();
    }
}));

// GET /api/payments/summary — summary cards
router.get('/summary', asyncHandler(async (req: AuthRequest, res: Response) => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const currentDate = today.toISOString();

    const toPayQuery = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
         WHERE status = 'de_platit' AND deleted_at IS NULL AND due_date >= $1 AND due_date <= $2`,
        [startOfMonth, endOfMonth]
    );

    const paidQuery = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
         WHERE status = 'platit' AND deleted_at IS NULL AND paid_at >= $1 AND paid_at <= $2`,
        [startOfMonth, endOfMonth]
    );

    const overdueQuery = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
         WHERE status = 'de_platit' AND deleted_at IS NULL AND due_date < $1`,
        [currentDate]
    );

    const toPay = parseFloat(toPayQuery.rows[0].total);
    const paid = parseFloat(paidQuery.rows[0].total);
    const overdue = parseFloat(overdueQuery.rows[0].total);

    res.json({
        totalThisMonth: toPay + paid,
        toPayThisMonth: toPay,
        paidThisMonth: paid,
        remainingThisMonth: toPay,
        overdueTotal: overdue
    });
}));

// GET /api/payments/chart — bar chart data (last 6 months)
router.get('/chart', asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const query = `
            SELECT 
                to_char(due_date, 'YYYY-MM') as month,
                SUM(CASE WHEN status = 'platit' THEN amount ELSE 0 END) as paid,
                SUM(CASE WHEN status = 'de_platit' THEN amount ELSE 0 END) as unpaid
            FROM payments
            WHERE deleted_at IS NULL AND due_date >= date_trunc('month', current_date - interval '5 months')
            GROUP BY to_char(due_date, 'YYYY-MM')
            ORDER BY month ASC
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching payment chart data:', err);
        res.status(500).json({ error: 'Eroare la preluarea datelor grafice' });
    }
}));

// GET /api/payments/:id
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            `SELECT p.*,
                   creator.display_name as creator_name,
                   creator.avatar_url as creator_avatar,
                   payer.display_name as payer_name,
                   payer.avatar_url as payer_avatar
             FROM payments p
             LEFT JOIN users creator ON p.created_by = creator.id
             LEFT JOIN users payer ON p.paid_by = payer.id
             WHERE p.id = $1 AND p.deleted_at IS NULL`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Plata negăsită' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}));

// PUT /api/payments/:id/mark-paid
router.put('/:id/mark-paid', asyncHandler(async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Fetch current payment
        const { rows } = await client.query('SELECT * FROM payments WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Plată negăsită' });
        }

        const payment = rows[0];

        // 2. Ensure it's not already paid
        if (payment.status === 'platit') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Plata este deja marcată ca plătită' });
        }

        // 3. Update payment status to 'platit'
        const paidAt = new Date();
        await client.query(
            `UPDATE payments SET status = 'platit', paid_at = $1, paid_by = $2, updated_at = NOW() WHERE id = $3`,
            [paidAt.toISOString(), req.user!.id, req.params.id]
        );

        // 4. Log activity
        await client.query(
            `INSERT INTO payment_activity_log (id, payment_id, user_id, action_type, details) VALUES ($1, $2, $3, $4, $5)`,
            [uuidv4(), req.params.id, req.user!.id, 'marked_paid', JSON.stringify({ paid_at: paidAt })]
        );

        // 5. Cancel remaining unsent reminders for this payment to prevent future emails
        await client.query(
            `UPDATE payment_reminders SET sent = true WHERE payment_id = $1 AND sent = false`,
            [req.params.id]
        );

        // 6. Handle Recurrence
        if (payment.is_recurring && payment.recurring_frequency) {
            const nextDate = new Date(payment.due_date);
            switch (payment.recurring_frequency) {
                case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
                case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
                case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
            }

            const newPaymentId = uuidv4();
            await client.query(
                `INSERT INTO payments (
                    id, title, amount, currency, category, beneficiary_name,
                    due_date, status, is_recurring, recurring_frequency, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    newPaymentId, payment.title, payment.amount, payment.currency, payment.category, payment.beneficiary_name,
                    nextDate.toISOString(), 'de_platit', true, payment.recurring_frequency, req.user!.id
                ]
            );

            // Log that recurring payment was spawned
            await client.query(
                `INSERT INTO payment_activity_log (id, payment_id, user_id, action_type, details) VALUES ($1, $2, $3, $4, $5)`,
                [uuidv4(), req.params.id, req.user!.id, 'recurring_created', JSON.stringify({ next_payment_id: newPaymentId, next_due_date: nextDate })]
            );

            // Generate reminders for the newly spawned recurring payment
            await generatePaymentReminders(newPaymentId, nextDate, client);
        }

        await client.query('COMMIT');

        // Webhook: payment.paid (fire-and-forget, after COMMIT)
        dispatchWebhook('payment.paid', {
            payment: { ...payment, status: 'platit', paid_at: paidAt },
            actor: { id: req.user!.id, name: req.user!.display_name, email: req.user!.email }
        }).catch(err => console.error('[WEBHOOK] payment.paid dispatch error:', err.message));

        res.json({ message: 'Plata a fost marcată ca plătită' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error marking payment paid:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
}));

// DELETE /:id — soft delete payment
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            `UPDATE payments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
            [req.params.id]
        );

        if (rows.length === 0) {
            res.status(404).json({ error: 'Plata negăsită sau deja ștearsă' });
            return;
        }

        // Log the deletion in activity log
        await pool.query(
            `INSERT INTO payment_activity_log (id, payment_id, user_id, action_type, details) VALUES ($1, $2, $3, $4, $5)`,
            [uuidv4(), req.params.id, req.user!.id, 'payment_deleted', JSON.stringify({ title: rows[0].title, amount: rows[0].amount })]
        );

        // Cancel unsent reminders for the deleted payment
        await pool.query(
            `UPDATE payment_reminders SET sent = true, sent_at = NOW() WHERE payment_id = $1 AND sent = false`,
            [req.params.id]
        );

        res.json({ message: 'Plată ștearsă' });
    } catch (err) {
        console.error('Error deleting payment:', err);
        res.status(500).json({ error: 'Server error' });
    }
}));

router.get('/:id/comments', asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.*, u.display_name as author_name, u.avatar_url as author_avatar
             FROM payment_comments c
             JOIN users u ON c.author_id = u.id
             WHERE c.payment_id = $1
             ORDER BY c.created_at ASC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}));

router.post('/:id/comments', asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const { content } = req.body;
        const newId = uuidv4();
        await pool.query(
            `INSERT INTO payment_comments (id, payment_id, author_id, content) VALUES ($1, $2, $3, $4)`,
            [newId, req.params.id, req.user!.id, content]
        );
        
        await pool.query(
            `INSERT INTO payment_activity_log (id, payment_id, user_id, action_type, details) VALUES ($1, $2, $3, $4, $5)`,
            [uuidv4(), req.params.id, req.user!.id, 'comment_added', JSON.stringify({ content: content.substring(0, 50) })]
        );
        
        const { rows } = await pool.query(`
            SELECT c.*, u.display_name as author_name, u.avatar_url as author_avatar
            FROM payment_comments c JOIN users u ON c.author_id = u.id WHERE c.id = $1
        `, [newId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}));

router.get('/:id/activity', asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const { rows } = await pool.query(
            `SELECT a.*, u.display_name as user_name, u.avatar_url as user_avatar
             FROM payment_activity_log a
             JOIN users u ON a.user_id = u.id
             WHERE a.payment_id = $1
             ORDER BY a.created_at DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}));

export default router;

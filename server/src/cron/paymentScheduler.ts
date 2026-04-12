import cron from 'node-cron';
import pool from '../config/database';
import { formatDateRo, isWorkingDay, daysDiff, todayLocal } from '../utils/dateUtils';
import { PAYMENT_CATEGORIES } from '../types';
import { sendEmail } from '../services/emailService';
import { dispatchWebhook } from '../services/webhookService';

interface PaymentForEmail {
    id: string;
    title: string;
    amount: string | number;
    category: string;
    beneficiary_name: string | null;
    due_date: string;
    reminder_type?: string;
    days_overdue?: number;
}

export async function runDailyPaymentEmailJob() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only run on working days
    if (!isWorkingDay(today)) {
        console.log('💳 Payment email job skipped — not a working day');
        return;
    }

    const todayStr = todayLocal();

    console.log(`💳 Running daily payment email job for ${todayStr}`);

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Get scheduled reminders that are due today or earlier and haven't been sent
            const { rows: scheduledReminders } = await client.query(`
                SELECT pr.id as reminder_id, pr.reminder_type, p.* 
                FROM payment_reminders pr
                JOIN payments p ON pr.payment_id = p.id
                WHERE pr.sent = false 
                  AND pr.actual_sent_date::date <= $1::date
                  AND p.status = 'de_platit'
                  AND p.deleted_at IS NULL
            `, [todayStr]);

            // 2. Get overdue payments for the "every 2 working days" logic
            const { rows: allOverdue } = await client.query(`
                SELECT * FROM payments 
                WHERE status = 'de_platit' AND due_date::date < $1::date AND deleted_at IS NULL
            `, [todayStr]);

            // Track which payments shouldn't be processed twice
            const processedPaymentIds = new Set<string>();

            const overduePayments: PaymentForEmail[] = [];
            const dueToday: PaymentForEmail[] = [];
            const due7Days: PaymentForEmail[] = [];
            const due14Days: PaymentForEmail[] = [];
            const due21Days: PaymentForEmail[] = [];
            const due30Days: PaymentForEmail[] = [];

            // Process scheduled reminders
            for (const row of scheduledReminders) {
                processedPaymentIds.add(row.id);
                const p: PaymentForEmail = {
                    id: row.id, title: row.title, amount: row.amount, 
                    category: row.category, beneficiary_name: row.beneficiary_name, due_date: row.due_date
                };

                switch (row.reminder_type) {
                    case 'day_0': dueToday.push(p); break;
                    case 'day_7': due7Days.push(p); break;
                    case 'day_14': due14Days.push(p); break;
                    case 'day_21': due21Days.push(p); break;
                    case 'day_30': due30Days.push(p); break;
                }

                // Mark reminder as sent
                await client.query(`UPDATE payment_reminders SET sent = true, sent_at = NOW() WHERE id = $1`, [row.reminder_id]);
            }

            // Process overdue logic
            // Simple approach: if days diff is positive and even, or if it's currently overdue but never sent since it became overdue.
            // But let's just do: daysDiff (calendar days). If we want strictly "every 2 working days", there's math involved.
            // Let's approximate: 1 working day = 1 calendar day if weekday.
            // Let's just track it by checking payment_reminders 'overdue' records.
            // Batch: get latest overdue reminder sent_at for all overdue payments (eliminates N+1)
            const overdueIds = allOverdue.filter(p => !processedPaymentIds.has(p.id)).map(p => p.id);
            const lastOverdueMap = new Map<string, Date>();
            if (overdueIds.length > 0) {
                const { rows: overdueReminders } = await client.query(`
                    SELECT DISTINCT ON (payment_id) payment_id, sent_at 
                    FROM payment_reminders 
                    WHERE payment_id = ANY($1::uuid[]) AND reminder_type = 'overdue' AND sent = true
                    ORDER BY payment_id, sent_at DESC
                `, [overdueIds]);
                for (const row of overdueReminders) {
                    lastOverdueMap.set(row.payment_id, new Date(row.sent_at));
                }
            }

            for (const payment of allOverdue) {
                if (processedPaymentIds.has(payment.id)) continue;
                
                const dueDateDate = new Date(payment.due_date);
                dueDateDate.setHours(0,0,0,0);
                
                // Look up last overdue reminder from the batch Map
                const lastSentDate = lastOverdueMap.get(payment.id);

                let shouldSend = false;
                if (!lastSentDate) {
                    // Never sent an overdue email for this, send it now
                    shouldSend = true;
                } else {
                    const lastSent = new Date(lastSentDate);
                    lastSent.setHours(0,0,0,0);
                    // Did at least 2 working days pass?
                    let workingDaysPassed = 0;
                    let cursor = new Date(lastSent);
                    while (cursor < today) {
                        cursor.setDate(cursor.getDate() + 1);
                        if (isWorkingDay(cursor)) workingDaysPassed++;
                    }
                    if (workingDaysPassed >= 2) {
                        shouldSend = true;
                    }
                }

                if (shouldSend) {
                    overduePayments.push({
                        id: payment.id, title: payment.title, amount: payment.amount, 
                        category: payment.category, beneficiary_name: payment.beneficiary_name, 
                        due_date: payment.due_date, days_overdue: Math.abs(daysDiff(today, new Date(payment.due_date)))
                    });

                    // Webhook: payment.overdue
                    dispatchWebhook('payment.overdue', {
                        payment: { id: payment.id, title: payment.title, amount: payment.amount, category: payment.category, due_date: payment.due_date },
                        days_overdue: Math.abs(daysDiff(today, new Date(payment.due_date)))
                    }).catch(err => console.error('[WEBHOOK] payment.overdue dispatch error:', err.message));

                    // Log the overdue reminder
                    await client.query(`
                        INSERT INTO payment_reminders (id, payment_id, reminder_type, scheduled_date, actual_sent_date, sent, sent_at)
                        VALUES (gen_random_uuid(), $1, 'overdue', $2, $2, true, NOW())
                    `, [payment.id, todayStr]);
                }
            }

            await client.query('COMMIT');
            client.release();

            // If nothing to send, exit early
            const totalToSend = overduePayments.length + dueToday.length + due7Days.length + due14Days.length + due21Days.length + due30Days.length;
            if (totalToSend === 0) {
                console.log('💳 No payment reminders to send today.');
                return;
            }

            // Calculate totals
            const { rows: summaryRows } = await pool.query(`
                SELECT 
                    SUM(CASE WHEN due_date >= date_trunc('month', current_date) AND due_date < (date_trunc('month', current_date) + interval '1 month') THEN amount ELSE 0 END) as to_pay_month,
                    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'platit' AND deleted_at IS NULL AND paid_at >= date_trunc('month', current_date) AND paid_at < (date_trunc('month', current_date) + interval '1 month')) as paid_month
                FROM payments WHERE status = 'de_platit' AND deleted_at IS NULL
            `);
            const totalToPayMonth = (parseFloat(summaryRows[0]?.to_pay_month ?? '0') || 0) + (parseFloat(summaryRows[0]?.paid_month ?? '0') || 0);
            const paidMonth = parseFloat(summaryRows[0]?.paid_month ?? '0') || 0;
            const remainingMonth = totalToPayMonth - paidMonth;

            // Formatting helper
            const formatMoney = (val: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(val);

            // Construct HTML
            let html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
              <div style="background: #0F172A; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; border-bottom: 4px solid #3B82F6;">
                <h1 style="margin: 0; font-size: 20px;">Visoro Financiar</h1>
                <p style="margin: 5px 0 0; opacity: 0.8; font-size: 14px;">Plăți scadente — ${formatDateRo(today)}</p>
              </div>
              <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px;">
                <p style="font-size: 16px; color: #333;">Bună dimineața!</p>
                <p style="color: #666; font-size: 14px;">Iată situația plăților pentru astăzi:</p>
            `;

            const sectionHelper = (title: string, color: string, icon: string, items: PaymentForEmail[], highlightTotal: boolean = false) => {
                if (items.length === 0) return '';
                const formatLabel = (c: string) => PAYMENT_CATEGORIES[c as keyof typeof PAYMENT_CATEGORIES] || c;
                const totalAmount = items.reduce((acc, p) => acc + parseFloat(p.amount as string), 0);
                
                let out = `
                <div style="margin-top: 24px;">
                  <h2 style="color: ${color}; font-size: 15px; margin-bottom: 8px; text-transform: uppercase;">
                    ${icon} ${title} (${items.length}) — Total: ${formatMoney(totalAmount)}
                  </h2>
                  <div style="border-left: 3px solid ${color}; padding-left: 12px;">
                `;
                
                for (const p of items) {
                    const benf = p.beneficiary_name ? ` — ${p.beneficiary_name}` : '';
                    let daysText = '';
                    if (p.days_overdue) daysText = ` — RESTANT CU ${Math.abs(p.days_overdue)} ZILE`;
                    else if (title.includes('AZI')) daysText = ` — SCADENT AZI`;
                    else daysText = ` — scadent pe ${formatDateRo(p.due_date)}`;

                    out += `<p style="margin: 6px 0; font-size: 14px; ${highlightTotal ? 'font-weight: bold; color: '+color+';' : ''}">
                              • <strong>${p.title}</strong> — ${formatMoney(parseFloat(p.amount as string))}${daysText} — <span style="color: #64748b;">[${formatLabel(p.category)}]</span>${benf}
                            </p>`;
                }
                out += `</div></div>`;
                return out;
            };

            html += sectionHelper('PLĂȚI RESTANTE', '#DC2626', '🚨', overduePayments, true);
            html += sectionHelper('SCADENTE AZI', '#EF4444', '⚠️', dueToday, true);
            html += sectionHelper('SCADENTE ÎN 7 ZILE', '#F59E0B', '🔔', due7Days);
            html += sectionHelper('SCADENTE ÎN 2 SĂPTĂMÂNI', '#3B82F6', '📅', due14Days);
            html += sectionHelper('SCADENTE ÎN 3 SĂPTĂMÂNI', '#8B5CF6', '📋', due21Days);
            html += sectionHelper('SCADENTE ÎNTR-O LUNĂ', '#10B981', '🗓️', due30Days);

            html += `
              <hr style="margin-top: 24px; border: none; border-top: 1px solid #e5e7eb;">
              <div style="background: #F8FAFC; padding: 16px; border-radius: 6px; margin-top: 16px;">
                <p style="margin: 4px 0; font-size: 15px;">💰 TOTAL LUNA ACEASTA: <strong>${formatMoney(totalToPayMonth)}</strong></p>
                <p style="margin: 4px 0; font-size: 15px; color: #10B981;">✅ DEJA PLĂTIT: <strong>${formatMoney(paidMonth)}</strong></p>
                <p style="margin: 4px 0; font-size: 15px; color: #DC2626;">⏳ RĂMAS: <strong>${formatMoney(remainingMonth)}</strong></p>
              </div>
              <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
                Această notificare a fost generată automat de Sarcinator Visoro.
              </p>
              </div>
            </div>
            `;

            // Get all admins
            const { rows: admins } = await pool.query(`SELECT id, email, display_name FROM users WHERE role = 'admin' AND is_active = true`);
            
            for (const admin of admins) {
                try {
                    if (process.env.AZURE_CLIENT_ID) {
                        await sendEmail({
                            to: admin.email,
                            subject: `[Visoro Financiar] Plăți scadente — ${formatDateRo(today)}`,
                            htmlBody: html,
                            displayName: admin.display_name
                        });
                        console.log(`💳 Payment email sent to admin: ${admin.email}`);
                    } else {
                        console.log(`💳 Payment email (mock) to ${admin.email}`);
                    }
                    
                    // Log email
                    const allIds = [...overduePayments, ...dueToday, ...due7Days, ...due14Days, ...due21Days, ...due30Days].map(p => p.id);
                    await pool.query(
                        `INSERT INTO email_logs (user_id, task_ids, email_type, status) VALUES ($1, $2, 'payment_summary', 'sent')`,
                        [admin.id, allIds]
                    );
                } catch (e) {
                    console.error(`Failed to send payment email to ${admin.email}:`, e);
                }
            }

        } catch (txErr) {
            try { await client.query('ROLLBACK'); client.release(); } catch { /* already released */ }
            throw txErr;
        }
    } catch (err) {
        console.error('💳 Payment email job failed:', err);
    }
}

export function startPaymentEmailScheduler() {
    // Runs at 07:00 on Mon-Fri
    cron.schedule('0 7 * * 1-5', () => {
        runDailyPaymentEmailJob();
    }, { timezone: 'Europe/Bucharest' });
    console.log('💳 Payment email scheduler started — runs at 07:00 Europe/Bucharest, Mon-Fri');
}

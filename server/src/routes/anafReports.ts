/**
 * ANAF Reports REST API
 *
 * Endpoints (osszegzo nezetek):
 *   GET /api/anaf/reports/top-suppliers?from=&to=&limit=
 *   GET /api/anaf/reports/monthly?months=
 *   GET /api/anaf/reports/period-summary?from=&to=
 *   GET /api/anaf/reports/scadentar?days=&include_overdue=
 *   GET /api/anaf/reports/total-supplier?from=&to=
 *   GET /api/anaf/reports/all (osszes egy hivasban — UI-nak kenyelmes)
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
    topSuppliers,
    monthlyStats,
    periodSummary,
    scadentar,
    totalSupplierInvoices,
} from '../services/anafDb';

const router = Router();
router.use((req, res, next) => authMiddleware(req as any, res, next));

router.get('/top-suppliers', async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit || '10'), 10), 50);
    const from = (req.query.from as string) || undefined;
    const to = (req.query.to as string) || undefined;
    const rows = await topSuppliers({ limit, from, to });
    res.json(rows);
});

router.get('/monthly', async (req: Request, res: Response) => {
    const months = Math.min(parseInt(String(req.query.months || '12'), 10), 36);
    const rows = await monthlyStats({ months });
    res.json(rows);
});

router.get('/period-summary', async (req: Request, res: Response) => {
    const from = (req.query.from as string) || undefined;
    const to = (req.query.to as string) || undefined;
    const rows = await periodSummary({ from, to });
    res.json(rows);
});

router.get('/scadentar', async (req: Request, res: Response) => {
    const daysAhead = parseInt(String(req.query.days || '30'), 10);
    const includeOverdue = req.query.include_overdue !== 'false';
    const rows = await scadentar({ daysAhead, includeOverdue });
    res.json(rows);
});

router.get('/total-supplier', async (req: Request, res: Response) => {
    const from = (req.query.from as string) || undefined;
    const to = (req.query.to as string) || undefined;
    const rows = await totalSupplierInvoices({ from, to });
    res.json(rows);
});

// Bundle: all reports in one call (UI dashboard kenyelem)
router.get('/all', async (req: Request, res: Response) => {
    const from = (req.query.from as string) || undefined;
    const to = (req.query.to as string) || undefined;
    const months = Math.min(parseInt(String(req.query.months || '12'), 10), 36);
    const topN = Math.min(parseInt(String(req.query.top || '10'), 10), 50);
    const scadDays = parseInt(String(req.query.scad || '30'), 10);

    const [topSup, monthly, summary, scad, totalSupplier] = await Promise.all([
        topSuppliers({ limit: topN, from, to }),
        monthlyStats({ months }),
        periodSummary({ from, to }),
        scadentar({ daysAhead: scadDays, includeOverdue: true }),
        totalSupplierInvoices({ from, to }),
    ]);

    res.json({ topSuppliers: topSup, monthly, summary, scadentar: scad, totalSupplier });
});

export default router;

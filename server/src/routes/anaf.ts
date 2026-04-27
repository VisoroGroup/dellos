/**
 * ANAF SPV REST API routes.
 *
 * Endpoints:
 *   GET  /api/anaf/status                   - OAuth + scheduler status, stats
 *   GET  /api/anaf/oauth/authorize          - redirect to ANAF OAuth login
 *   GET  /api/anaf/oauth/callback?code=...  - OAuth callback (saves token)
 *
 *   GET  /api/anaf/messages                 - paginated list with filters
 *   GET  /api/anaf/messages/:id             - single message + parsed invoice
 *   GET  /api/anaf/messages/:id/zip         - download ZIP attachment
 *   GET  /api/anaf/messages/:id/xml         - download XML
 *   GET  /api/anaf/messages/:id/pdf         - download/view generated PDF
 *
 *   POST /api/anaf/cui-lookup               - { cui } -> ANAF CUI info
 *
 *   POST /api/anaf/check-now                - manually trigger SPV check
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth';
import { anafConfig, isAnafConfigured } from '../config/anaf';
import {
    getAuthorizationUrl,
    exchangeCodeForToken,
    hasToken,
    getValidToken,
} from '../services/anafOauth';
import {
    listMessages,
    countMessages,
    getMessage,
    stats as dbStats,
} from '../services/anafDb';
import { lookupCui } from '../services/cuiLookup';
import { parseInvoiceXml } from '../services/invoiceParser';
import { getNewMessages } from '../services/spvMonitor';
import { fetchPendingAttachments } from '../services/attachmentFetcher';
import { processPendingInvoices } from '../services/invoiceProcessor';

const router = Router();

// All routes (except OAuth callback) require auth.
// The OAuth callback is excluded so ANAF redirect can hit it.
router.use((req, res, next) => {
    if (req.path === '/oauth/callback') return next();
    return authMiddleware(req as any, res, next);
});

// --- Status / health ---
router.get('/status', async (_req: Request, res: Response) => {
    const missing: string[] = [];
    if (!anafConfig.clientId) missing.push('ANAF_CLIENT_ID');
    if (!anafConfig.clientSecret) missing.push('ANAF_CLIENT_SECRET');
    if (!anafConfig.cif) missing.push('ANAF_CIF');

    if (missing.length > 0) {
        return res.json({
            configured: false,
            cif: anafConfig.cif || null,
            missing,
            message: `Lipsesc variabilele de mediu: ${missing.join(', ')}`,
            stats: await dbStats(),
        });
    }
    let tokenStatus: 'missing' | 'valid' | 'expired' = 'missing';
    if (await hasToken()) {
        try {
            await getValidToken();
            tokenStatus = 'valid';
        } catch {
            tokenStatus = 'expired';
        }
    }
    res.json({
        configured: true,
        cif: anafConfig.cif,
        token: tokenStatus,
        stats: await dbStats(),
    });
});

// --- OAuth flow ---
router.get('/oauth/authorize', (_req, res) => {
    if (!isAnafConfigured()) {
        return res.status(400).json({ error: 'ANAF nincs konfiguralva' });
    }
    res.redirect(getAuthorizationUrl());
});

router.get('/oauth/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const error = req.query.error as string | undefined;
    if (error) return res.status(400).send(`<h2>OAuth hiba</h2><pre>${error}</pre>`);
    if (!code) return res.status(400).send('Hianyzo authorization code');

    try {
        await exchangeCodeForToken(code);
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        res.redirect(`${clientUrl}/anaf?auth=success`);
    } catch (err: any) {
        res.status(500).send(`<h2>Token csere hiba</h2><pre>${err.message}</pre>`);
    }
});

// --- Messages list (with filters + pagination) ---
router.get('/messages', async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit || '25'), 10), 100);
    const page = Math.max(parseInt(String(req.query.page || '1'), 10), 1);
    const offset = (page - 1) * limit;

    const filters = {
        search: (req.query.q as string) || undefined,
        tip: (req.query.tip as string) || undefined,
        from: (req.query.from as string) || undefined,
        to: (req.query.to as string) || undefined,
    };

    const [messages, total] = await Promise.all([
        listMessages({ ...filters, limit, offset }),
        countMessages(filters),
    ]);

    res.json({
        messages,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    });
});

// --- Single message detail + parsed invoice ---
router.get('/messages/:id', async (req: Request, res: Response) => {
    const msg = await getMessage(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Mesaj nem talalhato' });

    let invoice = null;
    if (msg.xml_path && fs.existsSync(msg.xml_path)) {
        try {
            const xml = fs.readFileSync(msg.xml_path, 'utf-8');
            invoice = parseInvoiceXml(xml);
        } catch (err: any) {
            console.warn(`[anaf route] XML parse hiba [${msg.id}]:`, err.message);
        }
    }
    res.json({ message: msg, invoice });
});

// --- File downloads ---
router.get('/messages/:id/zip', async (req: Request, res: Response) => {
    const msg = await getMessage(req.params.id);
    if (!msg?.zip_path || !fs.existsSync(msg.zip_path)) {
        return res.status(404).send('ZIP nem talalhato');
    }
    res.download(msg.zip_path, `${req.params.id}.zip`);
});

router.get('/messages/:id/xml', async (req: Request, res: Response) => {
    const msg = await getMessage(req.params.id);
    if (!msg?.xml_path || !fs.existsSync(msg.xml_path)) {
        return res.status(404).send('XML nem talalhato');
    }
    res.download(msg.xml_path, `${req.params.id}.xml`);
});

router.get('/messages/:id/pdf', async (req: Request, res: Response) => {
    const msg = await getMessage(req.params.id);
    if (!msg?.pdf_path || !fs.existsSync(msg.pdf_path)) {
        return res.status(404).send('PDF nem talalhato');
    }
    if (req.query.download === '1') {
        return res.download(msg.pdf_path, `${req.params.id}.pdf`);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.id}.pdf"`);
    fs.createReadStream(msg.pdf_path).pipe(res);
});

// --- CUI lookup ---
router.post('/cui-lookup', async (req: Request, res: Response) => {
    try {
        const cui = req.body?.cui;
        if (!cui) return res.status(400).json({ error: 'CUI hianyzik' });
        const data = await lookupCui(cui);
        if (!data) return res.status(404).json({ error: 'CUI nem talalhato' });
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// --- Manual trigger for SPV check ---
router.post('/check-now', async (_req: Request, res: Response) => {
    try {
        const newMessages = await getNewMessages(1);
        const att = await fetchPendingAttachments();
        const proc = await processPendingInvoices();
        res.json({
            newMessages: newMessages.length,
            attachments: att,
            invoices: proc,
        });
    } catch (err: any) {
        if (err.message === 'TOKEN_EXPIRED') {
            return res.status(401).json({ error: 'Token lejart, ujra autentikalas szukseges' });
        }
        res.status(500).json({ error: err.message });
    }
});

export default router;

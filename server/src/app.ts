import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './database/migrate';
import authRoutes from './routes/auth';
import paymentsRoutes from './routes/payments';
import budgetRoutes from './routes/budgetPlanning';
import clientInvoiceRoutes from './routes/clientInvoices';
import bankImportRoutes from './routes/bankImport';
import anafRoutes from './routes/anaf';
import anafReportsRoutes from './routes/anafReports';
import { globalLimiter, authLimiter } from './middleware/rateLimiter';
import { globalErrorHandler } from './middleware/errorHandler';
import { startPaymentEmailScheduler } from './cron/paymentScheduler';
import { startAnafScheduler } from './cron/anafScheduler';
import pool from './config/database';

function validateEnv() {
    const required = ['DATABASE_URL', 'JWT_SECRET', 'CLIENT_URL'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length > 0) {
        console.error('❌ Missing required env vars:', missing.join(', '));
        process.exit(1);
    }
    if (process.env.NODE_ENV === 'production' && process.env.DEV_AUTH_BYPASS === 'true') {
        console.error('❌ DEV_AUTH_BYPASS=true is FORBIDDEN in production');
        process.exit(1);
    }
}

validateEnv();

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

// Security headers (must come before other middleware)
app.use(helmet({
    contentSecurityPolicy: false, // disable CSP for now — tune later
}));

// Middleware
app.use(cors({
    origin: (() => {
        if (process.env.NODE_ENV === 'production') {
            if (!process.env.CLIENT_URL) {
                console.warn('⚠️ CLIENT_URL is not set in production!');
                return false;
            }
            return process.env.CLIENT_URL;
        }
        return process.env.CLIENT_URL || 'http://localhost:5173';
    })(),
    credentials: false
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting
app.use('/api', globalLimiter);

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/client-invoices', clientInvoiceRoutes);
app.use('/api/bank-import', bankImportRoutes);
app.use('/api/anaf/reports', anafReportsRoutes);
app.use('/api/anaf', anafRoutes);

// Health check
app.get('/api/health', async (_req, res) => {
    try {
        const dbResult = await pool.query('SELECT NOW()');
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: dbResult.rows[0].now,
            uptime: process.uptime(),
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        });
    } catch {
        res.status(503).json({ status: 'error', database: 'disconnected' });
    }
});

// Serve frontend in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(clientDist, 'index.html'));
    });
}

// Global error handler
app.use(globalErrorHandler);

// Start server
const server = app.listen(PORT, async () => {
    console.log(`🚀 Financiar API running on port ${PORT}`);
    console.log(`📌 Environment: ${process.env.NODE_ENV || 'development'}`);

    try {
        await runMigrations();
    } catch (err: any) {
        console.error('❌ MIGRATION FAILED — REFUSING TO START:', err?.message || err);
        process.exit(1);
    }

    startPaymentEmailScheduler();
    void startAnafScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down...');
    server.close(() => {
        pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000);
});

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './database/migrate';
import authRoutes from './routes/auth';
import paymentsRoutes from './routes/payments';
import budgetRoutes from './routes/budgetPlanning';
import clientInvoiceRoutes from './routes/clientInvoices';
import bankImportRoutes from './routes/bankImport';
import { globalLimiter, authLimiter } from './middleware/rateLimiter';
import { globalErrorHandler } from './middleware/errorHandler';
import { startPaymentEmailScheduler } from './cron/paymentScheduler';
import pool from './config/database';

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

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
    credentials: true
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
        console.error('⚠️ Migration error (non-fatal):', err?.message || err);
    }

    startPaymentEmailScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down...');
    server.close(() => {
        pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000);
});

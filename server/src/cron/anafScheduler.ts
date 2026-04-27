/**
 * ANAF SPV scheduler.
 *
 * Periodikusan (default: 5 perc) lekerdezi az SPV uzeneteket,
 * letolti a fuggo ZIP-eket, generalja a PDF-eket.
 * Email ertesites a Microsoft Graph integracio utan jon (kesobb).
 */

import cron from 'node-cron';
import { isAnafConfigured, anafConfig } from '../config/anaf';
import { hasToken } from '../services/anafOauth';
import { getNewMessages } from '../services/spvMonitor';
import { fetchPendingAttachments } from '../services/attachmentFetcher';
import { processPendingInvoices } from '../services/invoiceProcessor';

let running = false;

async function runCheck(): Promise<void> {
    if (running) {
        console.log('[anafScheduler] mar fut egy check, atugras');
        return;
    }
    running = true;
    const now = new Date().toISOString();
    console.log(`[anafScheduler] 🔍 ${now} SPV check...`);

    try {
        // 1) Letolteni az uj uzenetek listajat
        const newMessages = await getNewMessages(1);
        if (newMessages.length > 0) {
            console.log(`[anafScheduler] 📬 ${newMessages.length} uj uzenet`);
        }

        // 2) Mellekletek (ZIP) letoltese
        try {
            const r = await fetchPendingAttachments();
            if (r.ok > 0 || r.failed > 0) {
                console.log(`[anafScheduler] 📦 ${r.ok} letoltve, ${r.failed} hibas`);
            }
        } catch (err: any) {
            if (err.message === 'TOKEN_EXPIRED') {
                console.error('[anafScheduler] ❌ Token lejart letoltes kozben');
            } else throw err;
        }

        // 3) PDF generalas
        const proc = await processPendingInvoices();
        if (proc.ok > 0 || proc.failed > 0) {
            console.log(`[anafScheduler] 📄 ${proc.ok} PDF kesz, ${proc.failed} hibas`);
        }
    } catch (err: any) {
        if (err.message === 'TOKEN_EXPIRED') {
            console.error('[anafScheduler] ❌ Token lejart - autentikalni kell ujra');
        } else {
            console.error('[anafScheduler] ❌ check hiba:', err.message);
        }
    } finally {
        running = false;
    }
}

export async function startAnafScheduler(): Promise<void> {
    if (!isAnafConfigured()) {
        console.log('[anafScheduler] ⏭  Nem configuralt (ANAF_CLIENT_ID/SECRET/CIF hianyzik), kihagyas');
        return;
    }
    if (!(await hasToken())) {
        console.log('[anafScheduler] ⏭  Nincs OAuth token, scheduler indul de check-ek hibazni fognak amig nem auth-olunk');
    }

    const minutes = anafConfig.checkIntervalMinutes;
    const expr = `*/${minutes} * * * *`;
    cron.schedule(expr, () => { void runCheck(); }, { timezone: 'Europe/Bucharest' });
    console.log(`[anafScheduler] ✅ Elindult (minden ${minutes} percben, Europe/Bucharest)`);

    // Egyszeri inditasi check
    void runCheck();
}

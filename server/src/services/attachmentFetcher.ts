/**
 * Attachment Fetcher (TypeScript port)
 *
 * Letolti az ANAF SPV uzenethez tartozo ZIP fajlt (a szamla XML-jet + ANAF aláírást).
 * Endpoint: /descarcare?id=<msg_id>
 *
 * A fajlokat a `data/anaf/attachments/<id>.zip` helyre menti.
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { anafConfig } from '../config/anaf';
import { getValidToken } from './anafOauth';
import { getMessage, updateMessage, listPendingZipDownloads } from './anafDb';

export const ANAF_DATA_DIR = path.join(process.cwd(), 'data', 'anaf');
export const ATTACHMENTS_DIR = path.join(ANAF_DATA_DIR, 'attachments');

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Letolt egy egyetlen ZIP-et az ANAF-tol.
 * Visszaad: az elmentett fajl path-ja, vagy null ha hiba.
 */
export async function fetchAttachment(messageId: string): Promise<string | null> {
    const id = String(messageId);
    const msg = await getMessage(id);
    if (!msg) throw new Error(`Mesaj nem talalhato a DB-ben: ${id}`);

    if (msg.zip_status === 'downloaded' && msg.zip_path && fs.existsSync(msg.zip_path)) {
        return msg.zip_path;
    }

    ensureDir(ATTACHMENTS_DIR);
    const token = await getValidToken();
    const url = `${anafConfig.apiBase}/descarcare`;
    const zipPath = path.join(ATTACHMENTS_DIR, `${id}.zip`);

    try {
        const response = await axios.get(url, {
            params: { id },
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'arraybuffer',
            timeout: 60000,
        });

        const buffer = Buffer.from(response.data as ArrayBuffer);

        // ANAF JSON-t kuld hibanal, ZIP-et sikernel. ZIP "PK" (0x50 0x4B)-vel kezdodik.
        const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4B;
        if (!isZip) {
            let errText: unknown;
            try { errText = JSON.parse(buffer.toString('utf-8')); }
            catch { errText = buffer.toString('utf-8').slice(0, 500); }
            await updateMessage(id, { zip_status: 'failed' });
            console.error(`[attachmentFetcher] ZIP letoltesi hiba [${id}]:`, errText);
            return null;
        }

        fs.writeFileSync(zipPath, buffer);
        await updateMessage(id, { zip_path: zipPath, zip_status: 'downloaded' });
        console.log(`[attachmentFetcher] 📦 ZIP letoltve [${id}] (${buffer.length} byte)`);
        return zipPath;
    } catch (err: any) {
        if (err.response?.status === 401) throw new Error('TOKEN_EXPIRED');
        await updateMessage(id, { zip_status: 'failed' });
        console.error(`[attachmentFetcher] Letoltesi hiba [${id}]:`, err.response?.status || err.message);
        return null;
    }
}

/**
 * Az osszes 'pending' allapotu uzenet ZIP-jet letolti.
 * Hibatuero: egy ZIP hibaja nem allitja meg a tobbit.
 */
export async function fetchPendingAttachments(): Promise<{ ok: number; failed: number }> {
    const pending = await listPendingZipDownloads();
    let ok = 0, failed = 0;
    for (const row of pending) {
        try {
            const result = await fetchAttachment(row.id);
            if (result) ok++; else failed++;
        } catch (err: any) {
            if (err.message === 'TOKEN_EXPIRED') throw err;
            failed++;
        }
        await new Promise(r => setTimeout(r, 300)); // udvarias szunet az ANAF fele
    }
    return { ok, failed };
}

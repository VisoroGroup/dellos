/**
 * SPV Message Monitor (TypeScript port)
 *
 * Az ANAF e-Factura "lista mesaje" endpoint-jat hivja le.
 * Az uj uzeneteket eltarolja a `anaf_messages` tablaba, a regiket atugorja.
 */

import axios from 'axios';
import { anafConfig } from '../config/anaf';
import { getValidToken } from './anafOauth';
import { insertMessageIfNew, RawSpvMessage } from './anafDb';

interface AnafMesajeResponse {
    eroare?: string;
    mesaje?: Array<{
        id: string | number;
        cif?: string;
        data_creare?: string;
        tip?: string;
        detalii?: string;
        id_solicitare?: string;
    }>;
}

export interface SpvMessage {
    id: string;
    cif: string;
    data_creare: string;
    tip: string;
    detalii: string;
    id_solicitare: string;
    raw: Record<string, unknown>;
}

/**
 * Lekerdez minden uzenetet az SPV-bol az utolso N napra.
 */
export async function fetchSpvMessages(days = 1): Promise<SpvMessage[]> {
    const token = await getValidToken();
    const url = `${anafConfig.apiBase}/listaMesajeFactura`;

    try {
        const response = await axios.get<AnafMesajeResponse>(url, {
            params: { zile: days, cif: anafConfig.cif },
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        const data = response.data;
        if (data.eroare) {
            console.warn('[spvMonitor] ANAF API hiba:', data.eroare);
            return [];
        }
        if (!data.mesaje?.length) return [];

        return data.mesaje.map(m => ({
            id: String(m.id),
            cif: String(m.cif || anafConfig.cif),
            data_creare: m.data_creare || '',
            tip: m.tip || '',
            detalii: m.detalii || '',
            id_solicitare: m.id_solicitare || '',
            raw: m as Record<string, unknown>,
        }));
    } catch (err: any) {
        if (err.response?.status === 401) {
            console.error('[spvMonitor] 401 Unauthorized - Token ervenytelen');
            throw new Error('TOKEN_EXPIRED');
        }
        console.error('[spvMonitor] SPV lekerdezesi hiba:', err.response?.data || err.message);
        throw err;
    }
}

/**
 * Visszaad csak az uj (DB-ben meg nem szereplo) uzeneteket.
 * A friss uzeneteket eltaroljuk a DB-ben.
 */
export async function getNewMessages(days = 1): Promise<SpvMessage[]> {
    const all = await fetchSpvMessages(days);
    const newOnes: SpvMessage[] = [];
    for (const msg of all) {
        const raw: RawSpvMessage = {
            id: msg.id,
            cif: msg.cif,
            data_creare: msg.data_creare,
            tip: msg.tip,
            detalii: msg.detalii,
            id_solicitare: msg.id_solicitare,
        };
        const inserted = await insertMessageIfNew(raw);
        if (inserted) newOnes.push(msg);
    }
    if (newOnes.length > 0) {
        console.log(`[spvMonitor] 📬 ${newOnes.length} uj uzenet talalva`);
    }
    return newOnes;
}

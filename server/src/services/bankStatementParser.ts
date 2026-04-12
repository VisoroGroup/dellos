/**
 * Bank Statement Parser — Raiffeisen Excel format
 *
 * Configurable column mapping for different bank formats.
 * Parses uploaded Excel files into structured transaction rows.
 */
import XLSX from 'xlsx';

export interface ParsedTransaction {
    rowIndex: number;
    transactionDate: Date | null;
    description: string;
    debit: number | null;
    credit: number | null;
    currency: string;
    reference: string;
    counterparty: string;
    rawData: Record<string, any>;
}

export interface ColumnMapping {
    dateColumn: string;
    descriptionColumn: string;
    debitColumn: string;
    creditColumn: string;
    referenceColumn?: string;
    counterpartyColumn?: string;
    currencyColumn?: string;
    headerRow: number; // 0-indexed
    skipRows?: number; // rows to skip after header
}

// Default Raiffeisen mapping — will be refined when actual sample is provided
export const RAIFFEISEN_MAPPING: ColumnMapping = {
    dateColumn: 'Data tranzactiei',
    descriptionColumn: 'Detalii tranzactie',
    debitColumn: 'Debit',
    creditColumn: 'Credit',
    referenceColumn: 'Referinta',
    counterpartyColumn: 'Beneficiar/Ordonator',
    currencyColumn: 'Moneda',
    headerRow: 0,
};

// Alternative Raiffeisen column names (for fuzzy matching)
const RAIFFEISEN_ALIASES: Record<string, string[]> = {
    dateColumn: ['Data tranzactiei', 'Data', 'Data tranzacție', 'Data tranzactie', 'Transaction Date', 'Dátum'],
    descriptionColumn: ['Detalii tranzactie', 'Detalii', 'Descriere', 'Description', 'Leírás'],
    debitColumn: ['Debit', 'Suma debit', 'Debitare'],
    creditColumn: ['Credit', 'Suma credit', 'Creditare'],
    referenceColumn: ['Referinta', 'Referință', 'Referinta tranzactie', 'Reference'],
    counterpartyColumn: ['Beneficiar/Ordonator', 'Beneficiar', 'Ordonator', 'Contraparte', 'Partner'],
    currencyColumn: ['Moneda', 'Valuta', 'Currency', 'Pénznem'],
};

function findColumnIndex(headers: string[], aliases: string[]): number {
    for (const alias of aliases) {
        const idx = headers.findIndex(h =>
            h.toLowerCase().trim() === alias.toLowerCase().trim()
        );
        if (idx !== -1) return idx;
    }
    // Fuzzy match — partial containment
    for (const alias of aliases) {
        const idx = headers.findIndex(h =>
            h.toLowerCase().includes(alias.toLowerCase()) ||
            alias.toLowerCase().includes(h.toLowerCase())
        );
        if (idx !== -1) return idx;
    }
    return -1;
}

function parseDate(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(val);
        if (d) return new Date(d.y, d.m - 1, d.d);
    }
    if (typeof val === 'string') {
        // Try various formats
        const formats = [
            /^(\d{4})-(\d{2})-(\d{2})/, // 2025-03-15
            /^(\d{2})\.(\d{2})\.(\d{4})/, // 15.03.2025
            /^(\d{2})\/(\d{2})\/(\d{4})/, // 15/03/2025
        ];
        for (const fmt of formats) {
            const m = val.match(fmt);
            if (m) {
                const d = fmt === formats[0]
                    ? new Date(+m[1], +m[2] - 1, +m[3])
                    : new Date(+m[3], +m[2] - 1, +m[1]);
                if (!isNaN(d.getTime())) return d;
            }
        }
        const parsed = new Date(val);
        if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
}

function parseAmount(val: any): number | null {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        // Handle Romanian number format: 1.234,56
        const cleaned = val.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }
    return null;
}

export function parseExcelBuffer(buffer: Buffer, customMapping?: Partial<ColumnMapping>): {
    transactions: ParsedTransaction[];
    detectedColumns: Record<string, string>;
    sheetName: string;
    totalRows: number;
    parsedRows: number;
    errors: string[];
} {
    const errors: string[] = [];
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    if (wb.SheetNames.length === 0) {
        return { transactions: [], detectedColumns: {}, sheetName: '', totalRows: 0, parsedRows: 0, errors: ['Excel fájl üres.'] };
    }

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

    if (data.length < 2) {
        return { transactions: [], detectedColumns: {}, sheetName, totalRows: data.length, parsedRows: 0, errors: ['Túl kevés sor az Excel-ben.'] };
    }

    const MAX_ROWS = 10000;
    if (data.length > MAX_ROWS) {
        return { transactions: [], detectedColumns: {}, sheetName, totalRows: data.length, parsedRows: 0, errors: [`A fájl túl sok sort tartalmaz (${data.length}, max: ${MAX_ROWS}).`] };
    }

    // Find header row (first row with enough non-empty cells)
    let headerRowIdx = customMapping?.headerRow ?? 0;
    if (!customMapping?.headerRow) {
        for (let i = 0; i < Math.min(data.length, 10); i++) {
            const nonEmpty = data[i].filter((c: any) => c !== '' && c !== null && c !== undefined).length;
            if (nonEmpty >= 3) {
                headerRowIdx = i;
                break;
            }
        }
    }

    const headers = data[headerRowIdx].map((h: any) => String(h || '').trim());
    const detectedColumns: Record<string, string> = {};

    // Auto-detect column indices
    const colIndices: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(RAIFFEISEN_ALIASES)) {
        const idx = findColumnIndex(headers, aliases);
        if (idx !== -1) {
            colIndices[field] = idx;
            detectedColumns[field] = headers[idx];
        } else {
            if (field === 'dateColumn' || field === 'debitColumn' || field === 'creditColumn') {
                errors.push(`Oszlop nem található: ${field} (keresett nevek: ${aliases.join(', ')})`);
            }
        }
    }

    // Parse transactions
    const transactions: ParsedTransaction[] = [];
    const startRow = headerRowIdx + 1 + (customMapping?.skipRows || 0);

    for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        if (!row || row.every((c: any) => c === '' || c === null || c === undefined)) continue;

        const debit = colIndices.debitColumn !== undefined ? parseAmount(row[colIndices.debitColumn]) : null;
        const credit = colIndices.creditColumn !== undefined ? parseAmount(row[colIndices.creditColumn]) : null;

        // Skip rows with no amounts
        if (debit === null && credit === null) continue;

        const rawData: Record<string, any> = {};
        headers.forEach((h: string, idx: number) => {
            if (h && row[idx] !== '' && row[idx] !== undefined) rawData[h] = row[idx];
        });

        transactions.push({
            rowIndex: i,
            transactionDate: colIndices.dateColumn !== undefined ? parseDate(row[colIndices.dateColumn]) : null,
            description: colIndices.descriptionColumn !== undefined ? String(row[colIndices.descriptionColumn] || '') : '',
            debit: debit ? Math.abs(debit) : null,
            credit: credit ? Math.abs(credit) : null,
            currency: colIndices.currencyColumn !== undefined ? String(row[colIndices.currencyColumn] || 'RON') : 'RON',
            reference: colIndices.referenceColumn !== undefined ? String(row[colIndices.referenceColumn] || '') : '',
            counterparty: colIndices.counterpartyColumn !== undefined ? String(row[colIndices.counterpartyColumn] || '') : '',
            rawData,
        });
    }

    return {
        transactions,
        detectedColumns,
        sheetName,
        totalRows: data.length - headerRowIdx - 1,
        parsedRows: transactions.length,
        errors,
    };
}

/**
 * Match a parsed transaction against existing payments.
 * Returns a confidence score (0-100) and match reason.
 */
export function matchTransaction(
    transaction: ParsedTransaction,
    payments: Array<{ id: string; title: string; amount: number; beneficiary_name: string | null; due_date: string; status: string }>
): { paymentId: string; confidence: number; reason: string } | null {
    const txAmount = transaction.debit || transaction.credit || 0;
    if (txAmount === 0) return null;

    let bestMatch: { paymentId: string; confidence: number; reason: string } | null = null;

    for (const payment of payments) {
        let confidence = 0;
        const reasons: string[] = [];

        // Amount match (exact ±0.01)
        if (Math.abs(payment.amount - txAmount) < 0.02) {
            confidence += 50;
            reasons.push('Összeg egyezés');
        } else if (Math.abs(payment.amount - txAmount) / payment.amount < 0.05) {
            // Within 5%
            confidence += 20;
            reasons.push('Összeg hasonló (±5%)');
        } else {
            continue; // No point matching if amount is way off
        }

        // Beneficiary name match
        const txParty = (transaction.counterparty || transaction.description || '').toLowerCase();
        const payBeneficiary = (payment.beneficiary_name || payment.title || '').toLowerCase();

        if (txParty && payBeneficiary) {
            // Check if either contains the other (or significant overlap)
            const words1 = txParty.split(/\s+/).filter(w => w.length > 2);
            const words2 = payBeneficiary.split(/\s+/).filter(w => w.length > 2);
            const overlap = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));

            if (overlap.length >= 2) {
                confidence += 30;
                reasons.push('Partner név egyezés');
            } else if (overlap.length === 1) {
                confidence += 15;
                reasons.push('Partner név részleges');
            }
        }

        // Date proximity
        if (transaction.transactionDate && payment.due_date) {
            const txDate = new Date(transaction.transactionDate);
            const payDate = new Date(payment.due_date);
            const diffDays = Math.abs(txDate.getTime() - payDate.getTime()) / (1000 * 60 * 60 * 24);

            if (diffDays <= 2) {
                confidence += 15;
                reasons.push('Dátum egyezés (±2 nap)');
            } else if (diffDays <= 7) {
                confidence += 8;
                reasons.push('Dátum közel (±7 nap)');
            }
        }

        // (Status check removed — query already filters to unpaid only)

        if (confidence > (bestMatch?.confidence ?? 0)) {
            bestMatch = { paymentId: payment.id, confidence, reason: reasons.join(' + ') };
        }
    }

    return bestMatch && bestMatch.confidence >= 30 ? bestMatch : null;
}

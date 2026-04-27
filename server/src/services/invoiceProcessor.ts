/**
 * Invoice Processor (TypeScript port)
 *
 * Egy letoltott ZIP-bol kibontja az e-Factura XML-t,
 * parsolja, generál PDF-et, es frissiti a DB-t.
 */

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { parseInvoiceXml, ParsedInvoice } from './invoiceParser';
import { generateInvoicePdf } from './pdfGenerator';
import { getMessage, updateMessage, listPendingInvoiceProcessing } from './anafDb';
import { ANAF_DATA_DIR } from './attachmentFetcher';

export const XML_DIR = path.join(ANAF_DATA_DIR, 'xml');
export const PDF_DIR = path.join(ANAF_DATA_DIR, 'pdfs');

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

interface FoundXml {
    name: string;
    content: string;
}

function findInvoiceXml(zipPath: string): FoundXml | null {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    for (const e of entries) {
        if (!e.entryName.toLowerCase().endsWith('.xml')) continue;
        if (e.entryName.toLowerCase().startsWith('semnatura')) continue;
        const content = e.getData().toString('utf-8');
        if (content.includes('<Invoice') || content.includes('<CreditNote')) {
            return { name: e.entryName, content };
        }
    }
    for (const e of entries) {
        if (!e.entryName.toLowerCase().endsWith('.xml')) continue;
        if (e.entryName.toLowerCase().startsWith('semnatura')) continue;
        return { name: e.entryName, content: e.getData().toString('utf-8') };
    }
    return null;
}

export async function processMessage(messageId: string): Promise<ParsedInvoice | null> {
    const id = String(messageId);
    const msg = await getMessage(id);
    if (!msg) throw new Error(`Mesaj nem talalhato: ${id}`);
    if (!msg.zip_path || !fs.existsSync(msg.zip_path)) {
        console.warn(`[invoiceProcessor] ZIP nincs letoltve [${id}]`);
        return null;
    }
    if (msg.pdf_path && fs.existsSync(msg.pdf_path)) return null; // mar feldolgozva

    ensureDir(XML_DIR);
    ensureDir(PDF_DIR);

    let invoice: ParsedInvoice;
    let xmlPath: string;
    try {
        const found = findInvoiceXml(msg.zip_path);
        if (!found) {
            console.warn(`[invoiceProcessor] Nem talalhato XML a ZIP-ben [${id}]`);
            return null;
        }
        xmlPath = path.join(XML_DIR, `${id}.xml`);
        fs.writeFileSync(xmlPath, found.content, 'utf-8');
        invoice = parseInvoiceXml(found.content);
    } catch (err: any) {
        console.error(`[invoiceProcessor] XML parse hiba [${id}]:`, err.message);
        return null;
    }

    let pdfPath: string;
    try {
        pdfPath = path.join(PDF_DIR, `${id}.pdf`);
        await generateInvoicePdf(invoice, pdfPath);
    } catch (err: any) {
        console.error(`[invoiceProcessor] PDF generalas hiba [${id}]:`, err.message);
        return null;
    }

    await updateMessage(id, {
        xml_path: xmlPath,
        pdf_path: pdfPath,
        invoice_number: invoice.invoiceNumber,
        invoice_date: invoice.issueDate,
        invoice_due_date: invoice.dueDate,
        invoice_total: invoice.payableAmount ?? invoice.taxInclusiveAmount,
        invoice_currency: invoice.currency,
        supplier_name: invoice.supplier.name,
        supplier_cif: invoice.supplier.cif,
        customer_name: invoice.customer.name,
        customer_cif: invoice.customer.cif,
    });

    console.log(`[invoiceProcessor] 📄 PDF kesz [${id}] → ${path.basename(pdfPath)} (${invoice.invoiceNumber || '?'} / ${invoice.supplier.name || '-'})`);
    return invoice;
}

export async function processPendingInvoices(): Promise<{ ok: number; failed: number }> {
    const rows = await listPendingInvoiceProcessing();
    let ok = 0, failed = 0;
    for (const row of rows) {
        try {
            const r = await processMessage(row.id);
            if (r) ok++;
        } catch (err: any) {
            console.error(`[invoiceProcessor] Feldolgozasi hiba [${row.id}]:`, err.message);
            failed++;
        }
    }
    return { ok, failed };
}

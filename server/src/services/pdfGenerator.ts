/**
 * PDF Generator (TypeScript port)
 *
 * Egy ParsedInvoice-bol general egy A4 PDF-et (cim, fej, ket oszlop a felek adatainak,
 * tetelek tablazat, osszegek). Ugyanaz a layout mint az SQLite-os verzio.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import { ParsedInvoice } from './invoiceParser';

function fmt(n: number | null, currency = 'RON'): string {
    if (n == null || !Number.isFinite(n)) return '-';
    return n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (currency || '');
}

export function generateInvoicePdf(invoice: ParsedInvoice, outPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const stream = fs.createWriteStream(outPath);
        doc.pipe(stream);

        const title = invoice.documentType === 'CreditNote' ? 'FACTURA STORNO / CREDIT NOTE' : 'FACTURA / INVOICE';
        doc.font('Helvetica-Bold').fontSize(18).text(title, { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(11).font('Helvetica');
        doc.text(`Numar: ${invoice.invoiceNumber || '-'}`, { continued: true })
            .text(`     Data emiterii: ${invoice.issueDate || '-'}`);
        if (invoice.dueDate) doc.text(`Data scadenta: ${invoice.dueDate}`);
        if (invoice.currency) doc.text(`Moneda: ${invoice.currency}`);
        doc.moveDown(0.8);

        const colW = 250;
        const startY = doc.y;
        doc.font('Helvetica-Bold').fontSize(11).text('FURNIZOR', 40, startY);
        doc.font('Helvetica').fontSize(10);
        doc.text(invoice.supplier.name || '-', 40, doc.y, { width: colW });
        if (invoice.supplier.cif) doc.text(`CIF: ${invoice.supplier.cif}`, { width: colW });
        if (invoice.supplier.address) doc.text(invoice.supplier.address, { width: colW });

        const supplierEndY = doc.y;
        doc.font('Helvetica-Bold').fontSize(11).text('CUMPARATOR', 310, startY);
        doc.font('Helvetica').fontSize(10);
        doc.text(invoice.customer.name || '-', 310, startY + 15, { width: colW });
        if (invoice.customer.cif) doc.text(`CIF: ${invoice.customer.cif}`, 310, doc.y, { width: colW });
        if (invoice.customer.address) doc.text(invoice.customer.address, 310, doc.y, { width: colW });

        const customerEndY = doc.y;
        doc.y = Math.max(supplierEndY, customerEndY) + 15;

        doc.font('Helvetica-Bold').fontSize(11).text('PRODUSE / SERVICII', 40, doc.y);
        doc.moveDown(0.3);

        const tableTop = doc.y;
        const cols = {
            no: { x: 40, w: 25, label: 'Nr' },
            name: { x: 65, w: 220, label: 'Denumire' },
            qty: { x: 290, w: 50, label: 'Cant.' },
            price: { x: 340, w: 70, label: 'Pret' },
            vat: { x: 410, w: 40, label: 'TVA%' },
            total: { x: 450, w: 105, label: 'Valoare' },
        };

        doc.font('Helvetica-Bold').fontSize(9);
        for (const c of Object.values(cols)) {
            doc.text(c.label, c.x, tableTop, { width: c.w });
        }
        doc.moveTo(40, tableTop + 12).lineTo(555, tableTop + 12).stroke();

        doc.font('Helvetica').fontSize(9);
        let y = tableTop + 16;
        invoice.lines.forEach((line, i) => {
            if (y > 760) { doc.addPage(); y = 40; }
            doc.text(String(i + 1), cols.no.x, y, { width: cols.no.w });
            doc.text(line.name || '-', cols.name.x, y, { width: cols.name.w });
            doc.text(line.quantity != null ? String(line.quantity) : '-', cols.qty.x, y, { width: cols.qty.w });
            doc.text(line.unitPrice != null ? fmt(line.unitPrice, '') : '-', cols.price.x, y, { width: cols.price.w });
            doc.text(line.vatPercent != null ? String(line.vatPercent) : '-', cols.vat.x, y, { width: cols.vat.w });
            doc.text(line.lineTotal != null ? fmt(line.lineTotal, '') : '-', cols.total.x, y, { width: cols.total.w, align: 'right' });
            const nameH = doc.heightOfString(line.name || '-', { width: cols.name.w });
            y += Math.max(14, nameH + 4);
        });

        doc.moveTo(40, y).lineTo(555, y).stroke();
        y += 10;

        doc.font('Helvetica').fontSize(10);
        const cur = invoice.currency || 'RON';
        const totalsX = 350, labelW = 130, valX = 480, valW = 75;
        const totalsRow = (label: string, value: number | null, bold = false) => {
            if (y > 780) { doc.addPage(); y = 40; }
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
            doc.text(label, totalsX, y, { width: labelW });
            doc.text(fmt(value, cur), valX, y, { width: valW, align: 'right' });
            y += 14;
        };

        if (invoice.taxExclusiveAmount != null) totalsRow('Total fara TVA:', invoice.taxExclusiveAmount);
        if (invoice.taxAmount != null) totalsRow('TVA:', invoice.taxAmount);
        if (invoice.taxInclusiveAmount != null) totalsRow('Total cu TVA:', invoice.taxInclusiveAmount);
        if (invoice.payableAmount != null) totalsRow('De plata:', invoice.payableAmount, true);

        if (invoice.note) {
            y += 10;
            doc.font('Helvetica-Oblique').fontSize(9).text('Mentiuni: ' + invoice.note, 40, y, { width: 515 });
        }

        doc.font('Helvetica-Oblique').fontSize(8).fillColor('#888')
            .text('Generat automat din XML e-Factura (UBL 2.1) - Dellos / ANAF SPV',
                40, 800, { width: 515, align: 'center' });

        doc.end();
        stream.on('finish', () => resolve(outPath));
        stream.on('error', reject);
    });
}

/**
 * e-Factura UBL 2.1 XML parser (TypeScript port).
 *
 * Visszaad egy strukturalt invoice objektumot, kinyerve:
 * szam, datum, devizanem, felek (nev/CIF/cim), tetelek, osszegek.
 */

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
});

export interface InvoiceLine {
    name: string;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    lineTotal: number | null;
    vatPercent: number | null;
}

export interface InvoiceParty {
    name: string | null;
    cif: string | null;
    address: string | null;
}

export interface ParsedInvoice {
    documentType: 'Invoice' | 'CreditNote';
    invoiceNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    currency: string | null;
    note: string | null;
    supplier: InvoiceParty;
    customer: InvoiceParty;
    lineExtensionAmount: number | null;
    taxExclusiveAmount: number | null;
    taxInclusiveAmount: number | null;
    payableAmount: number | null;
    taxAmount: number | null;
    lines: InvoiceLine[];
}

function arr<T>(x: T | T[] | null | undefined): T[] {
    if (x == null) return [];
    return Array.isArray(x) ? x : [x];
}

function text(node: unknown): string | null {
    if (node == null) return null;
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (typeof node === 'object' && node !== null && '#text' in node) {
        return String((node as { '#text': unknown })['#text']);
    }
    return null;
}

function num(node: unknown): number | null {
    const t = text(node);
    if (t == null) return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
}

function extractParty(party: any): InvoiceParty {
    if (!party) return { name: null, cif: null, address: null };
    const p = party.Party || party;

    const name =
        text(p?.PartyLegalEntity?.RegistrationName) ||
        text(p?.PartyName?.Name) ||
        null;

    const cif =
        text(p?.PartyTaxScheme?.CompanyID) ||
        text(p?.PartyLegalEntity?.CompanyID) ||
        text(p?.PartyIdentification?.ID) ||
        null;

    const addr = p?.PostalAddress;
    let address: string | null = null;
    if (addr) {
        const parts = [
            text(addr.StreetName),
            text(addr.AdditionalStreetName),
            text(addr.CityName),
            text(addr.CountrySubentity),
            text(addr.PostalZone),
            text(addr.Country?.IdentificationCode),
        ].filter(Boolean);
        address = parts.length ? parts.join(', ') : null;
    }

    return { name, cif, address };
}

function extractLines(invoice: any): InvoiceLine[] {
    const lines = arr(invoice.InvoiceLine || invoice.CreditNoteLine);
    return lines.map((l: any) => {
        const item = l.Item || {};
        const price = l.Price || {};
        const qty = num(l.InvoicedQuantity || l.CreditedQuantity);
        const unitPrice = num(price.PriceAmount);
        const lineTotal = num(l.LineExtensionAmount);
        const vatPercent = num(item.ClassifiedTaxCategory?.Percent);
        return {
            name: text(item.Name) || '',
            description: text(item.Description) || '',
            quantity: qty,
            unitPrice,
            lineTotal,
            vatPercent,
        };
    });
}

export function parseInvoiceXml(xmlString: string): ParsedInvoice {
    const parsed: any = parser.parse(xmlString);
    const invoice = parsed.Invoice || parsed.CreditNote;
    if (!invoice) {
        throw new Error('Nem talalhato Invoice/CreditNote az XML-ben');
    }

    const isCreditNote = !!parsed.CreditNote;
    const supplier = extractParty(invoice.AccountingSupplierParty);
    const customer = extractParty(invoice.AccountingCustomerParty);
    const monetary = invoice.LegalMonetaryTotal || {};
    const taxTotal = arr(invoice.TaxTotal)[0] || {};

    return {
        documentType: isCreditNote ? 'CreditNote' : 'Invoice',
        invoiceNumber: text(invoice.ID),
        issueDate: text(invoice.IssueDate),
        dueDate: text(invoice.DueDate),
        currency: text(invoice.DocumentCurrencyCode),
        note: text(arr(invoice.Note)[0]),
        supplier,
        customer,
        lineExtensionAmount: num(monetary.LineExtensionAmount),
        taxExclusiveAmount: num(monetary.TaxExclusiveAmount),
        taxInclusiveAmount: num(monetary.TaxInclusiveAmount),
        payableAmount: num(monetary.PayableAmount),
        taxAmount: num(taxTotal.TaxAmount),
        lines: extractLines(invoice),
    };
}

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { anafApi } from '../../services/anaf';
import { ChevronLeft, Download, FileText } from 'lucide-react';

function fmt(n: number | null, c?: string | null) {
    if (n == null) return '-';
    return Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (c ? ' ' + c : '');
}

export default function EFacturaDetailPage() {
    const { id } = useParams<{ id: string }>();

    const { data, isLoading, error } = useQuery({
        queryKey: ['anaf-message', id],
        queryFn: () => anafApi.getMessage(id!),
        enabled: !!id,
    });

    if (isLoading) return <div className="p-6 text-navy-400">Se încarcă...</div>;
    if (error || !data) return <div className="p-6 text-red-400">Mesaj nu a fost găsit</div>;

    const { message: msg, invoice } = data;
    const cur = invoice?.currency || 'RON';

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <Link to="/anaf" className="text-xs text-navy-500 hover:text-blue-400 inline-flex items-center gap-1 mb-1">
                        <ChevronLeft className="w-3 h-3" />E-Facturi
                    </Link>
                    <h1 className="text-2xl font-bold text-white">
                        {invoice ? `Factura ${invoice.invoiceNumber || msg.id}` : msg.tip || `Mesaj ${msg.id}`}
                    </h1>
                    <p className="text-xs text-navy-500 mt-1">Mesaj #{msg.id}</p>
                </div>
                <div className="flex gap-2">
                    {msg.pdf_path && (
                        <>
                            <a href={anafApi.pdfUrl(msg.id)} target="_blank" rel="noreferrer"
                                className="px-3 py-2 bg-blue-500 hover:bg-blue-400 text-white text-sm rounded-lg flex items-center gap-2">
                                <FileText className="w-4 h-4" />Vezi PDF
                            </a>
                            <a href={`${anafApi.pdfUrl(msg.id)}?download=1`}
                                className="px-3 py-2 bg-navy-700/50 hover:bg-navy-600/50 text-navy-200 text-sm rounded-lg flex items-center gap-2">
                                <Download className="w-4 h-4" />Descarcă PDF
                            </a>
                        </>
                    )}
                    {msg.xml_path && (
                        <a href={anafApi.xmlUrl(msg.id)}
                            className="px-3 py-2 bg-navy-700/50 hover:bg-navy-600/50 text-navy-200 text-sm rounded-lg">XML</a>
                    )}
                    {msg.zip_path && (
                        <a href={anafApi.zipUrl(msg.id)}
                            className="px-3 py-2 bg-navy-700/50 hover:bg-navy-600/50 text-navy-200 text-sm rounded-lg">ZIP</a>
                    )}
                </div>
            </div>

            {/* Top stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                    <div className="text-xs text-navy-400 mb-1">Tip mesaj</div>
                    <div className="text-base font-medium text-white">{msg.tip || '-'}</div>
                    <div className="text-xs text-navy-500 mt-1">ID Solicitare: {msg.id_solicitare || '-'}</div>
                </div>
                <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                    <div className="text-xs text-navy-400 mb-1">Data primirii</div>
                    <div className="text-base font-medium text-white">{msg.data_creare || '-'}</div>
                    <div className="text-xs text-navy-500 mt-1">
                        Arhivat: {msg.first_seen_at ? new Date(msg.first_seen_at).toLocaleString('ro-RO') : '-'}
                    </div>
                </div>
                {invoice && (
                    <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                        <div className="text-xs text-navy-400 mb-1">Total de plată</div>
                        <div className="text-xl font-bold text-blue-400 tabular-nums">
                            {fmt(invoice.payableAmount ?? invoice.taxInclusiveAmount, cur)}
                        </div>
                        <div className="text-xs text-navy-500 mt-1">Data emiterii: {invoice.issueDate || '-'}</div>
                    </div>
                )}
                <div className="bg-navy-800/30 rounded-lg p-4 border border-navy-700/30">
                    <div className="text-xs text-navy-400 mb-1">Status</div>
                    <div className="text-base font-medium text-white">
                        {msg.zip_status === 'downloaded' && msg.pdf_path ? 'Procesat'
                            : msg.zip_status === 'downloaded' ? 'ZIP descărcat'
                            : msg.zip_status === 'failed' ? 'Eșuat' : 'În așteptare'}
                    </div>
                    {msg.notified_at && <div className="text-xs text-navy-500 mt-1">
                        Notificat: {new Date(msg.notified_at).toLocaleString('ro-RO')}
                    </div>}
                </div>
            </div>

            {invoice && (
                <>
                    {/* Furnizor + Cumparator */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                        <div className="bg-navy-800/30 rounded-lg p-5 border border-navy-700/30">
                            <h3 className="text-xs uppercase tracking-wide text-navy-400 mb-3">Furnizor</h3>
                            <div className="text-white font-medium">{invoice.supplier.name || '-'}</div>
                            {invoice.supplier.cif && <div className="text-sm text-navy-300 mt-1">CUI: {invoice.supplier.cif}</div>}
                            {invoice.supplier.address && <div className="text-sm text-navy-400 mt-2">{invoice.supplier.address}</div>}
                        </div>
                        <div className="bg-navy-800/30 rounded-lg p-5 border border-navy-700/30">
                            <h3 className="text-xs uppercase tracking-wide text-navy-400 mb-3">Cumpărător</h3>
                            <div className="text-white font-medium">{invoice.customer.name || '-'}</div>
                            {invoice.customer.cif && <div className="text-sm text-navy-300 mt-1">CUI: {invoice.customer.cif}</div>}
                            {invoice.customer.address && <div className="text-sm text-navy-400 mt-2">{invoice.customer.address}</div>}
                        </div>
                    </div>

                    {/* Lines */}
                    <h3 className="text-sm font-medium text-white mb-2 mt-6">Produse / Servicii ({invoice.lines.length})</h3>
                    <div className="bg-navy-800/30 rounded-lg border border-navy-700/30 overflow-hidden mb-5">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-navy-900/50 border-b border-navy-700/30">
                                    <th className="px-3 py-2 text-left text-xs text-navy-400 w-10">#</th>
                                    <th className="px-3 py-2 text-left text-xs text-navy-400">Denumire</th>
                                    <th className="px-3 py-2 text-right text-xs text-navy-400">Cant.</th>
                                    <th className="px-3 py-2 text-right text-xs text-navy-400">Preț unitar</th>
                                    <th className="px-3 py-2 text-right text-xs text-navy-400">TVA %</th>
                                    <th className="px-3 py-2 text-right text-xs text-navy-400">Valoare</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoice.lines.length === 0 && (
                                    <tr><td colSpan={6} className="px-3 py-6 text-center text-navy-500">Niciun rând</td></tr>
                                )}
                                {invoice.lines.map((line, i) => (
                                    <tr key={i} className="border-b border-navy-800/30">
                                        <td className="px-3 py-2 text-navy-500">{i + 1}</td>
                                        <td className="px-3 py-2">
                                            <div className="text-white font-medium">{line.name || '-'}</div>
                                            {line.description && <div className="text-xs text-navy-500 mt-0.5">{line.description}</div>}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-navy-200">{line.quantity ?? '-'}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-navy-200">{fmt(line.unitPrice)}</td>
                                        <td className="px-3 py-2 text-right text-navy-400">{line.vatPercent != null ? line.vatPercent + '%' : '-'}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-white font-medium">{fmt(line.lineTotal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end mb-6">
                        <div className="bg-navy-800/30 rounded-lg p-5 border border-navy-700/30 min-w-[320px]">
                            <h3 className="text-xs uppercase tracking-wide text-navy-400 mb-3">Sumar</h3>
                            {invoice.taxExclusiveAmount != null && (
                                <div className="flex justify-between py-1">
                                    <span className="text-navy-400">Total fără TVA:</span>
                                    <span className="tabular-nums text-white">{fmt(invoice.taxExclusiveAmount, cur)}</span>
                                </div>
                            )}
                            {invoice.taxAmount != null && (
                                <div className="flex justify-between py-1">
                                    <span className="text-navy-400">TVA:</span>
                                    <span className="tabular-nums text-white">{fmt(invoice.taxAmount, cur)}</span>
                                </div>
                            )}
                            {invoice.taxInclusiveAmount != null && (
                                <div className="flex justify-between py-1 border-t border-navy-700/30 mt-1 pt-2">
                                    <span className="text-navy-400">Total cu TVA:</span>
                                    <span className="tabular-nums text-white">{fmt(invoice.taxInclusiveAmount, cur)}</span>
                                </div>
                            )}
                            {invoice.payableAmount != null && (
                                <div className="flex justify-between py-2 border-t border-navy-700/30 mt-1 pt-2">
                                    <span className="text-white font-bold">DE PLATĂ:</span>
                                    <span className="tabular-nums text-blue-400 text-lg font-bold">{fmt(invoice.payableAmount, cur)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* PDF preview iframe */}
                    {msg.pdf_path && (
                        <>
                            <h3 className="text-sm font-medium text-white mb-2 mt-6">PDF generat</h3>
                            <div className="bg-navy-800/30 rounded-lg p-2 border border-navy-700/30">
                                <iframe src={anafApi.pdfUrl(msg.id)} className="w-full h-[700px] rounded bg-white" />
                            </div>
                        </>
                    )}
                </>
            )}

            {!invoice && (
                <div className="bg-navy-800/30 rounded-lg p-5 border border-navy-700/30">
                    <p className="text-navy-300">Detalii: {msg.detalii || '-'}</p>
                    {!msg.zip_path && (
                        <p className="text-sm text-navy-400 mt-2">
                            ZIP-ul nu a fost descărcat încă. Cron-ul îl va descărca automat la următoarea verificare.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

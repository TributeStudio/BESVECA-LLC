import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { draftInvoiceEmail } from '../services/gemini';
import {
    FileText,
    Printer,
    Envelope,
    CircleNotch,
    X,
    Sparkle
} from '@phosphor-icons/react';
import { COMPANY_CONFIG } from '../config/company';

const Invoices: React.FC = () => {
    const { logs, projects, addInvoice, invoices, updateInvoice } = useApp();
    const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');

    // Generator State
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('ALL');
    const [dateFilterType, setDateFilterType] = useState<'ALL' | 'MONTH' | 'RANGE'>('ALL');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // Invoice Terms State
    const [paymentTerms, setPaymentTerms] = useState('DUE_ON_RECEIPT');
    const [customDueDate, setCustomDueDate] = useState('');

    const [showPreview, setShowPreview] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailDraft, setEmailDraft] = useState<string | null>(null);

    const clients = useMemo(() => {
        const uniqueClients = Array.from(new Set(projects.map(p => p.client)));
        return uniqueClients.sort();
    }, [projects]);

    const clientProjects = useMemo(() => {
        if (!selectedClientId) return [];
        return projects.filter(p => p.client === selectedClientId);
    }, [projects, selectedClientId]);

    const filteredLogs = useMemo(() => {
        if (!selectedClientId) return [];

        // 1. Filter by Client
        let filtered = logs.filter(l => {
            const project = projects.find(p => p.id === l.projectId);
            return project?.client === selectedClientId;
        });

        // 2. Filter by Specific Project
        if (selectedProjectId !== 'ALL') {
            filtered = filtered.filter(l => l.projectId === selectedProjectId);
        }

        // 3. Filter by Date
        if (dateFilterType === 'MONTH' && selectedMonth) {
            filtered = filtered.filter(l => l.date.startsWith(selectedMonth));
        } else if (dateFilterType === 'RANGE' && dateRange.start && dateRange.end) {
            filtered = filtered.filter(l => l.date >= dateRange.start && l.date <= dateRange.end);
        }

        return filtered.sort((a, b) => b.date.localeCompare(a.date));
    }, [selectedClientId, selectedProjectId, dateFilterType, selectedMonth, dateRange, logs, projects]);

    const totals = useMemo(() => {
        let subtotal = 0;
        filteredLogs.forEach(l => {
            const project = projects.find(p => p.id === l.projectId);
            if (l.type === 'TIME' && l.hours && project) {
                subtotal += l.hours * project.hourlyRate;
            } else if (l.type === 'EXPENSE' && l.billableAmount) {
                subtotal += l.billableAmount;
            }
        });
        return { subtotal, tax: subtotal * 0, total: subtotal };
    }, [filteredLogs, projects]);

    const calculateDueDate = () => {
        const today = new Date();
        if (paymentTerms === 'NET_15') {
            today.setDate(today.getDate() + 15);
            return today.toISOString().slice(0, 10);
        }
        if (paymentTerms === 'NET_30') {
            today.setDate(today.getDate() + 30);
            return today.toISOString().slice(0, 10);
        }
        if (paymentTerms === 'CUSTOM' && customDueDate) return customDueDate;
        return new Date().toISOString().slice(0, 10); // DUE_ON_RECEIPT
    };

    const getDueDateLabel = () => {
        if (paymentTerms === 'DUE_ON_RECEIPT') return 'Due Upon Receipt';
        if (paymentTerms === 'NET_15') return 'Net 15';
        if (paymentTerms === 'NET_30') return 'Net 30';
        if (paymentTerms === 'CUSTOM') return `Due by ${new Date(customDueDate).toLocaleDateString()}`;
        return 'Due Upon Receipt';
    };

    const getOverdueDays = (dueDate: string) => {
        const due = new Date(dueDate);
        const now = new Date();
        const diffTime = now.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

    const generateInvoiceNumber = (clientName: string) => {
        if (!clientName) return `${COMPANY_CONFIG.invoicePrefix}-DRAFT`;
        const clientCode = clientName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
        const now = new Date();
        const year = now.getFullYear().toString().slice(2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const timeCode = `${year}${month}`;

        // Count existing invoices for this client in this month
        const prefix = `${COMPANY_CONFIG.invoicePrefix}-${clientCode}-${timeCode}`;
        const count = invoices.filter(i => i.invoiceNumber && i.invoiceNumber.startsWith(prefix)).length;
        const sequence = (count + 1).toString().padStart(2, '0');

        return `${prefix}-${sequence}`;
    };

    const draftInvoiceNumber = useMemo(() => generateInvoiceNumber(selectedClientId), [selectedClientId, invoices.length]);

    const handleSaveInvoice = async () => {
        if (!selectedClientId) return;

        const invoiceItems = filteredLogs.map(log => {
            const project = projects.find(p => p.id === log.projectId);
            const rate = log.type === 'TIME' ? (project?.hourlyRate || 0) : (log.cost || 0);
            const quantity = log.type === 'TIME' ? (log.hours || 0) : 1;
            const amount = log.type === 'TIME' ? (log.hours! * project!.hourlyRate) : log.billableAmount!;

            return {
                description: `${project?.name} - ${log.description}`,
                quantity,
                rate,
                amount,
                type: log.type,
                originalLogId: log.id
            };
        });

        const newInvoice = {
            clientId: selectedClientId,
            invoiceNumber: draftInvoiceNumber,
            date: new Date().toISOString().slice(0, 10),
            dueDate: calculateDueDate(),
            terms: paymentTerms,
            items: invoiceItems,
            subtotal: totals.subtotal,
            tax: totals.tax,
            total: totals.total,
            status: 'SENT' as const
        };

        await addInvoice(newInvoice);
        setShowPreview(false);
        setActiveTab('history');
        // Optional: Reset selections
    };

    const handleDraftEmail = async (clientId: string, total: string, projectNames: string[]) => {
        setEmailLoading(true);
        try {
            const draft = await draftInvoiceEmail(clientId, total, projectNames);
            setEmailDraft(draft);
        } catch (error) {
            console.error(error);
        } finally {
            setEmailLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">Billing Center</h1>
                    <p className="text-slate-500">Generate and manage invoices.</p>
                </div>
                {/* Tabs */}
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'create' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Create Invoice
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Invoice History
                    </button>
                </div>
            </div>

            {/* TAB: CREATE */}
            {activeTab === 'create' && (
                <>
                    <div className="flex justify-end mb-4">
                        <button
                            disabled={!selectedClientId || filteredLogs.length === 0}
                            onClick={() => setShowPreview(true)}
                            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            <Printer size={18} weight="duotone" /> Preview Invoice ({filteredLogs.length} Items)
                        </button>
                    </div>

                    {/* Filter Controls (Existing) */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 print:hidden">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guests</label>
                            <select
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                value={selectedClientId}
                                onChange={(e) => {
                                    setSelectedClientId(e.target.value);
                                    setSelectedProjectId('ALL');
                                }}
                            >
                                <option value="">Select Guest...</option>
                                {clients.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        {/* ... (Other filters same as before) ... */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project Scope</label>
                            <select
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                disabled={!selectedClientId}
                            >
                                <option value="ALL">All Active Projects</option>
                                {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Time Period</label>
                            <select
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
                                value={dateFilterType}
                                onChange={(e) => setDateFilterType(e.target.value as any)}
                                disabled={!selectedClientId}
                            >
                                <option value="ALL">All Time</option>
                                <option value="MONTH">Specific Month</option>
                                <option value="RANGE">Date Range</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                {dateFilterType === 'RANGE' ? 'Date Range' : 'Month'}
                            </label>
                            {dateFilterType === 'MONTH' && (
                                <input
                                    type="month"
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                />
                            )}
                            {dateFilterType === 'RANGE' && (
                                <div className="flex gap-2">
                                    <input
                                        type="date"
                                        className="w-1/2 bg-slate-50 border-none rounded-xl px-2 py-2 text-xs font-medium focus:ring-2 focus:ring-slate-900"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    />
                                    <input
                                        type="date"
                                        className="w-1/2 bg-slate-50 border-none rounded-xl px-2 py-2 text-xs font-medium focus:ring-2 focus:ring-slate-900"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    />
                                </div>
                            )}
                            {dateFilterType === 'ALL' && (
                                <div className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm text-slate-400 italic">
                                    Showing all history
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment Terms</label>
                            <div className="flex gap-2">
                                <select
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
                                    value={paymentTerms}
                                    onChange={(e) => setPaymentTerms(e.target.value)}
                                    disabled={!selectedClientId}
                                >
                                    <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                                    <option value="NET_15">Net 15</option>
                                    <option value="NET_30">Net 30</option>
                                    <option value="CUSTOM">Custom Date</option>
                                </select>
                            </div>
                            {paymentTerms === 'CUSTOM' && (
                                <input
                                    type="date"
                                    className="w-full mt-2 bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                    value={customDueDate}
                                    onChange={(e) => setCustomDueDate(e.target.value)}
                                />
                            )}
                        </div>
                    </div>

                    {!selectedClientId ? (
                        <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
                            <FileText size={48} weight="duotone" className="mx-auto text-slate-300 mb-4" />
                            <h2 className="text-xl font-bold text-slate-400">No Guest Selected</h2>
                            <p className="text-slate-400">Choose a guest above to view billable items.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                            {/* ... (Existing Table) ... */}
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                                        <th className="px-8 py-6">Date</th>
                                        <th className="px-8 py-6">Project / Description</th>
                                        <th className="px-8 py-6">Type</th>
                                        <th className="px-8 py-6 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredLogs.map((log) => {
                                        const project = projects.find(p => p.id === log.projectId);
                                        const amount = log.type === 'TIME'
                                            ? (log.hours! * project!.hourlyRate)
                                            : log.billableAmount!;

                                        return (
                                            <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-8 py-6 text-sm text-slate-500 tabular-nums">{log.date}</td>
                                                <td className="px-8 py-6">
                                                    <p className="text-sm font-bold text-slate-900 mb-0.5">{project?.name}</p>
                                                    <p className="text-sm text-slate-500">{log.description}</p>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider
                                                        ${log.type === 'TIME' ? 'bg-indigo-50 text-indigo-600' : 'bg-pink-50 text-pink-600'}`}>
                                                        {log.type}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6 text-sm font-bold text-slate-900 text-right tabular-nums">
                                                    ${amount.toFixed(2)}
                                                    {log.type === 'TIME' && <span className="block text-[10px] font-normal text-slate-400">{log.hours}h @ ${project?.hourlyRate}/h</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={3} className="px-8 py-8 text-right font-bold text-lg">Invoice Total</td>
                                        <td className="px-8 py-8 text-right font-bold text-2xl text-slate-900">${totals.total.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* TAB: HISTORY */}
            {activeTab === 'history' && (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    {invoices.length === 0 ? (
                        <div className="p-20 text-center">
                            <p className="text-slate-400 font-bold">No invoices generated yet.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 bg-slate-50/50">
                                    <th className="px-6 py-4">Invoice #</th>
                                    <th className="px-6 py-4">Guest</th>
                                    <th className="px-6 py-4">Date Issued</th>
                                    <th className="px-6 py-4">Due Date</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {invoices.map((invoice) => {
                                    const overdueDays = getOverdueDays(invoice.dueDate);
                                    const isPaid = invoice.status === 'PAID';
                                    return (
                                        <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-xs font-bold text-slate-500">{invoice.invoiceNumber || '---'}</td>
                                            <td className="px-6 py-4 font-bold text-slate-900">{invoice.clientId}</td>
                                            <td className="px-6 py-4 text-sm text-slate-500">{invoice.date}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className={!isPaid && overdueDays > 0 ? "text-red-500 font-bold" : "text-slate-500"}>
                                                    {invoice.dueDate}
                                                </span>
                                                {!isPaid && overdueDays > 0 && (
                                                    <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                                                        {overdueDays}d Overdue
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-900">${invoice.total.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider
                                                    ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {invoice.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                {!isPaid && (
                                                    <button
                                                        onClick={() => updateInvoice(invoice.id, { status: 'PAID' })}
                                                        className="text-[10px] font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700"
                                                    >
                                                        Mark Paid
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        const projectNames = Array.from(new Set(invoice.items.map(i => i.description.split(' - ')[0])));
                                                        handleDraftEmail(invoice.clientId, invoice.total.toFixed(2), projectNames);
                                                        setEmailDraft("Generating...");
                                                        setShowPreview(false); // Make sure modal closed if opening email elsewhere? Actually let's assume Email View pops up or we show simple modal.
                                                        // For simplicity, we'll reuse the emailDraft state but maybe show it in a simple modal.
                                                        // Actually, let's just log for now or show in a separate minimal modal.
                                                        // Or better: open the draft email logic.
                                                    }}
                                                    className="text-slate-400 hover:text-slate-900"
                                                >
                                                    <Envelope size={18} weight="duotone" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Invoice Modal Preview */}
            {showPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm print:p-0 print:bg-white print:fixed print:inset-0">
                    <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col print:shadow-none print:max-w-none print:max-h-none print:rounded-none">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between print:hidden">
                            <h2 className="font-bold text-xl">Invoice Preview</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleSaveInvoice}
                                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                                >
                                    Save Invoice
                                </button>
                                <button
                                    onClick={() => handleDraftEmail(selectedClientId, totals.total.toFixed(2), clientProjects.map(p => p.name))}
                                    className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-lg text-sm font-bold hover:bg-sky-100 transition-colors"
                                >
                                    {emailLoading ? <CircleNotch size={16} className="animate-spin" /> : <Envelope size={16} weight="duotone" />}
                                    Draft with AI
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors"
                                >
                                    Print PDF
                                </button>
                                <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                    <X size={20} weight="bold" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-12 bg-white printable-area font-sans text-slate-900 print:overflow-visible print:h-auto print:p-0">
                            <div id="invoice-bill" className="max-w-3xl mx-auto print:max-w-none">
                                {/* Header */}
                                <div className="flex justify-between items-start mb-8 border-b border-slate-200 pb-8">
                                    <div>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 bg-black text-white rounded-md flex items-center justify-center font-bold text-lg">{COMPANY_CONFIG.logoInitials}</div>
                                            <span className="font-bold text-lg tracking-tight">{COMPANY_CONFIG.name}</span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 leading-relaxed font-medium">
                                            {COMPANY_CONFIG.address.map((line, i) => <p key={i}>{line}</p>)}
                                            <p>{COMPANY_CONFIG.contact.email}</p>
                                            <p>{COMPANY_CONFIG.contact.phone}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <h2 className="text-xl font-bold text-slate-900 mb-1">INVOICE</h2>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest text-[#94a3b8]">
                                            #{draftInvoiceNumber}
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-2">{new Date().toLocaleDateString()}</p>
                                    </div>
                                </div>

                                {/* Bill To & Context */}
                                <div className="grid grid-cols-2 gap-8 mb-8">
                                    <div>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bill To</h3>
                                        <p className="text-sm font-bold text-slate-900">{selectedClientId}</p>
                                    </div>
                                    <div className="text-right">
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Terms</h3>
                                        <p className="text-sm font-bold text-slate-900">{getDueDateLabel()}</p>
                                    </div>
                                </div>

                                {/* Line Items Table - Compact Apple Style */}
                                <table className="w-full mb-8 border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-900">
                                            <th className="py-2 text-left">Description</th>
                                            <th className="py-2 text-center w-16">Qty</th>
                                            <th className="py-2 text-right w-24">Unit Price</th>
                                            <th className="py-2 text-right w-24">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-[11px]">
                                        {filteredLogs.map((log) => {
                                            const project = projects.find(p => p.id === log.projectId);
                                            const amount = log.type === 'TIME' ? (log.hours! * project!.hourlyRate) : log.billableAmount!;
                                            return (
                                                <tr key={log.id}>
                                                    <td className="py-2 pr-4 align-top">
                                                        <span className="font-bold block text-slate-900">{project?.name}</span>
                                                        <span className="text-slate-500">{log.description}</span>
                                                    </td>
                                                    <td className="py-2 text-center align-top text-slate-500">
                                                        {log.type === 'TIME' ? log.hours : '1'}
                                                    </td>
                                                    <td className="py-2 text-right align-top text-slate-500">
                                                        ${log.type === 'TIME' ? project?.hourlyRate : log.cost}
                                                    </td>
                                                    <td className="py-2 text-right align-top font-bold text-slate-900">
                                                        ${amount.toFixed(2)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Totals Section */}
                                <div className="flex justify-end border-t border-slate-200 pt-4">
                                    <div className="w-48 text-[11px]">
                                        <div className="flex justify-between mb-1 text-slate-500">
                                            <span>Subtotal</span>
                                            <span>${totals.total.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between mb-2 text-slate-500">
                                            <span>Tax</span>
                                            <span>$0.00</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-200 pt-2">
                                            <span>Total</span>
                                            <span>${totals.total.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="mt-12 pt-8 border-t border-slate-100 text-center">
                                    <div className="mb-8 text-[10px] text-slate-500 leading-relaxed font-medium">
                                        <p className="font-bold uppercase tracking-widest text-slate-400 mb-2">Remit Payment To</p>
                                        <p>{COMPANY_CONFIG.bank.name}</p>
                                        <p>{COMPANY_CONFIG.bank.address}</p>
                                        <p>Routing No: {COMPANY_CONFIG.bank.routing} &nbsp;&bull;&nbsp; Account No: {COMPANY_CONFIG.bank.account}</p>
                                    </div>
                                    <p className="text-[10px] text-slate-300">Thank you for your business.</p>
                                </div>
                            </div>
                        </div>

                        {/* AI Email Draft Panel */}
                        {emailDraft && (
                            <div className="bg-slate-50 p-8 border-t border-slate-100 animate-in slide-in-from-bottom duration-500 print:hidden">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold flex items-center gap-2 text-slate-900">
                                        <Sparkle size={16} weight="fill" className="text-amber-500" />
                                        AI-Powered Email Draft
                                    </h3>
                                    <button onClick={() => setEmailDraft(null)} className="text-slate-400 hover:text-slate-600">
                                        <X size={16} weight="bold" />
                                    </button>
                                </div>
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                    <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
                                        {emailDraft}
                                    </pre>
                                </div>
                                <button onClick={() => navigator.clipboard.writeText(emailDraft)} className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold mx-auto">
                                    Copy to Clipboard
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Invoices;

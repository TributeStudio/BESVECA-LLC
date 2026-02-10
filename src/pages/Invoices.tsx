import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { draftInvoiceEmail } from '../services/gemini';
import {
    FileText,
    Printer,
    Envelope,
    CircleNotch,
    X,
    Sparkle,
    CreditCard,
    PlusCircle
} from '@phosphor-icons/react';
import { COMPANY_CONFIG } from '../config/company';

const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
};

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

    // Payment Structure State
    const [paymentStructure, setPaymentStructure] = useState<'FULL' | 'DEPOSIT_50'>('FULL');
    const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
    const [balanceDate, setBalanceDate] = useState('');
    const [paymentsReceived, setPaymentsReceived] = useState('');
    const [paymentsReceivedNote, setPaymentsReceivedNote] = useState('');

    const [showPreview, setShowPreview] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailDraft, setEmailDraft] = useState<string | null>(null);

    // Payment Recording State
    const [paymentModalOpen, setPaymentModalOpen] = useState<string | null>(null); // Invoice ID
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [paymentMethod, setPaymentMethod] = useState('Credit Card');
    const [paymentNote, setPaymentNote] = useState('');

    const clients = useMemo(() => {
        const projectClients = projects.map(p => p.client).filter(Boolean);
        const logClients = logs.map(l => l.client).filter(Boolean) as string[];
        const uniqueClients = Array.from(new Set([...projectClients, ...logClients]));
        return uniqueClients.sort();
    }, [projects, logs]);

    const clientProjects = useMemo(() => {
        if (!selectedClientId) return [];
        return projects.filter(p => p.client === selectedClientId);
    }, [projects, selectedClientId]);

    const filteredLogs = useMemo(() => {
        if (!selectedClientId) return [];

        // 1. Filter by Client
        let filtered = logs.filter(l => {
            const project = projects.find(p => p.id === l.projectId);
            const logClient = l.client || project?.client;
            return logClient === selectedClientId;
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

    const earliestCheckIn = useMemo(() => {
        const stayLogs = filteredLogs.filter(l => l.type === 'STAY' && l.checkIn);
        if (stayLogs.length === 0) return '';
        const dates = stayLogs.map(l => l.checkIn!).sort();
        return dates[0];
    }, [filteredLogs]);

    // Auto-set balance date when check-in is found
    React.useEffect(() => {
        if (earliestCheckIn && !balanceDate) {
            setBalanceDate(earliestCheckIn);
        }
    }, [earliestCheckIn]);

    const totals = useMemo(() => {
        let subtotal = 0;
        filteredLogs.forEach(l => {
            const project = projects.find(p => p.id === l.projectId);
            if (l.type === 'TIME' && l.hours && project) {
                subtotal += l.hours * project.hourlyRate;
            } else if ((l.type === 'EXPENSE' || l.type === 'STAY') && l.billableAmount) {
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

            let rate = 0;
            let quantity = 1;
            let amount = log.billableAmount || 0;

            if (log.type === 'TIME') {
                rate = project?.hourlyRate || 0;
                quantity = log.hours || 0;
                amount = quantity * rate;
            } else if (log.type === 'STAY') {
                rate = log.cost || 0; // In STAY, cost stores the rate
                // Calculate nights if possible, otherwise quantity 1 (flat fee)
                if (log.checkIn && log.checkOut && rate > 0) {
                    amount = log.billableAmount || 0;
                    // Approximate nights to avoid floating point issues
                    quantity = Math.round(amount / rate);
                    // Or recalculate nights properly
                    const start = new Date(log.checkIn);
                    const end = new Date(log.checkOut);
                    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                    // If amount ~= rate * diffDays, use diffDays. If flat fee, use 1.
                    if (Math.abs(amount - (rate * diffDays)) < 0.1) {
                        quantity = diffDays;
                    } else {
                        quantity = 1;
                    }
                }
            } else {
                // EXPENSE
                rate = log.cost || 0;
                quantity = 1;
            }

            const dates = log.type === 'STAY' && log.checkIn && log.checkOut
                ? `${formatDate(log.checkIn)} to ${formatDate(log.checkOut)}`
                : log.type === 'TIME' && log.hours
                    ? `${formatDate(log.date)} (${log.hours}h)`
                    : formatDate(log.date);

            return {
                description: log.type === 'STAY'
                    ? `Guest Stay`
                    : log.description,
                quantity,
                rate,
                amount,
                type: log.type,
                originalLogId: log.id,
                dates
            };
        });

        // Generate Schedule
        let paymentSchedule: any[] = [];
        const initialPayment = Number(paymentsReceived) || 0;
        const remainingTotal = totals.total - initialPayment;

        if (paymentStructure === 'DEPOSIT_50') {
            const depositAmount = Math.round(remainingTotal * 0.5 * 100) / 100;
            const balanceAmount = Number((remainingTotal - depositAmount).toFixed(2));
            paymentSchedule = [
                {
                    id: crypto.randomUUID(),
                    label: 'Deposit (50% due upon booking)',
                    date: depositDate || new Date().toISOString().slice(0, 10),
                    amount: depositAmount
                },
                {
                    id: crypto.randomUUID(),
                    label: 'Balance (Due on or before check-in)',
                    date: balanceDate || calculateDueDate(),
                    amount: balanceAmount
                }
            ];
        }

        // Create Initial Payment Record if applicable
        const initialPaymentsList = [];
        if (initialPayment > 0) {
            initialPaymentsList.push({
                id: crypto.randomUUID(),
                date: new Date().toISOString().slice(0, 10),
                amount: initialPayment,
                method: 'Pre-payment',
                note: paymentsReceivedNote || 'Initial Payment / Deposit'
            });
        }

        // Determine status
        let status: 'PAID' | 'PARTIAL' | 'SENT' = 'SENT';
        if (initialPayment >= totals.total - 0.01) {
            status = 'PAID';
        } else if (initialPayment > 0) {
            status = 'PARTIAL';
        }

        const newInvoice = {
            clientId: selectedClientId,
            invoiceNumber: draftInvoiceNumber,
            date: new Date().toISOString().slice(0, 10),
            dueDate: calculateDueDate(),
            terms: paymentTerms,
            items: invoiceItems,
            paymentSchedule: paymentSchedule.length > 0 ? paymentSchedule : undefined,
            subtotal: totals.subtotal,
            tax: totals.tax,
            total: totals.total,
            payments: initialPaymentsList.length > 0 ? initialPaymentsList : undefined,
            status
        };

        await addInvoice(newInvoice);
        setShowPreview(false);
        setActiveTab('history');
        // Reset specific fields
        setPaymentsReceived('');
        setPaymentsReceivedNote('');
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

    const handleRecordPayment = async () => {
        if (!paymentModalOpen || !paymentAmount) return;

        const invoice = invoices.find(i => i.id === paymentModalOpen);
        if (!invoice) return;

        const newPayment = {
            id: crypto.randomUUID(),
            date: paymentDate,
            amount: Number(paymentAmount),
            method: paymentMethod,
            note: paymentNote
        };

        const updatedPayments = [...(invoice.payments || []), newPayment];
        const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);

        // Determine status
        let newStatus: 'SENT' | 'PARTIAL' | 'PAID' = 'SENT';
        if (totalPaid >= invoice.total - 0.01) { // Tolerance for float math
            newStatus = 'PAID';
        } else if (totalPaid > 0) {
            newStatus = 'PARTIAL';
        }

        await updateInvoice(invoice.id, {
            payments: updatedPayments,
            status: newStatus
        });

        setPaymentModalOpen(null);
        setPaymentAmount('');
        setPaymentNote('');
    };

    const getPaidAmount = (invoice: any) => {
        return (invoice.payments || []).reduce((sum: number, p: any) => sum + p.amount, 0);
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
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 print:hidden mb-6">
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

                    {/* Payment Structure Configuration */}
                    {selectedClientId && filteredLogs.length > 0 && (
                        <div className="bg-slate-50/50 border border-slate-200 p-6 rounded-3xl mb-8 print:hidden">
                            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <CreditCard size={18} weight="duotone" /> Payment Structure
                            </h3>
                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="space-y-4 flex-1">
                                    <div className="flex gap-4">
                                        <label className={`flex-1 cursor-pointer p-4 rounded-xl border-2 transition-all
                                            ${paymentStructure === 'FULL' ? 'bg-white border-slate-900 shadow-sm' : 'bg-transparent border-slate-100 hover:border-slate-300'}`}>
                                            <input
                                                type="radio"
                                                name="paymentStructure"
                                                className="hidden"
                                                checked={paymentStructure === 'FULL'}
                                                onChange={() => setPaymentStructure('FULL')}
                                            />
                                            <div className="font-bold text-slate-900 mb-1">Standard Invoice</div>
                                            <div className="text-xs text-slate-500">Full amount due based on terms.</div>
                                        </label>
                                        <label className={`flex-1 cursor-pointer p-4 rounded-xl border-2 transition-all
                                            ${paymentStructure === 'DEPOSIT_50' ? 'bg-white border-slate-900 shadow-sm' : 'bg-transparent border-slate-100 hover:border-slate-300'}`}>
                                            <input
                                                type="radio"
                                                name="paymentStructure"
                                                className="hidden"
                                                checked={paymentStructure === 'DEPOSIT_50'}
                                                onChange={() => setPaymentStructure('DEPOSIT_50')}
                                            />
                                            <div className="font-bold text-slate-900 mb-1">50/50 Split</div>
                                            <div className="text-xs text-slate-500">50% due now, 50% due later.</div>
                                        </label>
                                    </div>
                                </div>

                                {paymentStructure === 'DEPOSIT_50' && (
                                    <div className="flex-1 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deposit Due Date</label>
                                            <input
                                                type="date"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                                value={depositDate}
                                                onChange={(e) => setDepositDate(e.target.value)}
                                            />
                                            <p className="text-[10px] text-slate-500">Usually today (Booking)</p>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Balance Due Date</label>
                                            <input
                                                type="date"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                                value={balanceDate}
                                                onChange={(e) => setBalanceDate(e.target.value)}
                                            />
                                            <p className="text-[10px] text-slate-500">Usually Check-in Date</p>
                                        </div>
                                    </div>
                                )}
                            </div>


                            {/* Pre-Payments Section */}
                            <div className="mt-6 border-t border-slate-200 pt-6">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Payments Already Received</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Amount Received ($)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                            placeholder="0.00"
                                            value={paymentsReceived}
                                            onChange={(e) => setPaymentsReceived(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Note (Optional)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                            placeholder="e.g. Deposit via Wire"
                                            value={paymentsReceivedNote}
                                            onChange={(e) => setPaymentsReceivedNote(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
                                                <td className="px-8 py-6 text-sm text-slate-500 tabular-nums">{formatDate(log.date)}</td>
                                                <td className="px-8 py-6">
                                                    <p className="text-sm font-bold text-slate-900 mb-0.5">{project?.name}</p>
                                                    <p className="text-sm text-slate-500">{log.description}</p>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider
                                                        ${log.type === 'TIME' ? 'bg-indigo-50 text-indigo-600' :
                                                            log.type === 'EXPENSE' ? 'bg-pink-50 text-pink-600' :
                                                                'bg-emerald-50 text-emerald-600'}`}>
                                                        {log.type}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6 text-sm font-bold text-slate-900 text-right tabular-nums">
                                                    ${amount.toFixed(2)}
                                                    {log.type === 'TIME' && <span className="block text-[10px] font-normal text-slate-400">{log.hours}h @ ${project?.hourlyRate}/h</span>}
                                                    {log.type === 'STAY' && log.checkIn && <span className="block text-[10px] font-normal text-slate-400">{formatDate(log.checkIn)} - {formatDate(log.checkOut!)}</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={3} className="px-8 py-4 text-right font-bold text-lg text-slate-500">Total</td>
                                        <td className="px-8 py-4 text-right font-bold text-xl text-slate-500">${totals.total.toFixed(2)}</td>
                                    </tr>
                                    {Number(paymentsReceived) > 0 && (
                                        <>
                                            <tr className="bg-emerald-50/30">
                                                <td colSpan={3} className="px-8 py-2 text-right font-medium text-emerald-600">Payment Received</td>
                                                <td className="px-8 py-2 text-right font-medium text-emerald-600">-${Number(paymentsReceived).toFixed(2)}</td>
                                            </tr>
                                            <tr className="bg-slate-100 border-t-2 border-slate-900">
                                                <td colSpan={3} className="px-8 py-6 text-right font-bold text-xl text-slate-900">Balance Due</td>
                                                <td className="px-8 py-6 text-right font-bold text-3xl text-slate-900">${(totals.total - Number(paymentsReceived)).toFixed(2)}</td>
                                            </tr>
                                        </>
                                    )}
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
                                    const paidAmount = getPaidAmount(invoice);
                                    const balanceDue = invoice.total - paidAmount;

                                    return (
                                        <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-xs font-bold text-slate-500">{invoice.invoiceNumber || '---'}</td>
                                            <td className="px-6 py-4 font-bold text-slate-900">{invoice.clientId}</td>
                                            <td className="px-6 py-4 text-sm text-slate-500">{formatDate(invoice.date)}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className={!isPaid && overdueDays > 0 ? "text-red-500 font-bold" : "text-slate-500"}>
                                                    {formatDate(invoice.dueDate)}
                                                </span>
                                                {!isPaid && overdueDays > 0 && (
                                                    <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                                                        {overdueDays}d Overdue
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="font-bold text-slate-900">${invoice.total.toFixed(2)}</div>
                                                {paidAmount > 0 && Math.abs(balanceDue) > 0.01 && (
                                                    <div className="text-[10px] text-slate-500 font-medium">
                                                        Paid: ${paidAmount.toFixed(2)} <span className="text-amber-600">(Due: ${balanceDue.toFixed(2)})</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider
                                                    ${isPaid ? 'bg-emerald-100 text-emerald-700' :
                                                        invoice.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-slate-100 text-slate-600'}`}>
                                                    {invoice.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                {!isPaid && (
                                                    <button
                                                        onClick={() => {
                                                            setPaymentModalOpen(invoice.id);
                                                            setPaymentAmount(balanceDue.toFixed(2));
                                                        }}
                                                        className="text-[10px] font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 flex items-center gap-1"
                                                    >
                                                        <PlusCircle size={14} weight="bold" /> Pay
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        const projectNames = Array.from(new Set(invoice.items.map(i => i.description.split(' - ')[0])));
                                                        handleDraftEmail(invoice.clientId, invoice.total.toFixed(2), projectNames);
                                                    }}
                                                    className="text-slate-400 hover:text-slate-900 p-1.5"
                                                    title="Draft Email"
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
            )
            }

            {/* Invoice Modal Preview */}
            {
                showPreview && (
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
                                                <div className="w-8 h-8 flex items-center justify-center">
                                                    <img src="/besveca-logo.svg" alt="BESVECA" className="w-full h-full object-contain" />
                                                </div>
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
                                            <p className="text-[11px] text-slate-500 mt-2">{formatDate(new Date().toISOString().slice(0, 10))}</p>
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
                                                <th className="py-2 text-center w-40">Dates / Duration</th>
                                                <th className="py-2 text-right w-24">Fee</th>
                                                <th className="py-2 text-right w-24">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-[11px]">
                                            {filteredLogs.map((log) => {
                                                const project = projects.find(p => p.id === log.projectId);
                                                const amount = log.type === 'TIME' ? (log.hours! * project!.hourlyRate) : log.billableAmount!;

                                                // Display Logic matches handleSaveInvoice
                                                const description = log.type === 'STAY' ? 'Guest Stay' : log.description;
                                                const dates = log.type === 'STAY' && log.checkIn && log.checkOut
                                                    ? `${formatDate(log.checkIn)} to ${formatDate(log.checkOut)}`
                                                    : log.type === 'TIME' && log.hours
                                                        ? `${formatDate(log.date)} (${log.hours}h)`
                                                        : formatDate(log.date);

                                                const fee = log.type === 'TIME' ? project?.hourlyRate : log.cost;

                                                return (
                                                    <tr key={log.id}>
                                                        <td className="py-2 pr-4 align-top">
                                                            <span className="font-bold block text-slate-900">{description}</span>
                                                        </td>
                                                        <td className="py-2 text-center align-top text-slate-500">
                                                            {dates}
                                                        </td>
                                                        <td className="py-2 text-right align-top text-slate-500">
                                                            ${fee?.toFixed(2)}
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
                                            <div className={`flex justify-between font-bold text-sm text-slate-900 border-t border-slate-200 pt-2 ${Number(paymentsReceived) > 0 ? 'mb-2' : ''}`}>
                                                <span>Total</span>
                                                <span>${totals.total.toFixed(2)}</span>
                                            </div>
                                            {Number(paymentsReceived) > 0 && (
                                                <>
                                                    <div className="flex justify-between mb-2 text-emerald-600 font-medium">
                                                        <span>Payment Received</span>
                                                        <span>-${Number(paymentsReceived).toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex justify-between font-bold text-base text-slate-900 border-t-2 border-slate-900 pt-2">
                                                        <span>Balance Due</span>
                                                        <span>${(totals.total - Number(paymentsReceived)).toFixed(2)}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Payment Schedule Section */}
                                    {paymentStructure !== 'FULL' && (
                                        <div className="mt-8 border-t border-slate-200 pt-8">
                                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Payment Schedule</h3>
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-[10px] font-bold text-slate-400 uppercase">
                                                        <th className="pb-2">Description</th>
                                                        <th className="pb-2">Due Date</th>
                                                        <th className="pb-2 text-right">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {paymentStructure === 'DEPOSIT_50' ? (
                                                        <>
                                                            <tr>
                                                                <td className="py-2 font-medium text-slate-900">Deposit (50%)</td>
                                                                <td className="py-2 text-slate-500">{depositDate ? formatDate(depositDate) : 'Upon Receipt'}</td>
                                                                <td className="py-2 text-right font-bold text-slate-900">${((totals.total - (Number(paymentsReceived) || 0)) * 0.5).toFixed(2)}</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 font-medium text-slate-900">Balance (50%)</td>
                                                                <td className="py-2 text-slate-500">{balanceDate ? formatDate(balanceDate) : 'Upon Arrival'}</td>
                                                                <td className="py-2 text-right font-bold text-slate-900">${((totals.total - (Number(paymentsReceived) || 0)) - ((totals.total - (Number(paymentsReceived) || 0)) * 0.5)).toFixed(2)}</td>
                                                            </tr>
                                                        </>
                                                    ) : null}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

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
                )
            }

            {/* Payment Recording Modal */}
            {
                paymentModalOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm">
                        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-8 space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold text-slate-900">Record Payment</h3>
                                <button onClick={() => setPaymentModalOpen(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                                    <X size={20} weight="bold" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Amount ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 font-bold focus:ring-2 focus:ring-slate-900"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date Received</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                        value={paymentDate}
                                        onChange={(e) => setPaymentDate(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment Method</label>
                                    <select
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                    >
                                        <option value="Credit Card">Credit Card</option>
                                        <option value="Bank Transfer">Bank Transfer / ACH</option>
                                        <option value="Check">Check</option>
                                        <option value="Cash">Cash</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Note (Optional)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                        value={paymentNote}
                                        onChange={(e) => setPaymentNote(e.target.value)}
                                        placeholder="e.g. Transaction ID"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleRecordPayment}
                                disabled={!paymentAmount}
                                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
                            >
                                Confirm Payment
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Invoices;

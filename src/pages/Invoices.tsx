import React, { useCallback, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { draftInvoiceEmail } from '../services/gemini';
import type { Invoice, InvoiceItem, InvoicePayment, InvoiceSchedule, LogItem } from '../types';
import {
    FileText,
    Printer,
    Envelope,
    CircleNotch,
    X,
    Sparkle,
    CreditCard,
    PlusCircle,
    Trash
} from '@phosphor-icons/react';
import { COMPANY_CONFIG } from '../config/company';
import { fetchCompanyBankConfig } from '../services/companyBank';
import type { CompanyBankConfig } from '../services/companyBank';

type DateFilterType = 'ALL' | 'MONTH' | 'RANGE';
type PaymentStructure = 'FULL' | 'DEPOSIT_50' | 'THIRDS_LONG_STAY';
type EmailInvoice = Pick<Invoice, 'clientId' | 'invoiceNumber' | 'total'> & Partial<Pick<Invoice, 'items'>>;
type StayLog = LogItem & { checkIn: string; checkOut: string };

const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
};

const LONG_STAY_AGREEMENT_NIGHTS = 29;
const MS_PER_DAY = 86400000;

const getStayNights = (checkIn?: string, checkOut?: string) => {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    return Math.max(0, Math.ceil(Math.abs(end.getTime() - start.getTime()) / MS_PER_DAY));
};

const isStayWithDates = (log: { type: string; checkIn?: string; checkOut?: string }): log is StayLog =>
    log.type === 'STAY' && Boolean(log.checkIn && log.checkOut);

const getStayAccommodationTotal = (log: StayLog) => {
    const cleaningFee = log.cleaningFee || 0;
    const cleaningCount = log.cleaningCount || 0;
    const poolHeat = log.poolHeat || 0;
    const tax = Number(log.tax) || 0;
    return Math.max(0, (log.billableAmount || 0) - (cleaningFee * cleaningCount) - poolHeat - tax);
};

const splitIntoThirds = (amount: number) => {
    const first = Math.round((amount / 3) * 100) / 100;
    const second = first;
    const third = Number((amount - first - second).toFixed(2));
    return [first, second, third];
};

const getDefaultSecondPaymentDate = (checkIn?: string) => {
    if (!checkIn) return '';
    const date = new Date(`${checkIn}T12:00:00`);
    date.setMonth(date.getMonth() - 4);
    date.setDate(1);
    return date.toISOString().slice(0, 10);
};

const getPropertyDisplayName = (property?: string) => {
    if (property === 'Skyhouse') return 'Sky House';
    return 'BESVECA House';
};

const getInvoiceLineRank = (log: LogItem) => {
    if (log.type === 'STAY') return 0;
    const description = log.description.toLowerCase();
    if (description.includes('cleaning')) return 1;
    if (description.includes('estimated taxes')) return 2;
    if (description.includes('content creator discount')) return 3;
    if (description.includes('tax adjustment')) return 4;
    if (description.includes('booking confirmation')) return 5;
    if (description.includes('cancellation policy')) return 6;
    if (description.includes('direct-booking savings')) return 7;
    if (description.includes('content creator deliverables')) return 8;
    if (description.includes('payment request')) return 9;
    return 10;
};

const isInvoiceNote = (log: LogItem) =>
    log.type === 'EXPENSE' &&
    Number(log.billableAmount || 0) === 0 &&
    Number(log.cost || 0) === 0;

const isPaymentOrBookingTerm = (log: LogItem) => {
    if (!isInvoiceNote(log)) return false;
    const description = log.description.toLowerCase();
    return description.startsWith('send payment') ||
        description.includes('down payment') ||
        description.includes('remaining balance') ||
        description.startsWith('cancellation policy') ||
        description.startsWith('lily must send') ||
        description.startsWith('space remains');
};

const getPaymentTermRank = (log: LogItem) => {
    const description = log.description.toLowerCase();
    if (description.includes('down payment')) return 0;
    if (description.includes('remaining balance') || description.startsWith('remaining $')) return 1;
    if (description.startsWith('send payment')) return 2;
    if (description.startsWith('cancellation policy')) return 3;
    if (description.startsWith('lily must send')) return 4;
    if (description.startsWith('space remains')) return 5;
    return 6;
};

const getInvoiceNoteRank = (log: LogItem) => {
    const description = log.description.toLowerCase();
    if (description.startsWith('original booking quote')) return 0;
    if (description.startsWith('original estimated taxes')) return 1;
    if (description.startsWith('airbnb')) return 2;
    return 3;
};

const Invoices: React.FC = () => {
    const { logs, projects, addInvoice, invoices, updateInvoice, deleteInvoice } = useApp();
    const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');

    // Generator State
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('ALL');
    const [dateFilterType, setDateFilterType] = useState<DateFilterType>('ALL');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // Invoice Terms State
    const [paymentTerms, setPaymentTerms] = useState('DUE_ON_RECEIPT');
    const [customDueDate, setCustomDueDate] = useState('');
    const [discountPercent, setDiscountPercent] = useState('');

    // Payment Structure State
    const [paymentStructure, setPaymentStructure] = useState<PaymentStructure>('FULL');
    const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
    const [secondPaymentDate, setSecondPaymentDate] = useState('');
    const [balanceDate, setBalanceDate] = useState('');
    const [paymentsReceived, setPaymentsReceived] = useState('');
    const [paymentsReceivedNote, setPaymentsReceivedNote] = useState('');

    const [showPreview, setShowPreview] = useState(false);
    const [bankConfig, setBankConfig] = useState<CompanyBankConfig | null>(null);
    const [bankConfigStatus, setBankConfigStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

    React.useEffect(() => {
        if (!showPreview || bankConfig) return;
        let active = true;
        setBankConfigStatus('loading');
        fetchCompanyBankConfig()
            .then((config) => {
                if (!active) return;
                setBankConfig(config);
                setBankConfigStatus('ready');
            })
            .catch((error) => {
                console.error('Invoice banking information did not load.', error);
                if (active) setBankConfigStatus('error');
            });
        return () => { active = false; };
    }, [bankConfig, showPreview]);
    const [showAgreementPreview, setShowAgreementPreview] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailDraft, setEmailDraft] = useState<string | null>(null);

    // Payment Recording State
    const [paymentModalOpen, setPaymentModalOpen] = useState<string | null>(null); // Invoice ID
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [paymentMethod, setPaymentMethod] = useState('Credit Card');
    const [paymentNote, setPaymentNote] = useState('');

    const clients = useMemo(() => {
        const projectClients = projects.map(p => p.name).filter(Boolean);
        const logClients = logs.map(l => l.client).filter(Boolean) as string[];
        const uniqueClients = Array.from(new Set([...projectClients, ...logClients]));
        return uniqueClients.sort();
    }, [projects, logs]);

    const clientProjects = useMemo(() => {
        if (!selectedClientId) return [];
        return projects.filter(p => p.name === selectedClientId);
    }, [projects, selectedClientId]);

    const filteredLogs = useMemo(() => {
        if (!selectedClientId) return [];

        // 1. Filter by Client
        let filtered = logs.filter(l => {
            const project = projects.find(p => p.id === l.projectId);
            const logClient = l.client || project?.name;
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

    const sortedLogs = useMemo(() => [...filteredLogs].sort((a, b) => {
        const dateA = (a.type === 'STAY' && a.checkIn) ? a.checkIn : a.date;
        const dateB = (b.type === 'STAY' && b.checkIn) ? b.checkIn : b.date;
        const dateComparison = dateA.localeCompare(dateB);
        if (dateComparison !== 0) return dateComparison;
        return getInvoiceLineRank(a) - getInvoiceLineRank(b);
    }), [filteredLogs]);

    const invoiceLineLogs = useMemo(
        () => sortedLogs.filter(log => !isInvoiceNote(log)),
        [sortedLogs]
    );

    const preDiscountSubtotal = useMemo(() => invoiceLineLogs.reduce((sum, log) => {
        const project = projects.find(p => p.id === log.projectId);
        const amount = log.type === 'TIME'
            ? (log.hours || 0) * (project?.hourlyRate || 0)
            : Number(log.billableAmount || 0);
        return amount > 0 ? sum + amount : sum;
    }, 0), [invoiceLineLogs, projects]);

    const hasExplicitAdjustments = useMemo(
        () => invoiceLineLogs.some(log => Number(log.billableAmount || 0) < 0),
        [invoiceLineLogs]
    );

    const invoiceNoteLogs = useMemo(
        () => sortedLogs
            .filter(log => isInvoiceNote(log) && !isPaymentOrBookingTerm(log))
            .sort((a, b) => getInvoiceNoteRank(a) - getInvoiceNoteRank(b)),
        [sortedLogs]
    );

    const paymentTermLogs = useMemo(
        () => sortedLogs.filter(isPaymentOrBookingTerm).sort((a, b) => getPaymentTermRank(a) - getPaymentTermRank(b)),
        [sortedLogs]
    );

    const primaryStay = useMemo(
        () => sortedLogs.find(isStayWithDates) || null,
        [sortedLogs]
    );

    const formatCurrency = (amount: number) => amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const earliestCheckIn = useMemo(() => {
        const stayLogs = filteredLogs.filter(l => l.type === 'STAY' && l.checkIn);
        if (stayLogs.length === 0) return '';
        const dates = stayLogs.map(l => l.checkIn!).sort();
        return dates[0];
    }, [filteredLogs]);

    const longStayAgreement = useMemo(() => {
        const stay = sortedLogs.find(log => isStayWithDates(log) && getStayNights(log.checkIn, log.checkOut) > LONG_STAY_AGREEMENT_NIGHTS);
        if (!stay || !isStayWithDates(stay)) return null;
        const project = projects.find(p => p.id === stay.projectId);
        return {
            stay,
            project,
            nights: getStayNights(stay.checkIn, stay.checkOut),
            accommodationTotal: getStayAccommodationTotal(stay),
            propertyName: getPropertyDisplayName(project?.client),
        };
    }, [projects, sortedLogs]);

    // Auto-set balance date when check-in is found
    React.useEffect(() => {
        if (earliestCheckIn && !balanceDate) {
            setBalanceDate(earliestCheckIn);
        }
    }, [balanceDate, earliestCheckIn]);

    React.useEffect(() => {
        if (longStayAgreement && paymentStructure === 'FULL') {
            setPaymentStructure('THIRDS_LONG_STAY');
        }
    }, [longStayAgreement, paymentStructure]);

    React.useEffect(() => {
        if (longStayAgreement?.stay.checkIn && !secondPaymentDate) {
            setSecondPaymentDate(getDefaultSecondPaymentDate(longStayAgreement.stay.checkIn));
        }
    }, [longStayAgreement, secondPaymentDate]);

    const totals = useMemo(() => {
        let subtotal = 0;
        let tax = 0;
        let discountEligibleAccommodation = 0;
        filteredLogs.forEach(l => {
            const project = projects.find(p => p.id === l.projectId);
            if (l.type === 'TIME' && l.hours && project) {
                subtotal += l.hours * project.hourlyRate;
            } else if ((l.type === 'EXPENSE' || l.type === 'STAY') && l.billableAmount) {
                const logTax = Number(l.tax) || 0;
                const preTaxAmount = l.billableAmount - logTax;
                subtotal += preTaxAmount;
                tax += logTax;
                if (l.type === 'STAY') {
                    const cleaningTotal = (Number(l.cleaningCount) || 0) * (Number(l.cleaningFee) || 0);
                    const poolHeatTotal = Number(l.poolHeat) || 0;
                    discountEligibleAccommodation += Math.max(0, preTaxAmount - cleaningTotal - poolHeatTotal);
                }
            }
        });

        const discountRate = Number(discountPercent) / 100 || 0;
        const discountAmount = discountEligibleAccommodation * discountRate;
        const total = (subtotal - discountAmount) + tax;

        return { subtotal, discount: discountAmount, tax, total };
    }, [filteredLogs, projects, discountPercent]);

    const remainingInvoiceTotal = useMemo(() =>
        Math.max(0, totals.total - (Number(paymentsReceived) || 0)),
        [paymentsReceived, totals.total]
    );

    const longStayInstallments = useMemo(() => splitIntoThirds(remainingInvoiceTotal), [remainingInvoiceTotal]);
    const agreementInstallments = useMemo(() =>
        splitIntoThirds(longStayAgreement?.accommodationTotal || totals.total),
        [longStayAgreement, totals.total]
    );

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

    const generateInvoiceNumber = useCallback((clientName: string) => {
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
    }, [invoices]);

    const draftInvoiceNumber = useMemo(() => generateInvoiceNumber(selectedClientId), [generateInvoiceNumber, selectedClientId]);

    const handleSaveInvoice = async () => {
        if (!selectedClientId) return;

        const invoiceItems: InvoiceItem[] = invoiceLineLogs.flatMap(log => {
            const project = projects.find(p => p.id === log.projectId);

            if (log.type === 'STAY') {
                const items: InvoiceItem[] = [];
                const checkIn = new Date(log.checkIn!);
                const checkOut = new Date(log.checkOut!);
                const nights = Math.ceil(Math.abs(checkOut.getTime() - checkIn.getTime()) / (86400000)) || 1;

                const cleaningFee = log.cleaningFee || 0;
                const cleaningCount = log.cleaningCount || 0;
                const poolHeat = log.poolHeat || 0;
                const tax = Number(log.tax) || 0;
                const totalCleaning = cleaningFee * cleaningCount;
                const totalPoolHeat = poolHeat;

                const accommodationTotal = (log.billableAmount || 0) - totalCleaning - totalPoolHeat - tax;

                // Detect Pricing Mode (Flat vs Nightly)
                // If log.cost (Rate input) * nights ~= Total, it's Nightly.
                // Otherwise (e.g. Rate == Total), it's Flat.
                const isNightly = Math.abs((log.cost || 0) * nights - accommodationTotal) < 1;

                const displayQuantity = isNightly ? nights : 1;
                const displayRate = isNightly ? (log.cost || accommodationTotal / nights) : accommodationTotal;

                // Accommodation
                items.push({
                    description: isNightly ? 'Accommodations' : `Accommodations (${nights} nights)`,
                    quantity: displayQuantity,
                    rate: displayRate,
                    amount: accommodationTotal,
                    type: 'STAY',
                    originalLogId: log.id,
                    dates: `${formatDate(log.checkIn!)} after ${COMPANY_CONFIG.stay.checkInTime} to ${formatDate(log.checkOut!)} before ${COMPANY_CONFIG.stay.checkOutTime}`
                });

                // Cleaning
                if (totalCleaning > 0) {
                    items.push({
                        description: 'Cleaning Fee',
                        quantity: cleaningCount,
                        rate: cleaningFee,
                        amount: totalCleaning,
                        type: 'FEE',
                        originalLogId: log.id,
                        dates: ''
                    });
                }

                // Pool Heat
                if (totalPoolHeat > 0) {
                    items.push({
                        description: 'Pool Heat',
                        quantity: 1,
                        rate: totalPoolHeat,
                        amount: totalPoolHeat,
                        type: 'FEE',
                        originalLogId: log.id,
                        dates: ''
                    });
                }


                return items;
            }

            // Standard Items (TIME, EXPENSE)
            let rate = log.cost || 0;
            let quantity = 1;
            let amount = log.billableAmount || 0;

            if (log.type === 'TIME') {
                rate = project?.hourlyRate || 0;
                quantity = log.hours || 0;
                amount = quantity * rate;
            }

            return {
                description: log.description,
                quantity,
                rate,
                amount,
                type: log.type,
                originalLogId: log.id,
                dates: log.type === 'TIME' && log.hours ? `${formatDate(log.date)} (${log.hours}h)` : formatDate(log.date)
            };
        });

        // Generate Schedule
        let paymentSchedule: InvoiceSchedule[] = [];
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
        } else if (paymentStructure === 'THIRDS_LONG_STAY') {
            const [firstPayment, secondPayment, finalPayment] = splitIntoThirds(remainingTotal);
            paymentSchedule = [
                {
                    id: crypto.randomUUID(),
                    label: 'Payment 1 (1/3 due at booking)',
                    date: depositDate || new Date().toISOString().slice(0, 10),
                    amount: firstPayment
                },
                {
                    id: crypto.randomUUID(),
                    label: 'Payment 2 (1/3)',
                    date: secondPaymentDate || getDefaultSecondPaymentDate(earliestCheckIn) || calculateDueDate(),
                    amount: secondPayment
                },
                {
                    id: crypto.randomUUID(),
                    label: 'Payment 3 (1/3 due on or before check-in)',
                    date: balanceDate || earliestCheckIn || calculateDueDate(),
                    amount: finalPayment
                }
            ];
        }

        // Create Initial Payment Record if applicable
        const initialPaymentsList: InvoicePayment[] = [];
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
            notes: invoiceNoteLogs.map(log => log.description),
            paymentTerms: paymentTermLogs.map(log => log.description),
            paymentSchedule: paymentSchedule.length > 0 ? paymentSchedule : [],
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            total: totals.total,
            payments: initialPaymentsList.length > 0 ? initialPaymentsList : [],
            status
        };

        await addInvoice(newInvoice);
        setShowPreview(false);
        setActiveTab('history');
        // Reset specific fields
        setPaymentsReceived('');
        setPaymentsReceivedNote('');
        setSecondPaymentDate('');
    };

    const handleDraftEmail = async (clientId: string, total: string, projectNames: string[]) => {
        setEmailLoading(true);
        try {
            const draft = await draftInvoiceEmail(clientId, total, projectNames);
            setEmailDraft(draft);
        } catch (error: unknown) {
            console.error(error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            alert(`Failed to draft email with AI: ${message}. using standard template instead.`);
            // Fallback to standard email
            handleSendEmail({
                clientId: clientId,
                invoiceNumber: 'DRAFT',
                total: Number(total)
            });
        } finally {
            setEmailLoading(false);
        }
    };

    const handleSendEmail = (invoice: EmailInvoice) => {
        // Find Email - Search for ANY project associated with this client that has an email
        const project = projects.find(p => (p.name === invoice.clientId || p.client === invoice.clientId) && p.email);
        const email = project?.email || '';

        if (!email) {
            if (!confirm(`No email found for guest "${invoice.clientId}". Open email client anyway?`)) {
                return;
            }
        }

        // Determine Context
        let nights = 0;
        let arrival = '';
        let departure = '';
        let propertyName = 'BESVECA House'; // Default

        // Try from Saved Items
        if (invoice.items) {
            const stayItem = invoice.items.find((i: InvoiceItem) => i.type === 'STAY' || i.description === 'Guest Stay');
            if (stayItem) {
                nights = stayItem.quantity;
                const parts = (stayItem.dates || '').split(' to ');
                if (parts.length === 2) {
                    arrival = parts[0];
                    departure = parts[1];
                }
            }
        }
        // Try from Filtered Logs (Draft)
        else {
            const stayLog = filteredLogs.find(l => l.type === 'STAY');
            if (stayLog && stayLog.checkIn && stayLog.checkOut) {
                const start = new Date(stayLog.checkIn);
                const end = new Date(stayLog.checkOut);
                nights = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                arrival = formatDate(stayLog.checkIn);
                departure = formatDate(stayLog.checkOut);
            }
        }

        // Determine Property Name
        const proj = projects.find(p => p.name === invoice.clientId || p.client === invoice.clientId);
        const prop = proj?.client;
        if (prop === 'BESVECA') propertyName = 'BESVECA House';
        if (prop === 'Skyhouse') propertyName = 'Sky House';

        const firstName = invoice.clientId.split(' ')[0];
        const invoiceNumber = invoice.invoiceNumber;
        const total = typeof invoice.total === 'number' ? invoice.total.toFixed(2) : invoice.total;

        const subject = `Invoice | Your upcoming stay at the ${propertyName}`;
        const body = `Hi ${firstName},

Please find the attached invoice ${invoiceNumber} for your upcoming stay.
We have you booked for ${nights} night${nights !== 1 ? 's' : ''} starting on ${arrival} checking out on ${departure}

The grand total for your stay is $${total}. See attached invoice for details.

Feel free to check-in anytime after 3PM. For security purposes check-in information will be provided to you on the morning of your stay.

Should you have any other questions please don't hesitate to reach out.

Cheers,
Jessica`;

        alert("Please attach the PDF invoice manually in the Gmail window.");

        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&cc=jessica@tribute.studio&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(gmailUrl, '_blank');
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

    const getPaidAmount = (invoice: Invoice) => {
        return (invoice.payments || []).reduce((sum: number, p: InvoicePayment) => sum + p.amount, 0);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                <h1 className="text-4xl font-bold text-slate-900 mb-2">Billing Center</h1>
                <p className="text-slate-500">Generate guest invoices and track payments.</p>
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
                    <div className="flex flex-wrap justify-end gap-3 mb-4">
                        {longStayAgreement && (
                            <button
                                disabled={!selectedClientId}
                                onClick={() => setShowAgreementPreview(true)}
                                className="bg-white text-slate-800 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors disabled:opacity-50 border border-slate-200"
                            >
                                <FileText size={18} weight="duotone" /> Preview Agreement
                            </button>
                        )}
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
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guest</label>
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
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guest Record</label>
                            <select
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                disabled={!selectedClientId}
                            >
                                <option value="ALL">All Stays & Expenses</option>
                                {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Time Period</label>
                            <select
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
                                value={dateFilterType}
                                onChange={(e) => setDateFilterType(e.target.value as DateFilterType)}
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

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Discount (%)</label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
                                value={discountPercent}
                                onChange={(e) => setDiscountPercent(e.target.value)}
                                disabled={!selectedClientId}
                                placeholder="0"
                            />
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
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                        <label className={`flex-1 cursor-pointer p-4 rounded-xl border-2 transition-all
                                            ${paymentStructure === 'THIRDS_LONG_STAY' ? 'bg-white border-slate-900 shadow-sm' : 'bg-transparent border-slate-100 hover:border-slate-300'}`}>
                                            <input
                                                type="radio"
                                                name="paymentStructure"
                                                className="hidden"
                                                checked={paymentStructure === 'THIRDS_LONG_STAY'}
                                                onChange={() => setPaymentStructure('THIRDS_LONG_STAY')}
                                            />
                                            <div className="font-bold text-slate-900 mb-1">Long Stay Thirds</div>
                                            <div className="text-xs text-slate-500">Required agreement, three scheduled payments.</div>
                                        </label>
                                    </div>
                                </div>

                                {paymentStructure !== 'FULL' && (
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                {paymentStructure === 'THIRDS_LONG_STAY' ? 'Payment 1 Due' : 'Deposit Due Date'}
                                            </label>
                                            <input
                                                type="date"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                                value={depositDate}
                                                onChange={(e) => setDepositDate(e.target.value)}
                                            />
                                            <p className="text-[10px] text-slate-500">Usually today (Booking)</p>
                                        </div>
                                        {paymentStructure === 'THIRDS_LONG_STAY' && (
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment 2 Due</label>
                                                <input
                                                    type="date"
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-900"
                                                    value={secondPaymentDate}
                                                    onChange={(e) => setSecondPaymentDate(e.target.value)}
                                                />
                                                <p className="text-[10px] text-slate-500">Use the agreement date for installment two</p>
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                {paymentStructure === 'THIRDS_LONG_STAY' ? 'Payment 3 Due' : 'Balance Due Date'}
                                            </label>
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

                            {longStayAgreement && (
                                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                                    <div className="font-bold">Rental agreement required</div>
                                    <div className="text-xs mt-1">
                                        {longStayAgreement.nights} nights at {longStayAgreement.propertyName}. Preview the agreement before sending the invoice.
                                    </div>
                                </div>
                            )}


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
                                            placeholder="e.g. Deposit received"
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
                                                    onClick={() => handleSendEmail(invoice)}
                                                    className="text-slate-400 hover:text-slate-900 p-1.5"
                                                    title="Email Invoice"
                                                >
                                                    <Envelope size={18} weight="duotone" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const projectNames = Array.from(new Set(invoice.items.map((i: InvoiceItem) => i.description.split(' - ')[0])));
                                                        handleDraftEmail(invoice.clientId, invoice.total.toFixed(2), projectNames);
                                                    }}
                                                    className="text-slate-400 hover:text-slate-900 p-1.5"
                                                    title="Draft Email with AI"
                                                >
                                                    <Sparkle size={18} weight="duotone" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
                                                            deleteInvoice(invoice.id);
                                                        }
                                                    }}
                                                    className="text-red-300 hover:text-red-500 p-1.5"
                                                    title="Delete Invoice"
                                                >
                                                    <Trash size={18} weight="duotone" />
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
                    <div className="print-modal-shell fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm">
                        <div className="print-modal-card bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
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
                                        onClick={() => handleSendEmail({
                                            clientId: selectedClientId,
                                            invoiceNumber: draftInvoiceNumber,
                                            total: totals.total
                                        })}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        <Envelope size={16} weight="duotone" />
                                        Send Email
                                    </button>
                                    <button
                                        onClick={() => handleDraftEmail(selectedClientId, totals.total.toFixed(2), clientProjects.map(p => p.name))}
                                        className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-lg text-sm font-bold hover:bg-sky-100 transition-colors"
                                    >
                                        {emailLoading ? <CircleNotch size={16} className="animate-spin" /> : <Envelope size={16} weight="duotone" />}
                                        Draft with AI
                                    </button>
                                    <button
                                        onClick={() => {
                                            const originalTitle = document.title;
                                            document.title = `BESVECA, LLC Invoice ${selectedClientId || ''}`;
                                            window.print();
                                            setTimeout(() => document.title = originalTitle, 100);
                                        }}
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
                                            <style>{`
                                                @media print {
                                                    @page { margin: 0; size: auto; }
                                                    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                                    #invoice-bill {
                                                        width: 100%;
                                                        max-width: none;
                                                        margin: 0;
                                                        padding: 2cm; /* uniform margin */
                                                        box-sizing: border-box;
                                                    }
                                                    .print-hidden { display: none !important; }
                                                }
                                            `}</style>
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-16 h-16 flex items-center justify-center overflow-hidden">
                                                    <img src="/besveca-logo.svg" alt="BESVECA" className="invoice-logo w-full h-full object-contain" />
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
                                    <div className="grid grid-cols-2 gap-8 mb-8 mt-2">
                                        <div>
                                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bill To</h3>
                                            {(() => {
                                                const targetProject = selectedProjectId !== 'ALL'
                                                    ? projects.find(p => p.id === selectedProjectId)
                                                    : (filteredLogs.length > 0 ? projects.find(p => p.id === filteredLogs[0].projectId) : null);

                                                if (targetProject) {
                                                    return (
                                                        <div className="text-sm font-medium text-slate-600 space-y-0.5">
                                                            <p className="font-bold text-slate-900 text-base mb-1">{targetProject.name}</p>
                                                            {targetProject.email && <p>{targetProject.email}</p>}
                                                            {targetProject.phone && <p>{targetProject.phone}</p>}
                                                            {targetProject.address && <p className="whitespace-pre-line leading-snug">{targetProject.address}</p>}
                                                        </div>
                                                    );
                                                }
                                                return <p className="text-sm font-bold text-slate-900">{selectedClientId}</p>;
                                            })()}
                                        </div>
                                        <div className="text-right">
                                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Terms</h3>
                                            <p className="text-sm font-bold text-slate-900">{getDueDateLabel()}</p>
                                            {primaryStay && (
                                                <div className="mt-3 text-[11px] leading-relaxed text-slate-500">
                                                    <p><span className="font-bold text-slate-900">Check-in:</span> {formatDate(primaryStay.checkIn)} after {COMPANY_CONFIG.stay.checkInTime}</p>
                                                    <p><span className="font-bold text-slate-900">Check-out:</span> {formatDate(primaryStay.checkOut)} before {COMPANY_CONFIG.stay.checkOutTime}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Line Items Table - Compact Apple Style */}
                                    <table className="w-full mb-8 border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-900">
                                                <th className="py-2 text-left">Description</th>
                                                <th className="py-2 text-center w-40">Dates / Duration</th>
                                                <th className="py-2 text-right w-24">Rate</th>
                                                <th className="py-2 text-right w-24">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-[11px]">
                                            {invoiceLineLogs.map((log) => {
                                                const project = projects.find(p => p.id === log.projectId);

                                                if (log.type === 'STAY') {
                                                    const checkIn = new Date(log.checkIn!);
                                                    const checkOut = new Date(log.checkOut!);
                                                    const nights = Math.ceil(Math.abs(checkOut.getTime() - checkIn.getTime()) / (86400000)) || 1;
                                                    const datesStr = `${formatDate(log.checkIn!)} after ${COMPANY_CONFIG.stay.checkInTime} to ${formatDate(log.checkOut!)} before ${COMPANY_CONFIG.stay.checkOutTime}`;

                                                    const cleaningFee = log.cleaningFee || 0;
                                                    const cleaningCount = log.cleaningCount || 0;
                                                    const poolHeat = log.poolHeat || 0;
                                                    const tax = Number(log.tax) || 0;
                                                    const totalCleaning = cleaningFee * cleaningCount;
                                                    const totalPoolHeat = poolHeat;

                                                    const accommodationTotal = (log.billableAmount || 0) - totalCleaning - totalPoolHeat - tax;

                                                    const isNightly = Math.abs((log.cost || 0) * nights - accommodationTotal) < 1;
                                                    const displayQuantity = isNightly ? nights : 1;
                                                    const displayRate = isNightly ? (log.cost || accommodationTotal / nights) : accommodationTotal;
                                                    const displayDesc = isNightly ? 'Accommodations' : `Accommodations (${nights} nights)`;

                                                    const rows = [
                                                        <tr key={log.id}>
                                                            <td className="py-2 pr-4 align-top">
                                                                <span className="font-bold block text-slate-900">{displayDesc}</span>
                                                                <span className="block text-[10px] text-slate-500 mt-0.5">{displayQuantity} {isNightly ? (displayQuantity !== 1 ? 'Nights' : 'Night') : 'Flat Rate'}</span>
                                                            </td>
                                                            <td className="py-2 text-center align-top text-slate-500">{datesStr}</td>
                                                            <td className="py-2 text-right align-top text-slate-500">${formatCurrency(displayRate)}</td>
                                                            <td className="py-2 text-right align-top font-bold text-slate-900">${formatCurrency(accommodationTotal)}</td>
                                                        </tr>
                                                    ];

                                                    if (totalCleaning > 0) {
                                                        rows.push(
                                                            <tr key={`${log.id}-clean`}>
                                                                <td className="py-2 pr-4 align-top"><span className="font-bold block text-slate-900">Cleaning Fee</span></td>
                                                                <td className="py-2 text-center align-top text-slate-500"></td>
                                                                <td className="py-2 text-right align-top text-slate-500">${formatCurrency(cleaningFee)}</td>
                                                                <td className="py-2 text-right align-top font-bold text-slate-900">${formatCurrency(totalCleaning)}</td>
                                                            </tr>
                                                        );
                                                    }

                                                    if (totalPoolHeat > 0) {
                                                        rows.push(
                                                            <tr key={`${log.id}-pool`}>
                                                                <td className="py-2 pr-4 align-top"><span className="font-bold block text-slate-900">Pool Heat</span></td>
                                                                <td className="py-2 text-center align-top text-slate-500"></td>
                                                                <td className="py-2 text-right align-top text-slate-500">${formatCurrency(totalPoolHeat)}</td>
                                                                <td className="py-2 text-right align-top font-bold text-slate-900">${formatCurrency(totalPoolHeat)}</td>
                                                            </tr>
                                                        );
                                                    }


                                                    return rows;
                                                }

                                                // Regular Items
                                                const amount = log.type === 'TIME' ? (log.hours! * project!.hourlyRate) : log.billableAmount!;
                                                const description = log.description;
                                                const dates = log.type === 'TIME' && log.hours ? `${formatDate(log.date)} (${log.hours}h)` : formatDate(log.date);
                                                const fee = log.type === 'TIME' ? project?.hourlyRate : log.cost;

                                                const itemRow = (
                                                    <tr>
                                                        <td className="py-2 pr-4 align-top">
                                                            <span className="font-bold block text-slate-900">{description}</span>
                                                        </td>
                                                        <td className="py-2 text-center align-top text-slate-500">
                                                            {dates}
                                                        </td>
                                                        <td className="py-2 text-right align-top text-slate-500">
                                                            ${fee ? formatCurrency(fee) : '0.00'}
                                                        </td>
                                                        <td className="py-2 text-right align-top font-bold text-slate-900">
                                                            ${formatCurrency(amount)}
                                                        </td>
                                                    </tr>
                                                );

                                                if (description.toLowerCase().includes('estimated taxes') && hasExplicitAdjustments) {
                                                    return (
                                                        <React.Fragment key={log.id}>
                                                            {itemRow}
                                                            <tr className="border-y border-slate-300 bg-slate-50 font-bold text-slate-900">
                                                                <td colSpan={3} className="py-2 text-right uppercase tracking-wide">Subtotal before discounts</td>
                                                                <td className="py-2 text-right">${formatCurrency(preDiscountSubtotal)}</td>
                                                            </tr>
                                                        </React.Fragment>
                                                    );
                                                }

                                                return <React.Fragment key={log.id}>{itemRow}</React.Fragment>;
                                            })}
                                        </tbody>
                                    </table>

                                    {/* Totals Section */}
                                    <div className="flex justify-end border-t border-slate-200 pt-4">
                                        <div className="w-48 text-[11px]">
                                            {!hasExplicitAdjustments && (
                                                <div className="flex justify-between mb-1 text-slate-500">
                                                    <span>Subtotal</span>
                                                    <span>${formatCurrency(totals.subtotal)}</span>
                                                </div>
                                            )}
                                            {!hasExplicitAdjustments && totals.discount > 0 && (
                                                <div className="flex justify-between mb-1 text-emerald-600 font-medium">
                                                    <span>Discount ({discountPercent}%)</span>
                                                    <span>-${formatCurrency(totals.discount)}</span>
                                                </div>
                                            )}
                                            {!hasExplicitAdjustments && (
                                                <div className="flex justify-between mb-2 text-slate-500">
                                                    <span>PS TOT TAX</span>
                                                    <span>${formatCurrency(totals.tax)}</span>
                                                </div>
                                            )}
                                            <div className={`flex justify-between font-bold text-sm text-slate-900 border-t border-slate-200 pt-2 ${Number(paymentsReceived) > 0 ? 'mb-2' : ''}`}>
                                                <span>{hasExplicitAdjustments ? 'Final Total' : 'Total'}</span>
                                                <span>${formatCurrency(totals.total)}</span>
                                            </div>
                                            {Number(paymentsReceived) > 0 && (
                                                <>
                                                    <div className="flex justify-between mb-2 text-emerald-600 font-medium">
                                                        <span>Payment Received</span>
                                                        <span>-${formatCurrency(Number(paymentsReceived))}</span>
                                                    </div>
                                                    <div className="flex justify-between font-bold text-base text-slate-900 border-t-2 border-slate-900 pt-2">
                                                        <span>Balance Due</span>
                                                        <span>${formatCurrency(totals.total - Number(paymentsReceived))}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {paymentTermLogs.length > 0 && (
                                        <section className="mt-8 rounded-xl border border-slate-300 px-5 py-4">
                                            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Payment &amp; Booking Terms</h3>
                                            <ul className="space-y-2 text-[11px] leading-relaxed text-slate-700">
                                                {paymentTermLogs.map(log => (
                                                    <li key={log.id}>{log.description}</li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

                                    <section className="mx-auto mt-5 max-w-lg rounded-xl border border-slate-300 px-6 py-5 text-[10px] font-medium leading-relaxed text-slate-600">
                                        <p className="mb-4 text-center font-bold uppercase tracking-widest text-slate-500">Payment Methods</p>
                                        {bankConfig ? (
                                            <div className="mx-auto max-w-sm">
                                                <div className="mb-3 flex items-baseline justify-between gap-4">
                                                    <p className="font-bold text-slate-900">Bank transfer</p>
                                                    <p className="text-[9px] uppercase tracking-wider text-slate-400">International, ACH or wire</p>
                                                </div>
                                                <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-left">
                                                    <dt className="text-slate-400">Bank</dt><dd className="font-bold text-slate-900">{bankConfig.name}</dd>
                                                    <dt className="text-slate-400">Routing</dt><dd className="font-bold text-slate-900">{bankConfig.routing}</dd>
                                                    <dt className="text-slate-400">Account</dt><dd className="font-bold text-slate-900">{bankConfig.account}</dd>
                                                    <dt className="text-slate-400">For</dt><dd className="font-bold text-slate-900">{bankConfig.beneficiary}</dd>
                                                </dl>
                                                <div className="mt-5 flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
                                                    <div>
                                                        <p className="font-bold text-slate-900">Zelle</p>
                                                        <p className="text-[9px] text-slate-400">U.S. payments</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-slate-900">BESVECA</p>
                                                        <p className="tabular-nums text-slate-600">310-717-9946</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="font-bold text-amber-700">
                                                {bankConfigStatus === 'error' ? 'Banking details did not load. Refresh before sending.' : 'Loading secure banking details…'}
                                            </p>
                                        )}
                                    </section>

                                    {invoiceNoteLogs.length > 0 && (
                                        <section className="mt-5 rounded-xl bg-slate-50/60 px-5 py-4">
                                            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Additional Notes</h3>
                                            <ul className="space-y-2 text-[11px] leading-relaxed text-slate-600">
                                                {invoiceNoteLogs.map(log => (
                                                    <li key={log.id}>{log.description}</li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

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
                                                                <td className="py-2 text-right font-bold text-slate-900">${(remainingInvoiceTotal * 0.5).toFixed(2)}</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 font-medium text-slate-900">Balance (50%)</td>
                                                                <td className="py-2 text-slate-500">{balanceDate ? formatDate(balanceDate) : 'Upon Arrival'}</td>
                                                                <td className="py-2 text-right font-bold text-slate-900">${(remainingInvoiceTotal - (remainingInvoiceTotal * 0.5)).toFixed(2)}</td>
                                                            </tr>
                                                        </>
                                                    ) : paymentStructure === 'THIRDS_LONG_STAY' ? (
                                                        <>
                                                            <tr>
                                                                <td className="py-2 font-medium text-slate-900">Payment 1 (1/3)</td>
                                                                <td className="py-2 text-slate-500">{depositDate ? formatDate(depositDate) : 'Upon Receipt'}</td>
                                                                <td className="py-2 text-right font-bold text-slate-900">${formatCurrency(longStayInstallments[0])}</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 font-medium text-slate-900">Payment 2 (1/3)</td>
                                                                <td className="py-2 text-slate-500">{secondPaymentDate ? formatDate(secondPaymentDate) : 'Custom Date'}</td>
                                                                <td className="py-2 text-right font-bold text-slate-900">${formatCurrency(longStayInstallments[1])}</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 font-medium text-slate-900">Payment 3 (1/3)</td>
                                                                <td className="py-2 text-slate-500">{balanceDate ? formatDate(balanceDate) : 'On or before check-in'}</td>
                                                                <td className="py-2 text-right font-bold text-slate-900">${formatCurrency(longStayInstallments[2])}</td>
                                                            </tr>
                                                        </>
                                                    ) : null}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div className="mt-12 pt-8 border-t border-slate-100 text-center">
                                        <div className="mx-auto mb-6 max-w-lg text-[10px] font-medium leading-relaxed text-slate-500">
                                            <p className="mb-2 font-bold uppercase tracking-widest text-slate-400">Hot Tub &amp; Pool Heat</p>
                                            <p className="mx-auto max-w-[60ch]">
                                                Hot tub heat is included with the stay. Pool heat is optional at ${COMPANY_CONFIG.stay.poolHeatDailyRate} per day and must be added for the full duration of the reservation.
                                            </p>
                                        </div>
                                        <p className="text-[10px] text-slate-300">
                                            {(() => {
                                                const proj = projects.find(p => p.name === selectedClientId || p.client === selectedClientId);
                                                const prop = proj?.client;
                                                if (prop === 'BESVECA') return 'Thank you for staying at the BESVECA House';
                                                if (prop === 'Skyhouse') return 'Thank you for staying at the Sky House';
                                                return 'Thank you for your business.';
                                            })()}
                                        </p>
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
                                    <div className="flex justify-center gap-3 mt-6">
                                        <button onClick={() => {
                                            navigator.clipboard.writeText(emailDraft);
                                            alert('Copied to clipboard!');
                                        }} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm">
                                            Copy Text
                                        </button>
                                        <button onClick={() => {
                                            const project = projects.find(p => (p.client === selectedClientId || p.name === selectedClientId) && p.email);
                                            const email = project?.email || '';

                                            if (!email) {
                                                if (!confirm(`No email found for guest "${selectedClientId}". Open email client anyway?`)) {
                                                    return;
                                                }
                                            }

                                            const subject = `Invoice Update - BESVECA, LLC`;
                                            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&cc=jessica@tribute.studio&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailDraft)}`;
                                            window.open(gmailUrl, '_blank');
                                        }} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">
                                            <Envelope size={18} weight="bold" />
                                            Send Email
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Rental Agreement Modal Preview */}
            {showAgreementPreview && longStayAgreement && (
                <div className="print-modal-shell fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm">
                    <div className="print-modal-card bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between print:hidden">
                            <h2 className="font-bold text-xl">Rental Agreement Preview</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const originalTitle = document.title;
                                        document.title = `BESVECA Rental Agreement ${selectedClientId || ''}`;
                                        window.print();
                                        setTimeout(() => document.title = originalTitle, 100);
                                    }}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors"
                                >
                                    Print PDF
                                </button>
                                <button onClick={() => setShowAgreementPreview(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                    <X size={20} weight="bold" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-12 bg-white printable-area font-sans text-slate-900 print:overflow-visible print:h-auto print:p-0">
                            <div id="rental-agreement" className="max-w-3xl mx-auto print:max-w-none">
                                <style>{`
                                    @media print {
                                        @page { margin: 0; size: auto; }
                                        body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                        #rental-agreement {
                                            width: 100%;
                                            max-width: none;
                                            margin: 0;
                                            padding: 2cm;
                                            box-sizing: border-box;
                                        }
                                        .print-hidden { display: none !important; }
                                    }
                                `}</style>

                                <div className="flex justify-between items-start mb-8 border-b border-slate-200 pb-8">
                                    <div>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-16 h-16 flex items-center justify-center overflow-hidden">
                                                <img src="/besveca-logo.svg" alt="BESVECA" className="invoice-logo w-full h-full object-contain" />
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
                                        <h2 className="text-xl font-bold text-slate-900 mb-1">RENTAL AGREEMENT</h2>
                                        <p className="text-[11px] text-slate-500 mt-2">{formatDate(new Date().toISOString().slice(0, 10))}</p>
                                    </div>
                                </div>

                                <div className="space-y-7 text-sm leading-6 text-slate-700">
                                    <section>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Parties</h3>
                                        <p>
                                            This rental agreement is between Jessica Luciano, owner representative for {COMPANY_CONFIG.name}, and {selectedClientId || 'Guest'} for the rental of {longStayAgreement.propertyName}.
                                        </p>
                                    </section>

                                    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Rental Property</h3>
                                            <p className="font-bold text-slate-900">{longStayAgreement.propertyName}</p>
                                            {COMPANY_CONFIG.address.map((line, i) => <p key={i}>{line}</p>)}
                                        </div>
                                        <div>
                                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Rental Period</h3>
                                            <p><span className="font-bold text-slate-900">Check-in:</span> {formatDate(longStayAgreement.stay.checkIn)} after {COMPANY_CONFIG.stay.checkInTime}</p>
                                            <p><span className="font-bold text-slate-900">Check-out:</span> {formatDate(longStayAgreement.stay.checkOut)} before {COMPANY_CONFIG.stay.checkOutTime}</p>
                                            <p className="text-slate-500">{longStayAgreement.nights} nights</p>
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Guests</h3>
                                        <p>{selectedClientId || longStayAgreement.project?.name}</p>
                                        <p className="text-slate-500">Adult guests: {selectedClientId.includes('&') || selectedClientId.toLowerCase().includes(' and ') ? '2' : '1'}</p>
                                    </section>

                                    <section>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Rental Payment</h3>
                                        <div className="flex justify-between border-y border-slate-200 py-3 mb-3">
                                            <span className="font-bold text-slate-900">Total Rental Amount</span>
                                            <span className="font-bold text-slate-900">${formatCurrency(longStayAgreement.accommodationTotal || totals.total)}</span>
                                        </div>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-[10px] font-bold text-slate-400 uppercase">
                                                    <th className="pb-2">Payment</th>
                                                    <th className="pb-2">Due Date</th>
                                                    <th className="pb-2 text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                <tr>
                                                    <td className="py-2 font-medium text-slate-900">Payment 1 (1/3)</td>
                                                    <td className="py-2 text-slate-500">{depositDate ? formatDate(depositDate) : 'Due at booking'}</td>
                                                    <td className="py-2 text-right font-bold text-slate-900">${formatCurrency(agreementInstallments[0])}</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2 font-medium text-slate-900">Payment 2 (1/3)</td>
                                                    <td className="py-2 text-slate-500">{secondPaymentDate ? formatDate(secondPaymentDate) : 'Custom Date'}</td>
                                                    <td className="py-2 text-right font-bold text-slate-900">${formatCurrency(agreementInstallments[1])}</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2 font-medium text-slate-900">Payment 3 (1/3)</td>
                                                    <td className="py-2 text-slate-500">{balanceDate ? formatDate(balanceDate) : 'On or before check-in'}</td>
                                                    <td className="py-2 text-right font-bold text-slate-900">${formatCurrency(agreementInstallments[2])}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </section>

                                    <section>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Payment Terms</h3>
                                        <p>Payments are non-refundable. If guest travel plans change, payments may be applied toward a future stay within 12 months of the original check-in date, subject to written approval and availability.</p>
                                    </section>

                                    <section>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">House Terms</h3>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>Utilities, internet, and standard property services are included unless otherwise agreed in writing.</li>
                                            <li>Guests are responsible for maintaining the property in good condition and are liable for damage beyond normal wear.</li>
                                            <li>No smoking is allowed inside the property.</li>
                                            <li>Check-in instructions are provided before arrival. Standard check-in is after 3:00 PM and check-out is before 11:00 AM.</li>
                                            <li>Hot tub heat is included. Optional pool heat is billed at ${COMPANY_CONFIG.stay.poolHeatDailyRate} per day for the full duration of the stay when requested.</li>
                                            <li>This agreement is governed by the laws of California.</li>
                                        </ul>
                                    </section>

                                    <section>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Entire Agreement</h3>
                                        <p>This agreement represents the understanding between the parties for this stay and supersedes prior oral or written discussions about the same rental period.</p>
                                    </section>

                                    <section className="pt-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                                            {(selectedClientId ? selectedClientId.split(/\s+(?:&|and)\s+/i) : ['Guest']).map((guest, index) => (
                                                <div key={`${guest}-${index}`}>
                                                    <div className="border-b border-slate-400 h-10 mb-2" />
                                                    <p className="text-xs font-bold text-slate-900">{guest.trim() || `Guest ${index + 1}`}</p>
                                                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">Guest Signature / Date</p>
                                                </div>
                                            ))}
                                            <div>
                                                <div className="border-b border-slate-400 h-10 mb-2" />
                                                <p className="text-xs font-bold text-slate-900">Jessica Luciano</p>
                                                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Owner Signature / Date</p>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

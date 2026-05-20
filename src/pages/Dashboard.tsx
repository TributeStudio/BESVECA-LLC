import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import {
    CurrencyDollar,
    ArrowUpRight,
    UserSquare,
    House,
    Tag,
    CalendarCheck,
    WarningCircle,
    FileText,
} from '@phosphor-icons/react';
import type { Invoice, InvoiceSchedule } from '../types';

type StatCardProps = {
    title: string;
    value: string;
    icon: React.ElementType;
    color: keyof typeof toneClasses;
    note: string;
};

const toneClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
};

const LONG_STAY_AGREEMENT_NIGHTS = 29;
const DAY_MS = 86400000;

type ScheduledPayment = {
    invoice: Invoice;
    schedule: InvoiceSchedule;
    paidThroughSchedule: boolean;
    dueInDays: number;
};

const formatCurrency = (amount: number) =>
    amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
    return dateStr;
};

const getNights = (checkIn?: string, checkOut?: string) => {
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, Math.ceil(Math.abs(new Date(checkOut).getTime() - new Date(checkIn).getTime()) / DAY_MS));
};

const getPaidAmount = (invoice: Invoice) =>
    (invoice.payments || []).reduce((sum, payment) => sum + payment.amount, 0);

const getPaymentDueInDays = (date: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${date}T12:00:00`);
    due.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - today.getTime()) / DAY_MS);
};

const StatCard = ({ title, value, icon: Icon, color, note }: StatCardProps) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-lg ${toneClasses[color] || toneClasses.slate}`}>
                <Icon size={24} weight="duotone" />
            </div>
            <span className="flex items-center text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded-full">
                <ArrowUpRight size={14} className="mr-1" /> {note}
            </span>
        </div>
        <h3 className="text-slate-500 text-sm font-medium mb-1 font-sans">{title}</h3>
        <p className="text-3xl font-bold text-slate-900">{value}</p>
    </div>
);

const Dashboard: React.FC = () => {
    const { logs, projects, invoices } = useApp();

    const stats = useMemo(() => {
        let totalRevenue = 0;
        const projectRevenueMap: Record<string, number> = {};
        let stayCount = 0;
        let expenseCount = 0;

        logs.forEach(log => {
            const project = projects.find(p => p.id === log.projectId);
            if (log.type === 'TIME' && log.hours) {
                if (project) {
                    const rev = log.hours * project.hourlyRate;
                    totalRevenue += rev;
                    projectRevenueMap[project.name] = (projectRevenueMap[project.name] || 0) + rev;
                }
            } else if (log.type === 'EXPENSE' && log.billableAmount) {
                expenseCount += 1;
                totalRevenue += log.billableAmount;
                if (project) {
                    projectRevenueMap[project.name] = (projectRevenueMap[project.name] || 0) + log.billableAmount;
                }
            } else if (log.type === 'STAY' && log.billableAmount) {
                stayCount += 1;
                totalRevenue += log.billableAmount;
                const label = project?.client || 'BESVECA';
                projectRevenueMap[label] = (projectRevenueMap[label] || 0) + log.billableAmount;
            }
        });

        const chartData = Object.entries(projectRevenueMap).map(([name, value]) => ({ name, value }));
        return { totalRevenue, activeGuests: projects.length, chartData, stayCount, expenseCount };
    }, [logs, projects]);

    const upcomingPayments = useMemo(() => {
        const payments: ScheduledPayment[] = [];

        invoices
            .filter(invoice => invoice.status !== 'PAID')
            .forEach(invoice => {
                const paidAmount = getPaidAmount(invoice);
                let scheduledTotal = 0;

                (invoice.paymentSchedule || []).forEach(schedule => {
                    scheduledTotal += schedule.amount;
                    const paidThroughSchedule = paidAmount >= scheduledTotal - 0.01;
                    if (!paidThroughSchedule) {
                        payments.push({
                            invoice,
                            schedule,
                            paidThroughSchedule,
                            dueInDays: getPaymentDueInDays(schedule.date),
                        });
                    }
                });

                if ((invoice.paymentSchedule || []).length === 0) {
                    const balance = invoice.total - paidAmount;
                    if (balance > 0.01) {
                        payments.push({
                            invoice,
                            schedule: {
                                id: `${invoice.id}-balance`,
                                label: 'Balance due',
                                date: invoice.dueDate,
                                amount: balance,
                            },
                            paidThroughSchedule: false,
                            dueInDays: getPaymentDueInDays(invoice.dueDate),
                        });
                    }
                }
            });

        return payments
            .sort((a, b) => a.schedule.date.localeCompare(b.schedule.date))
            .slice(0, 5);
    }, [invoices]);

    const longStayItems = useMemo(() => {
        return logs
            .filter(log => log.type === 'STAY' && getNights(log.checkIn, log.checkOut) > LONG_STAY_AGREEMENT_NIGHTS)
            .map(log => {
                const project = projects.find(item => item.id === log.projectId);
                const invoice = invoices.find(item =>
                    item.items.some(invoiceItem => invoiceItem.originalLogId === log.id)
                );

                return {
                    log,
                    guestName: log.client || project?.name || 'Guest',
                    propertyName: project?.client || 'BESVECA',
                    nights: getNights(log.checkIn, log.checkOut),
                    invoice,
                };
            })
            .sort((a, b) => (a.log.checkIn || '').localeCompare(b.log.checkIn || ''))
            .slice(0, 5);
    }, [invoices, logs, projects]);

    const outstandingBalance = useMemo(() =>
        invoices
            .filter(invoice => invoice.status !== 'PAID')
            .reduce((sum, invoice) => sum + Math.max(0, invoice.total - getPaidAmount(invoice)), 0),
        [invoices]
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col">
                <h1 className="text-4xl font-bold text-slate-900 mb-2">Property Dashboard</h1>
                <p className="text-slate-500">Revenue, stays, and expenses for the BESVECA rental books.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    title="Total Revenue"
                    value={`$${stats.totalRevenue.toLocaleString()}`}
                    icon={CurrencyDollar}
                    color="emerald"
                    note="cloud"
                />
                <StatCard
                    title="Active Guests"
                    value={stats.activeGuests.toLocaleString()}
                    icon={UserSquare}
                    color="amber"
                    note="records"
                />
                <StatCard
                    title="Stays"
                    value={stats.stayCount.toLocaleString()}
                    icon={House}
                    color="sky"
                    note="booked"
                />
                <StatCard
                    title="Expenses"
                    value={stats.expenseCount.toLocaleString()}
                    icon={Tag}
                    color="slate"
                    note="logged"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-start justify-between gap-4 mb-5">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Upcoming Payments</h2>
                            <p className="text-sm text-slate-500 mt-1">{formatCurrency(outstandingBalance)} still open across unpaid invoices.</p>
                        </div>
                        <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700">
                            <CalendarCheck size={22} weight="duotone" />
                        </div>
                    </div>

                    {upcomingPayments.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                            No scheduled payments are currently open.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {upcomingPayments.map(payment => {
                                const isOverdue = payment.dueInDays < 0;
                                const dueLabel = isOverdue
                                    ? `${Math.abs(payment.dueInDays)}d overdue`
                                    : payment.dueInDays === 0
                                        ? 'Due today'
                                        : `Due in ${payment.dueInDays}d`;

                                return (
                                    <div key={`${payment.invoice.id}-${payment.schedule.id}`} className="py-4 flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{payment.invoice.clientId}</p>
                                            <p className="text-xs text-slate-500">{payment.schedule.label} · {formatDate(payment.schedule.date)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-slate-900">{formatCurrency(payment.schedule.amount)}</p>
                                            <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isOverdue ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {dueLabel}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-start justify-between gap-4 mb-5">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Long-Stay Agreements</h2>
                            <p className="text-sm text-slate-500 mt-1">Stays over {LONG_STAY_AGREEMENT_NIGHTS} nights need an agreement before guest send-out.</p>
                        </div>
                        <div className="p-3 rounded-lg bg-amber-50 text-amber-700">
                            <FileText size={22} weight="duotone" />
                        </div>
                    </div>

                    {longStayItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                            No long-stay agreements are currently needed.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {longStayItems.map(item => {
                                const hasSchedule = Boolean(item.invoice?.paymentSchedule?.length);
                                return (
                                    <div key={item.log.id} className="py-4 flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{item.guestName}</p>
                                            <p className="text-xs text-slate-500">{item.propertyName} · {item.nights} nights · {formatDate(item.log.checkIn)} to {formatDate(item.log.checkOut)}</p>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${hasSchedule ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                            {!hasSchedule && <WarningCircle size={13} weight="bold" />}
                                            {hasSchedule ? 'Scheduled' : 'Needs invoice'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart */}
                <div className="lg:col-span-2 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-bold">Revenue Distribution</h2>
                        <select className="bg-slate-50 border-none rounded-lg text-sm font-medium px-4 py-2 focus:ring-1 focus:ring-slate-200">
                            <option>Month to Date</option>
                        </select>
                    </div>
                    <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    tickFormatter={(value) => `$${value}`}
                                />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                                    }}
                                />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                                    {stats.chartData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={['#0ea5e9', '#6366f1', '#f59e0b', '#ec4899'][index % 4]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-bold mb-6">Recent Activity</h2>
                    <div className="space-y-6">
                        {logs.slice(0, 5).map((log) => (
                            <div key={log.id} className="flex gap-4">
                                <div className={`w-2 mt-1.5 h-2 rounded-full flex-shrink-0 ${log.type === 'STAY' ? 'bg-emerald-500' : log.type === 'EXPENSE' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                                <div>
                                    <p className="text-sm font-medium text-slate-900">{log.description}</p>
                                    <p className="text-xs text-slate-500">
                                        {projects.find(p => p.id === log.projectId)?.name} • {log.type === 'TIME' ? `${log.hours}h` : `$${log.billableAmount?.toFixed(2) || log.cost}`}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-8 py-3 rounded-xl border border-slate-100 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors">
                        View All History
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

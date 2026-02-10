import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, Tag, Plus, Check, PencilSimple, Trash, X, FloppyDisk, House, CalendarCheck } from '@phosphor-icons/react';
import type { LogItem, LogType } from '../types';

const Tracker: React.FC = () => {
    const { projects, logs, addLog, updateLog, deleteLog } = useApp();
    const [activeTab, setActiveTab] = useState<LogType>('STAY');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        projectId: '',
        client: '', // Guest Name
        date: new Date().toISOString().split('T')[0],
        checkIn: '',
        checkOut: '',
        description: '',
        hours: '',
        cost: '',
        markupPercent: '20',
        rate: '', // Nightly Rate or Flat Fee
        pricingMode: 'NIGHTLY' as 'NIGHTLY' | 'FLAT',
    });

    // Helper: Calculate nights
    const nights = React.useMemo(() => {
        if (!formData.checkIn || !formData.checkOut) return 0;
        const start = new Date(formData.checkIn);
        const end = new Date(formData.checkOut);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    }, [formData.checkIn, formData.checkOut]);

    const billableAmount = React.useMemo(() => {
        if (activeTab === 'EXPENSE') {
            return (Number(formData.cost) * (1 + Number(formData.markupPercent) / 100));
        }
        if (activeTab === 'STAY') {
            if (formData.pricingMode === 'FLAT') return Number(formData.rate);
            return Number(formData.rate) * nights;
        }
        return 0;
    }, [activeTab, formData.cost, formData.markupPercent, formData.rate, formData.pricingMode, nights]);

    const profit = activeTab === 'EXPENSE'
        ? (billableAmount - Number(formData.cost))
        : 0; // Stays are all profit/revenue for now (unless we track property costs separately later)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.projectId) return;

        setIsLoading(true);
        try {
            const logData: any = {
                projectId: formData.projectId,
                date: formData.date,
                description: formData.description || (activeTab === 'STAY' ? `Stay: ${formData.client}` : ''),
                type: activeTab,
                client: formData.client,
            };

            if (activeTab === 'TIME') {
                logData.hours = Number(formData.hours);
            } else if (activeTab === 'EXPENSE') {
                logData.cost = Number(formData.cost);
                logData.markupPercent = Number(formData.markupPercent);
                logData.billableAmount = billableAmount;
                logData.profit = profit;
            } else if (activeTab === 'STAY') {
                logData.checkIn = formData.checkIn;
                logData.checkOut = formData.checkOut;
                logData.billableAmount = billableAmount;
                logData.cost = Number(formData.rate); // Store rate in cost for reference? Or better relies on billableAmount.
                // Actually let's store rate in 'cost' field purely for record keeping if needed, or just billableAmount.
                // Let's rely on billableAmount for invoice.
            }

            if (editingLogId) {
                await updateLog(editingLogId, logData);
                setEditingLogId(null);
            } else {
                await addLog(logData);
            }

            setIsLoading(false);
            setSuccess(true);
            resetForm();
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error(error);
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            projectId: '',
            client: '',
            date: new Date().toISOString().split('T')[0],
            checkIn: '',
            checkOut: '',
            description: '',
            hours: '',
            cost: '',
            markupPercent: '20',
            rate: '',
            pricingMode: 'NIGHTLY',
        });
    };

    const handleEdit = (log: LogItem) => {
        setEditingLogId(log.id);
        setActiveTab(log.type);
        setFormData({
            projectId: log.projectId,
            client: log.client || '',
            date: log.date,
            checkIn: log.checkIn || '',
            checkOut: log.checkOut || '',
            description: log.description,
            hours: log.hours?.toString() || '',
            cost: log.cost?.toString() || '',
            markupPercent: log.markupPercent?.toString() || '20',
            rate: log.type === 'STAY' && log.checkIn && log.checkOut
                ? (log.billableAmount! / Math.max(1, Math.ceil((new Date(log.checkOut).getTime() - new Date(log.checkIn).getTime()) / (86400000)))).toFixed(2) // Approximate rate if nightly
                : log.billableAmount?.toString() || '',
            pricingMode: 'FLAT', // Default to flat when editing legacy or simplified
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this entry?')) {
            await deleteLog(id);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-12">
            <div className="flex flex-col items-center">
                <h1 className="text-4xl font-bold text-slate-900 mb-2 text-center">Guest Tracker</h1>
                <p className="text-slate-500 text-center">Manage check-ins, stays, and pricing.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
                <div className="lg:col-span-3 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden sticky top-8">
                    {!editingLogId && (
                        <div className="flex border-b border-slate-100">
                            <button
                                onClick={() => setActiveTab('STAY')}
                                className={`flex-1 py-4 font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${activeTab === 'STAY' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <House size={16} weight="duotone" /> Guest Stay
                            </button>
                            <button
                                onClick={() => setActiveTab('TIME')}
                                className={`flex-1 py-4 font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${activeTab === 'TIME' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <Clock size={16} weight="duotone" /> Hourly
                            </button>
                            <button
                                onClick={() => setActiveTab('EXPENSE')}
                                className={`flex-1 py-4 font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${activeTab === 'EXPENSE' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <Tag size={16} weight="duotone" /> Expense
                            </button>
                        </div>
                    )}

                    {editingLogId && (
                        <div className="bg-amber-50 border-b border-amber-100 p-4 transition-all flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                                <PencilSimple size={18} weight="bold" />
                                Editing Entry
                            </div>
                            <button onClick={resetForm} className="text-amber-800 hover:bg-amber-100 p-1 rounded-full transition-colors">
                                <X size={20} weight="bold" />
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                        {/* Common Fields */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Property (Project)</label>
                            <select
                                required
                                value={formData.projectId}
                                onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                            >
                                <option value="">Select Property...</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        {activeTab === 'STAY' && (
                            <>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guest Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. John Doe & Family"
                                        required
                                        value={formData.client}
                                        onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Check-in</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.checkIn}
                                            onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
                                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Check-out</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.checkOut}
                                            onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })}
                                            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                        />
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl space-y-4">
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={formData.pricingMode === 'NIGHTLY'}
                                                onChange={() => setFormData({ ...formData, pricingMode: 'NIGHTLY' })}
                                                className="text-slate-900 focus:ring-slate-900"
                                            />
                                            <span className="text-sm font-medium">Nightly Rate</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={formData.pricingMode === 'FLAT'}
                                                onChange={() => setFormData({ ...formData, pricingMode: 'FLAT' })}
                                                className="text-slate-900 focus:ring-slate-900"
                                            />
                                            <span className="text-sm font-medium">Total Fee</span>
                                        </label>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                            {formData.pricingMode === 'NIGHTLY' ? 'Rate per Night' : 'Total Stay Fee'} ($)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={formData.rate}
                                            onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                        />
                                    </div>
                                    {formData.pricingMode === 'NIGHTLY' && nights > 0 && (
                                        <div className="text-right text-sm text-slate-500">
                                            {nights} nights x ${Number(formData.rate).toFixed(2)} = <span className="font-bold text-slate-900">${billableAmount.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}


                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notes / Description</label>
                            <input
                                type="text"
                                placeholder={activeTab === 'STAY' ? "Additional details..." : "Description..."}
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                            />
                        </div>

                        {activeTab === 'TIME' && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hours</label>
                                <input
                                    type="number"
                                    step="0.25"
                                    placeholder="0.00"
                                    required
                                    value={formData.hours}
                                    onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                />
                            </div>
                        )}

                        {activeTab === 'EXPENSE' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cost ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        required
                                        value={formData.cost}
                                        onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Markup (%)</label>
                                    <input
                                        type="number"
                                        placeholder="20"
                                        required
                                        value={formData.markupPercent}
                                        onChange={(e) => setFormData({ ...formData, markupPercent: e.target.value })}
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                    />
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all
                            ${success ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : success ? (
                                <><Check size={20} weight="bold" /> Saved</>
                            ) : (
                                <>{editingLogId ? <><FloppyDisk size={20} weight="bold" /> Update Entry</> : <><Plus size={20} weight="bold" /> Add Stay/Log</>}</>
                            )}
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest px-2">Recent Logs</h2>
                    <div className="space-y-4">
                        {logs.slice(0, 10).map((log) => {
                            const project = projects.find(p => p.id === log.projectId);
                            return (
                                <div key={log.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className={`p-2 rounded-lg 
                                            ${log.type === 'TIME' ? 'bg-sky-50 text-sky-600' :
                                                log.type === 'EXPENSE' ? 'bg-pink-50 text-pink-600' :
                                                    'bg-emerald-50 text-emerald-600'}`}>
                                            {log.type === 'TIME' && <Clock size={20} weight="duotone" />}
                                            {log.type === 'EXPENSE' && <Tag size={20} weight="duotone" />}
                                            {log.type === 'STAY' && <House size={20} weight="duotone" />}
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(log)}
                                                className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg transition-colors"
                                            >
                                                <PencilSimple size={16} weight="bold" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(log.id)}
                                                className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                                            >
                                                <Trash size={16} weight="bold" />
                                            </button>
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-900 mb-1 leading-tight">
                                        {log.type === 'STAY' && log.client ? log.client : log.description}
                                    </h3>
                                    {log.type === 'STAY' && (
                                        <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                                            <CalendarCheck size={12} />
                                            {log.checkIn} - {log.checkOut}
                                        </div>
                                    )}
                                    <p className="text-xs text-slate-500 mb-3">{project?.name || 'Unknown Property'}</p>
                                    <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                                        <span className="text-[10px] text-slate-400 font-medium">{log.date}</span>
                                        <span className="text-sm font-bold text-slate-900">
                                            {log.type === 'TIME' ? `${log.hours}h` : `$${log.billableAmount?.toFixed(2)}`}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        {logs.length === 0 && (
                            <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                                <p className="text-slate-400 text-sm font-medium">No recent logs</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Tracker;

import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, Tag, Plus, Check, PencilSimple, Trash, X, FloppyDisk } from '@phosphor-icons/react';
import type { LogItem } from '../types';

const Tracker: React.FC = () => {
    const { projects, logs, addLog, updateLog, deleteLog } = useApp();
    const [activeTab, setActiveTab] = useState<'TIME' | 'EXPENSE'>('TIME');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        projectId: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        hours: '',
        cost: '',
        markupPercent: '20',
    });

    const billableAmount = activeTab === 'EXPENSE'
        ? (Number(formData.cost) * (1 + Number(formData.markupPercent) / 100))
        : 0;

    const profit = activeTab === 'EXPENSE'
        ? (billableAmount - Number(formData.cost))
        : 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.projectId || !formData.description) return;

        setIsLoading(true);
        try {
            const logData: any = {
                projectId: formData.projectId,
                date: formData.date,
                description: formData.description,
                type: activeTab,
            };

            if (activeTab === 'TIME') {
                logData.hours = Number(formData.hours);
            } else {
                logData.cost = Number(formData.cost);
                logData.markupPercent = Number(formData.markupPercent);
                logData.billableAmount = billableAmount;
                logData.profit = profit;
            }

            if (editingLogId) {
                await updateLog(editingLogId, logData);
                setEditingLogId(null);
            } else {
                await addLog(logData);
            }

            // Important: Set loading to false BEFORE setting success
            // to avoid state flickering or overlap
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
            date: new Date().toISOString().split('T')[0],
            description: '',
            hours: '',
            cost: '',
            markupPercent: '20',
        });
        if (!editingLogId) {
            // only scroll if not editing
        }
    };

    const handleEdit = (log: LogItem) => {
        setEditingLogId(log.id);
        setActiveTab(log.type);
        setFormData({
            projectId: log.projectId,
            date: log.date,
            description: log.description,
            hours: log.hours?.toString() || '',
            cost: log.cost?.toString() || '',
            markupPercent: log.markupPercent?.toString() || '20',
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
                <h1 className="text-4xl font-bold text-slate-900 mb-2 text-center">Work Tracker</h1>
                <p className="text-slate-500 text-center">Capture every billable second and expense.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
                {/* Form Section */}
                <div className="lg:col-span-3 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden sticky top-8">
                    {/* Tabs */}
                    {!editingLogId && (
                        <div className="flex border-b border-slate-100">
                            <button
                                onClick={() => setActiveTab('TIME')}
                                className={`flex-1 py-4 font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${activeTab === 'TIME' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <Clock size={16} weight="duotone" /> Billable Hours
                            </button>
                            <button
                                onClick={() => setActiveTab('EXPENSE')}
                                className={`flex-1 py-4 font-medium text-sm flex items-center justify-center gap-2 transition-all
                                ${activeTab === 'EXPENSE' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <Tag size={16} weight="duotone" /> Project Expense
                            </button>
                        </div>
                    )}

                    {editingLogId && (
                        <div className="bg-amber-50 border-b border-amber-100 p-4 transition-all flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                                <PencilSimple size={18} weight="bold" />
                                Editing {activeTab === 'TIME' ? 'Billable Hours' : 'Expense'}
                            </div>
                            <button onClick={resetForm} className="text-amber-800 hover:bg-amber-100 p-1 rounded-full transition-colors">
                                <X size={20} weight="bold" />
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="p-8 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project</label>
                                <select
                                    required
                                    value={formData.projectId}
                                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                >
                                    <option value="">Select a project...</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</label>
                            <input
                                type="text"
                                placeholder={activeTab === 'TIME' ? "What did you work on?" : "What did you purchase?"}
                                required
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                            />
                        </div>

                        {activeTab === 'TIME' ? (
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
                        ) : (
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

                        {activeTab === 'EXPENSE' && Number(formData.cost) > 0 && (
                            <div className="bg-slate-900 p-6 rounded-2xl flex justify-between items-center text-white">
                                <div>
                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Client Billable</p>
                                    <p className="text-3xl font-bold">${billableAmount.toFixed(2)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Profit Margin</p>
                                    <p className="text-xl font-bold text-emerald-400">+ ${profit.toFixed(2)}</p>
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
                                <><Check size={20} weight="bold" /> {editingLogId ? 'Update Saved' : 'Entry Saved'}</>
                            ) : (
                                <>{editingLogId ? <><FloppyDisk size={20} weight="bold" /> Update Entry</> : <><Plus size={20} weight="bold" /> Log Activity</>}</>
                            )}
                        </button>
                    </form>
                </div>

                {/* History Section */}
                <div className="lg:col-span-2 space-y-6">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest px-2">Recent Logs</h2>
                    <div className="space-y-4">
                        {logs.slice(0, 10).map((log) => {
                            const project = projects.find(p => p.id === log.projectId);
                            return (
                                <div key={log.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className={`p-2 rounded-lg ${log.type === 'TIME' ? 'bg-sky-50 text-sky-600' : 'bg-pink-50 text-pink-600'}`}>
                                            {log.type === 'TIME' ? <Clock size={20} weight="duotone" /> : <Tag size={20} weight="duotone" />}
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
                                    <h3 className="text-sm font-bold text-slate-900 mb-1 leading-tight">{log.description}</h3>
                                    <p className="text-xs text-slate-500 mb-3">{project?.name || 'Unknown Project'}</p>
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

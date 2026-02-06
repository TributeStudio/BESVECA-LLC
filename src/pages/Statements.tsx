import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { processFile } from '../services/gemini';
import {
    Files,
    CircleNotch,
    FloppyDisk,
    UploadSimple,
    Check,
    Warning,
    Briefcase,
    CaretRight,
    SkipForward
} from '@phosphor-icons/react';

interface ExtractedItem {
    id: string;
    date: string;
    description: string;
    amount: number;
    projectId?: string;
    selected: boolean;
    status: 'pending' | 'saved' | 'skipped';
}

const Statements: React.FC = () => {
    const { projects, addLog } = useApp();
    const [isProcessing, setIsProcessing] = useState(false);
    const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
    const [status, setStatus] = useState<string | null>(null);
    const [markupPercent, setMarkupPercent] = useState('20');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setStatus('Reading document...');

        try {
            const base64 = await fileToBase64(file);
            setStatus('Extracting data with AI...');
            const results = await processFile(base64, file.type);

            const items = results.map((item: any) => ({
                ...item,
                id: Math.random().toString(36).substr(2, 9),
                selected: true,
                status: 'pending' as const,
                projectId: ''
            }));

            setExtractedItems(items);
            setStatus(null);
        } catch (error: any) {
            console.error(error);
            setStatus(`Error: ${error.message || 'Failed to process file'}`);
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    const handleAssignProject = (itemId: string, projectId: string) => {
        setExtractedItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, projectId } : item
        ));
    };

    const handleSaveItem = async (item: ExtractedItem) => {
        if (!item.projectId) return;

        try {
            const cost = Number(item.amount);
            const billable = cost * (1 + Number(markupPercent) / 100);

            await addLog({
                projectId: item.projectId,
                date: item.date,
                description: item.description,
                type: 'EXPENSE',
                cost,
                markupPercent: Number(markupPercent),
                billableAmount: billable,
                profit: billable - cost
            });

            setExtractedItems(prev => prev.map(i =>
                i.id === item.id ? { ...i, status: 'saved' as const, selected: false } : i
            ));
        } catch (error) {
            console.error(error);
            alert('Failed to save log');
        }
    };

    const handleSkipItem = (itemId: string) => {
        setExtractedItems(prev => prev.map(i =>
            i.id === itemId ? { ...i, status: 'skipped' as const, selected: false } : i
        ));
    };

    const pendingCount = extractedItems.filter(i => i.status === 'pending').length;
    const savedCount = extractedItems.filter(i => i.status === 'saved').length;

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">Statement Processing</h1>
                    <p className="text-slate-500 max-w-xl">Upload PDF statements (Amex, Chase, etc.) to automatically extract charges and assign them to project jobs.</p>
                </div>

                <div className="flex gap-4">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept=".pdf,image/*"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessing}
                        className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-95"
                    >
                        {isProcessing ? <CircleNotch size={24} className="animate-spin" /> : <UploadSimple size={24} weight="bold" />}
                        Upload Statement
                    </button>
                </div>
            </div>

            {status && !isProcessing && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-700 font-medium">
                    <Warning size={20} weight="fill" />
                    {status}
                </div>
            )}

            <div className="grid grid-cols-1 gap-8">
                {extractedItems.length > 0 ? (
                    <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-6">
                                <h2 className="font-bold text-xl">Extracted Transactions</h2>
                                <div className="flex gap-2">
                                    <span className="bg-white border border-slate-200 text-slate-600 px-4 py-1 rounded-full text-xs font-bold shadow-sm">
                                        {pendingCount} Pending
                                    </span>
                                    {savedCount > 0 && (
                                        <span className="bg-emerald-50 text-emerald-600 px-4 py-1 rounded-full text-xs font-bold border border-emerald-100">
                                            {savedCount} Processed
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Global Markup</label>
                                <div className="relative w-24">
                                    <input
                                        type="number"
                                        value={markupPercent}
                                        onChange={(e) => setMarkupPercent(e.target.value)}
                                        className="w-full bg-white border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-slate-950"
                                    />
                                    <span className="absolute right-3 top-2.5 text-slate-400 text-xs font-bold">%</span>
                                </div>
                            </div>
                        </div>

                        <div className="divide-y divide-slate-50">
                            {extractedItems.map((item) => (
                                <div
                                    key={item.id}
                                    className={`p-6 flex flex-col lg:flex-row lg:items-center gap-6 transition-all ${item.status !== 'pending' ? 'bg-slate-50/50 grayscale' : 'hover:bg-slate-50/30'
                                        }`}
                                >
                                    <div className="w-24 flex-shrink-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date</p>
                                        <p className="text-sm font-medium text-slate-600 tabular-nums">{item.date}</p>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</p>
                                        <h3 className="text-sm font-bold text-slate-900 truncate pr-4">{item.description}</h3>
                                    </div>

                                    <div className="w-32 flex-shrink-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Amount</p>
                                        <p className="text-lg font-bold text-slate-900 tabular-nums">${item.amount.toFixed(2)}</p>
                                    </div>

                                    <div className="flex-1 min-w-[240px]">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Assign to Job</p>
                                        {item.status === 'pending' ? (
                                            <div className="relative">
                                                <select
                                                    value={item.projectId || ''}
                                                    onChange={(e) => handleAssignProject(item.id, e.target.value)}
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-slate-950 appearance-none shadow-sm"
                                                >
                                                    <option value="">Choose a project...</option>
                                                    {projects.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
                                                    <Briefcase size={16} weight="duotone" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                {item.status === 'saved' ? (
                                                    <span className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                                        <Check size={14} weight="bold" /> Assigned to {projects.find(p => p.id === item.projectId)?.name}
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 text-slate-400 font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                                                        <SkipForward size={14} weight="bold" /> Skipped
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 lg:pl-4">
                                        {item.status === 'pending' && (
                                            <>
                                                <button
                                                    onClick={() => handleSaveItem(item)}
                                                    disabled={!item.projectId}
                                                    className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-800 disabled:opacity-20 transition-all shadow-lg shadow-slate-200"
                                                >
                                                    <FloppyDisk size={16} weight="bold" /> Save
                                                </button>
                                                <button
                                                    onClick={() => handleSkipItem(item.id)}
                                                    className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                                                    title="Skip Transaction"
                                                >
                                                    <SkipForward size={18} weight="bold" />
                                                </button>
                                            </>
                                        )}
                                        {item.status !== 'pending' && (
                                            <button
                                                onClick={() => setExtractedItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending', selected: true } : i))}
                                                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 px-3 py-1"
                                            >
                                                Undo
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="relative group border-2 border-dashed border-slate-200 rounded-[48px] p-20 flex flex-col items-center justify-center transition-all hover:border-slate-400 hover:bg-slate-50/50">
                        {isProcessing ? (
                            <div className="text-center space-y-4">
                                <div className="relative">
                                    <CircleNotch size={64} className="animate-spin text-slate-950" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Files size={24} weight="duotone" className="text-slate-400" />
                                    </div>
                                </div>
                                <div>
                                    <p className="font-bold text-xl text-slate-900">{status}</p>
                                    <p className="text-slate-500 text-sm">Gemini AI is analyzing your charges...</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-6">
                                <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mx-auto group-hover:scale-110 group-hover:bg-slate-950 group-hover:text-white transition-all duration-500">
                                    <Files size={40} weight="duotone" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold text-slate-900">No Statement Active</h3>
                                    <p className="text-slate-500 max-w-xs mx-auto">Upload your Amex or bank statement to start bulk categorizing expenses.</p>
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-white border-2 border-slate-900 text-slate-900 px-8 py-3 rounded-2xl font-bold text-sm hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                                >
                                    Choose File
                                </button>
                                <div className="flex items-center gap-6 justify-center pt-8 opacity-40">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <CaretRight weight="bold" /> PDF Preferred
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <CaretRight weight="bold" /> AI Categorization
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <CaretRight weight="bold" /> Secure Upload
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Statements;

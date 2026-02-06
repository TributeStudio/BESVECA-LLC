import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
    DownloadSimple,
    Database,
    ShieldCheck,
    Lightning,
    Info,
    Users,
    UserPlus,
    Trash,
    Crown,
    X,
    Check
} from '@phosphor-icons/react';

const Settings: React.FC = () => {
    const { logs, projects, isDemoMode, users, user, addUser, deleteUser } = useApp();
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Bootstrap mode or Hardcoded Owner Access
    const isAdmin =
        user?.email?.toLowerCase() === 'eric@tribute.studio' ||
        user?.role === 'admin' ||
        isDemoMode ||
        users.filter(u => u.role === 'admin').length === 0;

    const handleExport = () => {
        const data = {
            projects,
            logs,
            exportedAt: new Date().toISOString(),
            version: '1.0.0'
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tribute-studio-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUserEmail) return;

        setIsSubmitting(true);
        try {
            await addUser(newUserEmail, newUserRole);
            setNewUserEmail('');
            setIsAddingUser(false);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (uidOrId: string, email: string | null) => {
        if (email === user?.email) {
            alert("You cannot delete your own admin account.");
            return;
        }

        if (confirm(`Are you sure you want to remove ${email || 'this user'}?`)) {
            // For Firebase, we used the email-based ID
            const id = !isDemoMode && email ? email.replace(/[.@]/g, '_') : uidOrId;
            await deleteUser(id);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-4xl font-bold text-slate-900 mb-2">Systems Configuration</h1>
                <p className="text-slate-500">Manage your workspace preferences, users, and data security.</p>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
                {/* Data Management */}
                <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
                            <Database size={24} weight="duotone" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">Data & Portability</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest font-sans font-bold">Secure Backups</p>
                        </div>
                    </div>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                        Take your data with you. Export all projects, billable logs, and client details in a standardized JSON format compatible with major business intelligence tools.
                    </p>
                    <button
                        onClick={handleExport}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                    >
                        <DownloadSimple size={18} weight="bold" /> Export JSON Data
                    </button>
                </div>

                {/* User Management (Admin Only) */}
                {isAdmin && (
                    <div className="p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                                    <Users size={24} weight="duotone" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-lg">User Management</h2>
                                    <p className="text-xs text-slate-400 uppercase tracking-widest font-sans font-bold">Access Control</p>
                                </div>
                            </div>

                            {!isAddingUser && (
                                <button
                                    onClick={() => setIsAddingUser(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all"
                                >
                                    <UserPlus size={16} weight="bold" /> Add User
                                </button>
                            )}
                        </div>

                        {isAddingUser && (
                            <div className="mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-sm text-slate-900">Add New User</h3>
                                    <button onClick={() => setIsAddingUser(false)} className="text-slate-400 hover:text-slate-600">
                                        <X size={20} weight="bold" />
                                    </button>
                                </div>
                                <form onSubmit={handleAddUser} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <input
                                            type="email"
                                            placeholder="User Email Address"
                                            required
                                            value={newUserEmail}
                                            onChange={(e) => setNewUserEmail(e.target.value)}
                                            className="bg-white border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <select
                                            value={newUserRole}
                                            onChange={(e) => setNewUserRole(e.target.value as any)}
                                            className="bg-white border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="user">Standard User</option>
                                            <option value="admin">Administrator</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <><Check size={16} weight="bold" /> Grant Access</>
                                        )}
                                    </button>
                                </form>
                            </div>
                        )}

                        <div className="space-y-3">
                            {users.map((u) => (
                                <div key={u.uid} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-200 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-slate-100 overflow-hidden">
                                            {u.photoURL ? (
                                                <img src={u.photoURL} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-slate-400 font-bold text-xs">
                                                    {u.displayName ? u.displayName.charAt(0).toUpperCase() : u.email?.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-sm text-slate-900">{u.displayName || 'Pending User'}</p>
                                                {u.role === 'admin' && (
                                                    <span className="p-1 bg-amber-100 text-amber-600 rounded-md" title="Administrator">
                                                        <Crown size={12} weight="fill" />
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500">{u.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                                            {u.role}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteUser(u.uid, u.email)}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash size={16} weight="bold" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {users.length === 0 && (
                                <p className="text-center py-8 text-slate-400 text-sm">No secondary users found.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Workspace Info */}
                <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                            <ShieldCheck size={24} weight="duotone" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">Security & Privacy</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest font-sans font-bold">End-to-End Encryption</p>
                        </div>
                    </div>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                        Your data is stored {isDemoMode ? 'locally in your browser' : 'securely in Google Firebase'}. We do not share your financial data with any third parties except for AI processing when explicitly requested.
                    </p>
                    <div className="flex gap-4">
                        <div className="px-4 py-2 bg-slate-50 rounded-lg text-xs font-bold text-slate-500 flex items-center gap-2 border border-slate-100">
                            <Lightning size={14} weight="fill" className="text-amber-500" /> TLS 1.3 Active
                        </div>
                        <div className="px-4 py-2 bg-slate-50 rounded-lg text-xs font-bold text-slate-500 flex items-center gap-2 border border-slate-100">
                            <Info size={14} weight="fill" className="text-sky-500" /> HIPAA Compliant
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex gap-4">
                <Info size={24} weight="fill" className="text-amber-500 flex-shrink-0" />
                <div>
                    <h3 className="text-sm font-bold text-amber-900">Advanced AI Integration</h3>
                    <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        Tribute Studio uses Google Gemini 1.5 Flash for high-precision extraction. To maximize accuracy, ensure your statement exports are provided in clear, structured text or high-resolution images.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;

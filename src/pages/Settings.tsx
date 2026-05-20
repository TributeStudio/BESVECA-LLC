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
    const {
        logs,
        projects,
        invoices,
        isDemoMode,
        users,
        user,
        cloudHealth,
        backups,
        addUser,
        deleteUser,
        runCloudHealthCheck,
        createCloudBackup,
        clearCloudError,
    } = useApp();
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingCloud, setIsCheckingCloud] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);

    const isAdmin =
        user?.email?.toLowerCase() === 'eric@tribute.studio' ||
        user?.email?.toLowerCase() === 'jessica@tribute.studio' ||
        user?.role === 'admin' ||
        isDemoMode;

    const downloadJson = (data: unknown, filename: string) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadSnapshot = () => {
        downloadJson({
            business: 'BESVECA, LLC',
            exportedAt: new Date().toISOString(),
            source: isDemoMode ? 'sample-mode' : 'app-state',
            counts: {
                guests: projects.length,
                logs: logs.length,
                invoices: invoices.length,
                users: users.length,
            },
            projects,
            logs,
            invoices,
            users,
        }, `besveca-house-snapshot-${new Date().toISOString().split('T')[0]}.json`);
    };

    const handleCloudCheck = async () => {
        setIsCheckingCloud(true);
        try {
            await runCloudHealthCheck();
        } finally {
            setIsCheckingCloud(false);
        }
    };

    const handleCreateBackup = async () => {
        setIsBackingUp(true);
        try {
            const backup = await createCloudBackup();
            if (backup) {
                downloadJson(backup, `besveca-house-cloud-backup-${backup.id}.json`);
            }
        } finally {
            setIsBackingUp(false);
        }
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
            const id = email || uidOrId;
            await deleteUser(id);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-4xl font-bold text-slate-900 mb-2">Settings</h1>
                <p className="text-slate-500">Manage BESVECA access, cloud health, and backups.</p>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
                {/* Data Management */}
                <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
                            <Database size={24} weight="duotone" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">Cloud Data</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest font-sans font-bold">Backups & Verification</p>
                        </div>
                    </div>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                        BESVECA records now live in one shared cloud workspace. Run a check before invoice work, then create a cloud backup when the books look right.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Cloud status</p>
                            <p className={`text-sm font-bold ${cloudHealth.status === 'error' ? 'text-red-600' : cloudHealth.status === 'healthy' ? 'text-emerald-600' : 'text-slate-700'}`}>
                                {cloudHealth.status === 'checking' ? 'Checking...' : cloudHealth.status === 'healthy' ? 'Cloud verified' : cloudHealth.status === 'error' ? 'Needs attention' : 'Not checked yet'}
                            </p>
                            {cloudHealth.counts && (
                                <p className="text-xs text-slate-500 mt-2">
                                    {cloudHealth.counts.guests} guests, {cloudHealth.counts.logs} stays/expenses, {cloudHealth.counts.invoices} invoices
                                </p>
                            )}
                            {cloudHealth.error && (
                                <button onClick={clearCloudError} className="text-xs text-red-600 mt-2 font-bold hover:text-red-700">
                                    Clear message
                                </button>
                            )}
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Latest backup</p>
                            <p className="text-sm font-bold text-slate-700">
                                {backups.length > 0 ? new Date(backups[0].createdAt).toLocaleString() : 'No cloud backup yet'}
                            </p>
                            {backups.length > 0 && (
                                <p className="text-xs text-slate-500 mt-2">
                                    {backups[0].counts.guests} guests, {backups[0].counts.logs} stays/expenses, {backups[0].counts.invoices} invoices
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={handleCloudCheck}
                            disabled={isCheckingCloud}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                        >
                            <Database size={18} weight="bold" /> {isCheckingCloud ? 'Checking Cloud...' : 'Check Cloud Data'}
                        </button>
                        <button
                            onClick={handleCreateBackup}
                            disabled={isBackingUp}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all disabled:opacity-50"
                        >
                            <ShieldCheck size={18} weight="bold" /> {isBackingUp ? 'Creating Backup...' : 'Create Cloud Backup'}
                        </button>
                        <button
                            onClick={handleDownloadSnapshot}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all border border-slate-200"
                        >
                            <DownloadSimple size={18} weight="bold" /> Download Snapshot
                        </button>
                    </div>
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
                                            onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'user')}
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
                            <p className="text-xs text-slate-400 uppercase tracking-widest font-sans font-bold">Firebase Cloud Workspace</p>
                        </div>
                    </div>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                        Your data is stored {isDemoMode ? 'in temporary sample mode' : 'in the BESVECA cloud workspace'}. Statement uploads are only sent for AI extraction when you choose to use that tool.
                    </p>
                    <div className="flex gap-4">
                        <div className="px-4 py-2 bg-slate-50 rounded-lg text-xs font-bold text-slate-500 flex items-center gap-2 border border-slate-100">
                            <Lightning size={14} weight="fill" className="text-amber-500" /> Confirmed Cloud Saves
                        </div>
                        <div className="px-4 py-2 bg-slate-50 rounded-lg text-xs font-bold text-slate-500 flex items-center gap-2 border border-slate-100">
                            <Info size={14} weight="fill" className="text-sky-500" /> Owner-Managed Access
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex gap-4">
                <Info size={24} weight="fill" className="text-amber-500 flex-shrink-0" />
                <div>
                    <h3 className="text-sm font-bold text-amber-900">Statement Extraction</h3>
                    <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        Use AI statement extraction for cleanup speed, then review every imported charge before saving it to the books.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;

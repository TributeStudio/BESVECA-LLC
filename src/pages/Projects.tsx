import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Plus, UserSquare, User, Pencil, Envelope, Phone, MapPin } from '@phosphor-icons/react';
import type { Project } from '../types';

const Projects: React.FC = () => {
    const { projects, addProject, updateProject } = useApp();
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        client: '',
        email: '',
        phone: '',
        address: '',
        hourlyRate: '150',
        status: 'ACTIVE' as 'ACTIVE' | 'ARCHIVED' | 'COMPLETED'
    });

    const [isSaving, setIsSaving] = useState(false);

    const handleEdit = (project: Project) => {
        setEditingProject(project);
        setFormData({
            name: project.name,
            client: project.client,
            email: project.email || '',
            phone: project.phone || '',
            address: project.address || '',
            hourlyRate: project.hourlyRate.toString(),
            status: project.status
        });
        setShowAddModal(true);
    };

    const handleCloseModal = () => {
        setShowAddModal(false);
        setEditingProject(null);
        setFormData({ name: '', client: '', email: '', phone: '', address: '', hourlyRate: '150', status: 'ACTIVE' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), 8000)
        );

        try {
            if (editingProject) {
                await Promise.race([
                    updateProject(editingProject.id, {
                        name: formData.name,
                        client: formData.client,
                        email: formData.email,
                        phone: formData.phone,
                        address: formData.address,
                        hourlyRate: Number(formData.hourlyRate),
                        status: formData.status
                    }),
                    timeout
                ]);
            } else {
                await Promise.race([
                    addProject({
                        name: formData.name,
                        client: formData.client,
                        email: formData.email,
                        phone: formData.phone,
                        address: formData.address,
                        hourlyRate: Number(formData.hourlyRate),
                        status: formData.status
                    }),
                    timeout
                ]);
            }
            handleCloseModal();
        } catch (error) {
            console.error('Submit handle error:', error);
            alert('Operation took too long or failed. Please refresh and try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">Properties & Guests</h1>
                    <p className="text-slate-500">Manage your properties and guest details.</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg"
                >
                    <Plus size={18} weight="bold" /> New Guest
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                    <div key={project.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 group hover:shadow-xl transition-all duration-300 relative">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                <UserSquare size={24} weight="duotone" />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleEdit(project)}
                                    className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                                    title="Edit Guest"
                                >
                                    <Pencil size={18} weight="bold" />
                                </button>
                                <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${project.status === 'ACTIVE'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : project.status === 'COMPLETED'
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}>
                                    {project.status}
                                </span>
                            </div>
                        </div>

                        <h3 className="text-xl font-bold text-slate-900 mb-1">{project.name}</h3>
                        <p className="text-sm text-slate-500 mb-6 flex items-center gap-1">
                            <User size={14} weight="duotone" className="opacity-50" /> {project.client}
                        </p>

                        <div className="space-y-2 mb-6">
                            {project.email && (
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Envelope size={14} weight="duotone" className="text-slate-400" />
                                    {project.email}
                                </div>
                            )}
                            {project.phone && (
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Phone size={14} weight="duotone" className="text-slate-400" />
                                    {project.phone}
                                </div>
                            )}
                            {project.address && (
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <MapPin size={14} weight="duotone" className="text-slate-400" />
                                    <span className="truncate">{project.address}</span>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rate</p>
                                <p className="text-lg font-bold text-slate-900 tabular-nums">${project.hourlyRate}<span className="text-sm font-normal text-slate-400">/night</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Created</p>
                                <p className="text-sm font-medium text-slate-600">{new Date(project.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="font-bold text-2xl">{editingProject ? 'Edit Guest' : 'New Guest'}</h2>
                            <button onClick={handleCloseModal} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                <Plus size={24} weight="bold" className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Guest Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Brand Identity 2024"
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email</label>
                                <input
                                    type="email"
                                    placeholder="guest@example.com"
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phone</label>
                                    <input
                                        type="tel"
                                        placeholder="(555) 123-4567"
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Property</label>
                                    <select
                                        required
                                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                        value={formData.client}
                                        onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                                    >
                                        <option value="">Select Property...</option>
                                        <option value="BESVECA">BESVECA</option>
                                        <option value="Skyhouse">Skyhouse</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Address</label>
                                <input
                                    type="text"
                                    placeholder="123 Guest St, City, State"
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nightly Rate ($)</label>
                                <input
                                    type="number"
                                    required
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                    value={formData.hourlyRate}
                                    onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
                                <select
                                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-slate-900"
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' })}
                                >
                                    <option value="ACTIVE">ACTIVE</option>
                                    <option value="COMPLETED">COMPLETED</option>
                                    <option value="ARCHIVED">ARCHIVED</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
                            >
                                {isSaving ? (
                                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    editingProject ? 'Update Guest' : 'Create Guest'
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Projects;

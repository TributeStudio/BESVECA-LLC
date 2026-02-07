import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    SquaresFour,
    Timer,
    CreditCard,
    Invoice,
    Gear,
    SignOut,
    UserSquare
} from '@phosphor-icons/react';
import { useApp } from '../context/AppContext';
import { COMPANY_CONFIG } from '../config/company';

const SidebarItem = ({ to, icon: Icon, label }: { to: string, icon: React.ElementType, label: string }) => (
    <NavLink
        to={to}
        className={({ isActive }) => `
      flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
      ${isActive
                ? 'bg-white/10 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-white/5'}
    `}
    >
        <Icon size={20} weight="duotone" />
        <span className="font-medium">{label}</span>
    </NavLink>
);

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { signOut, isDemoMode } = useApp();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await signOut();
        navigate('/');
    };

    return (
        <div className="flex h-screen bg-slate-50">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-12">
                    <div className="w-10 h-10 flex items-center justify-center">
                        <img src="/besveca-logo.svg" alt="BESVECA" className="w-full h-full object-contain" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">{COMPANY_CONFIG.name}</h1>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-sans">Accounting</p>
                    </div>
                </div>

                <nav className="flex-1 space-y-2">
                    <SidebarItem to="/dashboard" icon={SquaresFour} label="Dashboard" />
                    <SidebarItem to="/tracker" icon={Timer} label="Tracker" />
                    <SidebarItem to="/statements" icon={CreditCard} label="CC Statements" />
                    <SidebarItem to="/invoices" icon={Invoice} label="Invoices" />
                    <SidebarItem to="/projects" icon={UserSquare} label="Guests" />
                </nav>

                <div className="pt-6 border-t border-white/5 space-y-2">
                    <SidebarItem to="/settings" icon={Gear} label="Settings" />
                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                    >
                        <SignOut size={20} weight="duotone" />
                        <span className="font-medium">Sign Out</span>
                    </button>
                </div>

                {isDemoMode && (
                    <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <p className="text-xs text-amber-500 font-medium text-center">Demo Mode Active</p>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-10">
                <div className="max-w-6xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;

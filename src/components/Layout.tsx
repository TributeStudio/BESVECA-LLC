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
      flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200 lg:gap-3 lg:px-4 lg:py-3 lg:text-base
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
        <div className="min-h-screen bg-slate-50 lg:flex">
            <aside className="bg-slate-900 text-white flex flex-col p-4 shadow-2xl lg:h-screen lg:w-64 lg:p-6">
                <div className="flex items-center justify-between gap-3 lg:mb-12">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="h-10 w-10 shrink-0 flex items-center justify-center">
                            <img src="/besveca-logo.svg" alt="BESVECA" className="w-full h-full object-contain" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-lg font-bold tracking-tight lg:text-xl">{COMPANY_CONFIG.name}</h1>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-sans">Accounting</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition-all duration-200 hover:bg-white/5 hover:text-white lg:hidden"
                    >
                        <SignOut size={18} weight="duotone" />
                        <span className="font-medium">Sign Out</span>
                    </button>
                </div>

                <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-0 lg:flex-1 lg:flex-col lg:space-y-2 lg:overflow-visible lg:pb-0">
                    <SidebarItem to="/dashboard" icon={SquaresFour} label="Dashboard" />
                    <SidebarItem to="/projects" icon={UserSquare} label="Guests" />
                    <SidebarItem to="/tracker" icon={Timer} label="Guest Folio" />
                    <SidebarItem to="/statements" icon={CreditCard} label="CC Statements" />
                    <SidebarItem to="/invoices" icon={Invoice} label="Invoices" />
                    <div className="lg:hidden">
                        <SidebarItem to="/settings" icon={Gear} label="Settings" />
                    </div>
                </nav>

                <div className="hidden border-t border-white/5 pt-6 lg:block">
                    <div className="space-y-2">
                        <SidebarItem to="/settings" icon={Gear} label="Settings" />
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                        >
                            <SignOut size={20} weight="duotone" />
                            <span className="font-medium">Sign Out</span>
                        </button>
                    </div>
                </div>

                {isDemoMode && (
                    <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 lg:mt-6 lg:p-4">
                        <p className="text-center text-xs font-medium text-amber-500">Sample Mode: Not Saved</p>
                    </div>
                )}
            </aside>

            <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:h-screen lg:p-10">
                <div className="max-w-6xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;

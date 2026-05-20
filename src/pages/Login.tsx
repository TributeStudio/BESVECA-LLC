import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, GoogleLogo, House, ShieldCheck } from '@phosphor-icons/react';

const Login: React.FC = () => {
    const { signInWithGoogle, enterDemoMode, user, isDemoMode } = useApp();
    const navigate = useNavigate();
    const [isAuthLoading, setIsAuthLoading] = useState(false);

    React.useEffect(() => {
        if (user || isDemoMode) {
            navigate('/dashboard');
        }
    }, [user, isDemoMode, navigate]);

    const handleGoogleSignIn = async () => {
        setIsAuthLoading(true);
        try {
            await signInWithGoogle();
        } finally {
            setIsAuthLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
            <div className="max-w-md w-full">
                <div className="text-center mb-10">
                    <img src="/besveca-logo.svg" alt="BESVECA, LLC" className="w-24 h-24 mx-auto mb-6" />
                    <h1 className="text-4xl text-slate-950 mb-2 tracking-tight">BESVECA, LLC</h1>
                    <p className="text-slate-500 font-sans tracking-wide">Vacation rental accounting</p>
                </div>

                <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-xl shadow-slate-200/70">
                    <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 mb-5 text-emerald-800">
                        <ShieldCheck size={20} weight="duotone" />
                        <p className="text-sm font-semibold">Cloud save is required for real accounting data.</p>
                    </div>
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={isAuthLoading}
                        className="w-full bg-slate-950 text-white px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all duration-200 mb-4 shadow-xl disabled:opacity-50"
                    >
                        {isAuthLoading ? (
                            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <GoogleLogo size={24} weight="bold" />
                        )}
                        {isAuthLoading ? 'Connecting...' : 'Sign in with Google'}
                    </button>

                    <div className="relative my-8 text-center">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-100"></div>
                        </div>
                        <span className="relative px-4 text-slate-400 text-xs uppercase tracking-[0.2em] bg-white">or</span>
                    </div>

                    <button
                        onClick={enterDemoMode}
                        className="w-full bg-stone-100 text-slate-800 px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-stone-200 transition-all duration-200 border border-stone-200"
                    >
                        <House size={18} weight="duotone" />
                        Open Sample Mode
                        <ArrowRight size={18} className="ml-auto opacity-50" />
                    </button>
                </div>

                <p className="mt-8 text-center text-slate-500 text-sm">
                    Sample mode is temporary and does not save after refresh.
                </p>
            </div>
        </div>
    );
};

export default Login;

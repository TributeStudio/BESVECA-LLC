import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Sparkle, ArrowRight, GoogleLogo } from '@phosphor-icons/react';

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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Decorative blobs */}
            <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

            <div className="max-w-md w-full relative">
                <div className="text-center mb-10">
                    <img src="/besveca-logo.svg" alt="BESVECA, LLC" className="w-24 h-24 mx-auto mb-6" />
                    <h1 className="text-4xl text-white mb-2 tracking-tight">BESVECA, LLC</h1>
                    <p className="text-slate-400 font-sans tracking-wide">Business Intelligence for the Creative Mind</p>
                </div>

                <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={isAuthLoading}
                        className="w-full bg-white text-slate-950 px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-slate-100 transition-all duration-300 mb-4 shadow-xl disabled:opacity-50"
                    >
                        {isAuthLoading ? (
                            <div className="w-6 h-6 border-2 border-slate-900/20 border-t-slate-900 rounded-full animate-spin" />
                        ) : (
                            <GoogleLogo size={24} weight="bold" className="text-slate-900" />
                        )}
                        {isAuthLoading ? 'Connecting...' : 'Sign in with Google'}
                    </button>

                    <div className="relative my-8 text-center">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/5"></div>
                        </div>
                        <span className="relative px-4 text-slate-500 text-xs uppercase tracking-[0.2em] bg-slate-900/0">or</span>
                    </div>

                    <button
                        onClick={enterDemoMode}
                        className="w-full bg-slate-800 text-white px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-slate-700 transition-all duration-300 border border-white/5"
                    >
                        <Sparkle size={18} weight="fill" className="text-amber-400" />
                        Explore Demo Mode
                        <ArrowRight size={18} className="ml-auto opacity-50" />
                    </button>
                </div>

                <p className="mt-8 text-center text-slate-500 text-sm">
                    A premium dashboard for freelancers & small agencies.
                </p>
            </div>
        </div>
    );
};

export default Login;

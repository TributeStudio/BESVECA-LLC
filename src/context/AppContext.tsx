import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Project, LogItem, AppState, Invoice } from '../types';
import { MOCK_PROJECTS, MOCK_LOGS } from '../utils/mockData';
import { auth, db, isConfigValid } from '../services/firebase';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, GoogleAuthProvider } from 'firebase/auth';
import { collection, onSnapshot, addDoc, query, orderBy, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';

interface AppContextType extends AppState {
    signInWithGoogle: () => Promise<void>;
    enterDemoMode: () => void;
    signOut: () => Promise<void>;
    addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Promise<void>;
    addLog: (log: Omit<LogItem, 'id' | 'createdAt'>) => Promise<void>;
    updateLog: (id: string, updates: Partial<LogItem>) => Promise<void>;
    deleteLog: (id: string) => Promise<void>;
    updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
    addUser: (email: string, role: 'admin' | 'user') => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
    addInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt'>) => Promise<void>;
    updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>;
    deleteInvoice: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AppState>({
        user: null,
        users: [],
        projects: [],
        logs: [],
        invoices: [],
        isDemoMode: localStorage.getItem('demoMode') === 'true',
        isLoading: true,
    });

    useEffect(() => {
        if (!isConfigValid || !auth) {
            setState(prev => ({ ...prev, isLoading: false }));
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                // REAL USER LOGGED IN - Force Demo Mode OFF
                if (state.isDemoMode) {
                    localStorage.removeItem('demoMode');
                }

                setState(prev => ({
                    ...prev,
                    isDemoMode: false,
                    user: {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        role: 'user'
                    },
                    isLoading: false
                }));

                // Set up real-time syncs
                const metaId = user.email?.toLowerCase().replace(/[.@]/g, '_');
                const unsubUserMeta = metaId ? onSnapshot(doc(db, 'users_metadata', metaId), (docSnap) => {
                    if (docSnap.exists()) {
                        const userData = docSnap.data();
                        setState(prev => ({
                            ...prev,
                            user: prev.user ? { ...prev.user, role: userData.role } : null
                        }));
                    }
                }) : () => { };

                const unsubUsers = onSnapshot(collection(db, 'users_metadata'), (snapshot) => {
                    const users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as any));
                    setState(prev => ({ ...prev, users }));
                }, (err) => console.warn('Users list snapshot error:', err));

                const unsubProjects = onSnapshot(
                    query(collection(db, 'users', user.uid, 'projects'), orderBy('createdAt', 'desc')),
                    (snapshot) => {
                        const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
                        setState(prev => ({ ...prev, projects }));
                    },
                    (error) => {
                        console.error("Error syncing projects:", error);
                        if (error.code === 'permission-denied') {
                            alert("Error: Unable to load projects. Access to database denied.");
                        }
                    }
                );

                const unsubLogs = onSnapshot(
                    query(collection(db, 'users', user.uid, 'logs'), orderBy('createdAt', 'desc')),
                    (snapshot) => {
                        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LogItem));
                        setState(prev => ({ ...prev, logs }));
                    },
                    (error) => {
                        console.error("Error syncing logs:", error);
                    }
                );

                const unsubInvoices = onSnapshot(
                    query(collection(db, 'users', user.uid, 'invoices'), orderBy('createdAt', 'desc')),
                    (snapshot) => {
                        const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
                        setState(prev => ({ ...prev, invoices }));
                    },
                    (error) => {
                        console.error("Error syncing invoices:", error);
                    }
                );

                return () => {
                    unsubUserMeta();
                    unsubUsers();
                    unsubProjects();
                    unsubLogs();
                    unsubInvoices();
                };
            } else {
                // NO REAL USER - Check if we should be in Demo Mode
                if (state.isDemoMode) {
                    const savedProjects = localStorage.getItem('tribute_projects');
                    const savedLogs = localStorage.getItem('tribute_logs');
                    const savedInvoices = localStorage.getItem('tribute_invoices');

                    setState(prev => ({
                        ...prev,
                        user: { uid: 'demo-user', email: 'demo@tribute.studio', displayName: 'Creative Director', photoURL: null, role: 'admin' },
                        users: [
                            { uid: 'demo-user', email: 'demo@tribute.studio', displayName: 'Creative Director', photoURL: null, role: 'admin' },
                            { uid: 'user-2', email: 'assistant@tribute.studio', displayName: 'Studio Assistant', photoURL: null, role: 'user' }
                        ],
                        projects: savedProjects ? JSON.parse(savedProjects) : MOCK_PROJECTS,
                        logs: savedLogs ? JSON.parse(savedLogs) : MOCK_LOGS,
                        invoices: savedInvoices ? JSON.parse(savedInvoices) : [],
                        isLoading: false,
                    }));
                } else {
                    setState(prev => ({ ...prev, user: null, users: [], isLoading: false }));
                }
            }
        });

        return () => unsubscribe();
    }, [state.isDemoMode]);

    // Persist demo data
    useEffect(() => {
        if (state.isDemoMode && !state.isLoading) {
            localStorage.setItem('tribute_projects', JSON.stringify(state.projects));
            localStorage.setItem('tribute_logs', JSON.stringify(state.logs));
            localStorage.setItem('tribute_invoices', JSON.stringify(state.invoices));
        }
    }, [state.projects, state.logs, state.invoices, state.isDemoMode, state.isLoading]);

    const enterDemoMode = () => {
        localStorage.setItem('demoMode', 'true');
        setState(prev => ({ ...prev, isDemoMode: true }));
    };

    // ... (AUTH FUNCTIONS remain same) ...

    const signInWithGoogle = async () => {
        console.log('Attempting Google Sign-in...');
        console.log('Firebase Config Valid:', isConfigValid);

        if (!isConfigValid) {
            alert('Firebase configuration is missing or invalid. Please check your VITE_FIREBASE_* environment variables in Vercel.');
            enterDemoMode();
            return;
        }

        if (!auth) {
            alert('Firebase Auth failed to initialize. This usually means the API key or Project ID is incorrect.');
            return;
        }

        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            console.log('Opening Firebase Popup...');
            await signInWithPopup(auth, provider);
            localStorage.removeItem('demoMode');
            setState(prev => ({ ...prev, isDemoMode: false }));
            console.log('Sign-in successful');
        } catch (error: any) {
            console.error('Detailed Auth Error:', error);
            if (error.code === 'auth/popup-blocked') {
                alert('Sign-in popup was blocked by your browser. Please allow popups for this site or click again.');
            } else if (error.code === 'auth/operation-not-allowed') {
                alert('Google Sign-in is not enabled in your Firebase Console. Go to Build > Authentication > Sign-in method.');
            } else if (error.code === 'auth/unauthorized-domain') {
                alert(`Domain unauthorized. Please check Firebase Console.`);
            } else {
                alert(`Authentication error: ${error.message}`);
            }
        }
    };

    const signOut = async () => {
        if (state.isDemoMode) {
            localStorage.removeItem('demoMode');
            setState(prev => ({ ...prev, isDemoMode: false, user: null }));
        } else {
            await firebaseSignOut(auth);
        }
    };

    const addProject = async (projectData: Omit<Project, 'id' | 'createdAt'>) => {
        const newProject = { ...projectData, createdAt: Date.now() };

        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                projects: [{ ...newProject, id: Math.random().toString(36).substring(2, 11) }, ...prev.projects]
            }));
            return;
        }

        if (!state.user) {
            alert('Cannot save project: You must be signed in with Google to save data to the cloud.');
            return;
        }

        addDoc(collection(db, 'users', state.user.uid, 'projects'), newProject)
            .then((docRef) => console.log('Project synced to server:', docRef.id))
            .catch((error) => {
                console.error('Firestore Add Project Error:', error);
                if (error.code === 'permission-denied') {
                    alert('Save Failed: You do not have permission to create projects.');
                }
            });
    };

    const addLog = async (logData: Omit<LogItem, 'id' | 'createdAt'>) => {
        const newLog = { ...logData, createdAt: Date.now() };

        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                logs: [{ ...newLog, id: Math.random().toString(36).substring(2, 11) }, ...prev.logs]
            }));
            return;
        }

        if (!state.user) {
            alert('Cannot save log: You must be signed in with Google to save data to the cloud.');
            return;
        }

        addDoc(collection(db, 'users', state.user.uid, 'logs'), newLog)
            .then(() => console.log('Log synced to server'))
            .catch((error) => {
                console.error('Firestore Add Log Error:', error);
                alert(`Error syncing log: ${error.message}`);
            });
    };

    const deleteLog = async (id: string) => {
        if (state.isDemoMode) {
            setState(prev => ({ ...prev, logs: prev.logs.filter(l => l.id !== id) }));
        } else if (state.user) {
            await deleteDoc(doc(db, 'users', state.user.uid, 'logs', id));
        }
    };

    const updateLog = async (id: string, updates: Partial<LogItem>) => {
        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                logs: prev.logs.map(l => l.id === id ? { ...l, ...updates } : l)
            }));
            return;
        }

        if (!state.user) return;
        try {
            await updateDoc(doc(db, 'users', state.user.uid, 'logs', id), updates);
        } catch (error: any) {
            console.error('Firestore Update Log Error:', error);
        }
    };

    const updateProject = async (id: string, updates: Partial<Project>) => {
        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                projects: prev.projects.map(p => p.id === id ? { ...p, ...updates } : p)
            }));
            return;
        }

        if (!state.user) return;
        try {
            await updateDoc(doc(db, 'users', state.user.uid, 'projects', id), updates);
        } catch (error: any) {
            console.error('Firestore Update Project Error:', error);
        }
    };

    const addInvoice = async (invoiceData: Omit<Invoice, 'id' | 'createdAt'>) => {
        const newInvoice = { ...invoiceData, createdAt: Date.now() };

        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                invoices: [{ ...newInvoice, id: Math.random().toString(36).substring(2, 11) }, ...prev.invoices]
            }));
            return;
        }

        if (!state.user) {
            alert('Cannot save invoice: login required.');
            return;
        }

        addDoc(collection(db, 'users', state.user.uid, 'invoices'), newInvoice)
            .catch((error) => {
                console.error('Firestore Add Invoice Error:', error);
                alert(`Error saving invoice: ${error.message}`);
            });
    };

    const updateInvoice = async (id: string, updates: Partial<Invoice>) => {
        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                invoices: prev.invoices.map(i => i.id === id ? { ...i, ...updates } : i)
            }));
            return;
        }

        if (!state.user) return;
        try {
            await updateDoc(doc(db, 'users', state.user.uid, 'invoices', id), updates);
        } catch (error: any) {
            console.error('Firestore Update Invoice Error:', error);
            alert(`Error updating invoice: ${error.message}`);
        }
    };

    const deleteInvoice = async (id: string) => {
        if (state.isDemoMode) {
            setState(prev => ({ ...prev, invoices: prev.invoices.filter(i => i.id !== id) }));
        } else if (state.user) {
            await deleteDoc(doc(db, 'users', state.user.uid, 'invoices', id));
        }
    };

    const addUser = async (email: string, role: 'admin' | 'user') => {
        if (state.isDemoMode) {
            const newUser = {
                uid: Math.random().toString(36).substring(2, 11),
                email,
                displayName: email.split('@')[0],
                photoURL: null,
                role
            };
            setState(prev => ({
                ...prev,
                users: [...prev.users, newUser]
            }));
        } else if (state.user) {
            const normalizedEmail = email.toLowerCase();
            const id = normalizedEmail.replace(/[.@]/g, '_');
            const newUser = {
                uid: id,
                email: normalizedEmail,
                role,
                displayName: normalizedEmail.split('@')[0],
                photoURL: null,
                createdAt: Date.now()
            };

            setState(prev => ({ ...prev, users: [...prev.users, newUser] }));

            setDoc(doc(db, 'users_metadata', id), { email: normalizedEmail, role, createdAt: Date.now() })
                .catch((error) => {
                    console.error('Error adding user:', error);
                    setState(prev => ({ ...prev, users: prev.users.filter(u => u.uid !== id) }));
                });
        }
    };

    const deleteUser = async (id: string) => {
        if (state.isDemoMode) {
            setState(prev => ({ ...prev, users: prev.users.filter(u => u.uid !== id) }));
        } else if (state.user) {
            setState(prev => ({ ...prev, users: prev.users.filter(u => u.uid !== id) }));
            deleteDoc(doc(db, 'users_metadata', id))
                .catch((error) => {
                    console.error('Error deleting user:', error);
                });
        }
    };

    return (
        <AppContext.Provider value={{
            ...state,
            signInWithGoogle,
            enterDemoMode,
            signOut,
            addProject,
            addLog,
            updateLog,
            deleteLog,
            updateProject,
            addUser,
            deleteUser,
            addInvoice,
            updateInvoice,
            deleteInvoice
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};

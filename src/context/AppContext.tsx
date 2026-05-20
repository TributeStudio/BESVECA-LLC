import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { AppState, CloudBackupPayload, CloudHealth, Invoice, LogItem, Project, User } from '../types';
import { MOCK_LOGS, MOCK_PROJECTS } from '../utils/mockData';
import {
    auth,
    db,
    googleProvider,
    isConfigValid,
    missingFirebaseEnv,
    requireFirestore,
    runConfirmedFirestoreWrite,
} from '../services/firebase';
import {
    getRedirectResult,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    signOut as firebaseSignOut,
} from 'firebase/auth';
import {
    collection,
    deleteDoc,
    doc,
    getDocsFromServer,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import type { CollectionReference, DocumentData, Firestore, Unsubscribe } from 'firebase/firestore';

interface AppContextType extends AppState {
    signInWithGoogle: () => Promise<void>;
    enterDemoMode: () => void;
    signOut: () => Promise<void>;
    addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Promise<string | void>;
    addLog: (log: Omit<LogItem, 'id' | 'createdAt'>) => Promise<string | void>;
    updateLog: (id: string, updates: Partial<LogItem>) => Promise<void>;
    deleteLog: (id: string) => Promise<void>;
    updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
    addUser: (email: string, role: 'admin' | 'user') => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
    addInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt'>) => Promise<string | void>;
    updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>;
    deleteInvoice: (id: string) => Promise<void>;
    runCloudHealthCheck: () => Promise<CloudHealth | void>;
    createCloudBackup: () => Promise<CloudBackupPayload | void>;
    clearCloudError: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const BUSINESS_ID = 'besveca-house';
const OWNER_EMAILS = ['eric@tribute.studio', 'jessica@tribute.studio'];

type FirestoreErrorLike = {
    code?: string;
    message?: string;
};

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String((error as FirestoreErrorLike).message);
    }
    return 'Unknown error';
};

const getErrorCode = (error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        return String((error as FirestoreErrorLike).code);
    }
    return '';
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isOwnerEmail = (email?: string | null) =>
    Boolean(email && OWNER_EMAILS.includes(normalizeEmail(email)));

const makeDisplayName = (email: string) =>
    normalizeEmail(email)
        .split('@')[0]
        .split(/[._-]/g)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

const businessCollection = (
    firestore: Firestore,
    name: 'projects' | 'logs' | 'invoices' | 'members' | 'backups'
): CollectionReference<DocumentData> => collection(firestore, 'businesses', BUSINESS_ID, name);

const businessDoc = (
    firestore: Firestore,
    name: 'projects' | 'logs' | 'invoices' | 'members' | 'backups',
    id: string
) => doc(firestore, 'businesses', BUSINESS_ID, name, id);

const shouldUseRedirectSignIn = () => {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

const removeUndefinedFields = <T,>(value: T): T => {
    if (Array.isArray(value)) {
        return value
            .filter(item => item !== undefined)
            .map(item => removeUndefinedFields(item)) as T;
    }

    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([, fieldValue]) => fieldValue !== undefined)
            .map(([key, fieldValue]) => [key, removeUndefinedFields(fieldValue)])
    ) as T;
};

const mergeOwnerUsers = (members: User[]) => {
    const byEmail = new Map<string, User>();

    OWNER_EMAILS.forEach(email => {
        byEmail.set(email, {
            uid: email,
            email,
            displayName: makeDisplayName(email),
            photoURL: null,
            role: 'admin',
        });
    });

    members.forEach(member => {
        if (!member.email) return;
        const email = normalizeEmail(member.email);
        byEmail.set(email, {
            ...member,
            uid: member.uid || email,
            email,
            role: isOwnerEmail(email) ? 'admin' : member.role || 'user',
        });
    });

    return Array.from(byEmail.values()).sort((a, b) =>
        (a.email || '').localeCompare(b.email || '')
    );
};

const makeBackupId = () => {
    const timestamp = new Date().toISOString()
        .replace(/\D/g, '')
        .slice(0, 14);
    return `backup-${timestamp}`;
};

const describeCloudWriteFailure = (action: string, error: unknown) => {
    const code = getErrorCode(error);
    const message = getErrorMessage(error);

    if (message.startsWith('Cloud database did not confirm')) {
        return message;
    }

    if (code === 'permission-denied' || code === 'PERMISSION_DENIED') {
        return `Cloud save failed while trying to ${action}. Firebase denied the request, so the change was not saved.`;
    }

    if (code === 'unavailable') {
        return `Cloud save failed while trying to ${action}. Firebase is unavailable or unreachable, so the change was not saved.`;
    }

    if (code === 'unauthenticated') {
        return `Cloud save failed while trying to ${action}. Please sign in again before saving accounting data.`;
    }

    return `Cloud save failed while trying to ${action}: ${message}`;
};

const describeSyncFailure = (collectionName: string, error: unknown) => {
    const code = getErrorCode(error);
    const message = getErrorMessage(error);

    if (code === 'permission-denied' || code === 'PERMISSION_DENIED') {
        return `Cloud sync failed while loading ${collectionName}. Firebase denied access, so the data on screen may be incomplete.`;
    }

    return `Cloud sync failed while loading ${collectionName}: ${message}`;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const syncAlertShownRef = useRef(false);
    const [state, setState] = useState<AppState>({
        user: null,
        users: [],
        projects: [],
        logs: [],
        invoices: [],
        cloudHealth: { status: 'unchecked' },
        backups: [],
        isDemoMode: false,
        isLoading: isConfigValid && Boolean(auth) && Boolean(db),
    });

    useEffect(() => {
        if (!isConfigValid || !auth || !db) {
            if (missingFirebaseEnv.length > 0) {
                console.error('Missing Firebase environment variables:', missingFirebaseEnv);
            }
            return;
        }

        const firebaseAuth = auth;
        const firestore = db;
        let unsubscribeBusinessData: Unsubscribe | undefined;

        getRedirectResult(firebaseAuth).catch((error) => {
            console.error('Google redirect sign-in failed:', error);
            alert(`Authentication error: ${getErrorMessage(error)}`);
        });

        const clearBusinessSubscriptions = () => {
            if (unsubscribeBusinessData) {
                unsubscribeBusinessData();
                unsubscribeBusinessData = undefined;
            }
        };

        const showSyncFailure = (collectionName: string, error: unknown) => {
            console.error(`Error syncing ${collectionName}:`, error);
            const message = describeSyncFailure(collectionName, error);
            setState(prev => ({
                ...prev,
                isLoading: false,
                cloudHealth: {
                    ...prev.cloudHealth,
                    status: 'error',
                    error: message,
                    lastCheckedAt: Date.now(),
                },
            }));

            if (!syncAlertShownRef.current) {
                syncAlertShownRef.current = true;
                alert(message);
            }
        };

        const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
            clearBusinessSubscriptions();
            syncAlertShownRef.current = false;

            if (!firebaseUser) {
                setState(prev => ({
                    ...prev,
                    user: null,
                    users: [],
                    projects: [],
                    logs: [],
                    invoices: [],
                    backups: [],
                    cloudHealth: { status: 'unchecked' },
                    isDemoMode: false,
                    isLoading: false,
                }));
                return;
            }

            const email = normalizeEmail(firebaseUser.email || '');
            setState(prev => ({
                ...prev,
                isDemoMode: false,
                user: {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    photoURL: firebaseUser.photoURL,
                    role: isOwnerEmail(email) ? 'admin' : 'user',
                },
                isLoading: false,
            }));

            const unsubscribers: Unsubscribe[] = [];

            if (email) {
                unsubscribers.push(onSnapshot(
                    businessDoc(firestore, 'members', email),
                    (docSnap) => {
                        const memberData = docSnap.exists() ? docSnap.data() : {};
                        setState(prev => ({
                            ...prev,
                            user: prev.user ? {
                                ...prev.user,
                                role: isOwnerEmail(email) ? 'admin' : (memberData.role as 'admin' | 'user') || 'user',
                            } : null,
                        }));
                    },
                    (error) => showSyncFailure('your BESVECA access role', error)
                ));
            }

            unsubscribers.push(onSnapshot(
                query(businessCollection(firestore, 'members'), orderBy('createdAt', 'asc')),
                (snapshot) => {
                    const members = snapshot.docs.map(docSnap => {
                        const data = docSnap.data();
                        return {
                            uid: docSnap.id,
                            email: data.email || docSnap.id,
                            displayName: data.displayName || makeDisplayName(data.email || docSnap.id),
                            photoURL: data.photoURL || null,
                            role: data.role || 'user',
                        } as User;
                    });
                    setState(prev => ({ ...prev, users: mergeOwnerUsers(members) }));
                },
                (error) => showSyncFailure('BESVECA users', error)
            ));

            unsubscribers.push(onSnapshot(
                query(businessCollection(firestore, 'projects'), orderBy('createdAt', 'desc')),
                (snapshot) => {
                    const projects = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Project));
                    setState(prev => ({ ...prev, projects }));
                },
                (error) => showSyncFailure('guests and properties', error)
            ));

            unsubscribers.push(onSnapshot(
                query(businessCollection(firestore, 'logs'), orderBy('createdAt', 'desc')),
                (snapshot) => {
                    const logs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LogItem));
                    setState(prev => ({ ...prev, logs }));
                },
                (error) => showSyncFailure('stays and expenses', error)
            ));

            unsubscribers.push(onSnapshot(
                query(businessCollection(firestore, 'invoices'), orderBy('createdAt', 'desc')),
                (snapshot) => {
                    const invoices = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Invoice));
                    setState(prev => ({ ...prev, invoices }));
                },
                (error) => showSyncFailure('invoices', error)
            ));

            unsubscribers.push(onSnapshot(
                query(businessCollection(firestore, 'backups'), orderBy('createdAt', 'desc')),
                (snapshot) => {
                    const backups = snapshot.docs.map(docSnap => {
                        const data = docSnap.data();
                        return {
                            id: docSnap.id,
                            createdAt: data.createdAt || 0,
                            counts: data.counts || { guests: 0, logs: 0, invoices: 0, members: 0 },
                        };
                    });
                    setState(prev => ({ ...prev, backups }));
                },
                (error) => showSyncFailure('backup history', error)
            ));

            unsubscribeBusinessData = () => {
                unsubscribers.forEach(unsubscribe => unsubscribe());
            };
        }, (error) => {
            console.error('Firebase auth listener failed:', error);
            setState(prev => ({ ...prev, isLoading: false }));
            alert(`Authentication failed: ${getErrorMessage(error)}`);
        });

        return () => {
            clearBusinessSubscriptions();
            unsubscribeAuth();
        };
    }, []);

    const enterDemoMode = () => {
        setState(prev => ({
            ...prev,
            user: {
                uid: 'sample-user',
                email: 'sample@besveca-house.local',
                displayName: 'Sample User',
                photoURL: null,
                role: 'admin',
            },
            users: mergeOwnerUsers([]),
            projects: MOCK_PROJECTS,
            logs: MOCK_LOGS,
            invoices: [],
            backups: [],
            cloudHealth: { status: 'unchecked' },
            isDemoMode: true,
            isLoading: false,
        }));
    };

    const signInWithGoogle = async () => {
        if (!isConfigValid) {
            alert(`Firebase configuration is missing or invalid: ${missingFirebaseEnv.join(', ')}. Cloud accounting is disabled until the environment is fixed.`);
            return;
        }

        if (!auth || !googleProvider) {
            alert('Firebase Auth failed to initialize. Check the Firebase project settings and environment variables.');
            return;
        }

        try {
            googleProvider.setCustomParameters({ prompt: 'select_account' });
            if (shouldUseRedirectSignIn()) {
                await signInWithRedirect(auth, googleProvider);
                return;
            }
            await signInWithPopup(auth, googleProvider);
        } catch (error: unknown) {
            console.error('Detailed Auth Error:', error);
            const code = getErrorCode(error);
            const message = getErrorMessage(error);

            if (code === 'auth/popup-blocked') {
                await signInWithRedirect(auth, googleProvider);
            } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                alert('Google sign-in was closed before it finished. Please try again.');
            } else if (code === 'auth/operation-not-allowed') {
                alert('Google Sign-in is not enabled in Firebase. Enable it in Authentication > Sign-in method.');
            } else if (code === 'auth/unauthorized-domain') {
                alert('This domain is not authorized for Firebase Auth. Add this site in Authentication > Settings > Authorized domains.');
            } else {
                alert(`Authentication error: ${message}`);
            }
        }
    };

    const signOut = async () => {
        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                user: null,
                users: [],
                projects: [],
                logs: [],
                invoices: [],
                backups: [],
                isDemoMode: false,
            }));
            return;
        }

        if (!auth) return;
        await firebaseSignOut(auth);
    };

    const requireSignedInUser = (action: string) => {
        if (!state.user) {
            const message = `Cannot ${action}: sign in with Google first so BESVECA accounting saves to the cloud.`;
            alert(message);
            throw new Error(message);
        }

        return state.user;
    };

    const requireAdmin = (action: string) => {
        const user = requireSignedInUser(action);
        if (user.role !== 'admin' && !isOwnerEmail(user.email)) {
            const message = `Cannot ${action}: only an administrator can manage BESVECA access.`;
            alert(message);
            throw new Error(message);
        }
        return user;
    };

    const performCloudWrite = async <T,>(
        action: string,
        writer: () => Promise<T>
    ): Promise<T> => {
        requireSignedInUser(action);

        try {
            const result = await writer();
            setState(prev => ({
                ...prev,
                cloudHealth: {
                    ...prev.cloudHealth,
                    status: 'healthy',
                    error: undefined,
                    lastConfirmedWriteAt: Date.now(),
                },
            }));
            return result;
        } catch (error: unknown) {
            console.error(`Firestore ${action} failed:`, error);
            const message = describeCloudWriteFailure(action, error);
            setState(prev => ({
                ...prev,
                cloudHealth: {
                    ...prev.cloudHealth,
                    status: 'error',
                    error: message,
                    lastCheckedAt: Date.now(),
                },
            }));
            alert(message);
            throw error;
        }
    };

    const addProject = async (projectData: Omit<Project, 'id' | 'createdAt'>) => {
        const newProject = removeUndefinedFields({ ...projectData, createdAt: Date.now() });

        if (state.isDemoMode) {
            const id = crypto.randomUUID();
            setState(prev => ({ ...prev, projects: [{ ...newProject, id }, ...prev.projects] }));
            return id;
        }

        return performCloudWrite('save guest', async () => {
            const docRef = await runConfirmedFirestoreWrite('save guest', async (firestore) => {
                const projectRef = doc(businessCollection(firestore, 'projects'));
                await setDoc(projectRef, newProject);
                return projectRef;
            });
            return docRef.id;
        });
    };

    const updateProject = async (id: string, updates: Partial<Project>) => {
        const cleanUpdates = removeUndefinedFields(updates);

        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                projects: prev.projects.map(project => project.id === id ? { ...project, ...cleanUpdates } : project),
            }));
            return;
        }

        await performCloudWrite('update guest', () =>
            runConfirmedFirestoreWrite('update guest', firestore =>
                updateDoc(businessDoc(firestore, 'projects', id), cleanUpdates)
            )
        );
    };

    const addLog = async (logData: Omit<LogItem, 'id' | 'createdAt'>) => {
        const newLog = removeUndefinedFields({ ...logData, createdAt: Date.now() });

        if (state.isDemoMode) {
            const id = crypto.randomUUID();
            setState(prev => ({ ...prev, logs: [{ ...newLog, id }, ...prev.logs] }));
            return id;
        }

        return performCloudWrite('save stay or expense', async () => {
            const docRef = await runConfirmedFirestoreWrite('save stay or expense', async (firestore) => {
                const logRef = doc(businessCollection(firestore, 'logs'));
                await setDoc(logRef, newLog);
                return logRef;
            });
            return docRef.id;
        });
    };

    const updateLog = async (id: string, updates: Partial<LogItem>) => {
        const cleanUpdates = removeUndefinedFields(updates);

        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                logs: prev.logs.map(log => log.id === id ? { ...log, ...cleanUpdates } : log),
            }));
            return;
        }

        await performCloudWrite('update stay or expense', () =>
            runConfirmedFirestoreWrite('update stay or expense', firestore =>
                updateDoc(businessDoc(firestore, 'logs', id), cleanUpdates)
            )
        );
    };

    const deleteLog = async (id: string) => {
        if (state.isDemoMode) {
            setState(prev => ({ ...prev, logs: prev.logs.filter(log => log.id !== id) }));
            return;
        }

        await performCloudWrite('delete stay or expense', () =>
            runConfirmedFirestoreWrite('delete stay or expense', firestore =>
                deleteDoc(businessDoc(firestore, 'logs', id))
            )
        );
    };

    const addInvoice = async (invoiceData: Omit<Invoice, 'id' | 'createdAt'>) => {
        const newInvoice = removeUndefinedFields({ ...invoiceData, createdAt: Date.now() });

        if (state.isDemoMode) {
            const id = crypto.randomUUID();
            setState(prev => ({ ...prev, invoices: [{ ...newInvoice, id }, ...prev.invoices] }));
            return id;
        }

        return performCloudWrite('save invoice', async () => {
            const docRef = await runConfirmedFirestoreWrite('save invoice', async (firestore) => {
                const invoiceRef = doc(businessCollection(firestore, 'invoices'));
                await setDoc(invoiceRef, newInvoice);
                return invoiceRef;
            });
            return docRef.id;
        });
    };

    const updateInvoice = async (id: string, updates: Partial<Invoice>) => {
        const cleanUpdates = removeUndefinedFields(updates);

        if (state.isDemoMode) {
            setState(prev => ({
                ...prev,
                invoices: prev.invoices.map(invoice => invoice.id === id ? { ...invoice, ...cleanUpdates } : invoice),
            }));
            return;
        }

        await performCloudWrite('update invoice', () =>
            runConfirmedFirestoreWrite('update invoice', firestore =>
                updateDoc(businessDoc(firestore, 'invoices', id), cleanUpdates)
            )
        );
    };

    const deleteInvoice = async (id: string) => {
        if (state.isDemoMode) {
            setState(prev => ({ ...prev, invoices: prev.invoices.filter(invoice => invoice.id !== id) }));
            return;
        }

        await performCloudWrite('delete invoice', () =>
            runConfirmedFirestoreWrite('delete invoice', firestore =>
                deleteDoc(businessDoc(firestore, 'invoices', id))
            )
        );
    };

    const addUser = async (email: string, role: 'admin' | 'user') => {
        const actor = requireAdmin('grant access');
        const normalizedEmail = normalizeEmail(email);
        const member = removeUndefinedFields({
            uid: normalizedEmail,
            email: normalizedEmail,
            role,
            displayName: makeDisplayName(normalizedEmail),
            photoURL: null,
            createdAt: Date.now(),
            invitedBy: actor.email || actor.uid,
        });

        if (state.isDemoMode) {
            setState(prev => ({ ...prev, users: mergeOwnerUsers([...prev.users, member as User]) }));
            return;
        }

        await performCloudWrite('grant access', () =>
            runConfirmedFirestoreWrite('grant access', firestore =>
                setDoc(businessDoc(firestore, 'members', normalizedEmail), member)
            )
        );
    };

    const deleteUser = async (id: string) => {
        const normalizedEmail = normalizeEmail(id);

        if (isOwnerEmail(normalizedEmail) || normalizeEmail(state.user?.email || '') === normalizedEmail) {
            alert('Owner access cannot be removed from inside the app.');
            return;
        }

        requireAdmin('remove access');

        if (state.isDemoMode) {
            setState(prev => ({ ...prev, users: prev.users.filter(user => normalizeEmail(user.email || user.uid) !== normalizedEmail) }));
            return;
        }

        await performCloudWrite('remove access', () =>
            runConfirmedFirestoreWrite('remove access', firestore =>
                deleteDoc(businessDoc(firestore, 'members', normalizedEmail))
            )
        );
    };

    const runCloudHealthCheck = async () => {
        if (state.isDemoMode) {
            const health: CloudHealth = {
                status: 'healthy',
                lastCheckedAt: Date.now(),
                counts: {
                    guests: state.projects.length,
                    logs: state.logs.length,
                    invoices: state.invoices.length,
                    members: state.users.length,
                },
            };
            setState(prev => ({ ...prev, cloudHealth: health }));
            return health;
        }

        requireSignedInUser('check cloud database');
        setState(prev => ({
            ...prev,
            cloudHealth: { ...prev.cloudHealth, status: 'checking', error: undefined },
        }));

        try {
            const firestore = requireFirestore();
            const [projectsSnap, logsSnap, invoicesSnap, membersSnap] = await Promise.all([
                getDocsFromServer(businessCollection(firestore, 'projects')),
                getDocsFromServer(businessCollection(firestore, 'logs')),
                getDocsFromServer(businessCollection(firestore, 'invoices')),
                getDocsFromServer(businessCollection(firestore, 'members')),
            ]);

            const health: CloudHealth = {
                status: 'healthy',
                lastCheckedAt: Date.now(),
                counts: {
                    guests: projectsSnap.size,
                    logs: logsSnap.size,
                    invoices: invoicesSnap.size,
                    members: mergeOwnerUsers(membersSnap.docs.map(docSnap => ({
                        uid: docSnap.id,
                        ...docSnap.data(),
                    } as User))).length,
                },
            };
            setState(prev => ({ ...prev, cloudHealth: health }));
            return health;
        } catch (error: unknown) {
            console.error('Cloud health check failed:', error);
            const message = describeSyncFailure('BESVECA accounting data', error);
            setState(prev => ({
                ...prev,
                cloudHealth: {
                    ...prev.cloudHealth,
                    status: 'error',
                    error: message,
                    lastCheckedAt: Date.now(),
                },
            }));
            alert(message);
            throw error;
        }
    };

    const createCloudBackup = async () => {
        if (state.isDemoMode) {
            const payload: CloudBackupPayload = {
                id: makeBackupId(),
                schemaVersion: 1,
                businessId: BUSINESS_ID,
                source: 'live-firestore',
                createdAt: Date.now(),
                counts: {
                    guests: state.projects.length,
                    logs: state.logs.length,
                    invoices: state.invoices.length,
                    members: state.users.length,
                },
                data: {
                    guests: state.projects,
                    logs: state.logs,
                    invoices: state.invoices,
                    members: state.users,
                },
            };
            return payload;
        }

        requireSignedInUser('create cloud backup');

        try {
            const firestore = requireFirestore();
            const [projectsSnap, logsSnap, invoicesSnap, membersSnap] = await Promise.all([
                getDocsFromServer(businessCollection(firestore, 'projects')),
                getDocsFromServer(businessCollection(firestore, 'logs')),
                getDocsFromServer(businessCollection(firestore, 'invoices')),
                getDocsFromServer(businessCollection(firestore, 'members')),
            ]);

            const projects = projectsSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Project));
            const logs = logsSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LogItem));
            const invoices = invoicesSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Invoice));
            const members = mergeOwnerUsers(membersSnap.docs.map(docSnap => ({
                uid: docSnap.id,
                ...docSnap.data(),
            } as User)));

            const payload: CloudBackupPayload = {
                id: makeBackupId(),
                schemaVersion: 1,
                businessId: BUSINESS_ID,
                source: 'live-firestore',
                createdAt: Date.now(),
                counts: {
                    guests: projects.length,
                    logs: logs.length,
                    invoices: invoices.length,
                    members: members.length,
                },
                data: {
                    guests: projects,
                    logs,
                    invoices,
                    members,
                },
            };

            await performCloudWrite('create cloud backup', () =>
                runConfirmedFirestoreWrite('create cloud backup', cloudFirestore =>
                    setDoc(businessDoc(cloudFirestore, 'backups', payload.id), payload)
                )
            );

            setState(prev => ({
                ...prev,
                cloudHealth: {
                    status: 'healthy',
                    lastCheckedAt: Date.now(),
                    lastConfirmedWriteAt: Date.now(),
                    counts: payload.counts,
                },
            }));

            return payload;
        } catch (error: unknown) {
            console.error('Cloud backup failed:', error);
            const message = describeCloudWriteFailure('create cloud backup', error);
            setState(prev => ({
                ...prev,
                cloudHealth: {
                    ...prev.cloudHealth,
                    status: 'error',
                    error: message,
                    lastCheckedAt: Date.now(),
                },
            }));
            alert(message);
            throw error;
        }
    };

    const clearCloudError = () => {
        setState(prev => ({
            ...prev,
            cloudHealth: {
                ...prev.cloudHealth,
                status: prev.cloudHealth.status === 'error' ? 'unchecked' : prev.cloudHealth.status,
                error: undefined,
            },
        }));
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
            deleteInvoice,
            runCloudHealthCheck,
            createCloudBackup,
            clearCloudError,
        }}>
            {children}
        </AppContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};

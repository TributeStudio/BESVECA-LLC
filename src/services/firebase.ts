import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import {
    getFirestore,
    initializeFirestore,
    memoryLocalCache,
    waitForPendingWrites,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredFirebaseEnv = {
    VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
    VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    VITE_FIREBASE_STORAGE_BUCKET: firebaseConfig.storageBucket,
    VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
    VITE_FIREBASE_APP_ID: firebaseConfig.appId,
};

export const missingFirebaseEnv = Object.entries(requiredFirebaseEnv)
    .filter(([, value]) => !value || value === 'YOUR_API_KEY')
    .map(([key]) => key);

const isConfigValid = missingFirebaseEnv.length === 0;
const CLOUD_WRITE_TIMEOUT_MS = 15000;

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let googleProvider: GoogleAuthProvider | undefined;

if (isConfigValid) {
    try {
        app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        auth = getAuth(app);

        try {
            db = initializeFirestore(app, { localCache: memoryLocalCache() });
        } catch (error) {
            console.warn('Firestore was already initialized; reusing the existing instance.', error);
            db = getFirestore(app);
        }

        googleProvider = new GoogleAuthProvider();
    } catch (error) {
        console.error('Firebase initialization error:', error);
    }
}

const isBrowserOffline = () =>
    typeof navigator !== 'undefined' &&
    'onLine' in navigator &&
    navigator.onLine === false;

const withTimeout = async <T>(promise: Promise<T>, action: string): Promise<T> => {
    let timeoutId: number | undefined;

    const timeout = new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => {
            reject(new Error(
                `Cloud database did not confirm "${action}" within ${CLOUD_WRITE_TIMEOUT_MS / 1000} seconds. Check your connection before treating this as saved.`
            ));
        }, CLOUD_WRITE_TIMEOUT_MS);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
        }
    }
};

export const requireFirestore = (): Firestore => {
    if (!isConfigValid) {
        throw new Error(`Firebase configuration is missing: ${missingFirebaseEnv.join(', ')}`);
    }

    if (!db) {
        throw new Error('Firestore did not initialize. Check Firebase project settings and environment variables.');
    }

    return db;
};

export const runConfirmedFirestoreWrite = async <T>(
    action: string,
    operation: (firestore: Firestore) => Promise<T>
): Promise<T> => {
    const firestore = requireFirestore();

    if (isBrowserOffline()) {
        throw new Error(`Cannot ${action}: this browser is offline, so the cloud database cannot confirm the save.`);
    }

    const result = await withTimeout(operation(firestore), action);
    await withTimeout(waitForPendingWrites(firestore), `${action} cloud acknowledgement`);
    return result;
};

export { app, auth, db, googleProvider, isConfigValid };

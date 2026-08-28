// Verify service-account auth end to end: mint a custom token (key preferred,
// gcloud fallback), sign in, read live BESVECA collection counts, clean up.
// Run: with-doppler-secrets agent-runtime dev_personal -- node scripts/sa-auth-smoke.mjs
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { deleteUser, getAuth, signInWithCustomToken } from 'firebase/auth';
import { collection, getDocsFromServer, initializeFirestore } from 'firebase/firestore';
import { signCustomToken } from './sa-token.mjs';

const BUSINESS_ID = 'besveca-house';
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envFiles = ['.env.local', '.env.production.local', '.env.production', '.env.vercel'];
const appEnv = envFiles.reduce((merged, envFile) => {
  const filePath = path.join(repoRoot, envFile);
  if (!fs.existsSync(filePath)) return merged;
  return {
    ...merged,
    ...Object.fromEntries(
      fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.match(/^([^#=]+)=(.*)$/))
        .filter(Boolean)
        .map((match) => [match[1].trim(), match[2].trim().replace(/^"|"$/g, '')])
    ),
  };
}, {});

const projectId = appEnv.VITE_FIREBASE_PROJECT_ID;
const tokenSource = process.env.BESVECA_FIREBASE_SA_KEY
  ? 'doppler-key'
  : process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? 'key-file'
    : 'gcloud-fallback';

const app = initializeApp({
  apiKey: appEnv.VITE_FIREBASE_API_KEY,
  authDomain: appEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId,
  storageBucket: appEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: appEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: appEnv.VITE_FIREBASE_APP_ID,
}, `sa-auth-smoke-${Date.now()}`);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

let user;
try {
  const token = await signCustomToken({ projectId, uid: `sa-auth-smoke-${Date.now()}` });
  const credential = await signInWithCustomToken(auth, token);
  user = credential.user;

  const counts = {};
  for (const name of ['projects', 'logs', 'invoices']) {
    const snap = await getDocsFromServer(collection(db, 'businesses', BUSINESS_ID, name));
    counts[name] = snap.size;
  }

  await deleteUser(user);
  user = undefined;
  console.log(JSON.stringify({ auth: 'ok', tokenSource, counts }, null, 2));
} finally {
  if (user) await deleteUser(user).catch(() => {});
  await deleteApp(app).catch(() => {});
}

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase/app';
import { deleteUser, getAuth, signInWithCustomToken } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  setDoc,
  waitForPendingWrites,
} from 'firebase/firestore';

const envFiles = ['.env.local', '.env.production.local', '.env.production', '.env.vercel'];

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^([^#=]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [
        match[1].trim(),
        match[2].trim().replace(/^"|"$/g, ''),
      ])
  );
};

const appEnv = envFiles.reduce(
  (merged, envFile) => ({ ...merged, ...parseEnvFile(path.join(process.cwd(), envFile)) }),
  {}
);

const requiredEnv = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missingEnv = requiredEnv.filter((key) => !appEnv[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing Firebase env: ${missingEnv.join(', ')}`);
}

const projectId = appEnv.VITE_FIREBASE_PROJECT_ID;
const serviceAccount =
  process.env.FIREBASE_SMOKE_SERVICE_ACCOUNT ||
  `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com`;

const getAccessToken = () =>
  execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], { encoding: 'utf8' }).trim();

const signCustomToken = async (uid) => {
  const accessToken = getAccessToken();
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount,
    sub: serviceAccount,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat,
    exp: iat + 3600,
    uid,
    claims: {
      besvecaAdmin: true,
    },
  };

  const response = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signJwt`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-goog-user-project': projectId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
    }
  );
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error?.message || `signJwt failed with ${response.status}`);
  }

  return json.signedJwt;
};

const smokeUid = `codex-besveca-smoke-${Date.now()}`;
const app = initializeApp({
  apiKey: appEnv.VITE_FIREBASE_API_KEY,
  authDomain: appEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId,
  storageBucket: appEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: appEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: appEnv.VITE_FIREBASE_APP_ID,
}, `besveca-firebase-live-smoke-${Date.now()}`);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

let user;
let cleanupRef;

try {
  const customToken = await signCustomToken(smokeUid);
  const credential = await signInWithCustomToken(auth, customToken);
  user = credential.user;

  cleanupRef = doc(db, 'businesses', 'besveca-house', 'projects', 'codex-smoke-project');
  const smokePayload = {
    name: 'Codex Smoke Guest',
    client: 'BESVECA',
    hourlyRate: 0,
    status: 'ACTIVE',
    createdAt: Date.now(),
  };

  await setDoc(cleanupRef, smokePayload);
  await waitForPendingWrites(db);

  const smokeRead = await getDoc(cleanupRef);
  if (!smokeRead.exists() || smokeRead.data().name !== smokePayload.name) {
    throw new Error('Firestore smoke readback failed.');
  }

  let otherBusinessBlocked = false;
  try {
    await getDoc(doc(db, 'businesses', 'not-besveca-house', 'projects', 'codex-smoke-project'));
  } catch (error) {
    otherBusinessBlocked = error?.code === 'permission-denied';
  }

  if (!otherBusinessBlocked) {
    throw new Error('Firestore rules did not block a different business workspace.');
  }

  let tributeWorkspaceBlocked = false;
  try {
    await setDoc(doc(db, 'users', 'not-the-besveca-smoke-user', 'clients', 'codex-smoke-client'), {
      name: 'Codex Cross-App Smoke Test',
      createdAt: Date.now(),
    });
  } catch (error) {
    tributeWorkspaceBlocked = error?.code === 'permission-denied';
  }

  if (!tributeWorkspaceBlocked) {
    await deleteDoc(doc(db, 'users', 'not-the-besveca-smoke-user', 'clients', 'codex-smoke-client')).catch(() => {});
    throw new Error('Firestore rules allowed a BESVECA admin token to write into a Tribute user workspace.');
  }

  await deleteDoc(cleanupRef);
  await waitForPendingWrites(db);
  cleanupRef = undefined;

  await deleteUser(user);
  user = undefined;

  console.log(JSON.stringify({
    firebaseClientAuth: 'ok',
    besvecaBusinessWriteReadDelete: 'ok',
    otherBusinessIsolation: 'ok',
    tributeWorkspaceIsolation: 'ok',
    cleanup: 'deleted smoke document and auth user',
  }, null, 2));
} finally {
  if (cleanupRef) await deleteDoc(cleanupRef).catch(() => {});
  if (user) await deleteUser(user).catch(() => {});
  await deleteApp(app).catch(() => {});
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase/app';
import { deleteUser, getAuth, signInWithCustomToken } from 'firebase/auth';
import {
  collection,
  doc,
  getDocsFromServer,
  initializeFirestore,
  waitForPendingWrites,
  writeBatch,
} from 'firebase/firestore';

const BUSINESS_ID = 'besveca-house';
const PROPERTY_CLIENT = 'BESVECA';
const PROPERTY_NAME = 'BESVECA House';
const envFiles = ['.env.local', '.env.production.local', '.env.production', '.env.vercel'];

const [invoicePdfPath, agreementPdfPath] = process.argv.slice(2);

if (!invoicePdfPath || !agreementPdfPath) {
  throw new Error('Usage: node scripts/import-long-stay-from-pdfs.mjs <invoice.pdf> <agreement.pdf>');
}

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

const requireFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing PDF: ${filePath}`);
  }
};

const extractPdfText = (filePath, outputPath) => {
  execFileSync('pdftotext', ['-layout', filePath, outputPath], { stdio: 'ignore' });
  return fs.readFileSync(outputPath, 'utf8');
};

const parseCurrency = (value) => Number(String(value).replace(/[^0-9.]/g, ''));

const dateToIso = (value) => {
  const date = new Date(`${value} 12:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unable to parse date: ${value}`);
  }
  return date.toISOString().slice(0, 10);
};

const formatDate = (isoDate) => {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
};

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const getNights = (checkIn, checkOut) =>
  Math.max(1, Math.ceil(Math.abs(new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));

const splitIntoThirds = (amount) => {
  const first = Math.round((amount / 3) * 100) / 100;
  const second = first;
  const third = Number((amount - first - second).toFixed(2));
  return [first, second, third];
};

const extractBillTo = (invoiceText) => {
  const lines = invoiceText.split(/\r?\n/);
  const start = lines.findIndex((line) => /Bill To:/i.test(line));
  const end = lines.findIndex((line, index) => index > start && /Rental Details:/i.test(line));
  if (start < 0 || end < 0) return { name: '', address: '' };

  const leftColumn = lines
    .slice(start + 1, end)
    .map((line) => line.slice(0, 44).trim())
    .filter(Boolean);

  const [name = '', ...addressLines] = leftColumn;
  return {
    name,
    address: addressLines.join(', '),
  };
};

const extractData = (invoiceText, agreementText) => {
  const signatureGuests = [...agreementText.matchAll(/^(.+?)\s+\(Guest\s+\d+\)/gmi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const billTo = extractBillTo(invoiceText);
  const guests = signatureGuests.length > 0 ? signatureGuests : [billTo.name].filter(Boolean);
  const guestDisplayName = guests.join(' & ');

  const invoiceNumber = invoiceText.match(/Invoice Number:\s*([^\n]+)/i)?.[1]?.trim();
  const invoiceDateText = invoiceText.match(/Invoice Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
  const rentalPeriod = invoiceText.match(/Rental Period:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+-\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  const totalText = invoiceText.match(/Total Rental Amount:\s*(\$[\d,]+(?:\.\d{2})?)/i)?.[1];
  const payment2DateText = invoiceText.match(/Payment 2:\s*Due\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1] ||
    agreementText.match(/Payment 2.*?due\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];

  if (!guestDisplayName || !invoiceNumber || !invoiceDateText || !rentalPeriod || !totalText || !payment2DateText) {
    throw new Error('Could not extract the required guest, invoice, stay, and payment fields from the PDFs.');
  }

  const invoiceDate = dateToIso(invoiceDateText);
  const checkIn = dateToIso(rentalPeriod[1]);
  const checkOut = dateToIso(rentalPeriod[2]);
  const total = parseCurrency(totalText);
  const [payment1, payment2, payment3] = splitIntoThirds(total);

  return {
    guestDisplayName,
    guestAddress: billTo.address,
    invoiceNumber,
    invoiceDate,
    checkIn,
    checkOut,
    nights: getNights(checkIn, checkOut),
    total,
    payment2Date: dateToIso(payment2DateText),
    paymentSchedule: [
      { id: 'payment-1', label: 'Payment 1 (1/3 due at booking)', date: invoiceDate, amount: payment1 },
      { id: 'payment-2', label: 'Payment 2 (1/3)', date: dateToIso(payment2DateText), amount: payment2 },
      { id: 'payment-3', label: 'Payment 3 (1/3 due on or before check-in)', date: checkIn, amount: payment3 },
    ],
  };
};

const projectIdFor = (data) => `long-stay-${slugify(data.guestDisplayName)}-${data.checkIn}`;
const logIdFor = (projectId, data) => `stay-${projectId}-${data.checkIn}-${data.checkOut}`;
const invoiceIdFor = (data) => `invoice-${slugify(data.invoiceNumber)}`;

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

requireFile(invoicePdfPath);
requireFile(agreementPdfPath);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'besveca-long-stay-'));
const invoiceText = extractPdfText(invoicePdfPath, path.join(tmpDir, 'invoice.txt'));
const agreementText = extractPdfText(agreementPdfPath, path.join(tmpDir, 'agreement.txt'));
const data = extractData(invoiceText, agreementText);

const smokeUid = `codex-besveca-import-${Date.now()}`;
const app = initializeApp({
  apiKey: appEnv.VITE_FIREBASE_API_KEY,
  authDomain: appEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId,
  storageBucket: appEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: appEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: appEnv.VITE_FIREBASE_APP_ID,
}, `besveca-long-stay-import-${Date.now()}`);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const businessCollection = (name) => collection(db, 'businesses', BUSINESS_ID, name);
const businessDoc = (name, id) => doc(db, 'businesses', BUSINESS_ID, name, id);

let user;

try {
  const customToken = await signCustomToken(smokeUid);
  const credential = await signInWithCustomToken(auth, customToken);
  user = credential.user;

  const [projectsSnap, logsSnap, invoicesSnap, membersSnap] = await Promise.all([
    getDocsFromServer(businessCollection('projects')),
    getDocsFromServer(businessCollection('logs')),
    getDocsFromServer(businessCollection('invoices')),
    getDocsFromServer(businessCollection('members')),
  ]);

  const projects = projectsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const logs = logsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const invoices = invoicesSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const members = membersSnap.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));

  const existingProject = projects.find((project) =>
    project.name === data.guestDisplayName && project.client === PROPERTY_CLIENT
  );
  const targetProjectId = existingProject?.id || projectIdFor(data);
  const existingLog = logs.find((log) =>
    log.projectId === targetProjectId &&
    log.type === 'STAY' &&
    log.checkIn === data.checkIn &&
    log.checkOut === data.checkOut
  );
  const targetLogId = existingLog?.id || logIdFor(targetProjectId, data);
  const existingInvoice = invoices.find((invoice) => invoice.invoiceNumber === data.invoiceNumber);
  const targetInvoiceId = existingInvoice?.id || invoiceIdFor(data);

  const writes = [];
  const now = Date.now();

  if (!existingProject) {
    writes.push({
      ref: businessDoc('projects', targetProjectId),
      data: {
        name: data.guestDisplayName,
        client: PROPERTY_CLIENT,
        address: data.guestAddress,
        email: '',
        phone: '',
        hourlyRate: 0,
        status: 'ACTIVE',
        createdAt: now,
      },
    });
  }

  if (!existingLog) {
    writes.push({
      ref: businessDoc('logs', targetLogId),
      data: {
        projectId: targetProjectId,
        client: data.guestDisplayName,
        date: data.invoiceDate,
        description: `${PROPERTY_NAME} long-stay rental agreement`,
        type: 'STAY',
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        cost: data.total,
        cleaningFee: 0,
        cleaningCount: 0,
        poolHeat: 0,
        tax: 0,
        billableAmount: data.total,
        profit: 0,
        createdAt: now,
      },
    });
  }

  if (!existingInvoice) {
    writes.push({
      ref: businessDoc('invoices', targetInvoiceId),
      data: {
        invoiceNumber: data.invoiceNumber,
        clientId: data.guestDisplayName,
        date: data.invoiceDate,
        dueDate: data.invoiceDate,
        terms: 'CUSTOM',
        items: [
          {
            description: `Guest Stay (${data.nights} Nights)`,
            quantity: 1,
            rate: data.total,
            amount: data.total,
            type: 'STAY',
            originalLogId: targetLogId,
            dates: `${formatDate(data.checkIn)} to ${formatDate(data.checkOut)}`,
          },
        ],
        subtotal: data.total,
        discount: 0,
        tax: 0,
        total: data.total,
        status: 'SENT',
        payments: [],
        paymentSchedule: data.paymentSchedule,
        createdAt: now,
      },
    });
  }

  let backupCreated = false;
  if (writes.length > 0) {
    const backupId = `backup-before-long-stay-import-${new Date(now).toISOString().replace(/\D/g, '').slice(0, 14)}`;
    const batch = writeBatch(db);
    batch.set(businessDoc('backups', backupId), {
      id: backupId,
      schemaVersion: 1,
      businessId: BUSINESS_ID,
      source: 'live-firestore',
      createdAt: now,
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
    });
    writes.forEach((write) => batch.set(write.ref, write.data));
    await batch.commit();
    await waitForPendingWrites(db);
    backupCreated = true;
  }

  await deleteUser(user);
  user = undefined;

  console.log(JSON.stringify({
    firebaseClientAuth: 'ok',
    backupCreated,
    guestRecord: existingProject ? 'already-existed' : 'created',
    stayLog: existingLog ? 'already-existed' : 'created',
    invoice: existingInvoice ? 'already-existed' : 'created',
    importedStayNights: data.nights,
    paymentSchedule: 'three-part long-stay schedule',
  }, null, 2));
} finally {
  if (user) await deleteUser(user).catch(() => {});
  await deleteApp(app).catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

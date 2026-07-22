const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
const allowedEmails = (
  process.env.COMPANY_BANK_ALLOWED_EMAILS ||
  process.env.COMPANY_BANK_ALLOWED_EMAIL ||
  ''
)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const allowedUids = (
  process.env.COMPANY_BANK_ALLOWED_UIDS ||
  process.env.FIRESTORE_EXPORT_USER_ID ||
  ''
)
  .split(',')
  .map((uid) => uid.trim())
  .filter(Boolean);

const bankConfig = {
  name: process.env.COMPANY_BANK_NAME || '',
  routing: process.env.COMPANY_BANK_ROUTING || '',
  account: process.env.COMPANY_BANK_ACCOUNT || '',
  beneficiary: process.env.COMPANY_BANK_BENEFICIARY || '',
};

const verifyFirebaseToken = async (idToken) => {
  if (!firebaseApiKey) throw new Error('Firebase API key is not configured.');

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const body = await response.json();
  if (!response.ok || !Array.isArray(body.users) || body.users.length === 0) return false;

  const user = body.users[0];
  const email = (user?.email || '').toLowerCase();
  const uid = user?.localId || '';
  return Boolean((uid && allowedUids.includes(uid)) || (email && allowedEmails.includes(email)));
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const missingFields = Object.entries(bankConfig).filter(([, value]) => !value).map(([key]) => key);
    if (missingFields.length > 0) throw new Error(`Banking configuration is missing: ${missingFields.join(', ')}`);

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
    if (!token || !(await verifyFirebaseToken(token))) {
      res.status(401).json({ error: 'Authorized sign-in required.' });
      return;
    }

    res.status(200).json(bankConfig);
  } catch (error) {
    console.error('Unable to load protected company banking information.', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to load banking information.' });
  }
}

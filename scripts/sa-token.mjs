// Mint a Firebase custom token for BESVECA admin scripts.
//
// Preferred: a service-account key so no interactive gcloud session is needed.
//   - env BESVECA_FIREBASE_SA_KEY holding the key JSON (Doppler: agent-runtime/dev_personal), or
//   - env GOOGLE_APPLICATION_CREDENTIALS pointing at a key file.
// Fallback: `gcloud auth print-access-token` + iamcredentials signJwt (requires a live
// gcloud login, which Workspace session policy expires — the reason the key exists).
import fs from 'node:fs';
import { createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const IDENTITY_TOOLKIT_AUD =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const loadServiceAccountKey = () => {
  if (process.env.BESVECA_FIREBASE_SA_KEY) return JSON.parse(process.env.BESVECA_FIREBASE_SA_KEY);
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath && fs.existsSync(keyPath)) return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return null;
};

const buildPayload = (serviceAccountEmail, uid, claims) => {
  const iat = Math.floor(Date.now() / 1000);
  return {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: IDENTITY_TOOLKIT_AUD,
    iat,
    exp: iat + 3600,
    uid,
    claims,
  };
};

const signWithKey = (key, uid, claims) => {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = buildPayload(key.client_email, uid, claims);
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(key.private_key);
  return `${signingInput}.${b64url(signature)}`;
};

const signWithGcloud = async (projectId, serviceAccountEmail, uid, claims) => {
  const accessToken = execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], {
    encoding: 'utf8',
  }).trim();
  const payload = buildPayload(serviceAccountEmail, uid, claims);
  const response = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signJwt`,
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
  if (!response.ok) throw new Error(json.error?.message || `signJwt failed with ${response.status}`);
  return json.signedJwt;
};

export const signCustomToken = async ({ projectId, uid, claims = { besvecaAdmin: true } }) => {
  const key = loadServiceAccountKey();
  if (key) return signWithKey(key, uid, claims);
  const serviceAccountEmail =
    process.env.FIREBASE_SMOKE_SERVICE_ACCOUNT ||
    `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com`;
  return signWithGcloud(projectId, serviceAccountEmail, uid, claims);
};

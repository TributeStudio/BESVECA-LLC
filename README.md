# BESVECA House Accounting

Accounting workspace for BESVECA, LLC vacation rental operations.

## What It Tracks

- Guests and property records
- Stays, cleaning fees, pool heat, taxes, and reimbursable expenses
- Guest invoices, deposits, payment schedules, and payment status
- Cloud health checks and full JSON backups

## Data Safety

The production app uses Firebase Auth and Firestore. Live accounting data is stored in the shared `besveca-house` business workspace, not in browser local storage.

Real saves wait for cloud acknowledgement before the UI treats them as saved. Sample mode is temporary and is only for looking around.

## Required Environment

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `GEMINI_API_KEY` if server-side statement extraction is enabled. The legacy `VITE_GEMINI_API_KEY` name is still accepted server-side, but new installs should use `GEMINI_API_KEY`.

Do not commit `.env` files or payment details.

## Commands

- `npm run dev`
- `npm run lint`
- `npm run build`

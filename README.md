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

## Business Boundary

BESVECA data must stay under `businesses/besveca-house/*`. The app should not read or write Tribute's `users/{uid}/*` workspace, and the Firestore smoke test checks that a BESVECA admin token cannot write into a Tribute user workspace.

This repo carries the merged Firestore rules for both BESVECA and Tribute because both apps currently use the same Firebase project. Keep the rules merged when deploying from either repo so one app cannot overwrite the other app's security boundary.

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

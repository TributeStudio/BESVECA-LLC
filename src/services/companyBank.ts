import { auth } from './firebase';

export type CompanyBankConfig = {
    name: string;
    routing: string;
    account: string;
    beneficiary: string;
};

export const fetchCompanyBankConfig = async (): Promise<CompanyBankConfig> => {
    const user = auth?.currentUser;
    if (!user) throw new Error('Sign in before loading invoice banking information.');

    const token = await user.getIdToken(true);
    const response = await fetch('/api/company-bank', {
        headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Unable to load invoice banking information.');
    return body as CompanyBankConfig;
};

type GeminiAction = 'processStatement' | 'processFile' | 'draftInvoiceEmail';

const callGemini = async <T,>(action: GeminiAction, payload: Record<string, unknown>): Promise<T> => {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || 'AI request failed.');
    }

    return data.result as T;
};

export const processStatement = async (content: string) =>
    callGemini<Array<{ date: string; description: string; amount: number }>>('processStatement', { content });

export const processFile = async (fileBase64: string, mimeType: string) =>
    callGemini<Array<{ date: string; description: string; amount: number }>>('processFile', { fileBase64, mimeType });

export const draftInvoiceEmail = async (clientName: string, amount: string, projects: string[]) =>
    callGemini<string>('draftInvoiceEmail', { clientName, amount, projects });

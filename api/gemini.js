import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

const getModel = () => {
    if (!API_KEY) {
        throw new Error('Server Gemini key is not configured.');
    }

    return new GoogleGenerativeAI(API_KEY).getGenerativeModel({ model: 'gemini-1.5-flash' });
};

const parseJsonArray = (text) => {
    const jsonMatch = text.match(/\[.*\]/s);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
};

const extractStatementText = async (content) => {
    const model = getModel();
    const result = await model.generateContent(`
Analyze this financial statement text and extract individual expense transactions for vacation rental accounting.
Return only a JSON array of objects with these keys:
- date in YYYY-MM-DD format when possible
- description as the clean merchant or vendor name
- amount as a positive number

Exclude payments, credits, refunds, and balance summaries.

Text:
${content}
`);
    const response = await result.response;
    return parseJsonArray(response.text());
};

const extractStatementFile = async (fileBase64, mimeType) => {
    const model = getModel();
    const result = await model.generateContent([
        `
Analyze this financial statement and extract individual expense transactions for vacation rental accounting.
Return only a JSON array of objects with these keys:
- date in YYYY-MM-DD format when possible
- description as the clean merchant or vendor name
- amount as a positive number

Exclude payments, credits, refunds, and balance summaries.
`,
        {
            inlineData: {
                data: String(fileBase64).split(',')[1],
                mimeType,
            },
        },
    ]);
    const response = await result.response;
    return parseJsonArray(response.text());
};

const draftInvoiceEmail = async (clientName, amount, projects) => {
    const model = getModel();
    const result = await model.generateContent(`
Write a concise, warm, professional invoice notification email.
Business: BESVECA, LLC
Guest: ${clientName}
Amount: ${amount}
Stay or items covered: ${Array.isArray(projects) ? projects.join(', ') : ''}

Do not include bank details. Ask the guest to use the attached invoice and direct payment instructions already provided by BESVECA.
`);
    const response = await result.response;
    return response.text();
};

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).json({ error: 'Method not allowed.' });
    }

    try {
        const { action, content, fileBase64, mimeType, clientName, amount, projects } = request.body || {};

        if (action === 'processStatement') {
            if (!content) return response.status(400).json({ error: 'Statement text is required.' });
            return response.status(200).json({ result: await extractStatementText(content) });
        }

        if (action === 'processFile') {
            if (!fileBase64 || !mimeType) return response.status(400).json({ error: 'File data and MIME type are required.' });
            return response.status(200).json({ result: await extractStatementFile(fileBase64, mimeType) });
        }

        if (action === 'draftInvoiceEmail') {
            if (!clientName || !amount) return response.status(400).json({ error: 'Guest and amount are required.' });
            return response.status(200).json({ result: await draftInvoiceEmail(clientName, amount, projects) });
        }

        return response.status(400).json({ error: 'Unknown AI action.' });
    } catch (error) {
        console.error('Gemini API error:', error);
        return response.status(500).json({ error: error.message || 'AI request failed.' });
    }
}

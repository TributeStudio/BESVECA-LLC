import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

let genAI: any = null;

if (API_KEY && API_KEY !== 'YOUR_API_KEY') {
    genAI = new GoogleGenerativeAI(API_KEY);
}

export const getGeminiModel = () => {
    if (!genAI) return null;
    return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
};

export const processStatement = async (content: string) => {
    const model = getGeminiModel();
    if (!model) throw new Error("Gemini API Key missing");

    const prompt = `
    Analyze this financial statement text and extract all individual expense transactions.
    Return ONLY a JSON array of objects.
    Each object must have these keys:
    - date (in YYYY-MM-DD format if possible, or leave as is)
    - description (clean business name)
    - amount (the numeric value as a number, absolute value)
    
    Exclude payments, credits, or fee refunds.
    
    Text:
    ${content}
  `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\[.*\]/s);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
};

export const processFile = async (fileBase64: string, mimeType: string) => {
    const model = getGeminiModel();
    if (!model) throw new Error("Gemini API Key missing");

    const prompt = `
    Analyze this document (financial statement) and extract all individual expense transactions.
    Return ONLY a JSON array of objects.
    Each object must have these keys:
    - date (in YYYY-MM-DD format)
    - description (clean business name)
    - amount (the numeric value as a number)
    
    Exclude payments, credits, or total balance summaries. Focus on what was purchased.
  `;

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: fileBase64.split(',')[1],
                mimeType: mimeType
            }
        }
    ]);

    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\[.*\]/s);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
};

export const draftInvoiceEmail = async (clientName: string, amount: string, projects: string[]) => {
    const model = getGeminiModel();
    if (!model) throw new Error("Gemini API Key missing");

    const prompt = `
    Write a polite, premium, and professional invoice notification email.
    Agency: Tribute Studio
    Client: ${clientName}
    Amount: ${amount}
    Projects covered: ${projects.join(', ')}
    
    Keep it concise but sophisticated.
  `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
};

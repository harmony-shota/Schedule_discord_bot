import { GoogleGenAI } from '@google/genai';

export class GeminiHandler {
    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('Set GOOGLE_API_KEY (or GEMINI_API_KEY) in .env.');
        }
        this.ai = new GoogleGenAI({ apiKey });
        // モデルは .env で上書き可（例: GEMINI_MODEL=gemini-2.5-flash-lite）
        this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }

    async generateCharacterLine(prompt) {
        try {
            const res = await this.ai.models.generateContent({
                model: this.model,
                contents: prompt, // 文字列でOK（新SDK）
            });
            return (res?.text || '').trim();
        } catch (error) {
            console.error('Gemini error:', error);
            // エラー時は空文字で返す（Embedのdescriptionを未設定にできる）
            return '';
        }
    }
}

/**
 * Gemini APIクライアント
 * - fetch APIでGemini API (gemini-2.5-flash-image) を呼び出し
 * - .envからGOOGLE_API_KEYを読み込み
 * - 画像生成（responseModalities: ['TEXT', 'IMAGE']）
 * - エクスポネンシャルバックオフリトライ（最大3回）
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.5-flash-preview-05-20';

export interface GeminiImageOptions {
  prompt: string;
  width?: number; // default: 1600
  height?: number; // default: 2560
}

export interface GeminiImageResult {
  imageBuffer: Buffer;
  mimeType: string;
}

export class GeminiClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[GeminiClient] GOOGLE_API_KEY が設定されていません');
    }
  }

  /**
   * Gemini APIで画像を生成する。
   * テーマに合った表紙背景画像を生成。
   */
  async generateImage(options: GeminiImageOptions): Promise<GeminiImageResult> {
    const { prompt } = options;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // リトライ時はバックオフ待機
      if (attempt > 0) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        console.warn(
          `[GeminiClient] リトライ (${attempt}/${maxRetries})...`
        );
      }

      try {
        const url = `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Gemini API error ${response.status}: ${errorBody.slice(0, 300)}`
          );
        }

        const data = await response.json();

        // レスポンスから画像データを抽出
        const candidates = data.candidates || [];
        for (const candidate of candidates) {
          const parts = candidate.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData) {
              const { data: base64Data, mimeType } = part.inlineData;
              const imageBuffer = Buffer.from(base64Data, 'base64');
              return { imageBuffer, mimeType: mimeType || 'image/png' };
            }
          }
        }

        throw new Error('Gemini APIレスポンスに画像データが含まれていません');
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          continue;
        }
      }
    }

    throw lastError || new Error('Gemini API call failed after retries');
  }
}

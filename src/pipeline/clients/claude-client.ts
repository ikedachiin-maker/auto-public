/**
 * Claude APIクライアント
 * - Anthropic SDK使用（ストリーミング対応）
 * - エクスポネンシャルバックオフリトライ（1s -> 2s -> 4s、最大3回）
 * - トークン使用量計測
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeCallOptions, ClaudeResponse, TokenUsage } from '../types';

// リトライ対象のHTTPステータスコード
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503];

export class ClaudeClient {
  private client: Anthropic;
  private tokenUsage: TokenUsage = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    callCount: 0,
  };

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Claude APIを呼び出す。ストリーミングで受信し、テキストを結合して返す。
   * エラー時はエクスポネンシャルバックオフで最大3回リトライする。
   */
  async call(options: ClaudeCallOptions): Promise<ClaudeResponse> {
    const {
      prompt,
      systemPrompt,
      maxTokens = 8192,
      temperature,
    } = options;

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // リトライ時はバックオフ待機 (1s -> 2s -> 4s)
        if (attempt > 0) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const messages: Anthropic.MessageParam[] = [
          { role: 'user', content: prompt },
        ];

        const params: Anthropic.MessageCreateParamsStreaming = {
          model: 'claude-sonnet-4-5',
          max_tokens: maxTokens,
          messages,
          stream: true,
        };

        if (systemPrompt) {
          params.system = systemPrompt;
        }

        if (temperature !== undefined) {
          params.temperature = temperature;
        }

        let text = '';
        let inputTokens = 0;
        let outputTokens = 0;

        const stream = this.client.messages.stream(params);

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            text += event.delta.text;
          }
          // メッセージ完了時にトークン数を取得
          if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens;
          }
        }

        // 最終メッセージからトークン情報を取得
        const finalMessage = await stream.finalMessage();
        inputTokens = finalMessage.usage?.input_tokens || 0;
        outputTokens = finalMessage.usage?.output_tokens || outputTokens;

        // トークン使用量を累積
        this.tokenUsage.totalInputTokens += inputTokens;
        this.tokenUsage.totalOutputTokens += outputTokens;
        this.tokenUsage.totalTokens += inputTokens + outputTokens;
        this.tokenUsage.callCount++;

        return {
          text,
          usage: { inputTokens, outputTokens },
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // リトライ対象のステータスコードか確認
        const statusCode = (err as { status?: number }).status;
        if (statusCode && RETRYABLE_STATUS_CODES.includes(statusCode)) {
          if (attempt < maxRetries) {
            console.warn(
              `[ClaudeClient] API error ${statusCode}, retrying (${attempt + 1}/${maxRetries})...`
            );
            continue;
          }
        }

        // リトライ不可能なエラーの場合は即座にスロー
        if (!statusCode || !RETRYABLE_STATUS_CODES.includes(statusCode)) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Claude API call failed after retries');
  }

  /** 累計トークン使用量を取得する */
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }
}

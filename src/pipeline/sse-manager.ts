/**
 * SSEイベント管理
 * ReadableStreamのcontrollerを受け取り、SSEイベントの送信・keepalive・終了を管理する
 */

import type { SSEEvent } from './types';

export class SSEManager {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(controller: ReadableStreamDefaultController) {
    this.controller = controller;
  }

  /** SSEイベントを送信 */
  send(event: SSEEvent): void {
    if (this.closed) return;
    try {
      this.controller.enqueue(
        this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      );
    } catch {
      // controller already closed
    }
  }

  /** keepaliveコメントを送信（接続切れ防止） */
  heartbeat(): void {
    if (this.closed) return;
    try {
      this.controller.enqueue(this.encoder.encode(': keepalive\n\n'));
    } catch {
      // controller already closed
    }
  }

  /** keepaliveインターバルを開始 (10秒間隔) */
  startKeepAlive(): void {
    if (this.keepAliveInterval) return;
    this.keepAliveInterval = setInterval(() => {
      this.heartbeat();
    }, 10000);
  }

  /** keepaliveインターバルを停止 */
  stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /** ストリームを[DONE]で閉じる */
  done(): void {
    if (this.closed) return;
    this.stopKeepAlive();
    try {
      this.controller.enqueue(this.encoder.encode('data: [DONE]\n\n'));
      this.controller.close();
    } catch {
      // controller already closed
    }
    this.closed = true;
  }

  /** エラーイベントを送信してストリームを閉じる */
  error(message: string): void {
    this.send({ step: 'error', status: 'error', message });
    this.done();
  }
}

/**
 * Phase 9: KDPアップロード（既存kdp-upload.jsを呼び出し）
 * - 既存のscripts/kdp-uploader/kdp-upload.jsをchild_processで呼び出し
 * - Vercel環境ではスキップ
 */

import type { SSEManager } from '../sse-manager';
import type { KDPUploadResult } from '../types';

export async function executeKdpUpload(
  sse: SSEManager
): Promise<KDPUploadResult> {
  // Vercel環境ではスキップ
  if (process.env.VERCEL) {
    sse.send({
      step: 'kdp-upload',
      status: 'completed',
      message: 'KDPアップロードスキップ (Vercel環境)',
    });
    return {
      uploaded: false,
      skipped: true,
      reason: 'Vercel環境ではKDPアップロードは実行できません',
    };
  }

  sse.send({
    step: 'kdp-upload',
    status: 'running',
    message: 'KDPアップロード準備中...',
  });

  try {
    // child_processを動的にインポート（Turbopackの静的解析を回避）
    const childProcess = await import(/* webpackIgnore: true */ 'node:child_process');
    const pathModule = await import(/* webpackIgnore: true */ 'node:path');

    const projectRoot = process.cwd();
    const uploaderDir = ['scripts', 'kdp-uploader'];
    const scriptName = 'kdp-upload.js';
    const scriptPath = pathModule.join(projectRoot, ...uploaderDir, scriptName);
    const cwdPath = pathModule.join(projectRoot, ...uploaderDir);

    return await new Promise<KDPUploadResult>((resolve) => {
      const child = childProcess.spawn('node', [scriptPath], {
        cwd: cwdPath,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      const stdoutLines: string[] = [];
      const stderrLines: string[] = [];

      const flushLines = (
        chunk: Buffer,
        buffer: string,
        target: string[],
        prefix = ''
      ): string => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        const rest = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          target.push(line);
          sse.send({
            step: 'kdp-upload',
            status: 'running',
            message: `${prefix}${line}`,
          });
        }

        return rest;
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuffer = flushLines(chunk, stdoutBuffer, stdoutLines);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer = flushLines(chunk, stderrBuffer, stderrLines, '[STDERR] ');
      });

      child.on('error', (error: Error) => {
        const message = `KDPアップロードの起動に失敗しました: ${error.message}`;
        console.warn('[KDP] 起動エラー:', message);
        sse.send({
          step: 'kdp-upload',
          status: 'error',
          message,
        });
        resolve({
          uploaded: false,
          skipped: false,
          reason: message,
        });
      });

      child.on('close', (code: number | null) => {
        if (stdoutBuffer.trim()) {
          stdoutLines.push(stdoutBuffer.trim());
          sse.send({
            step: 'kdp-upload',
            status: 'running',
            message: stdoutBuffer.trim(),
          });
        }

        if (stderrBuffer.trim()) {
          stderrLines.push(stderrBuffer.trim());
          sse.send({
            step: 'kdp-upload',
            status: 'running',
            message: `[STDERR] ${stderrBuffer.trim()}`,
          });
        }

        if (code === 0) {
          sse.send({
            step: 'kdp-upload',
            status: 'completed',
            message: 'KDPアップロード完了 (下書き保存)',
          });
          resolve({
            uploaded: true,
            skipped: false,
          });
          return;
        }

        const reason = summarizeKdpFailure(code, stdoutLines, stderrLines);
        console.warn('[KDP] アップロードエラー:', reason);
        sse.send({
          step: 'kdp-upload',
          status: 'error',
          message: reason,
        });
        resolve({
          uploaded: false,
          skipped: false,
          reason,
        });
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sse.send({
      step: 'kdp-upload',
      status: 'error',
      message: `KDPアップロードスキップ: ${message.slice(0, 200)}`,
    });
    return {
      uploaded: false,
      skipped: true,
      reason: message,
    };
  }
}

function summarizeKdpFailure(
  exitCode: number | null,
  stdoutLines: string[],
  stderrLines: string[]
): string {
  const combined = [...stderrLines, ...stdoutLines].join('\n');

  if (combined.includes('ProcessSingleton') || combined.includes('Singleton')) {
    return 'KDPアップロード失敗: ブラウザプロファイルが使用中です。前回開いたKDPブラウザを閉じてから再実行してください。';
  }

  const lastLine =
    [...stderrLines].reverse().find((line) => line.trim()) ||
    [...stdoutLines].reverse().find((line) => line.trim());

  if (lastLine) {
    return `KDPアップロード失敗: ${lastLine.slice(0, 220)}`;
  }

  return `KDPアップロード失敗: プロセスが異常終了しました (exit code: ${exitCode ?? 'null'})`;
}

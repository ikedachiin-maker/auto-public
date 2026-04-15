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
      childProcess.exec(
        `node "${scriptPath}"`,
        {
          cwd: cwdPath,
          timeout: 300000, // 5分タイムアウト
          env: { ...process.env },
        },
        (error: Error | null, _stdout: string, stderr: string) => {
          if (error) {
            const message = error.message || 'KDPアップロードに失敗しました';
            console.warn('[KDP] アップロードエラー:', message);
            sse.send({
              step: 'kdp-upload',
              status: 'completed',
              message: `KDPアップロード失敗: ${message.slice(0, 200)}`,
            });
            resolve({
              uploaded: false,
              skipped: false,
              reason: message,
            });
            return;
          }

          if (stderr) {
            console.warn('[KDP] stderr:', stderr);
          }

          sse.send({
            step: 'kdp-upload',
            status: 'completed',
            message: 'KDPアップロード完了 (下書き保存)',
          });

          resolve({
            uploaded: true,
            skipped: false,
          });
        }
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sse.send({
      step: 'kdp-upload',
      status: 'completed',
      message: `KDPアップロードスキップ: ${message.slice(0, 200)}`,
    });
    return {
      uploaded: false,
      skipped: true,
      reason: message,
    };
  }
}

import { spawn } from 'node:child_process';

export const dynamic = 'force-dynamic';

export async function POST() {
  const workingDir = process.cwd();

  // スクリプトパスは文字列結合で組み立て（Turbopackの静的モジュール解析を回避）
  const scriptRelative = 'scripts/kdp-uploader/kdp-upload.js';
  const command = `node ${scriptRelative}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendLine = (line: string) => {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      };

      const child = spawn(command, {
        cwd: workingDir,
        env: { ...process.env },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuf = '';
      let stderrBuf = '';

      child.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf-8');
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim() !== '') {
            sendLine(line);
          }
        }
      });

      child.stderr!.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf-8');
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim() !== '') {
            sendLine(`[STDERR] ${line}`);
          }
        }
      });

      child.on('error', (err: Error) => {
        sendLine(`[ERROR] プロセス起動に失敗しました: ${err.message}`);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      });

      child.on('close', (code: number | null) => {
        if (stdoutBuf.trim() !== '') {
          sendLine(stdoutBuf);
        }
        if (stderrBuf.trim() !== '') {
          sendLine(`[STDERR] ${stderrBuf}`);
        }
        sendLine(`[EXIT] プロセス終了 (exit code: ${code ?? 'null'})`);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

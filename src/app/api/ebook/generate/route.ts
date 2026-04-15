/**
 * 電子書籍生成APIエントリーポイント
 * パイプラインオーケストレータを呼び出すだけのスリムなルート
 * SSEストリーミングを維持
 */

import { executePipeline } from '../../../../pipeline/orchestrator';
import type { PipelineConfig } from '../../../../pipeline/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface GenerateRequest {
  theme: string;
  targetAudience: string;
  chapterCount?: number;
  authorName: string;
  price: string;
  lineUrl: string;
}

export async function POST(req: Request): Promise<Response> {
  const body: GenerateRequest = await req.json();

  const config: PipelineConfig = {
    theme: body.theme,
    targetAudience: body.targetAudience,
    chapterCount: body.chapterCount || 7,
    authorName: body.authorName,
    price: body.price,
    lineUrl: body.lineUrl,
  };

  const stream = new ReadableStream({
    async start(controller) {
      await executePipeline(config, controller);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

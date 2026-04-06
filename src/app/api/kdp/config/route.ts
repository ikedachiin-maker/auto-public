import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(
  process.cwd(),
  'scripts/kdp-uploader/book-config.json'
);

export async function GET() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return Response.json(
      { error: `設定ファイルの読み込みに失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const formatted = JSON.stringify(body, null, 2);
    await fs.writeFile(CONFIG_PATH, formatted, 'utf-8');
    return Response.json({ success: true, message: '設定を保存しました' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return Response.json(
      { error: `設定ファイルの保存に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}

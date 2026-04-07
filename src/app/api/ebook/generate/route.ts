import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import epub from 'epub-gen-memory';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface GenerateRequest {
  theme: string;
  targetAudience: string;
  chapterCount: number;
  authorName: string;
  price: string;
  lineUrl: string;
}

interface OutlineChapter {
  number: number;
  title: string;
  points: string[];
}

interface Outline {
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  chapters: OutlineChapter[];
}

function slugify(text: string): string {
  return text
    .replace(/\s+/g, '-')
    .replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef-]/g, '')
    .slice(0, 40);
}

function zeroPad(n: number): string {
  return String(n).padStart(2, '0');
}

async function callClaude(
  client: Anthropic,
  prompt: string,
  systemPrompt?: string,
  maxTokens: number = 8192
): Promise<string> {
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

  let text = '';
  const stream = client.messages.stream(params);
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text;
    }
  }
  return text;
}

export async function POST(req: Request): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const done = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      };

      try {
        const body: GenerateRequest = await req.json();
        const { theme, targetAudience, authorName, price, lineUrl } = body;
        const chapterCount = 7;

        const client = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        const tmpBase = process.env.VERCEL ? '/tmp' : process.cwd();
        const timestamp = new Date()
          .toISOString()
          .replace(/[-T:]/g, '')
          .slice(0, 14)
          .replace(/(\d{8})(\d{6})/, '$1-$2');
        const themeSlug = slugify(theme);
        const runDir = path.join(tmpBase, 'research', 'runs', `${timestamp}__${themeSlug}`);
        const ebookDir = path.join(runDir, 'ebook');
        fs.mkdirSync(ebookDir, { recursive: true });

        // ── Phase 1: リサーチ ──────────────────────────────────────────
        send({ step: 'research', status: 'running', message: 'リサーチ中...' });

        const research = await callClaude(
          client,
          `${theme}について、${targetAudience}向けの電子書籍を書くためのリサーチをしてください。以下を簡潔にまとめてください：
1. 市場動向とトレンド
2. ターゲット読者の主な悩み・ニーズ（5つ）
3. 競合書籍との差別化ポイント
4. 具体的なデータや事例（3〜5つ）`,
          '日本語で回答してください。箇条書きで簡潔にまとめてください。',
          4096
        );

        send({ step: 'research', status: 'completed', message: 'リサーチ完了' });

        // ── Phase 2: アウトライン生成 ───────────────────────────────────
        send({ step: 'outline', status: 'running', message: 'アウトライン生成中...' });

        const outlineRaw = await callClaude(
          client,
          `以下のリサーチ結果を元に、${targetAudience}向けの電子書籍のアウトラインを全${chapterCount}章構成で生成してください。
「はじめに」は不要です。第1章から第${chapterCount}章までの${chapterCount}章のみ生成してください。

リサーチ結果:
${research}

必ず以下のJSON形式のみで出力してください（マークダウンコードブロック不要）:
{
  "title": "魅力的な書籍タイトル",
  "subtitle": "サブタイトル",
  "description": "内容紹介文（300字程度）",
  "keywords": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"],
  "chapters": [
    {"number": 1, "title": "第1章のタイトル", "points": ["ポイント1", "ポイント2", "ポイント3"]},
    {"number": 2, "title": "第2章のタイトル", "points": ["ポイント1", "ポイント2", "ポイント3"]},
    ...（第${chapterCount}章まで）
  ]
}`,
          '必ずJSONのみで返してください。説明文や前置きは不要です。',
          4096
        );

        let outline: Outline;
        try {
          const jsonMatch = outlineRaw.match(/\{[\s\S]*\}/);
          outline = JSON.parse(jsonMatch ? jsonMatch[0] : outlineRaw);
        } catch {
          send({ step: 'error', status: 'error', message: 'アウトラインのJSON解析に失敗しました' });
          done();
          return;
        }

        send({ step: 'outline', status: 'completed', message: `アウトライン生成完了: 「${outline.title}」` });

        // ── Phase 3: 執筆（全章並列生成）─────────────────────────────
        send({ step: 'writing', status: 'running', message: `全${outline.chapters.length}章を並列執筆中...`, chapter: 1, total: outline.chapters.length });

        // SSE keepalive: 接続切れ防止のため10秒ごとにハートビートを送信
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            // controller already closed
          }
        }, 10000);

        let completedCount = 0;
        const chapterResults: { num: number; filePath: string }[] = [];

        const chapterPromises = outline.chapters.map(async (chapter) => {
          const chapterNum = chapter.number;

          const chapterContent = await callClaude(
            client,
            `以下の情報を元に、電子書籍の第${chapterNum}章「${chapter.title}」を執筆してください。

書籍タイトル: ${outline.title}
対象読者: ${targetAudience}
テーマ: ${theme}

この章で扱うポイント:
${chapter.points.map((p) => `- ${p}`).join('\n')}

執筆要件:
- 2000〜2500字程度で書く
- 具体的な数値・事例・実践手順を含める
- 読者が実際に行動できる内容にする
- 見出し（##、###）を効果的に使う
- 箇条書きや表を活用してわかりやすくする
- 日本語で書く

本文のみを出力してください（タイトルや章番号の見出し行は不要です）。`,
            `あなたは${theme}の専門家です。${targetAudience}向けに実践的でわかりやすい文章を書いてください。`,
            8192
          );

          const fileName = `${zeroPad(chapterNum)}_${chapter.title}.md`;
          const filePath = path.join(ebookDir, fileName);

          let fileContent: string;
          if (chapterNum === chapterCount && lineUrl) {
            fileContent = `## 第${chapterNum}章 ${chapter.title}

${chapterContent}

---

### さらに深く学びたいあなたへ

本書でお伝えした内容は、ほんの入り口にすぎません。

実践的なノウハウや最新情報、本書では書ききれなかった具体的な戦略を、LINE公式アカウントで無料配信しています。

**今すぐ下のリンクから友だち追加してください：**

${lineUrl}

LINE登録していただいた方には、本書の内容をさらに深掘りした限定コンテンツをお届けします。あなたの次の一歩を、全力でサポートします。
`;
          } else {
            fileContent = `## 第${chapterNum}章 ${chapter.title}

${chapterContent}
`;
          }

          fs.writeFileSync(filePath, fileContent, 'utf-8');
          chapterResults.push({ num: chapterNum, filePath });

          completedCount++;
          send({
            step: 'writing',
            status: 'running',
            message: `第${chapterNum}章「${chapter.title}」執筆完了（${completedCount}/${outline.chapters.length}）`,
            chapter: completedCount,
            total: outline.chapters.length,
          });
        });

        await Promise.all(chapterPromises);
        clearInterval(keepalive);

        // 章番号順にソート
        chapterResults.sort((a, b) => a.num - b.num);
        const chapterFiles = chapterResults.map((r) => r.filePath);

        send({ step: 'writing', status: 'completed', message: '全章の執筆完了' });

        // ── Phase 4: EPUB生成（epub-gen-memory）─────────────────────────
        send({ step: 'epub', status: 'running', message: 'EPUB生成中...' });

        const epubFileName = `${themeSlug}.epub`;
        const epubPath = path.join(runDir, epubFileName);

        // 各章のHTMLコンテンツを準備
        const epubChapters = chapterFiles.map((fp) => {
          const md = fs.readFileSync(fp, 'utf-8');
          // 簡易Markdown→HTML変換
          const html = md
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
            .replace(/^(?!<[hulo])((?!<div|<p).+)$/gm, '<p>$1</p>')
            .replace(/<p><\/p>/g, '')
            .replace(/\n{2,}/g, '\n');
          const titleMatch = md.match(/^##\s+(.+)$/m);
          return {
            title: titleMatch ? titleMatch[1] : path.basename(fp, '.md'),
            content: html,
          };
        });

        try {
          const epubBuffer = await epub(
            {
              title: outline.title,
              author: authorName,
              description: outline.description || '',
              css: 'body { font-family: sans-serif; line-height: 1.8; } h2 { margin-top: 2em; } h3 { margin-top: 1.5em; } p { margin: 0.8em 0; } ul { margin: 0.5em 0; padding-left: 1.5em; }',
            },
            epubChapters
          );
          fs.writeFileSync(epubPath, epubBuffer);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send({ step: 'error', status: 'error', message: `EPUB生成エラー: ${msg.slice(0, 200)}` });
          done();
          return;
        }

        if (!fs.existsSync(epubPath)) {
          send({ step: 'error', status: 'error', message: 'EPUBファイルが生成されませんでした' });
          done();
          return;
        }

        send({ step: 'epub', status: 'completed', message: 'EPUB生成完了' });

        // ── Phase 5: book-config.json 更新（ローカル環境のみ）─────────
        const projectRoot = process.cwd();
        if (!process.env.VERCEL) {
          try {
            const bookConfigPath = path.join(projectRoot, 'scripts', 'kdp-uploader', 'book-config.json');
            const existingConfig = JSON.parse(fs.readFileSync(bookConfigPath, 'utf-8'));

            const newConfig = {
              ...existingConfig,
              title: outline.title,
              subtitle: outline.subtitle,
              author: authorName,
              description: outline.description,
              keywords: outline.keywords.slice(0, 7),
              manuscriptPath: path.relative(projectRoot, epubPath),
              coverPath: '',
              price,
              royaltyPlan: '70',
              enableDRM: false,
              language: 'ja',
              aiDisclosure: true,
              aiDisclosureText: '本書はAI支援ツール（Claude）を活用して執筆されています。著者が検証・編集を行っています。',
            };

            fs.writeFileSync(bookConfigPath, JSON.stringify(newConfig, null, 2), 'utf-8');
          } catch {
            // Vercel等の読み取り専用環境ではスキップ
          }
        }

        // EPUBファイルをbase64エンコードしてフロントに送信（ダウンロード用）
        const epubBase64 = fs.readFileSync(epubPath).toString('base64');

        send({
          step: 'done',
          status: 'completed',
          message: '電子書籍の生成が完了しました',
          outputDir: runDir,
          epubPath,
          coverPath: '',
          title: outline.title,
          epubBase64,
          epubFileName: epubFileName,
        });

        done();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ step: 'error', status: 'error', message })}\n\n`)
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
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

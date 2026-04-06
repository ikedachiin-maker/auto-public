import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

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
  systemPrompt?: string
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: prompt },
  ];

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    messages,
  };

  if (systemPrompt) {
    params.system = systemPrompt;
  }

  const response = await client.messages.create(params);
  const block = response.content[0];
  if (block.type !== 'text') return '';
  return block.text;
}

function generateCoverSvg(title: string, authorName: string, subtitle: string): string {
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const escapedAuthor = authorName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedSubtitle = subtitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const words = escapedTitle.split(/\s|(?<=[\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f])/);
  const lineLength = 14;
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + word).length > lineLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current += word;
    }
  }
  if (current) lines.push(current);

  const titleLines = lines.slice(0, 4);
  const titleY = 320 - (titleLines.length - 1) * 30;

  const titleSvgLines = titleLines
    .map((line, i) => `<text x="300" y="${titleY + i * 56}" font-size="38" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif">${line}</text>`)
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a365d"/>
      <stop offset="100%" stop-color="#2b6cb0"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#bg)"/>
  <rect x="40" y="40" width="520" height="720" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
  <rect x="0" y="0" width="600" height="8" fill="#f6ad55"/>
  <rect x="0" y="792" width="600" height="8" fill="#f6ad55"/>
  ${titleSvgLines}
  <line x1="60" y1="${titleY + titleLines.length * 56 + 10}" x2="540" y2="${titleY + titleLines.length * 56 + 10}" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
  <text x="300" y="${titleY + titleLines.length * 56 + 50}" font-size="18" fill="rgba(255,255,255,0.85)" text-anchor="middle" font-family="sans-serif">${escapedSubtitle.slice(0, 36)}</text>
  <text x="300" y="740" font-size="20" fill="rgba(255,255,255,0.9)" text-anchor="middle" font-family="sans-serif">${escapedAuthor}</text>
</svg>`;
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

        const projectRoot = process.cwd();
        const timestamp = new Date()
          .toISOString()
          .replace(/[-T:]/g, '')
          .slice(0, 14)
          .replace(/(\d{8})(\d{6})/, '$1-$2');
        const themeSlug = slugify(theme);
        const runDir = path.join(projectRoot, 'research', 'runs', `${timestamp}__${themeSlug}`);
        const ebookDir = path.join(runDir, 'ebook');
        fs.mkdirSync(ebookDir, { recursive: true });

        // ── Phase 1: リサーチ ──────────────────────────────────────────
        send({ step: 'research', status: 'running', message: 'リサーチ中...' });

        const research = await callClaude(
          client,
          `${theme}について、${targetAudience}向けの電子書籍を書くためのリサーチをしてください。市場動向、重要な概念、読者が知りたい情報、具体的なデータや事例を含めて詳しくまとめてください。`,
          '日本語で回答してください。マーケティングや実務に役立つ具体的な情報を中心にまとめてください。'
        );

        send({ step: 'research', status: 'completed', message: 'リサーチ完了' });

        // ── Phase 2: アウトライン生成 ───────────────────────────────────
        send({ step: 'outline', status: 'running', message: 'アウトライン生成中...' });

        const outlineRaw = await callClaude(
          client,
          `以下のリサーチ結果を元に、${targetAudience}向けの電子書籍のアウトラインを${chapterCount}章構成で生成してください。

リサーチ結果:
${research}

必ず以下のJSON形式のみで出力してください（マークダウンコードブロック不要）:
{
  "title": "魅力的な書籍タイトル",
  "subtitle": "サブタイトル",
  "description": "内容紹介文（300字程度）",
  "keywords": ["キーワード1", "キーワード2", "キーワード3", "キーワード4", "キーワード5"],
  "chapters": [
    {"number": 0, "title": "はじめに", "points": ["ポイント1", "ポイント2", "ポイント3"]},
    {"number": 1, "title": "第1章のタイトル", "points": ["ポイント1", "ポイント2", "ポイント3"]},
    ...（${chapterCount}章まで）
  ]
}`,
          '必ずJSONのみで返してください。説明文や前置きは不要です。'
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

        // ── Phase 3: 執筆 ──────────────────────────────────────────────
        send({ step: 'writing', status: 'running', message: '執筆フェーズ開始...', chapter: 0, total: outline.chapters.length });

        const chapterFiles: string[] = [];

        for (const chapter of outline.chapters) {
          const chapterNum = chapter.number;
          const isIntro = chapterNum === 0;

          send({
            step: 'writing',
            status: 'running',
            message: `${isIntro ? 'はじめに' : `第${chapterNum}章「${chapter.title}」`}を執筆中...`,
            chapter: chapterNum,
            total: outline.chapters.length,
          });

          const chapterContent = await callClaude(
            client,
            `以下の情報を元に、電子書籍の${isIntro ? '「はじめに」' : `第${chapterNum}章「${chapter.title}」`}を執筆してください。

書籍タイトル: ${outline.title}
対象読者: ${targetAudience}
テーマ: ${theme}

この章で扱うポイント:
${chapter.points.map((p) => `- ${p}`).join('\n')}

執筆要件:
- 5000〜8000字で書く
- 具体的な数値・事例・実践手順を含める
- 読者が実際に行動できる内容にする
- 見出し（##、###）を効果的に使う
- 箇条書きや表を活用してわかりやすくする
- 日本語で書く

本文のみを出力してください（タイトルや章番号の見出し行は不要です）。`,
            `あなたは${theme}の専門家です。${targetAudience}向けに実践的でわかりやすい文章を書いてください。`
          );

          const fileName = `${zeroPad(chapterNum)}_${isIntro ? 'はじめに' : chapter.title}.md`;
          const filePath = path.join(ebookDir, fileName);

          let fileContent: string;
          if (isIntro) {
            fileContent = `<div class="title-page">
<h1 class="book-title">${outline.title}</h1>
<p class="book-author">${authorName}</p>
<p class="book-subtitle">${outline.subtitle}</p>
</div>

<div style="page-break-before: always;"></div>

## はじめに

${chapterContent}
`;
          } else if (chapterNum === chapterCount && lineUrl) {
            // 最終章にLINE登録CTAを追加
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
          chapterFiles.push(filePath);

          send({
            step: 'writing',
            status: 'running',
            message: `${isIntro ? 'はじめに' : `第${chapterNum}章`}執筆完了`,
            chapter: chapterNum,
            total: outline.chapters.length,
          });
        }

        send({ step: 'writing', status: 'completed', message: '全章の執筆完了' });

        // ── Phase 4: EPUB生成 ──────────────────────────────────────────
        send({ step: 'epub', status: 'running', message: 'EPUB生成中...' });

        // style.css をコピー
        const srcCss = path.join(projectRoot, 'research', 'runs', '20260325-200000__instagram-ebook-system', 'style.css');
        const dstCss = path.join(runDir, 'style.css');
        if (fs.existsSync(srcCss)) {
          fs.copyFileSync(srcCss, dstCss);
        } else {
          fs.writeFileSync(dstCss, 'body { font-family: sans-serif; line-height: 1.8; }', 'utf-8');
        }

        // combined.md を作成
        const combinedParts: string[] = [];
        for (const fp of chapterFiles) {
          combinedParts.push(fs.readFileSync(fp, 'utf-8'));
          combinedParts.push('\n\n');
        }
        const combinedPath = path.join(runDir, 'combined.md');
        fs.writeFileSync(combinedPath, combinedParts.join(''), 'utf-8');

        // cover.png を SVG → PNG 変換で生成
        const coverPath = path.join(runDir, 'cover.png');
        const svgContent = generateCoverSvg(outline.title, authorName, outline.subtitle);
        const svgPath = path.join(runDir, 'cover.svg');
        fs.writeFileSync(svgPath, svgContent, 'utf-8');

        // SVG を PNG に変換（rsvg-convert または ImageMagick を試みる）
        let coverGenerated = false;
        for (const cmd of [
          `rsvg-convert -w 600 -h 800 "${svgPath}" -o "${coverPath}"`,
          `/opt/homebrew/bin/rsvg-convert -w 600 -h 800 "${svgPath}" -o "${coverPath}"`,
          `convert -size 600x800 "${svgPath}" "${coverPath}"`,
          `/opt/homebrew/bin/convert -size 600x800 "${svgPath}" "${coverPath}"`,
        ]) {
          try {
            execSync(cmd, { timeout: 15000 });
            if (fs.existsSync(coverPath)) {
              coverGenerated = true;
              break;
            }
          } catch {
            // 次のコマンドを試す
          }
        }

        if (!coverGenerated) {
          // フォールバック: SVG を PNG の代わりに使用（Pandocはsvgも受け付ける場合がある）
          // または最低限のPNGバイナリを生成
          try {
            // Python で最小PNGを生成
            const pyScript = `
import struct, zlib
w, h = 600, 800
def png_chunk(name, data):
    c = zlib.crc32(name + data) & 0xffffffff
    return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
sig = b'\\x89PNG\\r\\n\\x1a\\n'
ihdr = png_chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
raw = b''
for y in range(h):
    raw += b'\\x00'
    for x in range(w):
        r = int(26 + (43-26)*y/h)
        g = int(54 + (108-54)*y/h)
        b2 = int(93 + (176-93)*y/h)
        raw += bytes([r, g, b2])
comp = zlib.compress(raw, 9)
idat = png_chunk(b'IDAT', comp)
iend = png_chunk(b'IEND', b'')
with open('${coverPath.replace(/\\/g, '\\\\')}', 'wb') as f:
    f.write(sig + ihdr + idat + iend)
print('ok')
`;
            execSync(`python3 -c "${pyScript.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`, { timeout: 15000 });
            coverGenerated = fs.existsSync(coverPath);
          } catch {
            // カバーなしでEPUBを生成
          }
        }

        // Pandoc で EPUB 生成
        const safeTitleForMeta = outline.title.replace(/"/g, '\\"');
        const safeAuthorForMeta = authorName.replace(/"/g, '\\"');
        const epubFileName = `${themeSlug}.epub`;
        const epubPath = path.join(runDir, epubFileName);

        const pandocBase = '/opt/homebrew/bin/pandoc';
        const coverArg = coverGenerated ? `--epub-cover-image="${coverPath}"` : '';
        const cssArg = fs.existsSync(dstCss) ? `--css="${dstCss}"` : '';

        const pandocCmd = [
          pandocBase,
          `"${combinedPath}"`,
          `-o "${epubPath}"`,
          coverArg,
          cssArg,
          `--metadata title="${safeTitleForMeta}"`,
          `--metadata author="${safeAuthorForMeta}"`,
          '--toc',
          '--toc-depth=2',
          '--epub-chapter-level=2',
        ]
          .filter(Boolean)
          .join(' ');

        try {
          execSync(pandocCmd, { timeout: 120000 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send({ step: 'error', status: 'error', message: `Pandocエラー: ${msg.slice(0, 200)}` });
          done();
          return;
        }

        if (!fs.existsSync(epubPath)) {
          send({ step: 'error', status: 'error', message: 'EPUBファイルが生成されませんでした' });
          done();
          return;
        }

        send({ step: 'epub', status: 'completed', message: 'EPUB生成完了' });

        // ── Phase 5: book-config.json 更新 ────────────────────────────
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
          coverPath: coverGenerated ? path.relative(projectRoot, coverPath) : existingConfig.coverPath,
          price,
          royaltyPlan: '70',
          enableDRM: false,
          language: 'ja',
          aiDisclosure: true,
          aiDisclosureText: '本書はAI支援ツール（Claude）を活用して執筆されています。著者が検証・編集を行っています。',
        };

        fs.writeFileSync(bookConfigPath, JSON.stringify(newConfig, null, 2), 'utf-8');

        send({
          step: 'done',
          status: 'completed',
          message: '電子書籍の生成が完了しました',
          outputDir: runDir,
          epubPath: path.relative(projectRoot, epubPath),
          coverPath: coverGenerated ? path.relative(projectRoot, coverPath) : '',
          title: outline.title,
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

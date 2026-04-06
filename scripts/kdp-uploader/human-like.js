/**
 * human-like.js — 人間らしい操作を再現するユーティリティ
 *
 * すべての操作にランダムな「揺らぎ」を加え、
 * Bot検知を回避するための自然な振る舞いを実現する。
 */

/**
 * 正規分布に基づくランダム値を生成（Box-Muller変換）
 * @param {number} mean - 平均値
 * @param {number} stddev - 標準偏差
 * @returns {number}
 */
function gaussianRandom(mean, stddev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.max(0, mean + z * stddev);
}

/**
 * ランダムな待機（正規分布ベース）
 * @param {number} minMs - 最小ミリ秒
 * @param {number} maxMs - 最大ミリ秒
 */
async function humanDelay(minMs = 500, maxMs = 2000) {
  const mean = (minMs + maxMs) / 2;
  const stddev = (maxMs - minMs) / 4;
  const delay = Math.min(maxMs * 1.5, Math.max(minMs, gaussianRandom(mean, stddev)));
  await new Promise((r) => setTimeout(r, delay));
}

/**
 * ページ遷移後の「読んでいる」待機
 */
async function readingPause() {
  await humanDelay(1500, 4000);
}

/**
 * 短い思考時間（次のアクションの前）
 */
async function thinkingPause() {
  await humanDelay(300, 1200);
}

/**
 * 人間らしいタイピング
 * たまにtypo→BackSpaceを挟む
 * @param {import('playwright').Page} page
 * @param {string} selector - 入力先セレクタ
 * @param {string} text - 入力テキスト
 */
async function humanType(page, selector, text) {
  await page.click(selector);
  await thinkingPause();

  for (let i = 0; i < text.length; i++) {
    // 3%の確率でtypoを挟む（日本語入力以外の場合）
    if (Math.random() < 0.03 && /^[a-zA-Z0-9 ]$/.test(text[i])) {
      const typoChar = String.fromCharCode(text.charCodeAt(i) + (Math.random() > 0.5 ? 1 : -1));
      await page.keyboard.type(typoChar, { delay: gaussianRandom(80, 30) });
      await humanDelay(200, 500);
      await page.keyboard.press('Backspace');
      await humanDelay(100, 300);
    }

    // 文字ごとにランダムな速度で入力
    const charDelay = gaussianRandom(100, 40);
    await page.keyboard.type(text[i], { delay: charDelay });

    // 句読点の後は少し長めに待つ
    if ('。、.!？?'.includes(text[i])) {
      await humanDelay(200, 600);
    }
  }
}

/**
 * 人間らしいクリック（要素の中心から少しずらす）
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function humanClick(page, selector) {
  await thinkingPause();

  const element = await page.waitForSelector(selector, { timeout: 15000 });
  const box = await element.boundingBox();

  if (box) {
    // 中心から少しずらした位置をクリック
    const offsetX = (Math.random() - 0.5) * box.width * 0.4;
    const offsetY = (Math.random() - 0.5) * box.height * 0.3;
    await page.mouse.click(
      box.x + box.width / 2 + offsetX,
      box.y + box.height / 2 + offsetY,
    );
  } else {
    await element.click();
  }

  await humanDelay(300, 800);
}

/**
 * 人間らしいスクロール（段階的に、たまに少し戻る）
 * @param {import('playwright').Page} page
 * @param {number} targetY - 目標Y座標（ページ上部からのピクセル）
 */
async function humanScroll(page, targetY) {
  const currentY = await page.evaluate(() => window.scrollY);
  const distance = targetY - currentY;
  const steps = Math.max(3, Math.abs(Math.floor(distance / 200)));

  for (let i = 0; i < steps; i++) {
    const stepSize = distance / steps;
    const jitter = (Math.random() - 0.5) * 50;

    await page.evaluate((y) => window.scrollBy(0, y), stepSize + jitter);
    await humanDelay(100, 300);

    // 15%の確率で少し戻る
    if (Math.random() < 0.15 && i < steps - 1) {
      await page.evaluate((y) => window.scrollBy(0, y), -30 - Math.random() * 40);
      await humanDelay(200, 500);
    }
  }
}

/**
 * 要素が見えるまでスクロール（人間らしく）
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function scrollToElement(page, selector) {
  const element = await page.waitForSelector(selector, { timeout: 15000 });
  const box = await element.boundingBox();
  if (box) {
    await humanScroll(page, box.y - 200);
    await humanDelay(300, 800);
  }
}

/**
 * ファイル選択（input[type=file]へのアップロード）
 * @param {import('playwright').Page} page
 * @param {string} selector - file inputのセレクタ
 * @param {string} filePath - アップロードするファイルのパス
 */
async function humanFileUpload(page, selector, filePath) {
  await thinkingPause();
  const input = await page.waitForSelector(selector, { timeout: 15000 });
  await input.setInputFiles(filePath);
  // ファイル選択後の待機（ファイルダイアログを使った感じ）
  await humanDelay(1500, 3500);
}

/**
 * ランダムな時間帯チェック（深夜は避ける）
 * @returns {boolean} 実行して良い時間帯ならtrue
 */
function isReasonableHour() {
  const hour = new Date().getHours();
  return hour >= 8 && hour <= 23;
}

/**
 * セッション中にランダムな「休憩」を挟む
 * 大きな操作の区切りで使用
 */
async function sessionBreak() {
  // 5〜15秒の休憩（人がコーヒーを飲んだり画面を見たりする時間）
  const breakTime = 5000 + Math.random() * 10000;
  console.log(`  ☕ ${(breakTime / 1000).toFixed(1)}秒の休憩...`);
  await new Promise((r) => setTimeout(r, breakTime));
}

module.exports = {
  gaussianRandom,
  humanDelay,
  readingPause,
  thinkingPause,
  humanType,
  humanClick,
  humanScroll,
  scrollToElement,
  humanFileUpload,
  isReasonableHour,
  sessionBreak,
};

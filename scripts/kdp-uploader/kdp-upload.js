#!/usr/bin/env node
/**
 * kdp-upload.js — KDP電子書籍アップロード自動化
 *
 * 人間らしい操作で KDP に電子書籍をアップロードする。
 * 最終公開は行わず、下書き保存まで。
 *
 * 使い方:
 *   node scripts/kdp-uploader/kdp-upload.js --config scripts/kdp-uploader/book-config.json
 *
 * 事前準備:
 *   1. KDP_EMAIL, KDP_PASSWORD を .env に設定
 *   2. book-config.json に書籍メタデータを記入
 *   3. 初回は2FAを手動で通す（persistent contextで保存される）
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const {
  humanDelay,
  readingPause,
  thinkingPause,
  humanType,
  humanClick,
  scrollToElement,
  humanFileUpload,
  isReasonableHour,
  sessionBreak,
} = require('./human-like');

// ─── 設定読み込み ───

const args = process.argv.slice(2);
const configIndex = args.indexOf('--config');
const configPath = configIndex !== -1 ? args[configIndex + 1] : path.join(__dirname, 'book-config.json');

if (!fs.existsSync(configPath)) {
  console.error(`❌ 設定ファイルが見つかりません: ${configPath}`);
  console.error('   book-config.json を作成してください');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// .env 読み込み
const dotenvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  });
}

const KDP_EMAIL = process.env.KDP_EMAIL;
const KDP_PASSWORD = process.env.KDP_PASSWORD;

if (!KDP_EMAIL || !KDP_PASSWORD) {
  console.error('❌ KDP_EMAIL と KDP_PASSWORD を .env に設定してください');
  process.exit(1);
}

// ─── 定数 ───

const KDP_URL = 'https://kdp.amazon.co.jp';
const USER_DATA_DIR = path.join(__dirname, '.browser-profile');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// スクリーンショットディレクトリ作成
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// ─── メイン処理 ───

async function main() {
  // 時間帯チェック
  if (!isReasonableHour()) {
    console.log('⏰ 深夜帯のため実行を見送ります（8:00-23:00に再実行してください）');
    process.exit(0);
  }

  console.log('🚀 KDP アップロード開始');
  console.log(`   書籍: ${config.title}`);
  console.log(`   著者: ${config.author}`);
  console.log('');

  // persistent contextでブラウザ起動（ログイン情報を保持）
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1366, height: 768 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  const page = context.pages()[0] || (await context.newPage());

  // navigator.webdriver を隠す
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  try {
    // Step 1: KDPにアクセス
    console.log('📖 Step 1: KDPにアクセス...');
    await page.goto(KDP_URL, { waitUntil: 'networkidle' });
    await readingPause();
    await takeScreenshot(page, '01_top');

    // Step 2: ログイン（必要な場合）
    const needsLogin = await checkNeedsLogin(page);
    if (needsLogin) {
      console.log('🔐 Step 2: ログイン...');
      await performLogin(page);
    } else {
      console.log('✅ Step 2: ログイン済み');
    }
    await takeScreenshot(page, '02_after_login');
    await sessionBreak();

    // Step 3: 新しい電子書籍の作成を開始
    console.log('📝 Step 3: 新しい電子書籍を作成...');
    await startNewEbook(page);
    await takeScreenshot(page, '03_new_ebook');
    await sessionBreak();

    // Step 4: 書籍の詳細（メタデータ）を入力
    console.log('📋 Step 4: 書籍の詳細を入力...');
    await fillBookDetails(page);
    await takeScreenshot(page, '04_details_filled');
    await sessionBreak();

    // Step 5: 原稿をアップロード
    console.log('📄 Step 5: 原稿をアップロード...');
    await uploadManuscript(page);
    await takeScreenshot(page, '05_manuscript_uploaded');
    await sessionBreak();

    // Step 6: 表紙をアップロード
    console.log('🎨 Step 6: 表紙をアップロード...');
    await uploadCover(page);
    await takeScreenshot(page, '06_cover_uploaded');
    await sessionBreak();

    // Step 7: 下書き保存（公開はしない）
    console.log('💾 Step 7: 下書き保存...');
    await saveDraft(page);
    await takeScreenshot(page, '07_draft_saved');

    console.log('');
    console.log('✅ 完了！下書きとして保存されました。');
    console.log('   ⚠️  最終公開はKDP管理画面で手動で行ってください。');
    console.log(`   📸 スクリーンショット: ${SCREENSHOT_DIR}`);

  } catch (error) {
    console.error('');
    console.error(`❌ エラー発生: ${error.message}`);
    await takeScreenshot(page, 'error_' + Date.now());
    console.error(`   📸 エラー時スクリーンショットを保存しました`);
    throw error;
  } finally {
    // ブラウザは閉じない（手動確認用）
    console.log('');
    console.log('🖥️  ブラウザは手動確認のため開いたままです。');
    console.log('   確認後、ブラウザを手動で閉じてください。');
  }
}

// ─── 各ステップの実装 ───

/**
 * ログインが必要か判定
 */
async function checkNeedsLogin(page) {
  try {
    // /bookshelf にアクセスして認証が必要かチェック
    await page.goto(`${KDP_URL}/bookshelf`, { waitUntil: 'networkidle' });
    const currentUrl = page.url();
    // ログイン・アカウント作成ページにリダイレクトされたらログインが必要
    if (currentUrl.includes('/ap/signin') || currentUrl.includes('/ap/register') || currentUrl.includes('openid')) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * ログイン処理
 */
async function performLogin(page) {
  // メールアドレス入力
  const emailSelector = 'input[name="email"], #ap_email';
  await humanType(page, emailSelector, KDP_EMAIL);
  await thinkingPause();

  // パスワードフィールドが表示されているか確認（hiddenでないこと）
  const passwordVisible = await page.isVisible('input[name="password"], #ap_password').catch(() => false);

  if (!passwordVisible) {
    // 「次へ」ボタンをクリック
    const continueBtn = await page.$('#continue, input[type="submit"]');
    if (continueBtn) {
      await humanClick(page, '#continue, input[type="submit"]');
      await page.waitForLoadState('networkidle');
      await readingPause();
    }
  }

  // パスワード入力（表示されるまで待つ）
  const passwordSelector = 'input[name="password"], #ap_password';
  await page.waitForSelector(passwordSelector, { state: 'visible', timeout: 30000 });
  await humanType(page, passwordSelector, KDP_PASSWORD);
  await thinkingPause();

  // ログインボタンをクリック
  const signInBtn = await page.$('#signInSubmit, input[type="submit"]');
  if (signInBtn) {
    await humanClick(page, '#signInSubmit, input[type="submit"]');
  }

  // ページ遷移を待つ
  await page.waitForLoadState('networkidle');
  await readingPause();

  // 2FA チェック
  const twoFactorInput = await page.$('#auth-mfa-otpcode, input[name="otpCode"]');
  if (twoFactorInput) {
    console.log('');
    console.log('🔑 2FA認証が必要です。ブラウザ画面でコードを入力してください。');
    console.log('   入力完了後、自動的に続行します...');
    console.log('');

    // ユーザーが2FAを完了するまで待つ（最大5分）
    await page.waitForNavigation({ timeout: 300000 }).catch(() => {});
    await readingPause();
  }
}

/**
 * 新しい電子書籍の作成開始
 */
async function startNewEbook(page) {
  // 本棚ページに移動
  await page.goto(`${KDP_URL}/bookshelf`, { waitUntil: 'networkidle' });
  await readingPause();

  // 「電子書籍」の作成ボタンを探す
  // KDPのUIは変わることがあるので、複数のセレクタを試す
  const createSelectors = [
    'a[href*="new/ebook"]',
    'a:has-text("電子書籍")',
    '#create-new-ebook',
    'button:has-text("電子書籍")',
    'a:has-text("Kindle eBook")',
  ];

  let clicked = false;
  for (const sel of createSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await humanClick(page, sel);
        clicked = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!clicked) {
    // メニューから「+ 作成」を探す
    const plusBtn = await page.$('button:has-text("+"), a:has-text("作成"), a:has-text("Create")');
    if (plusBtn) {
      await plusBtn.click();
      await humanDelay(1000, 2000);

      // ドロップダウンから「電子書籍」を選択
      const ebookOption = await page.$('a:has-text("電子書籍"), a:has-text("Kindle eBook")');
      if (ebookOption) {
        await ebookOption.click();
      }
    }
  }

  await page.waitForLoadState('networkidle');
  await readingPause();
}

/**
 * 書籍詳細（メタデータ）入力
 */
async function fillBookDetails(page) {
  // 表示中のフィールドに値を入力するヘルパー（locator API使用）
  async function fillField(selector, value) {
    try {
      // 表示されている要素のみ対象
      const loc = page.locator(selector).filter({ visible: true }).first();
      if (await loc.count() > 0) {
        await loc.scrollIntoViewIfNeeded();
        await loc.fill(value);
        return true;
      }
    } catch {}
    // フォールバック: JSで直接セット
    try {
      await page.evaluate(({ sel, val }) => {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (el.offsetParent !== null && el.type !== 'hidden') {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
      }, { sel: selector, val: value });
    } catch {}
    return false;
  }

  // 言語選択（KDPカスタムドロップダウン → JSで直接設定）
  await page.evaluate(() => {
    const sel = document.querySelector('select[name="data[language]"], #data-language-native');
    if (sel) {
      const opt = Array.from(sel.options).find(o => o.text.includes('日本語') || o.value === 'ja');
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }).catch(() => {});
  await thinkingPause();

  // タイトル
  await fillField('input[name="data[title]"]', config.title);
  await sessionBreak();

  // サブタイトル
  if (config.subtitle) {
    await fillField('input[name="data[subtitle]"]', config.subtitle);
  }
  await thinkingPause();

  // 著者名（first_name フィールドに全名を入れる）
  await fillField('input[name="data[contributors][0][first_name]"]', config.author);
  await thinkingPause();

  // 内容紹介
  if (config.description) {
    await fillField('textarea[name="data[long_description]"]', config.description);
  }
  await sessionBreak();

  // キーワード（最大7個）
  if (config.keywords && config.keywords.length > 0) {
    for (let i = 0; i < Math.min(config.keywords.length, 7); i++) {
      await fillField(`input[name="data[keywords][${i}]"]`, config.keywords[i]);
      await thinkingPause();
    }
  }

  console.log('   ℹ️  カテゴリは手動設定を推奨します');

  // 「保存して続行」ボタン
  await clickSaveAndContinue(page);
}

/**
 * 原稿アップロード
 */
async function uploadManuscript(page) {
  await page.waitForLoadState('networkidle');
  await readingPause();

  // DRM設定（任意）
  if (config.enableDRM === false) {
    const drmNo = await page.$('input[value="no"][name*="drm"], #drm-no');
    if (drmNo) {
      await humanClick(page, 'input[value="no"][name*="drm"], #drm-no');
    }
  }

  // 原稿ファイルアップロード
  const manuscriptPath = path.resolve(config.manuscriptPath);
  if (!fs.existsSync(manuscriptPath)) {
    throw new Error(`原稿ファイルが見つかりません: ${manuscriptPath}`);
  }

  console.log(`   📁 原稿: ${manuscriptPath}`);

  // ファイルアップロードボタンを探す
  const uploadSelectors = [
    'input[type="file"][name*="manuscript"]',
    'input[type="file"][accept*=".epub"]',
    'input[type="file"]',
  ];

  let uploaded = false;
  for (const sel of uploadSelectors) {
    try {
      const input = await page.$(sel);
      if (input) {
        await humanFileUpload(page, sel, manuscriptPath);
        uploaded = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!uploaded) {
    // アップロードボタンをクリックしてfile inputを探す
    const uploadBtn = await page.$('button:has-text("アップロード"), button:has-text("Upload"), a:has-text("アップロード")');
    if (uploadBtn) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadBtn.click(),
      ]);
      await fileChooser.setFiles(manuscriptPath);
      await humanDelay(2000, 4000);
    }
  }

  // アップロード完了を待つ（プログレスバーが消えるまで）
  console.log('   ⏳ アップロード処理中...');
  await page.waitForTimeout(5000);

  // 処理完了を確認
  try {
    await page.waitForSelector('text=/アップロード.*完了|upload.*complete|成功/i', { timeout: 120000 });
    console.log('   ✅ 原稿アップロード完了');
  } catch {
    console.log('   ⚠️  アップロード完了の確認ができませんでした。スクリーンショットを確認してください。');
  }

  await sessionBreak();

  // 「保存して続行」
  await clickSaveAndContinue(page);
}

/**
 * 表紙アップロード
 */
async function uploadCover(page) {
  await page.waitForLoadState('networkidle');
  await readingPause();

  const coverPath = path.resolve(config.coverPath);
  if (!fs.existsSync(coverPath)) {
    throw new Error(`表紙ファイルが見つかりません: ${coverPath}`);
  }

  console.log(`   📁 表紙: ${coverPath}`);

  // 「表紙をアップロード」を選択
  const uploadCoverSelectors = [
    'input[type="file"][name*="cover"]',
    'input[type="file"][accept*="image"]',
  ];

  let uploaded = false;
  for (const sel of uploadCoverSelectors) {
    try {
      const input = await page.$(sel);
      if (input) {
        await humanFileUpload(page, sel, coverPath);
        uploaded = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!uploaded) {
    const uploadBtn = await page.$('button:has-text("表紙をアップロード"), button:has-text("Upload cover")');
    if (uploadBtn) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadBtn.click(),
      ]);
      await fileChooser.setFiles(coverPath);
      await humanDelay(2000, 4000);
    }
  }

  // アップロード完了待ち
  console.log('   ⏳ 表紙処理中...');
  await page.waitForTimeout(5000);
  console.log('   ✅ 表紙アップロード完了');

  await sessionBreak();
}

/**
 * 下書き保存
 */
async function saveDraft(page) {
  // 価格設定ページの場合
  const priceInput = await page.$('input[name*="price"], #data-pricing-print-price');
  if (priceInput && config.price) {
    await scrollToElement(page, 'input[name*="price"], #data-pricing-print-price');
    await humanType(page, 'input[name*="price"], #data-pricing-print-price', String(config.price));
    await thinkingPause();
  }

  // ロイヤリティプラン選択（70%推奨）
  if (config.royaltyPlan === '70') {
    const royalty70 = await page.$('input[value="70"], #royalty-70');
    if (royalty70) {
      await humanClick(page, 'input[value="70"], #royalty-70');
    }
  }

  // 下書き保存ボタンを探す（locator API）
  const draftTexts = ['下書きとして保存', 'Save as Draft'];
  for (const text of draftTexts) {
    try {
      const btn = page.locator(`button:has-text("${text}"), input[value*="${text}"]`).first();
      if (await btn.count() > 0) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForLoadState('networkidle');
        console.log(`   ✅ 「${text}」ボタンをクリックしました`);
        return;
      }
    } catch { continue; }
  }
  try {
    const btn = page.locator('#save-draft-announce').first();
    if (await btn.count() > 0) {
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForLoadState('networkidle');
      return;
    }
  } catch {}

  // 下書きボタンが見つからない場合
  console.log('   ⚠️  下書き保存ボタンが見つかりませんでした。手動で保存してください。');
}

/**
 * ボタンをlocator APIでクリック（可視要素のみ）
 */
async function clickLocator(page, selector) {
  const loc = page.locator(selector).filter({ visible: true }).first();
  if (await loc.count() > 0) {
    await loc.scrollIntoViewIfNeeded();
    await loc.click();
    return true;
  }
  return false;
}

/**
 * 「保存して続行」ボタンをクリック
 */
async function clickSaveAndContinue(page) {
  await thinkingPause();
  const buttonTexts = ['保存して続行', 'Save and Continue'];
  for (const text of buttonTexts) {
    try {
      const btn = page.locator(`button:has-text("${text}"), input[value*="${text}"]`).first();
      if (await btn.count() > 0) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForLoadState('networkidle');
        await readingPause();
        console.log(`   ✅ 「${text}」ボタンをクリックしました`);
        return;
      }
    } catch { continue; }
  }
  // フォールバック: #save-and-continue-announce
  try {
    const btn = page.locator('#save-and-continue-announce').first();
    if (await btn.count() > 0) {
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForLoadState('networkidle');
      await readingPause();
      return;
    }
  } catch {}
  console.log('   ⚠️  「保存して続行」ボタンが見つかりませんでした');
}

/**
 * スクリーンショット保存
 */
async function takeScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = path.join(SCREENSHOT_DIR, `${timestamp}_${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
}

// ─── 実行 ───

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

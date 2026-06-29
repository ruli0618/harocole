const $ = (id) => document.getElementById(id);
const state = { found: [], scanning: false, extractedUrl: '' };
const RESULTS_KEY = 'orical-web-results-v15-bulk-save';
const HELLOCOLLE_DEFAULT_URL = 'https://helloproject.orical.jp/mypage';
const HELLOCOLLE_URL_KEY = 'orical-hellocolle-open-url';

const SHORTCUT_INSTALL_URL = 'https://www.icloud.com/shortcuts/091e2823ce79478ab485c10dbafd8238'; // 埋め込み済みiCloudショートカット共有リンク
const SHORTCUT_INSTALL_KEY = 'orical-shortcut-install-url';
const shortcutJsCode = `completion((() => {
  const toAbs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return '';
    }
  };

  const urls = [...document.querySelectorAll('video source, video, img, source')]
    .map(el =>
      el.currentSrc ||
      el.src ||
      el.getAttribute('src') ||
      el.getAttribute('data-src') ||
      ''
    )
    .map(toAbs)
    .filter(Boolean)
    .filter(u => /\.(jpg|jpeg|png|webp|gif|mp4|mov)(\?|$)/i.test(u));

  const unique = [...new Set(urls)];

  return unique.length
    ? unique.join('\n')
    : '画像・動画URLが見つかりませんでした。カード詳細を開いた状態で実行してください。';
})());`;
const shortcutSetupText = `【ハロコレURL抽出ショートカット設定】
1. ショートカットアプリで新規ショートカットを作成
2. 「WebページでJavaScriptを実行」を追加
3. 最初から入っているコードを全部消して、下のコードを貼り付け
4. 次に「クリップボードにコピー」を追加
5. 詳細設定で「共有シートに表示」をON
6. 受け入れる入力を「SafariのWebページ」にする
7. ハロコレをSafariで開き、カード詳細を表示した状態で共有ボタンから実行

--- 貼り付けるコード ---
${shortcutJsCode}`;


const LS_KEYS = ['startUrl', 'endUrl', 'memberName', 'folderName'];
const mediaUrlRegex = /https:\/\/cdn\.orical\.jp\/cards\/[^\s"'`<>]+?\/frontimage\/[^\s"'`<>]+?\.(?:mp4|jpg|jpeg|png|webp)(?:\?[^\s"'`<>]*)?/i;
const mediaUrlGlobalRegex = new RegExp(mediaUrlRegex.source, 'ig');
const bookmarkletCode = `javascript:(()=>{let h=document.documentElement.innerHTML.replace(/\\+/g,'');let m=h.match(/https:\/\/cdn\\.orical\\.jp\/cards\/[^\\s"'\`<>]+?\/frontimage\/[^\\s"'\`<>]+?\\.(?:mp4|jpg|jpeg|png|webp)(?:\\?[^\\s"'\`<>]*)?/i);let u=m&&m[0];if(!u){alert('カードURLが見つかりませんでした');return}navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(u).then(()=>alert('カードURLをコピーしました\\n'+u)).catch(()=>prompt('コピーしてください',u)):prompt('コピーしてください',u)})();`;

window.addEventListener('DOMContentLoaded', () => {
  restoreInputs();
  wireEvents();
  restoreAppState();
  registerSW();
});

window.addEventListener('pagehide', () => {
  if (state.found.length) saveAppState();
});
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.found.length) saveAppState();
});
window.addEventListener('pageshow', () => {
  if (!state.found.length) restoreAppState(false);
});

function wireEvents() {
  LS_KEYS.forEach((key) => $(key).addEventListener('input', saveInputs));
  setupHelloOpenControls();
  const pasteStartBtn = $('pasteStartBtn');
  if (pasteStartBtn) pasteStartBtn.addEventListener('click', () => pasteClipboardTo('startUrl'));
  const pasteEndBtn = $('pasteEndBtn');
  if (pasteEndBtn) pasteEndBtn.addEventListener('click', () => pasteClipboardTo('endUrl'));
  const pasteStartScanBtn = $('pasteStartScanBtn');
  if (pasteStartScanBtn) pasteStartScanBtn.addEventListener('click', async () => {
    const ok = await pasteClipboardTo('startUrl', { clearEnd: true, quiet: true });
    if (ok) await scan();
  });
  const pasteBothBtn = $('pasteBothBtn');
  if (pasteBothBtn) pasteBothBtn.addEventListener('click', pasteClipboardSplitStartEnd);
  $('scanBtn').addEventListener('click', scan);
  $('clearBtn').addEventListener('click', clearInputs);
  const swapBtn = $('swapBtn');
  if (swapBtn) swapBtn.addEventListener('click', swapStartEnd);
  $('copyAllBtn').addEventListener('click', copyAll);
  $('shareBtn').addEventListener('click', shareAll);
  $('bulkShareFilesBtn').addEventListener('click', bulkShareFiles);
  $('bulkSaveBtn').addEventListener('click', bulkDownloadFiles);
  $('zipBtn').addEventListener('click', makeZip);
  const copyBookmarkletBtn = $('copyBookmarklet');
  if (copyBookmarkletBtn) copyBookmarkletBtn.addEventListener('click', async () => {
    await copyText(bookmarkletCode);
    toast('抽出ブックマークレットをコピーしました');
  });
  const showBookmarkletBtn = $('showBookmarklet');
  if (showBookmarkletBtn) showBookmarkletBtn.addEventListener('click', () => {
    const area = $('bookmarkletText');
    if (!area) return;
    area.hidden = !area.hidden;
    area.value = bookmarkletCode;
    if (!area.hidden) area.select();
  });
  wireShortcutHelper();

  const extractBtn = $('extractBtn');
  if (extractBtn) extractBtn.addEventListener('click', extractFromText);
  const useAsStartBtn = $('useAsStartBtn');
  if (useAsStartBtn) useAsStartBtn.addEventListener('click', () => useExtractedUrl('startUrl'));
  const useAsEndBtn = $('useAsEndBtn');
  if (useAsEndBtn) useAsEndBtn.addEventListener('click', () => useExtractedUrl('endUrl'));
}



function setupHelloOpenControls() {
  restoreHelloUrlSetting();

  const openHelloLink = $('openHelloLink');
  if (openHelloLink) {
    const saveBeforeOpen = () => {
      updateHelloOpenLink();
      saveInputs();
      if (state.found.length) saveAppState();
      toast('ハロコレを開きます');
    };
    openHelloLink.addEventListener('pointerdown', saveBeforeOpen, { passive: true });
    openHelloLink.addEventListener('click', saveBeforeOpen);
  }

  const copyHelloBtn = $('copyHelloBtn');
  if (copyHelloBtn) copyHelloBtn.addEventListener('click', async () => {
    updateHelloOpenLink();
    await copyText(getEffectiveHelloUrl());
    toast('開くURLをコピーしました');
  });

  const saveHelloUrlBtn = $('saveHelloUrlBtn');
  if (saveHelloUrlBtn) saveHelloUrlBtn.addEventListener('click', saveHelloUrlFromInput);

  const pasteHelloUrlBtn = $('pasteHelloUrlBtn');
  if (pasteHelloUrlBtn) pasteHelloUrlBtn.addEventListener('click', async () => {
    const text = await readClipboardText();
    if (!text.trim()) return;
    const firstUrl = extractFirstUrl(text) || text.trim();
    const input = $('helloUrl');
    if (input) input.value = firstUrl;
    saveHelloUrlFromInput();
  });

  const resetHelloUrlBtn = $('resetHelloUrlBtn');
  if (resetHelloUrlBtn) resetHelloUrlBtn.addEventListener('click', () => {
    localStorage.removeItem(HELLOCOLLE_URL_KEY);
    const input = $('helloUrl');
    if (input) input.value = '';
    updateHelloOpenLink();
    toast('共通マイページURLに戻しました');
  });

  const helloUrlInput = $('helloUrl');
  if (helloUrlInput) helloUrlInput.addEventListener('change', saveHelloUrlFromInput);
}

function restoreHelloUrlSetting() {
  const saved = localStorage.getItem(HELLOCOLLE_URL_KEY) || '';
  const input = $('helloUrl');
  if (input) input.value = saved;
  updateHelloOpenLink();
}

function getEffectiveHelloUrl() {
  const saved = sanitizeHelloUrl(localStorage.getItem(HELLOCOLLE_URL_KEY) || '');
  return saved || HELLOCOLLE_DEFAULT_URL;
}

function saveHelloUrlFromInput() {
  const input = $('helloUrl');
  const raw = (input?.value || '').trim();
  if (!raw) {
    localStorage.removeItem(HELLOCOLLE_URL_KEY);
    updateHelloOpenLink();
    toast('共通マイページURLを使います');
    return;
  }
  const url = sanitizeHelloUrl(raw);
  if (!url) {
    toast('helloproject.orical.jp のURLを入れてください');
    return;
  }
  localStorage.setItem(HELLOCOLLE_URL_KEY, url);
  if (input) input.value = url;
  updateHelloOpenLink();
  toast('ハロコレを開く先を保存しました');
}

function updateHelloOpenLink() {
  const link = $('openHelloLink');
  if (link) link.href = getEffectiveHelloUrl();
}

function sanitizeHelloUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'helloproject.orical.jp') return '';
    return url.href;
  } catch {
    return '';
  }
}

function extractFirstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s"'<>]+/i);
  return match ? cleanUrl(match[0]) : '';
}

function wireShortcutHelper() {
  const copyJsBtn = $('copyShortcutJsBtn');
  if (copyJsBtn) copyJsBtn.addEventListener('click', async () => {
    await copyText(shortcutJsCode);
    toast('ショートカット用コードをコピーしました');
  });

  const openShortcutsAppLink = $('openShortcutsAppLink');
  if (openShortcutsAppLink) openShortcutsAppLink.addEventListener('click', () => {
    toast('ショートカットアプリを開きます');
  });

  const copyStepsBtn = $('copyShortcutStepsBtn');
  if (copyStepsBtn) copyStepsBtn.addEventListener('click', async () => {
    await copyText(shortcutSetupText);
    toast('設定手順をコピーしました');
  });

  const saveLinkBtn = $('saveShortcutLinkBtn');
  if (saveLinkBtn) saveLinkBtn.addEventListener('click', saveShortcutInstallUrl);

  const clearLinkBtn = $('clearShortcutLinkBtn');
  if (clearLinkBtn) clearLinkBtn.addEventListener('click', () => {
    localStorage.removeItem(SHORTCUT_INSTALL_KEY);
    const input = $('shortcutLinkInput');
    if (input) input.value = '';
    updateShortcutInstallUI();
    toast('ショートカットリンク登録を解除しました');
  });

  const input = $('shortcutLinkInput');
  if (input) input.value = getShortcutInstallUrl();
  updateShortcutInstallUI();
}

function getShortcutInstallUrl() {
  return (localStorage.getItem(SHORTCUT_INSTALL_KEY) || SHORTCUT_INSTALL_URL || '').trim();
}

function isShortcutShareUrl(url) {
  return /^https:\/\/www\.icloud\.com\/shortcuts\/[a-z0-9-]+/i.test(url) || /^shortcuts:\/\//i.test(url);
}

function saveShortcutInstallUrl() {
  const input = $('shortcutLinkInput');
  const url = (input?.value || '').trim();
  if (!url) {
    localStorage.removeItem(SHORTCUT_INSTALL_KEY);
    updateShortcutInstallUI();
    toast('空欄なので登録を解除しました');
    return;
  }
  if (!isShortcutShareUrl(url)) {
    toast('iCloudショートカット共有リンクを入れてください');
    return;
  }
  localStorage.setItem(SHORTCUT_INSTALL_KEY, url);
  updateShortcutInstallUI();
  toast('ショートカット追加リンクを登録しました');
}

function updateShortcutInstallUI() {
  const url = getShortcutInstallUrl();
  const area = $('shortcutInstallArea');
  const link = $('installShortcutLink');
  if (!area || !link) return;
  if (url) {
    link.href = url;
    area.hidden = false;
  } else {
    link.href = '#';
    area.hidden = true;
  }
}

function extractAllMediaUrls(text) {
  const cleaned = (text || '').trim().replace(/\\+/g, '').replace(/&amp;/g, '&');
  const matches = cleaned.match(mediaUrlGlobalRegex) || [];
  return [...new Set(matches.map((u) => cleanUrl(u)))];
}
function cleanUrl(url) {
  return String(url || '').trim().replace(/["'<>]+$/g, '');
}
function extractMediaUrl(text) {
  const urls = extractAllMediaUrls(text);
  return urls[0] || (text || '').trim();
}

function extractFromText() {
  const unique = extractAllMediaUrls($('extractText').value || '');
  if (!unique.length) {
    state.extractedUrl = '';
    $('extractResult').hidden = false;
    $('extractResult').textContent = 'frontimage URLが見つかりませんでした。ページのURLではなく、画像/動画URLやHTMLを貼ってください。';
    $('useAsStartBtn').disabled = true;
    $('useAsEndBtn').disabled = true;
    toast('URLが見つかりませんでした');
    return;
  }
  state.extractedUrl = unique[0];
  $('extractResult').hidden = false;
  $('extractResult').innerHTML = unique.map((u, i) => `${i + 1}. ${escapeHtml(u)}`).join('<br>');
  $('useAsStartBtn').disabled = false;
  $('useAsEndBtn').disabled = false;
  copyText(state.extractedUrl).then(() => toast('URLを抽出してコピーしました'));
}
function useExtractedUrl(targetId) {
  if (!state.extractedUrl) return;
  $(targetId).value = state.extractedUrl;
  saveInputs();
  toast(targetId === 'startUrl' ? '開始URLに入れました' : '終了URLに入れました');
}


async function readClipboardText() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) return text;
      toast('クリップボードが空でした');
      return '';
    } catch (e) {
      console.warn('clipboard read failed', e);
    }
  }
  const manual = prompt('クリップボードを自動で読めませんでした。ここにURLを貼り付けてください。');
  return manual || '';
}

async function pasteClipboardTo(targetId, options = {}) {
  const target = $(targetId);
  if (!target) return false;
  const text = await readClipboardText();
  if (!text.trim()) return false;
  target.value = text.trim(); // 既存内容は消して置き換え
  if (options.clearEnd) $('endUrl').value = '';
  saveInputs();
  if (!options.quiet) toast(targetId === 'startUrl' ? '開始URLを貼り付けました' : '終了URLを貼り付けました');
  return true;
}

async function pasteClipboardSplitStartEnd() {
  const text = await readClipboardText();
  const urls = extractAllMediaUrls(text);
  if (urls.length >= 2) {
    $('startUrl').value = urls[0];
    $('endUrl').value = urls[urls.length - 1];
    saveInputs();
    toast('先頭URLを開始、最後のURLを終了に貼り付けました');
    return;
  }
  const cleaned = text.trim();
  const lines = cleaned.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  if (lines.length >= 2) {
    $('startUrl').value = lines[0];
    $('endUrl').value = lines[lines.length - 1];
    saveInputs();
    toast('先頭行を開始、最後の行を終了に貼り付けました');
    return;
  }
  if (cleaned) {
    $('startUrl').value = cleaned;
    $('endUrl').value = '';
    saveInputs();
    toast('1件だけだったので開始URLに貼り付けました');
  }
}


function openHellocolle() {
  // 予備関数。PWAでは window.open が効かないことがあるため、通常はHTMLの<a target="_blank">で開きます。
  saveInputs();
  if (state.found.length) saveAppState();
  window.location.assign(getEffectiveHelloUrl());
}

function restoreInputs() {
  LS_KEYS.forEach((key) => {
    const v = localStorage.getItem(`orical-web-${key}`);
    if (v) $(key).value = v;
  });
}
function saveInputs() {
  LS_KEYS.forEach((key) => localStorage.setItem(`orical-web-${key}`, $(key).value));
  if (state.found.length) saveAppState();
}
function saveAppState() {
  try {
    const payload = {
      found: state.found,
      inputs: Object.fromEntries(LS_KEYS.map((key) => [key, $(key)?.value || ''])),
      scrollY: window.scrollY || 0,
      savedAt: Date.now()
    };
    localStorage.setItem(RESULTS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('state save failed', e);
  }
}
function restoreAppState(showToast = true) {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (payload.inputs) {
      LS_KEYS.forEach((key) => {
        if (payload.inputs[key] && !$(key).value) $(key).value = payload.inputs[key];
      });
    }
    const found = Array.isArray(payload.found) ? payload.found.filter((item) => item && item.url && item.ext) : [];
    if (!found.length) return;
    state.found = found;
    renderResults();
    if (payload.scrollY) setTimeout(() => window.scrollTo(0, payload.scrollY), 60);
    if (showToast) toast('前回の検出結果を復元しました');
  } catch (e) {
    console.warn('state restore failed', e);
  }
}
function clearInputs() {
  LS_KEYS.forEach((key) => {
    $(key).value = '';
    localStorage.removeItem(`orical-web-${key}`);
  });
  state.found = [];
  localStorage.removeItem(RESULTS_KEY);
  renderResults();
  toast('入力と検出結果をクリアしました');
}

function swapStartEnd() {
  const start = $('startUrl');
  const end = $('endUrl');
  if (!start || !end) return;
  const tmp = start.value;
  start.value = end.value;
  end.value = tmp;
  saveInputs();
  toast('開始URLと終了URLを入れ替えました');
}

function parseSingleItem(url, fallbackIndex = 1) {
  const clean = cleanUrl(url);
  const pathOnly = clean.split('?')[0];
  const extMatch = pathOnly.match(/\.(mp4|jpg|jpeg|png|webp)$/i);
  const starMatch = clean.match(/\/star_(\d+)\//i);
  const numMatch = clean.match(/frontimage\/(\d+)(?:_([a-z0-9]+))?((_\d+))?\.(?:mp4|jpg|jpeg|png|webp)/i);
  if (!extMatch) throw new Error('動画/画像URLの拡張子を読み取れませんでした。mp4 / jpg / png / webp のURLを入れてください。');
  const ext = extMatch[1].toLowerCase() === 'jpeg' ? 'jpg' : extMatch[1].toLowerCase();
  const star = starMatch ? Number(starMatch[1]) : 0;
  const num = numMatch ? numMatch[1] : String(fallbackIndex).padStart(3, '0');
  const suffix = numMatch && numMatch[4] ? numMatch[4] : '';
  return { url: clean, star, ext, num, suffix, single: true };
}

function parseInput(rawStart, rawEnd) {
  const startUrls = extractAllMediaUrls(rawStart);
  const endUrls = extractAllMediaUrls(rawEnd);
  const hasEnd = (rawEnd || '').trim().length > 0;

  if (!hasEnd) {
    const urls = startUrls.length ? startUrls : [extractMediaUrl(rawStart)].filter(Boolean);
    if (!urls.length || !urls[0]) throw new Error('URLを入力してください。終了URLは空欄でもOKです。');
    return { mode: 'single', items: urls.map((u, i) => parseSingleItem(u, i + 1)) };
  }

  const startUrl = startUrls[0] || extractMediaUrl(rawStart);
  const endUrl = endUrls[0] || extractMediaUrl(rawEnd);
  const startMatch = startUrl.match(/frontimage\/(\d+)_([a-z0-9]+)/i);
  const endMatch = endUrl.match(/frontimage\/(\d+)/i);
  if (!startMatch || !endMatch) throw new Error('URLの形式が正しくありません。frontimage/数字_コード のURLを入れてください。');

  const startNumStr = startMatch[1];
  const packCode = startMatch[2];
  const startNum = parseInt(startNumStr, 10);
  const endNum = parseInt(endMatch[1], 10);
  if (Number.isNaN(startNum) || Number.isNaN(endNum)) throw new Error('カード番号を読み取れませんでした。');
  if (startNum > endNum) throw new Error('開始番号と終了番号の順序が逆です。入れ替えボタンを押してください。');
  if ((endNum - startNum) > 800) throw new Error('範囲が広すぎます。スマホでは重くなるので800件以内にしてください。');

  const baseBeforeStar = startUrl.split(/\/star_\d+/i)[0];
  return { mode: 'range', startUrl, endUrl, startNumStr, packCode, startNum, endNum, baseBeforeStar };
}

function buildTargets(parsed) {
  const scanPatterns = [
    { star: 1, ext: 'jpg' },
    { star: 2, ext: 'jpg' },
    { star: 3, ext: 'mp4' },
    { star: 4, ext: 'mp4' },
    { star: 5, ext: 'mp4' }
  ];
  const suffixes = ['', '_1', '_2'];
  const groups = [];
  for (let i = parsed.startNum; i <= parsed.endNum; i++) {
    const currentNumStr = String(i).padStart(parsed.startNumStr.length, '0');
    const targets = [];
    scanPatterns.forEach((p) => {
      suffixes.forEach((suffix) => {
        targets.push({
          url: `${parsed.baseBeforeStar}/star_${p.star}/frontimage/${currentNumStr}_${parsed.packCode}${suffix}.${p.ext}`,
          star: p.star,
          ext: p.ext,
          num: currentNumStr,
          suffix
        });
      });
    });
    groups.push({ num: currentNumStr, targets });
  }
  return groups;
}

async function scan() {
  if (state.scanning) return;
  let parsed;
  try {
    parsed = parseInput($('startUrl').value, $('endUrl').value);
  } catch (e) {
    toast(e.message);
    return;
  }

  state.scanning = true;
  state.found = [];
  $('resultCard').hidden = false;
  $('progress').hidden = parsed.mode !== 'range';
  $('scanBtn').disabled = true;
  $('scanBtn').textContent = parsed.mode === 'range' ? '検出中...' : '追加中...';
  renderResults();

  if (parsed.mode === 'single') {
    state.found = parsed.items;
    state.scanning = false;
    $('progress').hidden = true;
    $('scanBtn').disabled = false;
    $('scanBtn').textContent = '候補を検出 / 単体追加';
    renderResults();
    saveAppState();
    toast(`${state.found.length}件を追加しました`);
    return;
  }

  const groups = buildTargets(parsed);
  for (let idx = 0; idx < groups.length; idx++) {
    const group = groups[idx];
    $('summary').textContent = `${idx + 1}/${groups.length} を確認中... 見つかった数: ${state.found.length}`;
    $('progress').value = Math.round(((idx + 1) / groups.length) * 100);

    const checks = group.targets.map((target) => checkMedia(target).then((ok) => ok ? target : null));
    const results = await Promise.all(checks);
    const valid = results.find(Boolean);
    if (valid) {
      state.found.push(valid);
      if (state.found.length <= 12 || state.found.length % 10 === 0) {
        renderResults();
        saveAppState();
      }
    }
    await sleep(35);
  }

  state.scanning = false;
  $('progress').hidden = true;
  $('scanBtn').disabled = false;
  $('scanBtn').textContent = '候補を検出 / 単体追加';
  renderResults();
  saveAppState();
  toast(`${state.found.length}件見つかりました`);
}

function checkMedia(target) {
  const url = `${target.url}?_check=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  if (target.ext === 'mp4') return checkVideo(url);
  return checkImage(url);
}
function checkImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = once(resolve);
    const timer = setTimeout(() => done(false), 8000);
    img.onload = () => { clearTimeout(timer); done(true); };
    img.onerror = () => { clearTimeout(timer); done(false); };
    img.src = url;
  });
}
function checkVideo(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const done = once(resolve);
    const timer = setTimeout(() => done(false), 9000);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => { clearTimeout(timer); done(true); video.removeAttribute('src'); video.load(); };
    video.onerror = () => { clearTimeout(timer); done(false); video.removeAttribute('src'); video.load(); };
    video.src = url;
  });
}
function once(fn) {
  let called = false;
  return (value) => { if (!called) { called = true; fn(value); } };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function filenameFor(item) {
  const rawName = $('memberName').value.trim() || `card_${item.num}`;
  const rawFolder = $('folderName').value.trim();
  const starText = item.star ? `★${item.star}_` : '';
  const safeName = sanitize(`${rawName}_${starText}${item.num}${item.suffix || ''}.${item.ext}`);
  const safeFolder = sanitize(rawFolder);
  return safeFolder ? `${safeFolder}/${safeName}` : safeName;
}
function sanitize(s) {
  return (s || '').replace(/[\\/:*?"<>|]/g, '').trim();
}

function renderResults() {
  const found = state.found;
  $('resultCard').hidden = !state.scanning && found.length === 0;
  $('summary').textContent = state.scanning
    ? $('summary').textContent
    : found.length ? `${found.length}件あります` : 'まだ検出結果はありません';
  $('copyAllBtn').disabled = found.length === 0;
  $('shareBtn').disabled = found.length === 0 || !navigator.share;
  $('bulkShareFilesBtn').disabled = found.length === 0;
  $('bulkSaveBtn').disabled = found.length === 0;
  $('zipBtn').disabled = found.length === 0;

  const html = found.map((item) => {
    const name = filenameFor(item);
    const starLabel = item.star ? `★${item.star}` : '単体';
    const label = `${starLabel} / ${item.ext.toUpperCase()} / ${item.num}${item.suffix || ''}`;
    const isVideo = item.ext === 'mp4' || item.ext === 'mov';
    return `<article class="resultItem">
      <div class="resultTitle"><strong>${escapeHtml(name.split('/').pop())}</strong><span class="badge">${label}</span></div>
      <div class="urlBox">${escapeHtml(item.url)}</div>
      <div class="itemActions">
        <button type="button" data-copy="${encodeURIComponent(item.url)}">コピー</button>
        <button type="button" data-open="${encodeURIComponent(item.url)}">開く</button>
        <button type="button" data-save="${encodeURIComponent(item.url)}" data-filename="${escapeAttr(name.split('/').pop())}" data-ext="${item.ext}">${isVideo ? '動画保存' : '保存'}</button>
        <button type="button" data-sharefile="${encodeURIComponent(item.url)}" data-filename="${escapeAttr(name.split('/').pop())}" data-ext="${item.ext}">共有保存</button>
      </div>
    </article>`;
  }).join('');
  $('results').innerHTML = html;
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await copyText(decodeURIComponent(btn.dataset.copy));
      toast('URLをコピーしました');
    });
  });
  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openMedia(decodeURIComponent(btn.dataset.open));
    });
  });
  document.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await saveOne(decodeURIComponent(btn.dataset.save), btn.dataset.filename || 'orical_card', btn.dataset.ext || '');
    });
  });
  document.querySelectorAll('[data-sharefile]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await shareOneFile(decodeURIComponent(btn.dataset.sharefile), btn.dataset.filename || 'orical_card', btn.dataset.ext || '');
    });
  });
}

function openMedia(url) {
  saveAppState();
  toast('検出結果を保存してから開きます');
  try {
    const w = window.open(url, '_blank', 'noopener');
    if (!w) window.location.href = url;
  } catch (e) {
    window.location.href = url;
  }
}

async function fetchBlob(url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}
function isVideo(extOrName) {
  return /\.(mp4|mov)(?:\?|$)/i.test(extOrName) || /^(mp4|mov)$/i.test(extOrName || '');
}
async function saveOne(url, filename, ext = '') {
  const video = isVideo(ext) || isVideo(filename) || isVideo(url);
  try {
    toast(video ? '動画ファイルを取得中...' : '保存用ファイルを取得中...');
    const rawBlob = await fetchBlob(url);
    const blob = await normalizeBlobForSave(rawBlob, filename, ext);
    if (video) {
      const shared = await shareBlob(blob, filename, true);
      if (shared) return;
      await downloadBlob(blob, filename);
      toast('保存を開始しました。保存にならない場合は「共有保存」を使ってください');
      return;
    }
    await downloadBlob(blob, filename);
    toast('保存を開始しました');
  } catch (e) {
    await copyText(url);
    if (video) {
      toast('動画を直接保存できませんでした。URLをコピーしました');
    } else {
      toast('直接保存できませんでした。URLをコピーしました');
    }
  }
}
async function shareOneFile(url, filename, ext = '') {
  try {
    toast('共有用ファイルを取得中...');
    const rawBlob = await fetchBlob(url);
    const blob = await normalizeBlobForSave(rawBlob, filename, ext);
    const shared = await shareBlob(blob, filename, false);
    if (!shared) {
      await copyText(url);
      toast('共有保存に非対応だったためURLをコピーしました');
    }
  } catch (e) {
    await copyText(url);
    toast('共有保存できませんでした。URLをコピーしました');
  }
}
async function shareBlob(blob, filename, preferVideoMessage) {
  const type = blob.type || guessMime(filename);
  const file = makeCurrentFile(blob, filename);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename, text: preferVideoMessage ? '保存先で「ビデオを保存」または「ファイルに保存」を選んでください。' : undefined });
    toast(preferVideoMessage ? '共有シートを開きました' : '共有を開きました');
    return true;
  }
  return false;
}
function makeCurrentFile(blob, filename) {
  const type = blob.type || guessMime(filename);
  return new File([blob], filename, { type, lastModified: Date.now() });
}
async function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  const file = blob instanceof File ? blob : makeCurrentFile(blob, filename);
  const objectUrl = URL.createObjectURL(file);
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}
function guessMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}


async function normalizeBlobForSave(blob, filename, ext = '') {
  const video = isVideo(ext) || isVideo(filename);
  if (!video) return makeCurrentFile(blob, filename);
  const patched = await rewriteMp4DatesToNow(blob, filename).catch((e) => {
    console.warn('MP4 date patch failed:', e);
    return blob;
  });
  return makeCurrentFile(patched, filename);
}

async function rewriteMp4DatesToNow(blob, filename = '') {
  if (!/mp4$/i.test(filename) && !/^video\/mp4/i.test(blob.type || '')) return blob;
  const buf = await blob.arrayBuffer();
  const data = new Uint8Array(buf);
  const view = new DataView(buf);
  const now = Math.floor(Date.now() / 1000) + 2082844800; // Unix epoch -> QuickTime epoch
  let patched = 0;

  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'meta', 'ilst']);
  const dateBoxes = new Set(['mvhd', 'tkhd', 'mdhd']);

  function readType(pos) {
    return String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
  }
  function getBoxSize(pos, end) {
    if (pos + 8 > end) return null;
    let size = view.getUint32(pos);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) return null;
      const high = view.getUint32(pos + 8);
      const low = view.getUint32(pos + 12);
      size = high * 4294967296 + low;
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (!Number.isFinite(size) || size < header || pos + size > end) return null;
    return { size, header };
  }
  function setUint64(pos, value) {
    const high = Math.floor(value / 4294967296);
    const low = value >>> 0;
    view.setUint32(pos, high);
    view.setUint32(pos + 4, low);
  }
  function patchDateBox(pos, header) {
    if (pos + header + 20 > data.length) return;
    const version = view.getUint8(pos + header);
    const base = pos + header + 4;
    if (version === 1) {
      if (base + 16 <= data.length) {
        setUint64(base, now);
        setUint64(base + 8, now);
        patched += 2;
      }
    } else {
      if (base + 8 <= data.length && now <= 0xffffffff) {
        view.setUint32(base, now);
        view.setUint32(base + 4, now);
        patched += 2;
      }
    }
  }
  function walk(start, end) {
    let pos = start;
    while (pos + 8 <= end) {
      const info = getBoxSize(pos, end);
      if (!info) break;
      const type = readType(pos + 4);
      if (dateBoxes.has(type)) {
        patchDateBox(pos, info.header);
      }
      if (containers.has(type)) {
        let childStart = pos + info.header;
        if (type === 'meta') childStart += 4; // skip version/flags
        if (childStart < pos + info.size) walk(childStart, pos + info.size);
      }
      pos += info.size;
    }
  }

  walk(0, data.length);
  if (!patched) return blob;
  return new Blob([data], { type: blob.type || 'video/mp4' });
}


function basenameFor(item) {
  return filenameFor(item).split('/').pop() || `orical_card.${item.ext || 'jpg'}`;
}

function setBulkButtonsBusy(busy, mainLabel = '複数一括保存', saveLabel = '個別保存を連続実行') {
  const bulkShareBtn = $('bulkShareFilesBtn');
  const bulkSaveBtn = $('bulkSaveBtn');
  const zipBtn = $('zipBtn');
  const scanBtn = $('scanBtn');
  [bulkShareBtn, bulkSaveBtn, zipBtn, scanBtn].forEach((btn) => { if (btn) btn.disabled = busy || (btn !== scanBtn && state.found.length === 0); });
  if (bulkShareBtn) bulkShareBtn.textContent = busy ? mainLabel : '複数一括保存';
  if (bulkSaveBtn) bulkSaveBtn.textContent = busy ? saveLabel : '個別保存を連続実行';
}

async function buildFilesForBulkSave() {
  const files = [];
  let ok = 0;
  let ng = 0;
  for (let i = 0; i < state.found.length; i++) {
    const item = state.found[i];
    const filename = basenameFor(item);
    $('summary').textContent = `一括保存用に取得中 ${i + 1}/${state.found.length}...`;
    try {
      const rawBlob = await fetchBlob(item.url);
      const normalized = await normalizeBlobForSave(rawBlob, filename, item.ext);
      const file = normalized instanceof File
        ? new File([normalized], filename, { type: normalized.type || guessMime(filename), lastModified: Date.now() })
        : makeCurrentFile(normalized, filename);
      files.push(file);
      ok++;
    } catch (e) {
      console.warn('bulk file fetch failed', item.url, e);
      ng++;
    }
    await sleep(80);
  }
  $('summary').textContent = `${state.found.length}件あります`;
  return { files, ok, ng };
}

async function bulkShareFiles() {
  if (!state.found.length) return;
  if (!navigator.share || !navigator.canShare) {
    toast('このブラウザは複数ファイル共有に対応していません。ZIP作成を使ってください。');
    return;
  }
  setBulkButtonsBusy(true, '一括取得中...');
  try {
    const { files, ok, ng } = await buildFilesForBulkSave();
    if (!files.length) {
      toast('一括保存用ファイルを取得できませんでした');
      return;
    }
    if (!navigator.canShare({ files })) {
      toast('件数または容量が大きくて一括共有できません。件数を減らすかZIP作成を使ってください。');
      return;
    }
    await navigator.share({
      files,
      title: 'ハロコレ保存',
      text: '保存先で「ビデオを保存」または「ファイルに保存」を選んでください。'
    });
    toast(`共有シートを開きました / 成功${ok}件${ng ? `・失敗${ng}件` : ''}`);
  } catch (e) {
    console.warn('bulk share failed', e);
    toast('一括保存を開けませんでした。件数を減らすかZIP作成を使ってください。');
  } finally {
    setBulkButtonsBusy(false);
    $('summary').textContent = `${state.found.length}件あります`;
  }
}

async function bulkDownloadFiles() {
  if (!state.found.length) return;
  setBulkButtonsBusy(true, '取得中...', '連続保存中...');
  let ok = 0;
  let ng = 0;
  try {
    for (let i = 0; i < state.found.length; i++) {
      const item = state.found[i];
      const filename = basenameFor(item);
      $('summary').textContent = `個別保存を実行中 ${i + 1}/${state.found.length}...`;
      try {
        const rawBlob = await fetchBlob(item.url);
        const blob = await normalizeBlobForSave(rawBlob, filename, item.ext);
        await downloadBlob(blob, filename);
        ok++;
        await sleep(650);
      } catch (e) {
        console.warn('bulk download failed', item.url, e);
        ng++;
      }
    }
    toast(`個別保存を実行しました / 成功${ok}件${ng ? `・失敗${ng}件` : ''}`);
  } finally {
    setBulkButtonsBusy(false);
    $('summary').textContent = `${state.found.length}件あります`;
  }
}

async function copyAll() {
  const text = state.found.map((item) => item.url).join('\n');
  await copyText(text);
  toast('URL一覧をコピーしました');
}
async function shareAll() {
  const text = state.found.map((item) => item.url).join('\n');
  try {
    await navigator.share({ title: 'ハロコレURL一覧', text });
  } catch (e) {}
}
async function makeZip() {
  if (!window.JSZip) {
    toast('ZIP機能の読み込みに失敗しました。URL一覧コピーを使ってください。');
    return;
  }
  const zipBtn = $('zipBtn');
  zipBtn.disabled = true;
  zipBtn.textContent = 'ZIP作成中...';
  const zip = new JSZip();
  let ok = 0;
  let ng = 0;
  for (let i = 0; i < state.found.length; i++) {
    const item = state.found[i];
    $('summary').textContent = `ZIP用に取得中 ${i + 1}/${state.found.length}...`;
    try {
      const rawBlob = await fetchBlob(item.url);
      const name = filenameFor(item);
      const blob = await normalizeBlobForSave(rawBlob, name, item.ext);
      zip.file(name, blob, { date: new Date() });
      ok++;
    } catch (e) {
      ng++;
      console.warn('ZIP fetch failed:', item.url, e);
    }
  }
  if (!ok) {
    toast('ZIP化できませんでした。CDN側の制限があるため、URL一覧コピーを使ってください。');
  } else {
    const blob = await zip.generateAsync({ type: 'blob' });
    await downloadBlob(blob, `${sanitize($('folderName').value.trim()) || 'orical_cards'}.zip`);
    toast(`ZIPを作成しました / 成功${ok}件${ng ? `・失敗${ng}件` : ''}`);
  }
  $('summary').textContent = `${state.found.length}件あります`;
  zipBtn.disabled = false;
  zipBtn.textContent = 'ZIP作成';
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}
function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3000);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').then((reg) => {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.update().catch(() => {});
    }).catch(() => {});
  }
}

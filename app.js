const $ = (id) => document.getElementById(id);
const state = { found: [], scanning: false };

const LS_KEYS = ['startUrl', 'endUrl', 'memberName', 'folderName'];
const mediaUrlRegex = /https:\/\/cdn\.orical\.jp\/cards\/[^\s"'`<>]+?\/frontimage\/[^\s"'`<>]+?\.(?:mp4|jpg|jpeg|png|webp)/i;
const bookmarkletCode = `javascript:(()=>{let h=document.documentElement.innerHTML.replace(/\\+/g,'');let m=h.match(/https:\/\/cdn\\.orical\\.jp\/cards\/[^\\s\"'\`<>]+?\/frontimage\/[^\\s\"'\`<>]+?\\.(?:mp4|jpg|jpeg|png|webp)/i);let u=m&&m[0];if(!u){alert('カードURLが見つかりませんでした');return}navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(u).then(()=>alert('カードURLをコピーしました\n'+u)).catch(()=>prompt('コピーしてください',u)):prompt('コピーしてください',u)})();`;

window.addEventListener('DOMContentLoaded', () => {
  restoreInputs();
  registerSW();
  wireEvents();
});

function wireEvents() {
  LS_KEYS.forEach((key) => $(key).addEventListener('input', saveInputs));
  $('scanBtn').addEventListener('click', scan);
  $('clearBtn').addEventListener('click', clearInputs);
  $('copyAllBtn').addEventListener('click', copyAll);
  $('shareBtn').addEventListener('click', shareAll);
  $('zipBtn').addEventListener('click', makeZip);
  $('copyBookmarklet').addEventListener('click', async () => {
    await copyText(bookmarkletCode);
    toast('抽出ブックマークレットをコピーしました');
  });
  $('showBookmarklet').addEventListener('click', () => {
    const area = $('bookmarkletText');
    area.hidden = !area.hidden;
    area.value = bookmarkletCode;
    if (!area.hidden) area.select();
  });
}

function restoreInputs() {
  LS_KEYS.forEach((key) => {
    const v = localStorage.getItem(`orical-web-${key}`);
    if (v) $(key).value = v;
  });
}
function saveInputs() {
  LS_KEYS.forEach((key) => localStorage.setItem(`orical-web-${key}`, $(key).value));
}
function clearInputs() {
  LS_KEYS.forEach((key) => {
    $(key).value = '';
    localStorage.removeItem(`orical-web-${key}`);
  });
  state.found = [];
  renderResults();
  toast('入力をクリアしました');
}

function extractMediaUrl(text) {
  const cleaned = (text || '').trim().replace(/\\+/g, '');
  const match = cleaned.match(mediaUrlRegex);
  return match ? match[0] : cleaned;
}

function parseUrl(rawStart, rawEnd) {
  const startUrl = extractMediaUrl(rawStart);
  const endUrl = extractMediaUrl(rawEnd);
  const startMatch = startUrl.match(/frontimage\/(\d+)_([a-z0-9]+)/i);
  const endMatch = endUrl.match(/frontimage\/(\d+)/i);
  if (!startMatch || !endMatch) throw new Error('URLの形式が正しくありません。frontimage/数字_コード のURLを入れてください。');

  const startNumStr = startMatch[1];
  const packCode = startMatch[2];
  const startNum = parseInt(startNumStr, 10);
  const endNum = parseInt(endMatch[1], 10);
  if (Number.isNaN(startNum) || Number.isNaN(endNum)) throw new Error('カード番号を読み取れませんでした。');
  if (startNum > endNum) throw new Error('開始番号と終了番号の順序が逆です。');
  if ((endNum - startNum) > 800) throw new Error('範囲が広すぎます。スマホでは重くなるので800件以内にしてください。');

  const baseBeforeStar = startUrl.split(/\/star_\d+/i)[0];
  return { startUrl, endUrl, startNumStr, packCode, startNum, endNum, baseBeforeStar };
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
    parsed = parseUrl($('startUrl').value, $('endUrl').value);
  } catch (e) {
    toast(e.message);
    return;
  }

  state.scanning = true;
  state.found = [];
  $('resultCard').hidden = false;
  $('progress').hidden = false;
  $('scanBtn').disabled = true;
  $('scanBtn').textContent = '検出中...';
  renderResults();

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
      if (state.found.length <= 12 || state.found.length % 10 === 0) renderResults();
    }
    await sleep(35);
  }

  state.scanning = false;
  $('progress').hidden = true;
  $('scanBtn').disabled = false;
  $('scanBtn').textContent = '候補を検出';
  renderResults();
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
  const safeName = sanitize(`${rawName}_★${item.star}_${item.num}.${item.ext}`);
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
    : found.length ? `${found.length}件見つかりました` : 'まだ検出結果はありません';
  $('copyAllBtn').disabled = found.length === 0;
  $('shareBtn').disabled = found.length === 0 || !navigator.share;
  $('zipBtn').disabled = found.length === 0;

  const html = found.map((item) => {
    const name = filenameFor(item);
    const label = `★${item.star} / ${item.ext.toUpperCase()} / ${item.num}${item.suffix || ''}`;
    return `<article class="resultItem">
      <div class="resultTitle"><strong>${escapeHtml(name.split('/').pop())}</strong><span class="badge">${label}</span></div>
      <div class="urlBox">${escapeHtml(item.url)}</div>
      <div class="itemActions">
        <button type="button" data-copy="${encodeURIComponent(item.url)}">コピー</button>
        <a href="${item.url}" target="_blank" rel="noopener">開く</a>
        <a href="${item.url}" download="${escapeAttr(name.split('/').pop())}" target="_blank" rel="noopener">保存</a>
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
      const res = await fetch(item.url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      zip.file(filenameFor(item), blob);
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitize($('folderName').value.trim()) || 'orical_cards'}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast(`ZIPを作成しました / 成功${ok}件${ng ? `・失敗${ng}件` : ''}`);
  }
  $('summary').textContent = `${state.found.length}件見つかりました`;
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
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

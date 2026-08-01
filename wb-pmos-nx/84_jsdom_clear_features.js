/**
 * 84_jsdom_clear_features.js
 *
 * 假设：瑞数检测 jsdom 特征（window.__jsdomVersion 等）→ keys2 走 jsdom 分支
 * 清除 jsdom 特征 → keys2 是否变化（接近浏览器）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

async function jsdomRun(nsd, cd, oCookie, clearFeature) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  if (oCookie) {
    let cj = oCookie;
    Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cj = cj ? cj + '; ' + v : v; }, configurable: true });
  }
  // 清除 jsdom 特征
  if (clearFeature) {
    try { delete window.__jsdomVersion; } catch (e) {}
    try { delete window._jsdom; } catch (e) {}
    try { delete window.jsdom; } catch (e) {}
  }
  // 数组陷阱
  const found = [];
  const rec = (arr) => {
    if (!arr || typeof arr !== 'object') return;
    const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
    if (!a) return;
    if (a.length !== 48) return;
    if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
    if (a.filter(b => b >= 32 && b <= 126).length < a.length * 0.4) found.push(a);
  };
  for (const C of [window.Array, window.Uint8Array]) {
    if (!C) continue;
    for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
      const o = C.prototype[m];
      if (typeof o === 'function') C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
    }
  }
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 15000)); } catch (e) {}
  window.close();
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  return { k2: dedup(found)[0] || null, cookie: (() => { try { return window.document.cookie.substring(0, 80); } catch (e) { return ''; } })() };
}

(async () => {
  // 用 sync 的 cd + O（同 cd 对比浏览器）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  const oc = (sync.cookies || []).find(c => c.name.endsWith('O'));
  const oCookie = oc ? oc.name + '=' + oc.value : '';
  console.log('sync nsd:', nsd, '浏览器 keys2:', sync.browserKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 检查 jsdom 特征
  const dom0 = new JSDOM('<!DOCTYPE html>', { url: TARGET, runScripts: 'outside-only' });
  console.log('jsdom 特征:', JSON.stringify({ __jsdomVersion: dom0.window.__jsdomVersion, _jsdom: typeof dom0.window._jsdom, jsdom: typeof dom0.window.jsdom }));
  dom0.window.close();

  // 基线（不清除）vs 清除特征
  const base = await jsdomRun(nsd, cd, oCookie, false);
  console.log('\n基线 keys2:', base.k2 ? base.k2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  const cleared = await jsdomRun(nsd, cd, oCookie, true);
  console.log('清除特征 keys2:', cleared.k2 ? cleared.k2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  if (base.k2 && cleared.k2) {
    const same = base.k2.every((v, i) => v === cleared.k2[i]);
    console.log('清除后变化:', same ? '无（jsdom 特征不影响 keys2）' : '★ 变化!');
    const br = sync.browserKeys.keys2;
    const match = cleared.k2.length === br.length && cleared.k2.every((v, i) => v === br[i]);
    console.log('清除后 == 浏览器:', match ? '★★★ 突破!' : 'NO');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

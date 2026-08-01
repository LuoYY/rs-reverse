/**
 * 83_jsdom_run_sandbox_dyn.js
 *
 * 混合方案：jsdom 执行沙箱动态代码（正确算法 492KB，同 cd）
 * jsdom 外层 VM（用 sync cd）生成 scj/aebi → eval 沙箱动态代码（IIFE）
 * → 数组陷阱抓 keys2 → 对比 sync 浏览器 keys2
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

(async () => {
  // 1. 读 sync（浏览器 keys2 对照 + cd）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  console.log('sync nsd:', nsd, '浏览器 keys2:', sync.browserKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 2. 沙箱动态代码（同 cd，正确算法）
  const sandFile = fs.readdirSync(OUT).filter(f => f.startsWith('sandbox_dyn_')).sort().pop();
  if (!sandFile) { console.log('无沙箱动态代码'); process.exit(1); }
  const sandDyn = fs.readFileSync(path.join(OUT, sandFile), 'utf8');
  console.log('沙箱动态代码:', sandDyn.length, 'chars');

  // 3. jsdom 执行外层 VM（生成 scj/aebi）→ 再 eval 沙箱动态代码
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  // O cookie
  const cookies = sync.cookies || [];
  const oc = cookies.find(c => c.name.endsWith('O'));
  if (oc) {
    let cj = oc.name + '=' + oc.value;
    Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cj = cj ? cj + '; ' + v : v; }, configurable: true });
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
  // 4. 执行外层 VM（生成 scj/aebi）——hook eval 替换动态代码为沙箱版
  const origEval = window.eval.bind(window);
  let replaced = false;
  window.eval = function (code) {
    if (typeof code === 'string' && code.length > 50000 && !replaced) {
      console.log('捕获外层生成的动态代码:', code.length, 'chars → 替换为沙箱版');
      replaced = true;
      return origEval(sandDyn);  // 执行沙箱动态代码（正确算法）
    }
    return origEval(code);
  };
  try {
    origEval(fs.readFileSync(OUTER_JS, 'utf8'));
    await new Promise(r => setTimeout(r, 20000));
  } catch (e) { console.log('外层错误(可忽略):', e.message.substring(0, 60)); }

  // 5. 识别 keys2
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  const k2 = dedup(found)[0] || null;
  if (k2) {
    console.log('\njsdom+沙箱动态代码 keys2:', k2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const same = k2.length === sync.browserKeys.keys2.length && k2.every((v, i) => v === sync.browserKeys.keys2[i]);
    console.log('与浏览器 keys2 相同:', same ? '★★★ 突破!' : 'NO');
    if (!same) {
      const xor = k2.slice(0, 16).map((v, i) => v ^ sync.browserKeys.keys2[i]);
      console.log('XOR 前16:', xor.map(x => x.toString(16).padStart(2, '0')).join(' '));
    }
  } else {
    console.log('未抓到 48 字节 keys2');
  }
  console.log('cookie 写入:', (() => { try { return window.document.cookie.substring(0, 60); } catch (e) { return 'N/A'; } })());
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

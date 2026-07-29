/**
 * Phase A — sdenv(jsdom) 运行 :20080 完整瑞数 VM，捕获真实产物
 *
 * 原理：sdenv 的 jsdomFromUrl 让外层 VM 自然跑完整个代码生成 + 内层 VM 执行，
 * 我们在 beforeParse 注入 hook（cookie setter / XHR / eval / document），
 * 并在 VM 运行后直接从 window.$_ts 读取完整 cp / cd / nsd，
 * 从 cookieJar 读 O/P cookie，从动态代码校验和算 cp[3]。
 *
 * 用法：
 *   export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
 *   NODE_OPTIONS=--dns-result-order=ipv4first node capture_sdenv_20080.js
 */
const path = require('path');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const { jsdomFromUrl, jsdom, logger } = require('sdenv');
const gv = require('@src/handler/globalVarible');
const { getCode } = require('@utils/');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_DIR = path.join(__dirname, 'output', 'capture-20080');

function checksum(code) { let s = 0; for (let i = 0; i < code.length; i += 100) s += code.charCodeAt(i); return s; }

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  logger.level = 'warn';
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  gv._setAttr('argv', { mate: { jscode: codeRet.jscode, metaContent: [], url: undefined } });
  require('@src/config/')(gv);

  console.log('[sdenv] 加载 pmos:20080 (jsdomFromUrl)...');
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    consoleConfig: { error: new Function, warn: new Function, log: new Function },
    beforeParse(window) {
      window.__cap = { dyn: [], cookieSets: [], xhrOpens: [], evals: [] };
      // hook eval（捕获内层动态代码）
      const oe = window.eval;
      window.eval = function (c) {
        try { if (typeof c === 'string' && c.length > 50000) window.__cap.dyn.push(c); window.__cap.evals.push((c || '').length); } catch (e) {}
        return oe.call(window, c);
      };
      // hook Function.prototype.call（eval.call(window, code)）
      const oc = window.Function.prototype.call;
      window.Function.prototype.call = function (t, ...a) {
        try { if (this === oe && a[0] && a[0].length > 50000) window.__cap.dyn.push(a[0]); } catch (e) {}
        return oc.apply(this, [t, ...a]);
      };
      // hook cookie setter
      try {
        const desc = Object.getOwnPropertyDescriptor(window.Document.prototype, 'cookie') || Object.getOwnPropertyDescriptor(window.HTMLDocument.prototype, 'cookie');
        if (desc && desc.set) {
          Object.defineProperty(window.document, 'cookie', {
            set(v) { try { window.__cap.cookieSets.push(String(v).substring(0, 200)); } catch (e) {} return desc.set.call(window.document, v); },
            get() { return desc.get.call(window.document); },
            configurable: true,
          });
        }
      } catch (e) {}
      // hook XHR open（捕获 query 参数）
      try {
        const oo = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (m, u) { try { window.__cap.xhrOpens.push({ m, u: String(u).substring(0, 250) }); } catch (e) {} return oo.apply(this, arguments); };
      } catch (e) {}
    },
  });
  const { window, cookieJar } = dom;

  // 立即抓 $_ts 种子（VM 可能清空）
  const sessNsd = window.$_ts && window.$_ts.nsd;
  const sessCd = window.$_ts && window.$_ts.cd;
  console.log('[sdenv] $_ts.nsd:', sessNsd, 'cd_len:', sessCd && sessCd.length);

  // 等 VM 跑完（location.replace/reload 触发，或超时）
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    window.addEventListener('sdenv:exit', (e) => { if (['location.replace', 'location.assign'].includes(e.detail && e.detail.eventId)) finish(); });
    window.addEventListener('sdenv:location.replace', finish);
    setTimeout(finish, 60000);
  });
  // 再等一会儿让 XHR/资源加载
  await new Promise(r => setTimeout(r, 8000));

  // ---- 收集产物 ----
  const cap = window.__cap || {};
  const ts = window.$_ts || {};
  const cookies = cookieJar.getCookieStringSync(TARGET);
  const pCookie = (cookies.match(/[A-Za-z0-9]+P=([^;]+)/) || [])[0];
  const oCookie = (cookies.match(/[A-Za-z0-9]+O=([^;]+)/) || [])[0];

  console.log('\n[sdenv] === 捕获汇总 ===');
  console.log('  eval 调用次数:', (cap.evals || []).length, 'len 分布:', JSON.stringify((cap.evals || []).slice(0, 10)));
  console.log('  动态代码候选(>50KB):', (cap.dyn || []).length);
  console.log('  cookie 写入次数:', (cap.cookieSets || []).length);
  console.log('  XHR open 次数:', (cap.xhrOpens || []).length);
  console.log('  cookieJar O:', oCookie ? oCookie.length + 'ch' : 'N/A', ' P:', pCookie ? pCookie.length + 'ch' : 'N/A');
  console.log('  $_ts keys:', Object.keys(ts).join(','));

  // 动态代码
  let dynCode = (cap.dyn || []).slice().sort((a, b) => b.length - a.length)[0];
  if (dynCode) {
    fs.writeFileSync(path.join(OUT_DIR, 'sdenv-dyn-code.js'), dynCode);
    console.log('  ✓ 动态代码 len=' + dynCode.length + ' cp3(checksum)=' + checksum(dynCode));
  }

  // $_ts.cp
  const cpInfo = ts.cp ? { len: ts.cp.length, cp0len: ts.cp[0] && ts.cp[0].length, cp2len: ts.cp[2] && ts.cp[2].length, cp3: ts.cp[3] } : null;
  console.log('  $_ts.cp:', JSON.stringify(cpInfo));

  // query 参数
  const queryReqs = (cap.xhrOpens || []).filter(x => /[?&][A-Za-z0-9]{6,12}=/.test(x.u));
  console.log('  带 query 的 XHR:', queryReqs.length);
  queryReqs.slice(0, 10).forEach(x => console.log('    ', x.m, x.u));

  // 保存
  fs.writeFileSync(path.join(OUT_DIR, 'sdenv-capture.json'), JSON.stringify({
    url: TARGET,
    ts: { nsd: sessNsd, cd: sessCd, cp: cpInfo, keys: Object.keys(ts) },
    dynCode: dynCode ? { len: dynCode.length, checksum: checksum(dynCode) } : null,
    cookies: { O: oCookie && oCookie.length, P: pCookie && pCookie.length, raw: cookies },
    cookieSets: cap.cookieSets,
    xhrOpens: cap.xhrOpens,
    queryReqs,
    evals: cap.evals,
  }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'sdenv-cookies.txt'), cookies);
  if (ts.cp) fs.writeFileSync(path.join(OUT_DIR, 'sdenv-ts-full.json'), JSON.stringify({ nsd: sessNsd, cd: sessCd, cp: ts.cp, aebi: ts.aebi, from: TARGET }));

  console.log('\n[sdenv] 输出目录:', OUT_DIR);
  window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

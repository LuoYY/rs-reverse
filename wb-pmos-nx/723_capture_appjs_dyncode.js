/**
 * 723_capture_appjs_dyncode.js
 * 捕获应用 js 的 dynCode（eval >100000）+ 分析 _$lc 报错点
 * 用于补全 jsdom 环境 → 纯算法生成 basearr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const APP_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsdM = rawBody.match(/nsd=(\d+)/);
  const cdM = rawBody.match(/cd="([^"]+)"/);
  const ts = { nsd: +nsdM[1], cd: cdM[1] };
  console.log('nsd=' + ts.nsd + ' cd len=' + ts.cd.length);

  const appJs = fs.readFileSync(APP_JS, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://pmos.nx.sgcc.com.cn:10443/', referrer: 'https://pmos.nx.sgcc.com.cn:10443/',
    contentType: 'text/html', userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };

  // hook eval 捕获 dynCode
  const evals = [];
  const origEval = window.eval;
  window.eval = function (code) {
    if (typeof code === 'string' && code.length > 100000) {
      evals.push({ len: code.length, head: code.substring(0, 80) });
      fs.writeFileSync(`/tmp/nx_appjs_dyn_${evals.length}.js`, code);
      console.log(`[EVAL #${evals.length}] len=${code.length}`);
    }
    return origEval(code);
  };

  window.addEventListener('error', (e) => {
    if (e.error && e.stack) {
      const m = e.stack.match(/<anonymous>:(\d+):(\d+)/);
      if (m) console.log(`[ERR] @${m[1]}:${m[2]}`, e.message.substring(0, 60));
    }
  });

  console.log('[1] eval 应用 js...');
  try { window.eval(appJs); } catch (e) { console.log('eval 异常:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 15000));
  console.log('[2] 捕获 dynCode:', evals.length);
  if (evals.length) {
    const code = fs.readFileSync('/tmp/nx_appjs_dyn_1.js', 'utf8');
    // 分析 _$lc @96227
    const pos = 96227;
    console.log('\n=== _$lc @96227 上下文 ===');
    console.log(code.substring(pos - 200, pos + 100).replace(/\n/g, '\\n'));
    // 找 _$lc 定义
    const idx = code.indexOf('_$lc');
    let count = 0;
    const occurrences = [];
    let i = -1;
    while ((i = code.indexOf('_$lc', i + 1)) !== -1 && count < 10) { count++; occurrences.push(i); }
    console.log('_$lc 出现次数:', count, '位置:', occurrences.slice(0, 8).join(','));
    // 找 function _$lc 定义
    const fidx = code.indexOf('function _$lc');
    if (fidx >= 0) console.log('function _$lc @', fidx, ':', code.substring(fidx, fidx + 150));
    else console.log('无 function _$lc 定义——可能是环境注入或延迟定义');
    // 报错位置 96227 附近的函数定义
    const preFn = code.lastIndexOf('function', pos);
    if (preFn >= 0 && pos - preFn < 3000) {
      console.log('报错点所在函数:', code.substring(preFn, Math.min(code.length, pos + 80)).substring(0, 200));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

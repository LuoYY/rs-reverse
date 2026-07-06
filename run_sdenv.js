// Use sdenv to run the pmos VM, capture the generated cookie, verify it, and save for [0] extraction.
const path = require('path');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const { jsdomFromUrl, logger } = require('sdenv');
const gv = require('@src/handler/globalVarible');
const { getCode } = require('@utils/');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  logger.level = 'warn';
  // pre-initialize gv.config (immucfg, keynameNum) from pmos js for the decrypt step
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  gv._setAttr('argv', { mate: { jscode: codeRet.jscode, metaContent: [], url: undefined } });
  require('@src/config/')(gv);

  console.log('Loading pmos via sdenv (jsdomFromUrl)...');
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    consoleConfig: { error: new Function, warn: new Function, log: new Function },
    beforeParse: (window, sdenv) => {
      // define a lightweight checker on the window
      window.__chk61 = function(v) {
        if (Array.isArray(v) && (v.length === 61 || v.length === 204)) {
          console.log('[' + v.length + 'B pushed] first6=' + JSON.stringify(v.slice(0,6)) + ' stk=' + new Error().stack.split('\n').slice(2,7).map(s=>s.trim()).join(' | '));
        }
        return v;
      };
      // hook eval/Function to find the inner VM generation and patch stack pushes
      const patchCode = (code) => {
        if (typeof code !== 'string') return code;
        // find the dispatcher stack-push pattern: any VAR[VAR2++]=EXPR
        // log if the code looks like the inner VM (has while(1) and many _$ vars)
        if (code.length > 5000 && code.indexOf('while(1)') >= 0) {
          console.log('[VM code generated] len=' + code.length + ' sample=' + code.substring(0, 100).replace(/\n/g, ' '));
        }
        return code;
      };
      const origEval = window.eval;
      window.eval = function(code) { patchCode(code); return origEval.call(this, code); };
      const OrigFunc = window.Function;
      const FuncHandler = function(...args) {
        args.forEach(a => patchCode(a));
        return OrigFunc(...args);
      };
      FuncHandler.prototype = OrigFunc.prototype;
      try { window.Function = FuncHandler; } catch(e) {}
      // instrument: log when a 61-byte ([0] block) or 204-byte (basearr) array is produced
      const Arr = window.Array;
      const TARGET_LENS = new Set([61, 204]);
      const logArr = (arr, ctx) => {
        if (Arr.isArray(arr) && TARGET_LENS.has(arr.length)) {
          const stack = new Error().stack.split('\n').slice(2, 8).map(s => s.trim()).join(' | ');
          console.log(`[${arr.length}-byte via ${ctx}] first8=${JSON.stringify(arr.slice(0,8))} stack=${stack}`);
        }
      };
      ['slice','concat','splice'].forEach(m => {
        const orig = Arr.prototype[m];
        Arr.prototype[m] = function(...a){ const r = orig.apply(this, a); logArr(r, m); return r; };
      });
      const origPush = Arr.prototype.push;
      Arr.prototype.push = function(...a){
        a.forEach(v => { if (Array.isArray(v) && TARGET_LENS.has(v.length)) logArr(v, 'push-val'); });
        const r = origPush.apply(this, a);
        if (TARGET_LENS.has(this.length)) logArr(this, 'push');
        return r;
      };
      // replace window.Array: constructor returns a Proxy that logs when length reaches 61/204
      const OrigArray = Arr;
      const ProxiedArray = function(...args){
        const r = OrigArray(...args);
        return new Proxy(r, {
          set(t, p, v) {
            t[p] = v;
            if (TARGET_LENS.has(t.length)) {
              const stack = new Error().stack.split('\n').slice(2, 8).map(s => s.trim()).join(' | ');
              console.log(`[${t.length}-byte array built] first8=${JSON.stringify(t.slice(0,8))} stack=${stack}`);
            }
            return true;
          }
        });
      };
      ProxiedArray.prototype = OrigArray.prototype;
      ProxiedArray.isArray = OrigArray.isArray;
      const wrapProxy = (r) => new Proxy(r, {
        set(t, p, v) {
          t[p] = v;
          if (TARGET_LENS.has(t.length)) {
            const stack = new Error().stack.split('\n').slice(2, 8).map(s => s.trim()).join(' | ');
            console.log(`[${t.length}-byte array built] first8=${JSON.stringify(t.slice(0,8))} stack=${stack}`);
          }
          return true;
        }
      });
      ProxiedArray.from = function(...a){ return wrapProxy(OrigArray.from(...a)); };
      ProxiedArray.of = function(...a){ return wrapProxy(OrigArray.of(...a)); };
      // also hook Array.prototype.concat to wrap results (literals use concat)
      const origConcat = Arr.prototype.concat;
      Arr.prototype.concat = function(...a){ const r = origConcat.apply(this, a); logArr(r, 'concat'); return r; };
      try { window.Array = ProxiedArray; } catch(e) {}
      // (navigator/screen wrapping broke the VM — removed)
      // hook document.cookie setter to log the call stack when the P cookie is set
      const doc = window.document;
      let _cookieVal = '';
      try {
        Object.defineProperty(doc, 'cookie', {
          get() { return _cookieVal; },
          set(v) {
            _cookieVal = v;
            if (typeof v === 'string' && v.indexOf('aoU85Lxl9xxNP=') === 0) {
              const stack = new Error().stack.split('\n').slice(1, 10).map(s => s.trim()).join('\n  ');
              console.log('[P cookie SET] stack:\n  ' + stack);
            }
          },
          configurable: true,
        });
      } catch(e) {}
    },
  });
  const { window, cookieJar } = dom;
  // capture nsd/cd IMMEDIATELY (VM clears nsd during async fingerprint collection)
  const sessNsd = window.$_ts && window.$_ts.nsd;
  const sessCd = window.$_ts && window.$_ts.cd;
  console.log('$_ts.nsd:', sessNsd, 'cd_len:', sessCd && sessCd.length);
  const sessTs = { nsd: sessNsd, cd: sessCd, from: TARGET, hasDebug: false };
  fs.writeFileSync('/tmp/pmos_session_ts.json', JSON.stringify(sessTs));

  let done = false;
  async function handle(cookies) {
    if (done) return; done = true;
    console.log('GENERATED COOKIE:', cookies);
    fs.writeFileSync('/tmp/pmos_session_cookie.txt', cookies);
    // verify with second request
    try {
      const { ProxyAgent } = require('undici');
      const res = await fetch(TARGET, {
        headers: { 'Cookie': cookies, 'user-agent': UA },
        dispatcher: process.env.proxy ? new ProxyAgent(process.env.proxy) : undefined,
      });
      const text = await res.text();
      const isRs = text.includes('$_ts.nsd') || text.includes('aoU85Lxl9xxN');
      console.log('SECOND REQUEST status:', res.status, '| isRSpage:', isRs, '| len:', text.length);
      if (res.status === 200 && !isRs) console.log('*** COOKIE VERIFIED (200, real page) ***');
      else console.log('*** cookie rejected (412/RS page) ***');
    } catch (err) { console.error('second request error:', err.message); }
    window.close();
    process.exit(0);
  }
  window.addEventListener('sdenv:exit', (e) => {
    if (['location.replace', 'location.assign'].includes(e.detail && e.detail.eventId)) {
      handle(cookieJar.getCookieStringSync(TARGET));
    }
  });
  window.addEventListener('sdenv:location.replace', () => handle(cookieJar.getCookieStringSync(TARGET)));
  setTimeout(() => { console.log('TIMEOUT: no cookie generated'); window.close(); process.exit(1); }, 60000);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

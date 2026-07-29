// Wrap _$_C (the main VM dispatcher) to catch when it RETURNS a 61/101-byte array = the [0] block.
// Patch: rename `function _$_C(...)` -> `function _$_C_real(...)`, prepend a wrapper `var _$_C = function(){...check return...}`.
// The [0] block is produced deep in _$_C's recursion; checking return values catches it at every level.
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

// Wrapper prepended at top of IIFE body. Minimal-cheap: no try/catch in hot path, only check length.
const WRAPPER =
  'var _$_C = function(_$kq,_$dw,_$hW){' +
  '  var __r = _$_C_real.apply(this, arguments);' +
  '  if (__r && __r.length === 61) {' +   // hot-path: only the [0] length, no isArray overhead
  '    console.log("[0RET len=61 task="+_$kq+"] first8="+JSON.stringify(__r.slice(0,8)) + " stk=" + new Error().stack.split("\\n").slice(2,10).map(function(s){return s.trim()}).join(" | "));' +
  '  } else if (__r && (__r.length === 101 || __r.length === 204)) {' +
  '    console.log("[RET len="+__r.length+" task="+_$kq+"] first4="+JSON.stringify(__r.slice(0,4)));' +
  '  }' +
  '  return __r;' +
  '};' +
  'var _$_C_cnt = 0; var _$_C_orig_log = console.log;';

const _loader = new jsdom.ResourceLoader({ strictSSL: false, userAgent: UA });
const _origFetch = _loader.fetch.bind(_loader);
_loader.fetch = function (url, options) {
  const req = _origFetch(url, options);
  const wrapper = {
    get response() { return req.response; },
    get href() { return req.href; },
    getHeader: (name) => req.getHeader(name),
    then(onFulfilled, onRejected) {
      return req.then(body => {
        if (Buffer.isBuffer(body) && body.length > 10000) {
          let code = body.toString('utf8');
          if (code.indexOf('r2mKa') >= 0) {
            const defSig = 'function _$_C(_$kq,_$dw,_$hW)';
            const idx = code.indexOf(defSig);
            if (idx >= 0) {
              // prepend wrapper at top of IIFE body
              const iifeOpen = code.indexOf('(function(_$ia,_$dJ)');
              code = code.slice(0, iifeOpen + '(function(_$ia,_$dJ)'.length) + WRAPPER + code.slice(iifeOpen + '(function(_$ia,_$dJ)'.length);
              // rename original definition
              code = code.replace(defSig, 'function _$_C_real(_$kq,_$dw,_$hW)');
              console.log('[PATCHED] wrapped _$_C, IIFE@' + iifeOpen + ', def@' + idx + ', new len=' + code.length);
              body = Buffer.from(code, 'utf8');
            } else {
              console.log('[PATCH] _$_C definition not found');
            }
          }
        }
        return onFulfilled ? onFulfilled(body) : body;
      }, onRejected);
    }
  };
  return wrapper;
};

(async () => {
  logger.level = 'warn';
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  gv._setAttr('argv', { mate: { jscode: codeRet.jscode, metaContent: [], url: undefined } });
  require('@src/config/')(gv);

  console.log('Loading pmos via sdenv with _$_C return-value hook...');
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    resources: _loader,
    consoleConfig: { error: new Function, warn: new Function, log: (...a) => process.stdout.write('[jsdom] ' + a.join(' ') + '\n') },
  });
  const { window, cookieJar } = dom;
  console.log('$_ts.nsd:', window.$_ts && window.$_ts.nsd);

  let done = false;
  function handle(cookies) {
    if (done) return; done = true;
    console.log('GENERATED COOKIE:', cookies.substring(0, 100));
    window.close(); process.exit(0);
  }
  window.addEventListener('sdenv:exit', (e) => {
    if (['location.replace', 'location.assign'].includes(e.detail && e.detail.eventId)) handle(cookieJar.getCookieStringSync(TARGET));
  });
  window.addEventListener('sdenv:location.replace', () => handle(cookieJar.getCookieStringSync(TARGET)));
  setTimeout(() => { console.log('TIMEOUT'); window.close(); process.exit(1); }, 200000);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

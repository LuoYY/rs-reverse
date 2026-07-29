// Instrument the MAIN dispatcher @3524 to catch the [0] block creation.
// Patch: after opcode fetch (_$kj = _$_u[_$_w++];), check candidate array vars for length 61/101.
// When found, log which var + opcode + IP + first6 bytes. Then we read that opcode handler to understand [0] generation.
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

// The check inserted after opcode fetch. Scans candidate array vars for the [0] signature.
const CHECK = `
try {
  var __chk = function(v, n) {
    if (v && (Array.isArray(v) || (v && v.constructor && v.constructor.name === 'Array')) && typeof v[0] === 'number' && (v.length === 61 || v.length === 101 || v.length === 204)) {
      if (!window.__seen || !window.__seen.has(n + v.length + '_' + v[0] + '_' + v[1])) {
        window.__seen = window.__seen || new Set();
        window.__seen.add(n + v.length + '_' + v[0] + '_' + v[1]);
        console.log('[CMP ' + n + ' len=' + v.length + ' prevOp=' + (_$kj) + ' ip=' + _$_w + '] first8=' + JSON.stringify(v.slice(0, 8)));
      }
    }
  };
  __chk(_$bd, '_$bd'); __chk(_$c0, '_$c0'); __chk(_$k$, '_$k$'); __chk(_$bC, '_$bC');
  __chk(_$g6, '_$g6'); __chk(_$g7, '_$g7'); __chk(_$kW, '_$kW'); __chk(_$iB, '_$iB');
  __chk(_$aL, '_$aL'); __chk(_$_Z, '_$_Z'); __chk(_$e8, '_$e8'); __chk(_$gm, '_$gm');
  __chk(_$en, '_$en'); __chk(_$_4, '_$_4'); __chk(_$dO, '_$dO'); __chk(_$fY, '_$fY');
} catch (e) {}
`;

// Global hook injected at top of body: intercept Function.prototype.apply to catch
// when ANY function receives a 61/101-byte numeric array as an argument (the [0] block,
// which is passed to numarrJoin per prior analysis). This catches it regardless of how it was built.
const APPLY_HOOK = `
(function(){
  var __origApply = Function.prototype.apply;
  var __seen = {};
  Function.prototype.apply = function(thisArg, args) {
    try {
      if (args && args.length) {
        for (var i = 0; i < args.length; i++) {
          var v = args[i];
          if (v && typeof v === 'object' && typeof v.length === 'number' && (v.length === 61 || v.length === 101 || v.length === 204) && typeof v[0] === 'number') {
            var key = v.length + '_' + v[0] + '_' + v[1];
            if (!__seen[key]) {
              __seen[key] = 1;
              console.log('[APPLY len=' + v.length + '] first6=' + JSON.stringify(Array.prototype.slice.call(v, 0, 6)) + ' fn=' + (this && this.name || '?') + ' stk=' + new Error().stack.split('\\n').slice(2, 8).map(function(s){return s.trim()}).join(' | '));
            }
          }
        }
      }
    } catch(e){}
    return __origApply.apply(this, arguments);
  };
})();
`;

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
            // server body is minified: _$kj=_$_u[_$_w++] (no spaces). Use regex anchor.
            const anchorRe = /_\$kj\s*=\s*_\$_u\[_\$_w\+\+\]\s*;/;
            const am = code.match(anchorRe);
            if (am) {
              const idx = am.index;
              code = code.slice(0, idx + am[0].length) + '\n' + CHECK + '\n' + code.slice(idx + am[0].length);
              // prepend the global apply-hook at the very top of the body
              code = APPLY_HOOK + code;
              console.log('[PATCHED] inserted [0]-check + apply-hook, new len=' + code.length);
              body = Buffer.from(code, 'utf8');
            } else {
              console.log('[PATCH] anchor _$kj=_$_u[_$_w++] NOT found in body');
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

  console.log('Loading pmos via sdenv with [0]-trace instrumentation...');
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
  setTimeout(() => { console.log('TIMEOUT'); window.close(); process.exit(1); }, 90000);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

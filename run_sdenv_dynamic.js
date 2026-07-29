// Test if the deobfuscated dynamic.js runs in sdenv (jsdomFromUrl + ResourceLoader returning dynamic.js).
// If it runs and generates a cookie, we can instrument the READABLE dynamic.js to capture [0] generation.
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

// Load dynamic.js, strip the marker comment (line 1), keep the real code
const DYN_PATH = 'output/makecode/rGTR1U4jJCVr.303c6e9-dynamic.js';
const dynFull = fs.readFileSync(DYN_PATH, 'utf8');
const codeStart = dynFull.indexOf('(function');
const DYN_CODE = codeStart >= 0 ? dynFull.slice(codeStart) : dynFull;
console.log('dynamic.js code len:', DYN_CODE.length, '(stripped marker)');

// Custom ResourceLoader: return dynamic.js body when the outer js is fetched
const _loader = new jsdom.ResourceLoader({ strictSSL: false, userAgent: UA });
const _origFetch = _loader.fetch.bind(_loader);
_loader.fetch = function(url, options) {
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
            // REPLACE outer js with dynamic.js (readable deobfuscated version)
            console.log('[REPLACE] outer js -> dynamic.js, body len', body.length, '->', DYN_CODE.length);
            body = Buffer.from(DYN_CODE, 'utf8');
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

  console.log('Loading pmos via sdenv (jsdomFromUrl + dynamic.js replacement)...');
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    resources: _loader,
    consoleConfig: { error: new Function, warn: new Function, log: new Function },
  });
  const { window, cookieJar } = dom;
  const sessNsd = window.$_ts && window.$_ts.nsd;
  const sessCd = window.$_ts && window.$_ts.cd;
  console.log('$_ts.nsd:', sessNsd, 'cd_len:', sessCd && sessCd.length);

  let done = false;
  function handle(cookies) {
    if (done) return; done = true;
    console.log('GENERATED COOKIE:', cookies.substring(0, 120));
    fs.writeFileSync('/tmp/pmos_dyn_cookie.txt', cookies);
    window.close(); process.exit(0);
  }
  window.addEventListener('sdenv:exit', (e) => {
    if (['location.replace', 'location.assign'].includes(e.detail && e.detail.eventId)) handle(cookieJar.getCookieStringSync(TARGET));
  });
  window.addEventListener('sdenv:location.replace', () => handle(cookieJar.getCookieStringSync(TARGET)));
  setTimeout(() => { console.log('TIMEOUT (dynamic.js may not have run)'); window.close(); process.exit(1); }, 60000);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

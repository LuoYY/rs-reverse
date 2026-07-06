// Custom ResourceLoader using https directly (avoids sdenv-jsdom result format issues).
// Patches the outer js ([] -> =__pa()) and returns a Buffer (same format as passthrough).
const path = require('path');
const fs = require('fs');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const { jsdomFromUrl, jsdom, logger } = require('sdenv');
const gv = require('@src/handler/globalVarible');
const { getCode } = require('@utils/');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PROXY_DEF = `var __pa=function(){var a=new Array();return new Proxy(a,{set(t,p,v){t[p]=v;if(typeof p==='number'&&(t.length===61||t.length===204)&&typeof t[0]==='number'){console.log('['+t.length+'B NUM] first8='+JSON.stringify(t.slice(0,8))+' stk='+new Error().stack.split('\\n').slice(2,8).map(function(s){return s.trim()}).join(' | '));}return true;}});};`;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA }, rejectUnauthorized: false }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(buf);
      });
    }).on('error', reject);
  });
}

// Custom ResourceLoader: fetch via https, patch RS js, return Buffer
const origLoader = new jsdom.ResourceLoader({ strictSSL: false, userAgent: UA });
const customLoader = Object.create(origLoader);
customLoader.fetch = async function(url, options) {
  // For the RS js, fetch and patch ourselves
  if (url && url.indexOf('rGTR1U4jJCVr') >= 0) {
    console.log('[custom fetch]', url.substring(0, 80));
    const buf = await fetchUrl(url);
    let code = buf.toString('utf8');
    let repCount = 0;
    // replace ALL [] that create empty arrays (not just =[])
    code = code.replace(/=\[\]/g, () => { repCount++; return '=__pa()'; });
    // also replace 'return []' and '([])' patterns
    code = code.replace(/return\s*\[\]/g, () => { repCount++; return 'return __pa()'; });
    code = code.replace(/\(\[\]\)/g, () => { repCount++; return '(__pa())'; });
    code = PROXY_DEF + code;
    console.log('[PATCHED] len=' + code.length + ' replacements=' + repCount);
    return Buffer.from(code, 'utf8');
  }
  // For other resources, use the original fetch
  return origLoader.fetch.call(this, url, options);
};

(async () => {
  logger.level = 'warn';
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  gv._setAttr('argv', { mate: { jscode: codeRet.jscode, metaContent: [], url: undefined } });
  require('@src/config/')(gv);

  console.log('Loading pmos via jsdomFromUrl + custom ResourceLoader...');
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    resources: customLoader,
    consoleConfig: { error: new Function, warn: new Function, log: new Function },
  });
  const { window, cookieJar } = dom;
  console.log('$_ts.nsd:', window.$_ts && window.$_ts.nsd);
  const sessNsd = window.$_ts && window.$_ts.nsd;
  const sessCd = window.$_ts && window.$_ts.cd;
  if (sessNsd) fs.writeFileSync('/tmp/pmos_session_ts.json', JSON.stringify({ nsd: sessNsd, cd: sessCd, from: TARGET, hasDebug: false }));

  let done = false;
  function handle(cookies) {
    if (done) return; done = true;
    console.log('GENERATED COOKIE:', cookies.substring(0, 100));
    fs.writeFileSync('/tmp/pmos_session_cookie.txt', cookies);
    window.close(); process.exit(0);
  }
  window.addEventListener('sdenv:exit', (e) => { if (['location.replace','location.assign'].includes(e.detail&&e.detail.eventId)) handle(cookieJar.getCookieStringSync(TARGET)); });
  window.addEventListener('sdenv:location.replace', () => handle(cookieJar.getCookieStringSync(TARGET)));
  setTimeout(() => { console.log('TIMEOUT'); window.close(); process.exit(1); }, 90000);
})().catch(e => { console.error('FATAL:', e.message, e.stack.split('\n').slice(0,3).join('\n')); process.exit(1); });

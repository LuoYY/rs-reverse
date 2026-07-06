// Inline the patched outer js into the HTML, run via jsdomFromText with runScripts:'dangerously'.
// Only the 12 =[] sites get proxied (via __pa()), not all arrays.
const path = require('path');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const { jsdomFromText, jsdom, logger } = require('sdenv');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PROXY_DEF = `var __pa=function(){var a=new Array();return new Proxy(a,{set(t,p,v){t[p]=v;if(typeof p==='number'&&(t.length===61||t.length===204)&&typeof t[0]==='number'){console.log('['+t.length+'B NUM] first8='+JSON.stringify(t.slice(0,8))+' stk='+new Error().stack.split('\\n').slice(2,8).map(function(s){return s.trim()}).join(' | '));}return true;}});};`;

(async () => {
  logger.level = 'warn';
  let html = fs.readFileSync('example/pmos.xj.sgcc.com.cn/index-v2.html', 'utf8');
  let jsCode = fs.readFileSync('example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js', 'utf8');
  let repCount = 0;
  jsCode = jsCode.replace(/=\[\]/g, () => { repCount++; return '=__pa()'; });
  jsCode = PROXY_DEF + jsCode;
  console.log('patched js: replacements=' + repCount + ' len=' + jsCode.length);

  html = html.replace(/<script[^>]*src="[^"]*rGTR1U4jJCVr[^"]*"[^>]*><\/script>/, '<script type="text/javascript" r="m">' + jsCode.replace(/<\/script>/g, '<\\/script>') + '</script>');

  const dom = jsdomFromText(html, {
    url: TARGET, referrer: TARGET, contentType: 'text/html',
    runScripts: 'dangerously', pretendToBeVisual: true,
    resources: new jsdom.ResourceLoader({ strictSSL: false, userAgent: UA }),
    consoleConfig: { error: new Function, warn: new Function, log: new Function },
  });
  const { window, cookieJar } = dom;
  console.log('$_ts.nsd:', window.$_ts && window.$_ts.nsd);

  let done = false;
  function handle(cookies) {
    if (done) return; done = true;
    console.log('GENERATED COOKIE:', cookies.substring(0, 100));
    fs.writeFileSync('/tmp/pmos_session_cookie.txt', cookies);
    const ts = window.$_ts;
    if (ts) fs.writeFileSync('/tmp/pmos_session_ts.json', JSON.stringify({ nsd: ts.nsd, cd: ts.cd, from: TARGET, hasDebug: false }));
    window.close(); process.exit(0);
  }
  window.addEventListener('sdenv:exit', (e) => { if (['location.replace','location.assign'].includes(e.detail&&e.detail.eventId)) handle(cookieJar.getCookieStringSync(TARGET)); });
  window.addEventListener('sdenv:location.replace', () => handle(cookieJar.getCookieStringSync(TARGET)));
  setTimeout(() => { console.log('TIMEOUT'); window.close(); process.exit(1); }, 60000);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

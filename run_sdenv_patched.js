// Patch dynamic.js to wrap the dispatcher stack (_$eH) with a logging Proxy,
// then run it via jsdomFromText to find where the 61-byte [0] block is pushed.
const path = require('path');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const { jsdomFromText, jsdomFromUrl, logger } = require('sdenv');
const gv = require('@src/handler/globalVarible');
const { initGv, getCode } = require('@utils/');
const vm = require('vm');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  logger.level = 'warn';
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  // get $_ts — outer js generates cp itself, so only provide nsd/cd
  const tsRaw = JSON.parse(fs.readFileSync('output/pmos-ts.json', 'utf8'));
  const tsFull = { nsd: tsRaw.nsd, cd: tsRaw.cd, from: tsRaw.from, hasDebug: false };
  console.log('$_ts nsd:', tsFull.nsd, 'cd_len:', tsFull.cd.length);

  // patch the OUTER js (rGTR1U4jJCVr, the actual VM): replace [] literals with new Array()
  let dynCode = fs.readFileSync('example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js', 'utf8');
  // DISABLED: =[] replacement + Proxy (breaks push). Run plain to test environment.
  // let repCount = 0;
  // dynCode = dynCode.replace(/=\[\]/g, () => { repCount++; return '=new Array()'; });
  console.log('running plain outer js, len:', dynCode.length);

  // use the real index-v2.html (has meta tag + structure the VM expects)
  const html = fs.readFileSync('example/pmos.xj.sgcc.com.cn/index-v2.html', 'utf8');
  const dom = jsdomFromText(html, {
    url: TARGET,
    referrer: TARGET,
    contentType: 'text/html',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  // set $_ts on window
  window.$_ts = tsFull;
  // DISABLED: Proxy (breaks push). Use plain Array.
  // capture cookie
  let cookieSet = '';
  try {
    Object.defineProperty(window.document, 'cookie', {
      get() { return cookieSet; },
      set(v) { cookieSet = v; console.log('[COOKIE SET]', String(v).substring(0, 80)); },
      configurable: true,
    });
  } catch (e) {}
  // run patched dynamic.js
  try {
    vm.runInContext(dynCode, dom.getInternalVMContext(), { timeout: 300000 });
    console.log('VM completed.');
  } catch (err) {
    console.error("VM error:", err.message); console.error(err.stack.split("\n").slice(0,8).join("\n"));
  }
  console.log('cookie:', cookieSet ? cookieSet.substring(0, 80) : 'NONE');
  window.close();
})();

// Dump the runtime-GENERATED inner VM code (the string that gets eval'd) to a file.
// Key insight: outer js opcode 8 sets _$g6=window.eval, then builds code string _$bd and evals it.
// The [0] generation lives in THIS generated inner code. Hook window.eval in beforeParse to capture it.
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
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  gv._setAttr('argv', { mate: { jscode: codeRet.jscode, metaContent: [], url: undefined } });
  require('@src/config/')(gv);

  console.log('Loading pmos via sdenv (jsdomFromUrl) to dump generated inner VM code...');
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    consoleConfig: { error: new Function, warn: new Function, log: new Function },
    beforeParse: (window) => {
      // Hook eval: the outer js does _$g6 = window.eval, then _$g6(generatedCode).
      // Replace window.eval BEFORE the VM reads it.
      const origEval = window.eval;
      let dumpCount = 0; let totalCalls = 0;
      window.eval = function (code) {
        totalCalls++;
        if (typeof code === 'string' && code.length > 100) {
          dumpCount++;
          const fn = `/tmp/inner_vm_${dumpCount}_len${code.length}.js`;
          fs.writeFileSync(fn, code);
          console.log(`[DUMP eval #${dumpCount}] len=${code.length} -> ${fn}`);
          console.log(`  head: ${code.substring(0, 100).replace(/\n/g, ' ')}`);
        }
        return origEval.call(this, code);
      };
      // report total eval calls at the end
      setTimeout(() => console.log('[STAT] total eval calls:', totalCalls, 'dumped:', dumpCount), 25000);
      // Also hook Function constructor (in case)
      const OrigFunc = window.Function;
      const FuncHandler = function (...args) {
        const code = args[args.length - 1];
        if (typeof code === 'string' && code.length > 2000) {
          dumpCount++;
          const fn = `/tmp/inner_vm_func_${dumpCount}_len${code.length}.js`;
          fs.writeFileSync(fn, code);
          console.log(`[DUMP Function #${dumpCount}] len=${code.length} -> ${fn}`);
        }
        return OrigFunc(...args);
      };
      FuncHandler.prototype = OrigFunc.prototype;
      try { window.Function = FuncHandler; } catch (e) {}
    },
  });
  const { window, cookieJar } = dom;
  const sessNsd = window.$_ts && window.$_ts.nsd;
  console.log('$_ts.nsd:', sessNsd);

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
  setTimeout(() => { console.log('TIMEOUT'); window.close(); process.exit(1); }, 60000);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

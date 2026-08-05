// 插桩 _$c4 dispatcher：追踪 basearr 生成的 opcode 执行序列
// 目标：hook _$c4 入口 + 主循环 _$pW 取值点，记录执行轨迹
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[C4] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[C4] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // ★ 插桩 _$c4 主循环 opcode 取值点：_$pW=_$bk[_$g6++];
        // 找到 _$c4 内第一次出现该模式（dispatcher 主循环）
        const idx = c.indexOf('_$pW=_$bk[_$g6++]');
        console.log('[C4] _$pW 取值点 @' + idx);
        if (idx >= 0) {
          // 在取值点后插入追踪（只记录部分 + 检测 basearr 特征）
          const inject = `try{globalThis.__c4Trace=globalThis.__c4Trace||[];var __n=globalThis.__c4Trace.length;if(__n<200000&&(__n%7===0)){globalThis.__c4Trace.push({pc:_$g6,op:_$pW});}if(globalThis.__c4Trace.length>200000){if(!globalThis.__c4Trunc)globalThis.__c4Trunc=true;}}catch(e){if(!globalThis.__c4E)globalThis.__c4E=String(e)}`;
          c = c.slice(0, idx) + inject + c.slice(idx);
          console.log('[C4] opcode trace 插桩 OK');
        }
        // ★ 尾部标记（注意 $_ts）
        c = c.replace(/\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__T1=true;}($_ts.scj,$_ts.aebi);');
        fs.writeFileSync('/tmp/nx_dynCode_c4_patched.js', c);
        console.log('[C4] 已保存 patched len=' + c.length);
        code = c;
      }
    } catch (e) { console.log('[C4] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
  });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  const evalV = (expr) => { try { return w.eval(expr); } catch (e) { return 'ERR:' + e.message; } };
  const traceLen = evalV('typeof __c4Trace!=="undefined"?__c4Trace.length:null');
  console.log('[C4] trace len:', traceLen);
  const t1 = evalV('typeof __T1!=="undefined"?__T1:null');
  console.log('[C4] __T1:', t1);
  const c4E = evalV('typeof __c4E!=="undefined"?__c4E:null');
  console.log('[C4] __c4E:', c4E);
  const trunc = evalV('typeof __c4Trunc!=="undefined"?__c4Trunc:null');
  console.log('[C4] truncated:', trunc);
  // 输出前 30 条 trace
  const head = evalV('typeof __c4Trace!=="undefined"?JSON.stringify(__c4Trace.slice(0,30)):null');
  console.log('[C4] trace head:', head);
  // 输出尾部 20 条
  const tail = evalV('typeof __c4Trace!=="undefined"?JSON.stringify(__c4Trace.slice(-20)):null');
  console.log('[C4] trace tail:', tail);
  console.log('[C4] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[C4] FATAL:', e && e.message); process.exit(1); });

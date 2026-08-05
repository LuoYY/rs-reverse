// 插桩 v2：确认 dynCode 在 jsdom 中执行路径 + return 点 dump
// 同时 hook：尾部标记 + return dump + _$c4 入口调用追踪
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[RT2] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[RT2] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 1. return 插桩（简化：直接赋值 globalThis）
        const retPattern = 'return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};';
        if (c.indexOf(retPattern) >= 0) {
          c = c.replace(retPattern, 'globalThis.__R1=_$hr;globalThis.__R2=_$pH;globalThis.__R3=_$ou;return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};');
          console.log('[RT2] return 插桩 OK');
        } else { console.log('[RT2] ✗ return 未找到'); }
        // 2. 尾部标记
        c = c.replace(/\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__T1=true;}($_ts.scj,$_ts.aebi);');
        if (c.indexOf('__T1') >= 0) console.log('[RT2] 尾部 OK');
        // 3. 外层 304KB 之后检查 $_ts 状态（在 dynCode 执行前 dump $_ts）
        const preDump = ';try{globalThis.__TSCAP={keys:Object.keys(window.$_ts||{}),nsd:window.$_ts&&window.$_ts.nsd};}catch(e){globalThis.__TSCAP="err:"+e.message};';
        c = c.replace(/\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/, preDump + ';globalThis.__T1=true;}($_ts.scj,$_ts.aebi);');
        fs.writeFileSync('/tmp/nx_dynCode_rt2_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[RT2] hook err:', e.message); }
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
  const r1 = evalV('typeof __R1!=="undefined"?__R1:null');
  console.log('[RT2] __R1:', Array.isArray(r1) ? 'array len=' + r1.length + ' head=' + JSON.stringify(r1.slice(0, 30)) : (typeof r1 === 'string' ? r1.substring(0, 200) : JSON.stringify(r1)));
  const r2 = evalV('typeof __R2!=="undefined"?(__R2&&__R2._$ky?Object.keys(__R2._$ky):__R2):null');
  console.log('[RT2] __R2 keys:', JSON.stringify(r2));
  const r3 = evalV('typeof __R3!=="undefined"?typeof __R3:null');
  console.log('[RT2] __R3 type:', r3);
  console.log('[RT2] __T1:', evalV('typeof __T1!=="undefined"?__T1:null'));
  console.log('[RT2] __TSCAP:', evalV('typeof __TSCAP!=="undefined"?JSON.stringify(__TSCAP):null'));
  console.log('[RT2] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[RT2] FATAL:', e && e.message); process.exit(1); });

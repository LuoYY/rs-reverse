// 插桩 _$c4 dispatcher 主循环：记录 aebi[1] opcode 执行流 + 保存到文件
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[SAV] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[SAV] ★ 截获 dynCode len=' + code.length);
        let c = code;
        const target = 'while(1){_$pW=_$bk[_$g6++];';
        if (c.indexOf(target) >= 0) {
          const inject = `while(1){_$pW=_$bk[_$g6++];try{globalThis.__stream=globalThis.__stream||[];globalThis.__stream.push({pc:_$g6-1,op:_$pW});if(globalThis.__stream.length>500000){globalThis.__streamDone=true;throw new Error("STREAM_DONE");}}catch(e){if(String(e.message).indexOf("STREAM_DONE")<0)globalThis.__strErr=String(e);}`;
          c = c.replace(target, inject);
          console.log('[SAV] 主循环插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_save_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[SAV] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() },
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
  try {
    const data = w.eval('JSON.stringify(__stream)');
    fs.writeFileSync('/tmp/nx_stream_trace.json', data);
    console.log('[SAV] saved /tmp/nx_stream_trace.json len=', data.length);
  } catch (e) { console.log('[SAV] dump ERR:', e.message); }
  console.log('[SAV] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[SAV] FATAL:', e && e.message); process.exit(1); });

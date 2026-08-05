// 保存 opcode 流 + 分析
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        let c = code;
        // 插桩：记录 opcode 流 + 关键状态（_$k0 访问检测 base 头）
        const target = 'while(1){_$pW=_$bk[_$g6++];';
        if (c.indexOf(target) >= 0) {
          const inject = `while(1){_$pW=_$bk[_$g6++];try{var __s=globalThis.__stream||(globalThis.__stream=[]);__s.push({op:_$pW,pc:_$g6-1});if(__s.length>500000)break;}catch(e){}}`;
          c = c.replace(target, inject);
        }
        // 记录 basearr 构造：hook Array push 检测 59/179 头? 先不管
        fs.writeFileSync('/tmp/nx_dynCode_stream2_patched.js', c);
        code = c;
      }
    } catch (e) {}
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
    console.log('saved /tmp/nx_stream_trace.json len=', data.length);
  } catch (e) { console.log('ERR', e.message); }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

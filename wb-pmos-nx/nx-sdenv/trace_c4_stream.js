// 插桩 _$c4 dispatcher 主循环：记录 aebi[1] opcode 执行流（basearr 构造路径）
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[STR] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[STR] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // ★ 插桩 _$c4 主循环 opcode 取值点
        // 主循环：_$pW=_$bk[_$g6++]; 记录 opcode 流
        const target = 'while(1){_$pW=_$bk[_$g6++];';
        if (c.indexOf(target) >= 0) {
          const inject = `while(1){_$pW=_$bk[_$g6++];try{globalThis.__stream=globalThis.__stream||[];globalThis.__stream.push(_$pW);if(globalThis.__stream.length>300000){globalThis.__streamDone=globalThis.__stream.length;}}catch(e){if(!globalThis.__strErr)globalThis.__strErr=String(e);}`;
          c = c.replace(target, inject);
          console.log('[STR] 主循环插桩 OK');
        } else { console.log('[STR] ✗ 主循环模式未找到'); }
        // 检测 basearr 构造：hook Array push/索引赋值太重，先检测 _$k0 常量访问
        // 尾部标记
        c = c.replace(/\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__T1=true;}($_ts.scj,$_ts.aebi);');
        fs.writeFileSync('/tmp/nx_dynCode_stream_patched.js', c);
        console.log('[STR] 已保存 patched len=' + c.length);
        code = c;
      }
    } catch (e) { console.log('[STR] hook err:', e.message); }
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
  const len = evalV('typeof __stream!=="undefined"?__stream.length:null');
  console.log('[STR] stream len:', len);
  console.log('[STR] __streamDone:', evalV('typeof __streamDone!=="undefined"?__streamDone:null'));
  console.log('[STR] __strErr:', evalV('typeof __strErr!=="undefined"?__strErr:null'));
  const head = evalV('typeof __stream!=="undefined"?JSON.stringify(__stream.slice(0,40)):null');
  console.log('[STR] head:', head);
  const tail = evalV('typeof __stream!=="undefined"?JSON.stringify(__stream.slice(-40)):null');
  console.log('[STR] tail:', tail);
  console.log('[STR] __T1:', evalV('typeof __T1!=="undefined"?__T1:null'));
  console.log('[STR] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[STR] FATAL:', e && e.message); process.exit(1); });

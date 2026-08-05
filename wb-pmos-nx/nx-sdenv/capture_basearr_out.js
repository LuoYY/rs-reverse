// 捕获 dynCode 生成的 basearr 数组：插桩 _$c4 主循环，检测 base 头（59/179）数组的出现
// 策略：hook Array push / 索引赋值太慢，改为监控 basearr 关键构造点
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[OUT] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[OUT] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // ★ 插桩：hook Array.prototype.push 检测 base 头（在 dynCode 作用域内所有数组）
        // 更精确：检测 head 数组 = [0,1,k0[15],...] 后 b2/dX/fp/_y/ey 处理
        // 直接 hook 这些处理函数的返回值
        for (const fn of ['_$b2', '_$dX', '_$fp', '_$_y', '_$ey']) {
          const re = new RegExp('function ' + fn + '\\(_\\$_i\\)\\{');
          const m = re.exec(c);
          if (m) {
            // 在函数末尾插桩：记录 _$_i 内容
            const fnBody = c.substring(m.index, m.index + 200);
            const closing = fnBody.lastIndexOf('}');
            // 简单方式：在函数体前插桩参数，在函数体后插桩结果
            const pat = 'function ' + fn + '(_$_i){';
            const inject = 'function ' + fn + '(_$_i){try{globalThis.__fnHits=globalThis.__fnHits||{};globalThis.__fnHits["' + fn + '"]=(globalThis.__fnHits["' + fn + '"]||0)+1;if(globalThis.__fnHits["' + fn + '"]<=3){(globalThis.__fnLog=globalThis.__fnLog||[]).push(JSON.stringify({fn:"' + fn + '",i:Array.from(_$_i).slice(0,30)}));}}catch(e){}';
            c = c.replace(pat, inject);
            console.log('[OUT] ' + fn + ' 插桩 OK');
          } else {
            console.log('[OUT] ✗ ' + fn + ' 未找到');
          }
        }
        fs.writeFileSync('/tmp/nx_dynCode_out_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[OUT] hook err:', e.message); }
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
  const evalV = (expr) => { try { return w.eval(expr); } catch (e) { return 'ERR:' + e.message; } };
  console.log('[OUT] __fnHits:', evalV('typeof __fnHits!=="undefined"?JSON.stringify(__fnHits):null'));
  const log = evalV('typeof __fnLog!=="undefined"?JSON.stringify(__fnLog):null');
  console.log('[OUT] __fnLog:', log);
  console.log('[OUT] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[OUT] FATAL:', e && e.message); process.exit(1); });

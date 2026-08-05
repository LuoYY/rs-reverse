// 定位 basearr 生成：插桩 _$aN（=String.fromCharCode，basearr 生成的必经路径）。
// 记录参数 140-200 字节的 fromCharCode 调用 → 那就是 basearr 生成。
// 同时记录调用栈（Error.stack）→ 定位生成函数。
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[AN] pid=%d start', process.pid);
  let dynCode = null;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000) {
        console.log('[AN] ★ 截获 dynCode len=' + code.length);
        dynCode = code;
        // 插桩：_$aN=String.fromCharCode 赋值处，替换为包装版本（记录大参数调用）
        let patched = code.replace(
          /_\$aN=String\.fromCharCode,/,
          '_$aN=function(){var __l=arguments.length;try{if(__l>=140&&__l<=220){var __a=Array.prototype.slice.call(arguments);window.__aN=window.__aN||[];window.__aN.push({len:__l,head:__a.slice(0,12),tail:__a.slice(-8)});window.__aNstack=new Error().stack;}}catch(e){}(function(){})();return String.fromCharCode.apply(null,arguments);},'
        );
        // 兜底：若上面没匹配，找 _$aN 任意赋值 String.fromCharCode 的模式
        if (!patched.includes('__aN')) {
          console.log('[AN] 直接匹配失败，尝试宽松');
          patched = code.replace(
            /_\$aN=String\.fromCharCode/,
            '_\$aN=function(){var __l=arguments.length;try{if(__l>=140&&__l<=220){var __a=Array.prototype.slice.call(arguments);window.__aN=window.__aN||[];window.__aN.push({len:__l,head:__a.slice(0,12)});window.__aNstack=new Error().stack;}}catch(e){}return String.fromCharCode.apply(null,arguments);}'
          );
        }
        patched = patched.replace(/\}\)\(_\$ts\.scj,_\$ts\.aebi\);/, 'window.__aNDone=true;}($_ts.scj,$_ts.aebi);');
        console.log('[AN] 插桩 __aN?', patched.includes('__aN'));
        code = patched;
      }
    } catch (e) { console.log('[AN] hook err:', e.message); }
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
  const getV = (e) => { try { return w.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const aN = getV('window.__aN ? JSON.stringify(window.__aN) : null');
  const aNDone = getV('window.__aNDone');
  const aNstack = getV('window.__aNstack');
  console.log('[AN] aNDone:', aNDone);
  if (aN && aN !== 'null') {
    console.log('[AN] fromCharCode 大参数调用数:', JSON.parse(aN).length);
    JSON.parse(aN).forEach((x, i) => console.log('[AN]   #' + i + ' len=' + x.len + ' head=' + x.head.join(',') + (x.tail ? ' tail=' + x.tail.join(',') : '')));
  } else { console.log('[AN] 无大参数 fromCharCode 调用 (aN=' + aN + ')'); }
  console.log('[AN] stack:', aNstack ? String(aNstack).split('\n').slice(1, 6).join(' | ') : 'null');
  const out = { aNDone, aN: aN ? JSON.parse(aN) : null, aNstack };
  fs.writeFileSync('/tmp/nx_basearr_aN.json', JSON.stringify(out, null, 1));
  if (dynCode) fs.writeFileSync('/tmp/nx_dynCode_captured_3.js', dynCode);
  console.log('[AN] saved /tmp/nx_basearr_aN.json done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[AN] FATAL:', e && e.message); process.exit(1); });

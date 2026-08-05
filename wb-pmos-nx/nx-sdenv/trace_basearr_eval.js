// 用 Proxy eval 截获 dynCode 并替换为插桩版（本地固定 challenge → dynCode 文本固定）
// 关键：jsdom 走 window.eval 执行 dynCode，Proxy apply 中改 args[0] 即可
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[EVL] pid=%d start', process.pid);
  let dynCode = null;
  let via = null;
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      try {
        const ne = w.eval;
        if (typeof ne === 'function') {
          const proxy = new Proxy(ne, {
            apply(target, thisArg, args) {
              try {
                const c = args[0];
                if (typeof c === 'string' && c.length > 400000 && c.indexOf('function _$c4') >= 0) {
                  if (!dynCode) {
                    dynCode = c;
                    via = 'Proxy eval';
                    console.log('[EVL] ★ eval 截获 len=' + c.length);
                    // ★ 插桩 1：尾部标记
                    let code = c.replace(/\}\)\(_ts\.scj,_ts\.aebi\);\s*$/, ';globalThis.__TAIL_HIT=1;}($_ts.scj,$_ts.aebi);');
                    // ★ 插桩 2：_$dJ 弹栈入口
                    const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
                    if (code.indexOf(dJPattern) >= 0) {
                      code = code.replace(dJPattern, `function _$dJ(){try{globalThis.__DJ_HIT=(globalThis.__DJ_HIT||0)+1;if(globalThis.__DJ_HIT<=5){globalThis.__DJ_LOG=globalThis.__DJ_LOG||[];globalThis.__DJ_LOG.push(JSON.stringify({dpLen:_$dp.length,hhk:(_$hh&&_$hh._$ky)?Object.keys(_$hh._$ky).slice(0,10):null,g0k:(_$g0&&_$g0._$ky)?Object.keys(_$g0._$ky).slice(0,10):null}));}}catch(e){globalThis.__DJ_ERR=String(e);}}`);
                      console.log('[EVL] _$dJ 插桩 OK');
                    } else { console.log('[EVL] ✗ _$dJ 模式未找到'); }
                    // ★ 插桩 3：_$k6 动态代码 dump
                    const k6Mark = '_$k6=_$mD[5][_$oU[17]](';
                    if (code.indexOf(k6Mark) >= 0) {
                      code = code.replace(k6Mark, 'try{globalThis.__K6_SAVE=_$k6;}catch(e){}' + k6Mark);
                      console.log('[EVL] _$k6 插桩 OK');
                    }
                    fs.writeFileSync('/tmp/nx_dynCode_eval_patched.js', code);
                    console.log('[EVL] 已保存 patched len=' + code.length);
                    args[0] = code; // 替换执行
                  }
                }
              } catch (e) { console.log('[EVL] hook err:', e.message); }
              return Reflect.apply(target, thisArg, args);
            },
          });
          proxy.toString = () => 'function eval() { [native code] }';
          w.eval = proxy;
        }
      } catch (e) { console.log('[EVL] eval proxy 失败:', e.message); }
    },
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
  for (const k of ['__TAIL_HIT', '__DJ_HIT', '__DJ_ERR', '__DJ_LOG', '__K6_SAVE']) {
    try {
      const v = w[k];
      if (typeof v === 'string') console.log('[EVL] ' + k + ':', v.substring(0, 400));
      else console.log('[EVL] ' + k + ':', JSON.stringify(v));
    } catch (e) { console.log('[EVL] ' + k + ' err:', e.message); }
  }
  console.log('[EVL] via=' + via + ' dynLen=' + (dynCode ? dynCode.length : 0));
  console.log('[EVL] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[EVL] FATAL:', e && e.message); process.exit(1); });

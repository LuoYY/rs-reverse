// 验证 dynCode IIFE 顶层执行路径：插桩 _$dp=[] 初始化 + 检查 _$hr 结果
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[VF] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[VF] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 插桩点1：IIFE 最开头（函数定义后第一段执行代码）
        // 插桩点2：_$dp=[] 初始化前
        const dpInit = '_$dp=[],_$pH=new _$eQ(),_$g0=_$pH,_$hh=_$pH,_$hr=[];';
        if (c.indexOf(dpInit) >= 0) {
          c = c.replace(dpInit, 'try{globalThis.__dpInit=1;globalThis.__dpPre=_$hr;}catch(e){}' + dpInit + 'try{globalThis.__dpInit2=1;globalThis.__hrInit=_$hr;}catch(e){}');
          console.log('[VF] _$dp 插桩 OK');
        }
        // 插桩点3：主循环后（return 前）
        const ret = 'return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};';
        if (c.indexOf(ret) >= 0) {
          c = c.replace(ret, 'try{globalThis.__retHit=1;globalThis.__retHr=Array.from(_$hr||[]).slice(0,50);globalThis.__retPhKeys=_$pH&&_$pH._$ky?Object.keys(_$pH._$ky).slice(0,20):null;}catch(e){globalThis.__retErr=String(e);}' + ret);
          console.log('[VF] return 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_vf_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[VF] hook err:', e.message); }
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
  console.log('[VF] __dpInit:', evalV('typeof __dpInit!=="undefined"?__dpInit:null'));
  console.log('[VF] __dpInit2:', evalV('typeof __dpInit2!=="undefined"?__dpInit2:null'));
  console.log('[VF] __retHit:', evalV('typeof __retHit!=="undefined"?__retHit:null'));
  console.log('[VF] __retHr:', evalV('typeof __retHr!=="undefined"?JSON.stringify(__retHr):null'));
  console.log('[VF] __retPhKeys:', evalV('typeof __retPhKeys!=="undefined"?JSON.stringify(__retPhKeys):null'));
  console.log('[VF] __retErr:', evalV('typeof __retErr!=="undefined"?__retErr:null'));
  console.log('[VF] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[VF] FATAL:', e && e.message); process.exit(1); });

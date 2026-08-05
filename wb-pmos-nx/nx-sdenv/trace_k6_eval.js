// 用 vm.runInContext hook 截获 dynCode 并插桩：dump _$k6（生成 basearr 的动态 JS 代码）
// 本地固定 challenge → dynCode 文本固定（492707）
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[K6] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patchedCount = 0;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && patchedCount === 0) {
        patchedCount++;
        console.log('[K6] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 1. 尾部标记（注意结尾是 $_ts.scj）
        c = c.replace(/\}\)\(_\$ts\.scj,_\$ts\.aebi\);\s*$/, ';globalThis.__TAIL_HIT=1;}($_ts.scj,$_ts.aebi);');
        // 2. dump _$k6（所有拼接点，保存最长值）
        c = c.replace(/_\$k6=_\$mD\[5\]\[_\$oU\[17\]\]\(/g,
          `(function(){try{var _v=arguments[0];var _s=(function(){try{return _v.join?''+_v.join(''):String(_v);}catch(e){return 'e';}})();if(!globalThis.__K6S)globalThis.__K6S=[];globalThis.__K6S.push({len:_s.length,val:_s});if(globalThis.__K6S.length>5)globalThis.__K6S.shift();}catch(e){}})(), _$k6=_$mD[5][_$oU[17]](`);
        // 3. _$dJ 弹栈插桩（确认是否与 basearr 相关）
        const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
        if (c.indexOf(dJPattern) >= 0) {
          c = c.replace(dJPattern, `function _$dJ(){try{globalThis.__DJ_HIT=(globalThis.__DJ_HIT||0)+1;}catch(e){}_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}`);
          console.log('[K6] _$dJ 插桩 OK');
        }
        // 4. basearr 输出位置：找返回对象 {_$fo:_$pH,_$dE:_$hr...
        const retPattern = 'return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};';
        if (c.indexOf(retPattern) >= 0) {
          c = c.replace(retPattern, `try{globalThis.__RET_SAVE={hrLen:(_$hr&&_$hr.length)?_$hr.length:null,hrHead:(_$hr&&_$hr.slice)?_$hr.slice(0,12):null,hrType:typeof _$hr};}catch(e){globalThis.__RET_ERR=String(e);}return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};`);
          console.log('[K6] return 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_k6_patched.js', c);
        console.log('[K6] 已保存 patched len=' + c.length);
        code = c;
      }
    } catch (e) { console.log('[K6] hook err:', e.message); }
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
  for (const k of ['__TAIL_HIT', '__DJ_HIT', '__K6S', '__RET_SAVE', '__RET_ERR']) {
    try {
      const v = w[k];
      if (typeof v === 'string') console.log('[K6] ' + k + ':', v.substring(0, 500));
      else if (Array.isArray(v)) { console.log('[K6] ' + k + ': array len=' + v.length); v.forEach((x, i) => console.log('[K6]   #' + i + ':', JSON.stringify(x).substring(0, 300))); }
      else console.log('[K6] ' + k + ':', JSON.stringify(v));
    } catch (e) { console.log('[K6] ' + k + ' err:', e.message); }
  }
  console.log('[K6] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[K6] FATAL:', e && e.message); process.exit(1); });

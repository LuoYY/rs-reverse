// 捕获 _$mD[615] 调用时的完整 _$md 状态（含执行环境），用于 Go 重现解释器
// 用 trace_1464 的稳定插桩（op=1464）+ 状态捕获
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[M6] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // op=1464 捕获：_$mD[615] 调用 + _$md 状态 + 输入输出
        const t1464 = 'if(_$pW===1464){_$mD[615](_$kt,_$ez,_$pL);}';
        // 捕获 _$md（JSVMP 状态：_$gS 字节码 + my 函数表）——_$mD[615] 内部闭包引用 _$md
        // _$md 是外层变量，插桩点可直接访问
        const cap = `try{window.__m6=window.__m6||[];var __ser=function(md){if(!md)return null;var myArr=[];if(md._$my&&md._$my.forEach){md._$my.forEach(function(f,i){if(typeof f==="function")myArr.push({fn:i});else if(f&&f._$gS)myArr.push({gs:f._$gS.slice?f._$gS.slice(0,50):f._$gS});else myArr.push(null);});}return {iH:md._$iH,fL:md._$fL,gS:typeof md._$gS==="string"?md._$gS:Array.isArray(md._$gS)?md._$gS.slice(0,50):null,my:myArr.slice(0,10),myLen:md._$my?md._$my.length:0};};window.__m6.push({md:__ser(typeof _$md!=="undefined"?_$md:null),kt:Array.isArray(_$kt)?_$kt.slice(0,30):null,e:typeof _$ez!=="undefined"?_$ez:null,l:typeof _$pL!=="undefined"?_$pL:null,hP:typeof _$hP!=="undefined"?(Array.isArray(_$hP)?{arr:true,len:_$hP.length}:typeof _$hP):null});if(window.__m6.length>200)window.__m6.shift();}catch(__e){window.__m6E=String(__e);}`;
        if (c.indexOf(t1464) >= 0) {
          c = c.split(t1464).join(cap + t1464);
          console.log('[M6] op1464 插桩 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_m6_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[M6] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const n = ev('typeof __m6!=="undefined"?__m6.length:0');
  console.log('[M6] 捕获数:', n, 'err:', ev('typeof __m6E!=="undefined"?__m6E:null'));
  const full = ev('typeof __m6!=="undefined"?JSON.stringify(__m6):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_m6_calls.json'), full);
  console.log('[M6] saved nx_m6_calls.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[M6] FATAL:', e && e.stack); process.exit(1); });

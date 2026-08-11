// patch _$cS（JSVMP 入口）：记录字节码执行轨迹 + 输入
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[J2] pid=' + process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[J2] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // patch _$cS：记录执行，包装 _$pC 记录每条 opcode
        const cS = 'function _$cS(){var _$aq,_$_T;';
        if (c.indexOf(cS) >= 0) {
          const inj = `function _$cS(){try{window.__js=window.__js||[];window.__js.push({k6:typeof _$k6!=="undefined"?_$k6:null,hZ:typeof _$hZ!=="undefined"?_$hZ:null,ie:typeof _$ie!=="undefined"?_$ie:null});var __oPC=_$pC;window.__oPC=__oPC;window.__pcC=window.__pcC||0;}catch(__e){window.__jsE=String(__e);}var _$aq,_$_T;`;
          c = c.split(cS).join(inj);
          console.log('[J2] _$cS 插桩 OK');
        } else console.log('[J2] ✗ _$cS 未找到');
        // patch _$pC 返回前记录
        const pCEnd = 'if(_$_T)return _$_T();';
        if (c.indexOf(pCEnd) >= 0) {
          const inj = `try{window.__ops=window.__ops||[];window.__ops.push({op:_$aq,hZ:_$hZ});if(window.__ops.length>50000)window.__ops.splice(0,25000);}catch(__e){window.__opE=String(__e);}` + pCEnd;
          c = c.split(pCEnd).join(inj);
          console.log('[J2] _$pC opcode 记录 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_jv2_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[J2] hook err:', e.message); }
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
  console.log('[J2] _cS 调用数:', ev('typeof __js!=="undefined"?__js.length:0'), 'err:', ev('typeof __jsE!=="undefined"?__jsE:null'));
  console.log('[J2] opcode 记录:', ev('typeof __ops!=="undefined"?__ops.length:0'), 'err:', ev('typeof __opE!=="undefined"?__opE:null'));
  const fullS = ev('typeof __js!=="undefined"?JSON.stringify(__js):null');
  if (fullS) fs.writeFileSync(path.join(__dirname, 'nx_jsvmp_cS.json'), fullS);
  const fullO = ev('typeof __ops!=="undefined"?JSON.stringify(__ops):null');
  if (fullO) fs.writeFileSync(path.join(__dirname, 'nx_jsvmp_ops.json'), fullO);
  console.log('[J2] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[J2] FATAL:', e && e.stack); process.exit(1); });

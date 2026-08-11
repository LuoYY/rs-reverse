// 终极插桩：patch _$pC（JSVMP 解释器）记录每条 opcode 执行 + _$dI 栈写入
// 还原 3 个编码器的完整行为 → 可在目标环境重现
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
  console.log('[JV] pid=' + process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[JV] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // patch _$pC（JSVMP 主循环）：记录 opcode 执行
        const pC = 'function _$pC(){var _$aq,_$_T;_$aq=_$ie[_$oU[17]](_$k6,_$hZ);';
        if (c.indexOf(pC) >= 0) {
          const inj = `function _$pC(){try{window.__jp=window.__jp||[];window.__jp.push({pc:_$hZ,op:(typeof _$ie!=="undefined"&&_$k6!=null)?_$ie[_$oU[17]](_$k6,_$hZ):null,k6:typeof _$k6!=="undefined"?String(_$k6).slice(0,30):null});if(window.__jp.length>30000)window.__jp.splice(0,15000);}catch(__e){window.__jpE=String(__e);}var _$aq,_$_T;_$aq=_$ie[_$oU[17]](_$k6,_$hZ);`;
          c = c.split(pC).join(inj);
          console.log('[JV] _$pC 插桩 OK');
        } else console.log('[JV] ✗ _$pC 未找到');
        // patch _$dI：记录栈写入
        const dI = 'function _$dI(_$aq,_$_T){var _$hr;';
        if (c.indexOf(dI) >= 0) {
          const inj = `function _$dI(_$aq,_$_T){try{window.__jd=window.__jd||[];window.__jd.push({n:_$aq,v:typeof _$_T!=="undefined"?_$_T:"-"});if(window.__jd.length>30000)window.__jd.splice(0,15000);}catch(__e){window.__jdE=String(__e);}var _$hr;`;
          c = c.split(dI).join(inj);
          console.log('[JV] _$dI 插桩 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_jv_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[JV] hook err:', e.message); }
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
  const nP = ev('typeof __jp!=="undefined"?__jp.length:0');
  const nD = ev('typeof __jd!=="undefined"?__jd.length:0');
  console.log('[JV] _$pC 记录:' + nP, ' _dI 记录:' + nD, 'errP:', ev('typeof __jpE!=="undefined"?__jpE:null'), 'errD:', ev('typeof __jdE!=="undefined"?__jdE:null'));
  const fullP = ev('typeof __jp!=="undefined"?JSON.stringify(__jp):null');
  if (fullP) fs.writeFileSync(path.join(__dirname, 'nx_jsvmp_pc.json'), fullP);
  const fullD = ev('typeof __jd!=="undefined"?JSON.stringify(__jd):null');
  if (fullD) fs.writeFileSync(path.join(__dirname, 'nx_jsvmp_di.json'), fullD);
  console.log('[JV] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[JV] FATAL:', e && e.stack); process.exit(1); });

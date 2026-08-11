// 捕获 JSVMP 编码器（_$aq）的 _$md VM 状态，离线重现编码逻辑
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
  console.log('[MD] pid=' + process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[MD] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // patch _$aq 函数：捕获 _$md
        const aqStart = c.indexOf('function _$aq(){var _$aq,_$_T,_$hr,_$kx,_$hi,_$ms;');
        if (aqStart >= 0) {
          const inject = `function _$aq(){try{window.__mdS=window.__mdS||[];window.__mdS.push({gS:_$md&&_$md._$gS,my:_$md&&_$md._$my,iH:_$md&&_$md._$iH,fL:_$md&&_$md._$fL});if(window.__mdS.length>200)window.__mdS.splice(0,100);}catch(__e){window.__mdE=String(__e);}var _$aq,_$_T,_$hr,_$kx,_$hi,_$ms;`;
          c = c.slice(0, aqStart) + inject + c.slice(aqStart + 'function _$aq(){'.length);
          console.log('[MD] _$aq patch OK');
        } else console.log('[MD] ✗ _$aq 未找到');
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_md_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[MD] hook err:', e.message); }
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
  const n = ev('typeof __mdS!=="undefined"?__mdS.length:0');
  console.log('[MD] _$md 捕获数:', n, 'err:', ev('typeof __mdE!=="undefined"?__mdE:null'));
  const full = ev('typeof __mdS!=="undefined"?JSON.stringify(__mdS):null');
  if (full) {
    fs.writeFileSync(path.join(__dirname, 'nx_md_states.json'), full);
    const d = JSON.parse(full);
    console.log('[MD] 首条: gS=' + (d[0].gS ? d[0].gS.slice(0, 50) : 'null') + ' my_len=' + (d[0].my ? d[0].my.length : 0) + ' iH=' + d[0].iH + ' fL=' + d[0].fL);
  }
  console.log('[MD] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[MD] FATAL:', e && e.stack); process.exit(1); });

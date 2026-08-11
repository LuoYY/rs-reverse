// 捕获 _$ez 完整内容（1532，base numarr 编码）+ _$c4 内所有候选数组变量
// 目的：从 _$ez 反解 base，找到 [78:90] 的编码位置
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_ez_full_final.json');

(async () => {
  console.log('[EZF] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[EZF] ★ 截获 dynCode len=' + code.length);
        let c = code;
        const retTarget = 'return _$hF.apply(this,_$eS);';
        if (c.indexOf(retTarget) >= 0) {
          const inject = `try{globalThis.__ezSnap=globalThis.__ezSnap||[];if(globalThis.__ezSnap.length<3){var __ezObj=(typeof _$ez!=="undefined")?(Array.isArray(_$ez)?{t:"a",v:Array.from(_$ez)}:(typeof _$ez==="string"?{t:"s",v:Array.from(_$ez).map(function(x){return x.charCodeAt(0);})}:{t:typeof _$ez})):null;globalThis.__ezSnap.push({ez:__ezObj});}}catch(__e){globalThis.__ezFE=String(__e);}` + retTarget;
          c = c.split(retTarget).join(inject);
          console.log('[EZF] 插桩 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_ezf_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[EZF] hook err:', e.message); }
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[EZF] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[EZF] err:', ev('typeof __ezFE!=="undefined"?__ezFE:null'));
  const snap = ev('typeof __ezSnap!=="undefined"?JSON.stringify(__ezSnap):null');
  if (snap) fs.writeFileSync(OUT, snap);
  console.log('[EZF] saved len:', ev('typeof __ezSnap!=="undefined"&&__ezSnap[0]?__ezSnap[0].ez.v.length:0'));
  console.log('[EZF] ez head:', ev('typeof __ezSnap!=="undefined"&&__ezSnap[0]?JSON.stringify(__ezSnap[0].ez.v.slice(0,20)):null'));
  console.log('[EZF] ez tail:', ev('typeof __ezSnap!=="undefined"&&__ezSnap[0]?JSON.stringify(__ezSnap[0].ez.v.slice(-20)):null'));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[EZF] FATAL:', e && e.message); process.exit(1); });

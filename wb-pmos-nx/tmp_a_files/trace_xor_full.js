// 捕获 XOR 循环（op611）前后 _$ez 的完整快照，分析 base 编码链路
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_xor_full.json');

(async () => {
  console.log('[XF] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !patched) {
        patched = true;
        console.log('[XF] ★ 截获 dynCode len=' + code.length);
        let c = code;
        const target = '_$pW=_$bk[_$g6++];';
        if (c.indexOf(target) >= 0) {
          const inject = `_$pW=_$bk[_$g6++];try{if(_$pW===611||_$pW===1615){globalThis.__xfull=globalThis.__xfull||[];var __ezInfo=(typeof _$ez!=="undefined")?(Array.isArray(_$ez)?{t:"arr",len:_$ez.length,head:Array.from(_$ez.slice(0,16)),tail:Array.from(_$ez.slice(-8))}:(typeof _$ez==="string")?{t:"str",len:_$ez.length,head:Array.from(_$ez.slice(0,16)).map(function(x){return x.charCodeAt(0);})}:{t:typeof _$ez}):null;var __pl=(typeof _$pL!=="undefined")?(Array.isArray(_$pL)?Array.from(_$pL):null):null;var __k=(typeof _$kB!=="undefined")?Array.from(_$kB):null;globalThis.__xfull.push({pc:_$g6-1,op:_$pW,ez:__ezInfo,pl:__pl,k:__k});if(globalThis.__xfull.length>200)globalThis.__xfull.splice(0,100);}}catch(e){if(!globalThis.__xfE)globalThis.__xfE=String(e);}`;
          c = c.split(target).join(inject);
          console.log('[XF] 主循环插桩 OK');
        } else { console.log('[XF] ✗ 主循环模式未找到'); }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_xf_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[XF] hook err:', e.message); }
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
  console.log('[XF] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[XF] err:', ev('typeof __xfE!=="undefined"?__xfE:null'));
  const n = ev('typeof __xfull!=="undefined"?__xfull.length:0');
  console.log('[XF] __xfull:', n);
  const full = ev('typeof __xfull!=="undefined"?JSON.stringify(__xfull):null');
  if (full) fs.writeFileSync(OUT, full);
  console.log('[XF] saved', OUT);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[XF] FATAL:', e && e.message); process.exit(1); });

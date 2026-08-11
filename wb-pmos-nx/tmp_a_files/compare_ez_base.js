// 关键：同时捕获 _$ez[143] 与解出的真实 base，验证 XOR/huffman 关系
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_ez_base_pair.json');

(async () => {
  console.log('[EB] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !patched) {
        patched = true;
        console.log('[EB] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 捕获 143 长度时的完整 _$ez（含中间态），以及 209/1532
        const target = '_$pW=_$bk[_$g6++];';
        const inject = `_$pW=_$bk[_$g6++];try{if(typeof _$ez!=="undefined"&&_$ez){var __l=_$ez.length;if(__l===143||__l===209||__l===1532){globalThis.__ebp=globalThis.__ebp||{};if(!globalThis.__ebp[__l])globalThis.__ebp[__l]={t:(Array.isArray(_$ez)?"a":"s"),full:Array.isArray(_$ez)?Array.from(_$ez):_$ez.split("").map(function(x){return x.charCodeAt(0);})};}}}catch(e){if(!globalThis.__ebE)globalThis.__ebE=String(e);}`;
        c = c.split(target).join(inject);
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_eb_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[EB] hook err:', e.message); }
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
  console.log('[EB] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[EB] err:', ev('typeof __ebE!=="undefined"?__ebE:null'));
  const ebp = ev('typeof __ebp!=="undefined"?JSON.stringify(__ebp):null');
  if (ebp) fs.writeFileSync(OUT, ebp);
  console.log('[EB] saved, len143=', ev('typeof __ebp!=="undefined"&&__ebp[143]?__ebp[143].full.length:0'));
  console.log('[EB] len209=', ev('typeof __ebp!=="undefined"&&__ebp[209]?__ebp[209].full.length:0'));
  console.log('[EB] len1532=', ev('typeof __ebp!=="undefined"&&__ebp[1532]?__ebp[1532].full.length:0'));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[EB] FATAL:', e && e.message); process.exit(1); });

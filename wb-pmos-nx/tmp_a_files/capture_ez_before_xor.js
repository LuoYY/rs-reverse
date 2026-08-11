// 捕获 XOR 循环前 _$ez 的完整内容（base huffman 编码后）
// 对比解出的 base，理解编码关系
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_ez_before_xor.json');

(async () => {
  console.log('[EZ] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !patched) {
        patched = true;
        console.log('[EZ] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // op=611 是 XOR 循环内。首次进入前 ez 是原始，XOR 后是加密。
        // 但 611 是循环内每个迭代。用另一策略：hook _$ez 的赋值
        // 更简单：在 op=611 前一个 opcode 后捕获。或直接捕获 _$ez 变长的时刻。
        // 插桩：每次 op 取值时如果 _$ez 长度变化且 > 140 就记录
        const target = '_$pW=_$bk[_$g6++];';
        const inject = `_$pW=_$bk[_$g6++];try{if(typeof _$ez!=="undefined"&&_$ez){var __l=typeof _$ez==="string"?_$ez.length:_$ez.length;if(__l>140&&__l<1600){globalThis.__ezs=globalThis.__ezs||{};if(!globalThis.__ezs[__l])globalThis.__ezs[__l]={head:Array.from((Array.isArray(_$ez)?_$ez:_$ez.split("")).slice(0,80)),tail:Array.from((Array.isArray(_$ez)?_$ez:_$ez.split("")).slice(-20))};}}}catch(e){if(!globalThis.__ezE)globalThis.__ezE=String(e);}`;
        c = c.split(target).join(inject);
        console.log('[EZ] 插桩 OK');
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_ez_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[EZ] hook err:', e.message); }
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
  console.log('[EZ] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[EZ] err:', ev('typeof __ezE!=="undefined"?__ezE:null'));
  const ezs = ev('typeof __ezs!=="undefined"?JSON.stringify(__ezs):null');
  console.log('[EZ] __ezs:', ezs ? ezs.slice(0, 2000) : 'none');
  if (ezs) fs.writeFileSync(OUT, ezs);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[EZ] FATAL:', e && e.message); process.exit(1); });

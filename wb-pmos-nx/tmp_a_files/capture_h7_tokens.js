// 捕获 _$h7(gS) 产出的 token 流：patch _$h7 函数，在其 return 前记录所有 token
// 方法：在 dynCode 里 _$h7 函数体末尾（return _$pC）前注入 token 记录
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
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[T7] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 _$h7 函数内：_$pC 调用处记录 token
        // _$h7 的 return _$pC; 是工厂返回。但 tokenizer 单步在 _$pC()
        // patch _$pC 函数体开头记录每次调用返回的 token
        // _$pC(){...} 结构：function _$pC(){var _$aq,_$_T;_$aq=_$ie...return _$_T();...}
        // 在 return _$_T(); 前记录 token 类型+值
        const pCPat = 'function _$pC(){var _$aq,_$_T;_$aq=_$ie[_$oU[17]](_$k6,_$hZ);';
        if (c.indexOf(pCPat) >= 0) {
          // 在 _$pC 里 return _$_T(); 前插入记录（用 _$$m 返回前记录）
          // 更简单：patch _$$m 函数（所有 token 的构造点）
          const mPat = 'function _$$m(_$aq,_$_T){var _$hr;_$hr=_$eg[_$p_],';
          if (c.indexOf(mPat) >= 0) {
            const inj = `function _$$m(_$aq,_$_T){try{window.__toks=window.__toks||[];var __tobj={t:_$aq,v:typeof _$_T==="string"?_$_T:_$_T};window.__toks.push(__tobj);if(window.__toks.length>20000)window.__toks.splice(0,10000);}catch(__e){window.__tE=String(__e);}var _$hr;_$hr=_$eg[_$p_],`;
            c = c.split(mPat).join(inj);
            console.log('[T7] _$$m 插桩 OK');
          } else console.log('[T7] ✗ _$$m 未找到');
        } else console.log('[T7] ✗ _$pC 未找到');
        // 保存插桩版
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_toks_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[T7] hook err:', e.message); }
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
  const n = ev('typeof __toks!=="undefined"?__toks.length:0');
  console.log('[T7] token 数:', n, 'err:', ev('typeof __tE!=="undefined"?__tE:null'));
  const full = ev('typeof __toks!=="undefined"?JSON.stringify(__toks):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_tokens_all.json'), full);
  console.log('[T7] saved nx_tokens_all.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[T7] FATAL:', e && e.stack); process.exit(1); });

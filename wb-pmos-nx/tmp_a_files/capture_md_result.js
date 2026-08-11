// 捕获 _$iE 解析出的完整 _$md 状态（_$hr 返回值）——Go 重现的核心配置
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
        console.log('[MR] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 _$iE 函数体开头注入：_$kx(_$aq) 后捕获 _$aq（_$hr 结果）
        // _$iE 结构：_$aq=_$hr(_$aq),_$hP[49]=_$aq,_$dt=_$pE._$b3,_$kx(_$aq);
        const pat = '_$aq=_$hr(_$aq),_$hP[49]=_$aq,_$dt=_$pE._$b3,_$kx(_$aq);';
        if (c.indexOf(pat) >= 0) {
          const inj = `_$aq=_$hr(_$aq),_$hP[49]=_$aq,_$dt=_$pE._$b3,try{window.__mdCap=window.__mdCap||[];var __md=_$aq;window.__mdCap.push({cG:__md._$cG,as:Array.isArray(__md._$as)?__md._$as.length:null,db:Array.isArray(__md._$db)?__md._$db.length:null,_0:Array.isArray(__md._$_0)?__md._$_0.length:null,g9:Array.isArray(__md._$g9)?__md._$g9.length:null,m3:__md._$m3,fB:__md._$fB,j5:{iH:__md._$j5?__md._$j5._$iH:null,fL:__md._$j5?__md._$j5._$fL:null,gSL:__md._$j5&&__md._$j5._$gS?__md._$j5._$gS.length:null,my:__md._$j5&&__md._$j5._$my?__md._$j5._$my.length:null,jR:__md._$j5&&__md._$j5._$jR?__md._$j5._$jR.length:null}});if(window.__mdCap.length>10)window.__mdCap.shift();}catch(__e){window.__mdE=String(__e);}_$kx(_$aq);`;
          c = c.split(pat).join(inj);
          console.log('[MR] _$md 捕获 OK');
        } else console.log('[MR] ✗ 模式未找到');
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_mdR_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[MR] hook err:', e.message); }
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
  const n = ev('typeof __mdCap!=="undefined"?__mdCap.length:0');
  console.log('[MR] 捕获数:', n, 'err:', ev('typeof __mdE!=="undefined"?__mdE:null'));
  const full = ev('typeof __mdCap!=="undefined"?JSON.stringify(__mdCap):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_md_result.json'), full);
  console.log('[MR] saved nx_md_result.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[MR] FATAL:', e && e.stack); process.exit(1); });

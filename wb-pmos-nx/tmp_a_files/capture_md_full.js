// 捕获 _$iE 解析的完整 _$md 状态（含 my/jR 递归结构），函数用标记表示
// 用成功过的 capture_iE_v2 插桩（稳定触发）+ 完整状态捕获
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
        console.log('[MF] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 _$iE 里捕获 _$hr 结果（_$aq），递归序列化 my/jR
        const mdPat = '_$aq=_$hr(_$aq),_$hP[49]=_$aq,_$dt=_$pE._$b3,_$kx(_$aq);';
        if (c.indexOf(mdPat) >= 0) {
          // 序列化 _$md（my/jR 递归，函数→{fn:idx}，字符串→s，数字→n）
          const serFn = `function __serMD(md,depth){if(depth>10)return{d:true};var o={cG:md._$cG,m3:md._$m3,fB:md._$fB};o.g9=Array.isArray(md._$g9)?md._$g9.map(function(x){return typeof x==="string"?{s:x}:(typeof x==="number"?{n:x}:{o:true});}):null;var j5=md._$j5;o.j5={iH:j5?j5._$iH:null,fL:j5?j5._$fL:null,gS:j5&&typeof j5._$gS==="string"?{s:j5._$gS.slice(0,200)}:null};if(j5&&Array.isArray(j5._$my)){o.j5.my=j5._$my.slice(0,60).map(function(f,i){if(typeof f==="function")return{fn:i};return __serMD(f,depth+1);});o.j5.myLen=j5._$my.length;}if(j5&&Array.isArray(j5._$jR)){o.j5.jR=j5._$jR.slice(0,60).map(function(f,i){if(typeof f==="function")return{fn:i};return __serMD(f,depth+1);});o.j5.jRLen=j5._$jR.length;}return o;}`;
          const inj = `_$aq=_$hr(_$aq),_$hP[49]=_$aq,_$dt=_$pE._$b3,try{window.__mdFull=window.__mdFull||[];${serFn}window.__mdFull.push(__serMD(_$aq,0));if(window.__mdFull.length>5)window.__mdFull.shift();}catch(__e){window.__mdFE=String(__e);}_$kx(_$aq);`;
          c = c.split(mdPat).join(inj);
          console.log('[MF] _$md 完整捕获 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_mdF_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[MF] hook err:', e.message); }
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
  const n = ev('typeof __mdFull!=="undefined"?__mdFull.length:0');
  console.log('[MF] 捕获数:', n, 'err:', ev('typeof __mdFE!=="undefined"?__mdFE:null'));
  const full = ev('typeof __mdFull!=="undefined"?JSON.stringify(__mdFull):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_md_full.json'), full);
  console.log('[MF] saved nx_md_full.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[MF] FATAL:', e && e.stack); process.exit(1); });

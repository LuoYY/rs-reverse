// 捕获 _$iE 完整参数（全数组值，用于纯 Node 离线重放）
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
        console.log('[IF] ★ 截获 dynCode len=' + code.length);
        let c = code;
        const headPat = 'function _$iE(_$aq,_$k6,_$hZ,_$nD,_$oA,_$jM,_$hP){var _$_T,_$pE,_$dt;';
        if (c.indexOf(headPat) >= 0) {
          // 完整捕获：gS 字符串 + 6 个数组（用 JSON 序列化，数组可能含函数需处理）
          const inj = headPat + `try{window.__ieFull=window.__ieFull||[];var __ser=function(a){if(typeof a==="string")return {s:a};if(Array.isArray(a)){try{return {arr:a.map(function(x){return (typeof x==="function")?{f:true}:(typeof x==="object"&&x)?{o:true}:(typeof x==="number")?x:(typeof x==="string")?{str:x}:null});}}catch(e){return {err:String(e)};}}if(a===null)return null;return {t:typeof a,v:String(a).slice(0,50)};};window.__ieFull.push({gs:__ser(_$aq),k6:__ser(_$k6),hZ:__ser(_$hZ),nD:__ser(_$nD),oA:__ser(_$oA),jM:__ser(_$jM),hP:__ser(_$hP)});if(window.__ieFull.length>50)window.__ieFull.shift();}catch(__e){window.__ieFE=String(__e);}`;
          c = c.split(headPat).join(inj);
          console.log('[IF] _$iE 完整参数捕获 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_iEF_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[IF] hook err:', e.message); }
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
  const n = ev('typeof __ieFull!=="undefined"?__ieFull.length:0');
  console.log('[IF] 调用数:', n, 'err:', ev('typeof __ieFE!=="undefined"?__ieFE:null'));
  const full = ev('typeof __ieFull!=="undefined"?JSON.stringify(__ieFull):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_iE_full.json'), full);
  console.log('[IF] saved nx_iE_full.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[IF] FATAL:', e && e.stack); process.exit(1); });

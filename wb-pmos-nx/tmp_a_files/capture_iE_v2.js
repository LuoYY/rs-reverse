// v2: 安全捕获 _$iE 完整参数（避免插桩破坏语法）
// 方法：把 _$iE 函数整体替换为"包装版"（复制原函数体 + 参数捕获）
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
        console.log('[IV] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 找 _$iE 函数完整范围，替换为包装版
        const fnIdx = c.indexOf('function _$iE(');
        if (fnIdx >= 0) {
          let depth = 0, end = -1;
          for (let k = c.indexOf('{', fnIdx); k < c.length; k++) {
            if (c[k] === '{') depth++;
            else if (c[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
          }
          const origFn = c.slice(fnIdx, end + 1);
          // 包装：保存参数到 window，然后调用原逻辑
          // 直接把捕获插到函数第一行（var 声明后）
          const varEnd = origFn.indexOf(';') + 1;
          const capture = `try{window.__ieV2=window.__ieV2||[];var __ser=function(arr){if(!Array.isArray(arr))return {t:typeof arr};var out=[],skip=0;for(var __i=0;__i<arr.length;__i++){var x=arr[__i];if(typeof x==="function"){skip++;out.push({f:true});}else if(typeof x==="object"&&x!==null){skip++;out.push({o:true});}else out.push(x);}return {len:arr.length,skip:skip,vals:out};};window.__ieV2.push({aq:typeof _$aq==="string"?_$aq:null,k6:__ser(_$k6),hZ:__ser(_$hZ),nD:__ser(_$nD),oA:__ser(_$oA),jM:__ser(_$jM),hP:__ser(_$hP)});if(window.__ieV2.length>30)window.__ieV2.shift();}catch(__e){window.__ieV2E=String(__e);}`;
          // ★ 同时捕获 _$iE 内部 _$hr 解析结果（_$md 状态）
          const mdPat = '_$aq=_$hr(_$aq),_$hP[49]=_$aq,_$dt=_$pE._$b3,_$kx(_$aq);';
          if (c.indexOf(mdPat) >= 0) {
            const mdInj = `_$aq=_$hr(_$aq),_$hP[49]=_$aq,_$dt=_$pE._$b3,window.__mdCap=window.__mdCap||[];try{var __md=_$aq;window.__mdCap.push({cG:__md._$cG,as:Array.isArray(__md._$as)?__md._$as.length:null,g9:Array.isArray(__md._$g9)?__md._$g9.length:null,m3:__md._$m3,fB:__md._$fB,j5iH:__md._$j5?_$md._$j5._$iH:null});}catch(__e){window.__mdE=String(__e);}_$kx(_$aq);`;
            c = c.split(mdPat).join(mdInj);
            console.log('[IV] _$md 状态捕获 OK');
          }
          const wrapped = origFn.slice(0, varEnd) + capture + origFn.slice(varEnd);
          c = c.slice(0, fnIdx) + wrapped + c.slice(end + 1);
          console.log('[IV] _$iE 包装 OK');
        } else console.log('[IV] ✗ function _$iE( 未找到');
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_iEV2_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[IV] hook err:', e.message); }
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
  const n = ev('typeof __ieV2!=="undefined"?__ieV2.length:0');
  console.log('[IV] 调用数:', n, 'err:', ev('typeof __ieV2E!=="undefined"?__ieV2E:null'));
  const full = ev('typeof __ieV2!=="undefined"?JSON.stringify(__ieV2):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_iE_v2.json'), full);
  const md = ev('typeof __mdCap!=="undefined"?JSON.stringify(__mdCap):null');
  if (md) fs.writeFileSync(path.join(__dirname, 'nx_md_result.json'), md);
  console.log('[IV] saved nx_iE_v2.json + nx_md_result.json, md:', md ? JSON.parse(md).length : 'null');
  console.log('[IV] mdErr:', ev('typeof __mdE!=="undefined"?__mdE:null'));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[IV] FATAL:', e && e.stack); process.exit(1); });

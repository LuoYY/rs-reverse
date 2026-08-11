// 终极插桩：捕获 op=1464/1465（_$mD[615] 编码调用）的输入值 + kt 写入
// 理解 base 编码区的每个值来源（keys/环境/时间戳）
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
  console.log('[T1] pid=' + process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[T1] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 在 op=1464/1465 分支前注入（记录 _$ez/_$pL/_$kB/_$gc/_$kt 值）
        // 精确模式：if(_$pW===1464){_$mD[615](_$kt,_$ez,_$pL);}
        const t1464 = 'if(_$pW===1464){_$mD[615](_$kt,_$ez,_$pL);}';
        const t1465 = 'if(_$pW===1465){_$mD[615](_$ez,_$kB,_$gc);}';
        const capture = `try{window.__v=window.__v||[];var __vt=(typeof _$ez!=="undefined"?_$ez:"-");var __vp=(typeof _$pL!=="undefined"?_$pL:"-");var __vb=(typeof _$kB!=="undefined"?_$kB:"-");window.__v.push({p:arguments[0],e:__vt,l:__vp,b:__vb,kt:Array.isArray(_$kt)?Array.from(_$kt.slice(0,Math.min(_$kt.length,220))):null,cV:typeof _$cV!=="undefined"?_$cV:null});if(window.__v.length>2000)window.__v.splice(0,1000);}catch(__e){window.__vE=String(__e);}`;
        if (c.indexOf(t1464) >= 0) {
          c = c.split(t1464).join(capture + t1464);
          console.log('[T1] op=1464 插桩 OK');
        } else console.log('[T1] ✗ 1464 模式未找到');
        if (c.indexOf(t1465) >= 0) {
          c = c.split(t1465).join(capture + t1465);
          console.log('[T1] op=1465 插桩 OK');
        } else console.log('[T1] ✗ 1465 模式未找到');
        // ★ 同时包装 _$h7 记录 token 流
        const retPat = 'return _$pC;function _$kx(){_$jM=0;}';
        if (c.indexOf(retPat) >= 0) {
          const inj = `var __origPC=_$pC;window.__tokStreams=window.__tokStreams||[];var __capPC=function(){var __orig=__origPC;var __wrap=function(){try{var r=__orig.apply(this,arguments);window.__tokStreams[window.__tokStreams.length-1].push({t:r._$b4,v:typeof r._$g$==="string"?r._$g$:(r._$g$&&r._$g$.length!==undefined?"L"+r._$g$.length:String(r._$g$))});return r;}catch(e){window.__tokStreams[window.__tokStreams.length-1].push({ERR:String(e&&e.message||e)});throw e;}};return __wrap;};window.__h7Count=(window.__h7Count||0)+1;window.__tokStreams.push([]);return __capPC();function _$kx(){_$jM=0;}`;
          c = c.split(retPat).join(inj);
          console.log('[T1] _$h7 包装 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_1464_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[T1] hook err:', e.message); }
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
  const n = ev('typeof __v!=="undefined"?__v.length:0');
  console.log('[T1] 记录数:', n, 'err:', ev('typeof __vE!=="undefined"?__vE:null'));
  const full = ev('typeof __v!=="undefined"?JSON.stringify(__v):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_1464_calls.json'), full);
  // token 流
  const h7n = ev('typeof __h7Count!=="undefined"?__h7Count:0');
  console.log('[T1] _$h7 调用数:', h7n);
  const toks = ev('typeof __tokStreams!=="undefined"?JSON.stringify(__tokStreams):null');
  if (toks) {
    fs.writeFileSync(path.join(__dirname, 'nx_token_streams.json'), toks);
    const lens = JSON.parse(toks).map(x => x.length);
    console.log('[T1] token 流长度:', lens.join(','));
  }
  console.log('[T1] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[T1] FATAL:', e && e.stack); process.exit(1); });

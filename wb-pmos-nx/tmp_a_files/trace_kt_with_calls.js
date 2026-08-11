// 同运行整合插桩：_$c4 调用(带序号) + _$g1 快照(带序号)
// 目标：找到最终 _$kt(209B) 构建期间的调用序列
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
  console.log('[KC] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[KC] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 1. _$c4 入口：记录调用
        const fnIdx = c.indexOf('function _$c4(');
        let depth = 0, end = -1;
        for (let i = fnIdx; i < c.length; i++) {
          if (c[i] === '{') depth++;
          else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end > 0) {
          const bodyStart = c.indexOf('{', fnIdx) + 1;
          const inject = `try{window.__seq=window.__seq||0;window.__sq=(window.__sq||0)+1;var __cur=window.__sq;window.__calls=window.__calls||[];var __a=Array.from(arguments);window.__calls.push({seq:__cur,op:__a[0],args:__a.slice(1).map(function(x){return Array.isArray(x)?("arr:"+x.length):(typeof x==="object"&&x!==null?"obj":String(x).slice(0,14));}).join("|")});if(window.__calls.length>6000)window.__calls.splice(0,3000);}catch(__e){window.__ccE=String(__e);}`;
          c = c.slice(0, bodyStart) + inject + c.slice(bodyStart);
          console.log('[KC] _$c4 入口注入 OK');
        }
        // 2. _$g1：记录快照 + 当前调用序号
        const g1Target = 'function _$g1(){_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
        if (c.indexOf(g1Target) >= 0) {
          const inject = 'function _$g1(){try{window.__ktW=window.__ktW||[];window.__ktW.push({seq:window.__sq||0,cV:_$cV,kt:Array.isArray(_$kt)?Array.from(_$kt.slice(0,Math.min(_$kt.length,230))):null});if(window.__ktW.length>6000)window.__ktW.splice(0,3000);}catch(__e){window.__ktE=String(__e);}_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
          c = c.split(g1Target).join(inject);
          console.log('[KC] _$g1 注入 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_kc_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[KC] hook err:', e.message); }
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
  console.log('[KC] calls:', ev('typeof __calls!=="undefined"?__calls.length:0'), 'ktW:', ev('typeof __ktW!=="undefined"?__ktW.length:0'));
  console.log('[KC] err:', ev('typeof __ccE!=="undefined"?__ccE:null'), ev('typeof __ktE!=="undefined"?__ktE:null'));
  const full = ev('typeof __calls!=="undefined"?JSON.stringify(__calls):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_calls_synced.json'), full);
  const kt = ev('typeof __ktW!=="undefined"?JSON.stringify(__ktW):null');
  if (kt) fs.writeFileSync(path.join(__dirname, 'nx_ktw_synced.json'), kt);
  console.log('[KC] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[KC] FATAL:', e && e.stack); process.exit(1); });

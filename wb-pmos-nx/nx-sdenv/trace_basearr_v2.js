// 插桩 dynCode 追踪 basearr 构造（修正结尾正则：$_ts.scj）
// 插桩目标：_$pg（hex 解码器入口，basearr 生成关键）+ _$dJ（弹栈）+ 尾部标记
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[V2] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[V2] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // ★ 插桩 1：_$pg（hex 解码 basearr 入口）
        const pgPattern = 'function _$pg(){return _$kZ(_$oP[118]);}';
        if (c.indexOf(pgPattern) >= 0) {
          c = c.replace(pgPattern,
            'function _$pg(){var __in=(typeof _$oP!=="undefined")?(typeof _$oP[118]==="string"?_$oP[118].slice(0,800):"notstr:"+typeof _$oP[118]):"noop";try{globalThis.__pgIn=__in}catch(e){}var __r=_$kZ(_$oP[118]);try{globalThis.__pgOut=typeof __r==="string"?__r.slice(0,300):(__r&&__r.length?Array.from(__r).slice(0,60):String(__r))}catch(e){}try{globalThis.__pgHit=(globalThis.__pgHit||0)+1}catch(e){}return __r;}');
          console.log('[V2] _$pg 插桩 OK');
        } else { console.log('[V2] ✗ _$pg 模式未找到'); }
        // ★ 插桩 2：_$kZ（hex 解码器，记录所有输入）
        const kzPattern = 'function _$kZ(_$aq){var _$_T,_$hr,_$kx;_$_T=_$aq.split';
        if (c.indexOf(kzPattern) >= 0) {
          c = c.replace(kzPattern,
            'function _$kZ(_$aq){try{globalThis.__kzHits=(globalThis.__kzHits||0)+1;globalThis.__kzLast=(globalThis.__kzLast||[]);globalThis.__kzLast.push(typeof _$aq==="string"?"len:"+_$aq.length+":"+_$aq.slice(0,500):"nonstr");if(globalThis.__kzLast.length>10)globalThis.__kzLast.shift();}catch(e){}var _$_T,_$hr,_$kx;_$_T=_$aq.split');
          console.log('[V2] _$kZ 插桩 OK');
        } else { console.log('[V2] ✗ _$kZ 模式未找到'); }
        // ★ 插桩 3：_$dJ 弹栈
        const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
        if (c.indexOf(dJPattern) >= 0) {
          c = c.replace(dJPattern,
            'function _$dJ(){try{globalThis.__dJHits=(globalThis.__dJHits||0)+1;globalThis.__dJLog=globalThis.__dJLog||[];globalThis.__dJLog.push(JSON.stringify({dpLen:_$dp.length,hhk:(_$hh&&_$hh._$ky)?Object.keys(_$hh._$ky).slice(0,12):null,g0k:(_$g0&&_$g0._$ky)?Object.keys(_$g0._$ky).slice(0,12):null}));if(globalThis.__dJLog.length>6)globalThis.__dJLog.shift();}catch(e){}_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}');
          console.log('[V2] _$dJ 插桩 OK');
        } else { console.log('[V2] ✗ _$dJ 模式未找到'); }
        // ★ 插桩 4：尾部标记（修正：$_ts）
        c = c.replace(/\}\)\$\_ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__tailHit=true;}($_ts.scj,$_ts.aebi);');
        if (c.indexOf('__tailHit') >= 0) console.log('[V2] 尾部标记 OK');
        else console.log('[V2] ✗ 尾部正则未命中，结尾=' + JSON.stringify(c.slice(-60)));
        fs.writeFileSync('/tmp/nx_dynCode_v2_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[V2] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
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
  for (const k of ['__tailHit', '__pgHit', '__pgIn', '__pgOut', '__kzHits', '__kzLast', '__dJHits', '__dJLog']) {
    try {
      const v = w[k];
      if (typeof v === 'string') console.log('[V2] ' + k + ':', v.substring(0, 800));
      else if (Array.isArray(v)) { console.log('[V2] ' + k + ': array len=' + v.length); v.forEach((x, i) => console.log('[V2]   #' + i + ':', String(x).substring(0, 300))); }
      else console.log('[V2] ' + k + ':', v);
    } catch (e) { console.log('[V2] ' + k + ' err:', e.message); }
  }
  console.log('[V2] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[V2] FATAL:', e && e.message); process.exit(1); });

// 插桩 v3：修正尾部正则（$_ts），插桩 _$er（JS 解析器主函数）dump _$k6、_$hP（位解码）dump 输入输出
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[V3] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[V3] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // ★ 尾部标记（修正：$_ts）
        c = c.replace(/\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__tailHit=true;}($_ts.scj,$_ts.aebi);');
        console.log('[V3] 尾部标记:', c.indexOf('__tailHit') >= 0 ? 'OK' : '✗ 结尾=' + JSON.stringify(c.slice(-50)));
        // ★ 插桩 _$er（解析器）：dump _$k6 内容
        const erPattern = 'function _$er(){var _$aq,_$_T;_$aq=_$mD[15][_$oU[17]](';
        if (c.indexOf(erPattern) >= 0) {
          c = c.replace(erPattern,
            'function _$er(){try{globalThis.__erHits=(globalThis.__erHits||0)+1;if(globalThis.__erHits<=20){globalThis.__k6Log=globalThis.__k6Log||[];globalThis.__k6Log.push(typeof _$k6==="string"?"k6len:"+_$k6.length+":"+_$k6.slice(0,400):"k6:"+typeof _$k6);}}catch(e){}var _$aq,_$_T;_$aq=_$mD[15][_$oU[17]](');
          console.log('[V3] _$er 插桩 OK');
        } else { console.log('[V3] ✗ _$er 模式未找到'); }
        // ★ 插桩 _$hP（位解码）：dump 输入 _$_T 和输出 _$hr
        const hPPattern = 'function _$hP(_$aq,_$_T){var _$hr,_$kx,_$hi,_$ms,_$fZ,_$p2;_$hr=[],_$kx=_$aq,_$hi=_$_T[_$oU[6]]';
        if (c.indexOf(hPPattern) >= 0) {
          c = c.replace(hPPattern,
            'function _$hP(_$aq,_$_T){try{globalThis.__hPHits=(globalThis.__hPHits||0)+1;if(globalThis.__hPHits<=20){globalThis.__hPLog=globalThis.__hPLog||[];globalThis.__hPLog.push(JSON.stringify({inLen:(_$_T&&_$_T.length)?_$_T.length:null,inHead:(_$_T&&_$_T.slice)?_$_T.slice(0,20):null}));}}catch(e){}var _$hr,_$kx,_$hi,_$ms,_$fZ,_$p2;_$hr=[],_$kx=_$aq,_$hi=_$_T[_$oU[6]]');
          console.log('[V3] _$hP 插桩 OK');
        } else { console.log('[V3] ✗ _$hP 模式未找到'); }
        // ★ 插桩 _$hr 输出（_$hP 返回前）
        const hPRet = 'return _$hr;}';
        if (c.indexOf(hPRet) >= 0 && c.indexOf('function _$hP') >= 0) {
          // 只替换 _$hP 内的 return（用更精确的）
          const hpIdx = c.indexOf('function _$hP');
          const hpRet = c.indexOf('return _$hr;}', hpIdx);
          if (hpRet > 0 && hpRet - hpIdx < 5000) {
            c = c.substring(0, hpRet) + 'try{globalThis.__hPOut=globalThis.__hPOut||[];globalThis.__hPOut.push(Array.from(_$hr));if(globalThis.__hPOut.length>10)globalThis.__hPOut.shift();}catch(e){}' + c.substring(hpRet);
            console.log('[V3] _$hP return 插桩 OK');
          }
        }
        // ★ 插桩 _$dJ（弹栈 basearr）
        const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
        if (c.indexOf(dJPattern) >= 0) {
          c = c.replace(dJPattern,
            'function _$dJ(){try{globalThis.__dJHits=(globalThis.__dJHits||0)+1;globalThis.__dJLog=globalThis.__dJLog||[];globalThis.__dJLog.push(JSON.stringify({dpLen:_$dp.length,hhk:(_$hh&&_$hh._$ky)?Object.keys(_$hh._$ky).slice(0,12):null,g0k:(_$g0&&_$g0._$ky)?Object.keys(_$g0._$ky).slice(0,12):null}));if(globalThis.__dJLog.length>6)globalThis.__dJLog.shift();}catch(e){}_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}');
          console.log('[V3] _$dJ 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_v3_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[V3] hook err:', e.message); }
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
  for (const k of ['__tailHit', '__erHits', '__k6Log', '__hPHits', '__hPLog', '__hPOut', '__dJHits', '__dJLog']) {
    try {
      const v = w[k];
      if (typeof v === 'string') console.log('[V3] ' + k + ':', v.substring(0, 1000));
      else if (Array.isArray(v)) { console.log('[V3] ' + k + ': array len=' + v.length); v.forEach((x, i) => console.log('[V3]   #' + i + ':', String(x).substring(0, 350))); }
      else console.log('[V3] ' + k + ':', v);
    } catch (e) { console.log('[V3] ' + k + ' err:', e.message); }
  }
  console.log('[V3] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[V3] FATAL:', e && e.message); process.exit(1); });

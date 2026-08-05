// 插桩追踪 basearr 构造：hook vm.runInContext 截获 dynCode，源码级插桩 _$dJ（basearr 弹栈入口）
// 目标：dump _$dp 栈内容 + _$hh/_$g0 对象结构，定位 basearr 生成过程
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = '/tmp/nx_basearr_trace.json';

(async () => {
  console.log('[TRB] pid=%d start', process.pid);
  const traceLog = [];
  let patched = null;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0) {
        console.log('[TRB] ★ 截获 dynCode len=' + code.length);
        // ★ 插桩 1：_$dJ 函数（basearr 弹栈入口）
        const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
        const dJInject = `function _$dJ(){try{globalThis.__trD=(globalThis.__trD||0)+1;if(globalThis.__trD<=50){globalThis.__trL=globalThis.__trL||[];var __dbg={t:'dJ',dpLen:_$dp.length,dpHead:(function(){try{return _$dp.slice(0,6).map(function(x){if(x&&x._$ky)return 'obj:'+Object.keys(x._$ky).slice(0,4).join(',');if(x&&x._$hq)return 'hq:'+x._$hq.length;return typeof x+':'+String(x).substring(0,20);});}catch(e){return ['e'];}})()};globalThis.__trL.push(JSON.stringify(__dbg));}}catch(__e){try{globalThis.__trE=(globalThis.__trE||[]);globalThis.__trE.push('dJ:'+String(__e));}catch(e2){}}_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();try{globalThis.__trD2=(globalThis.__trD2||0)+1;if(globalThis.__trD2<=50){globalThis.__trL2=globalThis.__trL2||[];var __dbg2={t:'dJ2',hh:typeof _$hh,hhk:(_$hh&&_$hh._$ky)?Object.keys(_$hh._$ky).slice(0,8):null,hhl:(_$hh&&_$hh._$hq)?_$hh._$hq.length:null,g0:typeof _$g0,g0k:(_$g0&&_$g0._$ky)?Object.keys(_$g0._$ky).slice(0,8):null,g0l:(_$g0&&_$g0._$hq)?_$g0._$hq.length:null};globalThis.__trL2.push(JSON.stringify(__dbg2));}}catch(__e){}}`;
        if (code.indexOf(dJPattern) >= 0) {
          code = code.replace(dJPattern, dJInject);
          console.log('[TRB] _$dJ 插桩成功');
        } else {
          console.log('[TRB] ✗ _$dJ 模式未找到（变量名可能不同）');
        }
        // ★ 插桩 2：_$dp 栈 push 操作（_$oU[18] = push）
        const pushPattern = '_$dp[_$oU[18]](_$hh)';
        const pushInject = `_$dp[_$oU[18]](_$hh)`;
        if (code.indexOf(pushPattern) >= 0) {
          code = code.split(pushPattern).join(pushInject);
          console.log('[TRB] push 模式确认存在');
        }
        // ★ 插桩 3：_$eQ 构造函数（VM 值对象）
        const eqPattern = 'function _$eQ(_$aq){this._$ky={}';
        const eqInject = `function _$eQ(_$aq){try{globalThis.__trEQC=(globalThis.__trEQC||0)+1;}catch(e){}this._$ky={}`;
        if (code.indexOf(eqPattern) >= 0) {
          code = code.replace(eqPattern, eqInject);
          console.log('[TRB] _$eQ 插桩成功');
        }
        // ★ 插桩 4：结尾完成标记
        code = code.replace(/\}\)\(scj,aebi\);\s*$/, ';globalThis.__dynTraceDone=true;}(scj,aebi);');
        code = code.replace(/\}\)\(_ts.scj,_ts.aebi\);\s*$/, ';globalThis.__dynTraceDone=true;}(_ts.scj,_ts.aebi);');
        code = code.replace(/\}\)\(globalThis\.\$_ts\.scj,globalThis\.\$_ts\.aebi\);\s*$/, ';globalThis.__dynTraceDone=true;}(globalThis.$_ts.scj,globalThis.$_ts.aebi);');
        patched = code;
        fs.writeFileSync('/tmp/nx_dynCode_patched.js', code);
        console.log('[TRB] 插桩完成 len=' + code.length);
      }
    } catch (e) { console.log('[TRB] hook 异常:', e.message); }
    return origRun(code, ctx, opts);
  };

  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
  });
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
  // dump 追踪日志
  const w = dom.window;
  const dump = (name) => {
    try {
      const v = w[name];
      if (v !== undefined && v !== null) {
        traceLog.push({ key: name, val: v });
        console.log('[TRB] ' + name + ':', typeof v === 'string' ? v.substring(0, 3000) : JSON.stringify(v).substring(0, 3000));
      } else {
        console.log('[TRB] ' + name + ': (empty)');
      }
    } catch (e) { console.log('[TRB] ' + name + ' ERR: ' + e.message); }
  };
  dump('__trL');
  dump('__trL2');
  dump('__trE');
  dump('__trEQC');
  dump('__dynTraceDone');
  console.log('[TRB] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  fs.writeFileSync(OUT, JSON.stringify(traceLog, null, 1));
  console.log('[TRB] saved', OUT, 'done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TRB] FATAL:', e && e.message); process.exit(1); });

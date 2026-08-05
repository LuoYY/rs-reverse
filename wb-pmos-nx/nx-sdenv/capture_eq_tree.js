// 捕获 _$eQ VM 值对象树（basearr 载体）：hook new _$eQ + 追踪 basearr 头字节出现
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[EQ] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[EQ] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 1. hook new _$eQ（VM 值对象构造）
        const eqDef = 'function _$eQ(_$aq){this._$ky={},this._$ph={},this._$hq=[],this._$eE=_$aq';
        if (c.indexOf(eqDef) >= 0) {
          c = c.replace(eqDef,
            'function _$eQ(_$aq){try{globalThis.__eqCnt=(globalThis.__eqCnt||0)+1;if(globalThis.__eqCnt<=200){globalThis.__eqLog=globalThis.__eqLog||[];globalThis.__eqLog.push({id:globalThis.__eqCnt,parent:!!_$aq,hqLen:(this&&this._$hq)?0:0});}}catch(e){}this._$ky={},this._$ph={},this._$hq=[],this._$eE=_$aq');
          console.log('[EQ] _$eQ 插桩 OK');
        }
        // 2. hook _$eQ._$hq push（子对象添加）—— 检测 basearr 字节
        // 3. 监控 basearr 构造：_$hr 结果数组
        // 尾部标记
        c = c.replace(/\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__T1=true;}($_ts.scj,$_ts.aebi);');
        fs.writeFileSync('/tmp/nx_dynCode_eq_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[EQ] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() },
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
  const evalV = (expr) => { try { return w.eval(expr); } catch (e) { return 'ERR:' + e.message; } };
  console.log('[EQ] __eqCnt:', evalV('typeof __eqCnt!=="undefined"?__eqCnt:null'));
  const log = evalV('typeof __eqLog!=="undefined"?JSON.stringify(__eqLog.slice(0,30)):null');
  console.log('[EQ] __eqLog(前30):', log);
  console.log('[EQ] __T1:', evalV('typeof __T1!=="undefined"?__T1:null'));
  console.log('[EQ] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[EQ] FATAL:', e && e.message); process.exit(1); });

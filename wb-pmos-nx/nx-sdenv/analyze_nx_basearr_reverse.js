// 反编译 _$$p[103]（basearr 构造函数）核心路径：
// 瑞数外层 js 用 window.eval.call(window, dynCode) 执行内层 VM。
// hook Function.prototype.call/apply：截获 >50KB 的 dynCode 字符串，
// 插桩 _$pg()（basearr 生成：_$pu=_$$p[_$bA[103]]()），记录 _$$p 栈顶函数源码，
// 从而定位 _$$p[103] = basearr 构造函数的真实代码。
// 本地固定 challenge（nsd=67402 恒定）+ sdenv 完整环境 → 可反复调试。
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[REV] pid=%d start', process.pid);
  let dynCode = null;
  const result = { dynLen: 0, bA18: null, bA103: null, baseFnSrc: null, baseRetLen: 0, baseRetHead: null, patched: false };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const findDyn = (str) => typeof str === 'string' && str.length > 50000;
      // hook Function.prototype.call：截获 eval.call(w, dynCode)
      const ocall = w.Function.prototype.call;
      w.Function.prototype.call = function () {
        const args = arguments;
        try {
          if (findDyn(args[1])) {
            console.log('[REV] ★ 截获 eval.call dynCode len=' + args[1].length);
            dynCode = args[1];
            // 插桩 _$pg：记录 _$$p 栈顶函数 + 返回值
            let code = args[1];
            code = code.replace(
              /function _\$pg\(\)\{_\$pu=_\$\$p\[_\$bA\[103\]\]\(\);\}/,
              'function _$pg(){var __t=_$$p[_$$p.length-1];try{window.__topSrc=typeof __t==="function"?Function.prototype.toString.call(__t):"notfn:"+typeof __t;window.__topLen=_$$p.length}catch(e){window.__topSrc="err:"+e.message}try{window.__bA103=_$bA[103];window.__bA18=_$bA[18];window.__bALen=_$bA.length}catch(e){}_$pu=_$$p[_$bA[103]]();try{if(_$pu&&_$pu.length>100){window.__baseRet=Array.from(_$pu)}}catch(e){}}'
            );
            code = code + '\n;window.__revDone=true;';
            console.log('[REV] 插桩 _$pg done');
            result.patched = true;
            args[1] = code;
          }
        } catch (e) { console.log('[REV] call hook err:', e.message); }
        return ocall.apply(this, args);
      };
      // hook Function.prototype.apply：同样截获
      const oapp = w.Function.prototype.apply;
      w.Function.prototype.apply = function (t, a) {
        try {
          if (a && findDyn(a[0]) && !dynCode) {
            console.log('[REV] ★ 截获 eval.apply dynCode len=' + a[0].length);
            dynCode = a[0];
          }
        } catch (e) { }
        return oapp.call(this, t, a);
      };
      // 兜底 hook window.eval
      const oeval = w.eval;
      w.eval = function (code) {
        try {
          if (findDyn(code) && !dynCode) { console.log('[REV] ★ 截获 window.eval dynCode len=' + code.length); dynCode = code; }
        } catch (e) { }
        return oeval.call(this, code);
      };
    },
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
  // 提取插桩结果
  const getV = (e) => { try { return w.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  result.dynLen = dynCode ? dynCode.length : 0;
  result.bA18 = getV('window.__bA18');
  result.bA103 = getV('window.__bA103');
  result.bALen = getV('window.__bALen');
  result.topSrc = getV('window.__topSrc');
  result.topLen = getV('window.__topLen');
  const baseRet = getV('window.__baseRet ? JSON.stringify(window.__baseRet) : null');
  if (baseRet && baseRet !== 'null' && !String(baseRet).startsWith('ERR:')) {
    try {
      const br = JSON.parse(baseRet);
      result.baseRetLen = br.length;
      result.baseRetHead = br.slice(0, 12);
    } catch (e) { result.baseRetRaw = String(baseRet).slice(0, 200); }
  } else if (baseRet) { result.baseRetRaw = String(baseRet).slice(0, 200); }
  result.revDone = getV('window.__revDone');
  console.log('[REV] === 插桩结果 ===');
  console.log('[REV] dynLen:', result.dynLen, 'patched:', result.patched, 'revDone:', result.revDone);
  console.log('[REV] _$bA[18]=', result.bA18, '_$bA[103]=', result.bA103, '_$bA.len=', result.bALen);
  console.log('[REV] _$$p 栈深:', result.topLen);
  console.log('[REV] basearr 构造函数源码(前300):', result.topSrc ? String(result.topSrc).slice(0, 300) : 'null');
  console.log('[REV] base 返回 len:', result.baseRetLen, '头:', result.baseRetHead ? result.baseRetHead.join(',') : 'null');
  fs.writeFileSync('/tmp/nx_basearr_reverse.json', JSON.stringify(result, null, 1));
  if (dynCode) fs.writeFileSync('/tmp/nx_dynCode_captured.js', dynCode);
  console.log('[REV] saved /tmp/nx_basearr_reverse.json + nx_dynCode_captured.js done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[REV] FATAL:', e && e.message); process.exit(1); });

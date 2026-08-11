// 捕获非 JSVMP 会话的 _$kt 写入序列（_$op/_$mX/_$eb 调用）
// 记录：函数名 + 值 + 位置 + 写入字节
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[KW] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 插桩 _$op/_$mX/_$eb：函数开头记录调用
        const funcs = [
          ['function _$eb(_$aq,_$_T){', '_$eb'],
          ['function _$op(_$aq,_$_T){', '_$op'],
          ['function _$mX(_$aq,_$_T){', '_$mX'],
          ['function _$_c(_$aq,_$_T){', '_$_c'],
        ];
        for (const [pat, name] of funcs) {
          if (c.indexOf(pat) >= 0) {
            const inj = pat + `try{window.__kw=window.__kw||[];window.__kw.push({f:"${name}",v:typeof _$aq==="number"?_$aq:String(_$aq).slice(0,20),pos:typeof _$_T==="number"?_$_T:null,cv:typeof _$cV!=="undefined"?_$cV:null,kt:Array.isArray(_$kt)?_$kt.slice(0,200):null});if(window.__kw.length>500)window.__kw.splice(0,250);}catch(__e){window.__kwE=String(__e);}`;
            c = c.split(pat).join(inj);
            console.log('[KW] ' + name + ' 插桩 OK');
          } else console.log('[KW] ✗ ' + name + ' 未找到');
        }
        // 捕获 final kt
        const finPat = '_$kt=[';
        if (c.indexOf(finPat) >= 0) {
          // 在初始化后捕获
          const idx = c.indexOf(finPat);
          // 找初始化结束（]）
          let depth = 0, end = -1;
          for (let i = c.indexOf('[', idx); i < c.length; i++) {
            if (c[i] === '[') depth++;
            else if (c[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end > 0) {
            const inj = c.slice(idx, end + 1) + `;window.__ktInit=Array.isArray(_$kt)?_$kt.slice(0,200):null;`;
            c = c.slice(0, idx) + inj + c.slice(end + 1);
            console.log('[KW] _$kt 初始化捕获 OK');
          }
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_kw_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[KW] hook err:', e.message); }
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
  const n = ev('typeof __kw!=="undefined"?__kw.length:0');
  console.log('[KW] 捕获数:', n, 'err:', ev('typeof __kwE!=="undefined"?__kwE:null'));
  const kt = ev('typeof __ktInit!=="undefined"?__ktInit:null');
  console.log('[KW] ktInit:', kt ? JSON.stringify(kt).slice(0, 200) : 'null');
  const full = ev('typeof __kw!=="undefined"?JSON.stringify(__kw):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_kt_writes.json'), full);
  console.log('[KW] saved nx_kt_writes.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[KW] FATAL:', e && e.stack); process.exit(1); });

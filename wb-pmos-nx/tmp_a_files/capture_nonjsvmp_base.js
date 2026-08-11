// 捕获非 JSVMP 会话的 base 会话段生成（op=265 时间戳写入 + kt 编码）
// 关键：对比 JSVMP（_$mD[615]）vs 非 JSVMP 的 base 生成
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
        console.log('[NB] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 捕获 base 相关 opcode：_$kt 操作（时间戳写入 [78:90]）
        // 捕获所有 _$mD[615] 调用 + _$kt 的写操作
        // 关键：_$kt 是 base 数组。捕获每次 _$kt.push/concat 或长度变化
        const ktCaps = [
          ['_$kt[_$kt.length]=', '_$kt.push'],
          ['_$kt.push', '_$kt.push'],
        ];
        // 捕获 _$kt 最终值 + 时间戳操作
        const inj = `try{window.__nb=window.__nb||[];window.__nb.push({w:arguments[0],ktL:Array.isArray(_$kt)?_$kt.length:null,kt:Array.isArray(_$kt)?_$kt.slice(0,Math.min(_$kt.length,200)):null});if(window.__nb.length>500)window.__nb.splice(0,250);}catch(e){window.__nbE=String(e);}`;
        // op=265（时间戳）op=2139/2137/2131（base 编码）op=1842（AES）
        for (const op of [265, 2139, 2137, 2131, 1842, 1464, 1465]) {
          const pat = 'if(_$pW===' + op + '){';
          if (c.indexOf(pat) >= 0) {
            c = c.split(pat).join(inj + pat);
            console.log('[NB] op' + op + ' 插桩 OK');
          }
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_nb_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[NB] hook err:', e.message); }
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
  const n = ev('typeof __nb!=="undefined"?__nb.length:0');
  console.log('[NB] 捕获数:', n, 'err:', ev('typeof __nbE!=="undefined"?__nbE:null'));
  const full = ev('typeof __nb!=="undefined"?JSON.stringify(__nb):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_nb_calls.json'), full);
  console.log('[NB] saved nx_nb_calls.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[NB] FATAL:', e && e.stack); process.exit(1); });

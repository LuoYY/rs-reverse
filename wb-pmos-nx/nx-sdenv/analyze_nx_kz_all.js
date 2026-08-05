// 最小插桩验证：只插桩 _$kZ（hex 解码器），记录 ALL 输入（含 basearr 大 hex），
// 并确认 cookie 是否正常生成（验证插桩不破坏执行）。
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[KZ] pid=%d start', process.pid);
  let dynCode = null;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && !code.includes('__kzAll')) {
        console.log('[KZ] ★ 截获 dynCode len=' + code.length);
        dynCode = code;
        // 找 _$kZ 定义（format: function _$kZ(_$aq){var ...）插桩记录所有 hex 输入
        const kzMatch = code.match(/function _\$kZ\([^)]*\)\{var [^;]+;/);
        console.log('[KZ] _$kZ 定义匹配:', kzMatch ? kzMatch[0].slice(0, 60) : 'null');
        if (kzMatch) {
          const orig = kzMatch[0];
          const patched = orig + 'window.__kzAll=(window.__kzAll||[]);window.__kzAll.push(typeof _$aq==="string"?_$aq:"nonstr");if(window.__kzAll.length>20)window.__kzAll.shift();';
          code = code.replace(orig, patched);
        }
        // 完成标记（宽松匹配末尾 IIFE）
        code = code.replace(/;?\}\)\(_\$ts\.scj,_\$ts\.aebi\);?$/, ';window.__kzDone=true;}($_ts.scj,$_ts.aebi);');
        code = code.replace(/;?\}\)\(_\$ts\.scj,_\$ts\.aebi\);?[\s]*$/, ';window.__kzDone=true;}($_ts.scj,$_ts.aebi);');
        console.log('[KZ] 插桩 __kzAll?', code.includes('__kzAll'), '__kzDone?', code.includes('__kzDone'));
      }
    } catch (e) { console.log('[KZ] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };

  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
  });
  const w = dom.window;
  let cookieStr = null;
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
  cookieStr = dom.cookieJar.getCookieStringSync(B + '/');
  const getV = (e) => { try { return w.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const kzAll = getV('window.__kzAll ? JSON.stringify(window.__kzAll) : null');
  const kzDone = getV('window.__kzDone');
  const pLen = (cookieStr.match(/P=[^;]*/) || [''])[0].length;
  console.log('[KZ] cookie P len:', pLen, 'kzDone:', kzDone);
  console.log('[KZ] _$kZ 所有输入数:', kzAll ? JSON.parse(kzAll).length : 0);
  if (kzAll && kzAll !== 'null') {
    JSON.parse(kzAll).forEach((h, i) => console.log('[KZ]   #' + i + ' len=' + String(h).length + ': ' + String(h).slice(0, 80)));
  }
  fs.writeFileSync('/tmp/nx_kz_all.json', JSON.stringify({ pLen, kzDone, kzAll: kzAll ? JSON.parse(kzAll) : null }, null, 1));
  console.log('[KZ] saved /tmp/nx_kz_all.json done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[KZ] FATAL:', e && e.message); process.exit(1); });

// 提取 basearr 模板：插桩内层 VM 的 _$pg（basearr 生成入口）。
// 新 dynCode: _$pg(){return _$kZ(_$oP[118])}，_$kZ = hex→bytes→String.fromCharCode。
// 插桩：截获 _$pg 的输入 _$oP[118]（hex 字符串）和输出（字符串/数组），
// 确认 basearr 是否 = 固定模板（hex 常量）或运行时生成。
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[TPL] pid=%d start', process.pid);
  let dynCode = null;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.includes('_$pg') && code.includes('_$kZ')) {
        console.log('[TPL] ★ 截获内层 VM dynCode len=' + code.length);
        dynCode = code;
        // 插桩 _$pg：记录 _$oP[118] 输入 + 输出
        let patched = code.replace(
          /function _\$pg\(\)\{return _\$kZ\(_\$oP\[118\]\);\}/,
          'function _$pg(){var __in=(typeof _$oP!=="undefined")?(typeof _$oP[118]==="string"?_$oP[118].slice(0,600):"notstr:"+typeof _$oP[118]):"noop";try{window.__pgIn=__in}catch(e){}var __r=_$kZ(_$oP[118]);try{window.__pgOut=typeof __r==="string"?__r.slice(0,300):(__r&&__r.length?Array.from(__r).slice(0,40):String(__r))}catch(e){}return __r;}'
        );
        // 也插桩 _$kZ：记录完整 hex 输入
        patched = patched.replace(
          /function _\$kZ\(_\$aq\)\{var _\$_T,_\$hr,_\$kx;/,
          'function _$kZ(_$aq){try{window.__kzHex=(window.__kzHex||[]);window.__kzHex.push(typeof _$aq==="string"?_$aq:"nonstr");if(window.__kzHex.length>5)window.__kzHex.shift()}catch(e){}var _$_T,_$hr,_$kx;'
        );
        patched = patched.replace(/\}\)\(_\$ts\.scj,_\$ts\.aebi\);/, 'window.__tplDone=true;}($_ts.scj,$_ts.aebi);');
        code = patched;
        console.log('[TPL] 插桩完成');
      }
    } catch (e) { console.log('[TPL] hook err:', e.message); }
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
  // 提取插桩结果
  const getV = (e) => { try { return w.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const pgIn = getV('window.__pgIn');
  const pgOut = getV('window.__pgOut');
  const kzHex = getV('window.__kzHex ? JSON.stringify(window.__kzHex) : null');
  const tplDone = getV('window.__tplDone');
  console.log('[TPL] tplDone:', tplDone);
  console.log('[TPL] _$pg 输入 _$oP[118]:', pgIn ? String(pgIn).slice(0, 300) : 'null');
  console.log('[TPL] _$pg 输出:', pgOut ? String(pgOut).slice(0, 200) : 'null');
  if (kzHex && kzHex !== 'null') {
    try {
      const arr = JSON.parse(kzHex);
      console.log('[TPL] _$kZ 收到 hex 数:', arr.length);
      arr.forEach((h, i) => console.log('[TPL]   hex#' + i + ' len=' + h.length + ': ' + String(h).slice(0, 120)));
    } catch (e) { console.log('[TPL] kzHex raw:', String(kzHex).slice(0, 200)); }
  }
  const out = { tplDone, pgIn: pgIn ? String(pgIn) : null, pgOut: pgOut ? String(pgOut) : null, kzHex };
  fs.writeFileSync('/tmp/nx_basearr_template.json', JSON.stringify(out, null, 1));
  if (dynCode) fs.writeFileSync('/tmp/nx_dynCode_patched.js', dynCode);
  console.log('[TPL] saved /tmp/nx_basearr_template.json + nx_dynCode_patched.js done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TPL] FATAL:', e && e.message); process.exit(1); });

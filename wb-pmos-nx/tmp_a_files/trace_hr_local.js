// 本地固定版本：捕获 _$hr（basearr 载体数组，c4 中 42 处）的完整写入
// 记录：_$hr 长度 130-230 时的每次变化 + 完整快照
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_hr_local.json');

(async () => {
  console.log('[HR] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !patched) {
        patched = true;
        console.log('[HR] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 主循环取值点
        const target = '_$pW=_$bk[_$g6++];';
        if (c.indexOf(target) >= 0) {
          const inject = `_$pW=_$bk[_$g6++];try{if(typeof _$hr!=="undefined"&&_$hr&&_$hr.length>=130&&_$hr.length<=230){globalThis.__hr=globalThis.__hr||[];globalThis.__hr.push({len:_$hr.length,head:Array.from(_$hr.slice(0,6)),tail:Array.from(_$hr.slice(-6))});if(globalThis.__hr.length>2000)globalThis.__hr.splice(0,1000);}}catch(e){if(!globalThis.__hrE)globalThis.__hrE=String(e);}`;
          c = c.split(target).join(inject);
          console.log('[HR] 主循环 _$hr 插桩 OK');
        } else { console.log('[HR] ✗ 主循环模式未找到'); }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_hr_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[HR] hook err:', e.message); }
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[HR] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[HR] err:', ev('typeof __hrE!=="undefined"?__hrE:null'));
  const n = ev('typeof __hr!=="undefined"?__hr.length:0');
  console.log('[HR] __hr 条数:', n);
  const head = ev('typeof __hr!=="undefined"?JSON.stringify(__hr.slice(0,20)):null');
  console.log('[HR] head:', head);
  const tail = ev('typeof __hr!=="undefined"?JSON.stringify(__hr.slice(-40)):null');
  console.log('[HR] tail:', tail);
  const full = ev('typeof __hr!=="undefined"?JSON.stringify(__hr):null');
  if (full) fs.writeFileSync(OUT, full);
  console.log('[HR] saved', OUT);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[HR] FATAL:', e && e.message); process.exit(1); });

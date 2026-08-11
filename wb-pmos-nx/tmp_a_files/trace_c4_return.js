// 插桩 _$c4 的返回点（return _$hF.apply(this,_$eS);）——dump 所有闭包数组
// 此时 base 数组已构造完成
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_c4_return.json');

(async () => {
  console.log('[RT] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[RT] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // _$c4 返回点：return _$hF.apply(this,_$eS);
        const retTarget = 'return _$hF.apply(this,_$eS);';
        if (c.indexOf(retTarget) >= 0) {
          const inject = `try{globalThis.__rarrs=globalThis.__rarrs||[];var __all=[["kb",typeof _$kB!=="undefined"?_$kB:null],["hr",typeof _$hr!=="undefined"?_$hr:null],["oe",typeof _$oe!=="undefined"?_$oe:null],["eS",typeof _$eS!=="undefined"?_$eS:null],["ez",typeof _$ez!=="undefined"?_$ez:null]];for(var __i=0;__i<__all.length;__i++){var __n=__all[__i][0],__v=__all[__i][1];if(__v&&__v.length&&__v.length>=130&&__v.length<=250&&Array.isArray(__v)){globalThis.__rarrs.push({name:__n,len:__v.length,head:Array.from(__v.slice(0,8))});}}globalThis.__rarrs.push({done:true,hrLen:typeof _$hr!=="undefined"&&_$hr?_$hr.length:-1,ezLen:typeof _$ez!=="undefined"&&_$ez?_$ez.length:-1});}catch(__e){globalThis.__rtE=String(__e);}` + retTarget;
          c = c.split(retTarget).join(inject);
          console.log('[RT] 返回点插桩 OK');
        } else { console.log('[RT] ✗ 返回点未找到'); }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_rt_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[RT] hook err:', e.message); }
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
  console.log('[RT] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[RT] err:', ev('typeof __rtE!=="undefined"?__rtE:null'));
  const arrs = ev('typeof __rarrs!=="undefined"?JSON.stringify(__rarrs):null');
  console.log('[RT] __rarrs:', arrs ? arrs.slice(0, 600) : 'none');
  if (arrs) fs.writeFileSync(OUT, arrs);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[RT] FATAL:', e && e.message); process.exit(1); });

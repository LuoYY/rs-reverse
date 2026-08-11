// 本地固定版本：cookie 生成后深度扫描 window 对象树，找 140-210 长数字数组（base 候选）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_base_dump.json');

(async () => {
  console.log('[DU] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && !code.includes('__dumpInit')) {
        console.log('[DU] ★ 截获 dynCode len=' + code.length);
        const hook = `;(function(){
  if(window.__dumpInit)return; window.__dumpInit=true;
  window.__scan = function(){
    var found = {};
    function isNumArr(v){ return Array.isArray(v) && v.length>=140 && v.length<=210 && v.every(function(x){return typeof x==="number";}); }
    function walk(obj, pathStr, depth, seen){
      if(depth>6 || !obj || seen.has(obj)) return;
      seen.add(obj);
      if(isNumArr(obj)){
        var head = obj.slice(0,8).join(",");
        if(!found[head]) found[head] = {paths:[], len:obj.length, head:obj.slice(0,4)};
        if(found[head].paths.length<5) found[head].paths.push(pathStr);
        return;
      }
      if(typeof obj==="object"){
        try{
          for(var k in obj){
            var v;
            try{ v = obj[k]; }catch(e){ continue; }
            if(v && (Array.isArray(v) || typeof v==="object" && v!==window)){
              walk(v, pathStr+"."+k, depth+1, seen);
            }
          }
        }catch(e){}
      }
    }
    walk(window, "window", 0, new Set());
    walk(this, "this", 0, new Set());
    return JSON.stringify(found);
  };
})();
`;
        code = hook + code;
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_dump_patched.js'), code);
      }
    } catch (e) { console.log('[DU] hook err:', e.message); }
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
  console.log('[DU] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  const scan = ev('typeof __scan!=="undefined"?__scan():null');
  console.log('[DU] scan:', scan ? scan.slice(0, 800) : 'no scan');
  fs.writeFileSync(OUT, scan || '');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[DU] FATAL:', e && e.message); process.exit(1); });

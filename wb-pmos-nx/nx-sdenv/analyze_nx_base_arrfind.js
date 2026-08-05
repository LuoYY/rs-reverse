// 定位 basearr 生成：在 dynCode 开头注入 Array.prototype.push 监控，
// 捕获所有长成 140-210B 的字节数组（含头、构造栈），直接找到 basearr 构造函数。
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[AF] pid=%d start', process.pid);
  let dynCode = null;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && !code.includes('__afHook')) {
        console.log('[AF] ★ 截获 dynCode len=' + code.length);
        dynCode = code;
        // 在 dynCode 开头注入 Array.prototype.push 监控
        const hook = `
;(function(){
  if(window.__afHook)return; window.__afHook=true;
  var op=Array.prototype.push;
  Array.prototype.push=function(){
    var r=op.apply(this,arguments);
    try{
      if(this.length>=140&&this.length<=210){
        var a=Array.from(this);
        if(a.every(function(x){return typeof x==="number"&&x>=0&&x<=255;})){
          window.__afArr=window.__afArr||[];window.__afArr.push(a.slice(0,40));
          if(window.__afArr.length>10)window.__afArr.shift();
          window.__afStack=new Error().stack;
        }
      }
    }catch(e){}
    return r;
  };
  var os=Array.prototype.slice;
  Array.prototype.slice=function(){
    var r=os.apply(this,arguments);
    try{var a=Array.from(r);if(a.length>=140&&a.length<=210&&a.every(function(x){return typeof x==="number"&&x>=0&&x<=255;})){window.__afArr=window.__afArr||[];window.__afArr.push(a.slice(0,40));if(window.__afArr.length>10)window.__afArr.shift();window.__afStack=new Error().stack;}}catch(e){}
    return r;
  };
  var ou=Array.prototype.concat;
  Array.prototype.concat=function(){
    var r=ou.apply(this,arguments);
    try{var a=Array.from(r);if(a.length>=140&&a.length<=210&&a.every(function(x){return typeof x==="number"&&x>=0&&x<=255;})){window.__afArr=window.__afArr||[];window.__afArr.push(a.slice(0,40));if(window.__afArr.length>10)window.__afArr.shift();window.__afStack=new Error().stack;}}catch(e){}
    return r;
  };
})();
`;
        code = hook + code;
        console.log('[AF] 注入 push 监控 done');
      }
    } catch (e) { console.log('[AF] hook err:', e.message); }
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
  const pLen = (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length;
  const getV = (e) => { try { return w.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const afArr = getV('window.__afArr ? JSON.stringify(window.__afArr) : null');
  const afStack = getV('window.__afStack');
  console.log('[AF] cookie P len:', pLen);
  console.log('[AF] 捕获 140-210B 数组数:', afArr ? JSON.parse(afArr).length : 0);
  if (afArr && afArr !== 'null') {
    JSON.parse(afArr).forEach((a, i) => console.log('[AF]   #' + i + ' len=' + a.length + ' head=' + a.slice(0, 8).join(',')));
  }
  console.log('[AF] 最近构造栈:', afStack ? String(afStack).split('\n').slice(2, 8).join(' | ') : 'null');
  fs.writeFileSync('/tmp/nx_base_arrfind.json', JSON.stringify({ pLen, afArr: afArr ? JSON.parse(afArr) : null, afStack }, null, 1));
  console.log('[AF] saved /tmp/nx_base_arrfind.json done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[AF] FATAL:', e && e.message); process.exit(1); });

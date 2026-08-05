// sdenv 执行后 dump window.$_ts 及全局状态，找 basearr 构造产物
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[TS] pid=%d start', process.pid);
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

  // dump $_ts 结构
  console.log('[TS] $_ts keys:', evalV('typeof $_ts!=="undefined"?Object.keys($_ts).join(","):"N/A"'));
  console.log('[TS] $_ts.nsd:', evalV('typeof $_ts!=="undefined"?$_ts.nsd:"N/A"'));
  // lcd/cp 等
  for (const k of ['lcd', 'cp', 'jf']) {
    const v = evalV('typeof $_ts!=="undefined"&&$_ts.' + k + '!==undefined?JSON.stringify($_ts.' + k + ').substring(0,200):"N/A"');
    console.log('[TS] $_ts.' + k + ':', v);
  }
  // 找全局 59 头数组（basearr）
  const baseArr = evalV(`(function(){var r=[];for(var k in window){try{var v=window[k];if(v&&v.length>100&&v[0]===59&&v[1]===148){r.push({k:k,len:v.length,head:Array.prototype.slice.call(v,0,10)});}}catch(e){}}return JSON.stringify(r);})()`);
  console.log('[TS] 59头数组:', baseArr);
  // 179 头
  const base179 = evalV(`(function(){var r=[];for(var k in window){try{var v=window[k];if(v&&v.length>100&&v[0]===179&&v[1]===0){r.push({k:k,len:v.length,head:Array.prototype.slice.call(v,0,10)});}}catch(e){}}return JSON.stringify(r);})()`);
  console.log('[TS] 179头数组:', base179);
  console.log('[TS] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TS] FATAL:', e && e.message); process.exit(1); });

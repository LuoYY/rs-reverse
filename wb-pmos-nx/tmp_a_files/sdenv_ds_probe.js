// 用 sdenv 完整环境，插桩 dynCode 的 while(3) dispatcher：记录 _$ds（_$lj）的真实值变化
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const vm = require('vm');
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  const origRun = vm.runInContext;
  let dynCode = null;
  vm.runInContext = function (code, ctx, opts) {
    if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !dynCode) {
      dynCode = code;
      let c = code;
      // 插桩 while(3) dispatcher：_$ey=_$gp[_$al++]
      const pat = 'while(1){_$ey=_$gp[_$al++];';
      if (c.indexOf(pat) >= 0) {
        c = c.split(pat).join('while(1){window.__tr=window.__tr||[];window.__tr.push(_$al-1+":"+_$ey+"|ds="+(_$ds===void 0?"u":(_$ds?"T":"F")));if(window.__tr.length>500)window.__tr.shift();_$ey=_$gp[_$al++];');
        console.log('[DP] w3 插桩 OK');
      } else {
        console.log('[DP] w3 模式未找到');
      }
      code = c;
      fs.writeFileSync(path.join(__dirname, 'nx_dynCode_ds_patched.js'), code);
    }
    return origRun(code, ctx, opts);
  };

  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try {
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); return; }
        lastLen = pLen;
        if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 300);
  });
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const tr = ev('typeof __tr!=="undefined"?JSON.stringify(__tr):null');
  console.log('[DP] dynCode:', dynCode ? dynCode.length : '未捕获');
  if (tr && tr !== 'null') {
    const arr = JSON.parse(tr);
    // 分析 _$ds 变化点
    console.log('[DP] 轨迹长度:', arr.length);
    // 找 ds 值变化的最后位置
    let lastDs = null, changes = [];
    arr.forEach((s, i) => {
      const m = s.match(/\|ds=(T|F)$/);
      if (m) {
        if (m[1] !== lastDs) { changes.push(i + ':' + s); lastDs = m[1]; }
      }
    });
    console.log('[DP] ds 变化点(最后20):');
    changes.slice(-20).forEach(c => console.log('[DP]   ' + c));
  } else {
    console.log('[DP] 轨迹:', tr);
  }
  const P = (dom.cookieJar.getCookieStringSync(B + '/').match(/P=([^;]*)/) || [])[1];
  console.log('[DP] P len:', P ? P.length : 0);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[DP] FATAL:', e.message); process.exit(1); });

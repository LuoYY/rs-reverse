// 自适应插桩：动态提取 dispatcher 变量名，记录 _$ds（环境标志）轨迹
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
      // 动态提取 dispatcher：while(1){<op>=<arr>[<pc>++];
      const m = c.match(/while\(1\)\{([_\$a-z0-9]+)=([_\$a-z0-9]+)\[([_\$a-z0-9]+)\+\+\];/);
      if (m) {
        const [full, op, arr, pc] = m;
        console.log('[D2] dispatcher: op=' + op + ' arr=' + arr + ' pc=' + pc);
        // 找环境标志变量（!_$XX? 条件跳转中的 XX）
        const cm = c.match(/!([_\$a-z0-9]+)\?[_\$a-z0-9]+[+\-]=/);
        const flagVar = cm ? cm[1] : '_$ds';
        console.log('[D2] 环境标志变量: ' + flagVar);
        // 插桩：记录 opcode/pc/flag
        const inj = 'while(1){window.__tr=window.__tr||[];window.__tr.push("' + pc + '="+(' + pc + '-1)+":"+(' + op + ')+"|' + flagVar + '="+(' + flagVar + '===void 0?"u":(' + flagVar + '?"T":"F")));if(window.__tr.length>800)window.__tr.shift();' + op + '=' + arr + '[' + pc + '++];';
        c = c.split(full).join(inj);
        console.log('[D2] 插桩 OK');
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_ds2_patched.js'), c);
      } else {
        console.log('[D2] dispatcher 模式未找到');
      }
      code = c;
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
  const tr = ev('typeof __tr!=="undefined"?__tr:null');
  if (Array.isArray(tr)) {
    console.log('[D2] 轨迹长度:', tr.length);
    // 分析 flag 变化
    let lastF = null, changes = [];
    tr.forEach((s, i) => {
      const m = s.match(/\|([_\$a-z0-9]+)=(T|F)$/);
      if (m) { if (m[2] !== lastF) { changes.push(i + ':' + s); lastF = m[2]; } }
    });
    console.log('[D2] flag 变化点(最后30):');
    changes.slice(-30).forEach(c => console.log('[D2]   ' + c));
    console.log('[D2] 最后5条轨迹:');
    tr.slice(-5).forEach(s => console.log('[D2]   ' + s));
  } else {
    console.log('[D2] 轨迹:', tr);
  }
  const P = (dom.cookieJar.getCookieStringSync(B + '/').match(/P=([^;]*)/) || [])[1];
  console.log('[D2] P len:', P ? P.length : 0);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[D2] FATAL:', e.message); process.exit(1); });

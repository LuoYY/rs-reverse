// 用固定挑战页（本地 412.raw 的 nsd=67402/cd）捕获两次 l 起点，判断确定性
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { jsdomFromUrl } = require('sdenv');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

async function runOnce(tag) {
  const origRun = vm.runInContext;
  let dynCode = null;
  let lvals = [];
  vm.runInContext = function (code, ctx, opts) {
    if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !dynCode) {
      dynCode = code;
      let c = code;
      // 插桩 op=265（_$mD[615] 调用）：记录 l 值
      // 找 _$mD[615] 调用（cV 是 _\$c4(265,...)）
      const pat = 'cV=_$c4(265,';
      if (c.indexOf(pat) >= 0) {
        c = c.split(pat).join('window.__lv=(window.__lv||[]);window.__lv.push(');
        // 太复杂，直接搜 opcode 265 的 handler
      }
      // 简化：捕获 e/l 在 _$mD[615] 调用时
      const t265 = 'if(_$pW===265){';
      if (c.indexOf(t265) >= 0) {
        const inj = t265 + 'window.__lvs=window.__lvs||[];try{window.__lvs.push(Array.prototype.slice.call(arguments,0).map(function(a){return typeof a==="number"?a:null}));}catch(e){}';
        c = c.split(t265).join(inj);
        console.log('[' + tag + '] op265 插桩 OK');
      }
      code = c;
    }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(TARGET, { userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try {
        const c = dom.cookieJar.getCookieStringSync(TARGET);
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); return; }
        lastLen = pLen;
        if (Date.now() - t0 > 25000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 300);
  });
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const lvs = ev('typeof __lvs!=="undefined"?JSON.stringify(__lvs):null');
  console.log('[' + tag + '] lvs:', lvs ? lvs.slice(0, 200) : 'null');
  const P = (dom.cookieJar.getCookieStringSync(TARGET).match(/P=([^;]*)/) || [])[1];
  console.log('[' + tag + '] P len:', P ? P.length : 0);
  dom.window.close();
  return lvs;
}

(async () => {
  const a = await runOnce('A');
  console.log('=== 第二轮 ===');
  const b = await runOnce('B');
  console.log('A:', a ? a.slice(0, 120) : 'null');
  console.log('B:', b ? b.slice(0, 120) : 'null');
  if (a && b) console.log('确定性:', a === b);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

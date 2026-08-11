// 捕获多次运行（真实代理不同 cd）的 aebi[1]，对比是否固定
// 若 aebi[1] 跨 cd 固定 → 内层 VM 是固定程序 → f 可逆向
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  const samples = [];
  for (let run = 0; run < 3; run++) {
    let captured = null;
    const origRun = vm.runInContext;
    vm.runInContext = function (code, ctx, opts) {
      try {
        if (typeof code === 'string' && code.length > 400000 && !captured && ctx && ctx.$_ts) {
          captured = {
            aebi: ctx.$_ts.aebi !== undefined ? ctx.$_ts.aebi : null,
            cd: ctx.$_ts.cd !== undefined ? String(ctx.$_ts.cd).slice(0, 40) : null,
            nsd: ctx.$_ts.nsd,
          };
        }
      } catch (e) {}
      return origRun(code, ctx, opts);
    };
    const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() } });
    const w = dom.window;
    await new Promise((resolve) => {
      const t0 = Date.now(); let lastLen = 0;
      const iv = setInterval(() => {
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
        lastLen = pLen;
        if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
      }, 300);
    });
    if (captured && captured.aebi) {
      const a1 = captured.aebi[1];
      console.log('[AB] run#' + run + ' nsd=' + captured.nsd + ' cd=' + (captured.cd || '').slice(0, 15) + ' aebi len=' + captured.aebi.length + ' aebi[1] len=' + (a1 ? a1.length : 0));
      samples.push({ nsd: captured.nsd, cd: captured.cd, aebi1: a1 ? Array.from(a1).slice(0, 3000) : null, aebiLen: captured.aebi.length });
    } else {
      console.log('[AB] run#' + run + ' FAIL');
    }
    dom.window.close();
    await new Promise(r => setTimeout(r, 500));
  }
  // 对比 aebi[1]
  if (samples.length >= 2) {
    const a0 = samples[0].aebi1, a1 = samples[1].aebi1;
    if (a0 && a1) {
      const same = JSON.stringify(a0) === JSON.stringify(a1);
      console.log('\n[AB] aebi[1] 跨 cd 固定?', same);
      if (!same) {
        // 找差异
        const m = Math.min(a0.length, a1.length);
        let diffCount = 0, firstDiff = -1;
        for (let i = 0; i < m; i++) if (a0[i] !== a1[i]) { diffCount++; if (firstDiff < 0) firstDiff = i; }
        console.log('[AB] 差异数:', diffCount, '首个差异@', firstDiff, 'a0=' + a0[firstDiff] + ' a1=' + a1[firstDiff]);
        // 检查是否只有尾部差异（时间戳相关）
        console.log('[AB] a0 前 100:', a0.slice(0, 100).join(','));
        console.log('[AB] a1 前 100:', a1.slice(0, 100).join(','));
      } else {
        console.log('[AB] aebi[1] 完全固定（2553 条）');
      }
    }
  }
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_aebi_multi.json', JSON.stringify(samples));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e && e.message); process.exit(1); });

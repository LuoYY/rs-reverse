// 测试 sdenv 各阶段 $_ts 可用性
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  console.log('[TC] start');
  let tsAtParse = null, tsAtLoad = null;
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() },
    beforeParse(window) {
      try { if (window.$_ts) tsAtParse = { nsd: window.$_ts.nsd, cd: window.$_ts.cd }; } catch (e) {}
    },
  });
  const w = dom.window;
  try { if (w.$_ts) tsAtLoad = { nsd: w.$_ts.nsd, cd: w.$_ts.cd }; } catch (e) {}
  console.log('[TC] beforeParse $_ts:', tsAtParse ? 'nsd=' + tsAtParse.nsd + ' cd=' + tsAtParse.cd.length : '无');
  console.log('[TC] 加载后 $_ts:', tsAtLoad ? 'nsd=' + tsAtLoad.nsd + ' cd=' + tsAtLoad.cd.length : '无');
  console.log('[TC] $_ts keys:', (() => { try { return Object.keys(w.$_ts || {}).join(','); } catch (e) { return 'ERR'; } })());
  // 等 cookie
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
  try { if (w.$_ts) console.log('[TC] cookie后 $_ts keys:', Object.keys(w.$_ts).join(',')); } catch (e) {}
  console.log('[TC] done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TC] FATAL:', e.message); process.exit(1); });

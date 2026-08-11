// 测量 sdenv 生成 base 的内存占用
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  console.log('[MEM] pid=%d RSS起点=%dMB', process.pid, Math.round(process.memoryUsage().rss / 1048576));
  const t0 = Date.now();
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  console.log('[MEM] jsdom 加载后 RSS=%dMB heapUsed=%dMB', Math.round(process.memoryUsage().rss / 1048576), Math.round(process.memoryUsage().heapUsed / 1048576));
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
  console.log('[MEM] cookie 生成后 RSS=%dMB heapUsed=%dMB 耗时=%ds', Math.round(process.memoryUsage().rss / 1048576), Math.round(process.memoryUsage().heapUsed / 1048576), (Date.now() - t0) / 1000);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[MEM] FATAL:', e && e.message); process.exit(1); });

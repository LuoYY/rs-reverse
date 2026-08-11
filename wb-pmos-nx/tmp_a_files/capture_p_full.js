// 捕获完整 P cookie 值（两次运行对比 cookie 确定性）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
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
  const c = dom.cookieJar.getCookieStringSync(B + '/');
  const O = (c.match(/O=([^;]*)/) || [])[1];
  const Pval = (c.match(/P=([^;]*)/) || [])[1];
  console.log('O len:', O.length, 'P len:', Pval.length);
  fs.writeFileSync(process.argv[2], JSON.stringify({ O, P: Pval }));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e && e.message); process.exit(1); });

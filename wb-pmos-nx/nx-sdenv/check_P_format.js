// 检查 P cookie 值格式
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() },
  });
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
  console.log('cookies:', c.substring(0, 120));
  const O = (c.match(/O=([^;]*)/) || [])[1];
  const P = (c.match(/P=([^;]*)/) || [])[1];
  console.log('\nO len:', O ? O.length : 0, 'O head:', O ? O.slice(0, 20) : '');
  console.log('P len:', P ? P.length : 0, 'P head:', P ? P.slice(0, 20) : '');
  console.log('P charset:', P ? [...new Set(P)].join('') : '');
  console.log('O charset:', O ? [...new Set(O)].join('') : '');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

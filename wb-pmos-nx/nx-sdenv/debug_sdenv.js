// 最短 sdenv 测试（与 537 完全一致）
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
(async () => {
  console.log('require sdenv from:', require.resolve('sdenv'));
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const { window, cookieJar } = dom;
  console.log('_$ts:', window.$_ts ? 'OK nsd=' + window.$_ts.nsd : 'undefined');
  const cookies = await new Promise((resolve) => {
    const timer = setTimeout(() => { resolve(cookieJar.getCookieStringSync(B + '/')); }, 20000);
    window.addEventListener('sdenv:exit', () => { clearTimeout(timer); resolve(cookieJar.getCookieStringSync(B + '/')); });
  });
  console.log('cookie:', cookies.substring(0, 60));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

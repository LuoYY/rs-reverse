// 获取一组真实 nx nsd/cd 输出 JSON
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
(async () => {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom.window.$_ts.nsd;
  const cd = String(dom.window.$_ts.cd);
  dom.window.close();
  const out = { nsd, cd };
  fs.writeFileSync('/tmp/nx_nsd_cd.json', JSON.stringify(out));
  console.log('nsd:', nsd, 'cd_len:', cd.length);
  console.log('已保存 /tmp/nx_nsd_cd.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

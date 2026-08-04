// 从真实挑战页提取 nx 的 cp[2]（正确格式）
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
  const ts = dom.window.$_ts;
  const cp = ts.cp;
  console.log('cp 长度:', cp.length);
  for (let i = 0; i < cp.length; i++) {
    const v = cp[i];
    console.log(`cp[${i}]:`, typeof v, Array.isArray(v) ? `arr len=${v.length} 前5=${v.slice(0, 5)}` : String(v).substring(0, 50));
  }
  if (cp[2]) {
    fs.writeFileSync('/tmp/nx_cp2_real.json', JSON.stringify(cp[2]));
    console.log('已保存 /tmp/nx_cp2_real.json');
  }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

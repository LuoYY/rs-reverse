// 捕获 $_ts.scj/$_ts.aebi（本地固定 challenge）
// 验证 scj/aebi 确定性 + 是否可从 cd 派生
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
  let scj = null, aebi = null;
  // 快速 poll 捕获 $_ts
  await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      try {
        if (w.$_ts && w.$_ts.scj && !scj) {
          scj = w.$_ts.scj;
          aebi = w.$_ts.aebi;
        }
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (scj && pLen > 300) { clearInterval(iv); resolve(); }
        if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 50);
  });
  console.log('scj:', typeof scj, scj ? JSON.stringify(scj).slice(0, 200) : 'null');
  console.log('aebi:', typeof aebi, aebi ? 'len=' + aebi.length : 'null');
  if (aebi) {
    fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_scj_aebi.json', JSON.stringify({ scj, aebi }));
    console.log('saved');
  }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e && e.message); process.exit(1); });

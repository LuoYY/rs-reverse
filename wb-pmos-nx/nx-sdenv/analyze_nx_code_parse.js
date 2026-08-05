// 分析 nx Coder code：找 keys 解析算法（cd → keys）
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const Coder = require('@src/handler/Coder');
const getImmucfg = require('@utils/getImmucfg');
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

(async () => {
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  const gv = require('@src/handler/globalVarible');
  gv._setAttr('config', { keynameNum: 1151, adapt: { lastWord: 'P' } });
  const immucfg = getImmucfg(fs.readFileSync(OUTER_JS, 'utf8'));
  const coder = new Coder({ nsd, cd, keynameNum: 1151, hasCodemap: true, hasDebug: false }, immucfg);
  const ret = coder.run();
  const code = coder.code;
  console.log('code len:', code.length);

  // 找 cd 解密相关（xj 的 parseCdToKeys 逻辑在 mainFnCode 里）
  // 搜索 numKeys 相关：45 附近、slice、charCodeAt
  // 找所有含 "45" 的上下文
  const hits = [];
  const re = /.{50}45.{50}/g;
  let m;
  let cnt = 0;
  while ((m = re.exec(code)) && cnt < 10) {
    hits.push(m[0]);
    cnt++;
  }
  console.log('\n含 45 的上下文（前5）:');
  hits.slice(0, 5).forEach(h => console.log('  ', h.replace(/\n/g, ' ').substring(0, 100)));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

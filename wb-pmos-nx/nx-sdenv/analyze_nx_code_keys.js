// 分析 nx Coder 生成的 code：找 keys 解析相关常量（numKeys/gap）
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
  const ts = ret.$_ts;
  console.log('cp3:', ts.cp[3], 'codeLen:', coder.code.length);

  // 找 code 中与 keys 解析相关的数字（numKeys=45 附近的数字）
  const code = coder.code;
  // 搜索 "45" 或 keys 相关模式（xj: genKeys 里 numKeys=ans[0]）
  // nx: 找 code 里的 getKeys 或 numKeys 相关
  const nums = {};
  for (const m of code.matchAll(/\b(\d{1,3})\b/g)) {
    const n = parseInt(m[1]);
    if (n >= 20 && n <= 80) nums[n] = (nums[n] || 0) + 1;
  }
  const sorted = Object.entries(nums).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log('\ncode 中 20-80 数字出现频率:', JSON.stringify(sorted));

  // 找 "key" 相关片段
  const idx = code.indexOf('slice');
  console.log('\ncode 含 slice 位置:', idx);
  // 找 getKeys/parseKeys 相关
  for (const kw of ['numKeys', 'getKeys', 'parseKeys', 'genKeys', 'keys']) {
    const i = code.indexOf(kw);
    if (i >= 0) console.log(`\n'${kw}' @ ${i}: ${code.substring(i - 30, i + 60)}`);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

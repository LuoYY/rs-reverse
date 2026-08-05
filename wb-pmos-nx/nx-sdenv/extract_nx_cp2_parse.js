// 用 Node parse 解密 nx 的 cp[2]（正确 240 大数表）
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const parse = require('@src/handler/parser/common/main');
const Coder = require('@src/handler/Coder');
const getImmucfg = require('@utils/getImmucfg');

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
  coder.run();

  // parse cp[2]
  const cp2Str = coder.$_ts.cp[2];
  console.log('cp[2] 原始:', String(cp2Str).substring(0, 50), 'len:', String(cp2Str).length);
  const cp2 = parse(cp2Str).map(Number);
  console.log('cp2 解密后 len:', cp2.length, '类型:', typeof cp2[0]);
  console.log('cp2 前 30:', cp2.slice(0, 30));
  console.log('cp2 含大数:', cp2.filter(n => n > 10000 || n < 0).slice(0, 10));
  fs.writeFileSync('/tmp/nx_cp2_parsed.json', JSON.stringify(cp2));
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/go-impl/nx_cp2_parsed.json', JSON.stringify(cp2));
  console.log('\n已保存 nx_cp2_parsed.json');

  // 同时解析 cp[0] 验证
  const cp0 = parse(coder.$_ts.cp[0]);
  console.log('cp0 解密后 len:', cp0.length, '（xj 是 45+ 编码表）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

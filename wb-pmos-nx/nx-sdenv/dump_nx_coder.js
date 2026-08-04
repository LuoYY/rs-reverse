// 用 Node Coder 跑 nx：提取 codemap + r2mkaText + cp3 + aebi（供 Go 适配）
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
  console.log('nsd:', nsd, 'cd_len:', cd.length);

  // immucfg
  const jscode = fs.readFileSync(OUTER_JS, 'utf8');
  const immucfg = getImmucfg(jscode);
  console.log('immucfg: gt1=', immucfg.globalText1.length, 'gt2=', immucfg.globalText2.length, 'cp0=', immucfg.cp0.length);

  // Coder 跑 nx（keynameNum=1151）
  const gv = require('@src/handler/globalVarible');
  gv._setAttr('config', { keynameNum: 1151, adapt: { lastWord: 'P' } });
  const ts = { nsd, cd, from: B + '/', keynameNum: 1151, hasCodemap: true, hasDebug: false };
  const coder = new Coder(ts, immucfg);
  const ret = coder.run();
  const tsOut = ret.$_ts;
  console.log('cp3:', tsOut.cp[3]);
  console.log('code len:', coder.code.length, 'aebi:', tsOut.aebi.map(a => a.length).join(','));

  // 提取 codemap
  const codemap = ret.codemap || coder.genCodemap();
  console.log('codemap keys:', Object.keys(codemap).length);
  fs.writeFileSync('/tmp/nx_codemap.json', JSON.stringify(codemap));

  // 提取 r2mkaText
  console.log('r2mkaText len:', coder.r2mkaText.length);
  fs.writeFileSync('/tmp/nx_r2mka_codes.json', JSON.stringify([...coder.r2mkaText].map(c => c.charCodeAt(0))));

  // 保存 ts（含 aebi）
  fs.writeFileSync('/tmp/nx_ts_full.json', JSON.stringify(tsOut));
  console.log('\n已保存 /tmp/nx_codemap.json /tmp/nx_r2mka_codes.json /tmp/nx_ts_full.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

/**
 * 30_verify_encrypt_repro.js
 *
 * 完整初始化管线后，用浏览器 key21 + numenc 复现 innerEnc
 * 验证管线 encryptMode1 的常量（cfgnum）与 nx 浏览器是否一致
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  // 读取浏览器数据
  const innerFile = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
  const inner = JSON.parse(fs.readFileSync(path.join(OUT, innerFile)));
  const keys2 = inner.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48).args[1].d;
  const enc185 = inner.log.find(e => e.idx === 185 && e.args[0] && e.args[0].len === 288 && e.res && e.res.len === 304);
  const realInput = enc185.args[0].d;
  const realKey21 = enc185.args[1].d;
  const browserNumenc = realInput.map((b, i) => i < 16 ? b ^ keys2[i] : b);
  const browserInnerEnc = enc185.res.d;

  // 完整管线
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const r = runOuterVM({ nsd: inner.challenge.nsd, cd: inner.challenge.cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd: inner.challenge.nsd, cd: inner.challenge.cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;
  const Cookie = require('@src/handler/Cookie');
  const pipeCookie = new Cookie(coder).run();
  console.log('管线 cookie:', pipeCookie.length);

  // 用管线 encryptMode1 复现浏览器加密
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const myEnc = encryptMode1([...browserNumenc], [...realKey21], 0);
  console.log('\n浏览器 innerEnc 前8:', browserInnerEnc.slice(0, 8).map(b => b.toString(16)).join(' '));
  console.log('管线复现 innerEnc 前8:', myEnc.slice(0, 8).map(b => b.toString(16)).join(' '));
  const match = myEnc.length === browserInnerEnc.length && myEnc.every((b, i) => b === browserInnerEnc[i]);
  console.log('加密复现一致:', match ? 'YES ✓' : 'NO ✗');

  if (!match) {
    console.log('\n=== cfgnum 对比 ===');
    console.log('管线 cfgnum[0] 前8:', gv.cfgnum && gv.cfgnum[0] ? gv.cfgnum[0].slice(0, 8).join(',') : 'null');
    console.log('管线 cfgnum[1] 前8:', gv.cfgnum && gv.cfgnum[1] ? gv.cfgnum[1].slice(0, 8).join(',') : 'null');
    // 浏览器 cfgnum 在哪？[61] 是常量池函数，[65] 是对象
    // 从 funcs_constants 找
    if (fs.existsSync(path.join(OUT, 'funcs_constants.json'))) {
      const fc = JSON.parse(fs.readFileSync(path.join(OUT, 'funcs_constants.json')));
      console.log('浏览器 [61] fn len:', fc['61'] ? fc['61'].src.length : '无');
    }
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

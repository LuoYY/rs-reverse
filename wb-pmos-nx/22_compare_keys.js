/**
 * 22_compare_keys.js
 *
 * 用 full_*.json 的 challenge（同会话）跑管线，对比 keys2/keys16/keys17 与浏览器
 * 同时解析外层输入（nextarr）结构
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  // 读取 full 捕获
  const capFile = fs.readdirSync(OUT).filter(f => f.startsWith('full_')).sort().pop();
  const cap = JSON.parse(fs.readFileSync(path.join(OUT, capFile)));
  console.log('捕获 challenge nsd:', cap.challenge.nsd);

  // 浏览器 keys2（从 XOR 调用）
  const xorCalls = cap.log.filter(e => e.idx === 187 && e.arg1 && e.arg1.length === 48);
  const browserKeys2 = xorCalls[0].arg1;
  console.log('\n浏览器 keys2:', browserKeys2.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 浏览器 keys16（从 [598]）
  const addTimeCalls = cap.log.filter(e => e.idx === 598 && e.arg0 && e.arg0.length === 16);
  console.log('浏览器 keys16:', addTimeCalls[0].arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 keys17:', addTimeCalls[1].arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 外层加密输入（nextarr）
  const outer = cap.log.find(e => e.idx === 185 && e.arg0 && e.arg0.length >= 300);
  const nextarr = outer.arg0;
  console.log('\n外层输入 len:', nextarr.length);
  console.log('uuid4:', nextarr.slice(0, 4).map(b => b.toString(16)).join(''));
  console.log('nextarr 前 30:', nextarr.slice(4, 34).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 解析 nextarr
  const na = nextarr.slice(4);  // 去 uuid
  console.log('\n=== nextarr 结构解析 ===');
  console.log('na[0]:', na[0], '(xj 为 2，nx 为', na[0], ')');
  console.log('na[1..4]:', na.slice(1, 5).map(b => b.toString(16)).join(' '), '(时间?)');
  console.log('na[5..8]:', na.slice(5, 9).map(b => b.toString(16)).join(' '));
  console.log('na[9]:', na[9], 'na[10]:', na[10], 'na[11..]:', na.slice(11, 15).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // keys2 从 na 中找（browserKeys2）
  let k2pos = -1;
  for (let i = 0; i + 48 <= na.length; i++) {
    if (na.slice(i, i + 48).every((b, j) => b === browserKeys2[j])) { k2pos = i; break; }
  }
  console.log('\nkeys2 在 nextarr 中位置:', k2pos, '(从 0 计，去 uuid 后)');
  if (k2pos > 0) {
    const tail = na.slice(k2pos + 48);
    console.log('keys2 后内容:', tail.length, '字节');
    console.log('  前 10:', tail.slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }

  // 管线跑同 cd
  console.log('\n[管线] 同会话跑 keys...');
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const nsd = cap.challenge.nsd, cd = cap.challenge.cd;
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
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
  try {
    const Cookie = require('@src/handler/Cookie');
    new Cookie(coder).run();
    const pKeys2 = gv.keys[2];
    console.log('管线 keys2:', pKeys2.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys2 匹配浏览器:', pKeys2.every((b, i) => b === browserKeys2[i]) ? 'YES ✓' : 'NO ✗');
    console.log('管线 keys16:', gv.keys[16].map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('管线 keys17:', gv.keys[17].map(b => b.toString(16).padStart(2, '0')).join(' '));
  } catch (e) {
    console.log('管线失败:', e.message.substring(0, 80));
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

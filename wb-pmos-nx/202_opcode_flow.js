/**
 * 202_opcode_flow.js
 *
 * 分析 aebi 操作码流：找 op62（创建数组）+ op38（push 常量）构建 basestr 的模式
 * 操作码数据在 aebi——basestr 字符代码可能是 op38 的参数（不连续）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
  const { nsd, cd } = sync.challenge;
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: 'https://pmos.nx.sgcc.com.cn:10443/', hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/202-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/202-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  coder.run();
  const aebi = coder.$_ts.aebi;
  console.log('aebi 长度:', aebi.map(a => a.length).join(','));

  // 操作码范围（瑞数操作码 0-113，最大值判断）
  for (let ai = 0; ai < aebi.length; ai++) {
    const arr = aebi[ai];
    const max = Math.max(...arr);
    const opcodes = arr.filter(v => v <= 113).length;
    console.log(`\naebi[${ai}] len=${arr.length} max=${max} 操作码(≤113)=${opcodes} 数据(>113)=${arr.length - opcodes}`);
    // 找 op62（创建数组）+ 后续填充模式
    const bsChars = new Set([45, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 95, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122]);
    // op38（push 常量）后跟常量（字符代码）——找连续"op38, 字符代码"模式
    let found = 0;
    for (let i = 0; i < arr.length - 1 && found < 8; i++) {
      if (arr[i] === 38 && bsChars.has(arr[i + 1])) {
        console.log(`  op38@${i}: push '${String.fromCharCode(arr[i + 1])}'(${arr[i + 1]})`);
        found++;
      }
    }
    // op33（属性赋值）——数组[键]=值
    let found33 = 0;
    for (let i = 0; i < arr.length - 1 && found33 < 5; i++) {
      if (arr[i] === 33) {
        console.log(`  op33@${i}: 属性赋值`);
        found33++;
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

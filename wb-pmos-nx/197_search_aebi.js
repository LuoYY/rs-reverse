/**
 * 197_search_aebi.js
 *
 * 分析 coder.$_ts.aebi（6 个指令数组）→ 搜索 basestr(64) 的字符代码序列
 * 操作码 push 常量（op1/38）来自 aebi——basestr 字符代码可能在 aebi
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
  fs.writeFileSync('/tmp/197-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/197-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  coder.run();
  const aebi = coder.$_ts.aebi;
  console.log('aebi 数组数:', aebi.length);
  aebi.forEach((arr, i) => console.log('aebi[' + i + ']:', arr.length, '个元素'));

  // basestr 字符代码（0-9A-Z_a-z）
  const bsChars = new Set([45, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 95, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122]);
  // 86 basestr 字符代码（含 - 在 j-7z 的完整 86）
  const bs86 = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^";
  const bs86Codes = bs86.split('').map(c => c.charCodeAt(0));

  for (let ai = 0; ai < aebi.length; ai++) {
    const arr = aebi[ai];
    // 搜索 basestr(64) 字符代码的连续序列
    let best = 0, bestStart = -1, bestStr = '';
    for (let i = 0; i < arr.length - 40; i++) {
      let j = i, inTarget = 0;
      while (j < arr.length && bsChars.has(arr[j])) { inTarget++; j++; }
      if (inTarget > best) { best = inTarget; bestStart = i; bestStr = arr.slice(i, i + inTarget).map(c => String.fromCharCode(c)).join(''); }
      i = j - 1;
    }
    if (best >= 40) {
      console.log(`\naebi[${ai}] 最长 basestr 字符序列: ${best} 个 @${bestStart}:`);
      console.log('  ', JSON.stringify(bestStr));
      // 找 86 basestr 的序列
      let best86 = 0, best86Start = -1;
      for (let i = 0; i < arr.length - 80; i++) {
        let match = 0;
        for (let k = 0; k < bs86Codes.length && i + k < arr.length; k++) {
          if (arr[i + k] === bs86Codes[k]) match++; else break;
        }
        if (match > best86) { best86 = match; best86Start = i; }
      }
      console.log(`  86 basestr 匹配: ${best86} 个 @${best86Start}`);
    }
  }
  // 搜索 bs86 在整个 aebi 的连续出现
  for (let ai = 0; ai < aebi.length; ai++) {
    const arr = aebi[ai];
    for (let i = 0; i < arr.length - bs86Codes.length; i++) {
      let match = 0;
      for (let k = 0; k < bs86Codes.length; k++) {
        if (arr[i + k] === bs86Codes[k]) match++; else break;
      }
      if (match >= 30) console.log(`aebi[${ai}] @${i}: 86 basestr 前缀 ${match} 个匹配`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

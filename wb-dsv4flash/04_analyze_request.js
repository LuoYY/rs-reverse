/**
 * 04_analyze_request.js
 *
 * 核心验证：同一会话 cd → 管线推导 keys → 测试 request_data 解密
 *
 * 1. 管线 keys2 应与 query session_data 完全相等（验证 cd 正确性）
 * 2. 用 keys16/keys17/numarrAddTime 变体 + encryptMode2 解密 request_data
 *    → 观察明文结构（URL? 时间戳? 随机数?）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'captures');
const captureFile = process.argv[2] || 'cd_query_1785488040701.json';
const data = JSON.parse(fs.readFileSync(path.join(OUT, captureFile), 'utf8'));
const { nsd, cd } = data.challenge;
const OUTER_JS = path.join(__dirname, '../example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

console.log('=== 同会话分析 ===');
console.log('nsd=' + nsd + ' cdLen=' + cd.length);

// ---- 管线生成 keys ----
async function genKeys() {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.join(__dirname, '..'));
  const { runOuterVM } = require('../extract_dyncode_20080.js');
  const outerJs = fs.readFileSync(OUTER_JS, 'utf8');
  const r = runOuterVM({ nsd, cd }, outerJs);
  if (!r.cp3) throw new Error('cp3 提取失败');
  const cp3 = r.cp3;

  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const tmpTs = '/tmp/pmos-xj-ts.json';
  fs.writeFileSync(tmpTs, JSON.stringify({ nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 }));
  const argv = { file: tmpTs, jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, '..', 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 });
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', keynameNum: 909, cp3Override: cp3 }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = cp3;
  gv.config.codemap = codemap;
  // 触发 parser.init → tscd.init → gv.keys
  require('@src/handler/parser/').init(coder);
  return { gv, fullTs };
}

(async () => {
  const { gv } = await genKeys();
  const keys = gv.keys;
  const keys16 = keys[16], keys17 = keys[17], keys2 = keys[2];
  console.log('\n=== 管线推导的 keys ===');
  console.log('keys[2] len=' + keys2.length, keys2.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys[16] len=' + keys16.length, keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys[17] len=' + keys17.length, keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys[7] =', gv.utils.ascii2string(keys[7]));

  // ---- 验证 session_data == keys2 ----
  const q0 = data.decodedQueries[0];
  const sessionEq = q0.session.length === keys2.length && q0.session.every((b, i) => b === keys2[i]);
  console.log('\n=== session_data == keys[2]?', sessionEq ? '✅ 完全相等！' : '❌ 不等');
  if (!sessionEq) {
    console.log('  session:', q0.sessionHex);
    console.log('  keys2  :', keys2.map(b => b.toString(16).padStart(2, '0')).join(' '));
  }

  // ---- request_data 解密测试 ----
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  console.log('\n=== request_data 解密测试（16 个 query）===');
  const qs = data.decodedQueries;
  const keyCandidates = {
    'keys16': keys16,
    'keys17': keys17,
    'keys17+time': numarrAddTime(keys17)[0],
    'keys16+time': numarrAddTime(keys16)[0],
    'keys2[0:16]': keys2.slice(0, 16),
  };

  for (const [kName, kArr] of Object.entries(keyCandidates)) {
    for (const flag of [0, 1]) {
      let hits = 0;
      let firstPlain = null;
      for (const q of qs) {
        try {
          const pt = encryptMode2([...q.request], [...kArr], flag);
          if (pt && pt.length > 0) {
            const ascii = pt.filter(b => b >= 32 && b <= 126).length / pt.length;
            if (ascii > 0.7) {
              hits++;
              if (!firstPlain) firstPlain = pt;
            }
          }
        } catch (e) {}
      }
      if (hits > 0) {
        console.log(`  ★ ${kName} flag=${flag}: ${hits}/${qs.length} 请求解密出 >70% ASCII!`);
        console.log('    明文:', firstPlain.join(','));
        console.log('    ascii:', String.fromCharCode(...firstPlain.filter(b => b >= 32 && b <= 126)));
      }
    }
  }

  // 详细展示第一个 query 的各个 key 解密输出
  console.log('\n=== 详细输出（query[0]）===');
  for (const [kName, kArr] of Object.entries(keyCandidates)) {
    for (const flag of [0, 1]) {
      try {
        const pt = encryptMode2([...qs[0].request], [...kArr], flag);
        if (pt && pt.length > 0) {
          const ascii = pt.filter(b => b >= 32 && b <= 126).length / pt.length;
          console.log(`  ${kName} flag=${flag}: ${pt.length}B ASCII=${(ascii * 100).toFixed(0)}% [${pt.join(',')}]`);
        }
      } catch (e) { console.log(`  ${kName} flag=${flag}: err ${e.message}`); }
    }
  }

  // 标准 AES-CBC 对比
  console.log('\n=== 标准 AES-128-CBC 对比（zero IV, no padding strip）===');
  for (const [kName, kArr] of Object.entries(keyCandidates)) {
    const key = Buffer.from(kArr.slice(0, 16));
    for (const [segName, seg] of [['session', qs[0].session], ['request', qs[0].request]]) {
      try {
        const d = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0));
        d.setAutoPadding(false);
        const raw = Buffer.concat([d.update(Buffer.from(seg)), d.final()]);
        const lastByte = raw[raw.length - 1];
        const ascii = [...raw].filter(b => b >= 32 && b <= 126).length / raw.length;
        console.log(`  ${kName} ${segName}: lastByte=${lastByte} ASCII=${(ascii * 100).toFixed(0)}% [${[...raw].slice(0, 24).join(',')}]`);
      } catch (e) {}
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

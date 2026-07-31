/**
 * 10_crack_session16.js
 *
 * 破解 16B 会话值 = prefix13 + const3
 * 假设：会话值 = 某种 hash(keys/cd/组合)
 * 穷举所有常见哈希 + 管线函数输出
 *
 * 同时验证：管线从捕获 cd 推导的 keys 与浏览器 keys30 是否一致
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'captures');

// 加载管线
require('module-alias')(path.join(__dirname, '..'));
const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
require('@src/handler/parser/constData').init();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)) ^ ((crc & 1) ? 0 : 0), (crc ^= b) || (crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)));
  return (crc ^ 0xffffffff) >>> 0;
}

// 简化正确 crc32
function crc32b(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function genKeysFromCd(nsd, cd) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.join(__dirname, '..'));
  const OUTER_JS = path.join(__dirname, '../example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
  const { runOuterVM } = require('../extract_dyncode_20080.js');
  const outerJs = fs.readFileSync(OUTER_JS, 'utf8');
  const r = runOuterVM({ nsd, cd }, outerJs);
  if (!r.cp3) throw new Error('cp3 failed');
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const tmpTs = '/tmp/pmos-xj-ts2.json';
  fs.writeFileSync(tmpTs, JSON.stringify({ nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 }));
  const argv = { file: tmpTs, jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, '..', 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 });
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', keynameNum: 909, cp3Override: r.cp3 }, gv.config.immucfg);
  coder.run();
  require('@src/handler/parser/').init(coder);
  return gv.keys;
}

function md5(...parts) { return [...crypto.createHash('md5').update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest()]; }
function sha1(...parts) { return [...crypto.createHash('sha1').update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest()]; }
function sha256(...parts) { return [...crypto.createHash('sha256').update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest()]; }
function crcOf(...parts) { const b = Buffer.concat(parts.map(p => Buffer.from(p))); const c = crc32b(b); return [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]; }

(async () => {
  // 处理所有捕获文件
  const files = fs.readdirSync(OUT).filter(f => (f.startsWith('cd_keys_query_') || f.startsWith('plaintext_')) && f.endsWith('.json'));
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
    if (!data.keys30 || !data.keys30[17]) continue;
    const enc24 = (data.encLog || []).filter(c => c.resultType === 'arr[32]' && (c.args || []).join(',').includes('arr[24]'));
    if (!enc24.length) continue;

    const keys16 = data.keys30[16].d, keys17 = data.keys30[17].d, keys2 = data.keys30[2].d;
    const prefix = enc24[0].arg0.slice(0, 13);
    const const3 = enc24[0].arg0.slice(16, 19);
    const session16 = [...prefix, ...const3];

    console.log(`\n=== ${f} ===`);
    console.log('prefix13:', prefix.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('const3  :', const3.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('session16:', session16.map(b => b.toString(16).padStart(2, '0')).join(' '));

    // 用管线推导 keys 对比
    if (data.challenge && data.challenge.cd) {
      try {
        const pipeKeys = await genKeysFromCd(data.challenge.nsd, data.challenge.cd);
        console.log('管线 keys2  == 浏览器 keys2:', pipeKeys[2].length === keys2.length && pipeKeys[2].every((b, i) => b === keys2[i]) ? '★YES' : 'NO');
        console.log('管线 keys17 == 浏览器 keys17:', pipeKeys[17].length === keys17.length && pipeKeys[17].every((b, i) => b === keys17[i]) ? '★YES' : 'NO');
      } catch (e) { console.log('管线推导失败:', e.message.substring(0, 60)); }
    }

    // 穷举会话值
    const cands = {};
    const names = { k16: keys16, k17: keys17, k2: keys2, k2a: keys2.slice(0, 16), k2b: keys2.slice(16, 32), k2c: keys2.slice(32, 48) };
    for (const [n1, a1] of Object.entries(names)) {
      for (const [n2, a2] of Object.entries(names)) {
        cands['md5(' + n1 + ')'] = md5(a1);
        cands['md5(' + n1 + '+' + n2 + ')'] = md5(a1, a2);
        cands['sha1(' + n1 + ')'] = sha1(a1).slice(0, 16);
        cands['sha256(' + n1 + ')'] = sha256(a1).slice(0, 16);
        cands['crc(' + n1 + ')' + (n2 || '')] = [...crcOf(a1), ...crcOf(a2).slice(0, 12)];
        cands['crcx4(' + n1 + ')'] = [...crcOf(a1), ...crcOf(a1), ...crcOf(a1), ...crcOf(a1)];
        cands['crcx3+' + n2] = [...crcOf(a1), ...crcOf(a1), ...crcOf(a1), ...crcOf(a2).slice(0, 4)];
        // encryptMode1 输出
        try { cands['enc1(' + n1 + ',' + n2 + ',0)'] = encryptMode1([...a1], [...a2], 0); } catch (e) {}
        try { cands['enc1(' + n2 + ',' + n1 + ',0)'] = encryptMode1([...a2], [...a1], 0); } catch (e) {}
      }
    }
    // cd 相关
    if (data.challenge && data.challenge.cd) {
      const cd = Buffer.from(data.challenge.cd, 'utf8');
      cands['md5(cd)'] = md5([...cd]);
      cands['sha1(cd)'] = sha1([...cd]).slice(0, 16);
      cands['md5(nsd+cd)'] = md5([data.challenge.nsd >>> 0, ...cd]);
    }

    let found = false;
    for (const [name, v] of Object.entries(cands)) {
      if (v && v.length >= 16 && v.slice(0, 16).every((b, i) => b === session16[i])) {
        console.log(`  ★★★ 会话值 = ${name} !!!`);
        found = true;
      }
    }
    if (!found) {
      console.log('  未找到匹配（尝试了 ' + Object.keys(cands).length + ' 个候选）');
      // 打印与 session16 最接近的
      let best = null, bestScore = 0;
      for (const [name, v] of Object.entries(cands)) {
        if (!v || v.length < 16) continue;
        let s = 0;
        for (let i = 0; i < 16; i++) if (v[i] === session16[i]) s++;
        if (s > bestScore) { bestScore = s; best = name; }
      }
      console.log('  最接近: ' + best + ' 命中 ' + bestScore + '/16');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

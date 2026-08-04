/**
 * 728_B_68_92_crypto.js
 * base[68:92] 是否 = encryptMode1/XXTEA(某数据, keys17/keys2)？
 * 或者与 numarrEncrypt 相关
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode1 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));

// base[68:92] 24B = encryptMode1(12B, keys) ? encryptMode1 输出与输入等长
// 检查 base[68:92] 是否是 encryptMode1 的输出（用 keys2 做 key）
console.log('=== base[68:92] 加密测试 ===');
for (const s of NORMAL.slice(0, 3)) {
  const seg = s.base.slice(68, 92);
  // 尝试：seg = encryptMode1(明文, numarrAddTime(keys2))，明文未知
  // 反向：decryptMode2(seg) → 明文？
  // 检查 seg 是否可被 keys2 解出有意义数据
  const k2t = numarrAddTime([...s.keys2], 0, 1 / 256)[0];
  // encryptMode2 是 decrypt
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  try {
    const dec = encryptMode2([...seg], k2t, 1);
    console.log(`nsd=${s.nsd}: encryptMode2(seg, keys2) = ${dec.join(',')}`);
    const dec0 = encryptMode2([...seg], k2t, 0);
    console.log(`  flag0: ${dec0.join(',')}`);
  } catch (e) { console.log(`nsd=${s.nsd} err: ${e.message}`); }
}

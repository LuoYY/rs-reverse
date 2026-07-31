/**
 * 06_verify_query_chain.js
 *
 * 验证完整 query 加密链：
 *   1. queryKey = numarrAddTime(keys17, time, random)  （从捕获的 21B key 反推 base == keys17）
 *   2. request_data = encryptMode1(plaintext_24B, queryKey, 0)
 *   3. 用管线 encryptMode1 复现 → 与浏览器 request_data 完全一致
 *
 * 数据源：cd_keys_query_*.json（含 keys30 + encLog + decodedQueries）
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'captures');
const captureFile = process.argv[2] || fs.readdirSync(OUT).filter(f => f.startsWith('cd_keys_query_')).sort().pop();
const data = JSON.parse(fs.readFileSync(path.join(OUT, captureFile), 'utf8'));

// 加载管线
require('module-alias')(path.join(__dirname, '..'));
const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
require('@src/handler/parser/constData').init();

const keys17 = data.keys30[17].d; // 浏览器 keys17 (16B)
const keys2 = data.keys30[2].d;

// 提取 24→32 加密调用
const enc24 = data.encLog.filter(c => c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]'));
console.log('=== Query 加密链验证 ===');
console.log('keys17:', keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

let allMatch = true;
enc24.forEach((c, i) => {
  const plain = c.arg0;   // 24B 明文
  const key21 = c.arg1;   // 21B 密钥
  const expected = c.result; // 32B 密文

  // 1. 从 key21 恢复 base16
  const ele = key21[20];
  const base16 = key21.slice(0, 16).map(b => b ^ ele);
  const time4 = key21.slice(16, 20).map(b => b ^ ele);
  const timeVal = (time4[0] << 24 | time4[1] << 16 | time4[2] << 8 | time4[3]) >>> 0;

  // 2. 验证 base16 == keys17
  const baseMatch = base16.every((b, j) => b === keys17[j]);

  // 3. 用管线加密复现
  let reproduced = null;
  try {
    const [arr21] = numarrAddTime([...keys17], timeVal, ele / 256); // ele = ceil(random*256) → random = (ele-1)/256 可能不准
    reproduced = encryptMode1([...plain], arr21, 0);
  } catch (e) {}

  // 用捕获的原始 key21 直接加密（排除 time/random 恢复误差）
  let reproduced2 = null;
  try {
    reproduced2 = encryptMode1([...plain], key21, 0);
  } catch (e) {}

  const match1 = reproduced2 && reproduced2.length === expected.length && reproduced2.every((b, j) => b === expected[j]);
  const match2 = reproduced && reproduced.length === expected.length && reproduced.every((b, j) => b === expected[j]);
  if (!match1) allMatch = false;

  console.log(`\n[enc call ${i}]`);
  console.log(`  base16 == keys17: ${baseMatch ? '★YES' : 'NO'}  ele=0x${ele.toString(16)} time=${timeVal}`);
  console.log(`  明文24: ${plain.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  key21 : ${key21.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  encryptMode1(明文, key21, 0) == 浏览器密文: ${match1 ? '★ 完全一致！' : 'NO'}`);
  console.log(`  encryptMode1(明文, numarrAddTime(keys17)) == 密文: ${match2 ? '★ 完全一致！' : 'NO'}`);
});

// 明文结构分析
console.log('\n=== 24B 明文结构分析 ===');
const plains = enc24.map(c => c.arg0);
const n = plains.length;
if (n >= 2) {
  let constPrefix = 0;
  for (let b = 0; b < 24; b++) {
    let allSame = true;
    for (let i = 1; i < n; i++) if (plains[i][b] !== plains[0][b]) { allSame = false; break; }
    if (allSame) constPrefix = b + 1; else break;
  }
  console.log('固定前缀长度:', constPrefix, '→', plains[0].slice(0, constPrefix).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('变化后缀:');
  for (let i = 0; i < n; i++) {
    console.log(`  [${i}] ${plains[i].slice(constPrefix).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  }
  // 变化字节逐列
  console.log('\n变化字节逐列（0x = 变化，· = 固定）:');
  for (let b = constPrefix; b < 24; b++) {
    const vals = plains.map(p => p[b]);
    const allSame = vals.every(v => v === vals[0]);
    console.log(`  byte${b}: ${allSame ? '·' : '0x'} ${vals.map(v => v.toString(16).padStart(2, '0')).join(' ')}`);
  }
}

// 与 keys30 其他数组对比明文前缀
console.log('\n=== 明文固定前缀 vs keys30 数组 ===');
const prefix = plains[0].slice(0, 13);
for (let i = 0; i < Math.min(45, data.keys30.length); i++) {
  const k = data.keys30[i];
  if (!k || k.t !== 'arr' || k.len < 13) continue;
  const match = k.d.slice(0, 13).every((b, j) => b === prefix[j]);
  if (match) console.log(`  ★ keys30[${i}] 前13字节与明文前缀一致!`);
}
// keys2 部分匹配分析
console.log('\nkeys2 与明文前缀逐字节对比:');
for (let b = 0; b < 13; b++) {
  console.log(`  byte${b}: prefix=0x${prefix[b].toString(16).padStart(2,'0')} keys2=0x${keys2[b].toString(16).padStart(2,'0')} ${prefix[b]===keys2[b]?'✓':' '}`);
}

// keys17 XOR keys2 尝试
console.log('\n=== 明文前缀 = keys17 XOR keys2 片段? ===');
const xor172 = keys17.map((b, i) => b ^ keys2[i]);
console.log('keys17^keys2[0:16]:', xor172.map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('prefix            :', prefix.map(b => b.toString(16).padStart(2, '0')).join(' '));

process.exit(0);

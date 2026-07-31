/**
 * 21_verify_and_analyze.js
 * 
 * 1. 验证捕获的加密数据（用管线 encryptMode1 重新加密对比）
 * 2. 分析 query 密钥与 keys17 的关系
 * 3. 分析 24 字节明文结构
 * 4. 推导 query 密钥来源
 */
const path = require('path');
const fs = require('fs');
require('module-alias')(path.join(__dirname, '..'));

const gv = require('@src/handler/globalVarible');
const constData = require('@src/handler/parser/constData');
constData.init();

const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

// 加载捕获数据
const capture = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures/full_capture.json'), 'utf8'));
const encLog = capture.encLog;
const crcLog = capture.crcLog;

console.log('=== Query 加密验证 ===\n');

// [1] 分离 cookie 和 query 加密调用
const cookieInnerCalls = encLog.filter(e => e.data?.length === 216);
const cookieOuterCalls = encLog.filter(e => e.data?.length === 289);
const queryCalls = encLog.filter(e => e.data?.length === 24);

console.log(`Cookie 内层: ${cookieInnerCalls.length} 次`);
console.log(`Cookie 外层: ${cookieOuterCalls.length} 次`);
console.log(`Query 加密: ${queryCalls.length} 次`);

// [2] 验证 encryptMode1 正确性
console.log('\n--- 验证 encryptMode1 ---');
for (let i = 0; i < queryCalls.length; i++) {
  const qc = queryCalls[i];
  const reEncrypted = encryptMode1([...qc.data], [...qc.key], 0);
  const match = JSON.stringify(reEncrypted) === JSON.stringify(qc.result);
  console.log(`  Query[${i}]: encryptMode1(data, key, 0) ${match ? '✅ 完全匹配！' : '❌ 不匹配'}`);
  if (!match) {
    console.log(`    期望: [${qc.result.slice(0, 10).join(',')}]`);
    console.log(`    实际: [${reEncrypted.slice(0, 10).join(',')}]`);
  }
}

// 也验证 cookie 加密
for (let i = 0; i < cookieInnerCalls.length; i++) {
  const cc = cookieInnerCalls[i];
  const reEncrypted = encryptMode1([...cc.data], [...cc.key], 0);
  const match = JSON.stringify(reEncrypted) === JSON.stringify(cc.result);
  console.log(`  CookieInner[${i}]: ${match ? '✅' : '❌'}`);
}

for (let i = 0; i < cookieOuterCalls.length; i++) {
  const cc = cookieOuterCalls[i];
  // flag=undefined 默认为 1，但 random 参数不确定
  // 跳过验证（因为 flag=1 有随机 IV）
}

// [3] 分析 query 密钥与 keys17 的关系
console.log('\n--- 密钥分析 ---');

// 从 cookie 内层提取 keys17
const keys17List = cookieInnerCalls.map(cc => {
  const [stripped] = numarrAddTime.reverse([...cc.key]);
  return stripped;
});

// 从 query 加密提取 query base key
const queryKeys = queryCalls.map(qc => {
  const [stripped] = numarrAddTime.reverse([...qc.key]);
  return stripped;
});

console.log(`\nkeys17 (from cookie inner):`);
for (let i = 0; i < keys17List.length; i++) {
  console.log(`  [${i}]: [${keys17List[i].join(',')}]`);
}

console.log(`\nQuery base key:`);
for (let i = 0; i < queryKeys.length; i++) {
  console.log(`  [${i}]: [${queryKeys[i].join(',')}]`);
}

// 比较
if (keys17List.length > 0 && queryKeys.length > 0) {
  const k17 = keys17List[0];
  const qk = queryKeys[0];
  
  console.log(`\n比较 keys17 vs query_key:`);
  const diffs = [];
  for (let i = 0; i < 16; i++) {
    if (k17[i] !== qk[i]) {
      diffs.push({ pos: i, k17: k17[i], qk: qk[i], xor: k17[i] ^ qk[i], diff: k17[i] - qk[i] });
    }
  }
  
  if (diffs.length === 0) {
    console.log('  ★★★ 完全相同！query_key == keys17');
  } else {
    console.log(`  差异字节数: ${diffs.length}`);
    for (const d of diffs) {
      console.log(`  位置 ${d.pos}: keys17=${d.k17} query=${d.qk} XOR=${d.xor} diff=${d.diff}`);
    }
  }
  
  // 检查所有 query key 是否相同
  const allSame = queryKeys.every(qk => JSON.stringify(qk) === JSON.stringify(queryKeys[0]));
  console.log(`\n所有 query key 相同: ${allSame ? '✅ YES' : '❌ NO'}`);
  
  // 检查所有 keys17 是否相同
  const allSameK17 = keys17List.every(k => JSON.stringify(k) === JSON.stringify(keys17List[0]));
  console.log(`所有 keys17 相同: ${allSameK17 ? '✅ YES' : '❌ NO'}`);
}

// [4] 分析 24 字节明文结构
console.log('\n--- 明文结构分析 ---');
for (let i = 0; i < queryCalls.length; i++) {
  const pt = queryCalls[i].data;
  console.log(`\nQuery[${i}] 明文 (${pt.length}B):`);
  console.log(`  完整: [${pt.join(',')}]`);
  console.log(`  hex: ${pt.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  
  // 分析固定部分和变化部分
  if (i === 0) continue;
  const prev = queryCalls[0].data;
  const fixed = [];
  const changed = [];
  for (let j = 0; j < pt.length; j++) {
    if (pt[j] === prev[j]) fixed.push(j);
    else changed.push(j);
  }
  console.log(`  vs Q[0] 固定: [${fixed.join(',')}] (${fixed.length}B)`);
  console.log(`  vs Q[0] 变化: [${changed.join(',')}] (${changed.length}B)`);
}

// 检查明文中是否包含 CRC32(URL)
console.log('\n--- CRC32 关联 ---');
for (const c of crcLog) {
  if (typeof c.input === 'number') {
    console.log(`  CRC32(${c.input}B) = 0x${(c.result >>> 0).toString(16).padStart(8, '0')}`);
  } else {
    console.log(`  CRC32(string) = 0x${(c.result >>> 0).toString(16).padStart(8, '0')}`);
  }
}

// 检查明文前 4 字节是否是某个 CRC32
for (let i = 0; i < queryCalls.length; i++) {
  const pt = queryCalls[i].data;
  const first4BE = ((pt[0] << 24) | (pt[1] << 16) | (pt[2] << 8) | pt[3]) >>> 0;
  const first4LE = ((pt[3] << 24) | (pt[2] << 16) | (pt[1] << 8) | pt[0]) >>> 0;
  console.log(`  Q[${i}] 明文前 4B: BE=0x${first4BE.toString(16)} LE=0x${first4LE.toString(16)}`);
}

// [5] 验证解密
console.log('\n--- 解密验证 ---');
for (let i = 0; i < queryCalls.length; i++) {
  const qc = queryCalls[i];
  const decrypted = encryptMode2([...qc.result], [...qc.key], 0);
  const match = JSON.stringify(decrypted) === JSON.stringify(qc.data);
  console.log(`  Query[${i}]: encryptMode2(result, key, 0) ${match ? '✅ 解密正确' : '❌ 解密失败'}`);
  if (!match) {
    console.log(`    期望: [${qc.data.join(',')}]`);
    console.log(`    实际: [${decrypted.join(',')}]`);
  }
}

// [6] 用 keys17 直接解密 query（测试之前的假设）
console.log('\n--- 用 keys17 解密 query ---');
if (keys17List.length > 0 && queryCalls.length > 0) {
  const k17 = keys17List[0];
  // 构造 21B key（numarrAddTime 格式）
  const [arr21] = numarrAddTime([...k17]);
  
  for (let i = 0; i < queryCalls.length; i++) {
    const qc = queryCalls[i];
    try {
      const decrypted = encryptMode2([...qc.result], [...arr21], 0);
      const ascii = decrypted.filter(b => b >= 32 && b < 127).length;
      const ratio = (ascii / decrypted.length * 100).toFixed(0);
      console.log(`  keys17 解密 Q[${i}]: ${decrypted.length}B ASCII=${ratio}% [${decrypted.slice(0, 10).join(',')}]`);
    } catch(e) {
      console.log(`  keys17 解密 Q[${i}]: error ${e.message.substring(0, 50)}`);
    }
  }
}

console.log('\n=== 完成 ===');

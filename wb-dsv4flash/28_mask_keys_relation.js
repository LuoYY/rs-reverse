/**
 * 28_mask_keys_relation.js
 *
 * 用 5 个会话数据，全面测试 mask 与 keys 数组的关系：
 *   mask[i] = keysA[a+i] XOR keysB[b+i]  （a,b 任意偏移）
 * 如果成立，掩码可由管线完全生成
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'captures');

function load(f) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const enc24 = (d.encLog || []).filter(c => c.resultType === 'arr[32]' && (c.args || []).join(',').includes('arr[24]'));
  if (!enc24.length || !d.keys30 || !d.keys30[17]) return null;
  const plain = enc24[0].arg0;
  const keys2 = d.keys30[2].d;
  const mask = plain.slice(0, 13).map((b, i) => b ^ keys2[i]);
  return { file: f, mask, keys2, keys16: d.keys30[16].d, keys17: d.keys30[17].d, keys18: d.keys30[18].d };
}

const sessions = [
  'cd_keys_query_1785488187669.json',
  'plaintext_1785488407275.json',
  'everything_1785488791311.json',
  'everything_1785489159074.json',
  'vmstack_hit3_1785489583643.json',
].map(f => load(f)).filter(Boolean);

console.log('会话数:', sessions.length);
const maskTarget = sessions[0].mask.slice(0, 8); // 0b 16 00 10 00 31 00 01

// 测试 mask = keysA[a..] XOR keysB[b..]（前 8 字节）
const keySets = ['keys2', 'keys16', 'keys17', 'keys18'];
const keyMap = { keys2: 'keys2', keys16: 'keys16', keys17: 'keys17', keys18: 'keys18' };
let found = null;

// 对每一对 keys 源和偏移，检查跨会话是否恒定且等于 mask
for (const srcA of keySets) {
  for (const srcB of keySets) {
    if (srcA === srcB) continue;
    for (let a = 0; a <= 32; a++) {
      for (let b = 0; b <= 32; b++) {
        // 检查所有会话
        let allMatch = true;
        for (const s of sessions) {
          const A = s[srcA], B = s[srcB];
          if (!A || !B || a + 8 > A.length || b + 8 > B.length) { allMatch = false; break; }
          for (let i = 0; i < 8; i++) {
            if ((A[a + i] ^ B[b + i]) !== maskTarget[i]) { allMatch = false; break; }
          }
          if (!allMatch) break;
        }
        if (allMatch) {
          found = { srcA, a, srcB, b, mask: sessions[0].mask.slice(0, 13).map((m, i) => i < 8 ? m : '-') };
          console.log(`★★★ 掩码 = ${srcA}[${a}..] XOR ${srcB}[${b}..]`);
        }
      }
    }
  }
}

// 单源测试：mask = keysA[a..]（keysA 需跨会话恒定）
console.log('\n=== 单源测试 ===');
for (const srcA of keySets) {
  for (let a = 0; a <= 32; a++) {
    let allSame = true;
    const ref = sessions[0][srcA].slice(a, a + 8);
    for (const s of sessions) {
      const A = s[srcA];
      if (!A || a + 8 > A.length) { allSame = false; break; }
      for (let i = 0; i < 8; i++) if (A[a + i] !== ref[i]) { allSame = false; break; }
    }
    if (allSame) {
      const match = ref.every((v, i) => v === maskTarget[i]);
      console.log(`  ${srcA}[${a}..] 跨会话恒定: ${ref.map(b => b.toString(16).padStart(2, '0')).join(' ')} ${match ? '★★★=掩码!' : ''}`);
    }
  }
}

// 测试 mask[i] = keys16[i] ^ keys16[8+i] 等自组合
console.log('\n=== keys16 自组合 ===');
const k16 = sessions[0].keys16;
for (let a = 0; a < 16; a++) {
  for (let b = 0; b < 16; b++) {
    const v = k16[a] ^ k16[b];
    if (v === maskTarget[0]) {
      console.log(`  keys16[${a}]^keys16[${b}]=0x${v.toString(16)} (=mask[0])`);
    }
  }
}
process.exit(0);

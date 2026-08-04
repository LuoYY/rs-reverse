/**
 * 728_base_vars_keys.js
 * 分析 base 会话变化段与 keys2（cd 派生 48B）的关系
 * keys2 是 cd 解密的密钥段，base 变化段可能 = f(keys2)
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

console.log('=== keys2 前 48 字节 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: ${s.keys2.join(',')}`);
}

// base 变化位置 vs keys2
console.log('\n=== base[p] vs keys2[k] XOR 常数 ===');
const maxLen = Math.max(...samples.map(s => s.base.length));
for (let p = 22; p < 56; p++) {
  const vals = samples.map(s => s.base[p]);
  if (new Set(vals).size <= 1) continue;
  for (let k = 0; k < 48; k++) {
    const xs = samples.map(s => s.base[p] ^ s.keys2[k]);
    if (new Set(xs).size === 1) {
      console.log(`base[${p}] = keys2[${k}] ^ ${xs[0]} ★★★`);
    }
  }
}

// base[p] - keys2[k] 常数
console.log('\n=== base[p] - keys2[k] 常数 ===');
for (let p = 22; p < 56; p++) {
  const vals = samples.map(s => s.base[p]);
  if (new Set(vals).size <= 1) continue;
  for (let k = 0; k < 48; k++) {
    const ds = samples.map(s => (((s.base[p] - s.keys2[k]) % 256) + 256) % 256);
    if (new Set(ds).size === 1) {
      console.log(`base[${p}] = keys2[${k}] + ${ds[0]} ★★★`);
    }
  }
}

// 检查 base 的"会话变化部分"是否由 cd 中某个特定段编码
// 打印 base[22:26] 与 cap[22:26]（明文 basearr 对应位置）
console.log('\n=== base[22:26] vs cap[22:26]（明文 basearr marker 位置） ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[22:26]=${s.base.slice(22, 26).join(',')} cap[22:26]=${s.cap.slice(22, 26).join(',')} cap[24:28]=${s.cap.slice(24, 28).join(',')}`);
}

// base 的 marker 位置 = 24+16k？
console.log('\n=== base marker 模式检查 (24+16k) ===');
for (const s of samples) {
  const mk = [24, 40, 56, 72, 88, 104, 120, 136].map(p => s.base[p]);
  console.log(`nsd=${s.nsd}: base marker=[${mk.join(',')}]`);
}

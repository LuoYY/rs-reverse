/**
 * 728_base_full_enc.js
 * 测试 base 是否 = 某种编码(basearrFull 170B 属性名列表)
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

let basearrFull = null;
try {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_fixed_dataset.json', 'utf8'));
  if (d.basearrFull) basearrFull = d.basearrFull.map(c => c);
  console.log('basearrFull:', basearrFull.length, '字节', basearrFull.slice(0, 40).map(c => String.fromCharCode(c)).join(''));
} catch (e) { console.log('fixed err:', e.message); }

if (!basearrFull) process.exit(1);

// 1. basearrFull 直接
// 2. basearrFull huffman（已有）
// 3. basearrFull 逐字节 + 常量
const s = samples[0];
console.log('\nbase[0:22]:', s.base.slice(0, 22).join(','));
console.log('base[22:56]:', s.base.slice(22, 56).join(','));
console.log('base[56:100]:', s.base.slice(56, 100).join(','));
console.log('base[100:144]:', s.base.slice(100, 144).join(','));
console.log('base[144:]:', s.base.slice(144).join(','));

// 检查 base 是否含 basearrFull 子串（明文）
const bStr = s.base.join(',');
const fStr = basearrFull.join(',');
console.log('\nbasearrFull 直接出现:', bStr.indexOf(fStr) !== -1);

// 尝试 XOR keys2
const k2 = s.keys2;
console.log('\nbase[0:48] ^ keys2:', s.base.slice(0, 48).map((v, i) => v ^ k2[i]).join(','));

// 检查 base[22:56] 固定块是否 = basearrFull 某段的编码
// 尝试：basearrFull 每 16 字节 XOR
console.log('\n=== basearrFull 分段 XOR keys2 ===');
for (let off = 0; off + 22 <= basearrFull.length; off++) {
  const seg = basearrFull.slice(off, off + 22);
  const x = seg.map((v, i) => v ^ k2[i]);
  const match = x.every((v, i) => v === s.base[i]);
  if (match) console.log(`★★ basearrFull[${off}:${off + 22}] ^ keys2 == base[0:22]`);
}

// 尝试 base[0:22] 与 basearrFull 前缀的关系（直接 XOR 常数）
console.log('\nbase[0:22] 与 basearrFull[0:22] XOR:', s.base.slice(0, 22).map((v, i) => v ^ basearrFull[i]).join(','));

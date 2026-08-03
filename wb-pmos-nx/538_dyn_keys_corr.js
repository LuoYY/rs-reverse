/**
 * 538_dyn_keys_corr.js
 * 系统分析：动态段（24-29 及 69-86）与所有 keys 的数学关系
 * 尝试：相等、XOR、加减、numarrAddTime(keys17)、AES 等
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

const data = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
console.log('会话数:', data.length);

// 1. 动态段与 keys 逐字节关系
console.log('\n=== 动态段[24-29] vs keys ===');
for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const dyn = d.basearr.slice(24, 30);
  console.log(`S${i + 1} 动态: ${dyn.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
}
// 找跨会话的 keys 差异与动态差异
if (data.length >= 2) {
  for (let bi = 0; bi < 6; bi++) {
    const dv = data.map(d => d.basearr[24 + bi]);
    console.log(`动态[${24 + bi}]: ${dv.map(v => v.toString(16).padStart(2, '0')).join(' ')}`);
  }
  // 对每个 keys[i]，尝试动态 = keys[i] 的某种变换
  console.log('\n=== 搜索 keys 关系 ===');
  const nk = Math.min(...data.map(d => d.keys.length));
  for (let ki = 0; ki < nk; ki++) {
    const lens = new Set(data.map(d => (d.keys[ki] || []).length));
    if (lens.size !== 1) continue;
    const len = [...lens][0];
    for (let kj = 0; kj < len; kj++) {
      // 动态[24+bi] == keys[ki][kj]?
      for (let bi = 0; bi < 6; bi++) {
        const match = data.every(d => d.basearr[24 + bi] === (d.keys[ki] || [])[kj]);
        if (match) console.log(`★ 动态[${24 + bi}] == keys[${ki}][${kj}]`);
      }
      // XOR keys[16] (K16)
      for (let bi = 0; bi < 6; bi++) {
        const match = data.every(d => d.basearr[24 + bi] === ((d.keys[ki] || [])[kj] ^ K16[kj % 16]));
        if (match) console.log(`★ 动态[${24 + bi}] == keys[${ki}][${kj}] ^ K16[${kj % 16}]`);
      }
      // 与 keys[2] XOR
      for (let bi = 0; bi < 6; bi++) {
        const match = data.every(d => d.basearr[24 + bi] === ((d.keys[ki] || [])[kj] ^ d.keys[2][kj % 48]));
        if (match) console.log(`★ 动态[${24 + bi}] == keys[${ki}][${kj}] ^ keys[2][${kj % 48}]`);
      }
    }
  }
}

// 2. 动态段[69-86] 分析（len243.js [10] 段对照）
console.log('\n=== 动态段[69-90] ===');
for (let i = 0; i < data.length; i++) {
  const d = data[i];
  console.log(`S${i + 1} [69-92]: ${d.basearr.slice(69, 93).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  keys19=${d.keys[19] ? d.keys[19].map(x => x.toString(16).padStart(2, '0')).join(' ') : ''} keys24=${d.keys[24] ? d.keys[24].map(x => x.toString(16).padStart(2, '0')).join(' ') : ''}`);
}

// 3. keys19 数值分析（[10] 段 keys19_4 = numToNumarr4(+ascii2string(keys[19]))）
console.log('\n=== keys19 数值 ===');
for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const k19s = d.keys[19] ? String.fromCharCode(...d.keys[19]) : '';
  const num = parseInt(k19s, 10);
  const n4 = [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255];
  console.log(`S${i + 1} keys19="${k19s}" num=${num} n4=${n4.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  // 在 basearr 里找 n4
  const b = d.basearr;
  const n4str = n4.join(',');
  for (let p = 0; p <= b.length - 4; p++) {
    if (b.slice(p, p + 4).join(',') === n4str) console.log(`  ★ n4 在 basearr[${p}]`);
  }
}

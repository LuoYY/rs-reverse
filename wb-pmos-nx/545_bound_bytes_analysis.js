/**
 * 545_bound_bytes_analysis.js
 * 离线分析绑定字节 [26-29] + [84-87] 与 keys 的关系
 * 尝试：encryptMode2(keys[i], keys16)、numarrAddTime、keys XOR 组合等
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

const data = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
console.log('会话数:', data.length);

// 绑定字节
console.log('=== 绑定字节 [26-29] [84-87] ===');
for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const b = d.basearr;
  console.log(`S${i + 1}: [26-29]=${b.slice(26, 30).map(x => x.toString(16).padStart(2, '0')).join(' ')} [84-87]=${b.slice(84, 88).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  keys19="${String.fromCharCode(...(d.keys[19] || []))}" keys24=${(d.keys[24] || [])[0]} keys17=${d.keys[17].map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
}

// 尝试关系
console.log('\n=== 尝试 [26-29] 关系 ===');
const dyn26 = data.map(d => d.basearr.slice(26, 30));
const dyn84 = data.map(d => d.basearr.slice(84, 88));
for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const k17 = d.keys[17];
  const k2 = d.keys[2];
  const k16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  // 尝试 encryptMode2(keys17, keys16)
  try {
    const e1 = encryptMode2([...k17], k16arr, 0);
    if (JSON.stringify(e1.slice(0, 4)) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == encryptMode2(keys17, keys16)[0-3]`);
  } catch (e) {}
  // 尝试 encryptMode2(keys2, keys16)
  try {
    const e2 = encryptMode2([...k2.slice(0, 16)], k16arr, 0);
    if (JSON.stringify(e2.slice(0, 4)) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == encryptMode2(keys2[0-16], keys16)[0-3]`);
  } catch (e) {}
  // numarrEncrypt(keys2)
  try {
    const ne = numarrEncrypt(k2);
    if (JSON.stringify(ne.slice(0, 4)) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == numarrEncrypt(keys2)[0-3]`);
  } catch (e) {}
  // keys2[0-3] XOR keys17[0-3]
  const x1 = k2.slice(0, 4).map((v, j) => v ^ k17[j]);
  if (JSON.stringify(x1) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == keys2[0-3]^keys17[0-3]`);
  // keys17[0-3] XOR keys17[4-7]
  const x2 = k17.slice(0, 4).map((v, j) => v ^ k17[j + 4]);
  if (JSON.stringify(x2) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == keys17[0-3]^keys17[4-7]`);
  // keys17[0-3] + keys17[4-7]
  const x3 = k17.slice(0, 4).map((v, j) => (v + k17[j + 4]) & 255);
  if (JSON.stringify(x3) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == (keys17[0-3]+keys17[4-7])&255`);
  // keys2[4-7]
  if (JSON.stringify(k2.slice(4, 8)) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == keys2[4-7]`);
  // keys2[12-15]
  if (JSON.stringify(k2.slice(12, 16)) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == keys2[12-15]`);
  // numarrAddTime(keys2)[0] 前4
  try {
    const at = numarrAddTime([...k2], 0, 1 / 256)[0];
    if (JSON.stringify(at.slice(0, 4)) === JSON.stringify(dyn26[i])) console.log(`S${i + 1} [26-29] == numarrAddTime(keys2)[0-3]`);
  } catch (e) {}
}

// [84-87] 关系
console.log('\n=== 尝试 [84-87] 关系 ===');
for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const k17 = d.keys[17];
  const k2 = d.keys[2];
  // keys19 数字
  const k19num = parseInt(String.fromCharCode(...(d.keys[19] || [])), 10);
  const n4 = [(k19num >>> 24) & 255, (k19num >>> 16) & 255, (k19num >>> 8) & 255, k19num & 255];
  if (JSON.stringify(n4) === JSON.stringify(dyn84[i])) console.log(`S${i + 1} [84-87] == keys19 n4`);
  // keys17 后 4 字节
  if (JSON.stringify(k17.slice(12, 16)) === JSON.stringify(dyn84[i])) console.log(`S${i + 1} [84-87] == keys17[12-15]`);
  if (JSON.stringify(k17.slice(8, 12)) === JSON.stringify(dyn84[i])) console.log(`S${i + 1} [84-87] == keys17[8-11]`);
  // keys2 某段
  for (let s = 0; s < 44; s++) {
    if (JSON.stringify(k2.slice(s, s + 4)) === JSON.stringify(dyn84[i])) console.log(`S${i + 1} [84-87] == keys2[${s}-${s + 3}]`);
    if (JSON.stringify(k17.slice(s, s + 4)) === JSON.stringify(dyn84[i])) console.log(`S${i + 1} [84-87] == keys17[${s}-${s + 3}]`);
  }
  // [84-87] 与 [26-29] 关系
  const d26 = dyn26[i], d84 = dyn84[i];
  const xr = d26.map((v, j) => v ^ d84[j]);
  console.log(`S${i + 1} [26-29]^[84-87] = ${xr.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
}

// 修正版：搜索 base 在 dec 中的所有嵌入位置（各种 XOR key 假设）
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = snap[0].ez.v;
const samples = require('./nx_full_samples.json');
const real = samples[0].base;

function decodeEZ(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const b = arr[i];
    if (b === 1) { i++; let v = 0, has = false; while (i < arr.length && arr[i] >= 48 && arr[i] <= 57) { v = v * 10 + (arr[i] - 48); has = true; i++; } out.push(has ? v : -1); }
    else if (b === 0) { out.push(0); i++; }
    else { out.push(b); i++; }
  }
  return out;
}
const dec = decodeEZ(ez);

// 假设1：base = dec[i:i+len] XOR key[i%8]（key 未知，但 base[0]=59）
// 搜索：对每个 dec 位置 i，尝试 key0 = 59 ^ dec[i]，然后验证后续
// 简化：假设 key 周期 8，base[0]=59=dec[i]^k0 → k0=59^dec[i]
// 更简单：base 可能 = dec 某窗口的直接拷贝（无 XOR）
console.log('=== 搜索 base 在 dec 中的直接匹配 ===');
let found = [];
for (let i = 0; i + 8 <= dec.length; i++) {
  if (dec.slice(i, i + 8).join(',') === real.slice(0, 8).join(',')) found.push(i);
}
console.log('base[0:8] 直接匹配位置:', found.length ? found : '无');

// 假设2：base 前 8 字节 = dec[i:i+8] XOR 固定 key（key=8,150,49,76,17,54,52,48 从 i=0 推出）
// 用 base[0:8] 与 dec[0:8] 的 XOR 作为 key，搜索所有位置
const k0 = real.slice(0, 8).map((v, i) => v ^ dec[i]);
let matches = [];
for (let i = 0; i + 8 <= dec.length; i++) {
  let ok = true;
  for (let j = 0; j < 8; j++) if ((dec[i + j] ^ k0[j]) !== real[j]) { ok = false; break; }
  if (ok) matches.push(i);
}
console.log('XOR key(8B) 匹配位置:', matches.length ? matches : '无');

// 假设3：key 周期 16（或 32），尝试更长的 key
// 用 base[0:16] vs dec 每个窗口推 key，验证 16B
let m16 = [];
for (let i = 0; i + 16 <= dec.length; i++) {
  const key = real.slice(0, 16).map((v, j) => v ^ dec[i + j]);
  let ok = true;
  // 验证后续 16B（如果存在）
  for (let j = 16; j < 32 && i + j < dec.length; j++) {
    if ((dec[i + j] ^ key[j % 16]) !== real[j]) { ok = false; break; }
  }
  if (ok) m16.push(i);
}
console.log('16B XOR 匹配位置:', m16.length ? m16 : '无');

// 假设4：base 是 dec 中提取的（间隔采样）？检查 base[0] 59(';') 在 dec 中的位置
console.log('\ndec 中所有 59 的位置:', dec.map((v, i) => v === 59 ? i : -1).filter(x => x >= 0).slice(0, 20));

// 打印 dec 前 40 与 base 前 40 对照
console.log('\ndec[0:40]:', dec.slice(0, 40).join(','));
console.log('base[0:40]:', real.slice(0, 40).join(','));

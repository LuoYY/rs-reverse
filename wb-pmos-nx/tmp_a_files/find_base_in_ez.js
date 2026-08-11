// 核心：base 与 _$ez 解码流的关系
// base = [59,148,7,120,19,0,0,0,...]，_$ez head = [51,2,54,52,2,54,52,48,...]
// 尝试：base 是否 = ez 某段的 XOR？或 ez 是否包含 base 的置换？
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = snap[0].ez.v;
const samples = require('./nx_full_samples.json');
const real = samples[0].base;

// ez 的 numarr 解码（还原为"字节"流）
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

// 1. 找 base 前 8 字节在 dec 中的位置（XOR 关系）
console.log('base[0:8] =', real.slice(0, 8).join(','));
console.log('dec[0:8] =', dec.slice(0, 8).join(','));
console.log('XOR(base[0:8], dec[0:8]) =', real.slice(0, 8).map((v, i) => v ^ dec[i]).join(','));

// 2. 尝试 base = dec XOR 常量串（8 字节循环）
const xorKey = real.slice(0, 8).map((v, i) => v ^ dec[i]);
console.log('\n若 base[i] = dec[i] ^ key[i%8]，则 key =', xorKey.join(','));
// 验证更多位置
let matchCount = 0;
for (let i = 0; i < Math.min(dec.length - 8, 200); i++) {
  let ok = true;
  for (let j = 0; j < 8; j++) if ((dec[i + j] ^ xorKey[j]) !== real[j]) { ok = false; break; }
  if (ok) matchCount++;
}
console.log('8 字节窗口匹配数（期待≥1）:', matchCount);

// 3. 也许 base 顺序打乱（置换）。检查 dec 中是否含 base 的全部字节（多重集）
const decCount = {};
for (const v of dec) decCount[v] = (decCount[v] || 0) + 1;
const baseCount = {};
for (const v of real) baseCount[v] = (baseCount[v] || 0) + 1;
// 比较前 50 字节的多重集
console.log('\ndec 前50 多重集 vs base 前50:');
let allIn = true;
for (const v of baseCount) {
  if ((decCount[v[0]] || 0) < v[1]) { allIn = false; break; }
}
console.log('base 全部字节在 dec 中:', allIn, '(dec len=' + dec.length + ' base len=' + real.length + ')');

// 4. 检查 base[0] = 59 是 ";" 字符，看 dec 中 ";" 后的内容
console.log('\ndec 转字符串(前300):', dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('').slice(0, 300));

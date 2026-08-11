// 关键对照：_$ez 解码串 vs base 字节
// 假设：base = 该 session 串的 huffman/编码形态？或 base 含这些资源名？
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = snap[0].ez.v;
const samples = require('./nx_full_samples.json');

// 完整解码 ez
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
const str = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
console.log('完整 str:');
console.log(str);

// 现在对比真实 base：base 是否也是这个串的一部分/编码？
// base[0]=59=';'  → base 是";"开头？查 base 全部转 ASCII
const real = samples[0].base;
const baseStr = real.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
console.log('\nbase[0] 转ASCII:', baseStr.slice(0, 80));
console.log('base[78:90] 转ASCII:', real.slice(78, 90).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// _$ez 尾部值（247,50,60000,67402,521019862） vs base 绑定段
// 检查：base[22:29]/[68:73] 是否含这些值的编码
const fs = require('fs');
const ezSnap = require('./nx_ez_full_final.json');
const ez = ezSnap[0].ez.v;
const env = require('./nx_env_samples.json');

// _$ez 尾部解码
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
const tail = dec.slice(-80);
console.log('_$ez 尾部 80 解码:', tail.join(','));
const str = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
console.log('_$ez 尾部字符:', str.slice(-80));

// 尾部值：_$fp._$hk._$ey._$kp.247.50.60000.67402.521019862
// 找 247, 50, 60000, 67402, 521019862 在 base 中的可能编码
console.log('\n=== base 绑定段 vs _$ez 尾部值 ===');
env.forEach((s, i) => {
  console.log('#' + i, '[22:29]=' + s.base.slice(22, 29).join(',') + ' [68:73]=' + s.base.slice(68, 73).join(','));
});

// 关键：67402 的字节 = 1,7,56,58? 或 0x10,0x73,0x6A?
const nsd = 67402;
const nsdB = [(nsd >> 24) & 255, (nsd >> 16) & 255, (nsd >> 8) & 255, nsd & 255];
console.log('\nnsd=67402 字节:', nsdB.join(','));
// base[22:29] 是否有 nsd 字节？无（195,0,119,209,167,28,148）
// 时间戳 521019862:
const ts = 521019862;
const tsB = [(ts >> 24) & 255, (ts >> 16) & 255, (ts >> 8) & 255, ts & 255];
console.log('时间戳字节:', tsB.join(','));

// 关键：base 绑定段可能 = f(nsd, 时间戳, keys2) 的哈希/XOR
// 用 4 个 env 样本尝试：base[22:25] = nsd XOR 常量?
env.forEach((s, i) => {
  const n = parseInt(s.nsd, 10);
  const b4 = [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const p225 = s.base.slice(22, 25);
  console.log('#' + i, 'nsd=' + s.nsd, 'b4=' + b4.join(','), '[22:25]=' + p225.join(','), 'XOR=' + p225.map((v, j) => v ^ b4[j]).join(','));
});

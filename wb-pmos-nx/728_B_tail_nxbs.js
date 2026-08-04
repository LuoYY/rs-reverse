/**
 * 728_B_tail_nxbs.js
 * 检查 base[68:] 是否是 basestr 索引编码（值域 0-85）
 * base 值域 0-255 均匀，但也许部分段是 basestr 索引
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B64 = NX_BS.slice(0, 64);

// base[68:] 值域分析
for (const s of samples.slice(0, 3)) {
  const tail = s.base.slice(68);
  const maxV = Math.max(...tail);
  const minV = Math.min(...tail);
  const gt63 = tail.filter(v => v > 63).length;
  const gt85 = tail.filter(v => v > 85).length;
  console.log(`nsd=${s.nsd}: base[68:] 值域 ${minV}-${maxV} >63=${gt63}/${tail.length} >85=${gt85}/${tail.length}`);
}

// 检查 base 中是否有 numarr2string 编码特征（相邻字节组成 b64 字符）
// numarr2string 把字节数组编码成字符串，每 3 字节 → 4 字符（每个 0-63）
// 如果是这样，base[68:] 应该全 < 64？

// base[0:22] 固定头值域
console.log('\nbase[0:22] 值域:', Math.min(...samples[0].base.slice(0, 22)), '-', Math.max(...samples[0].base.slice(0, 22)));
console.log('base[22:29] 值域:', Math.min(...samples[0].base.slice(22, 29)), '-', Math.max(...samples[0].base.slice(22, 29)));
console.log('base[29:68] 值域:', Math.min(...samples[0].base.slice(29, 68)), '-', Math.max(...samples[0].base.slice(29, 68)));
console.log('base[68:] 值域:', Math.min(...samples[0].base.slice(68)), '-', Math.max(...samples[0].base.slice(68)));

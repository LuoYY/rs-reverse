/**
 * 728_B_tail_struct.js
 * 分析 base[68:] 的内部结构：
 * 1. 是否包含长度字段（前缀模式）
 * 2. 是否 = 多个子数组的拼接
 * 3. 尾部固定段 [143-154] 是什么
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

// 观察 base[68:] 中是否有"长度前缀"模式
// numarr 数组常用 [长度][数据...] 结构
const s0 = samples[0];
const b = s0.base;
console.log('base[68:] (nsd=99418):', b.slice(68).join(','));
console.log('\nbase[68:88]:', b.slice(68, 88).join(','));
console.log('base[88:90]:', b.slice(88, 90).join(','));
console.log('base[90:110]:', b.slice(90, 110).join(','));
console.log('base[110:130]:', b.slice(110, 130).join(','));
console.log('base[130:150]:', b.slice(130, 150).join(','));
console.log('base[150:168]:', b.slice(150, 168).join(','));

// 检查 base[68:] 中是否有 0,0 分隔
console.log('\n=== base[68:] 中 0,0 位置 ===');
for (const s of samples.slice(0, 3)) {
  const tail = s.base.slice(68);
  const zeros = [];
  for (let i = 0; i < tail.length - 1; i++) {
    if (tail[i] === 0 && tail[i + 1] === 0) zeros.push(i);
  }
  console.log(`nsd=${s.nsd}: 0,0 位置: ${zeros.join(',')}`);
}

// 尾部固定段
console.log('\n=== 尾部固定段 [143:155] 跨会话 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[143:155]=${s.base.slice(143, 155).join(',')}`);
}

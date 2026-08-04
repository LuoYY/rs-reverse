/**
 * 728_B_base_ascii.js
 * 检查 base 是否含环境检测值特征（ASCII 0x39/0x38/0x3c 等）
 * 记忆: basearr 大量 0x39/0x38/0x3c/0x3b/0x2e（ASCII 9/8/</;/.）——环境检测值 ASCII 编码
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

const s0 = samples[0];
const b = s0.base;
console.log('base 全量:', b.join(','));
console.log('ASCII:', b.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// 值分布统计
console.log('\n值分布（0-127 vs 128-255）:');
const ascii = b.filter(v => v < 128).length;
console.log(`ASCII(0-127): ${ascii}/${b.length}`);
console.log('0x39/0x38/0x3c/0x3b/0x2e 计数:', b.filter(v => [0x39, 0x38, 0x3c, 0x3b, 0x2e].includes(v)).length);

// 找值 0-113 的位置（明文 basearr 值域）
console.log('\nbase 值域:', Math.min(...b), '-', Math.max(...b));
console.log('唯一值:', [...new Set(b)].sort((a, c) => a - c).join(','));

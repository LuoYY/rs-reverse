/**
 * 943_analyze_ez_source.js
 * 分析 _\$ez（45115 编码字符串）的来源
 * 关键：_\$ez 是 _$c4 第 2 参数，主调用 _\$c4(9, _\$ez, ...)
 * _\$ez 从 IIFE 的 scj/aebi 派生
 */
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

console.log('=== 输入结构 ===');
console.log('scj 类型:', typeof inputs.scj);
if (typeof inputs.scj === 'string') {
  console.log('scj len:', inputs.scj.length);
  console.log('scj 前 50:', inputs.scj.substring(0, 50));
} else if (Array.isArray(inputs.scj)) {
  console.log('scj 数组 len:', inputs.scj.length);
  console.log('scj 前 10:', inputs.scj.slice(0, 10));
} else {
  console.log('scj:', JSON.stringify(inputs.scj).substring(0, 100));
}

console.log('\n=== aebi 结构 ===');
inputs.aebi.forEach((a, i) => {
  console.log('aebi[' + i + ']: len=' + a.length + ' 前10=' + a.slice(0, 10).join(','));
});

// 检查 aebi 是否包含 45115 数据（join 后）
console.log('\n=== 找 45115 来源 ===');
// aebi 元素 join 成字符串？
inputs.aebi.forEach((a, i) => {
  const joined = a.join('');
  console.log('aebi[' + i + '] join len:', joined.length, '前 30:', joined.substring(0, 30));
});

// scj 是否为 45115
if (typeof inputs.scj === 'string') {
  console.log('\nscj 就是 _\$ez 候选: len=' + inputs.scj.length);
}

// 检查 op6 捕获的 _\$ez
const op6 = JSON.parse(fs.readFileSync('/tmp/nx_op6_state.json', 'utf8'));
console.log('\n=== op6 捕获的 _\$ez ===');
console.log('ez len:', op6.ez ? op6.ez.len : 'N/A');
console.log('ez 前 100:', op6.ez ? op6.ez.first : 'N/A');
console.log('cg:', op6.cg, 'pL:', op6.pL);
console.log('lP:', JSON.stringify(op6.lP).substring(0, 300));
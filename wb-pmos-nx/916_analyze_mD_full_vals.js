/**
 * 916_analyze_mD_full_vals.js
 * 分析 _\$mD 中段值（33-598），理解完整结构
 */
const fs = require('fs');
const all = JSON.parse(fs.readFileSync('/tmp/nx_mD_truth_all.json', 'utf8'));
const full = all.find(s => s.mD && s.mD.len === 626 && s.mD.truth);

console.log('=== _\$mD 值 33-598（中段） ===');
full.mD.vals.forEach((v, i) => {
  if (i >= 33 && i < 598 && v !== 'undef' && v !== 'null') {
    console.log('[' + i + '] ' + String(v).substring(0, 50));
  }
});

// 统计
console.log('\n=== 统计 ===');
const types = {};
full.mD.vals.forEach((v, i) => {
  let t = 'undef';
  if (v === 'null') t = 'null';
  else if (String(v).startsWith('fn:')) t = 'fn';
  else if (String(v).startsWith('obj:')) t = 'obj';
  else if (String(v).startsWith('n:')) t = 'num';
  else t = 'other';
  types[t] = (types[t] || 0) + 1;
});
console.log(types);
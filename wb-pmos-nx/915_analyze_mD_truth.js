/**
 * 915_analyze_mD_truth.js
 * 分析捕获的 _\$mD 完整 truthiness（626 长）
 * 关键：浏览器中 _\$mD 是 626 长（非 67）！
 * 捕获暂停：opcode227 断点处 _\$oU=undef（但 jc=167 非 227）
 * 但 opcode725 断点后 _\$oU=arr:196（正常）
 */
const fs = require('fs');

// 读取 truth_all
const all = JSON.parse(fs.readFileSync('/tmp/nx_mD_truth_all.json', 'utf8'));
console.log('捕获状态数:', all.length);

// 找一个 mD 完整的
const full = all.find(s => s.mD && s.mD.len === 626 && s.mD.truth);
console.log('\n=== 完整 _\$mD 状态 ===');
console.log('pause#' + full.pause + ' oU=' + full.oU + ' oU88=' + full.oU88 + ' kB=' + full.kB + ' jc=' + full.jc);
console.log('mD len:', full.mD.len);
console.log('truthiness (前 100):', full.mD.truth.slice(0, 100).join(''));
console.log('truthiness (100-200):', full.mD.truth.slice(100, 200).join(''));
console.log('truthiness (200-300):', full.mD.truth.slice(200, 300).join(''));
console.log();

// 统计 truthy 数
const truthy = full.mD.truth.filter(t => t === 1).length;
console.log('truthy 项数:', truthy, '/', full.mD.len);

// 列出所有 truthy 位置的重要性
console.log('\n=== truthy 位置（前 40） ===');
const truthyIdx = full.mD.truth.map((t, i) => t === 1 ? i : -1).filter(i => i >= 0);
console.log(truthyIdx.slice(0, 40).join(','));
console.log('...');
console.log('truthy 位置总数:', truthyIdx.length);

// 列出所有非 null/undef 的值
console.log('\n=== 非 null/undef 值 ===');
full.mD.vals.forEach((v, i) => {
  if (v !== 'undef' && v !== 'null') {
    console.log('[' + i + '] ' + String(v).substring(0, 40));
  }
});

// 保存完整 truthiness 供执行器使用
const truth = full.mD.truth;
const vals = full.mD.vals;
fs.writeFileSync('/tmp/nx_mD_truth_626.json', JSON.stringify({ truth, vals, len: 626 }));
console.log('\n已保存 /tmp/nx_mD_truth_626.json');
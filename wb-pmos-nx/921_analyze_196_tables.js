/**
 * 921_analyze_196_tables.js
 * 分析捕获的 196 字符串表（_$oU/_\$f$/_\$oP/_\$lC/_\$ll/_\$b1/_\$lc）
 * 关键：这些表是字符串索引表，opcode 用到 [88]/[176]/[96] 等
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/nx_tables_196.json', 'utf8'));

console.log('=== 196 表内容 ===');
Object.keys(d).forEach(k => {
  if (k === 'fn' || k === 'jc') return;
  const v = d[k];
  if (v && v.type === 'array') {
    console.log('\n' + k + ' (' + v.len + '):');
    // 显示关键索引
    [0, 1, 2, 4, 9, 28, 33, 65, 79, 81, 88, 96, 103, 131, 148, 153, 175, 176, 181, 186, 195].forEach(i => {
      console.log('  [' + i + '] = ' + JSON.stringify(v.val[i]));
    });
  }
});

// 保存合并表
const merged = {};
Object.keys(d).forEach(k => {
  if (k === 'fn' || k === 'jc') return;
  const v = d[k];
  if (v && v.type === 'array') merged[k] = v.val;
});
fs.writeFileSync('/tmp/nx_tables_196_merged.json', JSON.stringify(merged));
console.log('\n已保存 /tmp/nx_tables_196_merged.json 表:', Object.keys(merged).join(', '));
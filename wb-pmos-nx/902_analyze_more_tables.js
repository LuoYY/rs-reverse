/**
 * 902_analyze_more_tables.js
 * 分析捕获的更多表
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_more.json', 'utf8'));

console.log('=== 捕获的表 ===');
Object.entries(d).forEach(([name, info]) => {
  if (info.type === 'array') {
    console.log(name + ': array len=' + info.len + ' 前10=' + (info.val ? info.val.slice(0, 10).join(',') : 'big'));
  } else if (info.type === 'function') {
    console.log(name + ': fn ' + info.name);
  } else if (info.type === 'object') {
    console.log(name + ': obj keys=' + info.keys.join(','));
  } else {
    console.log(name + ': ' + info.type + ' ' + JSON.stringify(info.val));
  }
});
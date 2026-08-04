/**
 * 909_analyze_full_state.js
 * 分析捕获的完整 VM 状态
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/nx_vm_full_state.json', 'utf8'));

console.log('=== 捕获的 VM 变量 ===');
const caps = d.captures || {};
Object.entries(caps).forEach(([name, info]) => {
  if (info.type === 'array') {
    console.log(name + ': array len=' + info.len + ' 前5=' + (info.val ? info.val.slice(0, 5).join(',') : 'big'));
  } else if (info.type === 'function') {
    console.log(name + ': fn ' + info.name);
  } else if (info.type === 'object') {
    console.log(name + ': obj keys=' + info.keys.join(','));
  } else {
    console.log(name + ': ' + info.type + ' ' + JSON.stringify(info.val));
  }
});
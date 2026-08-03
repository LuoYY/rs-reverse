/** 476 定位 dump patch 语法错误 v2 */
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('/tmp/nx_dump_t4.js', 'utf8');
try {
  new vm.Script(code);
  console.log('OK');
} catch (e) {
  console.log('msg:', e.message);
  // 找 __t4.push 位置 + 检查
  const pushes = [];
  let idx = 0;
  while ((idx = code.indexOf('window.__t4.push', idx)) !== -1) {
    pushes.push(idx);
    idx += 16;
  }
  console.log('__t4.push 数量:', pushes.length);
  // 每个 push 前 30 字符
  for (const p of pushes) {
    console.log('@' + p + ':', JSON.stringify(code.substring(p - 30, p + 30)));
  }
}

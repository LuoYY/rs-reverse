/** 475 定位 dump patch 语法错误 */
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('/tmp/nx_dump_t4.js', 'utf8');
try {
  new vm.Script(code);
  console.log('OK');
} catch (e) {
  console.log('msg:', e.message);
  const m = e.stack && e.stack.match(/:\d+:\d+/);
  console.log('pos:', m ? m[0] : '');
  // 打印错误位置附近
  if (e.stack) {
    const lines = e.stack.split('\n');
    const pos = lines[1];
    console.log('stack line:', pos ? pos.substring(0, 120) : '');
  }
  // 找 __t4.push 位置
  const i = code.indexOf('window.__t4.push');
  console.log('__t4.push @', i, ':', code.substring(i - 40, i + 100));
}

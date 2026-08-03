/** 442 定位语法错误 */
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('/tmp/nx_iter_test.js', 'utf8');
try {
  new vm.Script(code);
  console.log('OK');
} catch (e) {
  console.log('msg:', e.message);
  // 找 stack 里的位置
  if (e.stack) {
    const lines = e.stack.split('\n');
    console.log('stack:', lines[1] ? lines[1].substring(0, 120) : '');
    const m = lines[1].match(/:(\d+):(\d+)/);
    if (m) {
      const line = +m[1];
      const l = code.split('\n')[line - 1];
      if (l) {
        console.log('line len:', l.length);
        // 找 true 替换痕迹
        const ti = l.indexOf('true');
        console.log('true 附近:', l.substring(Math.max(0, ti - 100), ti + 60));
      }
    }
  }
}

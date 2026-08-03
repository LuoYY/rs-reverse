/** 436 完整正则测试 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_envtrue.js', 'utf8');
console.log('code len:', code.length);

const fnRe = /function\s+([_$]\w+)\s*\(/g;
const m = fnRe.exec(code);
console.log('fnRe 首匹配:', m ? m[1] + ' @' + m.index : 'null');

// 逐个测试
console.log('test1:', /function\s+([_$]\w+)/.test(code));
console.log('test2:', /\s+\(/.test('function _$dy('));
console.log('test3:', /function\s+([_$]\w+)\s*\(/.test(code));

// indexOf 方案
let idx = 0, count = 0, names = [];
while ((idx = code.indexOf('function ', idx)) !== -1) {
  let j = idx + 9;
  if (code[j] === '_' || code[j] === '$') {
    let k = j;
    while (/[A-Za-z0-9_$]/.test(code[k] || '')) k++;
    names.push({ name: code.substring(j, k), at: idx });
    count++;
    if (count > 8) break;
  }
  idx += 9;
}
console.log('indexOf 函数数(前8):', count);
console.log(names.map(n => n.name + '@' + n.at).join(', '));
